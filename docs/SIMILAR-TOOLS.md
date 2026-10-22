# Similar tools

Web research from 2026-10-21 for tools with the same or a similar interaction model: tap an activity to start it,
tapping another switches to it, only one runs at a time, and past times can be corrected. The list is ordered **from
most to least similar** to this project. Descriptions come from each tool's own listing or docs, plus third-party
summaries. Nothing was installed or tested.

**Takeaway:** no tool found combines all of the following:
- a self-hostable or static web page
- a touchscreen / wall-display layout
- "active since…" backdating that takes the time away from other activities
- offline storage per device

The closest matches are native mobile apps (TickTappy, aTimeLogger, Simple Time Tracker).

| # | Tool | Platform / model | Why it is similar | Main differences |
|---|---|---|---|---|
| 1 | [TickTappy](https://apps.apple.com/app/ticktappy/id6757327485) | iPhone, iPad, Mac, Watch; free + premium (sync) | Colored tag buttons: tap to start, **tap again to stop**, starting another tag **stops the running one**. **Start a timer in the past** (e.g. 30 min ago), quick time adjustment after start/stop, editing past entries, archiving tags without losing history, day/week summaries. Offline, no account. | Apple only; not a web page; no wall-display mode |
| 2 | [aTimeLogger](https://apps.apple.com/app/id576718804) | iOS (App Store listing) | Starts and stops an activity with **one tap**; pause/resume; optional simultaneous activities; reports. | Native app; several activities can run at once (optional); not a kiosk layout |
| 3 | [Simple Time Tracker](https://f-droid.org/en/packages/com.razeeman.util.simpletimetracker) ([source](https://github.com/Razeeman/Android-SimpleTimeTracker)) | Android + Wear OS; open source (GPL-3.0) | Starts activities with **one click** from a grid of activity buttons; record history, statistics, backups, home-screen widgets; a record can be divided and its activity changed. | Android only; not a web app |
| 4 | [Takt – Time Tracking](https://apps.apple.com/app/id6758586452) | iOS | **One tap** to start, stop or **switch** activities; the start time of a running entry can be moved. | Apple only; segmented entries can't be adjusted after a while |
| 5 | [ATracker PRO](https://apple.co/32b8qMr) | iOS | Starts and stops task tracking with **one tap**; reports per task. | Native app; switching and pause behavior not described |
| 6 | [Timeular](https://timeular.com/) / [TimeFlip2](https://www.capterra.co.uk/software/1061612/timeflip2) | Physical 8- or 12-sided tracker die + app; subscription | Same "one active activity" idea as a **physical device**: flip the die to switch activity, turn it off or double-tap to stop. Forgotten time is fixed in a calendar-like editor. | Needs hardware; cloud account; no on-screen buttons ([comparison](https://www.timedoctor.com/blog/timeular-vs-timeflip/)) |
| 7 | [Clockify Kiosk](https://clockify.me/features/kiosk) | Web, on a shared device; free feature of Clockify | A **shared-device / kiosk** web page: people clock in and **switch projects or tasks** and breaks; reports in Clockify ([help](https://clockify.me/help/track-time-and-expenses/clock-in-and-out-via-kiosk)). | Built for teams (PIN/QR sign-in); cloud only; no per-activity button board |
| 8 | [TimeTagger](https://github.com/almarklein/timetagger) | Web app; open source (GPL-3.0), self-host or hosted | Web-based, with an **interactive timeline** for editing records; tags instead of projects; daily/weekly/monthly **targets**; reports (PDF/CSV); Pomodoro mode ([overview](https://www.linuxlinks.com/timetagger-web-based-time-tracking-solution/)). | Python server; not a big-button touch board; no tap-to-switch |
| 9 | [Timery](https://apps.apple.com/app/id1425368544) for [Toggl Track](https://toggl.com/track/) | iOS/Mac client for Toggl (cloud) | **Saved timers started with one click**; editing and splitting entries; in Toggl you drag a block to change its start or stop time ([guide](https://clockk.com/alt/does-toggl-have-a-timer)). | Cloud account; desktop/phone UI; free tier is limited |
| 10 | [MarsiaLi/tracker](https://github.com/MarsiaLi/tracker) | Static web page (vanilla JS, Bootstrap), localStorage mode | Closest **tech stack**: plain JS, browser storage, one card per activity with start/stop and an hours total. | No automatic switching, per-day totals view or backdating |
| 11 | [wk-timer](https://github.com/silas229/wk-timer) | Offline PWA (Next.js), IndexedDB | Similar **storage approach** (offline, IndexedDB, survives reloads). | A start/stop/lap stopwatch, not an activity board |
| 12 | [Kimai](https://www.kimai.org/), [solidtime](https://www.solidtime.io/), [Super Productivity](https://super-productivity.com/) | Open-source web/desktop trackers | General time tracking with projects/tasks, timers and reports; self-hostable or local-first ([comparison](https://super-productivity.com/blog/best-open-source-time-tracking-apps-2026/)). | Project/billing oriented; no one-tap activity board |
| 13 | [Chess.com Chess Clock](https://f-droid.org/packages/com.chess.clock/), [GNOME Chess Clock](https://apps.gnome.org/Chessclock/) | Android / Linux | The **chess-clock interaction** this app is modelled on: big buttons, one tap hands the clock to the other side. | Two players, counts down, no logging, totals or history |

## Ideas worth borrowing
- **TickTappy:** "pin" a timer so it keeps running alongside the active one; a quick-adjust prompt right after a switch;
  a "jump back 5 min" shortcut.
- **Simple Time Tracker:** divide a record into two parts.
- **TimeTagger:** daily/weekly/monthly targets; CSV/PDF export.
- **Clockify Kiosk:** one shared screen for several people (per-user sign-in).
