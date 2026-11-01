# Screenshots

A tour of the app without running it, in the order you meet it. Desktop shots are 1440 × 900, phone shots 390 × 844,
theme Paper unless noted. The data is a sample: three weeks of work days with today still running. How each screen
behaves is in [SPEC.md](../SPEC.md); sizes and rules in [DESIGN.md](../DESIGN.md). Regenerate everything here with
`npm run screenshots` (the captions below are hand-written).

## Demos

| Main screen | Summary | Phone |
| --- | --- | --- |
| ![Switching activities, the long-press popup and the profile switcher](demo-main.webp) | ![Summary: day, week grouped by Focus, month and the period picker](demo-summary.webp) | ![Phone: tiles, activity sheet, More menu and Summary](demo-phone.webp) |
| Tap to switch, hold for the activity popup, open the profile switcher | Day → Week → Group by Focus → open a day → Month → pick a range | Two tiles per row, bottom sheets, ⋯ More, Summary |

## 1. Main screen

One big button per activity, like a chess clock: tap one to start it, tap another to switch, tap the running one to
stop. The header shows today's total and what is running; the timeline and group totals sit at the bottom.

| | |
| --- | --- |
| ![Tiles](01-main-screen/1-tiles.png) **Tiles** (default): share of today, running chip, total, progress bar (toward the target when one is set) | ![Rows](01-main-screen/2-rows.png) **Rows**: the same elements in a centered column |
| ![Circles](01-main-screen/3-circles.png) **Circles**: a progress ring around each circle | ![Graphite theme](01-main-screen/4-graphite-theme.png) **Graphite**, one of 7 built-in themes |
| ![Empty day](01-main-screen/5-empty-day.png) **Empty day**: every activity is a button, with the "Ready to start the day" hint | |

## 2. Popups

All popups share one dialog: a centered card on wide screens, a bottom sheet on a phone.

| | |
| --- | --- |
| ![Activity popup](02-popups/1-activity-long-press.png) **Hold an activity**: today's sessions in time order, correct the timeline ("active since …", "stop all since …") | ![Switch profile](02-popups/2-switch-profile.png) **Switch profile**: each profile's status, a warning while something runs |
| ![Delete session](02-popups/3-delete-session.png) **Delete a session** asks first | ![Reset day](02-popups/4-reset-day.png) **Reset day** says what happens to the running activity |
| ![Close app](02-popups/5-close-app.png) **Close app** | |

## 3. Summary

One page per period (Day, Week, Month, Custom): the period card with a folded calendar, figure tiles, then the
timeline or per-day rows, the share, and the day's sessions.

| | |
| --- | --- |
| ![Day](03-summary/1-day.png) **Day**: timeline, share with targets, sessions with idle gaps | ![Week](03-summary/2-week.png) **Week**: every day on a shared clock axis, average start and end dashed |
| ![Week grouped by Focus](03-summary/3-week-grouped-by-focus.png) **Group by a category**: blocks, rows and share by option; tap a day or an option for details | ![Month](03-summary/4-month.png) **Month**: the calendar becomes a heatmap; empty days collapse |
| ![Period picker](03-summary/5-period-picker.png) **Period picker**: opens in place, tap the first and last day or a quick range | ![Empty period](03-summary/6-empty-period.png) **Empty period** |

## 4. Settings

| | |
| --- | --- |
| ![Categories](04-settings/1-categories.png) **Categories**: dimensions (Focus, Company) with options; they split time in the Summary | ![Option color](04-settings/2-option-color-16-slots.png) **Option color**: one of 16 theme slots |
| ![Activities with categories](04-settings/3-activities-with-categories.png) **Activities**: one picker per dimension | ![Activity colors](04-settings/4-activity-colors-16-slots.png) **Activity colors**: 16 slots that follow the theme |
| ![Week start](04-settings/5-day-week-start.png) **Day**: reset hour, week start, minimum switch | |

## 5. Phone

| | | |
| --- | --- | --- |
| ![Main](phone/1-main-tiles.png) Main screen | ![Activity sheet](phone/2-activity-sheet.png) Activity popup as a sheet | ![More menu](phone/3-more-menu.png) ⋯ More: reset, full screen, close |
| ![Summary day](phone/4-summary-day.png) Summary, Day | ![Summary week](phone/5-summary-week.png) Summary, Week | ![Categories](phone/6-settings-categories.png) Settings, Categories |
