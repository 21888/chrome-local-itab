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

## Confirmed next priorities

- Reject unrelated/corrupt backup files before replacement can erase local data.
- Preserve active category after shortcut mutations.
- Prevent stale tabs or pending saves from overwriting newer shortcut data.
- Restore starter-set retry after storage failure; correct fragment-only search templates.
- Prevent free-layout clicks from moving a shortcut without a drag.
