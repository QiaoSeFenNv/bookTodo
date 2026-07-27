import type { FastifyInstance } from "fastify";
import { queryWithRetry } from "../db.js";
import { requireBookAccess } from "../middleware/book-access.js";

type AvailableDayRow = {
  date_key: string;
};

export async function dayIndexRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireBookAccess);

  app.get("/api/days", async (request) => {
    const result = await queryWithRetry<AvailableDayRow>(`
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
}
