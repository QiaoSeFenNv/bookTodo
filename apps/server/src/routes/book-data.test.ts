import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import { env } from "../config.js";
import { pool, queryWithRetry } from "../db.js";
import { createBookToken } from "../lib/book-session.js";
import { hashPassword } from "../lib/password.js";
import { dayNotesRoutes } from "./day-notes.js";
import { dayIndexRoutes } from "./days.js";
import { prefsRoutes } from "./prefs.js";
import { todoRoutes } from "./todos.js";

const runPrefix = `book-data-${Date.now()}-${process.pid}`;
const sharedDate = "2099-06-15";
const bookAOnlyDate = "2099-06-16";
const bookBOnlyDate = "2099-06-17";

function headers(token: string) {
  return {
    "x-access-key": env.APP_ACCESS_KEY,
    "x-book-token": token,
  };
}

async function buildTestServer() {
  const app = Fastify({ logger: false });
  await app.register(todoRoutes);
  await app.register(dayNotesRoutes);
  await app.register(dayIndexRoutes);
  await app.register(prefsRoutes);
  await app.ready();
  return app;
}

test("book data routes isolate todos, notes, days, and preferences", async () => {
  const app = await buildTestServer();
  const bookA = randomUUID();
  const bookB = randomUUID();
  const fixtureHash = await hashPassword("fixture-password");
  const tokenA = createBookToken(bookA).token;
  const tokenB = createBookToken(bookB).token;

  try {
    await queryWithRetry(
      `INSERT INTO books (id, name, password_hash)
       VALUES ($1, $2, $3), ($4, $5, $3)`,
      [bookA, `${runPrefix}-a`, fixtureHash, bookB, `${runPrefix}-b`],
    );

    const missingBookToken = await app.inject({
      method: "GET",
      url: `/api/todos?date=${sharedDate}`,
      headers: { "x-access-key": env.APP_ACCESS_KEY },
    });
    assert.equal(missingBookToken.statusCode, 401);
    assert.deepEqual(missingBookToken.json(), { error: "book_unauthorized" });

    const todoA = await app.inject({
      method: "POST",
      url: "/api/todos",
      headers: headers(tokenA),
      payload: { title: `${runPrefix}-todo-a`, date_key: sharedDate },
    });
    assert.equal(todoA.statusCode, 201);

    const todoB = await app.inject({
      method: "POST",
      url: "/api/todos",
      headers: headers(tokenB),
      payload: { title: `${runPrefix}-todo-b`, date_key: sharedDate },
    });
    assert.equal(todoB.statusCode, 201);

    for (const [token, date, title] of [
      [tokenA, bookAOnlyDate, `${runPrefix}-only-a`],
      [tokenB, bookBOnlyDate, `${runPrefix}-only-b`],
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/todos",
        headers: headers(token),
        payload: { title, date_key: date },
      });
      assert.equal(response.statusCode, 201);
    }

    const listA = await app.inject({
      method: "GET",
      url: `/api/todos?date=${sharedDate}`,
      headers: headers(tokenA),
    });
    const listB = await app.inject({
      method: "GET",
      url: `/api/todos?date=${sharedDate}`,
      headers: headers(tokenB),
    });
    assert.deepEqual(listA.json().items.map((item: { title: string }) => item.title), [
      `${runPrefix}-todo-a`,
    ]);
    assert.deepEqual(listB.json().items.map((item: { title: string }) => item.title), [
      `${runPrefix}-todo-b`,
    ]);

    const todoAId = todoA.json().id as string;
    const crossPatch = await app.inject({
      method: "PATCH",
      url: `/api/todos/${todoAId}`,
      headers: headers(tokenB),
      payload: { title: "cross-book-write" },
    });
    assert.equal(crossPatch.statusCode, 404);
    const crossDelete = await app.inject({
      method: "DELETE",
      url: `/api/todos/${todoAId}`,
      headers: headers(tokenB),
    });
    assert.equal(crossDelete.statusCode, 404);

    for (const [token, summary] of [
      [tokenA, `${runPrefix}-summary-a`],
      [tokenB, `${runPrefix}-summary-b`],
    ]) {
      const response = await app.inject({
        method: "PUT",
        url: "/api/day-notes",
        headers: headers(token),
        payload: { date: sharedDate, summary },
      });
      assert.equal(response.statusCode, 200);
    }

    const notesA = await app.inject({
      method: "GET",
      url: `/api/day-notes?date=${sharedDate}`,
      headers: headers(tokenA),
    });
    const notesB = await app.inject({
      method: "GET",
      url: `/api/day-notes?date=${sharedDate}`,
      headers: headers(tokenB),
    });
    assert.equal(notesA.json().summary, `${runPrefix}-summary-a`);
    assert.equal(notesB.json().summary, `${runPrefix}-summary-b`);

    const daysA = await app.inject({
      method: "GET",
      url: "/api/days",
      headers: headers(tokenA),
    });
    const daysB = await app.inject({
      method: "GET",
      url: "/api/days",
      headers: headers(tokenB),
    });
    assert.deepEqual(daysA.json().dates, [sharedDate, bookAOnlyDate]);
    assert.deepEqual(daysB.json().dates, [sharedDate, bookBOnlyDate]);

    const prefsA = await app.inject({
      method: "PATCH",
      url: "/api/prefs",
      headers: headers(tokenA),
      payload: { template_mode: "B" },
    });
    assert.equal(prefsA.statusCode, 200);
    assert.equal(prefsA.json().templateMode, "B");

    const prefsB = await app.inject({
      method: "GET",
      url: "/api/prefs",
      headers: headers(tokenB),
    });
    assert.equal(prefsB.statusCode, 200);
    assert.equal(prefsB.json().templateMode, "A");

    const ownerStillHasTodo = await app.inject({
      method: "GET",
      url: `/api/todos?date=${sharedDate}`,
      headers: headers(tokenA),
    });
    assert.equal(ownerStillHasTodo.json().items[0].id, todoAId);
  } finally {
    await queryWithRetry("DELETE FROM books WHERE id = ANY($1::uuid[])", [[bookA, bookB]]);
    await app.close();
    await pool.end();
  }
});
