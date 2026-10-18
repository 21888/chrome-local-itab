# Scratchpad View lifecycle source validation

## Scope and caller evidence

This change binds one Scratchpad View's subscribed rendering, direct rendering,
departure-work query and teardown to its construction source. The production
change is limited to `shared/local-scratchpad-view.js`. Store, Controller, Tasks,
settings mounting, schemas, keys, locales, manifest and workflow files are frozen.
The manifest remains 1.1.155; this focused validation does not publish a Release.

`newtab.js` mounts one Scratchpad card with `LocalItabScratchpad.mount`; its
`onVisibility` callback updates module visibility. `options.js` mounts the separate
settings view. That settings renderer, query and destroy closure already capture
the lexical Controller and are outside this change. `shared/local-content-lifecycle.js`
uses the View's work query for reload protection. The actual workspace transition
in `shared/workspaces-view.js` waits for pending work, flushes the original Session,
offers a draft decision when needed, selects the destination and navigates. It does
not retarget an existing Scratchpad View by assigning its Controller field.

The source substitutions in these tests are deliberate public-field fault injection.
They demonstrate an ownership boundary, not ordinary workspace-switch behavior or
historical personal-data loss. Tests use deterministic synthetic text only.

## Reproduction method

`tests/local-scratchpad-view-lifecycle-source.test.js` uses the actual Scratchpad
Store and Controller and the unchanged `tests/helpers/task-dom-model.js`. Backend
locks serialize real reads and mutations. Deferred read/write gates and real
backend failures produce initial errors, dirty work, conflicts, pending writes and
lost acknowledgements; tests do not assign Controller state/error/pending/conflict
fields. Real `Workspaces.Session` instances supply suspension and invalidation
failures. Each foreign source has its own Store and Controller, and a deliberately
new foreign View continues to work normally.

The sole command for the new focused suite is:

```
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-scratchpad-view-lifecycle-source.test.js
```

All source and test bytes were archived with the full unchanged-source RED output
and SHA-256 evidence before the first production edit. At RED, all 1,487 tracked
files and 495 protected files matched their baseline hashes. Baseline View SHA-256:
`f66b2ed4feb4154569c4387e090bdf7593539be7680c6b29b3faead4c2ea1339`.

## Unchanged-source result

The initial 51-case run had 43 failures and 8 passes, with no cancelled or skipped
cases. Direct and subscribed render placed the foreign draft and saved text in the
original card. Replacing the public Controller caused real original dirty, composing,
write-error, conflict and pending work to lose the departure warning; each combined
query/beforeunload probe asked the foreign Controller twice. Destroy closed the
foreign Controller and left the original open. Replacing the public unsubscribe
also released the foreign View subscription instead of the original. A listener or
unsubscribe cleanup exception prevented remaining original teardown.

The baseline already passed the independent nested `onVisibility` edit test. Its
nested render leaves the latest same-source draft displayed; no stale-state token
is justified by that case. Baseline positives also include detached/hidden original
write settlement, initial and passive READ errors, real Session suspension and
invalidation, exact content, IME completion, focus and conflict saved preview.

## Intended contract

- Pin construction Controller, Store, backend, workspace object/id/generation,
  Session identity, construction document, original host and rendering controls in a private lifecycle
  record. Source replacement cannot gain authority through a later render.
- Check identity before admitting a subscribed callback or starting a direct
  render, and again after public `onVisibility` before subsequent effects. The host
  and every pinned rendering node must retain the construction `ownerDocument`;
  same-document detachment remains allowed. Restoring
  the original identities allows normal rendering to resume.
- Identity is not availability: detached/hidden hosts and original Session errors
  still render. No blanket connectivity, document visibility, suspension or
  invalidation gate is added.
- The work query asks only the original Controller until private retirement. It
  preserves actual original work without importing a foreign draft's warning.
- Destroy retires before any cleanup callback; original UI ownership, listeners,
  subscription and Controller are cleaned once. Public handle replacement and
  resetting `closed` do not redirect or repeat teardown. Other original cleanup
  continues after an exception, and the first exception remains visible.
- A dispatched original mutation may still commit or fail after destroy. Teardown
  prevents late display publication; it cannot cancel or roll back that mutation.

## Verification boundaries

This is a focused deterministic DOM-model suite, not native Chrome coverage or a
full repository regression pass. No old tests or helper files are changed. Clipboard,
export, import and ordinary input action admission are outside scope. The lifecycle
may retire their existing UI ownership during teardown or a rejected render, but it does not redesign
those action paths. Publication, packaging, full exact CI and independent old-test
regression checks belong to the coordinating delivery task.

## Candidate 1 and independent review

After approval, the first implementation run passed all original 51 cases with
zero failures, skips or cancellations. Node execution was returned immediately.
Candidate 1 source/tests/document and its full GREEN log were preserved.

Independent review then ran 30 owner probes: 28 passed and two failed. Both failures
showed the same original host subtree being adopted into another document, after
which subscribed or direct rendering still repainted it. Stable node references
alone did not preserve document ownership.

Nine new regressions were appended without changing the original 51 assertions.
They model adoption by removing a node, recursively changing `ownerDocument`, and
appending it to another document. The exact original host, textarea and status are
covered in direct/subscribed rendering and adoption during `onVisibility`. Real
`Controller.setDraft` notifications create the newer draft; no Controller state is
fabricated. Original and foreign raw bytes and I/O counts remain asserted. Restoring
the original document resumes rendering. Candidate 1 produced 51 passes / 9 failures
in this expanded 60-case RED.

The independent review initially also expected a generic WRITE status after a
same-document detached write lost its acknowledgement. That expectation failed on
both original baseline and candidate 1: the real notification/refresh produces a
retained WRITE error plus conflict, displaying the conflict message and Use saved
control. Only that newly written independent probe was corrected to match verified
original semantics. This was not a production regression; no existing test or
Controller behavior was changed to satisfy it. The independent original and baseline
failure logs were retained.

## Candidate 2 focused result and compatibility regression

Candidate 2 added only construction-document capture and `ownerDocument` checks on
the original host and pinned rendering nodes. Its first expanded run passed all 60
cases, with zero failures, skips or cancellations. Existing same-document detached
success/failure positives continued to pass. No render token was added. Candidate 2
and its expanded RED/GREEN evidence remain archived.

The coordinating task then ran 37 old compatibility files: 1,714 tests, 1,707 passes
and seven failures in 25,681.447512 ms. All old files remained byte-identical. The
failed old saved-copy assertions covered pending and settled feedback after a closed
Controller or a workspace ABA observed by render. The failed old selection-copy
assertions covered workspace ABA, a missing Session and a replacement Controller.

This was a genuine candidate 2 regression: source-rejected subscription admission
and direct rendering returned before the existing render could invalidate its owned
copy feedback. Restoring the old source could therefore revive a stale receipt. The
old assertions were preserved, and the full 37-file failure report was retained.

## Candidate 3 repair and final focused compatibility result

A private lifecycle retirement helper now runs at rejected subscription admission,
rejected direct render and the post-`onVisibility` rejection. It expires only a receipt
proven to belong to an original copy control or original saved/selection owner.
It leaves `copyAttempt` untouched until the actual clipboard promise settles and
never calls dynamic `refreshCopyControl` or queries the foreign Controller.

The old receipt is detached before its cleanup callback. After cleanup, feedback is
cleared only if no newer receipt exists, the public status still identifies the
original node, and that node remains beneath the original host and complete original
same-document ancestor chain. Adopted or substituted status nodes, a host/status
moved into another parent, and newer receipts installed by reentrant cleanup are
preserved. Foreign receipt cleanup is never invoked.

Fifty-four focused cases were added to the existing 60 without altering their
assertions. They use real Store/Controller operations, real deferred clipboard
promises and deterministic DOM-model source changes. On unmodified candidate 2,
the 114-case expanded suite produced 63 passes / 51 failures. After the minimal
repair, the first requested three-file run passed all 510 tests:

```
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-scratchpad-copy-saved.test.js tests/local-scratchpad-copy-selection.test.js tests/local-scratchpad-view-lifecycle-source.test.js
```

That comprises 396 unchanged old copy assertions and 114 new lifecycle cases, with
zero failures, skips or cancellations. Node execution was returned at first GREEN.
No full or scale suite was run by this implementation worker. Earlier package
artifacts predate this repair and require regeneration by the coordinating task.

Frozen production View SHA-256:
`4abd35ad6bdc489b775cd3080e61974c4cfcb50b33e317e315692b85a8014852`.

Frozen expanded new-test SHA-256 (identical in final retirement RED and GREEN):
`a5dfaf1c16e1106f897fa1b492f5b022d01392334f0e5dede6d1af06df669e87`.

The candidate 2 60-case test prefix remains byte-identical, as do the original
51-case assertions. All 495 protected files still match their baseline; only the
permitted View production file differs among the 1,487 tracked files.

This restores lifecycle-driven feedback invalidation; it does not redesign copy
admission or add a private registry of active clipboard transactions. Replacing
public receipt fields can still obscure the original transaction from this lifecycle
path. That broader transaction boundary remains outside this change and is not
claimed as fixed. A clipboard write already issued and an original Store mutation
already dispatched cannot be cancelled by this lifecycle retirement.

## Final independent owner audit and compatibility gate

After candidate 3, the separate owner harness passed **38/38** cases (311.784993 ms). In addition to the lifecycle, source, document-adoption and original-write cases, it exercises all three real copy routes in pending and settled states, retained single-flight ownership, a substituted real foreign receipt, and a real cleanup callback installing a different receipt/status. The original Controller draft and both stores remain independently checked. No Controller status or storage outcome is fabricated.

The current 38 cases and 813 retained independent Scratchpad/Tasks probes passed together: **851/851**, zero failures, cancellations or skips, exit 0, **15765.043318 ms**. The earlier 843-case result covered candidate 2; it is retained separately and is not substituted for this final run.

The exact same 37-file compatibility selection that exposed the seven regressions was rerun against candidate 3 and the expanded new suite: **1768/1768** passed, zero failures, cancellations or skips, exit 0, **25898.648049 ms**. All 38 source/test execution hashes matched afterward. Both changed JavaScript files passed syntax checks. All 495 protected files and 1486 unaffected tracked baseline files remained byte-identical. The 36 View methods outside constructor, render, hasUncommittedWork and destroy are byte-identical, as is the complete lexical mountSettings/export tail. No old assertion, fixture or helper was modified.

Python was rerun: **84/84** passed in **1.828 s**. The package was regenerated and independently verified against candidate 3: **133 runtime files**, **4061919 source bytes**, manifest **1.1.155**, SHA-256 `c3f46faa4472f1b79b178fb9c8f3b6265c371499421772475db6aa00090da17a`. Earlier candidate package artifacts remain preserved. This is local evidence only; no Release was published.

Exact-commit full remote CI is the separate mandatory delivery gate. No local full/scale Node suite, native browser, screenshot or store publication is represented by these focused results.
