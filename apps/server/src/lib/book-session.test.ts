import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";
import {
  bookTokenSigningKey,
  createBookToken,
  verifyBookToken,
} from "./book-session.js";

const bookId = "87ed15b4-629d-47e8-bde6-3e752f10aff7";
const secret = "outer-site-secret";
const issuedAt = new Date("2026-07-27T02:00:00.000Z");

function signPayload(payload: string, signingSecret: string | Buffer = secret): string {
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  const signature = createHmac("sha256", signingSecret)
    .update(encodedPayload, "ascii")
    .digest("base64url");
  return `${encodedPayload}.${signature}`;
}

test("the default signing key is random process-local 256-bit key material", () => {
  assert.equal(Buffer.isBuffer(bookTokenSigningKey), true);
  assert.equal(bookTokenSigningKey.length, 32);
  assert.notDeepEqual(
    bookTokenSigningKey,
    createHash("sha256").update("outer-site-secret").digest(),
  );

  const { token } = createBookToken(bookId);
  assert.equal(verifyBookToken(token)?.bookId, bookId);
});

test("createBookToken issues a verifiable token valid for exactly 12 hours", () => {
  const session = createBookToken(bookId, secret, issuedAt);

  assert.equal(session.expiresAt, "2026-07-27T14:00:00.000Z");
  assert.deepEqual(verifyBookToken(session.token, secret, issuedAt), {
    bookId,
    issuedAt: issuedAt.getTime(),
    expiresAt: issuedAt.getTime() + 12 * 60 * 60 * 1000,
  });
  assert.equal(
    verifyBookToken(session.token, secret, new Date("2026-07-27T14:00:00.000Z")),
    null,
  );
});

test("verifyBookToken rejects a tampered payload or signature", () => {
  const { token } = createBookToken(bookId, secret, issuedAt);
  const [payload, signature] = token.split(".");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  decoded.bookId = "dfe75f61-1a05-4690-895d-19139ee76ee7";
  const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString("base64url");

  assert.equal(verifyBookToken(`${tamperedPayload}.${signature}`, secret, issuedAt), null);
  assert.equal(
    verifyBookToken(`${payload}.${signature.slice(0, -1)}x`, secret, issuedAt),
    null,
  );
});

test("verifyBookToken rejects a token signed with another secret", () => {
  const { token } = createBookToken(bookId, secret, issuedAt);

  assert.equal(verifyBookToken(token, "different-secret", issuedAt), null);
});

test("verifyBookToken rejects malformed tokens and invalid payloads", () => {
  const malformed = [
    "",
    "one-part",
    "too.many.parts",
    "***.***",
    `${Buffer.from("not-json").toString("base64url")}.signature`,
  ];

  for (const token of malformed) {
    assert.equal(verifyBookToken(token, secret, issuedAt), null, token);
  }

  assert.throws(
    () => createBookToken("not-a-uuid", secret, issuedAt),
    /valid UUID/,
  );
});

test("verifyBookToken authenticates before defensively validating payload fields", () => {
  const validPayload = {
    bookId,
    issuedAt: issuedAt.getTime(),
    expiresAt: issuedAt.getTime() + 12 * 60 * 60 * 1000,
  };
  const validToken = signPayload(JSON.stringify(validPayload));
  assert.deepEqual(verifyBookToken(validToken, secret, issuedAt), validPayload);

  const authenticatedInvalidPayloads = [
    "not-json",
    JSON.stringify({ ...validPayload, bookId: "not-a-uuid" }),
    JSON.stringify({ ...validPayload, issuedAt: "1753581600000" }),
    JSON.stringify({ ...validPayload, expiresAt: validPayload.expiresAt + 1 }),
  ];
  for (const payload of authenticatedInvalidPayloads) {
    assert.equal(verifyBookToken(signPayload(payload), secret, issuedAt), null, payload);
  }
});

test("book tokens reject future issuance and invalid injected clocks", () => {
  const { token } = createBookToken(bookId, secret, issuedAt);

  assert.equal(
    verifyBookToken(token, secret, new Date(issuedAt.getTime() - 1)),
    null,
  );
  assert.equal(verifyBookToken(token, secret, new Date(Number.NaN)), null);
  assert.equal(
    verifyBookToken(
      token,
      secret,
      { getTime: () => Number.MAX_SAFE_INTEGER + 1 } as Date,
    ),
    null,
  );
  assert.throws(
    () => createBookToken(bookId, secret, new Date(Number.NaN)),
    /valid clock/,
  );
  assert.throws(
    () =>
      createBookToken(
        bookId,
        secret,
        { getTime: () => Number.MAX_SAFE_INTEGER + 1 } as Date,
      ),
    /valid clock/,
  );
  assert.throws(
    () => createBookToken(bookId, secret, new Date(-1)),
    /valid clock/,
  );
});

test("verifyBookToken rejects oversized encoded input", () => {
  assert.equal(verifyBookToken("a".repeat(5_000), secret, issuedAt), null);
});
