import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { queryWithRetry, type BookRow } from "../db.js";
import { createBookToken } from "../lib/book-session.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { requireAccessKey } from "../middleware/access-key.js";

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().safe().default(1),
  pageSize: z.coerce
    .number()
    .int()
    .positive()
    .safe()
    .default(12)
    .transform((value) => Math.min(value, 24)),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(128),
});

const unlockParamsSchema = z.object({
  id: z.string().uuid(),
});

const unlockSchema = z.object({
  password: z.string().min(1).max(256),
});

type PublicBookRow = Pick<BookRow, "id" | "name" | "created_at">;

function mapBook(row: PublicBookRow) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function booksRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAccessKey);

  app.get("/api/books", async (request, reply) => {
    const parsed = listQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_query" });
    }

    const { page, pageSize } = parsed.data;
    const offset = (page - 1) * pageSize;
    const [countResult, booksResult] = await Promise.all([
      queryWithRetry<{ total: string }>("SELECT COUNT(*)::text AS total FROM books"),
      queryWithRetry<PublicBookRow>(
        `SELECT id, name, created_at
         FROM books
         ORDER BY created_at DESC, id DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset],
      ),
    ]);
    const totalItems = Number(countResult.rows[0].total);

    return {
      items: booksResult.rows.map(mapBook),
      page,
      pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize),
    };
  });

  app.post("/api/books", async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const id = randomUUID();
    const passwordHash = await hashPassword(parsed.data.password);
    try {
      const result = await queryWithRetry<PublicBookRow>(
        `INSERT INTO books (id, name, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id, name, created_at`,
        [id, parsed.data.name, passwordHash],
      );
      return reply.code(201).send(mapBook(result.rows[0]));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(409).send({ error: "conflict" });
      }
      throw error;
    }
  });

  app.post(
    "/api/books/:id/unlock",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute",
        },
      },
    },
    async (request, reply) => {
      const params = unlockParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ error: "invalid_id" });
      }

      const parsed = unlockSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_request" });
      }

      const result = await queryWithRetry<BookRow>(
        `SELECT id, name, password_hash, created_at, updated_at
         FROM books
         WHERE id = $1`,
        [params.data.id],
      );
      if (result.rowCount === 0) {
        return reply.code(404).send({ error: "not_found" });
      }

      const row = result.rows[0];
      if (!(await verifyPassword(parsed.data.password, row.password_hash))) {
        return reply.code(401).send({ error: "book_unauthorized" });
      }

      const session = createBookToken(row.id);
      return {
        book: mapBook(row),
        token: session.token,
        expiresAt: session.expiresAt,
      };
    },
  );
}
