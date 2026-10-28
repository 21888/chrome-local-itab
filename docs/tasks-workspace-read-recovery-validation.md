# Tasks workspace read recovery — 2026-10-28

## Actual failure, not an injected controller error

On baseline `abb73e3fed053ee5bef16c9fd6eff7a6ef933983`, a synthetic `chrome.storage.local.get` rejection was passed through the real workspace Manager/Session, task Store, Controller and View. The actual Manager converted it to `WORKSPACE_READ`; no controller state or error code was fabricated.

Two new regression tests failed before production changed:

1. The dashboard showed an initial read failure as an unconfirmed save and hid Retry.
2. Settings offered Retry and did read the original complete task state successfully, but the controller retained the obsolete `WORKSPACE_READ` error and the UI continued reporting failure.

Existing tests covered ordinary `READ`, subscription failures and workspace mutation errors, but did not close this workspace-backed initial-read UI recovery journey.

## Minimal correction and important boundary

The controller now recognizes `WORKSPACE_READ` alongside `READ` when a validated current-source read succeeds **and no retained mutation command exists**. Its existing read epoch, feedback epoch, source and lifecycle guards remain in place. Older success cannot clear a newer error; older error cannot overwrite newer success.

The dashboard offers its existing read-only Retry for that no-command failure. Dashboard and Settings use the existing localized read guidance only in this read-only case. A mutation can also fail with `WORKSPACE_READ` after data actually committed but read-back failed. Such an operation must still show unconfirmed-save guidance and retain its exact command/receipt; an ordinary successful refresh does not acknowledge it. Explicit receipt Retry confirms it without replaying a committed write.

No Store/Manager/schema, migration, write, clearing, automatic-retry, pending-state or permission behavior changes. No new strings, focus repair or version change. Draft, conflict and page-local export error ownership remain unchanged.

## Verification

Fifteen focused tests in `tests/local-tasks-workspace-read-recovery.test.js` pass:

- Original two failures, plus repeat failure and later success in English/Chinese dashboard and Settings.
- Complete raw state unchanged and zero writes during failed/successful read recovery; unsaved quick-entry text retained.
- Actual workspace-backed older-success/newer-error and older-error/newer-success ordering.
- Failed mutation read and post-commit read-back failure retain uncertain-save feedback/command; receipt Retry performs no duplicate write.
- Existing task, recovery-copy, revision-conflict and page-local export-error preservation.
- Complete modeled journey: retain draft through read failure/Retry, choose Stay, Save and switch, mount the second workspace, switch back and mount the original task view. The original saved task/copy and second workspace snapshot remain exact, and the explicitly saved draft appears on return.

Final aggregate results:

- Related Tasks/lifecycle run: **6,682/6,682**, exit 0.
- Final complete `node --test --test-concurrency=1 tests/*.test.js`: **17,547/17,547**, **448 test files**, zero failure/cancellation/skip/TODO, exit 0.
- `python3 -m unittest discover -s tests -p '*_test.py'`: **91/91**, exit 0.
- All documented JavaScript syntax checks, manifest/locale JSON parsing and `git diff --check` passed. Production/test SHA256 values matched before and after the full run.

 Backend I/O, Web Locks and DOM remain synthetic; provider access is forbidden in the fixture. This is not native browser navigation, actual extension upgrade/persistence, historical version-71 incident attribution, real-data recovery or release/store acceptance. No GUI, screenshots, CI, external account or publication action was performed.
