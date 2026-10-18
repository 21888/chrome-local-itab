# Scratchpad Controller construction-source validation

## Scope and actual boundary

This change binds a Scratchpad Controller to the Store object and backend object supplied at construction. It prevents a later assignment to public `controller.store` or `store.backend` from making that existing editor read or write a different source. A new Controller deliberately constructed with another Store continues to work normally.

The reproduced boundary is public-field fault injection. It is **not evidence that ordinary workspace navigation replaces these fields or loses Scratchpad history**. Production workspace backends close over their Session identity; navigation coordinates pending work and creates a new page. Neither Store transaction ownership nor that navigation workflow is changed here.

Only `shared/local-scratchpad-controller.js` changes at runtime. Store, View, Tasks, schemas, keys, locales, workspace code, packaging, workflows and manifest are unchanged. There are no task receipts, source setters, additional global Session availability checks, adapter freezes, or same-source read-ordering changes.

## Scratchpad-specific contract

- Construction Store/backend identity is private. Each storage entry point checks ownership before new I/O. A mismatched source rejects with the existing `UNAVAILABLE` code without replacing prior real state, draft, errors or conflict feedback.
- The original subscription belongs to the Controller. Its callback cannot refresh a replacement source. Destruction releases that subscription exactly once, even if the public unsubscribe wrapper was replaced. The public wrapper remains usable for existing callers. Retirement cannot be undone by resetting the public `closed` field.
- `run`, `retry` and `useSaved` recheck after their public change notification and before dispatch. This closes the demonstrated reentrant `onChange` substitution/destruction gap.
- A pre-dispatch rejection clears temporary pending flags. `run` restores its previous status only if its temporary `saving` value still remains; a status change made by real local editing is retained. A write that never dispatched does not manufacture a write failure.
- A genuinely issued original mutation keeps its real result. While the Controller remains alive, success publishes the original saved state and derives Saved/Unsaved from the current draft. A genuine original failure preserves its original error and write-error/conflict semantics. Source substitution is neither cancellation nor rollback.
- A newer draft therefore retains a known successful original revision. Restoring the original source alone does not replay a write. Deliberate Retry can save the newer draft using the ordinary revision comparison; no blanket conflict is introduced.
- Pure reads that settle while the source is mismatched or the Controller is retired cannot publish a late state or error. Their actual original read failure still rejects its caller; a detached `refresh` success still returns its original result. Pending flags are cleaned up without replacing the retained draft or prior feedback.
- `run` finalization clears pending, pendingWrite and refreshNeeded, but cannot start a foreign follow-up read or schedule a foreign autosave. Local draft/composition editing remains available under its existing editing rules.
- Retry still recognizes exact `next.content === draft`. A committed write with a failed acknowledgement can be recognized after explicit source restoration without duplicating a successful write.
- Genuine original `WORKSPACE_SWITCH_PENDING` and `WORKSPACE_INVALIDATED` remain real availability errors. Source identity does not replace Session validation.

## Untouched-baseline RED

Before production edits, all **1,485 tracked files** matched their saved SHA-256 baseline. The original Controller and new tests were archived before executing the tests. The harness uses actual Store and Controller modules, independent synthetic fixed backends, serialized lock queues, detached read snapshots, explicit gates, real commit notifications, and controlled autosave callbacks. It does not assign Controller state, errors, status, retry state, conflict or pending flags to manufacture outcomes.

First run: **68 tests, 9 passed, 59 failed, 0 cancelled, 0 skipped**, exit **1**, duration **137.171184 ms**. The central successful-write case reproduced, for both public Store and backend replacement:

- Original source: **2 locks, 3 reads, 1 write, 1 commit**.
- Foreign source: **1 lock, 1 read, 0 writes**.
- Returned mutation and original storage held the requested original text.
- Notification-driven final refresh replaced the Controller draft with `foreign saved note` and reported Saved.

Other actual failures covered initial foreign subscription/read admission, later entry points, retained subscription callbacks, delayed read publication, reentrant pre-dispatch changes, autosave, and private retirement/unsubscribe ownership. Delayed `retry` and `useSaved` read failures also changed feedback after destruction. Genuine Session errors, intentionally constructed new-source Controllers, and the existing closed-refresh behavior were positive controls.

Twelve probes were then appended without changing the first 68: equal-revision foreign write admission, a newer non-composing draft followed by deliberate Retry, destroyed issued writes, and repeated unsubscribe cleanup. The expanded run remained on unchanged production: **80 tests, 12 passed, 68 failed, 0 cancelled, 0 skipped**, exit **1**, duration **153.669599 ms**. Both RED reports are retained independently.

The exact focused command for both RED runs and first GREEN was:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-scratchpad-controller-source.test.js
```

## First focused GREEN and freeze

The first approved Controller implementation passed the byte-identical expanded suite: **80/80 tests**, **0 failures, cancellations or skips**, exit **0**, duration **122.149201 ms**. It was frozen immediately for independent review; the test-execution window was returned without running old tests, the full suite or scale tests.

The 80 probes include both Store and backend substitution, normal and equal revisions, original success/rejection/lost acknowledgement/dropped write/verification-read failure, real notification-driven refreshNeeded, real CAS conflict, exact content-based Retry, newer composing and non-composing drafts, delayed reads and destroyed lifecycles, reentrant `onChange`, timer firing, intentional new-source construction, unsubscribe ownership, and actual Session suspension/invalidation.

At this freeze, **1,484 of 1,485 tracked baseline files** were unchanged; the sole changed tracked file was Controller. All **494 protected files** were byte-identical, including all pre-existing tests, helpers, Store and View. No existing test was changed. `git diff --check` passed.

SHA-256 records:

- Original Controller: `8cb897a23d49513ff49f178cd1b85153c471e5fe7beadccfb8be8e98c8c1a8f4`
- First 68-test suite: `e9fafb517183ca8da5150cd7e9ffa87058c40c67b4ce695406f0145b02e29d53`
- First RED report: `21d4a0ccec6eeb97a8e3eab1625b6b08127c2681bb4e00aa0fe1fcb4c9a4d24f`
- Expanded 80-test suite, unchanged for GREEN: `1b9b200ba20b28403891a3e05c7381a66fa86b2d7094806b350a70bf22e1f474`
- Expanded RED report: `374dae05b39fb825384479edb3b7d4e0de82044a3216c5ce44292f17260a8508`
- Frozen Controller: `40a79cf068e33afe3bb46a80fb7a7395820753c9b7387a66e1ec79fd44c05528`
- First GREEN report: `9d41624159b4bc34529845719c39632a95280b16fd33bebd3d77af00baea4fb8`

## Verification limits at the first freeze

This section records the implementation worker's first focused result. Independent audit, existing-test compatibility, broader regression testing, syntax checks, Python/package verification and exact-commit CI are not included in that result. No browser, native Chrome, screenshots, user device, paid platform, commit, push, tag, GitHub Release or store publication was performed in this implementation window. Manifest version remains `1.1.155`.

This change does not alter same-source read ordering; no separate same-source freshness defect was established in this validation. Current Store reads and complete mutation/readback transactions use the same exclusive backend lock. No read sequence counter is introduced.

## Independent owner audit and existing regression gate

The independent audit used a separately authored Controller/backend harness. Its initial eight probes passed (126.222223 ms); the final 24 cover original notifying success and lost acknowledgement, a newer real draft and deliberate exact-CAS Retry, real timer admission, delayed refresh/retry/useSaved success and failure preserving genuine prior WRITE feedback, real callback editing during pre-dispatch rejection, private subscription retirement, and intentionally constructed new-source Controllers. No Controller state, error, status or pending flag is manufactured.

Those 24 and the 789 current retained Store/Tasks independent probes passed together: **813/813**, no failures, cancellations or skips, exit 0, **15711.871582 ms**. A draft expectation that had never been executed was corrected to the agreed genuine-success/fresh-revision contract before the first independent run; it is not represented as a failed regression.

The explicit 36-file compatibility selection passed **1654/1654** tests, no failures, cancellations or skips, exit 0, **24969.609081 ms**. It comprises all ten Scratchpad suites (including this change), three workspace suites, two AI-context suites, and 21 complete-backup suites. All 37 source/test execution hashes still matched after the run. Both changed JavaScript files passed syntax checks. All 494 protected files and 1484 unaffected tracked baseline files remained byte-identical. Four existing Controller methods (subscribe, dirty, hasUncommittedWork and cancelTimer) remained byte-identical.

Python passed **84/84** tests in **1.840 s**. Local package construction and independent package verification both passed with **133 runtime files**, **4055813 source bytes**, manifest **1.1.155**, archive SHA-256 `b1a8975d846cb4e7691fe2eb8c4549b80fd7b17c6586a09e8602e16e24a787ed`. This pre-commit archive is local evidence, not a published Release. No local full/scale Node suite was launched and no old test or helper was adjusted.

Exact-commit remote CI remains a separate mandatory delivery gate; the numbers above are only the completed local evidence.
