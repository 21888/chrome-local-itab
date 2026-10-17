# Complete-backup workspace names and destinations

## Independent group navigation, 2026-10-17

This small reading-navigation update starts from commit
`942b0ac064eba3862799e86e4978a4fd590ee292`, tree
`950c6dc02d61608a45ec0dbf6140163ec0eb374e`. It does not change impact
calculation. The outer disclosure still starts closed. Opening it exposes all
three group names and exact counts before any individual workspace rows.
Each nonempty group is a separate native `details`/`summary`, initially closed;
there is no shared `name` attribute or exclusive-accordion behavior. Empty
groups remain labeled `section`/`h5` elements showing 0, without an empty
disclosure or list. All full names, IDs, row ordering and exclusive grouping
remain intact. In the bounded 100-incoming/100-current fixture, removed rows
can be opened without expanding the 100 added rows.

The existing clear function now also closes the group disclosures before
removing them. File/module/destination changes, failures, Cancel, stale results
and destruction keep the same ownership and invalidation paths. A settled
read-only recovery download retains the same review/ticket and each group's
current open state, including when a recovery copy is missing or download
submission fails. Only a later explicit Apply uses that retained ticket.

The existing first-child label/count assertions were retained and strengthened
with `details`/`summary` versus static `section`/`h5` assertions. Existing 200-ID,
identity/order, combined-change, literal-text, zero-change warning, schema and
scope exclusions remain. The shared DOM helper was read and left unchanged.
The review's existing `h4` headings remain unchanged. New CSS only adds group
spacing, wrapping and label weight/cursor, preserving native summary markers
and the existing focus outline.

The initial two-test run against the original View failed at the absent group
disclosure and its empty list; the same two tests passed after implementation.
This establishes a navigation change, not two newly discovered product bugs.
The final focused run passed **176/176** across the following ten entries,
including **47/47** workspace-impact cases:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-reporter=tap --test-concurrency=1 \
  tests/complete-backup-workspace-impact.test.js \
  tests/complete-backup-view.test.js \
  tests/complete-backup-scope-reading.test.js \
  tests/complete-backup-module-bulk-select.test.js \
  tests/complete-backup-target-recovery.test.js \
  tests/complete-backup-download-review.test.js \
  tests/complete-backup-prompts-view.test.js \
  tests/complete-backup-collections-view.test.js \
  tests/complete-backup-contrast.test.js \
  tests/dialog-details-focus.test.js
```

Retained local evidence SHA-256:

- Original View: `6d67ec149d7cd6503c554889f3c1800c6f17cdd107f68d8a81f401ff77738fe2`
- Initial two-test red log: `7aab09aa42018b0924ee09ce4ffc3c2706cbb51707e5aee4a212cc9a9e837256`
- Initial two-test green log: `c81fde1554d042258246749e8a058bf5478597baf933bdcdd87a21ab56c8c7c9`
- Final focused log: `4753b4f91f0d7b8577d6c237adac86455718be7ffbd27ae83fba948eeca45192`
- Final View: `c87c9a1b93c7c3ebcbd7abe3cf7ffacbdb07042d88c778f7882713273e886590`
- Final workspace-impact test: `32510ea7d0ca7a112f805ed52374abcde2ba47c37d9292b0d50051ca96349083`

The tests use synthetic DOM and bounded RAM Store fixtures. Their visibility,
focus and non-interception assertions do not establish actual Chrome
Enter/Space activation, layout, screen-reader behavior, downloads or installed
extension upgrades. No native-browser screenshots or browser acceptance are
claimed. No full/scale suite, release, push, CWS submission, provider call,
user-device access, paid service or permission change was performed. Store,
codec, registry, migrations, helpers, workflow and manifest 1.1.155 are unchanged.
Existing incident/release restrictions are unaffected.

## Original disclosure validation (historical)

The following records the initial disclosure implementation and its original
baseline, checks and retained evidence; it predates the group-navigation update.

This is a view-only disclosure in the existing JSON restore review. It appears
only when a verified preview has `schemaVersion >= 2`, workspace scope `all`, and
all four current/incoming live/Trash arrays. A `Map` joins full stable IDs, never
names. Three exclusive groups show exact counts and current/proposed name and
membership for incoming-only, current-only and renamed/state-changed identities.
A simultaneous rename and membership change has one row. Unchanged identities
are omitted; a zero-change message still warns that selected contents replace
saved contents. It makes no claim about order or last-used workspace.

Iteration preserves current live then current Trash order, followed by
incoming-only live then incoming-only Trash order, within each group. The Store
already bounds each side to 100 identities, so the union is at most 200. Names
and IDs use `textContent` without shortening. Native `details`/`summary` provides
the disclosure; existing list and hint CSS is reused. No storage access, custom
keyboard activation, persistence or focus movement is attached to toggling.
The existing clear path also clears and collapses the disclosure. Destruction
clears only the new disclosure before the shell is removed. Generation ownership continues to
reject stale file and review results. A settled read-only recovery download
keeps its existing review and ticket; it does not silently re-review them.

## Scope and provenance

Baseline: `f2a91a8697ad8b9e47030f03d5ed2d660504ff7d`, tree
`ea2e5e40167e0177b0c037c8ae460c0bc008b59e`.

Production changes are limited to `shared/complete-backup-view.js` and new
English/Chinese catalog strings. Existing Store, codec, registry, migrations,
restore tickets, recovery/import protections, apply parameters, providers,
permissions, CSS and manifest 1.1.155 remain unchanged. Existing tests and helpers
are unchanged. The feature has one new test file and this report, plus the two
complete-backup guides. No README change was needed for the existing entrypoint.

The initial red run had 39 failures at the absent disclosure and two failures
from test-only non-array fixtures being passed through `structuredClone` with a
function. The first implementation run passed 38/41; those two fixture issues
and a new cross-realm equality assertion were corrected only in the new tests.
All original raw logs were retained. The corrected final test file was then
run against the preserved original View: **0/41 passed**, all failing directly
at the missing disclosure. These are 41 blocked scenarios for one missing
entrypoint, not 41 independent product defects. The same final tests pass
**41/41** against the candidate View.

Retained evidence SHA-256:

- Original View: `fc2c1342c0b6d7f923ef7898fe107aef3e8bc3fa531534c0cdc303b0c6981843`
- Initial red log: `3453d3125217f6d7ec66e1ad63d9dc9778d3452920fc00cfaac74142a354b0ba`
- Final test file / final red test: `035f70b5130ab0ea7c6b956aeb55458a38966b63fa4e249b3bf3200b50af2567`
- Final red log: `2ef8166cf2c253b3c8ee601351d4db3979fd72a9883a3160557b6901df9f545a`
- New-suite green log: `d97880a9f42ad03320702c2461b20177652bd202de93f039049a5fb0b4ecafff`
- Final focused seven-entry log: `b5094aca7fa9a5853a167bff31bde19655b5ae2c6b44a14ea0d75e3469ca48a9`

## Bounded validation

The seven explicitly named test entries pass **160/160**: 41 new cases and 119
existing results (including the local-content lifecycle script entry). The run
used a 512 MiB Node heap and test concurrency 1:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-reporter=tap --test-concurrency=1 \
  tests/complete-backup-workspace-impact.test.js \
  tests/complete-backup-view.test.js \
  tests/complete-backup-workspaces.test.js \
  tests/complete-backup-scope-reading.test.js \
  tests/complete-backup-target-recovery.test.js \
  tests/complete-backup-download-review.test.js \
  tests/local-content-lifecycle.test.js
```

New coverage includes:

- New live and Trash identities, absent live and Trash identities, rename,
  bidirectional membership changes and combined changes; same names on
  different IDs remain distinct. Prototype-like IDs use the same Map logic.
- No changes and order-only differences; schema 1, matching and global-only
  exclusions; required-array gating; schemas 3 and 4 with full workspace scope.
- All 200 union identities, complete IDs/names and literal HTML/Unicode text.
- English and Chinese catalogs plus English fallback when a catalog is missing.
  There is no Spanish UI catalog and no three-language UI acceptance claim.
- Normal Enter/Space events are not intercepted, and disclosure toggles issue
  no additional Store calls or focus moves in the DOM model.
- Synchronous clearing on module/file changes, empty selection, large-file
  prompt, Cancel, Escape, export, interrupted inspection and destruction;
  read/review/size/apply failures; late file/review results and out-of-order scope.
- Settled recovery download retains the exact review without automatic restore.
- Two bounded production Store checks with RAM storage: the displayed proposed
  registry projection agrees with an explicit restore and complete pre-restore
  recovery; a later saved-registry change still rejects the original ticket
  without writing. Actual storage-read counts remain unchanged on toggling.

This is synthetic DOM and RAM evidence, not native Chrome keyboard/layout QA,
browser screenshots, installed-extension upgrade validation, recovery of a
real interrupted incident or proof of filesystem download completion. No full
Node glob, scale suite, migration matrix, user device, paid service, release,
CWS submission, provider request or permission/security change was performed.
