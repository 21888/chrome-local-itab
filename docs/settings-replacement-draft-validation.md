# Ordinary Settings drafts during reset/import

## Behavior

A confirmed replacement owns the ordinary Settings form at the instant replacement starts. A successful reset or import must not implicitly reload over later typing, category edits or visibility changes. The lifecycle guard now compares a raw form snapshot against that confirmation snapshot, including invalid/empty text that normal validation would normalize away. Clock and private-content views retain their existing independent guards.

This does not undo the replacement, restore old persisted settings, or unlock saving from the stale page. A retained newer draft can be reviewed/copied before a deliberate reload; the existing reload confirmation is still required to discard it. Unchanged pre-confirmation drafts do not block the requested reset. Failed/false-returning replacements leave ordinary saving available. A second explicitly requested reset can discard the draft present for that second request.

## Evidence (2026-10-25)

Before the fix, four tests using actual `options.js`, `StorageManager` and `local-content-lifecycle.js` paused the reset storage write and edited quote text, custom-search text, an unfinished weather number or background text. Each reproduced an unwanted reload (`1` rather than `0`). No actual user content was used.

After the fix:

- `node --test tests/settings-stale-save.test.js`: **56 passed**, including 14 added cases. Coverage includes the four regressions, blank quote, blank category rename, category removal, unsubmitted topic, visibility change, unchanged confirmed draft, edits after import commit but before its delayed reload, failed/false reset, and a second deliberate reset. Assertions retain the successful reset generation and prohibit stale saves from writing anything.
- `node --test --test-concurrency=1 tests/world-clocks-options.test.js tests/local-content-lifecycle.test.js tests/import-settings-navigation.test.js tests/dashboard-settings-pending-navigation.test.js`: **63 passed**.
- JavaScript syntax and `git diff --check` passed.

These are controlled storage and synthetic DOM tests, not native browser acceptance. No full-suite run was performed for this change. Earlier aggregate runs remain qualified by their recorded failures; their later isolated passes are not a full green result. No screenshot upload, Chrome Web Store publication, installed-upgrade validation, historical-loss recovery claim or preservation-gate change is included.

## Independent-review correction

The initial implementation in `36cf2e5` was incomplete: checking only explicit `getElementById`/`readNumber` calls in `collectFormData` did **not** establish coverage of helper-read or dynamically selected controls. Review found the three `.topic-score-input` fields omitted. With an unchanged pre-confirmation title and score, changing only the score during reset still allowed reload. The correction includes both topic title and score controls selected by class. Source review also checked category name/icon controls through `bookmarkCategorySignature`, topic helper reads and the static HTML input inventory; separately owned clock/layout/private-content/Drive controls are not treated as ordinary form ownership.

Six additional score-only regressions (Baidu/Weibo/Zhihu × reset/import) all failed before the correction. Two further controlled cases model numeric `validity.badInput` changing while `.value` remains empty; the snapshot now also retains this observable validation state. Those two cases failed before the correction as well. They do not establish native browser keystroke/number-sanitization behavior.

After the correction, the five files listed above pass **127/127** in one serial invocation (`--test-concurrency=1`), including **64** Settings stale-save tests. All eight new review cases passed, and the score cases also assert that the replacement save fence prevents storage writes. Syntax and whitespace checks passed again. This supersedes the 119-test focused result only; the full-suite/native/upgrade/publication limitations remain unchanged.
