---
version: alpha
name: Shiftborn Arena
description: A readable, tactical greybox access shell for a fast arena game.
colors:
  background: "#101820"
  surface: "#1b2931"
  surface-strong: "#23343c"
  line: "#617680"
  text: "#f1f6f2"
  muted: "#bfd0d1"
  accent: "#d5e58a"
  accent-ink: "#14201c"
  error: "#ffd0c7"
  focus: "#e7f5a5"
typography:
  sans:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
  display:
    fontFamily: "Arial Black, system-ui, sans-serif"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
rounded:
  DEFAULT: "2px"
spacing:
  page-max: "980px"
  compact-max: "620px"
components:
  button: {}
  input: {}
  frame: {}
  status: {}
---

# Shiftborn Arena design context

## Overview

### Creative North Star

A competition check-in station: clear arena identity, immediate entry action, and restrained technical labels. This is the prototype's greybox interface, so legibility and keyboard access set its limits.

### Product context and register

- **Audience and job:** Players entering quick play or a room and adjusting local preferences before a match.
- **Target market and locale:** No regional market is specified. The current UI is English; future localization must account for longer labels before translation is added.
- **Usage scene:** Desktop browser at 1280×720 and 821×462, with keyboard and pointer input. Shorter viewports may scroll vertically.
- **Register and signature:** Functional game shell with a two-line uppercase wordmark, lime entry action, and small monospace status labels.
- **Restraint:** Forms, errors, settings, and WebGL failure messages use familiar semantic controls and plain wording.
- **Anti-references:** Avoid production game art, downloaded fonts, decorative motion, and a dashboard-like density in this foundation task.
- **Token ownership:** This file records the durable intent. `apps/client/src/ui/styles.css` owns runtime CSS custom properties and component rules; the frontmatter colors mirror those custom properties directly. Updates to these tokens must update both places together.

## Colors

The page uses a dark navy background and one slightly lighter frame. The lime accent marks the main action and arena wordmark. White text and muted blue-gray secondary copy keep status legible. Error text uses the error token plus written guidance; focus uses a three-pixel outline. Forced-colors mode retains a visible system focus outline.

## Typography

System sans covers controls and prose. The installed Arial Black fallback stack gives the wordmark a compact game signature. Monospace is reserved for build status, room codes, and small labels. Controls keep ordinary casing; the wordmark and small structural labels use uppercase.

## Layout

The landing frame reaches at most 980px and uses two columns above 700px. At 700px and below it becomes one column. Compact state screens reach 620px; settings reach 820px and use two form columns above 700px. The page centers content when it fits and scrolls vertically when height is limited. There must be no horizontal scrolling at the target viewports.

## Elevation & Depth

A thin border, stronger top accent, and hard offset shadow distinguish the shell from the page. There are no blurred overlays or floating decorative surfaces.

## Shapes

Frames and controls use square-looking 2px corners. Dividers are one-pixel rules.

## Components

- **Primary button:** Lime with dark text; reserved for Play, Join, and recovery actions. Secondary buttons have a border and darker surface. Text buttons serve low-emphasis navigation.
- **Focus:** Three-pixel visible outline with offset. Enter submits the entry form. Escape leaves a secondary panel or cancels Connecting. Focus moves to the primary action after screen changes and returns to the originating button after panels close.
- **Busy and recovery:** Connecting uses explicit status text and Cancel. Timeout and close-code errors have written messages and a focused action. No spinner is required for this prototype.
- **Fields:** Visible labels, 46px minimum text-input and button height, inline written validation, and `aria-invalid` on invalid input. Settings show current numeric values beside ranges.
- **Disabled and active:** Disabled controls reduce opacity; button hover and active states shift slightly. Reduced-motion users receive effectively immediate transitions.
- **Data and imagery:** No imagery or icon system is used. Room codes remain text. The three-form strip is structural decoration and never the only carrier of information.

## Do's and don'ts

- **Do:** Keep the main entry action obvious at every supported viewport.
- **Do:** Pair color with words for errors and status; preserve keyboard focus visibility.
- **Don't:** Add production art or external assets to the greybox shell.
- **Don't:** Introduce a second visual token source without a documented mapping to the CSS variables.
