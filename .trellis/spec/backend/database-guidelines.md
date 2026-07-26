# Database Guidelines

> Database patterns and executable persistence contracts for this project.

## Current Conventions

- PostgreSQL is accessed through `pg` and the shared `queryWithRetry` helper in `apps/server/src/db.ts`; there is no ORM.
- Tables and columns use plural `snake_case` names. API responses map them to frontend `camelCase` at the route boundary.
- Schema bootstrap has two maintained entry points:
  - runtime startup: `ensureSchema()` in `apps/server/src/db.ts`;
  - explicit initialization: `apps/server/src/sql/001_init.sql` through `npm run db:init`.
- Additive changes use `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Do not drop or rewrite user data during normal startup.

## Scenario: Date-Keyed Daily Journal Persistence

### 1. Scope / Trigger

Use this contract when adding or changing date-keyed journal fields that cross PostgreSQL, Fastify, the frontend API client, and the daily workspace. It prevents a common partial migration where a route compiles but a fresh database or the runtime startup path lacks the required table or column.

### 2. Signatures

Database:

```sql
daily_notes (
  date_key DATE PRIMARY KEY,
  summary TEXT NOT NULL DEFAULT '',
  goals TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

HTTP:

```text
GET /api/day-notes?date=YYYY-MM-DD
PUT /api/day-notes
X-Access-Key: <APP_ACCESS_KEY>
```

Frontend:

```typescript
type DayNotes = {
  dateKey: string;
  summary: string;
  goals: string;
  notes: string;
  updatedAt: string | null;
};
```

### 3. Contracts

- `date` is a real calendar date in exact `YYYY-MM-DD` format, not merely a regex match.
- `summary` and `goals` are optional strings with a maximum length of 2000.
- `notes` is an optional string with a maximum length of 4000.
- A missing row returns empty strings and `updatedAt: null`; reads do not create rows.
- PUT performs an upsert. Omitted fields preserve existing values on conflict; a new row uses empty strings for omitted fields.
- Responses use `dateKey`, `summary`, `goals`, `notes`, and ISO `updatedAt`.
- Both Todo and day-note routes require the existing `X-Access-Key` contract.
- Any schema field addition must be applied to both `ensureSchema()` and `001_init.sql`.

### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Missing or wrong access key | HTTP 401, `{ "error": "unauthorized" }` |
| Missing date query | HTTP 400, `{ "error": "invalid_query" }` |
| Bad format such as `26-07-2026` | HTTP 400 |
| Impossible date such as `2026-02-31` | HTTP 400 |
| PUT field exceeds its maximum | HTTP 400, `{ "error": "invalid_request" }` |
| Valid date with no row | HTTP 200 with empty fields and `updatedAt: null` |
| Database failure | Request fails; the frontend must show a read/save error instead of silently discarding it |

### 5. Good / Base / Bad Cases

- Good: PUT all three writing fields, poll GET until the exact values round-trip, reload the workspace, then restore the prior row.
- Base: GET a valid date with no row and receive the empty response without creating data.
- Bad: accept `2026-02-31`, suppress a missing-table error, or update only one schema bootstrap path.

### 6. Tests Required

- `npm run build`: frontend and backend TypeScript must both compile.
- `npm run db:init`: schema initialization must succeed against the configured database.
- Browser/API check in `scripts/check-ui.mjs` must assert:
  - impossible dates return 400;
  - summary, goals, and notes round-trip exactly;
  - the visible save state reaches `已保存`;
  - the pre-test daily-note values are restored in `finally`.
- For a new field, verify a database created by each schema path exposes the same column set.

### 7. Wrong vs Correct

#### Wrong

```typescript
// Route added, but runtime startup never creates its table.
await app.register(dayNotesRoutes);

// UI hides every persistence error, making data loss look successful.
saveDayNotes(key, value).catch(() => undefined);
```

#### Correct

```typescript
// Keep the runtime bootstrap and SQL bootstrap additive and equivalent.
await queryWithRetry(`
  CREATE TABLE IF NOT EXISTS daily_notes (...);
  ALTER TABLE daily_notes
    ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
`);

try {
  await saveDayNotes(key, value);
  setNotesStatus("saved");
} catch {
  setNotesStatus("error");
  setError("日记内容保存失败，请稍后重试。");
}
```

## Common Mistakes

- Treating `^\d{4}-\d{2}-\d{2}$` as sufficient date validation. PostgreSQL and JavaScript can normalize impossible dates unless the route checks calendar components.
- Updating `001_init.sql` but forgetting `ensureSchema()`, or the reverse.
- Swallowing day-note read/write errors while continuing to render an apparently successful workspace.

## Scenario: Date-Scoped Todos and Available-Day Index

### 1. Scope / Trigger

Use this contract whenever Todo persistence or daily-workspace navigation changes. A date is the ownership boundary for Todos and journal writing. The lightweight available-day index is the only authority the frontend may use to decide whether a detail read is necessary.

### 2. Signatures

Database:

```sql
todos.date_key DATE NOT NULL DEFAULT CURRENT_DATE
CREATE INDEX idx_todos_date_schedule_sort
  ON todos (date_key, scheduled_start, sort_order)
```

HTTP:

```text
GET  /api/days
GET  /api/todos?date=YYYY-MM-DD&status=all|active|done
POST /api/todos { "title": "...", "date_key": "YYYY-MM-DD" }
X-Access-Key: <APP_ACCESS_KEY>
```

Frontend:

```typescript
listAvailableDays(accessKey): Promise<{ dates: string[] }>
listTodos(accessKey, status, date): Promise<{ items: Todo[] }>
Todo.dateKey: string
```

### 3. Contracts

- `GET /api/days` returns sorted, unique `YYYY-MM-DD` strings from the union of all Todo dates and daily-note dates whose trimmed `summary`, `goals`, or `notes` is non-empty.
- The endpoint requires the same access key as Todo and day-note details and never returns detail payloads.
- `GET /api/todos` keeps `date` optional for compatibility. When present, it filters exclusively by `todos.date_key`.
- `POST /api/todos` accepts optional `date_key` for compatibility; the V2 workspace always sends its selected date. Omission uses the database `CURRENT_DATE` default.
- Todo responses always include camel-case `dateKey`.
- Existing rows migrate additively: add nullable `date_key`, backfill nulls with `CURRENT_DATE`, then set the default and `NOT NULL` constraint.
- Apply that migration in both `ensureSchema()` and `001_init.sql`; never drop or rewrite existing Todo rows.
- Frontend bootstrap reads `/api/days` first. An absent date renders a local empty projection without calling either detail endpoint. A present date calls both `/api/todos?date=...` and `/api/day-notes?date=...`.
- Before changing dates, flush pending journal writes. Associate detail responses with the requested date/revision and ignore stale responses.

### 4. Validation & Error Matrix

| Condition | Result |
|---|---|
| Missing or wrong access key on `/api/days` | HTTP 401, `{ "error": "unauthorized" }` |
| Impossible Todo query date such as `2026-02-31` | HTTP 400, `{ "error": "invalid_query" }` |
| Impossible Todo create `date_key` | HTTP 400, `{ "error": "invalid_request" }` |
| Valid date absent from `/api/days` | Local empty workspace; zero Todo/day-note detail GETs |
| Valid date present in `/api/days` | Both detail GETs execute and project only that date |
| Existing V1 Todo with null/missing date during migration | Backfilled to PostgreSQL `CURRENT_DATE` |
| Detail response arrives after another date was selected | Response is ignored |

### 5. Good / Base / Bad Cases

- Good: seed different Todos on yesterday and tomorrow, navigate independently, and observe only the selected date's records.
- Base: navigate to a date absent from the index and immediately show empty Todos and writing fields without detail reads.
- Bad: fetch the global Todo list on every date change, infer availability from cached details, or add `date_key` to only one schema bootstrap path.

### 6. Tests Required

- `npm run build` must compile the frontend and backend contracts.
- `npm run db:init` must be repeatable and preserve existing Todo rows.
- `scripts/check-ui.mjs` must assert authenticated `/api/days`, sorted indexed dates, impossible-date rejection, and `Todo.dateKey` on old/new records.
- Browser network assertions must prove indexed dates issue both detail reads and a non-indexed date issues neither.
- Browser checks must seed and clean timestamp-prefixed Todos on separate dates and restore modified daily notes in `finally`.

### 7. Wrong vs Correct

#### Wrong

```typescript
// Leaks records across days and performs unnecessary detail reads.
const [todos, notes] = await Promise.all([
  listTodos(key),
  getDayNotes(key, selectedDate),
]);
```

#### Correct

```typescript
const { dates } = await listAvailableDays(key);
if (!dates.includes(selectedDate)) {
  showLocalEmptyDay();
  return;
}
const [todos, notes] = await Promise.all([
  listTodos(key, "all", selectedDate),
  getDayNotes(key, selectedDate),
]);
```
