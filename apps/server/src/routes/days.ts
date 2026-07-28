import type { FastifyInstance } from "fastify";
import { queryWithRetry } from "../db.js";
import { requireBookAccess } from "../middleware/book-access.js";

type CalendarDayRow = {
  date_key: string;
  total: number;
  done: number;
  has_notes: boolean;
};

export type CompletionLevel = "high" | "medium" | "low" | "none";

export function completionLevel(done: number, total: number): CompletionLevel {
  if (total === 0) return "none";
  const ratio = done / total;
  if (ratio >= 0.8) return "high";
  if (ratio >= 0.4) return "medium";
  return "low";
}

export async function dayIndexRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireBookAccess);

  app.get("/api/days", async (request) => {
    const result = await queryWithRetry<{ date_key: string }>(`
      SELECT date_key::text AS date_key
      FROM (
        SELECT date_key FROM todos WHERE book_id = $1
        UNION
        SELECT date_key
        FROM daily_notes
        WHERE book_id = $1
          AND (
            BTRIM(summary) <> ''
            OR BTRIM(goals) <> ''
            OR BTRIM(notes) <> ''
          )
      ) AS available_days
      ORDER BY date_key ASC
    `, [request.bookId]);

    return { dates: result.rows.map((row) => row.date_key) };
  });

  app.get("/api/calendar", async (request) => {
    const result = await queryWithRetry<CalendarDayRow>(`
      SELECT
        day.date_key::text AS date_key,
        COALESCE(t.total, 0)::int AS total,
        COALESCE(t.done, 0)::int AS done,
        COALESCE(n.has_notes, FALSE) AS has_notes
      FROM (
        SELECT date_key FROM todos WHERE book_id = $1
        UNION
        SELECT date_key
        FROM daily_notes
        WHERE book_id = $1
          AND (
            BTRIM(summary) <> ''
            OR BTRIM(goals) <> ''
            OR BTRIM(notes) <> ''
          )
      ) AS day
      LEFT JOIN (
        SELECT
          date_key,
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE is_done)::int AS done
        FROM todos
        WHERE book_id = $1
        GROUP BY date_key
      ) AS t ON t.date_key = day.date_key
      LEFT JOIN (
        SELECT date_key, TRUE AS has_notes
        FROM daily_notes
        WHERE book_id = $1
          AND (
            BTRIM(summary) <> ''
            OR BTRIM(goals) <> ''
            OR BTRIM(notes) <> ''
          )
      ) AS n ON n.date_key = day.date_key
      ORDER BY day.date_key ASC
    `, [request.bookId]);

    return {
      days: result.rows.map((row) => ({
        date: row.date_key,
        total: row.total,
        done: row.done,
        hasNotes: row.has_notes,
        level: completionLevel(row.done, row.total),
      })),
    };
  });
}
