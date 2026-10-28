# Tasks change-listener registration failure

2026-10-28. This is a bounded initialization failure fix, not a finding about the historical 1.1.71 data-loss incident or a change to browser permissions.

## Reproduced failure

The actual `createChromeBackend` → Tasks Store → Controller path propagated a thrown `chrome.storage.onChanged.addListener` error from the Controller constructor. Consequently the ordinary homepage/settings mounts could not reach their own task-error UI. A synthetic Chrome API registration failure produced this stack in both English and Chinese tests before any task read or write. The negative log is retained locally at `evidence/tasks-subscription-recovery/baseline.log`; it does not establish that a real installed browser has produced this failure.

## Contract after the fix

- A failed registration creates a failed, usable-for-error-display Controller, not a partially working editable task list. The source-owned failure flag lives in the existing private WeakMap and is exposed read-only to the View.
- Homepage and Settings explain that task change monitoring could not start and ask to reopen the page. No task data is replaced and no permission is requested. Quick entry and file controls are disabled; file/export/recovery handlers also reject the failed instance without a read. The misleading Retry control is hidden.
- `refresh`, `retry`, `action` and `run` reject the failed instance with `SUBSCRIPTION`; dismissing a nonexistent retry cannot make it appear healthy. Clearing an external fault does not revive that old instance or silently retry an operation.
- A newly constructed instance must register successfully before its normal read succeeds. Only a subsequent explicit user action writes a task. Existing completed task text, recovery copies and prior receipt are retained.
- Normal read errors retain the existing Retry behavior. Ordinary writes, conflict/receipt handling, serialization, import review and storage schema are unchanged. Missing storage/Web Locks before backend construction and unrelated workspace startup failures are not newly handled by this change.

## Evidence and limits

`tests/tasks-subscription-recovery.test.js` uses the real Chrome backend adapter, Store, Controller and homepage/settings View with synthetic local storage, serialized lock callbacks and a DOM model. Both locales cover the thrown registration, error UI, zero reads/writes, disabled/no-op file paths, repeated controller entry points, fresh-instance read and one explicit new-task save. Original completed-task and recovery values are compared structurally; no real file chooser, account, extension install, system storage or permission operation occurs.

The four complete focused files (new subscription tests, Controller source, View, and export source) passed **255/255** against the fixed source. The final single-concurrency 51-file Tasks aggregate (`tests/local-tasks*.test.js` plus the new subscription file) passed **6657/6657**, exit 0, in 93.5 seconds. The 255 focused cases are contained in that broader aggregate and must not be added again. This is not a full Node/Python suite or a native GUI pass. No screenshots, fixture binaries or real user data are part of this change.

## Bounded native component check — 2026-10-28 14:01–14:03 UTC

The independent loopback 8835 fixture mounted the actual Tasks homepage and Settings components, not the full new-tab/Options pages. Five production files (Store, Controller, View, dialog focus and task CSS) matched frozen local `c47c4b27` before and after the run. Chrome used its native Web Locks, while storage and the throwing change-listener registration were strictly in-memory synthetic boundaries. Network connections were denied by the fixture CSP; no permissions, file selector or real extension registration were changed.

Both components visibly displayed the reopen instruction. Quick entry, Add, Settings enablement and expanded Task data's Export/Import controls were disabled, and Retry was absent. A visible QA probe called refresh/retry/add on each old Controller: all six returned `SUBSCRIPTION`, with two failed registrations, zero reads/writes, and the entire initial saved state unchanged. An explicit QA action destroyed those instances and created new ones with registration allowed: registrations became four, two reads succeeded, and writes remained zero. This is fresh-instance recovery in the same synthetic page, not proof of browser-restart persistence. Typing a new task into the actual input and pressing Enter then produced exactly one write and “Saved on this device.” The original completed task remained visible, and the readback confirmed its exact original record, recovery copy and prior receipt were retained. No application errors were reported. The whole initial-state equality correctly became false after that deliberate addition.

The owned tab, 8835 server and dedicated Terminal tab were normally closed; the pre-existing browser tab was untouched. Text evidence remains local under `evidence/tasks-subscription-recovery/native-*.json`; no screenshots or fixture binaries were uploaded. English browser UI and both-language model coverage are separate claims. This supplement adds no production change or new full-suite result and does not resolve the historical upgrade incident.
