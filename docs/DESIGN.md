# Design guide

How screens are built, so changes without a new design still look like one app. Behaviour, data and texts are in
[SPEC.md](SPEC.md); colors and themes in SPEC §16. Screenshots of every screen: [screenshots/](screenshots/README.md).

Reference mockups (clickable prototypes with a Tweaks panel for theme, layout and state): the design canvas
"Activity Tracker — Main screen", rows titled **HANDOFF**
(https://claude.ai/artifact/4DencmtTWUnxd6KUSSSCbu). Rows above HANDOFF are earlier explorations.

## Colors

- Every color comes from a theme token or a slot (`var(--surface)`, `var(--slot-3)` …); nothing is hard-coded.
- Accent = slot 1 (primary buttons, checkboxes, focus ring, heat shading); danger = slot 5.
- Text on a slot color (active button, timeline block, primary button) is `onAccent`; its tracks are `onAccent` at 28 %.
- "Not set" (categories) is `muted` at 35 % (`var(--notset)`).
- Text reaches 4.5:1 in every built-in theme; check new colors with `contrast()` in `src/theme.ts`.

## Sizes

| Element | Rule |
| --- | --- |
| Page header (every page) | one header for all pages (`AppHeader`, SPEC §6.3): `surface`, 1 px `line` bottom border, padding 14 × 28 px (10 × 14 px on a phone); left the profile button (Main) or a round 44 px back button on `chip` + page name 20 px semibold + "· \<profile>" muted; then Today, Now, clock and the round 44 px icon buttons; the open page's button filled `text` |
| Page controls | what a page used to put in its header goes to the top of its content (Summary period switcher, day editor stepper); new pages do the same and never add a second bar |
| Floating button | only "Back to top" (SPEC §6.4): 56 px round, accent + `onAccent` icon, shadow `0 4px 16px var(--shadow)`, 20 px from bottom-right; don't add others |
| Icon toggle | 44 px round, `chip` when off, `text` fill + `surface` icon when on (`aria-pressed`); always with a tooltip and `aria-label` |
| Note box | `chip`, radius 12 px, padding 12 × 16 px, 14 px semibold text, link or button on the right (privacy note) |
| Card | `surface`, 1 px `line` border, radius 16 px, padding 12 × 16 × 14 px; 12 px between cards; title 15 px semibold, hint 12 px muted on the right |
| Figure tile | card style; label 12 px muted, value 22 px mono semibold, sub-line 12 px muted |
| Main buttons | radius 22 px (tiles), 18 px (rows), round (circles) |
| Segmented control | `chip` track, padding 3 px, radius 12 px; items 38–40 px high, radius 9 px, 14 px medium; selected item on `surface` |
| Buttons | min 44 px high (40 px inside segmented controls and chips), radius 12 px; primary = accent + `onAccent`; danger = slot 5 fill; secondary = `chip` |
| Chips / pills | radius 999 px, 36–44 px high, 1 px `line` border, 13–15 px |
| Dialogs | see SPEC §18 |
| Max width | Summary and Settings 1240 px centered; main Rows 860 px |

Shared CSS classes for these: `.card`, `.card-head`, `.fig`, `.segmented` / `.seg`, `button.primary` /
`.secondary` / `.danger-fill` / `.pill`, `button.icon.round` (`.toggle` for icon toggles), `.note`, `confirmDialog()`
and `openModal()` in `src/ui/hooks.tsx`, `AppHeader` and `ScrollTop` in `src/ui/header.tsx`, `PrivacyNote` and
`LayoutSwitch` in `src/ui/about.tsx`.

## Type and numbers

- Geist for text: body 14–15 px; labels 11–13 px muted; uppercase labels 11–12 px with 0.06em tracking.
- Geist Mono with tabular figures for every number (`.num`), so ticking values never jitter.
- Durations: `8h 43m` in the Summary (`fmtHours`), `h:mm:ss` for live totals on the main screen (`fmtHMS`), `m:ss` /
  `h:mm:ss` for a running session (`fmtDur`), `1h 05m` / `12m` in short texts (`fmtHM`).
- Activity names are shown capitalized and in one line with an ellipsis (full name in the tooltip); option and
  dimension names are shown as typed.

## Touch and focus

- Every control is at least 44 px (40 px inside segmented controls and chips).
- Focus: 3 px ring, 2 px offset, visible on every control.
- Use real `button`, `input` and `label` elements; icon-only buttons get an `aria-label`.

## Breakpoints

- **760 px:** the main screen and Settings switch to the phone layout (`.hide-sm` / `.show-sm`, two tiles per row, the
  ⋯ More menu, 8-column swatch grid).
- **600 px:** the Summary and dialogs switch (two figure tiles per row, the 4th Share column and period sub-line
  hidden, dialogs become bottom sheets).
- Below them the page never scrolls sideways; wide content (Group by control) scrolls inside its own box.
