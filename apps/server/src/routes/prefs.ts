import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { queryWithRetry, type UserPrefsRow } from "../db.js";
import { requireBookAccess } from "../middleware/book-access.js";

const patchSchema = z
  .object({
    template_mode: z.enum(["A", "B", "C"]).optional(),
    last_spread_id: z.string().trim().min(1).max(64).nullable().optional(),
  })
  .refine(
    (value) => value.template_mode !== undefined || value.last_spread_id !== undefined,
    { message: "at_least_one_field_required" },
  );

function mapPrefs(row: UserPrefsRow) {
  return {
    templateMode: row.template_mode,
    lastSpreadId: row.last_spread_id,
    updatedAt: row.updated_at.toISOString(),
  };
}

async function ensurePrefsRow(bookId: string): Promise<UserPrefsRow> {
  const existing = await queryWithRetry<UserPrefsRow>(
    "SELECT * FROM user_prefs WHERE book_id = $1 AND id = 1",
    [bookId],
  );
  if (existing.rowCount && existing.rows[0]) {
    return existing.rows[0];
  }

  const inserted = await queryWithRetry<UserPrefsRow>(
    `
      INSERT INTO user_prefs (book_id, id, template_mode)
      VALUES ($1, 1, 'A')
      ON CONFLICT (book_id, id) DO UPDATE SET updated_at = user_prefs.updated_at
      RETURNING *
    `,
    [bookId],
  );
  return inserted.rows[0];
}

export async function prefsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireBookAccess);

  app.get("/api/prefs", async (request) => {
    const row = await ensurePrefsRow(request.bookId);
    return mapPrefs(row);
  });

  app.patch("/api/prefs", async (request, reply) => {
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const current = await ensurePrefsRow(request.bookId);
    const nextMode = parsed.data.template_mode ?? current.template_mode;
    const nextSpread =
      parsed.data.last_spread_id !== undefined
        ? parsed.data.last_spread_id
        : current.last_spread_id;

    const result = await queryWithRetry<UserPrefsRow>(
      `
        UPDATE user_prefs
        SET template_mode = $1,
            last_spread_id = $2,
            updated_at = NOW()
        WHERE book_id = $3 AND id = 1
        RETURNING *
      `,
      [nextMode, nextSpread, request.bookId],
    );

    return mapPrefs(result.rows[0]);
  });
}
