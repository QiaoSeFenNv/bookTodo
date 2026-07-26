import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { queryWithRetry, type TodoRow } from "../db.js";
import { requireAccessKey } from "../middleware/access-key.js";

const timeString = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "invalid_time");

function scheduleRefine<T extends {
  scheduled_start?: string | null;
  scheduled_end?: string | null;
}>(value: T): boolean {
  const start = value.scheduled_start;
  const end = value.scheduled_end;
  const startSet = start !== undefined && start !== null;
  const endSet = end !== undefined && end !== null;
  const startCleared = start === null;
  const endCleared = end === null;

  if (startCleared !== endCleared && (startCleared || endCleared)) {
    // Allow clearing only when both explicitly null, or neither.
    if (startCleared && end === undefined) return false;
    if (endCleared && start === undefined) return false;
  }

  if (startSet !== endSet) return false;
  if (startSet && endSet && start! >= end!) return false;
  return true;
}

const createSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    page_key: z.string().trim().min(1).max(64).optional(),
    scheduled_start: timeString.optional(),
    scheduled_end: timeString.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine(scheduleRefine, { message: "invalid_schedule" });

const patchSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    is_done: z.boolean().optional(),
    page_key: z.string().trim().min(1).max(64).optional(),
    sort_order: z.number().int().optional(),
    scheduled_start: timeString.nullable().optional(),
    scheduled_end: timeString.nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.is_done !== undefined ||
      value.page_key !== undefined ||
      value.sort_order !== undefined ||
      value.scheduled_start !== undefined ||
      value.scheduled_end !== undefined ||
      value.notes !== undefined,
    { message: "at_least_one_field_required" },
  )
  .refine(scheduleRefine, { message: "invalid_schedule" });

const listQuerySchema = z.object({
  status: z.enum(["all", "active", "done"]).default("all"),
  page_key: z.string().trim().min(1).max(64).optional(),
});

function formatTime(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    // pg text / time string: "09:00:00" or "09:00:00.000"
    return value.slice(0, 5);
  }
  // Rare Date object path from node-pg
  const iso = value.toISOString();
  return iso.slice(11, 16);
}

function mapTodo(row: TodoRow) {
  return {
    id: row.id,
    title: row.title,
    isDone: row.is_done,
    pageKey: row.page_key,
    sortOrder: row.sort_order,
    scheduledStart: formatTime(row.scheduled_start),
    scheduledEnd: formatTime(row.scheduled_end),
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
  };
}

export async function todoRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAccessKey);

  app.get("/api/todos", async (request, reply) => {
    const query = listQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: "invalid_query" });
    }

    const clauses: string[] = [];
    const params: unknown[] = [];

    if (query.data.status === "active") clauses.push("is_done = FALSE");
    if (query.data.status === "done") clauses.push("is_done = TRUE");
    if (query.data.page_key) {
      params.push(query.data.page_key);
      clauses.push(`page_key = $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

    const result = await queryWithRetry<TodoRow>(
      `
        SELECT
          id,
          title,
          is_done,
          page_key,
          sort_order,
          scheduled_start::text AS scheduled_start,
          scheduled_end::text AS scheduled_end,
          notes,
          created_at,
          updated_at,
          completed_at
        FROM todos
        ${where}
        ORDER BY
          CASE WHEN scheduled_start IS NULL THEN 1 ELSE 0 END ASC,
          scheduled_start ASC NULLS LAST,
          is_done ASC,
          sort_order ASC,
          created_at DESC
      `,
      params,
    );

    return { items: result.rows.map(mapTodo) };
  });

  app.post("/api/todos", async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const id = randomUUID();
    const title = parsed.data.title;
    const pageKey = parsed.data.page_key ?? "inbox";
    const scheduledStart = parsed.data.scheduled_start ?? null;
    const scheduledEnd = parsed.data.scheduled_end ?? null;
    const notes = parsed.data.notes ?? null;

    const result = await queryWithRetry<TodoRow>(
      `
        INSERT INTO todos (id, title, page_key, scheduled_start, scheduled_end, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id, title, is_done, page_key, sort_order,
          scheduled_start::text AS scheduled_start,
          scheduled_end::text AS scheduled_end,
          notes, created_at, updated_at, completed_at
      `,
      [id, title, pageKey, scheduledStart, scheduledEnd, notes],
    );

    return reply.code(201).send(mapTodo(result.rows[0]));
  });

  app.patch("/api/todos/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "invalid_id" });
    }

    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const existing = await queryWithRetry<TodoRow>(
      `
        SELECT
          id, title, is_done, page_key, sort_order,
          scheduled_start::text AS scheduled_start,
          scheduled_end::text AS scheduled_end,
          notes, created_at, updated_at, completed_at
        FROM todos WHERE id = $1
      `,
      [params.data.id],
    );

    if (existing.rowCount === 0) {
      return reply.code(404).send({ error: "not_found" });
    }

    const current = existing.rows[0];
    const nextTitle = parsed.data.title ?? current.title;
    const nextDone = parsed.data.is_done ?? current.is_done;
    const nextPageKey = parsed.data.page_key ?? current.page_key;
    const nextSortOrder = parsed.data.sort_order ?? current.sort_order;
    const nextNotes =
      parsed.data.notes !== undefined ? parsed.data.notes : current.notes;

    let nextStart =
      parsed.data.scheduled_start !== undefined
        ? parsed.data.scheduled_start
        : formatTime(current.scheduled_start);
    let nextEnd =
      parsed.data.scheduled_end !== undefined
        ? parsed.data.scheduled_end
        : formatTime(current.scheduled_end);

    // If only one side provided as null pair clear, or both null
    if (parsed.data.scheduled_start === null && parsed.data.scheduled_end === null) {
      nextStart = null;
      nextEnd = null;
    }

    if ((nextStart == null) !== (nextEnd == null) || (nextStart && nextEnd && nextStart >= nextEnd)) {
      return reply.code(400).send({ error: "invalid_request" });
    }

    const completedAt =
      nextDone === false
        ? null
        : nextDone && !current.is_done
          ? new Date()
          : current.completed_at;

    const result = await queryWithRetry<TodoRow>(
      `
        UPDATE todos
        SET title = $2,
            is_done = $3,
            page_key = $4,
            sort_order = $5,
            scheduled_start = $6,
            scheduled_end = $7,
            notes = $8,
            completed_at = $9,
            updated_at = NOW()
        WHERE id = $1
        RETURNING
          id, title, is_done, page_key, sort_order,
          scheduled_start::text AS scheduled_start,
          scheduled_end::text AS scheduled_end,
          notes, created_at, updated_at, completed_at
      `,
      [
        params.data.id,
        nextTitle,
        nextDone,
        nextPageKey,
        nextSortOrder,
        nextStart,
        nextEnd,
        nextNotes,
        completedAt,
      ],
    );

    return mapTodo(result.rows[0]);
  });

  app.delete("/api/todos/:id", async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: "invalid_id" });
    }

    const result = await queryWithRetry("DELETE FROM todos WHERE id = $1", [params.data.id]);
    if (result.rowCount === 0) {
      return reply.code(404).send({ error: "not_found" });
    }

    return reply.code(204).send();
  });
}
