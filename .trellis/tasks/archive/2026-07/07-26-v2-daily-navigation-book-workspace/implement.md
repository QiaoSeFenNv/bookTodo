# Implement: V2 Daily Navigation and Book Workspace Polish

## Execution Checklist

- [x] Add `todos.date_key` through both schema bootstrap paths and migrate V1 rows additively.
- [x] Extend Todo types, mapping, list/create validation, queries, and response contracts with date support.
- [x] Add authenticated `GET /api/days` using the Todo/non-empty-journal union query.
- [x] Add frontend date utilities and date-aware API client functions.
- [x] Refactor authenticated bootstrap into availability-index loading plus gated per-date detail loading.
- [x] Guard asynchronous note saves and detail loads against date-switch races.
- [x] Add previous/next buttons, keyboard arrows, and requested left/right swipe directions.
- [x] Implement and integrate the accessible custom `TimePicker` for start/end selection.
- [x] Strengthen the authenticated view's opened-book pages, gutter, paper edges, and responsive behavior.
- [x] Update browser/API checks for migration compatibility, date index behavior, no-detail reads on empty dates, existing-date reads, gesture direction, picker keyboard behavior, and visual/layout regressions.
- [x] Run full build, DB initialization, API checks, Playwright screenshots, and final Trellis verification.

## Validation Commands

```powershell
npm run build
npm run db:init
npm run check:ui
```

## Browser/API Assertions

- Seed distinct records for yesterday and tomorrow, then prove swipe left shows yesterday and swipe right shows tomorrow.
- Capture network requests and prove a date absent from `/api/days` does not trigger `/api/todos?date=...` or `/api/day-notes?date=...`.
- Prove a date present in `/api/days` triggers both detail reads and displays only that date's content.
- Prove the time picker opens by keyboard, selects a value, closes with Escape, and submits `HH:mm` values accepted by the API.
- Check desktop/mobile width, popover bounds, page/gutter cues, text clipping, and reduced motion.
- Restore pre-test notes and delete only timestamp-prefixed test Todos in `finally`.

## Risky Files and Rollback Points

- `apps/server/src/db.ts`, `apps/server/src/sql/001_init.sql`: additive schema only; never drop existing V1 data.
- `apps/server/src/routes/todos.ts`: preserve optional backward-compatible query behavior.
- `apps/web/src/App.tsx`: date transition and async revision guards are the highest-risk logic.
- `apps/web/src/components/todo/TimePicker.tsx`: accessibility and popover layout.
- `scripts/check-ui.mjs`: network assertions must distinguish the index request from forbidden detail requests.

## Review Gates

- Confirm the V1 branch and tag still resolve to `9e97828`.
- Confirm V2 code and task artifacts exist only on branch `V2`.
- Confirm empty-date navigation is observable without detail requests.
- Confirm cross-date data never leaks between workspaces.
- Confirm all changed API/database contracts are reflected in Trellis specs before completion.
