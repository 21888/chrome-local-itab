# Scratchpad copy transaction validation

## Scope

Feature 94 closes the public `copyAttempt` / `copyReceipt` transaction boundary
explicitly left outside feature 93. Only `shared/local-scratchpad-view.js` may change
in production. Store, Controller, Tasks, ordinary input/import/export/find behavior,
settings mounting, schemas, keys, locales, manifest and workflows are frozen.
The manifest remains 1.1.155. This worker does not publish a commit or Release.

These tests deliberately assign public fields. They demonstrate a transaction
ownership fault, not ordinary production workspace navigation and not a historical
personal-data-loss cause. Tests use synthetic contents, the real Store/Controller,
the unchanged deterministic DOM helper, and explicitly gated real Promises. A real
backend update creates the saved conflict; no Controller state/error/conflict/
pending/retry outcome is fabricated. No OS clipboard or native Chrome is used.

## Unchanged-source diagnosis

The original View uses public `copyAttempt` as its shared single-flight lock and
public `copyReceipt` as its feedback/cleanup reference. Nulling the first during an
issued clipboard promise admits a second real call. Nulling the second hides the
original observer/listener resources from invalidation, lifecycle retirement and
teardown. Substituting a genuine receipt from a second independent View can make
generic invalidation call that foreign receipt's cleanup. Promise finalization
calls a dynamic refresh using publicly replaced controls.

The complete corrected unchanged-source run contains 66 cases: 9 pass, 57 fail,
zero cancelled or skipped, exit 1, 419.01081 ms. It also demonstrates matching
foreign-Controller acknowledgement, pre-reservation DOM-getter reentry and cleanup
reentry that clears newer feedback. Positives preserve the exact raw current CRLF,
exact selected DOM slice and exact raw validated saved payload, existing shared
locking, explicit next copy, and one captured clipboard method/receiver.

All 1,489 tracked files and 496 protected files matched their baseline hashes before
production edits. The original View SHA-256 is
`4abd35ad6bdc489b775cd3080e61974c4cfcb50b33e317e315692b85a8014852`.
Unchanged source, test snapshots, execution hashes and every full RED log are
archived with the coordinating task's evidence.

### New-test diagnostic corrections

The first foreign-visibility probe incorrectly broadcast a same-document event to
both independent real Views, which legitimately invalidates both. The corrected
probe invokes only the previously captured original visibility callback. The new
cleanup-reentry callback was made one-shot so recursive baseline invalidation is
bounded. Finally, assertions comparing large cross-realm receipt graphs were
changed to boolean identity assertions; deep failure formatting had obscured the
last three reports. The full corrected run reports every case. These changes only
affect the new test file. No old assertion, fixture or helper is changed.

## Intended contract

- Separate private per-View active reservation from private feedback ownership.
  Public fields remain observable compatibility mirrors. Assignment cannot admit
  another actual write or transfer cleanup authority.
- Reserve before availability getters can reenter a different copy route. Capture
  the individual attempt's source and original targets. Full/selection admission
  retains existing late workspace/session semantics; saved copy retains its
  existing stricter construction-source rules. This is not a universal change to
  pre-dispatch source admission.
- Detach private feedback before exactly-once owned cleanup. Preserve the genuine
  owned receipt's cleanup hook, which existing reentry tests exercise; never invoke
  a foreign receipt hook. Old callbacks cannot retire a newer feedback record.
- Recheck owned source/control identities after observable getters, observer
  draining, clipboard invocation and settlement. Capture clipboard receiver and
  method once. Preserve all three route-specific payload contracts.
- Feedback invalidation cannot cancel an actual issued clipboard promise. Keep
  single-flight until actual settlement, then allow a genuine new user copy.
  Final refresh must not follow substituted controls.
- Add no permissions, clipboard reads, fallback commands, network, automatic
  retries, storage mutations or schemas.

## Verification boundary

Focused explicit Node files only, using:

```
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-scratchpad-copy-transaction.test.js
```

No local full/scale suite, native browser, screenshot, Chrome Web Store operation,
user device, paid service, commit, tag, push or Release is part of this worker's
validation. Independent review, full exact CI and publication remain separate
coordinating-task gates.

## Candidate 1 implementation and first GREEN

The approved implementation adds a private per-View active transaction and feedback
record. All three routes reserve before availability getters. Public mirrors remain
inspectable, but do not authorize admission, retirement or release. Per-attempt
source and DOM targets are captured independently of feature 93's construction
source so existing full/selection late workspace/session admission remains intact.
Saved admission retains its original stricter construction owner.

Feedback retirement detaches first, invokes only the authentic owned receipt hook,
and always runs the private idempotent resource cleanup. Each original resource
removal is attempted even if another removal throws. This preserves the existing
owned cleanup-reentry hooks without following foreign public receipt replacements.
The actual issued clipboard result is awaited in a `finally` around post-call
invalidation; cleanup errors cannot release its lock before settlement. A privately
retired View cannot be revived by resetting public `closed`.

Status cleanup retains the distinction already covered by old tests: ordinary copy
retirement clears the original captured status node; lifecycle source rejection
uses the stricter original same-document ancestor-chain check. Neither follows a
substituted public status or receipt. Final aria-disabled refresh checks original
source/control identity and private active/feedback identity before and after each
availability read and before each control write.

The first focused implementation run passed **631/631** cases, with zero failures,
cancellations or skips, exit 0, **3077.043207 ms**:

```
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-scratchpad-copy-transaction.test.js tests/local-scratchpad-copy-text.test.js tests/local-scratchpad-copy-selection.test.js tests/local-scratchpad-copy-saved.test.js tests/local-scratchpad-view-lifecycle-source.test.js
```

That includes 66 new transaction cases and 565 unchanged existing cases. All seven
feature-93 old-copy regressions remain covered by their unchanged original files.
No old assertion or helper was edited, and no compatibility failure occurred in
this implementation run. Source and tests were frozen immediately at this first
GREEN, and the sole Node window was returned to the coordinating task.

Frozen production View SHA-256:
`e10e1c80d05658e9ac52961a10ffa7d027a63dbd4f509d345f77441e2713b54c`.

Frozen new-test SHA-256 (same final RED and first GREEN test bytes):
`f404cd6ed85d4b10eae05dbfa2ee4e45f46d250949a08ea532377cc7186e25fc`.

Post-run verification confirms all 496 protected files and all 1,488 unaffected
tracked baseline files are byte-identical. The only changed tracked file is the
permitted production View. Candidate 1 source, test, full GREEN log, execution
hashes and complete baseline comparison are retained. New test/document files are
additional deliverables. This focused GREEN is not independent review, a full
repository regression result or exact-commit remote CI.

## Independent coordinating review and final local gate

Independent review added 42 cases outside the submitted test file, using real
Store/Controller instances and synthetic clipboard promises. The matrix exercises
all nine original-route/next-route combinations under three public mirror
displacements, private cleanup with foreign receipt substitution, late completion
against a foreign pending View, cleanup reentry, availability-getter reentry, and
one exact captured clipboard receiver/method/payload for each route. These 42
passed independently (374.809061 ms); the combined explicit 18-file independent
regression passed **893/893**, zero failures/cancellations/skips,
**16354.738665 ms**.

Static review confirms the exact ten changed View methods: constructor, render,
refreshCopyControl, invalidateSelectionCopy, invalidateCopy, copyCurrent,
executeSavedCopy, copySelectedText, executeCopy and destroy. The other 30 methods
and the complete lexical mountSettings/export tail are byte-identical. All 496
protected files and 1,488 unaffected tracked files retain their baseline hashes.
In particular, the existing full/selection admission rules and their late
workspace/session setup remain unchanged; per-attempt capture is not a claim that
all pre-dispatch source-admission boundaries are now closed.

The explicit 38-file related regression passed **1834/1834**, zero failures,
cancellations or skips, **26200.489048 ms**. All 39 recorded source/test execution
hashes remained unchanged after execution. Both production and new-test syntax
checks exited 0. No previous test/helper was edited or removed.

Python unittest discovery passed **84 tests** in **1.855 s**. The existing package
builder and verifier passed for **133 runtime files**, **4,065,580 source bytes**,
runtime SHA-256
`a11b230e54244d3905e4c33f2ef974523fbdbb3033297b6ce4c77d1ea9ec5160`.
These are focused local evidence, not a substitute for the unchanged full CI.
Publication is gated on the exact remote commit's full workflow and independent
all-133 runtime hash comparison. Manifest, frozen Release, and store publishing
remain unchanged.
