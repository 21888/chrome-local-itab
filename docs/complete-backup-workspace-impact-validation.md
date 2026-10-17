# Complete-backup workspace names and destinations

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
