# Password-Protected Multi-Book Design

## Context

The application currently has one global `APP_ACCESS_KEY` and three unscoped PostgreSQL tables. The requested experience is not an account system: a visitor first unlocks the private site, sees a paginated bookshelf, then unlocks one selected book with that book's independent password.

## Chosen Architecture

Use shared business tables with a mandatory `book_id` ownership column. Keep `APP_ACCESS_KEY` as the outer site credential. Hash each book password with Node's built-in `scrypt`, and exchange a successful book unlock for a short-lived HMAC-signed book token. The signing key is random server-only process state and is never derived from a credential shared with visitors. All book data routes require both the outer access key and the signed book token.

```text
Outer password
  -> POST /api/auth/verify
  -> protected bookshelf
       -> GET /api/books?page=1&pageSize=12
       -> POST /api/books
       -> select book
            -> POST /api/books/:id/unlock
            -> signed token { bookId, expiresAt }
            -> existing daily notebook APIs scoped by token.bookId
```

## Alternatives Considered

### One table set or schema per book

This makes each book physically separate, but every new book requires DDL, migrations must loop over arbitrary schemas, connection/query management becomes harder, and pagination still needs a shared catalog. Rejected because shared tables already fit the current application and scale without schema proliferation.

### Send the book password on every API request

This avoids tokens but keeps a reusable plaintext credential in browser state and repeatedly performs expensive password hashing. Rejected because a signed, expiring token narrows password exposure and keeps data requests cheap.

### Stateful database sessions

Opaque sessions provide revocation, but require another table, cleanup, and more operational state. Rejected for this small private application. A signed token is sufficient while password changes and active-session revocation remain out of scope.

## Database Model

Add a `books` catalog:

```sql
books (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

Book names are trimmed, 1-80 characters, and unique case-insensitively. Newly created passwords are 8-128 characters. Unlock accepts 1-256 characters so a migrated installation whose existing `APP_ACCESS_KEY` predates the new policy remains usable. The API never returns `password_hash`.

Add `book_id UUID` to `todos`, `daily_notes`, and `user_prefs`, referencing `books(id) ON DELETE CASCADE`. Final ownership keys are:

- `todos`: existing UUID primary key; every index used for daily reads starts with `book_id`.
- `daily_notes`: composite primary key `(book_id, date_key)`.
- `user_prefs`: composite primary key `(book_id, id)` while retaining the one-row-per-book `id = 1` convention.

The explicit SQL bootstrap and runtime `ensureSchema()` both create the structural changes. Credential seeding remains in TypeScript because `APP_ACCESS_KEY` must be hashed with application code and must never be interpolated into SQL source.

## Legacy Migration

Use a stable internal UUID for the legacy book. During `ensureSchema()`:

1. Create the `books` table and nullable `book_id` columns.
2. Hash `APP_ACCESS_KEY` with the same `scrypt` implementation used for new books.
3. Insert the legacy book named `我的待办书` if the stable UUID is absent.
4. Backfill every null `book_id` with the legacy UUID.
5. Replace the single-column daily-note and preference primary keys with composite keys.
6. Add `NOT NULL`, foreign-key constraints, and book-prefixed indexes idempotently.

Existing rows are never deleted or rewritten beyond assigning ownership. Re-running initialization leaves the legacy hash unchanged after the first successful insert.

## Password and Token Security

`password.ts` owns a versioned storage format containing algorithm, cost parameters, random salt, and derived key. Verification decodes the stored format defensively and uses `timingSafeEqual`. Passwords are accepted only in request bodies over the existing HTTP deployment; README must retain the HTTPS warning for public deployment.

`book-session.ts` signs a compact base64url payload with HMAC-SHA256 using a random 256-bit key generated when the server process starts. The payload contains `bookId`, `issuedAt`, and `expiresAt`; validity is 12 hours. Signature, UUID shape, canonical lifetime, and expiry are verified before a request receives a book context. The key is never sent to the browser or persisted. Restarting the server invalidates all book tokens and returns visitors to per-book unlock, which is acceptable for this single-process private deployment and prevents anyone who knows the outer password from forging a book token.

Outer verification and book unlock each have a strict rate limit. The existing global process-exit counter is removed: in a shared deployment it lets accidental or hostile password attempts stop the service for every legitimate user.

## HTTP Contracts

### Bookshelf

```text
GET /api/books?page=1&pageSize=12
X-Access-Key: <APP_ACCESS_KEY>

200 {
  items: [{ id, name, createdAt }],
  page: 1,
  pageSize: 12,
  totalItems: 27,
  totalPages: 3
}
```

`page` defaults to 1. `pageSize` defaults to 12 and is capped at 24. Ordering is stable: `created_at DESC, id DESC`. An empty result returns `totalPages: 0`; requesting a page past the end returns an empty `items` array with unchanged metadata.

### Create and unlock

```text
POST /api/books
X-Access-Key: <APP_ACCESS_KEY>
{ "name": "周末计划", "password": "at-least-8-characters" }
-> 201 { id, name, createdAt }

POST /api/books/:id/unlock
X-Access-Key: <APP_ACCESS_KEY>
{ "password": "..." }
-> 200 { book: { id, name, createdAt }, token, expiresAt }
```

Invalid input returns 400, duplicate names return 409, absent books return 404, and wrong book passwords return 401 without revealing a hash or another book's data.

### Existing book data APIs

`/api/todos`, `/api/days`, `/api/day-notes`, and `/api/prefs` require:

```text
X-Access-Key: <APP_ACCESS_KEY>
X-Book-Token: <signed token>
```

Every SELECT, INSERT, UPDATE, DELETE, and UPSERT includes the verified `book_id`. In particular, Todo update/delete queries use both `id` and `book_id`, preventing cross-book identifier attacks.

## Frontend Flow

The existing cover gate becomes the outer private-site gate. After success, the app shows an unframed protected bookshelf with:

- a compact header and outer logout control;
- a grid/list of book items with names and creation dates;
- icon pagination controls with page state;
- a create-book command opening a focused dialog for name, password, and confirmation.

Selecting a book opens a password dialog. Success stores only the returned book token and selected public book metadata in `sessionStorage`. The password is discarded immediately. Opening the notebook preserves the current daily UI and interactions.

The existing lock action becomes `返回书架`: it flushes pending notes, clears the book token and selected book, and keeps the outer site session. Selecting any book, including the same one, requires a new password after returning. The bookshelf has a separate `退出书房` action that also clears the outer access key.

## Error Handling

- A 401 from the site gate or bookshelf clears all site and book state and returns to the outer gate.
- A 401 from book unlock keeps the visitor on the selected book dialog and shows a password error.
- An invalid/expired book token clears only the book session and returns to the bookshelf.
- Book creation validation and duplicate-name errors remain in the create dialog without losing entered non-password fields.
- Data load/save failures keep the existing visible error behavior inside the notebook.

## Verification

- Unit tests cover password hash round trips, malformed hashes, wrong passwords, token tampering, wrong secret, and expiry.
- API/browser checks create temporary books, verify paging metadata and stable ordering, unlock isolation, cross-book Todo protection, notes/date/prefs isolation, session clearing, and desktop/mobile layout.
- `npm run db:init` runs twice against local PostgreSQL and preserves pre-existing legacy rows.
- `npm run build` compiles both workspaces.

## Rollout and Rollback

Take a PostgreSQL backup before first deployment. The schema migration is additive except for replacing two primary keys with composite equivalents, and initialization is transactional around ownership backfill/constraint changes.

Once more than one book contains data, the old unscoped application must not be run against the upgraded database because it would mix all books. Application rollback therefore requires restoring the pre-migration database backup, or keeping the upgraded service offline until the new binary is restored.
