# Design: Book Unlock Entry and Daily Journal Workspace Redesign

## Boundaries

The frontend owns the locked-book presentation, transition state machine, workspace layout, Todo composition, and day-note editing. Existing API helpers remain the boundary for authentication, Todos, and day notes. The server-side day-note route and schema already present in the workspace are compatibility surfaces to verify, not an invitation to restructure the backend.

## UI State and Data Flow

```text
session access key
  -> AccessGate verifies key
  -> locked / error or unlocking
  -> lock animation
  -> cover animation
  -> App stores key and loads Todos + day notes
  -> daily workspace renders derived unscheduled/scheduled/completed groups
  -> Todo mutations update API then local state
  -> summary/goals edits save through day-note API
```

Authentication failures clear the stored key and return to the gate. Other request failures stay in context and show a concise synchronization message.

## Component Shape

- `AccessGate`: owns `locked`, `unlocking`, and `opening` presentation states, validation feedback, and hand-off timing.
- `App`: owns authenticated server state and composes the daily workspace.
- Small Todo/timeline/review components remain colocated while they are specific to this single workspace; extract only when reuse or complexity justifies it.
- Existing legacy book/template components can remain unused for compatibility, but the primary `App` route must not expose the old mode switcher.

## Layout

- Desktop workspace: paper surface with `grid-template-columns: minmax(260px, 30%) 1fr` or a visually equivalent 30/70 split.
- Left column: `grid-template-rows: minmax(0, 3fr) minmax(0, 7fr)`.
- A subtle spine/gutter separates the working areas without creating nested cards.
- Mobile: one column in semantic reading/workflow order.

## Motion and Accessibility

- Lock opens before the cover rotates.
- Wrong-key motion is short and non-blocking.
- Focus stays usable throughout the gate; inputs and icon buttons have accessible names.
- `prefers-reduced-motion` collapses animation durations.
- Stable dimensions prevent lock, loading text, and buttons from shifting the layout.

## Compatibility and Persistence

- Access-key headers and session storage remain unchanged.
- Todo payload mapping remains centralized in `lib/api.ts`.
- Day notes use the existing date-keyed API already in the workspace. The implementation must verify its SQL bootstrap, route registration, validation, and frontend save behavior together.
- No migration rollback is performed because the workspace changes are existing user/previous-session work and may already hold data.

## Risks and Rollback

- Animation timers can hand off before the visual transition completes. Browser tests should assert the ordered states by visible UI markers.
- Fixed-height book layouts can clip on short or narrow viewports. Use responsive min/max constraints and test both width and height.
- Debounced day-note saves can lose the latest edit on navigation. Verify explicit blur/save behavior or a reliable debounced flush.
- If the redesign fails, the rollback boundary is the UI entry/workspace files and browser test updates; database state must not be destructively rolled back.

