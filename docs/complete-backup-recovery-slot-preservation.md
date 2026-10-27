# Portable pre-restore recovery: verified staging and retained previous copy

## Scope and original counterexample

This change concerns local portable **complete-backup pre-restore copies**, not Drive retention, automatic Sync, or the immutable original Workspace migration snapshot. It does not establish the cause or resolution of the historical data-loss incident, and does not authorize an upgrade, import, or store release.

The actual Workspace + StorageManager + CompleteBackup.Store memory fixture first retained valid portable copy A, then changed current saved configuration to B. A subsequent restore overwrote the flat recovery slot before its readback failed. The restore correctly stopped before target submission, but A was no longer available through that portable slot. Original evidence recorded `priorRecoveryRetained:false`, only `__localItabCompleteRecoveryV2` changed, B remained current, and zero provider calls. This is not a claim that immutable raw snapshots or all old workspace generations were lost.

## Publication contract

V1 and V2 retain their existing flat main `{source, checksum}` format. Each has two bounded companion slots: `__localItabCompleteRecoveryPreviousV1/V2` and `__localItabCompleteRecoveryCandidateV1/V2`.

1. Read and fully validate the current main (including the existing V1 fallback for the first V2 publication). Corrupt or unreadable main cannot replace previous.
2. Write the full candidate separately and verify its complete bytes, existing StorageManager fingerprint, archive structure and scope by readback. The existing fingerprint is SHA-256 over the JSON-encoded source string, not a new raw-file hashing format.
3. Copy the verified old main into previous and verify it before publishing main.
4. Publish and readback-verify main; only then may the original target restore proceed. Existing source, confirmation, workspace and combined-library transaction guards remain.

A rejected, dropped, corrupted or unreadable candidate/previous does not replace main. Main publication can succeed before its acknowledgement or readback fails; in that case the old main remains independently downloadable as previous, the candidate remains available, and target restoration is not submitted. There is no compensating rewrite pretending the publication was atomic. A previous copy rotates only from a fully validated main; this is bounded retention, not unlimited history.

No slot is automatically deleted, and no original raw snapshot is removed to make space. Quota exhaustion rejects preparation rather than evicting old data. When a new publication is needed, existing corrupt previous/candidate slots conservatively block this restore rather than being overwritten; other independently valid slots remain individually downloadable. This is not a repair for every recovery failure.

A different unpublished candidate blocks a new publication. The UI identifies this state and provides independent validated downloads; downloading does **not** clear the slot or unlock restoration. Other plugin functions remain available. An explicit discard/reconciliation flow is outside this change and requires a separate safety design.

An already-published identical main may be reused without rotating slots. An identical retained candidate may be reverified. To avoid making unchanged retries differ only by export time, the generated archive can reuse the already-validated archive envelope's `exportedAt` (including Prompt/Collection export envelopes). Its **entire reserialized source and existing SHA-256 fingerprint must then equal** the retained source/checksum. Record timestamps, identities, module contents and metadata are not normalized or ignored. Combined Prompt/Collection transactions receive the checksum of the actual reused publication.

## Read-only interface

Main, previous and candidate have separate download buttons. Each validates only its selected retained copy; unavailable or corrupt previous/candidate messages identify that slot without claiming the others are unavailable. Main is a published pre-restore snapshot, not proof of successful restoration. Candidate is preparation data, not a completed restore. No button restores, clears slots, grants permissions, or opens URLs. Downloads preserve the full source, not a preview subset.

Existing readers and combined transaction markers continue using the old flat main format. Current participating writers retain their existing Workspace/storage locks. An older extension version that does not implement this protocol cannot be made cooperative by these changes; this is not a cross-version upgrade safety guarantee.

## Validation

- Real public restore paths: candidate/previous/main × rejected write, dropped write, corruption, failed readback and lost acknowledgement; target state, original keys and zero provider access asserted.
- Normal publication ordering; distinct occupied candidate; corrupt main/previous/candidate refusal; same candidate retry; clock-advanced combined-library retry; content-different refusal; concurrent stores with an actual held lock and stale review rejection.
- Legacy flat V1 publication and V1-to-V2 fallback preserve compatible exports and original legacy bytes.
- Actual Store + View: exact independent downloads, missing/corrupt/read-failed slot feedback, duplicate clicks, late reads after destroy/detach, and download does not unlock a retained candidate. In-memory download adapter only; not a system file-download or clipboard test.

The first complete Node run retained one failure: 17,412/17,413 passed. The legacy-migration invariant had seeded a non-JSON placeholder with a fake checksum as its successful recovery input. Its positive fixture now uses a real complete V1 export and digest, preserving all original nonmutation/no-false-conflict assertions; a separate negative retains the original corrupt bytes and proves refusal with zero writes. Its complete 126-test file passed. The production validation guard was not loosened.

An earlier related run exposed a Settings integration assertion that expected one visible download button. The isolated process terminated with SIGKILL while that obsolete assertion compared full cyclic DOM objects; the operating-system kill cause was not independently measured. The assertion now compares three button class strings, retaining the explicit read-only isolation contract; its complete 52-test file passed. Neither failed run is called green.

Final frozen-source verification: **17,415/17,415 Node tests passed** with `node --test --test-concurrency=1 tests/*.test.js` (exit 0); **91/91 Python tests passed** with `python3 -m unittest discover -s tests -p '*_test.py'` (exit 0). The two new slot/view files contain 40 tests; the complete Settings recovery-access and workspace-invariants files contain 52 and 126 tests respectively. Both production files matched the native fixture byte-for-byte after this run. `git diff --check` and both JavaScript syntax checks passed. No real account, Drive, user data, imported file, browser permissions, or incident recovery was exercised.

### Native read-only UI, 2026-10-27

Fixed production Store/View sources were loaded in a separate loopback Chrome page with synthetic legacy-format recovery sources and a RAM backend. Clicking main, previous and candidate produced three separate full-source in-memory exports (1627, 1629 and 1630 UTF-8 bytes), each exactly equal to its intended retained source and independently checked using the existing SHA-256 fingerprint convention. No production storage write occurred. The fixture then intentionally corrupted only the candidate checksum: the UI refused another export and identified that slot, with main/previous unchanged.

In a separate clean page run, a candidate read was held at the RAM boundary. All three production download buttons became disabled. The fixture destroyed the old view and mounted a new synthetic source; releasing the old successful read produced no export and did not reclaim focus. The new source's explicit candidate click still exported its exact full 1630-byte source. This tests real browser event/DOM behavior and actual production validation, not Chrome extension installation, real-profile storage, OS file downloads, or an actual workspace-switch implementation. The fixture's switch explicitly calls the existing view retirement contract.

Only the owned tab and loopback server were used and then normally closed/stopped. No file chooser, restore action, real account, remote request, or permission grant was involved. Screenshots and diagnostic logs were not published.
