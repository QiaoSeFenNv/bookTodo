# Component Guidelines

> How components are built in this project.

---

## Overview

<!--
Document your project's component conventions here.

Questions to answer:
- What component patterns do you use?
- How are props defined?
- How do you handle composition?
- What accessibility standards apply?
-->

(To be filled by the team)

---

## Component Structure

<!-- Standard structure of a component file -->

(To be filled by the team)

---

## Props Conventions

<!-- How props should be defined and typed -->

(To be filled by the team)

---

## Styling Patterns

<!-- How styles are applied (CSS modules, styled-components, Tailwind, etc.) -->

(To be filled by the team)

---

## Accessibility

### Controlled Time Picker

Use `components/todo/TimePicker.tsx` instead of a native `input[type="time"]` in the daily timeline. Its public contract is:

```typescript
type TimePickerProps = {
  label: string;
  value: string; // HH:mm
  onChange: (value: string) => void;
  align?: "start" | "end";
};
```

- Keep the trigger dimensions stable and include the current `HH:mm` value in its accessible name.
- The popover is a labelled dialog containing separate hour and minute listboxes.
- Opening by click or `ArrowDown` focuses the hour list and scrolls both current values into view.
- Listboxes support `ArrowUp`, `ArrowDown`, `Home`, and `End`; `Escape` closes and returns focus to the trigger.
- Preserve every valid minute from `00` through `59`; do not round stored values to a visual interval.
- `align="end"` anchors the second picker inside narrow layouts. Browser checks must prove the popover remains within desktop and mobile viewports.

---

## Common Mistakes

<!-- Component-related mistakes your team has made -->

- Replacing the controlled picker with a browser-native time input, which reintroduces inconsistent rendering.
- Rendering only common five-minute increments and silently changing an existing arbitrary `HH:mm` value.
- Opening a list at `00` instead of scrolling the selected value into view.
