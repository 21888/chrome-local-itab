# Development progress

Small, local-first improvements are kept in separate commits. No new network services or permissions are added.

## Baseline · 2026-10-08

- Starting revision: `1796b92`.
- Vanilla JavaScript / Manifest V3; no package installation or build step required.
- Passed all three existing Node suites, JavaScript syntax checks, and manifest/locale JSON parsing.
- Unpacked-extension browser checks are pending: this environment cannot launch the isolated Chromium process or open the extension-manager page. DOM-model tests are not a substitute for browser/assistive-technology verification.

## Shortcut dialog keyboard and dismissal safety · 2026-10-08

- Added named modal/alert-dialog semantics, keyboard focus containment, background inertness, Escape dismissal, and focus return on dismissal.
- Delete confirmation initially focuses Cancel. Closing and reopening a confirmation cannot leave an old timeout that removes the new dialog; repeated old clicks cannot delete twice.
- Added `tests/dialog-focus.test.js`, covering focus wrap in both directions, disabled/hidden controls, Escape, prior inert state, cleanup ownership, reopen, and repeated delete.
- Verification: all four Node suites, JavaScript syntax, JSON parsing, and `git diff --check` passed. Actual unpacked-extension browser verification remains pending.

## Backup import data-loss protection · 2026-10-08

- Import now rejects unrelated JSON, missing/corrupt shortcuts, malformed categories/topics, wrong nested setting types, corrupt image assets, foreign envelopes, and unsupported format/schema versions before confirmation or storage writes.
- Full replacement requires an explicit `links` array. Empty arrays remain valid; raw settings, legacy `settings` and `version/data` envelopes, and current manual/Drive snapshots remain supported. Older backups may omit newer modules.
- Restoring still preserves the current device's sync state and skips sync side effects.
- Verification: `tests/import-safety.test.js` covers invalid payloads, supported formats, valid empty backups, no input mutation, provider-state preservation, and the actual manual-import function's no-confirm/no-write failure path. All five Node suites, JavaScript syntax, JSON parsing, and whitespace checks passed.

## Preserve shortcut category after mutations · 2026-10-08

- Grid refresh now reapplies the active category before layout measures visible tiles. Deleting or reordering no longer reveals shortcuts from other categories.
- Centralized mutation filtering, removing redundant form/starter filtering; normal category changes still reflow free layout.
- Verification: `tests/category-mutations.test.js` covers delete/reorder success, rejected writes and thrown writes across Work, Social, All and empty categories; deleting the last visible shortcut; and filter-before-layout ordering. All six Node suites and static checks passed (DOM-model coverage, no browser claim).

## Confirmed next priorities

- Prevent stale tabs or pending saves from overwriting newer shortcut data.
- Restore starter-set retry after storage failure; correct fragment-only search templates.
- Prevent free-layout clicks from moving a shortcut without a drag.
