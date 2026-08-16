# Dashboard Page Overrides

The dashboard is the primary operational workspace.

## Desktop

- Use a bounded two-column shell with a 290px list sidebar.
- Keep list creation and logout anchored at the bottom of the sidebar.
- Show task progress as completed count plus a compact progress bar.
- Keep task edit/delete actions visible; do not rely on hover-only discovery.
- Place map and list settings in the task header.

## Mobile

- Stack the sidebar above the task workspace.
- Render lists as horizontally scrollable, minimum-width navigation items.
- Let long task titles wrap and move task actions to their own row.
- Keep the add-task action reachable near the lower edge without covering content.

## Empty states

- Explain the next action in one sentence.
- Offer one primary action only when a list is selected and has no tasks.
- Do not invent analytics or filler content to occupy empty space.

## Task states

- Incomplete tasks use an outlined completion control.
- Completed tasks use teal confirmation, strikethrough text, and a subtle muted surface.
- Mapped and synchronization states appear as compact text chips below the task title.
