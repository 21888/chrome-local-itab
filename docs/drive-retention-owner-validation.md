# Bind Drive retention cleanup to the uploaded snapshot

## Reproduced failure

The existing `uploadSnapshotDraft()` uploaded the metadata captured for computer group A, then awaited the network response. Its success bookkeeping merged into the latest local provider settings. If another Options instance selected group B while the upload was pending, the returned settings named B, and automatic retention used **B** as its cleanup target. This could delete an older B snapshot even though the new backup belonged to A.

A bounded reproduction used the actual StorageManager configuration backup reader/validator and actual Drive draft, multipart upload, device-selection, listing parser and retention methods. Two manager instances shared synthetic Chrome storage. Only the network boundary was replaced by in-memory responses; Sync initialization and lock scheduling were isolated. After preparing A, holding upload delivery, selecting B from the second manager and releasing delivery, the original source printed `draftGroup=device_a`, `currentGroup=device_b`, `deleted=[b_1]`. The ownership assertion failed. This is a code-level counterexample, not evidence that a real account suffered this event or that it caused the historical iTab data-loss incident.

An initial harness attempt omitted its synthetic OAuth manifest and correctly failed availability before upload. That fixture error was retained separately, corrected with a non-account synthetic identifier, and is not counted as the product failure. No token was requested and no external request or deletion occurred.

## Correction and preservation contract

- Capture the reviewed draft's computer/snapshot identity before the first upload await. Require consistent draft state and metadata ownership.
- Copy metadata and retain the original immutable JSON/creation-time values at entry, so caller edits while multipart or resumable upload waits cannot change its later payload or retention target.
- Before automatic deletion, require an upload acknowledgement with a nonempty file ID and the same app, snapshot type, computer ID and snapshot ID. Both existing upload-init URLs already explicitly request `appProperties`; no extra API scope or request is added.
- Prune only the captured group, never the latest selected computer. Selection remains B when the user changed it; the implementation does not restore old settings to disguise the race.
- Missing or contradictory ownership keeps every older snapshot and returns the existing upload-success/cleanup-warning result. The warning explicitly says cleanup was not run. There is no fallback to current selection, blind retry or speculative deletion.
- A rejected/lost upload acknowledgement does not list or delete snapshots. Explicit `prune: false` still skips cleanup. Existing genuine cleanup-error feedback remains covered.

The uploaded backup itself is not rolled back or removed. Normal verified retention remains the existing latest-20 policy for its own computer group. This is not an atomic transaction with future Drive changes and does not assert real-provider delivery, account identity or OAuth acceptance.

## Regression evidence

`tests/drive-retention-owner.test.js` runs 18 cases through the actual public flows with a synthetic `driveRequest` boundary. It covers multipart and resumable uploads, unchanged selection, selection before upload and during upload, caller mutation during an await, missing/mismatched acknowledgement fields, absent/inconsistent draft ownership, lost acknowledgement and explicit no-prune. Both computer groups begin with 21 snapshots; normal acknowledged A upload prunes only the two oldest A records, never B. Global Chrome state is restored after every test, and authorization calls remain zero.

The pre-existing `tests/drive-backup.test.js` cleanup-denied fixture now supplies the ownership fields returned by the real requested response shape. Its original successful-upload and `delete denied` assertions are unchanged.

- Four complete related files: **84/84 passed**, exit 0.
- Final full Node aggregate: **17,322/17,322 passed**, exit 0 (368.76 seconds).
- Final Python aggregate: **91/91 passed**, exit 0.
- `node --check drive-backup.js` and `git diff --check`: passed.

No real Google Drive connection, login, token, account data, upload, deletion, browser installation, file selection, new permission, version bump or release is part of this validation. It does not resolve the historical incident or outstanding import approval.
