import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyBookToken } from "../lib/book-session.js";
import { requireAccessKey } from "./access-key.js";

declare module "fastify" {
  interface FastifyRequest {
    bookId: string;
  }
}

export async function requireBookAccess(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await requireAccessKey(request, reply);
  if (reply.sent) return;

  const token = request.headers["x-book-token"];
  const payload = typeof token === "string" ? verifyBookToken(token) : null;
  if (!payload) {
    return reply.code(401).send({ error: "book_unauthorized" });
  }

  request.bookId = payload.bookId;
}
