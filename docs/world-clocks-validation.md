# Offline world clocks validation

## Design and boundaries

World clocks are optional ordinary `clock.worldClocks` configuration: an ordered list of zero to four `{timeZone, label}` entries. An empty list is the default. Only native Intl rules are used; there is no location lookup, network service, new permission, dependency, city database, stored offset or stored timestamp. JSON backup, Drive and opt-in Sync use the existing configuration paths. Older backups normalize to an empty list; malformed supplied lists are rejected at import preflight.

The card belongs to the existing information-card grid, not the narrow main clock header. It respects Show clock and contributes to grid visibility only when configured. All fifteen templates inherit semantic text/card tokens and flexible rows. Main clock formatting and its existing DST-safe ordinal/ISO-week arithmetic remain unchanged. The existing single clock interval updates all rows; hidden pages stop it, and focus/resume immediately updates without duplicating it. There are no per-second live announcements.

`WorldClocks` strictly normalizes entries, canonicalizes native zone aliases, bounds lists/labels, rejects duplicate canonical zones and malformed shape/control characters, and uses only textContent in the card/editor. Corrupt runtime world lists become an empty view while valid main-clock booleans remain usable. Calendar comparisons extract Gregorian calendar parts with Latin numerals and compare UTC calendar midnights; they do not divide elapsed local time around DST transitions.

## Settings ownership and tradeoffs

Add/Remove modify a local world-clock draft. Save clocks or the existing Save settings button explicitly submits it; unrelated autosaves leave the saved list intact. Keyboard Enter adds a valid input and focus is restored after Add/Remove. Invalid entries show an alert and keep the input. A clock draft or unadded input defers automatic reload; the existing intentional reload button confirms discard. Browser beforeunload protection is best effort. Explicit reset clears this configuration draft after the storage reset succeeds.

Successful `getAll` reads supply a non-enumerable trusted `_clockBaseline`. Failed or corrupt reads do not authorize default values to overwrite storage. Untouched clock submissions are omitted. Dirty clock submissions compare the full baseline under the existing local-write lock before any Settings values commit. Missing locks fail closed. All clock writes join that lock. Conflicts preserve the draft and ask the user to review the latest values in a new Settings tab. Async saves advance only their own saved baseline and never redraw newer draft entries. Queued unrelated saves inherit a successful prior own world-list write. A confirmed settings replacement invalidates obsolete queued save presentation.

This is deliberately a component-level conflict rule: concurrent edits to distinct clock fields still conflict rather than attempting a surprising merge. Save clocks uses the existing whole Settings save/validation path; errors in other unsaved Settings can prevent that save. There is no global Settings concurrency redesign. Two current user-facing controls retain the native 12/24-hour/seconds autosave behavior.

## Automated evidence

- Fixed native-Intl instants: US/EU spring/fall DST, half-/quarter-hour offsets, midnight/year end, ±2 calendar-day differences, multiple locales, 12/24-hour and seconds settings, device-zone changes and bounded formatter caches.
- Strict list/label/zone/duplicate/count validation, corrupted runtime view, old and current configuration boundaries, trusted baseline, stale writes and atomic rejection.
- Real sourced Settings and clock classes in a DOM/event model: explicit saves, untouched preservation, remote conflict, delayed-save ownership, missing-read guard, reset, reload protection, Enter/Add/Remove/focus, shared lifecycle/timers, no live tick announcements, source-level narrow CSS/card placement checks.
- Existing regression suites cover the original clock calendar arithmetic, templates, layout, search, storage, personal-content boundaries and packaged asset integrity.

The integrated suite passes 311 Node tests and 19 Python packaging tests. Artifact checksums are recorded separately alongside the release files. Tests are Node/DOM models, not browser layout or screen-reader verification.

## Native QA plan for independent review

1. Load the packaged extension in the cloud browser. Confirm the default empty state adds no card or extra timer. Inspect the feature’s offline-only behavior: it must require no permission or network request.
2. In Settings → Appearance, keyboard-add UTC, America/New_York, Asia/Kathmandu and Pacific/Kiritimati with a long label. Save; verify all four times against native Intl and local relative calendar days. Try duplicate aliases, an invalid zone, fifth entry, overlong/control label via import. Confirm clear errors and retained input.
3. Verify 12/24-hour and seconds preferences, Show clock off/on, removing the last clock, reload persistence, old/current JSON import/export, Drive mock snapshots and opt-in Sync mocked configuration; other widgets remain unchanged.
4. At 320/375px, tablet and wide desktop widths, check all fifteen themes in light/dark modes: no main-header change, readable wrapping, usable Add/Remove/Save and visible keyboard focus. Check Chinese and English catalog labels.
5. In two Settings tabs, save a clock change in B; change an unrelated field in stale A and verify B's clock survives. Change clock fields in stale A and verify conflict/no partial write. During a delayed own save, add a newer draft and ensure it remains dirty and visible after completion.
6. With draft input or Add/Remove changes, simulate a configuration reload and ensure it defers. Confirm intentional discard works. Confirm explicit reset clears clocks. Hide/resume/focus and change emulated device zone: immediate refresh, one interval, no per-second assistive announcements.

Native screenshot/visual and accessibility findings are recorded below. The [live preference refresh](world-clocks-live-validation.md) uses one retained instance and guarded local reads without reloading unrelated drafts.

## Recorded native checks — 2026-10-09

Official Chrome for Testing 155.0.8059.39 on cloud Linux, normal sandbox and owned synthetic profiles, verified the default empty editor, explicit New York/Kathmandu Save, persisted reload, invalid-zone rejection and duplicate `US/Eastern` rejection after New York. The compact card displayed the Kathmandu 45-minute offset correctly. In two actual Settings tabs, B saved Tokyo while stale A retained an unsaved London draft; A was refused, and dashboard reload preserved Tokyo without adding London. The card also remained readable in a dark 510×848 native window. Native window dimensions are not asserted as CSS viewport measurements.

The final live-refresh runtime (newtab.js SHA256 `4ea42802aefaf87596f7aab27adece4b7bdaab3877467dba8b51fd1ac571654b`) then updated an already-open homepage immediately after removing Tokyo and adding London in Settings. The homepage's unsaved Add-task text remained present without reload. Original desktop captures and a 52-file source manifest were retained. The earlier core checks used the same Settings/storage/helper code with the pre-live-refresh dashboard; final runtime differences were tracked separately.

The stale-save check exposed low-contrast existing error-toast styling in light mode. Its independent CSS correction is recorded separately; it does not alter the clock save/conflict logic. Source/model coverage does not imply native fault injection, actual IME, assistive-technology announcements, all-template narrow coverage, live Sync/Drive or other operating-system verification.


## Draft clock reordering — 2026-10-09

Each Settings clock row now has localized native Move up, Move down and Remove buttons with label-and-zone accessible names. Adjacent swaps change only the existing draft array. Boundary directions are disabled; keyboard focus follows the moved row, switching to the opposite direction when necessary. Remove explicitly targets another Remove button or the zone input. Obsolete render handlers, detached rows and out-of-bounds moves are ignored. Row-local keydown guards suppress repeated or composing Enter/Space activation so held Enter cannot reverse a boundary move or remove successive focused rows; ordinary native activation is unchanged.

Actual Settings initializer/renderer/save-path DOM-model tests cover 0/1/4 entries, English/Chinese labels, both directions, preserved entry identity/content, reverse-to-baseline cleanliness, no writes on move, baseline-only unrelated autosaves, explicit Save clocks, stable focus across delayed saves, newer reordered drafts, stale/reattached row handlers, removal focus, departure protection and atomic remote conflicts. Actual storage tests cover reordered manual JSON, Drive and Sync backup/import boundaries and stale order rejection. Existing reset and homepage live-refresh suites remain in the full regression run.

The complete candidate passes 433 Node tests, 19 Python packaging tests and JavaScript syntax checks. Native-browser layout, native Enter/Space activation and screen-reader checks are pending for this change. Recommended acceptance: in English and Chinese, reorder four long-label clocks at narrow/wide widths in light/dark; verify readable wrapping and visible focus; move to each boundary, remove each row, save and check the homepage order; reload and export/import to confirm persistence. The editor uses existing wrapping rows plus a wrapping action group. No schema, permission, network, homepage, save or conflict-path changes are introduced.


### Integrated native reorder acceptance

On 2026-10-09, official Chrome for Testing 155.0.8059.39 on Linux, normal sandbox,
loaded the exact 58-file integrated runtime in a disposable synthetic profile.
First-Up and last-Down controls were unavailable and left the list unchanged.
Moving a middle clock with ordinary click and Enter followed that row's focus;
at the top boundary, focus moved to its enabled Down button. The already-open
homepage retained the original order until explicit Save clocks, then updated
live to the saved new order without reload.

Removing rows without saving retained focus on another Remove button, then on
the zone input when empty. A normal reload with explicit discard restored all
four saved entries. The actual downloaded Settings JSON was independently parsed:
2,791 bytes, SHA256 `50c2530ec971d5c10896d212b710a53167c9fa914d5dfc1f1da6c4d855b59e4d`.
Its exact order was UTC/Coordinated, Asia/Katmandu/Kathmandu, Europe/London/London,
and America/New_York/New York; labels and zones were unchanged.

English Clarity light at an 1188 × 848 outer window and light/dark at 514 × 848
passed the bounded layout check. Buttons wrapped and lower rows remained reachable
by normal vertical scrolling, with no observed horizontal clipping. These are
outer-window dimensions, not CSS viewport measurements. All runtime hashes matched;
433 Node tests and 19 Python packaging tests passed after integration. The owned
browser was closed normally. Actual held-key repeat, IME, assistive technology,
Chinese rendering, other templates/operating systems and live providers were not
exercised in this reorder-specific pass; source/model coverage stays separate.
