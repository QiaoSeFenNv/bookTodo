import type { FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqual } from "node:crypto";
import { env } from "../config.js";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function getAccessKey(request: FastifyRequest): string | undefined {
  const header = request.headers["x-access-key"];
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }

  const auth = request.headers.authorization;
  if (typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token) return token;
  }

  return undefined;
}

export function isValidAccessKey(candidate: string | undefined): boolean {
  if (!candidate) return false;
  return safeEqual(candidate, env.APP_ACCESS_KEY);
}

export async function requireAccessKey(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const key = getAccessKey(request);
  if (!isValidAccessKey(key)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
}
