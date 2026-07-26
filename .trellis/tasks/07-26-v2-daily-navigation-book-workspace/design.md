# Design: V2 Daily Navigation and Book Workspace Polish

## Architecture and Boundaries

V2 keeps the V1 React/Fastify/PostgreSQL architecture. It adds one persisted Todo date, one availability-index endpoint, a date-aware workspace controller, an accessible custom time picker, and stronger open-book styling.

```text
unlock
  -> GET /api/days
  -> selected date = local today
  -> date absent: local empty workspace, no detail GETs
  -> date present: GET /api/todos?date=... + GET /api/day-notes?date=...

swipe / arrow / date button
  -> flush pending writing for old date
  -> calculate adjacent calendar date
  -> apply the same index gate
  -> animate the opened-book content in the requested direction
```

## Data Contracts

### Todo Schema

Add to both runtime `ensureSchema()` and `001_init.sql`:

```sql
date_key DATE NOT NULL DEFAULT CURRENT_DATE
```

Migration order is additive and data-preserving:

1. Add nullable `date_key` if absent.
2. Set existing null rows to `CURRENT_DATE`.
3. Set the default to `CURRENT_DATE` and enforce `NOT NULL`.
4. Add an index supporting `(date_key, scheduled_start, sort_order)`.

### Todo API

- `GET /api/todos?date=YYYY-MM-DD&status=...` filters by `date_key` when date is supplied.
- `POST /api/todos` accepts `date_key`; V2 frontend always supplies the selected date.
- Todo responses add `dateKey`.
- PATCH does not expose cross-day movement in this task.
- Existing callers without a date remain compatible, but the V2 workspace never uses the unfiltered list.

### Available Days API

`GET /api/days` returns:

```json
{ "dates": ["2026-07-25", "2026-07-26"] }
```

The sorted, unique list is the union of:

- `todos.date_key` values;
- `daily_notes.date_key` values where `summary`, `goals`, or `notes` is non-empty after trimming.

The endpoint requires the existing access key. It returns dates only, never detail payloads.

## Frontend State

- `selectedDate`: `YYYY-MM-DD`, initialized from the browser's local calendar date.
- `availableDates`: `Set<string>` from `/api/days`.
- `dayCache`: optional in-memory map of detail payloads already loaded during the session.
- `todos`, `summary`, `goals`, `notes`: the active selected-date projection.
- `dayDirection`: previous/next direction for the restrained page transition.

Before changing dates, flush a pending day-note save for the old date. Ignore stale detail responses by associating each load with its requested date or revision.

After create/delete/save changes whether a date contains content, refresh the lightweight date index. A newly created Todo or non-empty writing field may optimistically add the selected date before refresh.

## Gesture and Navigation Contract

- Swipe left (pointer ends at least 50px left of its start) -> previous calendar day.
- Swipe right (pointer ends at least 50px right of its start) -> next calendar day.
- Ignore swipes that start inside input, textarea, button, menu, or listbox controls.
- `ArrowLeft` -> previous day; `ArrowRight` -> next day when focus is not in an editable control.
- Visible icon buttons provide previous/next day alternatives with tooltips and accessible labels.
- Reduced-motion mode changes content immediately without page translation.

## Time Picker

Create a controlled `TimePicker` component using the existing Lucide icons and no new UI dependency.

- Trigger is a stable icon-and-value button, not native `input[type=time]`.
- Popover contains scrollable hour and minute listboxes, preserves all `HH:mm` values, supports mouse/touch, Escape, and keyboard focus.
- Click-away closes the popover; choosing a value calls `onChange` and keeps a clear selected state.
- Start and end pickers reuse the same component and retain the existing `isValidTimeRange` validation.
- Popover positioning must stay within the journal/timeline viewport on desktop and mobile.

## Opened-Book Visual

- Keep the 30/70 content hierarchy while rendering distinct left and right page surfaces.
- Strengthen the central gutter with symmetric inner shadows and a narrow spine highlight.
- Add layered page edges beneath the book and subtle outer page curvature.
- Place date navigation in the book header; day content transitions inside the book, not by replacing the whole scene.
- Mobile remains one column with a horizontal divider in place of the gutter.

## Compatibility and Rollback

- V1 is preserved by branch/tag at commit `9e97828`.
- V2 migrations are additive; rollback means switching to branch/tag V1, not dropping V2 columns.
- Existing rows remain accessible after migration and are assigned to the migration date.
- Old optional Todo query behavior remains available for compatibility.

## Risks

- `CURRENT_DATE` follows the PostgreSQL session timezone. Local browser dates remain explicit on all new V2 requests; migration date should be documented as server-current date.
- A swipe during an in-flight save/load can show stale data unless requests are date/revision guarded.
- Custom listboxes can regress accessibility; browser tests must cover keyboard opening/selection and Escape.
