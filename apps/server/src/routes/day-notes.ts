import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { queryWithRetry } from "../db.js";
import { dateString, formatDate } from "../lib/date.js";
import { requireAccessKey } from "../middleware/access-key.js";

type DayNotesRow = {
  date_key: string | Date;
  summary: string;
  goals: string;
  notes: string;
  updated_at: Date;
};

const putSchema = z.object({
  date: dateString,
  summary: z.string().max(2000).optional(),
  goals: z.string().max(2000).optional(),
  notes: z.string().max(4000).optional(),
});

function mapNotes(row: DayNotesRow) {
  return {
    dateKey: formatDate(row.date_key),
    summary: row.summary,
    goals: row.goals,
    notes: row.notes,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function dayNotesRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAccessKey);

  app.get("/api/day-notes", async (request, reply) => {
    const query = z.object({ date: dateString }).safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: "invalid_query" });
    }

    const result = await queryWithRetry<DayNotesRow>(
      "SELECT date_key::text AS date_key, summary, goals, notes, updated_at FROM daily_notes WHERE date_key = $1",
      [query.data.date],
    );

    if (result.rowCount === 0) {
      return {
        dateKey: query.data.date,
        summary: "",
        goals: "",
        notes: "",
        updatedAt: null,
      };
    }
    return mapNotes(result.rows[0]);
  });

  app.put("/api/day-notes", async (request, reply) => {
    const parsed = putSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const { date, summary, goals, notes } = parsed.data;
    const result = await queryWithRetry<DayNotesRow>(
      `
        INSERT INTO daily_notes (date_key, summary, goals, notes, updated_at)
        VALUES ($1, COALESCE($2, ''), COALESCE($3, ''), COALESCE($4, ''), NOW())
        ON CONFLICT (date_key) DO UPDATE SET
          summary = COALESCE($2, daily_notes.summary),
          goals = COALESCE($3, daily_notes.goals),
          notes = COALESCE($4, daily_notes.notes),
          updated_at = NOW()
        RETURNING date_key::text AS date_key, summary, goals, notes, updated_at
      `,
      [date, summary ?? null, goals ?? null, notes ?? null],
    );

    return mapNotes(result.rows[0]);
  });
}
