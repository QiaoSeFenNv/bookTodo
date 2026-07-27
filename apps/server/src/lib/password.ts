import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const VERSION = "v1";
const COST = 65_536;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 32;
const MAX_STORED_LENGTH = 1_024;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function decodeBase64Url(value: string): Buffer | null {
  if (!BASE64URL.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) return null;
  return decoded;
}

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_BYTES, {
      N: COST,
      r: BLOCK_SIZE,
      p: PARALLELIZATION,
      maxmem: 128 * 1024 * 1024,
    }, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return [
    "scrypt",
    VERSION,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (stored.length > MAX_STORED_LENGTH) return false;
    const parts = stored.split("$");
    if (parts.length !== 7) return false;

    const [algorithm, version, cost, blockSize, parallelization, saltValue, keyValue] =
      parts;
    if (
      algorithm !== "scrypt" ||
      version !== VERSION ||
      cost !== String(COST) ||
      blockSize !== String(BLOCK_SIZE) ||
      parallelization !== String(PARALLELIZATION)
    ) {
      return false;
    }

    const salt = decodeBase64Url(saltValue);
    const storedKey = decodeBase64Url(keyValue);
    if (salt?.length !== SALT_BYTES || storedKey?.length !== KEY_BYTES) return false;

    const candidateKey = await derive(password, salt);
    return timingSafeEqual(candidateKey, storedKey);
  } catch {
    return false;
  }
}
