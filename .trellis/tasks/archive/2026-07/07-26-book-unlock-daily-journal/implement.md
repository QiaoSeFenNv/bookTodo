# Implement: Book Unlock Entry and Daily Journal Workspace Redesign

## Execution Checklist

- [x] Audit the partial redesign against the PRD and identify missing or inconsistent behavior.
- [x] Complete the locked-book state flow, wrong-key feedback, ordered unlock/open motion, and reduced-motion behavior.
- [x] Complete the daily workspace data grouping, Todo interactions, timeline scheduling, completion review, and day-note writing flow.
- [x] Refine desktop 30/70 and left-column 3/7 layout plus mobile single-column behavior.
- [x] Remove primary-path dependencies on the legacy template switcher/mode experience.
- [x] Verify existing day-note SQL, API route, client mapping, validation, and error handling without unrelated backend refactoring.
- [x] Update `scripts/check-ui.mjs` to exercise the redesigned UX and layout contracts.
- [x] Run full builds and browser checks; inspect desktop and mobile screenshots.
- [x] Run a final Trellis quality check against the complete task scope.

## Verification Results

- `npm run build`: passed after the final visual and responsive adjustments.
- `npm run db:init`: passed on the first schema attempt.
- `npm run check:ui`: passed with desktop width `1440/1440`, main split `0.299997`, left upper split `0.3`, and mobile width `390/390` with ordered non-overlapping sections.
- Visual review: `desktop-locked.png`, `desktop-workspace.png`, and `mobile-workspace.png` show readable controls, no clipping, and the intended light paper / blue-green / gold direction.

## Validation Commands

```powershell
npm run build
npm run check:ui
```

Supplement browser validation with targeted API checks if `check:ui` cannot prove day-note persistence or invalid input behavior.

## Risky Files and Rollback Points

- `apps/web/src/App.tsx`: central authenticated state and all workspace actions.
- `apps/web/src/components/auth/AccessGate.tsx`: timer ordering and authentication hand-off.
- `apps/web/src/styles/global.css`: responsive layout and visual regressions.
- `apps/server/src/routes/day-notes.ts` and `apps/server/src/sql/001_init.sql`: persistence compatibility; do not run destructive rollback.
- `scripts/check-ui.mjs`: test cleanup must only remove timestamped test data.

## Review Gates

- Confirm no acceptance criterion depends only on screenshots when a DOM/API assertion is possible.
- Confirm desktop and mobile document width equals viewport width.
- Confirm the old template switcher is absent from the authenticated primary path.
- Confirm no secrets or local environment values are added to tracked files.
