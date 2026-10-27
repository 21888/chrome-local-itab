# Drive restore preparation owns the confirmed form

## Reproduced failure

On 2026-10-27, the actual Options `restoreDriveSnapshot` flow was exercised with actual Drive multipart creation, snapshot validation, StorageManager replacement, and the page's real content lifecycle. Only Chrome storage/Web Locks/auth and Drive transport were synthetic; authentication was forbidden and no account or remote file was used.

After confirming a selected snapshot, its pre-restore safety upload was paused. A new quote was typed without blur/change/autosave. Previously, `replaceSettings` first captured the form only after that upload and the download: it consequently treated this later draft as part of the discarded, previously confirmed form. The counterexample produced one replacement and one reload, with `hasUncommittedWork() === false`. The original failure log remains local under `evidence/drive-restore-preparation/before.log`; it is not an actual historical data-loss incident reproduction.

## Contract and change

- Confirmation captures the ordinary Settings raw-form signature and edit revision, Settings session, storage/Drive-manager objects, workspace/session identities and generations, and selected snapshot ID. A caller changing the snapshot object cannot redirect the later download.
- Every preparation await and the Settings write-queue entry rechecks that ownership. New drafts, including edit-away-and-back events, changed sources, or departure cancel the not-yet-submitted restore. Hiding and returning does not resurrect it. Temporary listeners are removed in `finally`.
- The cancellation message explains that the draft was kept and any already-created safety backup remains available. No cleanup deletes that copy; safety uploads still use `prune: false`. A failed safety upload can still be explicitly bypassed only for the unchanged confirmed form.
- Once `setAll` has been submitted, this change does not cancel, roll back, or pretend to reverse it. The existing replacement/lifecycle fence retains later ordinary drafts and refuses the delayed reload. Storage's original recovery transaction, provider-state preservation, write locks, and conflict protocol are unchanged.
- This reuses the existing ordinary Settings snapshot collection. It is not a new guarantee about every independent widget editor, arbitrary native number-input composition, external account identity, or all possible cross-device races.

## Validation

The new regressions live in `tests/settings-stale-save.test.js`, using its actual Options/Storage fixture and explicit global restoration. They cover normal successful restore with the original quote in the local recovery copy; new draft during safety upload, download, and provider-state preparation; queued-entry recheck; edit ABA; mutable selected ID; changed storage/manager/session and generation; pagehide and hidden/visible retirement; failed safety upload decline/explicit continuation; and post-submission draft preservation, including the already-persisted replacement awaiting `markRestored` acknowledgement. No production security guard is stubbed out.

- Fixed-production full Node aggregate: **17,339/17,339 passed**, exit 0 (369.41 seconds).
- Python aggregate: **91/91 passed**, exit 0.
- Afterwards, one test-only post-commit `markRestored` tail regression was added without changing production source. The final five complete related files passed **178/178**, exit 0, including the complete Settings file (**101 tests**). The earlier full aggregate does not include this last additional test.
- `node --check options.js`, locale JSON parsing and `git diff --check`: passed.

One intermediate test-authoring assertion incorrectly used `recovery.payload.settings` instead of the real `recovery.payload.data` contract; that TypeError log is retained separately, and the corrected assertion verifies the original saved quote rather than weakening the check.

No native signed-in Drive test, browser installation/upgrade test, or real file import was performed. This does not resolve the historical 1.1.71 incident, the missing historical signed store package, or the outstanding file-import approval. No permissions, manifest version, release, or CWS submission changed.
