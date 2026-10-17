# Countdown: fill a draft date before or after today

## Scope

This bounded extension adds a labeled native **Direction from today** select to the existing temporary **Days from today** calculation. **After today** remains the default; **Before today** subtracts the non-negative count. English/Chinese catalogs and the English fallback explain both directions and the `0001-01-01` to `9999-12-31` range. The earlier [forward-only validation record](countdown-relative-date-validation.md) is historical evidence and remains unchanged.

`dateFromToday(days, date, direction = 'after')` retains the previous two-argument behavior. Counts must be non-negative safe integers. Only the primitive strings `after` and `before` are accepted as explicit directions (an omitted/undefined optional argument keeps the default). The helper reads the supplied Date's native local calendar slots, checks available UTC calendar days to the applicable bound before any addition/subtraction, and returns a strict four-digit ISO date. Zero has the same result in both directions. The input Date is never mutated; fixed local-timestamp 24-hour arithmetic is not used. No other Store logic, parser, schema, mutation command or controller behavior changes.

The view accepts only ASCII digits, including leading zeros. It derives the device-local date when **Fill date** is activated, not when count/direction is edited. Only an actual new target calls the existing `setDraft({ targetDate })`; title and visibility stay unchanged. Save remains explicit. Both parameters are page-local, excluded from saved/exported records, and reset to an empty count/After today on a new editor mount. They survive normal renders without control replacement or value rewrites.

Changing direction clears only relative-date feedback. Count/direction edits, invalid results and same-date fills preserve reviewed TXT ownership and pending file reads. A different target invalidates them through the existing draft generation. Original read/write-error, Retry, conflict and pending-operation behavior remains in place. The select participates in the same lifecycle, hidden/inert/disconnected/replaced-control and workspace checks as the existing controls. Activation rejects handled, repeated, double-click and IME events; a button-local keydown guard suppresses held-key native activation without adding an input/global shortcut.

## Bounded automated evidence — 2026-10-17

New coverage lives in `tests/local-countdown-relative-direction.test.js`; prior tests and assertions are unchanged. It uses the actual Countdown Store and Controller with a synthetic DOM and in-memory backend. It covers:

- Backwards month/year/leap/century arithmetic, years 1–99, exact supported bounds, overflow preflight, safe-integer/type/strict-enum rejection, native Date slots and input immutability
- Default-after compatibility and zero in both directions; five sequential small timezone probes for UTC, New York, Kathmandu, Chatham and Kiritimati, including backwards DST/fractional-offset and local-year-boundary cases
- Native select labels/default, stable control identity/focus/caret models, page-local parameter reset, draft-only updates, unchanged title/visibility and explicit Save/Cancel behavior
- Fresh click-time local date, fixed results through midnight/focus, strict ASCII counts, invalid Date/direction/lower-bound feedback and matched EN/zh/fallback text
- TXT review/pending-file ownership for direction changes, invalid/same/different results; late saved-read conflict detection
- DATE validation correction, exact failed-write Retry, lost-acknowledgement reconciliation without a duplicate write, read failures, conflicts and pending saves
- Handled/repeated/double-click/IME guards, button-local keyboard handling, no input/global shortcuts, select-specific visibility/ownership guards and existing lifecycle/workspace boundaries

The first focused run passed 266 of 267 cases. One newly added assertion expected an untouched synthetic paragraph's `textContent` to equal the native DOM's empty string; the shared test model instead leaves it undefined. Only that new assertion was corrected to normalize the empty modeled value. No runtime code or pre-existing assertion changed in response.

The same focused command was rerun with a 512 MiB Node heap and concurrency one:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-countdown-relative-direction.test.js tests/local-countdown-relative-date.test.js tests/local-countdown-store.test.js tests/local-countdown-controller.test.js tests/local-countdown-view.test.js tests/local-countdown-integration.test.js tests/local-countdown-copy-date.test.js tests/local-countdown-workspace-navigation.test.js tests/local-countdown-boundary.test.js
```

Final result: **267 passed, 0 failed, 0 skipped, 0 cancelled** (23 new cases and 244 existing cases). The existing boundary test includes its own bounded package-allowlist subprocess. This was a focused run, not a full or scale suite, and does not claim the separate Python/package release acceptance. Both raw run logs are retained in the local engineering evidence bundle. Source and tests were frozen after the passing run for independent review. No screenshots were produced.

## Independent review

Nine additional temporary probes passed against the shipped source and real Store/Controller with a bounded DOM model. These independently checked inverse Gregorian arithmetic and full-range boundaries, strict direction coercion and native Date accessors, actual Node local dates under New York/Kiritimati/Kathmandu, zero-day direction changes retaining TXT review, delayed file-read invalidation, exact uncertain-save retry after parameter changes, and a replaced direction control. Combined focused and independent checks: 276/276.

Python regression: 84/84. Offline runtime package construction and source verification: 133 files, SHA256 `0a849f09f02e921e06d0db36d6847f4c13e709f2b7d19a3b4c488c6d84c95f9f`. Manifest remains `1.1.155`; workflow/release configuration is unchanged. These timezone and model checks do not establish native Chrome acceptance.

## Limits

Synthetic DOM checks establish deterministic event/state ownership only. Real Chrome select/Enter/Space behavior, native IME order, screen-reader announcements, visual layout, native focus painting and cross-profile behavior remain untested. No browser session, screenshot, user-device action or paid service was used. Existing native-browser restrictions are not bypassed. This record does not imply a full-suite pass, CI success, push or Release publication.

When native acceptance is permitted, check English/Chinese light/dark and narrow Settings; Tab between count, direction and Fill date; select both directions, activate using Enter/Space and held/double clicks, exercise IME and invalid/lower-bound inputs, review a real TXT chooser delay, Save/Cancel and remount. Verify the select keeps focus through ordinary renders, date fills remain fixed at midnight and no parameter appears in saved/exported records. Use only synthetic milestone data.
