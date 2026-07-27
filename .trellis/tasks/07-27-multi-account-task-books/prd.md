# Password-protected multi-book task workspaces

## Goal

Turn the current single-book personal todo application into a shared bookshelf where the owner and friends can create and use multiple isolated, independently password-protected task books without changing the established daily notebook experience inside a book.

## Background

- The current application authenticates every request with one global `APP_ACCESS_KEY`; this existing secret can remain the outer site gate.
- PostgreSQL currently stores `todos`, `daily_notes`, and `user_prefs` without an account or book owner.
- The frontend opens directly into one book and keeps the global access key in `sessionStorage`.
- Existing records must remain usable after the schema expands.

## Requirements

- Do not introduce user accounts. Identity and access belong directly to each book.
- Keep an outer site-level password gate. Only visitors who enter the correct global password may enter the bookshelf and book-creation area.
- Reuse the configured `APP_ACCESS_KEY` for the outer site gate so deployments retain an administrator-controlled entry secret.
- Show available books on the protected home page as a bookshelf/list, without exposing their contents.
- Let a visitor select a book and unlock it with that book's password.
- Support an unbounded number of user-created task books, subject only to operational storage limits.
- Require a user-chosen password when each task book is created.
- Require book names to be unique after trimming and case folding so a person can identify the intended book unambiguously on the shared shelf.
- Rate-limit outer and per-book password attempts without terminating the shared service after failed attempts.
- Keep every book's todos, daily notes, date index, and preferences isolated from every other book.
- Provide a paginated way to discover or manage books so the interface and API do not load an unlimited collection at once.
- Preserve the current date navigation, todo editing, timeline, daily review, auto-save, responsive layout, and visual book language inside a selected book.
- Store passwords using a one-way password hash; never store or return plaintext passwords.
- Migrate current single-book data into a deterministic legacy/default owner so no existing business data is lost.
- Name the migrated legacy/default book `我的待办书` and initialize its per-book password from the configured `APP_ACCESS_KEY`.
- Convert the legacy/default password to the same one-way password-hash format used by newly created books during application schema initialization; do not persist the plaintext `APP_ACCESS_KEY` in PostgreSQL.
- Keep PostgreSQL schema initialization repeatable and additive.
- Start the application against the local PostgreSQL instance and verify the main user flows in a real browser.

## Acceptance Criteria

- [ ] A visitor must pass the outer site password gate before the bookshelf or book-creation controls are available.
- [ ] A new book can be created with a name and its own user-chosen password without creating an account.
- [ ] A duplicate book name is rejected case-insensitively with a visible validation error.
- [ ] The protected home page lists available books without revealing their todo or journal contents.
- [ ] Selecting a book prompts for that book's password before opening it.
- [ ] More books can be created without a product-defined fixed maximum.
- [ ] Book discovery/management is paginated with stable ordering and explicit page metadata.
- [ ] Correct credentials open only the selected book; incorrect credentials do not expose its data.
- [ ] Todos, daily notes, available dates, and preferences are scoped to the authenticated book.
- [ ] Record identifiers cannot be used to read, update, or delete records belonging to another book.
- [ ] Logging out clears client authentication state and returns to the appropriate entry screen.
- [ ] Existing single-book data is preserved and assigned to a documented legacy/default book during migration.
- [ ] The migrated default book can initially be unlocked with `APP_ACCESS_KEY`, while PostgreSQL contains no plaintext copy of that password.
- [ ] Existing in-book behavior and responsive styling continue to work.
- [ ] Schema initialization, build, automated checks, and browser acceptance checks pass against local PostgreSQL.

## Out of Scope

- User accounts, email identity, password reset by email, email verification, social login, and invitations.
- Roles, membership, or per-book permission levels.
- Opening one unlocked book without re-entering the password when switching to a different book.
- Book rename, book deletion, password change/reset, and active-session revocation.
- Arbitrary customization of the existing book's internal todo and journal layout.
