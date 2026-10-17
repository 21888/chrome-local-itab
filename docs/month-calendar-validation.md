# Local month calendar validation

## Scope

An initially collapsed native `details` date viewer beneath the main clock date. It belongs to the existing ClockComponent singleton. No storage keys, configuration fields, permissions, network, calendar events, reminders, interactive grid date selection, independent timer or card were introduced.

The pure helper uses Gregorian UTC date-only arithmetic with `setUTCFullYear`; the today tuple comes from local Date fields. Navigation is month-based (day 1) and bounded to January 1 through December 9999. Out-of-month cells are blank. Locale week data is feature-detected (`getWeekInfo` / `weekInfo`, firstDay 1–7); fallback is Sunday for English and Monday for Simplified Chinese and unknown/other locales.

## Automated coverage

- Leap years 1900/2000/2024/2025, all month lengths and weekday offsets, 4–6 rows, years 1/99/100/9999 and bounded navigation.
- Local-day tuples and UTC layout in UTC, New York, Sydney, Kathmandu, Kiritimati and Honolulu, including DST transitions.
- Real shipped clock methods exercised in a DOM/event model: initial collapse; no closed table work; stable table rows within one date/month/locale; stable controls/focus; browsed-month retention across midnight and configuration changes; fresh Today/reopen; locale labels; today semantics; Escape; hide/show; dashboard-double-click exclusion; held activation/composition guard; one existing timer, detached-host inertness, edge-button focus recovery, and blocked I/O.
- Actual table caption, full weekday accessible labels with `scope=col`, plain noninteractive day cells, `aria-current=date` only on today, explicit-navigation-only polite status.
- Explicit runtime inventory and HTML script/CSS order. Full project verification: 491 Node tests and 19 Python packaging tests pass; all JavaScript syntax checks pass and 15 JSON files parse. Runtime ZIP inventory is 60 files.

## Explicit year/month jump — source and model coverage, 2026-10-17

A separate editor row contains a text year field with numeric input mode, twelve
localized fixed-value month options and a View button. Only View or a fresh,
unhandled, non-composing Enter in the year field commits a jump. The year parser
accepts 1–4 ASCII digits, values 1–9999 including leading zeros; neither field is
trimmed, partially parsed or truncated. Invalid drafts remain editable with a
localized error. Native select keys, including Escape, are not intercepted.

The two focused test files cover strict parsing, early years 1/4/99/100,
Gregorian 1900/2000 leap rules and 9999 bounds; explicit-only jumps, stable focus,
editor nodes/options and caret across ticks, midnight/config/locale updates;
explicit navigation draft synchronization; same-month reopen; localized errors;
IME Enter continuation, mouse-completed composition, key release before
compositionend, handled events, hidden/detached/superseded controls and cleanup.
The model blocks storage, network and extra timers. It models visibility guards
but does not evaluate CSS layout or a native select popup.

No new native-browser run or screenshot was made for this editor. The captures
and browser observations below precede the editor and do not establish its
layout, native IME/select behavior or screen-reader announcement behavior.

## Date interval — source and synthetic model coverage, 2026-10-17

A second, initially collapsed `details` at the bottom of the existing calendar
contains two text inputs, an explicit Calculate button, a format/semantics hint,
a local alert and a visible polite status. Inputs intentionally do not use a
native date picker. The helper accepts only complete ASCII `YYYY-MM-DD`, years
0001–9999, and round-trips UTC Gregorian components through the existing
`utcDate` helper. The signed difference is end minus start at UTC midnights;
no local millisecond arithmetic, rounding, business-day or inclusive counting is
used. Original dates remain visible in the result.

Focused automated checks cover:

- Strict invalid/empty/raw drafts, 0001/0004/0099/0100/9999, 1900 versus 2000 leap
  rules, same/forward/reversed dates and the entire supported range.
- DST and fractional-offset zones (New York, Lord Howe, Kathmandu and Chatham),
  plus the Samoa civil-date skip, with the same date-only results in UTC.
- Explicit button/fresh Enter calculation, immediately retired results on edits,
  stable nodes/caret and independent drafts across month navigation/jumps, Today,
  ticks, midnight, config and language changes; EN/ZH and missing-key fallback.
- Nested toggle target ownership, folding only the interval retaining drafts and
  results, main-calendar close/reopen and clock/dashboard hiding clearing them,
  same-month/coalesced reopen, and inactive/hidden/inert/disabled/detached/old
  controls rejecting calculation and hidden focus.
- Independent per-field IME state, completion-key continuation, release before
  compositionend, mouse-completed and interrupted composition, handled/held
  Enter, existing native-select keys and the calendar Escape convention.
- Zero network/storage/new timers in the existing blocked-I/O model, existing
  calendar/clock/world-clock/dashboard regressions and narrow wrapping CSS source.

The nine focused test files passed 161 tests with a 512 MiB Node heap and serial
file execution. This is a focused pass, not a full-project/scale pass. The model
simulates events and visibility; it does not establish native event ordering,
actual IME behavior, CSS geometry or screen-reader announcements. No new native
browser run or screenshot was made for date interval. The older captures below
predate both the month jump editor and this tool.

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
