# Task export construction-source ownership

## Scope and production reachability

Only `View.export()` changes. It reuses the existing private construction lifecycle and identity predicate. All bytes outside that method are unchanged, including the other 77 View methods. Store, Controller, storage keys, backup schema, receipts, revision checks, existing tests/helpers, workflow and the `1.1.155` manifest are unchanged.

The new synthetic tests use independent real Stores and Controllers with identical validated records and the same workspace object. They deliberately replace mutable public source fields; they do not reproduce ordinary workspace navigation. Normal workspace switching, historical upgrade data loss and historical recovery remain separate questions. This change does not establish a cause or recovery for that historical loss.

## Retained unchanged-source RED

Base HEAD: `a217438da68f89a5bc928db506128c55c419016c`.

Before production edits, the complete tracked source plus the first new test file was archived. View, Store and Controller hashes remained unchanged during the RED runs. The first command was:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-export-source.test.js
```

Result: **115 tests, 9 passed, 106 failed, 0 cancelled, 0 skipped**, exit **1**, duration **818.794162 ms**.

The actual failures covered:

- Eight source substitutions before entry: Controller, Store, backend, workspace object, workspace ID, workspace generation, session and host.
- Sixteen late original-read outcomes: successful reads and real READ failures for each identity dimension. An already-issued original read completed, but its old bytes or feedback still escaped through a changed View source.
- Fifty-six pre-click file/DOM boundaries: each source dimension changed during Blob construction, URL allocation, anchor construction, `href`, `download`, body append or reading the click method.
- Ten destruction/retirement boundaries: entry, original read, URL allocation, append and click-property access, both with and without resetting the public `destroyed` field.
- Seven file failures after a source gap, which overwrote actual existing import feedback.
- Nine same-source feedback races: an original successful download, READ failure or FILE failure replaced a newer actual INVALID or SIZE_LIMIT import error. No Controller state, status, retry or error field was assigned to manufacture those results.

Nine passing controls already covered faithful validated backup bytes, two explicitly requested exports, legacy availability states and real Workspace Session behavior.

Before production edits, one new-fixture ownership-accounting detail was corrected: the harness records an anchor as returned to the caller only after the synthetic element-construction hook succeeds. A thrown constructor cannot require cleanup of a resource it never returned. No product source or old test changed. The corrected unchanged-source RED retained **115 tests, 9 passed, 106 failed**, exit **1**, duration **785.258662 ms**. Both original reports and the original complete source archive were retained.

Retained SHA-256 values:

- Original full-source archive: `9ff82d274a4329284a9f7f1f9ebb983acb998fe598bacc3a1900c570923427cc`
- Original View: `685c321e75627fa78b6d16927660fc3d9ac944a69b66c5e5f558ff13916ee4cc`
- First new test file: `cf0e3576b290d6f11cab305e46025c02c964d9d5d6f9ee7e94e3da5117519f37`
- First RED report: `494d2984be640e7a5a7c391ceeb79aed6fac8249849088a6896516c3bb59f593`
- Corrected-fixture RED report: `3c93935046fa638cd3d3c3d1f5086fdca5a9f008acf3999219c594a59768262d`

## Ownership and availability

Export captures its existing private View lifecycle and reads that lifecycle's Store. It checks construction identity before dispatch, after the original read, and after each file/DOM hook before link activation. The last check occurs after retrieving the click method; invocation preserves the anchor receiver.

The identity check rejects a changed Controller, Store, backend, workspace object/ID/generation, session, host or owner document, as well as a destroyed or privately retired View. It does not invent a new hidden, departing, invalidated, suspended, detached-host or closed-Controller availability rule. The real original Store remains responsible for reporting storage availability errors. Resetting a public flag cannot revive a privately retired View.

An already-dispatched read may finish against its original backend. A source gap observed before activation suppresses that call's download and feedback; it does not substitute or read a foreign Store. Restoring the source does not retroactively activate an abandoned download. These checks do not claim to observe a transient substitution that is entirely made and undone between synchronous checks, or to cancel an anchor activation already dispatched.

## Feedback and per-call resources

Each call remembers the `localError` identity present at invocation. It reports success or failure only if the source is still current and that identity still matches. This preserves a newer changed local error, including genuine INVALID/SIZE_LIMIT import errors. It is not a general latest-invocation cancellation policy, and it never gates an otherwise valid download.

Two explicit same-source export calls remain independently allowed. The test queues a real edit between them and verifies two actual immutable snapshots: original text in the first file and the changed Unicode text in the second. No latest-only token, shared download slot or implicit coalescing was introduced.

Each call owns only its returned Blob URL and anchor. A source gap or file failure removes its anchor and revokes its own returned URL. A successful activation preserves the existing 60-second delayed URL revocation and immediately removes its anchor. Tests verify exact per-call cleanup with distinct URLs. A throwing allocator that never returns a resource cannot transfer that resource's ownership to the caller.

## Backup fidelity and model limits

The successful control captures actual Blob bytes, parses them through the existing backup parser, and checks the existing format/schema/export time, full record order, pin, recovery copies, completed/removed state, Unicode, line breaks and literal markup-looking text. Stored data and unsaved quick-entry/editor drafts remain unchanged. No Store export format, parser, schema or storage protocol changed.

Blob, URL and link activation are a synthetic download harness. This verifies file bytes and ownership, not Chrome's download shelf, native browser permissions, native anchor activation or extension UI painting. No native browser, screenshot, real external download, user device or paid service was used. No credential or personal data was used in the fixture.

## First candidate and independent verification

The first candidate command was:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-tasks-export-source.test.js tests/local-tasks-view.test.js tests/local-tasks-view-lifecycle-source.test.js
```

It passed **209/209 tests**, **0 failed, cancelled or skipped**, exit **0**, duration **1,946.633098 ms**. The new suite accounts for 115 tests. Production and tests were frozen immediately afterward for independent review.

The independent review passed **35/35 new probes**, exit **0**, duration **704.743912 ms**, with no independent-fixture correction. The same probes then ran with 611 preceding independent regressions: **646/646 passed**, **0 failed, cancelled or skipped**, exit **0**, duration **13,112.072552 ms**. These are successive verification stages, not additive coverage totals.

Owner static verification confirmed **1,476/1,477 original tracked files unchanged**, **422/422 protected files unchanged**, **77/78 old View methods unchanged**, and **all bytes outside `export()` identical**. The new test and this document are additions.

Owner Python checks passed **84/84** in **1.771 seconds**. Runtime packaging and verification passed with **133 files**, **4,049,059 source bytes**, archive SHA-256 `1bc20831e10cf92de20775ca56cf3bc1fa3954cef93ecaf8b03d5b64e029016e`. Those are working-tree checks; they do not assert remote CI or publication.

Candidate SHA-256 values:

- View: `2058c1b7c939f6f123017b83a59f699b5fb786515a4e47154fc938d513d0dcdd`
- New 115-test suite: `31a688cbed394226bf30357c446ea4da062c598b22c128f7b3b02c7a17c59a0b`
- First candidate report: `d0efcd3754831d0483415f2e2fa55ea2067236e4f991e34de3ae518db17a9580`
- Independent combined report: `b0089881bbc1670102c88cf26e12759f2d6151c2ab5fba826781d9ac67d80fb7`

## Final bounded 58-file verification

The final run reused the preceding feature's exact 57-file list and appended only the new export-source suite. It used `node --max-old-space-size=512 --test --test-concurrency=1` with the explicit paths below, without globs or parallel Node processes.

Result: **6,780/6,780 passed**, **0 failed, cancelled or skipped**, exit **0**, duration **93,980.005309 ms**. All 59 source/test hashes matched before and after execution. Sequential `node --max-old-space-size=512 --check` commands for the View and new suite both exited **0**; the same hashes still matched afterward.

- Final 58-file report SHA-256: `c6952a3fb05d0d0c83ec258b6f58ebf04829b37200cea849e38a3ed994e6b372`

The exact files were:

```text
tests/local-tasks-restore-ownership.test.js
tests/local-tasks-remove-ownership.test.js
tests/local-tasks-reopen-ownership.test.js
tests/local-tasks-batch-store.test.js
tests/local-tasks-boundary.test.js
tests/local-tasks-complete-batch-store.test.js
tests/local-tasks-complete-batch-view.test.js
tests/local-tasks-complete-ownership.test.js
tests/local-tasks-completion-undo.test.js
tests/local-tasks-copy-visible.test.js
tests/local-tasks-edit-return-focus.test.js
tests/local-tasks-move-first-ownership.test.js
tests/local-tasks-move-first-store.test.js
tests/local-tasks-move-first-view.test.js
tests/local-tasks-move-last-ownership.test.js
tests/local-tasks-move-last-store.test.js
tests/local-tasks-move-last-view.test.js
tests/local-tasks-pin-ownership.test.js
tests/local-tasks-pinned-completion.test.js
tests/local-tasks-step-move-ownership.test.js
tests/local-tasks-store.test.js
tests/local-tasks-view.test.js
tests/local-tasks-reopen-batch-store.test.js
tests/local-tasks-reopen-batch-view.test.js
tests/local-tasks-restore-batch-store.test.js
tests/local-tasks-restore-batch-view.test.js
tests/local-tasks-copy-completed.test.js
tests/local-tasks-next-ownership.test.js
tests/local-tasks-copy-removed.test.js
tests/local-tasks-edit-source.test.js
tests/local-tasks-batch-view.test.js
tests/local-tasks-dialog-composition.test.js
tests/dialog-focus.test.js
tests/dialog-ime.test.js
tests/dialog-details-focus.test.js
tests/ai-context-task-edit.test.js
tests/ai-context-view.test.js
tests/ai-context-external-tasks.test.js
tests/local-tasks-departure.test.js
tests/local-tasks-reuse-draft.test.js
tests/local-tasks-copy-text.test.js
tests/local-tasks-visibility.test.js
tests/local-tasks-backend-transaction.test.js
tests/workspace-lifecycle.test.js
tests/workspaces-invariants.test.js
tests/workspaces-view.test.js
tests/ai-context.test.js
tests/local-tasks-controller-source.test.js
tests/local-tasks-replacement-source.test.js
tests/local-tasks-view-lifecycle-source.test.js
tests/local-tasks-undo-source.test.js
tests/local-tasks-quick-add-source.test.js
tests/local-tasks-reuse-source.test.js
tests/local-tasks-batch-source.test.js
tests/local-tasks-transition-source.test.js
tests/local-tasks-restore-batch-source.test.js
tests/local-tasks-generic-source.test.js
tests/local-tasks-export-source.test.js
```

This implementation task made no commit, push, tag, Release or Chrome Web Store change. Publication and exact-commit CI verification remain with the owner. The preserved evidence and bounded checks do not constitute native-browser validation or resolution of historical data loss.
