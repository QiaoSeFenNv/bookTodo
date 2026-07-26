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
