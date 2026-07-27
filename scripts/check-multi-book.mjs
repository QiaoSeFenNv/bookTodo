import assert from "node:assert/strict";
import { promisify } from "node:util";
import { createHash, scrypt, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import dotenv from "dotenv";
import pg from "pg";

const { Client } = pg;
const deriveKey = promisify(scrypt);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

dotenv.config({ path: path.join(repoRoot, ".env") });

const databaseUrl = process.env.DATABASE_URL;
const accessKey = process.env.APP_ACCESS_KEY;
assert.ok(databaseUrl, "DATABASE_URL is required");
assert.ok(accessKey, "APP_ACCESS_KEY is required");

const LEGACY_BOOK_ID = "00000000-0000-4000-8000-000000000001";
const LEGACY_BOOK_NAME = "我的待办书";
const FIXTURE_TODO_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_BOOK_ID = "22222222-2222-4222-8222-222222222222";
const TEST_SCHEMA_PREFIX = "multi_book_check_";
const runId = `${process.pid}_${Date.now()}`;
const runtimeSchema = `${TEST_SCHEMA_PREFIX}runtime_${runId}`;
const sqlSchema = `${TEST_SCHEMA_PREFIX}sql_${runId}`;
const freshSqlSchema = `${TEST_SCHEMA_PREFIX}fresh_sql_${runId}`;
const concurrentSchema = `${TEST_SCHEMA_PREFIX}concurrent_${runId}`;
const expectedTables = ["books", "daily_notes", "todos", "user_prefs"];
const sensitiveValues = new Set([accessKey]);

function quoteIdentifier(value) {
  assert.match(value, /^multi_book_check_[a-z0-9_]+$/);
  return `"${value}"`;
}

function databaseUrlForSchema(schema) {
  const url = new URL(databaseUrl);
  url.searchParams.set("options", `-c search_path=${schema}`);
  return url.toString();
}

function dbInitCommand() {
  const isWindows = process.platform === "win32";
  return {
    command: isWindows ? (process.env.ComSpec ?? "cmd.exe") : "npm",
    args: isWindows ? ["/d", "/s", "/c", "npm run db:init"] : ["run", "db:init"],
  };
}

function dbInitEnvironment(schema) {
  return {
    ...process.env,
    DATABASE_URL: databaseUrlForSchema(schema),
    APP_ACCESS_KEY: accessKey,
  };
}

function runDbInit(schema) {
  const { command, args } = dbInitCommand();
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: dbInitEnvironment(schema),
    stdio: "inherit",
  });
  assert.equal(result.status, 0, `db:init failed for isolated schema ${schema}`);
}

function runDbInitAsync(schema) {
  const { command, args } = dbInitCommand();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: dbInitEnvironment(schema),
      stdio: "ignore",
    });
    child.once("error", () => reject(new Error(`db:init could not start for ${schema}`)));
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`db:init failed for ${schema} with exit code ${code}`));
      }
    });
  });
}

function registerSensitive(value) {
  if (typeof value === "string" && value.length > 0) sensitiveValues.add(value);
}

function sanitizeFailure(error, values = sensitiveValues) {
  let message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const valuesByLength = [...values].toSorted(
    (left, right) => right.length - left.length || left.localeCompare(right),
  );
  for (const value of valuesByLength) {
    message = message.replaceAll(value, "[REDACTED]");
  }
  return message;
}

async function createLegacyFixture(client, schema) {
  const quotedSchema = quoteIdentifier(schema);
  await client.query(`CREATE SCHEMA ${quotedSchema}`);
  await client.query(`
    CREATE TABLE ${quotedSchema}.todos (
      id UUID PRIMARY KEY,
      title TEXT NOT NULL,
      is_done BOOLEAN NOT NULL DEFAULT FALSE,
      page_key TEXT NOT NULL DEFAULT 'inbox',
      sort_order INT NOT NULL DEFAULT 0,
      date_key DATE NOT NULL DEFAULT CURRENT_DATE,
      scheduled_start TIME NULL,
      scheduled_end TIME NULL,
      notes TEXT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ NULL
    );

    CREATE TABLE ${quotedSchema}.user_prefs (
      id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      template_mode TEXT NOT NULL DEFAULT 'A'
        CHECK (template_mode IN ('A', 'B', 'C')),
      last_spread_id TEXT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE ${quotedSchema}.daily_notes (
      date_key DATE PRIMARY KEY,
      summary TEXT NOT NULL DEFAULT '',
      goals TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    INSERT INTO ${quotedSchema}.todos (id, title, date_key)
    VALUES ('${FIXTURE_TODO_ID}', 'legacy schema fixture', DATE '2026-07-27');

    INSERT INTO ${quotedSchema}.daily_notes (date_key, summary, goals, notes)
    VALUES (DATE '2026-07-27', 'legacy summary', 'legacy goals', 'legacy notes');

    INSERT INTO ${quotedSchema}.user_prefs (id, template_mode, last_spread_id)
    VALUES (1, 'B', 'legacy-spread');
  `);
}

function normalizeDefinition(value, schema) {
  return value
    .replaceAll(`"${schema}".`, "")
    .replaceAll(`${schema}.`, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function readSchemaState(client, schema) {
  const tablesResult = await client.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = $1
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
    [schema],
  );
  const columnsResult = await client.query(
    `SELECT table_name, column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position`,
    [schema],
  );
  const constraintsResult = await client.query(
    `SELECT table_name.relname AS table_name,
            constraint_row.conname AS constraint_name,
            constraint_row.contype AS constraint_type,
            constraint_row.convalidated AS is_validated,
            referenced_table.relname AS referenced_table,
            constraint_row.confdeltype AS delete_action,
            ARRAY(
              SELECT attribute.attname::TEXT
                FROM unnest(constraint_row.conkey) WITH ORDINALITY AS key_column(attnum, position)
                JOIN pg_attribute attribute
                  ON attribute.attrelid = constraint_row.conrelid
                 AND attribute.attnum = key_column.attnum
               ORDER BY key_column.position
            )::TEXT[] AS columns,
            pg_get_constraintdef(constraint_row.oid) AS definition
       FROM pg_constraint constraint_row
       JOIN pg_class table_name ON table_name.oid = constraint_row.conrelid
       JOIN pg_namespace namespace_row ON namespace_row.oid = table_name.relnamespace
       LEFT JOIN pg_class referenced_table ON referenced_table.oid = constraint_row.confrelid
      WHERE namespace_row.nspname = $1
      ORDER BY table_name.relname, constraint_row.conname`,
    [schema],
  );
  const indexesResult = await client.query(
    `SELECT tablename AS table_name, indexname AS index_name, indexdef AS definition
       FROM pg_indexes
      WHERE schemaname = $1
      ORDER BY tablename, indexname`,
    [schema],
  );

  const tables = tablesResult.rows.map((row) => row.table_name);
  const snapshot = {
    tables,
    columns: columnsResult.rows.toSorted((left, right) =>
      `${left.table_name}.${left.column_name}`.localeCompare(`${right.table_name}.${right.column_name}`),
    ),
    constraints: constraintsResult.rows.map((row) => ({
      ...row,
      definition: normalizeDefinition(row.definition, schema),
    })),
    indexes: indexesResult.rows.map((row) => ({
      ...row,
      definition: normalizeDefinition(row.definition, schema),
    })),
  };

  if (expectedTables.every((table) => tables.includes(table))) {
    const quotedSchema = quoteIdentifier(schema);
    const counts = {};
    for (const table of expectedTables) {
      const result = await client.query(
        `SELECT COUNT(*)::int AS count FROM ${quotedSchema}."${table}"`,
      );
      counts[table] = result.rows[0].count;
    }
    const legacyResult = await client.query(
      `SELECT id, name, password_hash
         FROM ${quotedSchema}.books
        WHERE id = $1`,
      [LEGACY_BOOK_ID],
    );
    const fixtureResult = await client.query(`
      SELECT
        (SELECT book_id FROM ${quotedSchema}.todos WHERE id = '${FIXTURE_TODO_ID}') AS todo_book_id,
        (SELECT book_id FROM ${quotedSchema}.daily_notes WHERE date_key = DATE '2026-07-27') AS note_book_id,
        (SELECT book_id FROM ${quotedSchema}.user_prefs WHERE id = 1) AS prefs_book_id
    `);
    const ownershipResult = await client.query(`
      SELECT 'todos' AS table_name,
             COUNT(*) FILTER (WHERE row_value.book_id IS NULL)::int AS null_count,
             COUNT(*) FILTER (WHERE row_value.book_id IS NOT NULL AND owner.id IS NULL)::int AS orphan_count
        FROM ${quotedSchema}.todos row_value
        LEFT JOIN ${quotedSchema}.books owner ON owner.id = row_value.book_id
      UNION ALL
      SELECT 'daily_notes',
             COUNT(*) FILTER (WHERE row_value.book_id IS NULL)::int,
             COUNT(*) FILTER (WHERE row_value.book_id IS NOT NULL AND owner.id IS NULL)::int
        FROM ${quotedSchema}.daily_notes row_value
        LEFT JOIN ${quotedSchema}.books owner ON owner.id = row_value.book_id
      UNION ALL
      SELECT 'user_prefs',
             COUNT(*) FILTER (WHERE row_value.book_id IS NULL)::int,
             COUNT(*) FILTER (WHERE row_value.book_id IS NOT NULL AND owner.id IS NULL)::int
        FROM ${quotedSchema}.user_prefs row_value
        LEFT JOIN ${quotedSchema}.books owner ON owner.id = row_value.book_id
      ORDER BY table_name
    `);

    const legacyBook = legacyResult.rows[0] ?? null;
    const passwordHash = legacyBook?.password_hash ?? null;
    registerSensitive(passwordHash);
    snapshot.counts = counts;
    snapshot.legacyBook = legacyBook ? { id: legacyBook.id, name: legacyBook.name } : null;
    snapshot.fixtureOwnership = fixtureResult.rows[0];
    snapshot.ownership = ownershipResult.rows;
    return { snapshot, passwordHash };
  }

  return { snapshot, passwordHash: null };
}

function findColumn(snapshot, tableName, columnName) {
  return snapshot.columns.find(
    (column) => column.table_name === tableName && column.column_name === columnName,
  );
}

function findConstraint(snapshot, tableName, constraintName) {
  return snapshot.constraints.find(
    (constraint) =>
      constraint.table_name === tableName && constraint.constraint_name === constraintName,
  );
}

function findIndex(snapshot, indexName) {
  return snapshot.indexes.find((index) => index.index_name === indexName);
}

function assertColumn(snapshot, tableName, columnName, dataType, nullable) {
  const column = findColumn(snapshot, tableName, columnName);
  assert.ok(column, `${tableName}.${columnName} is missing`);
  assert.equal(column.data_type, dataType, `${tableName}.${columnName} has the wrong type`);
  assert.equal(column.is_nullable, nullable ? "YES" : "NO", `${tableName}.${columnName} nullability is wrong`);
}

function assertPrimaryKey(snapshot, tableName, columns) {
  const constraint = findConstraint(snapshot, tableName, `${tableName}_pkey`);
  assert.ok(constraint, `${tableName} primary key is missing`);
  assert.equal(constraint.constraint_type, "p");
  assert.deepEqual(constraint.columns, columns, `${tableName} primary key columns are wrong`);
}

function assertBookForeignKey(snapshot, tableName) {
  const constraint = findConstraint(snapshot, tableName, `${tableName}_book_id_fkey`);
  assert.ok(constraint, `${tableName}.book_id foreign key is missing`);
  assert.equal(constraint.constraint_type, "f");
  assert.deepEqual(constraint.columns, ["book_id"]);
  assert.equal(constraint.referenced_table, "books");
  assert.equal(constraint.delete_action, "c", `${tableName}.book_id must cascade on delete`);
  assert.equal(constraint.is_validated, true, `${tableName}.book_id foreign key is not validated`);
}

function assertIndex(snapshot, indexName, expectedSql) {
  const index = findIndex(snapshot, indexName);
  assert.ok(index, `${indexName} is missing`);
  const normalized = index.definition.replaceAll('"', "").toLowerCase();
  assert.ok(normalized.includes(expectedSql), `${indexName} has an unexpected definition: ${index.definition}`);
}

function assertSchemaShape(snapshot) {
  for (const table of expectedTables) {
    assert.ok(snapshot.tables.includes(table), `${table} table is missing`);
  }

  assertColumn(snapshot, "books", "id", "uuid", false);
  assertColumn(snapshot, "books", "name", "text", false);
  assertColumn(snapshot, "books", "password_hash", "text", false);
  assertColumn(snapshot, "books", "created_at", "timestamp with time zone", false);
  assertColumn(snapshot, "books", "updated_at", "timestamp with time zone", false);
  for (const table of ["todos", "daily_notes", "user_prefs"]) {
    assertColumn(snapshot, table, "book_id", "uuid", false);
    assertBookForeignKey(snapshot, table);
  }

  assertPrimaryKey(snapshot, "books", ["id"]);
  assertPrimaryKey(snapshot, "todos", ["id"]);
  assertPrimaryKey(snapshot, "daily_notes", ["book_id", "date_key"]);
  assertPrimaryKey(snapshot, "user_prefs", ["book_id", "id"]);

  assertIndex(snapshot, "idx_books_name_ci", "unique index idx_books_name_ci on books using btree (lower(btrim(name)))");
  assertIndex(snapshot, "idx_todos_book_status_sort", "(book_id, is_done, sort_order, created_at desc)");
  assertIndex(snapshot, "idx_todos_book_schedule", "(book_id, scheduled_start, sort_order)");
  assertIndex(snapshot, "idx_todos_book_date_schedule_sort", "(book_id, date_key, scheduled_start, sort_order)");
}

function assertSqlLegacyStage(snapshot) {
  for (const table of expectedTables) {
    assert.ok(snapshot.tables.includes(table), `${table} table is missing from SQL legacy stage`);
  }
  assertColumn(snapshot, "books", "id", "uuid", false);
  assertColumn(snapshot, "books", "password_hash", "text", false);
  for (const table of ["todos", "daily_notes", "user_prefs"]) {
    assertColumn(snapshot, table, "book_id", "uuid", true);
    assertBookForeignKey(snapshot, table);
  }
  assertPrimaryKey(snapshot, "books", ["id"]);
  assertPrimaryKey(snapshot, "todos", ["id"]);
  assertPrimaryKey(snapshot, "daily_notes", ["date_key"]);
  assertPrimaryKey(snapshot, "user_prefs", ["id"]);
  assertIndex(snapshot, "idx_books_name_ci", "unique index idx_books_name_ci on books using btree (lower(btrim(name)))");
  for (const indexName of [
    "idx_todos_book_status_sort",
    "idx_todos_book_schedule",
    "idx_todos_book_date_schedule_sort",
  ]) {
    assert.ok(!findIndex(snapshot, indexName), `${indexName} was built before ownership backfill`);
  }
  assert.deepEqual(snapshot.counts, { books: 0, daily_notes: 1, todos: 1, user_prefs: 1 });
  assert.deepEqual(snapshot.fixtureOwnership, {
    todo_book_id: null,
    note_book_id: null,
    prefs_book_id: null,
  });
  assert.deepEqual(snapshot.ownership, [
    { table_name: "daily_notes", null_count: 1, orphan_count: 0 },
    { table_name: "todos", null_count: 1, orphan_count: 0 },
    { table_name: "user_prefs", null_count: 1, orphan_count: 0 },
  ]);
}

function assertMigratedLegacyRows(snapshot) {
  assert.deepEqual(snapshot.counts, { books: 1, daily_notes: 1, todos: 1, user_prefs: 1 });
  assert.deepEqual(snapshot.fixtureOwnership, {
    todo_book_id: LEGACY_BOOK_ID,
    note_book_id: LEGACY_BOOK_ID,
    prefs_book_id: LEGACY_BOOK_ID,
  });
  assert.deepEqual(snapshot.ownership, [
    { table_name: "daily_notes", null_count: 0, orphan_count: 0 },
    { table_name: "todos", null_count: 0, orphan_count: 0 },
    { table_name: "user_prefs", null_count: 0, orphan_count: 0 },
  ]);
  assert.equal(snapshot.legacyBook?.id, LEGACY_BOOK_ID);
  assert.equal(snapshot.legacyBook?.name, LEGACY_BOOK_NAME);
}

async function storedPasswordVerifies(password, stored) {
  registerSensitive(stored);
  try {
    if (typeof stored !== "string" || stored === password) return false;
    const parts = stored.split("$");
    if (
      parts.length !== 7 ||
      parts[0] !== "scrypt" ||
      parts[1] !== "v1" ||
      parts[2] !== "65536" ||
      parts[3] !== "8" ||
      parts[4] !== "1"
    ) {
      return false;
    }
    const salt = Buffer.from(parts[5], "base64url");
    const expectedKey = Buffer.from(parts[6], "base64url");
    if (salt.length !== 16 || expectedKey.length !== 32) return false;
    const candidateKey = await deriveKey(password, salt, expectedKey.length, {
      N: 65_536,
      r: 8,
      p: 1,
      maxmem: 128 * 1024 * 1024,
    });
    return timingSafeEqual(candidateKey, expectedKey);
  } catch {
    return false;
  }
}

function passwordFingerprint(stored) {
  registerSensitive(stored);
  return createHash("sha256").update(stored, "utf8").digest();
}

function assertSensitiveFailureRedaction(stored) {
  const sanitized = sanitizeFailure(new Error(`credential=${accessKey}; hash=${stored}`));
  assert.ok(
    !sanitized.includes(accessKey) && !sanitized.includes(stored),
    "failure output did not redact sensitive values",
  );
}

function assertOverlappingSensitiveValuesAreRedacted() {
  const registryBefore = [...sensitiveValues];
  const testAccessKey = "s";
  const testSalt = "QUJDREVGR0hJSktMTU5PUA";
  const testKey = "MDEyMzQ1Njc4OUFCQ0RFRjAxMjM0NTY3ODlBQkNERUY";
  const testHash = `scrypt$v1$65536$8$1$${testSalt}$${testKey}`;
  const testSensitiveValues = new Set([testAccessKey, testHash]);

  const serialized = sanitizeFailure(
    new Error(`credential=${testAccessKey}; hash=${testHash}`),
    testSensitiveValues,
  );
  assert.ok(!serialized.includes(testAccessKey), "plaintext credential remained in error output");
  assert.ok(!serialized.includes(testHash), "complete password hash remained in error output");
  assert.ok(!serialized.includes(testSalt), "recognizable password-hash salt remained in error output");
  assert.ok(!serialized.includes(testKey), "recognizable password-hash key remained in error output");
  assert.ok(
    !serialized.includes("$65536$8$1$"),
    "recognizable password-hash parameters remained in error output",
  );
  const registryUnchanged =
    registryBefore.length === sensitiveValues.size &&
    registryBefore.every((value) => sensitiveValues.has(value));
  assert.ok(registryUnchanged, "redaction self-test mutated the sensitive-value registry");
}

async function assertCompositeOwnershipKeys(client, schema) {
  const quotedSchema = quoteIdentifier(schema);
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO ${quotedSchema}.books (id, name, password_hash)
       VALUES ($1, 'second fixture book', $2)`,
      [SECOND_BOOK_ID, "test-only-placeholder-hash"],
    );
    await client.query(
      `INSERT INTO ${quotedSchema}.daily_notes (book_id, date_key)
       VALUES ($1, DATE '2026-07-27')`,
      [SECOND_BOOK_ID],
    );
    await client.query(
      `INSERT INTO ${quotedSchema}.user_prefs (book_id, id)
       VALUES ($1, 1)`,
      [SECOND_BOOK_ID],
    );
    const result = await client.query(`
      SELECT
        (SELECT COUNT(*)::int FROM ${quotedSchema}.daily_notes WHERE date_key = DATE '2026-07-27') AS note_count,
        (SELECT COUNT(*)::int FROM ${quotedSchema}.user_prefs WHERE id = 1) AS prefs_count
    `);
    assert.deepEqual(result.rows[0], { note_count: 2, prefs_count: 2 });
  } finally {
    await client.query("ROLLBACK");
  }
}

async function applyStandaloneSql(client, schema, initSql) {
  const quotedSchema = quoteIdentifier(schema);
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL search_path TO ${quotedSchema}`);
    await client.query(initSql);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function main() {
  assertOverlappingSensitiveValuesAreRedacted();
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await createLegacyFixture(client, runtimeSchema);

    runDbInit(runtimeSchema);
    const firstState = await readSchemaState(client, runtimeSchema);
    const firstSnapshot = firstState.snapshot;
    assertSchemaShape(firstSnapshot);
    assertMigratedLegacyRows(firstSnapshot);
    assert.ok(
      await storedPasswordVerifies(accessKey, firstState.passwordHash),
      "legacy password is plaintext or does not verify",
    );
    assertSensitiveFailureRedaction(firstState.passwordHash);
    await assertCompositeOwnershipKeys(client, runtimeSchema);

    runDbInit(runtimeSchema);
    const secondState = await readSchemaState(client, runtimeSchema);
    assert.deepEqual(secondState.snapshot, firstSnapshot, "repeat db:init changed schema or rows");
    const firstHashFingerprint = passwordFingerprint(firstState.passwordHash);
    const secondHashFingerprint = passwordFingerprint(secondState.passwordHash);
    assert.ok(
      timingSafeEqual(firstHashFingerprint, secondHashFingerprint),
      "repeat db:init changed the legacy password hash",
    );

    await createLegacyFixture(client, sqlSchema);
    const initSql = await readFile(path.join(repoRoot, "apps/server/src/sql/001_init.sql"), "utf8");
    await applyStandaloneSql(client, sqlSchema, initSql);

    const sqlLegacyState = await readSchemaState(client, sqlSchema);
    assertSqlLegacyStage(sqlLegacyState.snapshot);

    runDbInit(sqlSchema);
    const sqlConvergedState = await readSchemaState(client, sqlSchema);
    assertSchemaShape(sqlConvergedState.snapshot);
    assertMigratedLegacyRows(sqlConvergedState.snapshot);
    assert.ok(
      await storedPasswordVerifies(accessKey, sqlConvergedState.passwordHash),
      "SQL-path legacy password is plaintext or does not verify",
    );
    assert.deepEqual(
      sqlConvergedState.snapshot,
      firstSnapshot,
      "standalone SQL plus runtime initialization did not converge",
    );

    await client.query(`CREATE SCHEMA ${quoteIdentifier(freshSqlSchema)}`);
    await applyStandaloneSql(client, freshSqlSchema, initSql);
    const freshSqlState = await readSchemaState(client, freshSqlSchema);
    assertSchemaShape(freshSqlState.snapshot);
    assert.deepEqual(
      freshSqlState.snapshot.columns,
      firstSnapshot.columns,
      "fresh standalone SQL columns diverged",
    );
    assert.deepEqual(
      freshSqlState.snapshot.constraints,
      firstSnapshot.constraints,
      "fresh standalone SQL constraints diverged",
    );
    assert.deepEqual(
      freshSqlState.snapshot.indexes,
      firstSnapshot.indexes,
      "fresh standalone SQL indexes diverged",
    );

    await createLegacyFixture(client, concurrentSchema);
    await Promise.all([runDbInitAsync(concurrentSchema), runDbInitAsync(concurrentSchema)]);
    const concurrentState = await readSchemaState(client, concurrentSchema);
    assertSchemaShape(concurrentState.snapshot);
    assertMigratedLegacyRows(concurrentState.snapshot);
    assert.ok(
      await storedPasswordVerifies(accessKey, concurrentState.passwordHash),
      "concurrent initialization produced an invalid legacy password hash",
    );
    assert.deepEqual(
      concurrentState.snapshot,
      firstSnapshot,
      "concurrent runtime initialization produced an unstable schema or row set",
    );

    console.log(
      "Multi-book schema check passed: migration, hashing, SQL convergence, concurrency, and repeatability verified.",
    );
  } finally {
    for (const schema of [runtimeSchema, sqlSchema, freshSqlSchema, concurrentSchema]) {
      assert.ok(schema.startsWith(TEST_SCHEMA_PREFIX));
      await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    }
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Multi-book schema check failed: ${sanitizeFailure(error)}`);
  process.exitCode = 1;
});
