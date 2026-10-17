# Date interval endpoint Today validation

## Scope — 2026-10-17

**Use today for start** / **Use today for end** and **开始日期用今天** /
**结束日期用今天** are stable native buttons outside their input labels. Each
button writes only its corresponding draft with a fresh device-local Gregorian
`YYYY-MM-DD` date captured at activation. It does not use the UTC date, browsed
month or a date cached when the calendar opened. Years `0001`–`9999`, leading
zeros and leap dates are supported. An invalid device clock or out-of-range
local year is a no-op: drafts, error, result and copy feedback remain intact.

The other raw draft is never assigned, trimmed or parsed. Whitespace, CR/LF,
Unicode and malformed text already in that field are left untouched. Native
text inputs may themselves sanitize line breaks during entry; the synthetic
model deliberately retains them to check that this action does not rewrite the
peer field. Existing non-target field focus and selection are not changed by
the handler; normal browser pointer activation can focus the clicked button.
The browsed month, its independent year/month draft, error and announcement
also remain unchanged.

A successful fill acts as an ordinary draft edit. It clears interval validation,
result and copy feedback, even if the inserted date is identical. It never
calculates automatically. A new explicit calculation is required before copying.
An already-issued clipboard write cannot be cancelled, so the shared one-write
lock remains until actual Promise settlement. Late success or failure cannot
revive invalidated feedback or move focus, including after rebuilding the view
or replacing the clock owner.

Activation reuses the existing current-owner, view, lifecycle and visibility
guard, requiring the current button and both date fields to remain usable in
an open visible calendar/interval. Hidden, inert, aria-hidden, disabled,
detached, reparented or superseded controls, hidden/departing pages, either
date-field or year-field IME composition, handled/repeated clicks and double-
click continuations do nothing. Fresh Enter/Space retain native button behavior;
held/composing activation keydowns are prevented. Escape keeps its existing
calendar behavior. The endpoint rows wrap, constrain button width and retain
existing focus styles. There is no new storage, timer, network request,
permission, setting, schema, protocol or manifest change.

## Synthetic regression coverage

Fourteen appended tests in `tests/month-calendar-interval-copy.test.js` keep all
prior tests/assertions and the existing bounded DOM/clipboard harness intact:

- English, Simplified Chinese and missing-key fallback; distinct accessible text,
  native button type, separate input labels and source-level wrapping rules.
- Deliberately different local components versus UTC, an open-time/browsed-month
  mismatch, successive midnight changes and one fresh capture per action.
- Leap dates, early years `0001`, `0004`, `0099`, `0100`, and `9999`; invalid clocks,
  year zero/negative/overflow/noninteger values preserve existing state.
- Exact peer drafts, no peer-value writes, modeled non-target caret/focus, month
  error/drafts/announcement preservation, no parser or arithmetic calls.
- Handled/repeated/double-click activation, held Enter/Space, all three IME fields,
  ancestor/field visibility, disabled/disconnected/reparented controls, old views
  and old owners.
- Pending/settled clipboard success and failure, same-value fills, explicit
  recalculation, view/owner replacement, delayed settlement and manual retry.
- Stable controls across locale/config/tick changes; existing Escape and dashboard
  routing; no new timer, global key handler, I/O, automatic copy or focus call.

Focused test command:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 --test-reporter=tap \
  tests/*clock*.test.js tests/month-calendar*.test.js \
  tests/dashboard-customization.test.js tests/dashboard-customization-contrast.test.js
```

All **304 tests in 17 files passed**, with no failures or skips. Both changed
JavaScript files passed syntax checks; both changed locale JSON files parsed.
The 14 appended tests are included in the focused count. Existing test content
remained byte-for-byte unchanged, and all 1,408 CRLF line endings in `newtab.js`
were preserved. This is not a full-project or scale pass. Python packaging,
independent review, remote CI and publication are separate verification stages;
this document does not claim their completion.

## Independent review

Ten additional temporary probes passed using the shipped source and existing bounded model. Actual Node local-date behavior was checked under `America/Los_Angeles`, `Pacific/Kiritimati` and `Asia/Kathmandu` for both endpoints, with dates differing from UTC. Additional probes covered actual Date years `0001`, `0099`, `9999`, zero/overflow/invalid clocks, clock capture only after eligibility checks, thrown clock capture preserving a settled receipt, and the unresolved clipboard lock across owner replacement. These process-local timezone checks do not alter a user device or establish native Chrome behavior. Combined focused and independent checks: 314/314.

Python regression: 84/84. Offline package construction and source verification: 133 runtime files, SHA256 `e23f2ac868c9e1f18845220c288f196d4a899e3eff652c9cab4b68312642b45b`. Manifest remains `1.1.155`; workflow/release files are unchanged.

## Native limits and privacy

This is source and synthetic model coverage. It does not establish native Chrome
trusted activation, actual held-key/IME ordering, real OS clipboard behavior,
screen-reader announcements, actual device midnight/clock changes or visual
layout/zoom/contrast acceptance. No new browser run or screenshot was produced;
historical calendar screenshots predate these endpoint buttons. Native browser
validation remains unavailable in this session. All fixture dates/text are
synthetic and contain no personal data or credentials. Filling today stays local;
only a later explicit result copy can put entered dates on the OS clipboard, with
possible retention/sync according to the user's system settings.
