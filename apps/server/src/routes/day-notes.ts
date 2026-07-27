import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { queryWithRetry } from "../db.js";
import { dateString, formatDate } from "../lib/date.js";
import { requireBookAccess } from "../middleware/book-access.js";

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
  app.addHook("preHandler", requireBookAccess);

  app.get("/api/day-notes", async (request, reply) => {
    const query = z.object({ date: dateString }).safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: "invalid_query" });
    }

    const result = await queryWithRetry<DayNotesRow>(
      `SELECT date_key::text AS date_key, summary, goals, notes, updated_at
         FROM daily_notes
        WHERE book_id = $1 AND date_key = $2`,
      [request.bookId, query.data.date],
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
        INSERT INTO daily_notes (book_id, date_key, summary, goals, notes, updated_at)
        VALUES ($1, $2, COALESCE($3, ''), COALESCE($4, ''), COALESCE($5, ''), NOW())
        ON CONFLICT (book_id, date_key) DO UPDATE SET
          summary = COALESCE($3, daily_notes.summary),
          goals = COALESCE($4, daily_notes.goals),
          notes = COALESCE($5, daily_notes.notes),
          updated_at = NOW()
        RETURNING date_key::text AS date_key, summary, goals, notes, updated_at
      `,
      [request.bookId, date, summary ?? null, goals ?? null, notes ?? null],
    );

    return mapNotes(result.rows[0]);
  });
}
