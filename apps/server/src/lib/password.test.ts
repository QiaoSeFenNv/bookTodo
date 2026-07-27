import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "./password.js";

test("hashPassword stores a verifiable scrypt hash", async () => {
  const stored = await hashPassword("correct horse battery staple");

  const [algorithm, version, cost, blockSize, parallelization] = stored.split("$");
  assert.deepEqual(
    { algorithm, version, cost, blockSize, parallelization },
    {
      algorithm: "scrypt",
      version: "v1",
      cost: "65536",
      blockSize: "8",
      parallelization: "1",
    },
  );
  assert.equal(await verifyPassword("correct horse battery staple", stored), true);
});

test("verifyPassword rejects a wrong password", async () => {
  const stored = await hashPassword("right-password");

  assert.equal(await verifyPassword("wrong-password", stored), false);
});

test("hashPassword uses a distinct random salt for every hash", async () => {
  const [first, second] = await Promise.all([
    hashPassword("same-password"),
    hashPassword("same-password"),
  ]);

  assert.notEqual(first, second);
  assert.equal(await verifyPassword("same-password", first), true);
  assert.equal(await verifyPassword("same-password", second), true);
});

test("verifyPassword rejects malformed stored values without throwing", async () => {
  const salt = Buffer.alloc(16, 1).toString("base64url");
  const key = Buffer.alloc(32, 2).toString("base64url");
  const shortSalt = Buffer.alloc(15, 1).toString("base64url");
  const shortKey = Buffer.alloc(31, 2).toString("base64url");
  const malformed = [
    "",
    "plain-text-password",
    `scrypt$v2$65536$8$1$${salt}$${key}`,
    "scrypt$v1$bad$8$1$c2FsdA$aGFzaA",
    `scrypt$v1$65536$8$1$***$${key}`,
    `scrypt$v1$65536$8$1$${salt}$***`,
    `scrypt$v1$65536$8$1$${shortSalt}$${key}`,
    `scrypt$v1$65536$8$1$${salt}$${shortKey}`,
    `scrypt$v1$65536$8$1$c2FsdA$${"a".repeat(2_000)}`,
  ];

  for (const stored of malformed) {
    assert.equal(await verifyPassword("password", stored), false, stored);
  }
});
