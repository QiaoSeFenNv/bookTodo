import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";
import { env } from "../config.js";
import { pool, queryWithRetry } from "../db.js";
import { createBookToken, verifyBookToken } from "../lib/book-session.js";
import { hashPassword } from "../lib/password.js";
import { requireBookAccess } from "../middleware/book-access.js";
import { authRoutes } from "./auth.js";
import { booksRoutes } from "./books.js";

const HOUR_MS = 60 * 60 * 1000;
const runPrefix = `task3-${Date.now()}-${process.pid}-`;

async function buildTestServer() {
  const app = Fastify({ logger: false });
  await app.register(rateLimit, {
    global: false,
  });
  await app.register(authRoutes);
  await app.register(booksRoutes);
  app.get("/api/test/unlimited", async () => ({ ok: true }));
  app.get(
    "/api/test/book-context",
    { preHandler: requireBookAccess },
    async (request) => ({ bookId: request.bookId }),
  );
  await app.ready();
  return app;
}

test("site and book authentication API", async (t) => {
  const app = await buildTestServer();
  const fixtureIds = Array.from({ length: 26 }, () => randomUUID());
  const fixtureHash = await hashPassword("fixture-password");
  const fixtureCreatedAt = new Date("9999-01-01T00:00:00.000Z");

  try {
    const countBefore = await queryWithRetry<{ total: number }>(
      "SELECT COUNT(*)::int AS total FROM books",
    );
    const initialTotal = countBefore.rows[0].total;

    await Promise.all(
      fixtureIds.map((id, index) =>
        queryWithRetry(
          `INSERT INTO books (id, name, password_hash, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $4)`,
          [id, `${runPrefix}page-${index}`, fixtureHash, fixtureCreatedAt],
        ),
      ),
    );

    await t.test(
      "password attempts stay rate-limited without throttling ordinary routes",
      async () => {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const response = await app.inject({
            method: "POST",
            url: "/api/auth/verify",
            payload: { accessKey: `wrong-key-${attempt}` },
          });
          assert.equal(response.statusCode, 401);
          assert.deepEqual(response.json(), { error: "unauthorized" });
        }

        const rateLimited = await app.inject({
          method: "POST",
          url: "/api/auth/verify",
          payload: { accessKey: "wrong-key-rate-limited" },
        });
        assert.equal(rateLimited.statusCode, 429);

        for (let request = 0; request < 61; request += 1) {
          const response = await app.inject({
            method: "GET",
            url: "/api/test/unlimited",
          });
          assert.equal(response.statusCode, 200);
        }
      },
    );

    await t.test("bookshelf routes require the outer access key", async () => {
      const missing = await app.inject({ method: "GET", url: "/api/books" });
      assert.equal(missing.statusCode, 401);
      assert.deepEqual(missing.json(), { error: "unauthorized" });

      const wrong = await app.inject({
        method: "POST",
        url: "/api/books",
        headers: { "x-access-key": "wrong-key" },
        payload: { name: `${runPrefix}blocked`, password: "valid-password" },
      });
      assert.equal(wrong.statusCode, 401);
      assert.deepEqual(wrong.json(), { error: "unauthorized" });
    });

    await t.test("book pagination validates, defaults, caps, and stays stable", async () => {
      for (const url of [
        "/api/books?page=0",
        "/api/books?page=1.5",
        "/api/books?page=not-a-number",
        "/api/books?pageSize=0",
      ]) {
        const invalid = await app.inject({
          method: "GET",
          url,
          headers: { "x-access-key": env.APP_ACCESS_KEY },
        });
        assert.equal(invalid.statusCode, 400, url);
        assert.deepEqual(invalid.json(), { error: "invalid_query" }, url);
      }

      const defaultPage = await app.inject({
        method: "GET",
        url: "/api/books",
        headers: { "x-access-key": env.APP_ACCESS_KEY },
      });
      assert.equal(defaultPage.statusCode, 200);
      const defaultBody = defaultPage.json();
      assert.equal(defaultBody.page, 1);
      assert.equal(defaultBody.pageSize, 12);
      assert.equal(defaultBody.totalItems, initialTotal + fixtureIds.length);
      assert.equal(defaultBody.totalPages, Math.ceil(defaultBody.totalItems / 12));
      assert.equal(defaultBody.items.length, 12);
      assert.deepEqual(
        Object.keys(defaultBody.items[0]).sort(),
        ["createdAt", "id", "name"],
      );
      assert.doesNotMatch(defaultPage.body, /password_hash|passwordHash|scrypt/i);

      const cappedPage = await app.inject({
        method: "GET",
        url: "/api/books?pageSize=999",
        headers: { "x-access-key": env.APP_ACCESS_KEY },
      });
      assert.equal(cappedPage.statusCode, 200);
      const cappedBody = cappedPage.json();
      assert.equal(cappedBody.pageSize, 24);
      assert.equal(cappedBody.items.length, 24);
      assert.equal(cappedBody.totalItems, initialTotal + fixtureIds.length);
      assert.equal(cappedBody.totalPages, Math.ceil(cappedBody.totalItems / 24));

      const expectedOrder = [...fixtureIds].sort((left, right) =>
        left < right ? 1 : left > right ? -1 : 0,
      );
      assert.deepEqual(
        cappedBody.items.map((book: { id: string }) => book.id),
        expectedOrder.slice(0, 24),
      );

      const repeatedPage = await app.inject({
        method: "GET",
        url: "/api/books?pageSize=999",
        headers: { "x-access-key": env.APP_ACCESS_KEY },
      });
      assert.deepEqual(repeatedPage.json().items, cappedBody.items);

      const overflow = await app.inject({
        method: "GET",
        url: "/api/books?page=100000&pageSize=24",
        headers: { "x-access-key": env.APP_ACCESS_KEY },
      });
      assert.equal(overflow.statusCode, 200);
      assert.deepEqual(overflow.json(), {
        items: [],
        page: 100000,
        pageSize: 24,
        totalItems: initialTotal + fixtureIds.length,
        totalPages: Math.ceil((initialTotal + fixtureIds.length) / 24),
      });
    });

    await t.test("book creation validates bounds and hides password hashes", async () => {
      const invalidBodies = [
        { name: " ", password: "valid-password" },
        { name: `${runPrefix}${"n".repeat(81)}`, password: "valid-password" },
        { name: `${runPrefix}short-password`, password: "1234567" },
        { name: `${runPrefix}long-password`, password: "p".repeat(129) },
      ];
      for (const payload of invalidBodies) {
        const invalid = await app.inject({
          method: "POST",
          url: "/api/books",
          headers: { "x-access-key": env.APP_ACCESS_KEY },
          payload,
        });
        assert.equal(invalid.statusCode, 400);
        assert.deepEqual(invalid.json(), { error: "invalid_request" });
      }

      const maxName = `${runPrefix}${"n".repeat(80 - runPrefix.length)}`;
      const boundary = await app.inject({
        method: "POST",
        url: "/api/books",
        headers: { "x-access-key": env.APP_ACCESS_KEY },
        payload: { name: maxName, password: "12345678" },
      });
      assert.equal(boundary.statusCode, 201);
      assert.equal(boundary.json().name, maxName);

      const bookName = `${runPrefix}created`;
      const created = await app.inject({
        method: "POST",
        url: "/api/books",
        headers: { "x-access-key": env.APP_ACCESS_KEY },
        payload: { name: `  ${bookName}  `, password: "p".repeat(128) },
      });
      assert.equal(created.statusCode, 201);
      const createdBook = created.json();
      assert.equal(createdBook.name, bookName);
      assert.equal(typeof createdBook.id, "string");
      assert.equal(typeof createdBook.createdAt, "string");
      assert.deepEqual(Object.keys(createdBook).sort(), ["createdAt", "id", "name"]);
      assert.doesNotMatch(created.body, /password_hash|passwordHash|scrypt/i);

      const stored = await queryWithRetry<{ password_hash: string }>(
        "SELECT password_hash FROM books WHERE id = $1",
        [createdBook.id],
      );
      assert.equal(stored.rowCount, 1);
      assert.notEqual(stored.rows[0].password_hash, "p".repeat(128));
      assert.match(stored.rows[0].password_hash, /^scrypt\$v1\$/);

      const duplicate = await app.inject({
        method: "POST",
        url: "/api/books",
        headers: { "x-access-key": env.APP_ACCESS_KEY },
        payload: { name: ` ${bookName.toUpperCase()} `, password: "another-password" },
      });
      assert.equal(duplicate.statusCode, 409);
      assert.deepEqual(duplicate.json(), { error: "conflict" });

      const maxPasswordName = `${runPrefix}max-password`;
      const maxPassword = await app.inject({
        method: "POST",
        url: "/api/books",
        headers: { "x-access-key": env.APP_ACCESS_KEY },
        payload: { name: maxPasswordName, password: "q".repeat(128) },
      });
      assert.equal(maxPassword.statusCode, 201);

      t.mock.method(Date, "now", Date.now);
      const invalidBookId = await app.inject({
        method: "POST",
        url: "/api/books/not-a-uuid/unlock",
        headers: { "x-access-key": env.APP_ACCESS_KEY },
        payload: { password: "anything" },
      });
      assert.equal(invalidBookId.statusCode, 400);
      assert.deepEqual(invalidBookId.json(), { error: "invalid_id" });

      const invalidPassword = await app.inject({
        method: "POST",
        url: `/api/books/${createdBook.id}/unlock`,
        headers: { "x-access-key": env.APP_ACCESS_KEY },
        payload: { password: "" },
      });
      assert.equal(invalidPassword.statusCode, 400);
      assert.deepEqual(invalidPassword.json(), { error: "invalid_request" });

      const missingBookId = randomUUID();
      const missingBook = await app.inject({
        method: "POST",
        url: `/api/books/${missingBookId}/unlock`,
        headers: { "x-access-key": env.APP_ACCESS_KEY },
        payload: { password: "anything" },
      });
      assert.equal(missingBook.statusCode, 404);
      assert.deepEqual(missingBook.json(), { error: "not_found" });

      const wrongPassword = await app.inject({
        method: "POST",
        url: `/api/books/${createdBook.id}/unlock`,
        headers: { "x-access-key": env.APP_ACCESS_KEY },
        payload: { password: "wrong-password" },
      });
      assert.equal(wrongPassword.statusCode, 401);
      assert.deepEqual(wrongPassword.json(), { error: "book_unauthorized" });

      const beforeUnlock = Date.now();
      const unlocked = await app.inject({
        method: "POST",
        url: `/api/books/${createdBook.id}/unlock`,
        headers: { "x-access-key": env.APP_ACCESS_KEY },
        payload: { password: "p".repeat(128) },
      });
      const afterUnlock = Date.now();
      assert.equal(unlocked.statusCode, 200);
      const unlockBody = unlocked.json();
      assert.deepEqual(unlockBody.book, createdBook);
      assert.equal(typeof unlockBody.token, "string");
      assert.equal(typeof unlockBody.expiresAt, "string");
      assert.doesNotMatch(unlocked.body, /password_hash|passwordHash|scrypt/i);
      const expiry = Date.parse(unlockBody.expiresAt);
      assert.ok(expiry >= beforeUnlock + 12 * HOUR_MS);
      assert.ok(expiry <= afterUnlock + 12 * HOUR_MS);
      assert.equal(verifyBookToken(unlockBody.token)?.bookId, createdBook.id);
      assert.equal(verifyBookToken(unlockBody.token, env.APP_ACCESS_KEY), null);

      const validContext = await app.inject({
        method: "GET",
        url: "/api/test/book-context",
        headers: {
          "x-access-key": env.APP_ACCESS_KEY,
          "x-book-token": unlockBody.token,
        },
      });
      assert.equal(validContext.statusCode, 200);
      assert.deepEqual(validContext.json(), { bookId: createdBook.id });

      const missingOuter = await app.inject({
        method: "GET",
        url: "/api/test/book-context",
        headers: { "x-book-token": unlockBody.token },
      });
      assert.equal(missingOuter.statusCode, 401);
      assert.deepEqual(missingOuter.json(), { error: "unauthorized" });

      for (const token of [
        undefined,
        `${unlockBody.token}x`,
        createBookToken(
          createdBook.id,
          undefined,
          new Date(Date.now() - 12 * HOUR_MS - 1),
        ).token,
      ]) {
        const invalidContext = await app.inject({
          method: "GET",
          url: "/api/test/book-context",
          headers: {
            "x-access-key": env.APP_ACCESS_KEY,
            ...(token ? { "x-book-token": token } : {}),
          },
        });
        assert.equal(invalidContext.statusCode, 401);
        assert.deepEqual(invalidContext.json(), { error: "book_unauthorized" });
      }
    });

    await t.test("book update and delete require the current book password", async () => {
      const managedName = `${runPrefix}managed`;
      const created = await app.inject({
        method: "POST",
        url: "/api/books",
        headers: { "x-access-key": env.APP_ACCESS_KEY },
        payload: { name: managedName, password: "old-password" },
      });
      assert.equal(created.statusCode, 201);
      const managed = created.json();

      for (const [method, payload] of [
        ["PATCH", { name: "x" }],
        ["PATCH", { currentPassword: "old-password" }],
        ["PATCH", { name: "n".repeat(81), currentPassword: "old-password" }],
        ["PATCH", { newPassword: "short", currentPassword: "old-password" }],
        ["DELETE", {}],
      ] as const) {
        const invalid = await app.inject({
          method,
          url: `/api/books/${managed.id}`,
          headers: { "x-access-key": env.APP_ACCESS_KEY },
          payload,
        });
        assert.equal(invalid.statusCode, 400, `${method} ${JSON.stringify(payload)}`);
        assert.deepEqual(invalid.json(), { error: "invalid_request" });
      }

      for (const method of ["PATCH", "DELETE"] as const) {
        const missingBook = await app.inject({
          method,
          url: `/api/books/${randomUUID()}`,
          headers: { "x-access-key": env.APP_ACCESS_KEY },
          payload:
            method === "PATCH"
              ? { name: "anything", currentPassword: "old-password" }
              : { password: "old-password" },
        });
        assert.equal(missingBook.statusCode, 404, method);
        assert.deepEqual(missingBook.json(), { error: "not_found" });

        const wrongPassword = await app.inject({
          method,
          url: `/api/books/${managed.id}`,
          headers: { "x-access-key": env.APP_ACCESS_KEY },
          payload:
            method === "PATCH"
              ? { name: `${runPrefix}renamed-x`, currentPassword: "wrong-password" }
              : { password: "wrong-password" },
        });
        assert.equal(wrongPassword.statusCode, 401, method);
        assert.deepEqual(wrongPassword.json(), { error: "book_unauthorized" });
      }

      const renamed = await app.inject({
        method: "PATCH",
        url: `/api/books/${managed.id}`,
        headers: { "x-access-key": env.APP_ACCESS_KEY },
        payload: { name: ` ${managedName.toUpperCase()}-2 `, currentPassword: "old-password" },
      });
      assert.equal(renamed.statusCode, 200);
      assert.equal(renamed.json().name, `${managedName.toUpperCase()}-2`);
      assert.deepEqual(Object.keys(renamed.json()).sort(), ["createdAt", "id", "name"]);
      assert.doesNotMatch(renamed.body, /password_hash|passwordHash|scrypt/i);

      const nameConflict = await app.inject({
        method: "PATCH",
        url: `/api/books/${managed.id}`,
        headers: { "x-access-key": env.APP_ACCESS_KEY },
        payload: { name: `${runPrefix}page-0`, currentPassword: "old-password" },
      });
      assert.equal(nameConflict.statusCode, 409);
      assert.deepEqual(nameConflict.json(), { error: "conflict" });

      const passwordChanged = await app.inject({
        method: "PATCH",
        url: `/api/books/${managed.id}`,
        headers: { "x-access-key": env.APP_ACCESS_KEY },
        payload: { currentPassword: "old-password", newPassword: "new-password-1" },
      });
      assert.equal(passwordChanged.statusCode, 200);

      const stored = await queryWithRetry<{ password_hash: string }>(
        "SELECT password_hash FROM books WHERE id = $1",
        [managed.id],
      );
      const { verifyPassword } = await import("../lib/password.js");
      assert.equal(await verifyPassword("new-password-1", stored.rows[0].password_hash), true);
      assert.equal(await verifyPassword("old-password", stored.rows[0].password_hash), false);

      await queryWithRetry(
        `INSERT INTO todos (id, book_id, title) VALUES ($1, $2, $3)`,
        [randomUUID(), managed.id, `${runPrefix}cascade-todo`],
      );
      const deleted = await app.inject({
        method: "DELETE",
        url: `/api/books/${managed.id}`,
        headers: { "x-access-key": env.APP_ACCESS_KEY },
        payload: { password: "new-password-1" },
      });
      assert.equal(deleted.statusCode, 204);
      assert.equal(deleted.body, "");

      const orphanBook = await queryWithRetry<{ total: number }>(
        "SELECT COUNT(*)::int AS total FROM books WHERE id = $1",
        [managed.id],
      );
      assert.equal(orphanBook.rows[0].total, 0);

      const missingOuterKey = await app.inject({
        method: "DELETE",
        url: `/api/books/${managed.id}`,
        payload: { password: "new-password-1" },
      });
      assert.equal(missingOuterKey.statusCode, 401);
      assert.deepEqual(missingOuterKey.json(), { error: "unauthorized" });

      const orphanTodos = await queryWithRetry<{ total: number }>(
        "SELECT COUNT(*)::int AS total FROM todos WHERE book_id = $1",
        [managed.id],
      );
      assert.equal(orphanTodos.rows[0].total, 0);
    });

  } finally {
    await queryWithRetry("DELETE FROM books WHERE name LIKE $1", [`${runPrefix}%`]);
    await app.close();
    await pool.end();
  }
});
