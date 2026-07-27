import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000;
const MAX_TOKEN_LENGTH = 4_096;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

type SigningSecret = string | Buffer;

export const bookTokenSigningKey = randomBytes(32);

export type BookTokenPayload = {
  bookId: string;
  issuedAt: number;
  expiresAt: number;
};

export type BookSessionToken = {
  token: string;
  expiresAt: string;
};

function sign(payload: string, secret: SigningSecret): Buffer {
  return createHmac("sha256", secret).update(payload, "ascii").digest();
}

function isPayload(value: unknown): value is BookTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<BookTokenPayload>;
  return (
    typeof payload.bookId === "string" &&
    UUID.test(payload.bookId) &&
    Number.isSafeInteger(payload.issuedAt) &&
    Number.isSafeInteger(payload.expiresAt) &&
    payload.issuedAt! >= 0 &&
    payload.expiresAt! - payload.issuedAt! === TOKEN_LIFETIME_MS
  );
}

function readClock(now: Date): number | null {
  try {
    const timestamp = now.getTime();
    return Number.isSafeInteger(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

export function createBookToken(
  bookId: string,
  secret: SigningSecret = bookTokenSigningKey,
  now = new Date(),
): BookSessionToken {
  if (!UUID.test(bookId)) throw new Error("bookId must be a valid UUID");

  const issuedAt = readClock(now);
  const expiresAt = issuedAt === null ? Number.NaN : issuedAt + TOKEN_LIFETIME_MS;
  if (
    issuedAt === null ||
    issuedAt < 0 ||
    !Number.isSafeInteger(expiresAt) ||
    new Date(expiresAt).getTime() !== expiresAt
  ) {
    throw new Error("now must be a valid clock");
  }

  const payload: BookTokenPayload = {
    bookId,
    issuedAt,
    expiresAt,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(encodedPayload, secret).toString("base64url");
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

export function verifyBookToken(
  token: string,
  secret: SigningSecret = bookTokenSigningKey,
  now = new Date(),
): BookTokenPayload | null {
  try {
    if (token.length > MAX_TOKEN_LENGTH) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [encodedPayload, encodedSignature] = parts;
    if (!BASE64URL.test(encodedPayload) || !BASE64URL.test(encodedSignature)) return null;

    const suppliedSignature = Buffer.from(encodedSignature, "base64url");
    if (suppliedSignature.toString("base64url") !== encodedSignature) return null;
    const expectedSignature = sign(encodedPayload, secret);
    if (
      suppliedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(suppliedSignature, expectedSignature)
    ) {
      return null;
    }

    const payloadBuffer = Buffer.from(encodedPayload, "base64url");
    if (payloadBuffer.toString("base64url") !== encodedPayload) return null;
    const payload: unknown = JSON.parse(payloadBuffer.toString("utf8"));
    if (!isPayload(payload)) return null;

    const timestamp = readClock(now);
    if (timestamp === null) return null;
    if (timestamp < payload.issuedAt || timestamp >= payload.expiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}
