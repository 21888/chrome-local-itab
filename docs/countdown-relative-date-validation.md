# Countdown: fill a draft date from days after today

## Scope

This change adds a labeled, temporary **Days from today** input and native **Fill date** button to Countdown settings, with English/Chinese catalogs and matching English fallback. Existing classes provide layout and focus styling; no CSS, permission, manifest, controller, storage schema, persistence command, export/import format or provider changes are included.

The pure `dateFromToday(days, date)` helper accepts a non-negative safe integer and a valid Date whose device-local year is 0001–9999. It derives that local calendar date using native Date accessors and the existing `utcCalendarDate` helper, checks the maximum supported result before addition, adds UTC calendar days, and returns a strict four-digit-year ISO date. It never adds fixed 24-hour periods to the local timestamp, mutates the input Date, reads storage or changes the existing date parser/validation logic. Zero means today; invalid Dates, non-integer/unsafe counts and year overflow fail closed.

The view accepts ASCII decimal digits only, including leading zeros. It rejects empty input, whitespace, signs, fractions, exponents and mixed text before converting to Number. Valid results change only `controller.setDraft({ targetDate })`, and only when the target actually differs. The title and enabled flag remain untouched. This reuses the existing draft generation, editable validation-error recovery and import invalidation rules. Unknown save errors, read errors, conflicts, pending operations, composition, closed/suspended views, hidden/inert/disconnected/replaced controls, departed content lifecycle and inactive workspace sessions block the action. No retry or write is triggered.

The numeric input has view-local composition state. Typing, composition and an unchanged result do not become persisted/dirty settings or invalidate TXT review ownership. Only an actual new target invalidates a reviewed import or late file read. Midnight and focus still update the existing read-only date preview, never the filled target. No input-Enter handler or global shortcut was added; keyboard activation uses the native button. Separate status feedback reports either the exact filled date or that invalid input left the draft unchanged.

## Evidence and focused checks — 2026-10-17

The unchanged baseline failed two minimal entry tests for the absent helper and absent UI. Both were product-gap assertions after the synthetic fixture successfully loaded; no fixture failure was used as the RED evidence.

The first expanded test run had 16 passes and one fixture failure: the expected local date for `2026-12-31T10:30:00Z` in Pacific/Chatham was incorrectly written as December 31. UTC+13:45 makes it January 1 there. Only that expectation was corrected; no runtime code changed in response. The corrected feature tests passed 17/17.

The final focused command uses exactly the new test and six named existing Countdown test files, a 512 MiB Node heap and concurrency one:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-countdown-relative-date.test.js tests/local-countdown-store.test.js tests/local-countdown-controller.test.js tests/local-countdown-view.test.js tests/local-countdown-integration.test.js tests/local-countdown-boundary.test.js tests/local-countdown-workspace-navigation.test.js
```

Result: **138 passed, 0 failed, 0 skipped**. No full-suite run, new Python test-suite run or release/package acceptance is claimed by this result. The existing named boundary test includes its own package-allowlist check.

New coverage uses the real Countdown controller and store with synthetic DOM/storage. It verifies:

- Gregorian leap/century/month/year boundaries, years 1–99, exact 0001–9999 limits, overflow, invalid Date and safe-integer checks, input-Date preservation and native accessor semantics
- Five small sequential timezone probes: UTC, America/New_York, Asia/Kathmandu, Pacific/Chatham and Pacific/Kiritimati; spring/fall transitions, fractional offsets and a UTC/local year boundary
- One-field draft-only fill, unchanged title/visibility, no storage reads/writes, retained native-button focus, repeat/same-value no-op, 0/leading zeros, unchanged Save/Cancel schema and validation
- Strict invalid-input feedback, click-time rather than input-time calculation, stable filled dates through midnight/focus, and view-local IME without a custom Enter path
- Import review and delayed-read ownership for parameter-only edits, invalid values, same results and real new targets; a late saved refresh retains the new draft and detects a real conflict
- Correcting the existing DATE validation error without Retry, while preserving uncertain-save attempts/errors, read failure, pending Save and conflict behavior
- Hidden, suspended, disconnected, replaced, inert, invalidated or switched-session action guards; English/Chinese labels and feedback

Existing controller, six test files, shared DOM helper, CSS, manifest and workflows remain unchanged. The store diff contains only the pure helper plus its export; all prior store code is byte-for-byte retained after removing those additions. Raw commands, logs, exit codes and source/log SHA-256 records are retained in the local engineering evidence bundle.

## Limits and native check plan

These results establish deterministic logic and event-ownership behavior. They do not prove real Chrome keyboard activation, native IME event order, screen-reader announcements, visual layout, focus painting or cross-profile behavior. No native browser run, screenshot, upload, user-device operation, paid service, push or release was performed for this change. Existing release/real-upgrade restrictions are not cleared by focused tests.

Before native acceptance, check English/Chinese light/dark narrow settings; Tab to the native button and activate it with Enter/Space; test parameter and date-field IME, error correction, Save/Cancel, actual TXT chooser delays, hidden/departed settings, midnight/focus and repeated clicks using synthetic data. Confirm the temporary count is absent after a new editor mount and absent from saved/exported records.
