# V2 Daily Navigation and Book Workspace Polish

## Goal

Improve the V2 daily journal experience on top of the V1 baseline: make time selection feel intentional and polished, add directional day navigation, and make the authenticated workspace feel like an opened book rather than a floating application panel.

## Confirmed Facts

- V1 is recorded in Git commit `9e97828`, branch `V1`, and annotated tag `V1`.
- The current branch is `V2`, created from the V1 commit.
- `daily_notes` already has a `date_key` and stores `summary`, `goals`, and `notes`.
- `todos` currently has no date column. `GET /api/todos` returns the shared Todo collection, and the frontend always loads that collection together with today's day notes.
- The current timeline uses native `input[type=time]`, which is visually inconsistent across browsers and difficult to style as a refined control.
- The V1 workspace is a paper-toned book surface, but the authenticated page still reads as a single framed panel rather than a clearly opened two-page book.

## Requirements

### Time Selection

- Replace the raw native time presentation with a polished, accessible custom time picker or equivalent controlled UI.
- Preserve `HH:mm` values and existing validation that the end time must be later than the start time.
- The control must work on desktop and mobile, support keyboard focus, and expose an accessible name and selected value.
- The picker must not cause horizontal overflow or shift the timeline layout when opened.

### Directional Day Navigation

- Support touch/pointer horizontal swipes and explicit keyboard/button equivalents.
- Per the requested interaction, swiping left moves to yesterday and swiping right moves to tomorrow.
- The visible date, daily writing fields, and any date-scoped content must reload when the day changes.
- Day changes must be bounded only by the data model's supported date range; no hard-coded “today only” guard should block yesterday/tomorrow.
- Load a lightweight index of dates that contain Todo or non-empty journal data when the authenticated workspace starts.
- If a target date is absent from that index, render an empty workspace locally and do not issue Todo/day-note detail requests for that date.
- If a target date is present, fetch its Todo and day-note details from the database-backed APIs.

### Opened-Book Workspace

- After unlock, the authenticated workspace must visually read as an open book: two page surfaces, a central gutter/spine, page edges or layered paper cues, and a stable book-like background.
- Preserve the V1 workspace's readable 30/70 information hierarchy unless a responsive layout requires a mobile single column.
- Keep controls useful for daily work; visual framing must not become nested decorative cards or reduce available writing space.
- The book background must remain responsive, avoid clipping, and respect reduced-motion preferences during day transitions.

### Date-Scoped Workspace

- Each date has an independent workspace containing Todos, timeline items, summary, goals, and notes.
- Add a date key to Todo persistence and filter Todo list/create operations by the selected date.
- Migrate existing Todo rows to the local current date when the V2 schema is initialized, preserving all existing records.
- Switching dates must not leak Todo or timeline records from another day.

## Out of Scope

- Cross-day drag-and-drop, recurring tasks, calendar/month views, or timezone preference settings.

## Acceptance Criteria

- [x] V2 changes are made on branch `V2`; V1 commit/tag remain unchanged.
- [x] Time selection is visually custom/polished, keyboard accessible, mobile usable, and preserves validation.
- [x] Left swipe goes to yesterday and right swipe goes to tomorrow, with an equivalent keyboard/button path.
- [x] The selected date and its persisted day-specific data update without a full page reload.
- [x] An indexed date loads its Todo and journal details; a non-indexed date renders empty without detail API requests.
- [x] The authenticated view visibly reads as an opened book with a gutter/spine and layered paper background.
- [x] Desktop and mobile have no horizontal overflow, clipped picker, or overlapping content.
- [x] `npm run build` and the updated browser/API checks pass.

## Key Decisions

- The complete workspace is date-scoped, not only its writing fields.
- Existing Todo records migrate to the current date during V2 schema initialization.
- `GET /api/days` returns the union of Todo dates and dates with non-empty journal text.
- The frontend uses that index as the detail-read gate. Empty dates remain local until the user creates content.
