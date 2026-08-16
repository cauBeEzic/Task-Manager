# Field Task Manager Design System

This is the source of truth for the application UI. Page-specific files in `pages/` override these rules only where stated.

## Product direction

- Product type: offline-first field operations and logistics productivity tool
- Style: functional minimalism with compact, data-aware workspace layouts
- Priorities: outdoor legibility, fast scanning, explicit sync feedback, keyboard access, and touch-friendly controls
- Tone: calm, dependable, and operational—not playful or decorative

## Color tokens

| Role | Light | Dark | Usage |
|---|---|---|---|
| Primary | `#2563EB` | `#60A5FA` | Navigation, primary actions, focus |
| Primary strong | `#1D4ED8` | `#93C5FD` | Active text and hover states |
| Accent | `#F97316` | `#FB923C` | Location and exceptional field actions |
| Success | `#0F766E` | `#5EEAD4` | Completed and synchronized states |
| Danger | `#DC2626` | `#FCA5A5` | Destructive actions and failures |
| Canvas | `#F4F7FB` | `#0B1320` | Application background |
| Surface | `#FFFFFF` | `#111D2E` | Panels, cards, inputs |
| Ink | `#10233F` | `#F3F7FC` | Headings and high-emphasis text |
| Muted | `#61718A` | `#A6B4C7` | Supporting copy and metadata |
| Border | `#DBE4EF` | `#26364B` | Structure and separation |

Orange is not a generic CTA color in the product UI. Reserve it for mapping, warnings, and location-specific emphasis. Purple or pink AI-style gradients are prohibited.

## Typography

Use the platform UI stack: `Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.

The application is offline-first, so core typography must not depend on a remote font request. Headings use the same family with heavier weight, tight letter spacing, and sentence case. Body text stays at 16px or larger for form controls.

## Shape, depth, and motion

- Control radius: 10px
- Card radius: 14–16px
- Shell radius: 24px on desktop, edge-to-edge on mobile
- Shadows: low-contrast and reserved for shells, floating menus, and primary floating actions
- Transitions: color, border, opacity, and shadow only; 150–220ms
- Never scale interactive elements on hover
- Disable non-essential motion with `prefers-reduced-motion`

## Interaction rules

- Every control has a visible keyboard focus state.
- Icon-only controls require an accessible name; prefer icon plus label for primary actions.
- Minimum control height is 42px; core form controls are 48–52px.
- Forms use persistent labels, useful autocomplete/input modes, and explicit submit actions.
- Offline, queued, retrying, and failed states use both text and color.
- Destructive actions use red and remain visually distinct from primary actions.
- The browser back button and existing Angular routes must remain predictable.

## Responsive rules

- `375px`: single-column mobile layout, horizontally scrollable list navigation, wrapped task titles
- `768px`: stacked workspace with compact header and full-width task area
- `1024px+`: sidebar + content workspace shell
- `1440px`: content remains bounded; do not stretch task rows beyond comfortable scan width
- No horizontal page overflow at any supported breakpoint

## Accessibility checklist

- Sequential headings and one clear page-level heading
- Skip link to routed content
- Semantic labels for all fields
- Keyboard access for task completion, menus, navigation, and actions
- 4.5:1 minimum text contrast in light and dark themes
- Color is never the only state indicator
- No emoji or mixed icon families; use consistent inline outline SVGs

## Anti-patterns

- Decorative dashboards or invented metrics
- Card-on-card nesting without hierarchy
- Remote font dependencies in the offline shell
- Hidden task actions that are unavailable on touch devices
- Truncated task titles on narrow screens
- Static or misleading sync indicators
