# Date interval result copy validation

## Scope — 2026-10-17

The existing calendar's Date interval tool now has an explicit **Copy result**
button and an independent polite live status. The button copies the complete
currently displayed successful calculation: both original ISO dates, the signed
calendar-day difference and the current localized unit. It does not calculate,
submit an unfinished draft, change the viewed month or move focus.

Copy requires the current view/clock owner, the same successful result object,
the original input values, the same rendered snapshot and visible, usable result
controls. The text is captured as a primitive string before clipboard access;
synchronous clipboard-property getter reentry cannot replace it with different
DOM text or a mutated snapshot property. The normal API call remains synchronous
inside explicit activation.

Missing clipboard API, property-access failure, synchronous throw and rejected
Promise retain the result and show a manual-selection/Ctrl/Cmd+C instruction.
There is no clipboard read, permission query, legacy execCommand fallback,
automatic retry, added network/storage operation or new timer. The feature uses
no new permission, setting, schema, backup state or arithmetic helper.

A feature-specific one-in-flight lock survives calendar-view and ClockComponent
replacement. Hiding, editing or leaving invalidates UI feedback but cannot cancel
a system write or release its lock; only actual settlement permits another write.
A valid pending or settled feedback session retains at most one observer and one
set of visibility/blur/pagehide listeners. Invalidation, replacement and a fresh
copy clear the preceding session immediately. This also retires settled feedback
after hide/show or detach/return. Ordinary month navigation, Today, year/month
jumps and unchanged clock ticks preserve a valid result and its copy feedback.

## Automated evidence

The initial 31 tests failed against the unmodified feature source because the
explicit copy control was absent. After implementation, 34 bounded tests in
`tests/month-calendar-interval-copy.test.js` passed. Coverage includes:

- English, Simplified Chinese and missing-key fallback; same date 0, +1, -1,
  leap day, years 0001/0099/9999, full ISO leading zeros and exact full-text export.
- Uncalculated, invalid, edited, raw-input/result mismatches, changed object
  identity, changed rendered text, hidden/disabled/detached/old controls.
- Synchronous explicit activation, double-click suppression, one pending write,
  handled/composing clicks, held Enter/Space suppression, fresh native-button
  activation contract and independent date-field IME state.
- API absence/getter throw/synchronous throw/rejection; no automatic retry;
  explicit retry, independent date/month errors and month announcements; retained
  result and focus on success, failure and late settlement.
- Pending success and failure after same-value edit, edit-away-and-back,
  recalculation, locale/text ABA, folding, main-calendar close, clock/dashboard
  hide/show, visibility changes, blur/pagehide, leaving, view/class replacement,
  queued hide/show, text changes and detach/return.
- Settled feedback retirement and bounded listener cleanup; ordinary navigation,
  Today, month jump, clock configuration and tick retention with one clock timer.
- A clipboard-accessor reentry regression mutates result DOM and optionally the
  snapshot text. A separate test copy restoring the former late DOM read fails;
  the final captured-string implementation passes. No working source was toggled
  back for this negative control.
- Independent world-clock copy lock, no global keyboard handler, no dashboard
  double-click routing, and blocked clipboard-read/permission/network/storage/
  additional-timer operations.

Final focused command:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 --test-reporter=tap \
  tests/*clock*.test.js tests/month-calendar*.test.js \
  tests/dashboard-customization.test.js tests/dashboard-customization-contrast.test.js
```

All **278 tests in 17 files passed**. The existing test files, shared DOM helper,
calendar date arithmetic and CSS remain unchanged. This is a focused regression
pass, not a full-project or scale pass. JavaScript syntax and both changed locale
JSON files were also checked.

## Limits and privacy

These are source and synthetic DOM/event/clipboard-model checks. They do not
establish Chrome trusted activation, real OS clipboard contents, native held-key
or IME ordering, assistive-technology announcements, rendered layout, zoom or
contrast. No new browser run or screenshot was produced. Existing calendar
screenshots predate this feature.

Test dates are synthetic. Real dates entered by a user can be personal
information. The extension does not save or sync calendar drafts/results, but an
explicit copy writes result text to the system clipboard, which may retain or
sync it according to the user's operating-system settings.
