# Password-Protected Multi-Book Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:test-driven-development` while implementing each task. Track progress with these checkboxes and do not modify files outside the listed scope without updating this plan.

**Goal:** Add a protected paginated bookshelf whose books each have an independent password and isolated copies of the existing daily todo experience.

**Architecture:** Keep `APP_ACCESS_KEY` as the outer gate, use shared PostgreSQL tables keyed by `book_id`, hash book passwords with built-in `scrypt`, and issue expiring book tokens signed by a random server-only process key for scoped data access.

**Tech Stack:** React 19, TypeScript, Fastify 5, Zod, Node crypto, PostgreSQL 16, Playwright.

---

## Task 1: Password and Book Session Primitives

**Files:**
- Create `apps/server/src/lib/password.test.ts`
- Create `apps/server/src/lib/password.ts`
- Create `apps/server/src/lib/book-session.test.ts`
- Create `apps/server/src/lib/book-session.ts`
- Modify `apps/server/package.json`

- [x] Add a `test` script that runs both TypeScript test files with the Node test runner through `tsx`.
- [x] Write failing password tests for successful `scrypt` round trip, wrong password, distinct salts, and malformed stored values.
- [x] Implement `hashPassword(password)` and `verifyPassword(password, stored)` with a versioned encoded format, random salt, asynchronous `scrypt`, defensive parsing, and timing-safe comparison.
- [x] Write failing token tests for a valid 12-hour token, tampered payload/signature, wrong signing secret, malformed token, and expired token.
- [x] Implement `createBookToken(bookId, secret, now?)` and `verifyBookToken(token, secret, now?)` using base64url JSON plus HMAC-SHA256; export a random 256-bit process-local signing key for route/middleware integration and never derive it from `APP_ACCESS_KEY`.
- [x] Run `npm test -w @book-todo/server`; expect all primitive tests to pass.

## Task 2: Additive Book Schema and Legacy Migration

**Files:**
- Modify `apps/server/src/sql/001_init.sql`
- Modify `apps/server/src/db.ts`
- Modify `apps/server/src/db-init.ts` only if migration orchestration needs explicit transaction cleanup
- Create `scripts/check-multi-book.mjs`
- Modify `package.json`

- [x] Add `check:multi-book` and create a failing schema integration check that expects `books` and all three `book_id` columns after `npm run db:init`.
- [x] Add `BookRow` and schema constants/types to `db.ts`.
- [x] Add the `books` table, nullable ownership columns, composite keys, foreign keys, and book-prefixed indexes to both schema paths.
- [x] Split `ensureSchema()` into structural DDL followed by a transaction that inserts the stable legacy book with `hashPassword(APP_ACCESS_KEY)`, backfills null ownership, and applies final constraints idempotently.
- [x] Ensure legacy book insertion uses `ON CONFLICT (id) DO NOTHING`, so repeated initialization never changes its password.
- [x] Run `npm run db:init` twice against local PostgreSQL; both runs must succeed and row counts must remain stable.

## Task 3: Site and Book Authentication Boundary

**Files:**
- Modify `apps/server/src/middleware/access-key.ts`
- Modify `apps/server/src/routes/auth.ts`
- Create `apps/server/src/middleware/book-access.ts`
- Create `apps/server/src/routes/books.ts`
- Modify `apps/server/src/index.ts`

- [x] Add failing API checks for missing/wrong outer keys, invalid book creation input, duplicate case-insensitive names, wrong book password, missing book, and a valid unlock response.
- [x] Keep `requireAccessKey` as the site gate and add `X-Book-Token` to CORS allowed headers.
- [x] Remove the process-global failed-attempt shutdown counter; retain the outer route rate limit and return 401 for a wrong key.
- [x] Implement `requireBookAccess` to first enforce the outer key, then verify the signed token and attach a typed `bookId` context; return a distinguishable `book_unauthorized` 401 for missing/expired tokens.
- [x] Implement `GET /api/books` with Zod page validation, `COUNT(*)`, stable offset pagination, and public DTO mapping.
- [x] Implement `POST /api/books` with trimmed unique name validation, password hashing, and 409 conflict mapping.
- [x] Implement `POST /api/books/:id/unlock` with its own rate limit, password verification, and signed token response; do not increment the outer gate's process-exit failure counter.
- [x] Register the routes and run server tests plus TypeScript build.

## Task 4: Scope Every Existing Data Route

**Files:**
- Modify `apps/server/src/routes/todos.ts`
- Modify `apps/server/src/routes/days.ts`
- Modify `apps/server/src/routes/day-notes.ts`
- Modify `apps/server/src/routes/prefs.ts`

- [x] Add failing cross-book API checks: two books on the same date return different Todo/note/day/pref data, and Book B cannot patch/delete Book A's Todo UUID.
- [x] Replace `requireAccessKey` hooks with `requireBookAccess` and extract the verified `bookId` once per handler.
- [x] Add `book_id` to every read/write predicate and insert. Todo mutation predicates must be `WHERE id = $1 AND book_id = $N`.
- [x] Change daily-note upsert conflict ownership to `(book_id, date_key)`.
- [x] Change preference lookup/create/update ownership to `(book_id, id)` while retaining `id = 1` per book.
- [x] Run the cross-book checks and server tests; all isolation assertions must pass.

## Task 5: Frontend API and Session Contracts

**Files:**
- Modify `apps/web/src/lib/api.ts`

- [x] Define `Book`, `BookPage`, and `BookSession` types matching the design HTTP contracts.
- [x] Add storage helpers for the outer key and selected book session as separate sessionStorage entries.
- [x] Add `listBooks`, `createBook`, and `unlockBook`; site endpoints send only `X-Access-Key`.
- [x] Keep existing Todo/day/prefs helper signatures unchanged in this task so the additive API client change compiles independently.
- [x] Run `npm run build -w @book-todo/web`; the additive client contract must compile before UI consumers change.

## Task 6: Protected Bookshelf and Book Unlock UX

**Files:**
- Modify `apps/web/src/components/auth/AccessGate.tsx`
- Create `apps/web/src/components/books/BookshelfPage.tsx`
- Create `apps/web/src/components/books/CreateBookDialog.tsx`
- Create `apps/web/src/components/books/BookUnlockDialog.tsx`
- Modify `apps/web/src/lib/api.ts`
- Modify `apps/web/src/App.tsx`
- Modify `apps/web/src/styles/global.css`

- [x] Add browser assertions for outer gate -> bookshelf, page navigation, create dialog validation, wrong/correct book unlock, return-to-bookshelf, re-unlock on switching, outer logout, and reload behavior.
- [x] Change Todo/day/prefs API helpers and all App consumers together to send both `X-Access-Key` and `X-Book-Token`; map `book_unauthorized` separately from outer `unauthorized`.
- [x] Retitle the existing cover gate as the private site entrance while preserving its animation and responsive dimensions.
- [x] Build an accessible bookshelf with 12 items per page, stable loading/error/empty states, icon pagination buttons, and an item button for each book.
- [x] Build accessible create and unlock dialogs with focus handling, password fields, confirmation only on create, visible validation errors, and password clearing on close/success.
- [x] Refactor App state into outer authorization, bookshelf, book unlock, and open-book phases without changing the existing notebook markup and daily behavior.
- [x] On `返回书架`, flush pending notes and clear the book session only. On `退出书房`, clear both authentication layers.
- [x] On book-token expiry, return to the bookshelf; on outer-key failure, return to the site gate.
- [x] Add responsive styling consistent with the current paper/book palette, using repeated book cards only for actual books and keeping page controls stable at desktop and 390px mobile widths.
- [x] Run the frontend build and browser assertions until both pass.

## Task 7: Full Integration and Local PostgreSQL Acceptance

**Files:**
- Modify `scripts/check-multi-book.mjs`
- Modify `scripts/check-ui.mjs`

- [x] Expand `check:multi-book` and update the existing UI check to authenticate through both gates.
- [x] In the route tests invoked by `check:multi-book`, create timestamp-prefixed temporary books through the API, use direct PostgreSQL cleanup in `finally`, and never delete non-test books; keep `check-multi-book.mjs` focused on isolated migration schemas.
- [x] Assert page size, total counts, stable ordering, page overflow behavior, duplicate-name conflict, password failures, token expiry/tamper rejection, and all cross-book data isolation paths.
- [x] Verify legacy rows belong to `我的待办书` and that its stored password value is a hash rather than `APP_ACCESS_KEY`.
- [x] Start the local PostgreSQL instance, run schema initialization twice, start both dev servers, then run `npm run check:multi-book` and `npm run check:ui`.
- [x] Capture desktop and 390x844 screenshots for the outer gate, bookshelf, create dialog, unlock dialog, and open book; inspect for clipping, overlap, blank assets, and horizontal overflow.

## Task 8: Documentation and Final Quality Gate

**Files:**
- Modify `README.md`
- Update `.trellis/spec/backend/database-guidelines.md` through `trellis-update-spec` if the implemented book-ownership contract is stable

- [x] Document the two passwords, bookshelf flow, legacy/default book behavior, migration backup, HTTPS requirement, pagination defaults, and the unsafe old-binary rollback caveat.
- [x] Run `npm test -w @book-todo/server`.
- [x] Run `npm run build`.
- [x] Run `npm run db:init` twice against local PostgreSQL.
- [x] Run `npm run check:multi-book` and `npm run check:ui` against the running application.
- [x] Run `git diff --check` and inspect `git diff --stat` plus `git status --short` for scope and accidental secrets.
- [x] Complete Trellis quality review, update specs only with verified reusable contracts, and create the required final project commit.

## Risk and Rollback Checkpoints

- Before Task 2 against any non-empty database: take a `pg_dump` backup.
- After Task 2: verify legacy row counts and ownership before allowing new books to be created.
- After Task 4: prove cross-book UUID attacks fail before exposing the bookshelf UI.
- After Task 6: verify note flush before clearing a book session.
- Do not run the old unscoped binary against a database containing multiple books. Restore the pre-migration backup for a full rollback.
