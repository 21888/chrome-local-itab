# Local month calendar validation

## Scope

An initially collapsed native `details` date viewer beneath the main clock date. It belongs to the existing ClockComponent singleton. No storage keys, configuration fields, permissions, network, calendar events, reminders, date selection, independent timer or card were introduced.

The pure helper uses Gregorian UTC date-only arithmetic with `setUTCFullYear`; the today tuple comes from local Date fields. Navigation is month-based (day 1) and bounded to January 1 through December 9999. Out-of-month cells are blank. Locale week data is feature-detected (`getWeekInfo` / `weekInfo`, firstDay 1–7); fallback is Sunday for English and Monday for Simplified Chinese and unknown/other locales.

## Automated coverage

- Leap years 1900/2000/2024/2025, all month lengths and weekday offsets, 4–6 rows, years 1/99/100/9999 and bounded navigation.
- Local-day tuples and UTC layout in UTC, New York, Sydney, Kathmandu, Kiritimati and Honolulu, including DST transitions.
- Real shipped clock methods exercised in a DOM/event model: initial collapse; no closed table work; stable table rows within one date/month/locale; stable controls/focus; browsed-month retention across midnight and configuration changes; fresh Today/reopen; locale labels; today semantics; Escape; hide/show; dashboard-double-click exclusion; held activation/composition guard; one existing timer, detached-host inertness, edge-button focus recovery, and blocked I/O.
- Actual table caption, full weekday accessible labels with `scope=col`, plain noninteractive day cells, `aria-current=date` only on today, explicit-navigation-only polite status.
- Explicit runtime inventory and HTML script/CSS order. Full project verification: 491 Node tests and 19 Python packaging tests pass; all JavaScript syntax checks pass and 15 JSON files parse. Runtime ZIP inventory is 60 files.

## Native browser acceptance — 2026-10-09

Official normal-sandbox Chrome for Testing 155.0.8059.39 on cloud Linux loaded
the exact unpacked 60-file candidate ZIP. All runtime hashes matched the
integrated source. Actual interactions verified:

- Initial collapse; Tab/Enter opening; Previous/Next with retained button focus;
  Today returning to October 2026 and day 9 visibly outlined.
- Escape closing and focusing the visible summary; reopening at the current
  month; double-clicking a day leaving the dashboard visible.
- Hiding Clock Module through Settings removed clock/calendar on a retained
  dashboard; reenabling returned with the calendar collapsed.
- Clarity light/dark at 1188- and 514-pixel native outer window widths; Graphite,
  Folio and Atelier light at 514. Open calendars stacked below the intro and
  above the full-width search without observed overlap or squeezing.
- English Sunday-first and a fresh Simplified Chinese profile showing
  `2026年10月`, Monday first and Sunday last, with the current day outlined.

The normal window manager clamped smaller resize requests to 510 pixels.
Actual 400/320-pixel widths therefore remain untested. Outer window sizes are
not measured CSS viewports. [Current exact-crop screenshots and runtime hashes](screenshots/month-calendar/capture-metadata.json)
record the rendered light-wide and dark-narrow states. All QA data were
synthetic and both owned browser windows were closed normally.

## Remaining limits

No exhaustive all-template/palette/background/zoom matrix, native 320/400-pixel
layout, screen-reader announcements, measured contrast audit, actual held-key
or IME sequence, native supported-year boundary, controlled midnight/device
clock change, console/network audit, live provider test or other operating
system acceptance is claimed. Applicable arithmetic, lifecycle, repeat-key,
focus-boundary and blocked-I/O cases remain source/model evidence above.

At this calendar checkpoint the main clock date formatting was unchanged.
The calendar changes only its own labels; unrelated localized date-order or
ordinal-label corrections require separate validation.
