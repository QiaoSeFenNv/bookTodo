import type { FastifyInstance } from "fastify";
import { queryWithRetry } from "../db.js";
import { requireAccessKey } from "../middleware/access-key.js";

type AvailableDayRow = {
  date_key: string;
};

export async function dayIndexRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAccessKey);

  app.get("/api/days", async () => {
    const result = await queryWithRetry<AvailableDayRow>(`
      SELECT date_key::text AS date_key
      FROM (
        SELECT date_key FROM todos
        UNION
        SELECT date_key
        FROM daily_notes
        WHERE BTRIM(summary) <> ''
           OR BTRIM(goals) <> ''
           OR BTRIM(notes) <> ''
      ) AS available_days
      ORDER BY date_key ASC
    `);

    return { dates: result.rows.map((row) => row.date_key) };
  });
}
