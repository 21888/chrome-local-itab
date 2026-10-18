# Scratchpad export source and resource ownership

## Scope

Feature 97 binds Scratchpad text export to the View's original Controller, Store,
backend, host, editor, status and export control. The production change is limited
to `shared/local-scratchpad-view.js`: one private ownership record/predicate, its
constructor capture, and `exportText()`. Store, Controller, Tasks, copy/find/import/
ordinary-input behavior, other lifecycle and teardown methods, settings mounting,
schemas, keys, locales, manifest and workflows remain unchanged. The manifest is
still 1.1.155. This implementation worker does not commit, push, tag or publish.

The tests deliberately replace public fields or run one-shot synchronous file/DOM
callbacks. These are synthetic robustness probes, not normal workspace navigation
and not evidence of a historical personal-data-loss cause. Normal workspace
switching still follows the existing flush/decision/select/navigation path.

## Existing contract and reproduction

The original export selects the Controller's exact raw draft, except during genuine
IME composition when it selects the current editor value. It rejects incomplete
Unicode, but permits empty, over-limit, unsaved, conflicted, read-error and
write-error recovery text. It does not require a loaded, enabled, visible, connected
or available workspace. A closed original Controller still retains exportable text
while its View itself has not been retired.

The new `tests/local-scratchpad-export-source.test.js` uses real Scratchpad Store
and Controller instances and the unchanged `tests/helpers/task-dom-model.js`.
Serialized backend locks, actual notifications, deferred writes and actual backend
failures create pending success/failure, lost acknowledgement, conflict, read
failure and over-limit states. No Controller state/error/pending/retry outcome is
assigned to fabricate a scenario. Foreign sources are independent real instances.

Synthetic Blob, URL, anchor and timer methods record the exact returned resources,
receivers, dispatches and cleanup attempts. Blob bytes are read through
`arrayBuffer()` and decoded with `TextDecoder('utf-8', { ignoreBOM: true })`, retaining
the leading BOM. Explicit removal and recursive owner-document reassignment model
same-document transfer and cross-document adoption; the shared DOM helper does not
automatically implement native adoption.

Before production edits, all **1,495 tracked files** and a **429-file protected
subset** (tests, workflows, locales, manifest and core Store/Controller/Tasks files)
were hashed. The original View was separately saved with SHA-256:

`c242b308ac5fdb6609f717228a46241278ee949d6f410eb7bcd1cde171e25e13`

## Unchanged-source RED and fixture diagnostics

The first corrected 191-case unchanged-source run was **35 pass / 156 fail**, zero
cancelled/skipped, exit 1, **1046.583275 ms**. An initial new-test assertion used
`Blob.text()`, whose UTF-8 decoding strips a leading BOM. Only that new assertion
was corrected to compare the actual buffer with BOM-preserving decoding; both
complete logs and test snapshots were retained. All 1,495 tracked baseline files
still matched before production editing.

The pre-edit matrix then expanded to 215 cases, adding method-getter boundaries,
completed pre-invocation workspace/session changes, translated feedback, real newer
edits and throwing cleanup. That unchanged-source run produced **40 pass / 175
fail**, zero cancelled/skipped, exit 1, **1395.280691 ms**.

The first candidate six-file run was **737 tests / 683 pass / 54 fail**, zero
cancelled/skipped, **6864.716634 ms**. All 522 old compatibility cases passed. Each
of the 54 new failures was the same fixture mismatch: a newly created anchor that
had never been appended has `parentElement === undefined` in the unchanged model,
whereas the new assertion required `null`. The new assertion now normalizes those
two detached-absence values, while retaining exact removal-attempt counts, zero
activation, URL cleanup and unchanged source/feedback assertions. No production
change or old test/helper change was made for that correction.

The exact final 215-case test bytes were rerun against the archived unchanged View:
**40 pass / 175 fail**, zero cancelled/skipped, exit 1, **1310.768903 ms**. Original
and corrected new tests, all full RED/candidate outputs, execution hashes and exit
statuses remain archived. The candidate-1 final RED and GREEN use identical new-test bytes.

The baseline failures demonstrate:

- Substituted real Controllers and public source/target handles still dispatch.
- Same-document and cross-document target transfers do not stop old export.
- Blob, URL, anchor construction/setter, append and click-method callbacks can
  transfer the source before actual activation without suppressing dispatch.
- Failure reporting follows a substituted status or overwrites a newer genuine
  Controller edit's feedback.
- URL cleanup follows replaced public methods/receivers, including delayed revoke;
  anchor cleanup follows replacement methods, and throwing removal may repeat.
- Synchronous nested export can issue duplicate actual activations.

## Ownership and admission contract

- Pin construction Controller, Store, backend, original host and the three
  export-related nodes privately. Capture their complete original ancestor chains
  and construction document before prior-owner invalidation callbacks can run.
- Workspace object, ID, generation and Session are captured **per invocation**.
  Changes completed before invocation are permitted when the construction source
  and owned original UI remain intact. Late workspace/Session setup therefore
  remains compatible. A change observed during an invocation stops its remaining
  pre-click dispatch work.
- Ownership is not availability. Hidden or detached original same-document
  fragments, a disabled export button invoked directly, a hidden document,
  departure flags, loading/read errors, closed original Controllers and suspended
  or invalidated workspace flags do not introduce new rejection gates.
- Reuse the existing two-pass ancestor validation, allowing original detached
  links but rejecting new parents or documents. This retains its conservative
  full-chain rule: former ancestors are still checked beyond a detached break.
  Restoring intact original identities permits a later explicit export.
- Capture exact raw draft text, or the genuine original editor's composition text.
  Export does not save, refresh, retry, normalize newlines or mutate Controller
  state. A foreign public Controller/editor can never supply the payload.
- Revalidate after observable resource-method lookups, Blob construction, URL
  allocation, anchor creation and setters, and body append, before the captured
  anchor activation. A privately retired View cannot be revived by resetting its
  public `closed` field.
- Reserve privately before observable getters; synchronous nested export is
  suppressed only until this function finishes. The reservation is released in
  `finally`, independently of delayed URL cleanup, allowing a genuine next export.

These checks are bounded ownership defenses. They do not claim to detect a source
change entirely made and undone between checks, or to secure arbitrary hostile
JavaScript accessors. No storage/data-saving protocol or asynchronous write path
is added.

## Feedback and resources

Each invocation captures its original status text and Controller generation.
Invalid-Unicode or export-failure text is written only while the same source,
original target/ancestry, status text and generation remain current. Translation
runs before the final ownership check. Thus a real newer edit, transferred status,
or substituted foreign View's feedback is preserved.

The Blob constructor, URL receiver/create/revoke methods, document create method,
body/append method, timer method, and the returned anchor's remove/click methods
are captured once and called with their original receivers. Public replacement
cannot redirect later cleanup. The anchor is removed immediately; successful
activation retains the existing one-second delayed revoke. An abandoned or failed
invocation instead immediately revokes its returned URL.

Removal and revocation each have an idempotent attempt flag set before invoking
cleanup. A throwing remove cannot prevent the original revoke attempt; a throwing
revoke is not retried. A timer that registers its callback and then throws cannot
cause a second revoke. Delayed cleanup keeps its captured resource ownership even
after retirement and never writes late status. An allocator/constructor that
throws without returning a resource does not give that resource to its caller.
A cleanup method that itself throws is an attempted cleanup, not proof that the
underlying resource was physically removed or revoked.

Once the actual anchor click has been issued, it cannot be cancelled or rolled
back by a later source change. Tests explicitly preserve this post-click behavior.
Cleanup does not claim to undo the already-issued download.

## Candidate 1 focused GREEN and first freeze

The first candidate-1 final focused run passed **737/737**, zero failed/cancelled/skipped,
exit 0, **6650.824861 ms**:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-scratchpad-export-source.test.js \
  tests/local-scratchpad-view.test.js \
  tests/local-scratchpad-view-lifecycle-source.test.js \
  tests/local-scratchpad-copy-transaction.test.js \
  tests/local-scratchpad-copy-feedback-targets.test.js \
  tests/local-scratchpad-teardown-targets.test.js
```

This includes **215 new cases and 522 unchanged compatibility cases**. Source/test
bytes were frozen and sole Node ownership returned immediately. All seven final
execution hashes match before and after. This worker performed no further Node run until the explicit return of the
Node window for the resource-target correction described below.

Archived candidate-1 SHA-256 values:

- View: `989ccdad0f3fd4c564bc8a2607a379bab73f214d88f4c7302659f5e2199a36a7`
- New test: `a548a538886f75d0f9583de83dda2e47d111861499522887a91a4704167182b5`

The candidate-1 post-GREEN static audit verified all **1,494 unaffected tracked files** and all
**429 protected-subset files** remain byte-identical. Only constructor and
`exportText()` change among 40 View methods; the other 38 methods, every previous
top-level helper and the complete lexical settings/export tail remain identical.
The sole changed baseline file is the permitted View. This new test and document
are the only new deliverables.

The 215-case matrix covers 14 pre-entry source substitutions, 10 target transfers,
14 permissive admission controls, 10 genuine draft/storage states, 3 Unicode
rejections, 77 source/context callback boundaries, 14 status-adoption boundaries,
10 retirement cases, 18 original/foreign-feedback failure cases, 10 captured URL/
anchor method cases, 9 nested-call cases, 4 completed pre-invocation context
changes, 8 method-getter cases, 3 translated-feedback cases, 4 newer genuine edits,
2 throwing-cleanup cases, 2 stale metadata-getter cases and 3 post-activation or
late-cleanup independence controls.

## Anchor-target correction and final candidate 2

Further review exposed a distinct resource boundary: the View's construction source
can stay intact while the body-append callback changes the newly created anchor's
URL, download filename, parent or owner document. Capturing its click method alone
does not prove that this disposable anchor still describes the intended download.

Twelve new cases were appended without changing the original 215-case prefix:
four direct URL/name/parent/document substitutions, four one-shot getters returning
stale original property values, and four anchor-property getters changing the View
source. The original candidate produced **227 tests / 215 pass / 12 fail**, zero
cancelled/skipped, exit 1, **1128.318526 ms**. The expanded unchanged baseline was
**40 pass / 187 fail**, zero cancelled/skipped, exit 1, **1381.77275 ms**.

Candidate 2 adds only a final anchor predicate immediately before the captured
click. It checks the exact allocated URL, fixed filename, original document and
captured append target, then source currentness. The predicate runs twice to reject
the demonstrated one-shot stale property reads. Already-issued click semantics and
original resource reclamation are unchanged; an abandoned anchor does not acquire
new status-reporting authority.

Its first six-file run was **749 tests / 745 pass / 4 fail**, zero cancelled/skipped,
exit 1, **6860.579552 ms**. Every unwanted activation was suppressed. The four new
failures came from counting the test's own transfer-unlink as an export cleanup:
the fixture used the anchor's instrumented `remove` wrapper to simulate transfer.
The new transfer helper now performs the actual unlink through the unchanged
Element prototype and recursive adoption before appending. Export's captured
cleanup is still instrumented and asserted exactly once. This changes only the
appended new fixture; candidate-2 production bytes and all existing assertions
remain unchanged. Both full reports and the original fixture are retained.

The exact final 227-case bytes were then run against both archived sources:

- Candidate 1: **215 pass / 12 fail**, zero cancelled/skipped, exit 1,
  **1104.586361 ms**.
- Original baseline: **40 pass / 187 fail**, zero cancelled/skipped, exit 1,
  **1269.075411 ms**.

The same explicit six-file command shown above then passed **749/749**, zero
failed/cancelled/skipped, exit 0, **6844.308989 ms**. This is **227 new cases and
522 unchanged compatibility cases**. The final REDs and GREEN use identical test
bytes, whose original 215-case prefix remains byte-identical. All seven execution
hashes match before and after the final run.

Final frozen SHA-256 values:

- View: `a9f64b579c6ce0467902db721fe12fae12c3d67c9b5551fecf7bf1173019961e`
- New test: `e82c072df5fa7cc371ed2897dd141c8d41338e4c928638bb3aab45c3f8561b00`

Sole Node ownership was returned immediately at this first final candidate-2 GREEN.
This worker performed no subsequent Node command, including syntax, full or scale
runs. The final static/hash audit again verifies all **1,494 unaffected tracked
files**, all **429 protected-subset files**, all **38 unaffected View methods**,
every existing top-level helper and the complete lexical settings/export tail are
unchanged. Only constructor and `exportText()` change among the 40 View methods.
The manifest remains 1.1.155 and no old test or helper was edited.

This is deterministic DOM-model/file-resource validation, not a native Chrome
browser/download test, screenshot, full repository pass, Python check, runtime
package or release result. No OS clipboard, network, new permission, fallback
command, user device or paid platform was used. Independent review, broader
regression, packaging, exact remote CI, master/runtime hash readback and frozen
Release verification remain separate coordinating-task gates.

## Independent owner review and final gates

A separate 37-case source/resource review first reproduced 35 failures against the
unchanged baseline and passed all 37 against candidate 1. Expanding that review to
41 exposed four real remaining failures: append-time replacement of the allocated
anchor URL, filename, same-document parent or cross-document parent. Candidate 1
passed 37/41 (304.777071 ms); the original baseline passed 2/41 (298.59583 ms).
These observations prompted the narrowly scoped final anchor predicate above.
The independent 41-case suite then passed 41/41 (297.441651 ms). The original
failures, candidate sources and exact test bytes are retained as local evidence.

After the implementation worker ended all source, test and document writes, the
owner verified the frozen candidate with sequential, explicit-file test commands:

- 41 focused repository files: **2345/2345**, no failures, cancellation or skips,
  **30008.548698 ms**. All 42 source/test execution hashes remained unchanged.
- 21 explicitly enumerated independent regression files: **1031/1031**, no
  failures, cancellation or skips, **17475.67082 ms**. Every absolute path was
  verified before execution; no historical fixture glob was used.
- Python unit tests: **84 passed**, **1.996 s**.
- Package build and verification: **133 runtime files**, **4,073,699 source bytes**;
  runtime SHA-256 `020fe1e96e95e475721836272519a8bf0c0e7e2857607d8555886397e93e3c75`.
- Production and new-test syntax checks both passed.

Independent static review confirms only constructor and exportText changed among
40 View methods. The other 38 methods, all pre-existing top-level helpers and the
settings/export tail are identical. All **1,494 unaffected tracked files** match
the baseline. The owner's canonical protected inventory contains **499 files**,
all unchanged; this extends the implementation worker's 429-file subset. Every
old test and helper remains byte-identical.

These local gates do not claim a full local suite or native browser run. Full
repository acceptance remains the unchanged exact-commit GitHub workflow after
publication. Manifest 1.1.155 and the existing frozen Release are unchanged.
