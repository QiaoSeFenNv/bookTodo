# Book Unlock Entry and Daily Journal Workspace Redesign

## Goal

Turn the current Todo frontend into one continuous experience: a visibly locked, dimensional book accepts the existing access key, unlocks and opens, then reveals a focused daily-record workspace. The result should feel light, refined, and book-like while remaining efficient for repeated daily use.

## Background

- Source requirement: the final plan recorded in Codex session `019f9e25-acf7-7dd1-83af-a7994ad341d6` under the title "书本解锁入口与日记录工作台重设计".
- The user approved that final plan in a later turn with `Implement the plan.` and repeated the implementation request in the current session.
- The existing React application already provides access-key verification, Todo CRUD, scheduled Todo fields, and responsive UI foundations.
- The workspace contains a partial implementation of this redesign. It must be audited and completed rather than discarded.

## Requirements

### Unlock Entry

- Use the explicit state flow `locked -> unlocking -> open`.
- In `locked`, show a centered 3D book with an integrated access-key input and a visible padlock.
- A wrong key must keep the user on the entry view, show a concise error, and trigger only a restrained book or lock shake.
- A correct key must first animate the shackle opening, then animate the cover opening, then reveal the workspace.
- Preserve the existing access-key verification behavior and session storage semantics.

### Book Visual

- The first viewport must read immediately as a locked book, not a login card.
- Use perspective, a cover, spine, page edges, restrained embossing or line detail, and shadow to establish volume.
- Use warm paper white and light ivory with soft ink, desaturated blue-green, and limited gold accents.
- Avoid a heavy dark-brown vintage palette, excessive gradients, and nested card stacks.
- Respect reduced-motion preferences.

### Daily Journal Workspace

- Replace the old list/template/time-block switching experience with one daily workspace.
- On desktop, use an approximately 30/70 left/right split.
- Within the left column, use an approximately 3/7 upper/lower split:
  - upper: short record points and unscheduled Todos;
  - lower: a chronological timeline of scheduled Todos.
- The right column must show completion progress, today's completed items, summary, goals, and notes-oriented writing space.
- Preserve Todo create, rename, toggle, delete, and schedule workflows.
- Keep the workspace visually unframed and book-like, with clear hierarchy and restrained density.

### Responsive Behavior

- Constrain the entry book to the available viewport without cropping the lock or form.
- Reduce the cover-opening transform on narrow screens where necessary.
- Below the existing mobile breakpoint, stack content in this order: short records, timeline, completion/review and writing fields.
- No horizontal scrolling, incoherent overlap, clipped controls, or text overflow on desktop or mobile.

### Compatibility

- Keep existing access-key and Todo API contracts compatible.
- Do not introduce a new UI framework or heavy 3D dependency; continue using React, CSS, Framer Motion, and the existing icon library.
- Work with the existing day-note persistence code already present in the workspace; do not remove or reset user-authored changes.

## Out of Scope

- Account registration, multi-user auth, or access-key protocol changes.
- A new template mode system or restoration of the old A/B/C switcher in the redesigned workspace.
- A heavy 3D/book-rendering engine.
- Broad backend or database refactoring unrelated to daily-note persistence already present.
- Marketing or landing-page content.

## Acceptance Criteria

- [x] The unauthenticated first view is unmistakably a locked, dimensional book with cover, spine, page-edge, lock, and shadow cues.
- [x] Wrong-key feedback does not navigate away and produces a restrained shake plus an accessible error message.
- [x] Correct authentication visibly opens the lock before the cover opens and the workspace appears.
- [x] The desktop workspace uses an approximately 30/70 main split and 3/7 left-column split.
- [x] The workspace supports short Todo capture, timeline scheduling, Todo completion/edit/delete, completion review, summary, goals, and notes-oriented writing.
- [x] The old template switcher and list/time-block mode switching are absent from the primary experience.
- [x] At mobile width the workspace becomes a readable single column with no horizontal overflow or overlap.
- [x] Reduced-motion mode avoids long or disorienting transitions.
- [x] Frontend and backend TypeScript builds pass.
- [x] Automated browser validation covers wrong-key feedback, correct unlock/open flow, core Todo actions, layout proportions, persistence fields, and desktop/mobile overflow.

## Technical Notes

- Existing partial files include `apps/web/src/App.tsx`, `apps/web/src/components/auth/AccessGate.tsx`, `apps/web/src/styles/global.css`, `apps/server/src/routes/day-notes.ts`, and corresponding SQL/API changes.
- These files predate this task's implementation phase in the current session and must be treated as existing work to review and complete.
