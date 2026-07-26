import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { queryWithRetry, type UserPrefsRow } from "../db.js";
import { requireAccessKey } from "../middleware/access-key.js";

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

async function ensurePrefsRow(): Promise<UserPrefsRow> {
  const existing = await queryWithRetry<UserPrefsRow>(
    "SELECT * FROM user_prefs WHERE id = 1",
  );
  if (existing.rowCount && existing.rows[0]) {
    return existing.rows[0];
  }

  const inserted = await queryWithRetry<UserPrefsRow>(
    `
      INSERT INTO user_prefs (id, template_mode)
      VALUES (1, 'A')
      ON CONFLICT (id) DO UPDATE SET updated_at = user_prefs.updated_at
      RETURNING *
    `,
  );
  return inserted.rows[0];
}

export async function prefsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAccessKey);

  app.get("/api/prefs", async () => {
    const row = await ensurePrefsRow();
    return mapPrefs(row);
  });

  app.patch("/api/prefs", async (request, reply) => {
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const current = await ensurePrefsRow();
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
        WHERE id = 1
        RETURNING *
      `,
      [nextMode, nextSpread],
    );

    return mapPrefs(result.rows[0]);
  });
}
