# Scratchpad import source and target ownership

## Scope and existing import contract

Feature 98 binds Scratchpad TXT chooser, asynchronous file read, preview, mode
selection, cancellation and confirmation to the View's original source and UI.
Production edits are limited to `shared/local-scratchpad-view.js`: private import
ownership helpers, constructor capture, the eight existing import methods and one
private import retirement statement in `destroy()`. General rendering, teardown
DOM writes, ordinary input, find, clipboard, export, settings, Store, Controller,
workspace navigation, schema, storage keys, permissions, locales, manifest and
workflows are unchanged. The coordinating owner later updated only the two
implementation-string assertions in one existing View test after a reproduced
failure and explicit approval; its original no-network/no-storage assertion
remains unchanged. The manifest remains 1.1.155.

The original import contract is stricter than export recovery: the Controller must
be loaded, enabled and clean, with no pending operation, error, read error or
uncommitted work. A chooser and every subsequent file selection capture a saved
state reference and edit generation. Editing, including edit then undo, IME,
refreshed/remote state, read errors, cancellation, another chooser or selection,
and destruction invalidate earlier work. Choosing and previewing never write.
Confirmation hands one exact result to the existing Controller draft/save path;
Store CAS and verified readback remain the authority for saved status.

`newtab.js` awaits workspace mounting before creating the Scratchpad View, and
`options.js` separately initializes its settings view after workspace mounting.
Normal workspace switching coordinates pending work, flushes the original Session,
selects the destination and navigates to a new page. It does not retarget an
existing Scratchpad View by replacing its public fields. Import therefore retains
the construction workspace object, ID, generation and global Session identity,
consistent with the existing View render lifecycle. A construction source with no
workspace or global Session remains supported. No visibility, connectivity,
suspension or invalidation availability flag is introduced into import admission;
actual backend availability remains the Store/Session's responsibility. Export's
separate per-invocation recovery policy is unchanged.

Public-field substitutions and synchronous callback injections below are synthetic
robustness probes. They are not evidence that normal navigation loses data, or
that this boundary caused a historical upgrade or personal-data-loss incident.

## Ownership behavior

- Capture the original Controller, Store, backend, host, construction document and
  nine import-related node chains privately: editor, import button, file input,
  panel, information, preview, append checkbox, confirmation and Cancel controls.
  Construction capture precedes previous-owner invalidation callbacks.
- Source admission checks those identities and each complete original chain twice.
  Original detached fragments remain eligible; a new parent or document does not.
  This reuses the existing conservative detached-chain predicate: even ancestors
  beyond a detached break must retain their original ownership. It is not a new
  general DOM-fragment or hostile-accessor security model.
- Keep private selection authority and decoded text separate from the public
  `importSession` mirror. Replacing that mirror or modifying its state, generation,
  decoded text or filename cannot authorize confirmation. A later selection
  permanently retires the previous private token. Observed ownership loss cannot
  revive that token by restoring a public field.
- Revalidate after file-list/property access, arrayBuffer method access and
  completion, byte-length access, decoder construction/method use, translation,
  Blob metadata construction and each UI setter. File metadata and the read method
  are obtained from the original chosen file with the original receiver.
- Keep existing single-file UTF-8 `.txt` validation, byte preflight and returned
  buffer checks, fatal UTF-8 decoding with `ignoreBOM: true`, Unicode limits, exact
  whitespace, BOM, CRLF/CR/LF and literal markup. Preview and filename remain text.
- Append preserves both strings and inserts one LF only between adjacent nonempty
  strings without an existing boundary newline. The complete result is validated
  against the original limits, and mode changes are checked during preview and
  result calculation. Empty replacement and append retain their existing behavior.
- Cancel retires private authority before translating labels or writing controls.
  Each original target is checked separately; moved/adopted targets and substituted
  public target handles cannot redirect cleanup. An epoch prevents an older Cancel
  from clearing a synchronously opened newer chooser. Focus restoration uses only
  the original owned button/editor and rechecks source, saved state and generation.
- Apply rechecks the captured state/generation after Cancel and before invoking the
  captured original Controller's `setDraft`. Once the Controller accepts the draft,
  its ordinary semantics apply. Both its synchronous notifications and editor focus
  may create another edit; explicit `save` requires the same original state, exact
  accepted import string and exactly one expected edit-generation increment.
  A newer callback-created draft is not overwritten or explicitly saved by the old
  import. Existing Controller autosave scheduling is not redesigned.
- Destruction clears private import authority immediately after the existing private
  lifecycle retirement, before callbacks. Existing independently owned teardown
  writes remain unchanged. A reset public `closed` cannot revive a retired import.
- An original Store mutation already issued may still commit or fail. This change
  does not cancel or roll it back, add receipts, duplicate append on Retry or alter
  conflict recovery, original draft retention or verified acknowledgement rules.

## Real Store/Controller reproduction

The new `tests/local-scratchpad-import-source.test.js` runs production Store and
Controller code with independent synthetic backends, serialized lock queues,
actual subscriptions, deferred file/storage operations and actual backend failures.
Dirty work, read/write errors, conflict, lost acknowledgements, dropped writes and
pending writes are produced by real operations. Controller state, errors, pending,
conflict and Retry fields are not fabricated to obtain those outcomes.

The unchanged DOM helper does not automatically detach or adopt appended nodes.
Every transfer in this suite explicitly removes the node, recursively sets the
new document for cross-document adoption, then appends to its new parent. Genuine
same-document transfer uses a second View in the original document. Assertions
compare scalar state and explicit identity booleans, avoiding recursive DOM
comparisons. All note contents and filenames are synthetic.

Before production editing, all **1,497 tracked files** were hashed and the complete
original View was saved. A **432-file protected subset** covers all previous tests
and helpers, workflows, locales, manifest, Store, Controller and Tasks sources.
The untouched View SHA-256 is:

`a9f64b579c6ce0467902db721fe12fae12c3d67c9b5551fecf7bf1173019961e`

### Untouched-source RED

The sole initial new-suite command was:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-scratchpad-import-source.test.js
```

Result: **176 tests / 63 passed / 113 failed**, **0 cancelled/skipped**, exit **1**,
**1097.470647 ms**. All 1,497 tracked files remained byte-identical to the baseline.
The new-test bytes were not edited between this RED and candidate 1.

Observed failures include opening a chooser through substituted construction
sources or controls; clearing transferred new-owner preview/control values;
confirmation through mutable public payload data; late file/decoder/Blob feedback
under changed ownership; and Cancel/focus callbacks redirecting Apply into a foreign
Controller or overwriting/saving a newer genuine draft. Existing byte validation,
CAS, Retry and several genuine invalidation positives passed on the baseline.

### Candidate 1 and actual old-test mismatch

The next command ran the new suite and the complete existing View suite together:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-scratchpad-import-source.test.js \
  tests/local-scratchpad-view.test.js
```

Result: **234 tests / 233 passed / 1 failed**, **0 cancelled/skipped**, exit **1**,
**4423.974262 ms**. All **176 new tests passed**. Of the 58 previous View tests,
57 passed and one static implementation-string assertion failed. The failing
case is “Import text adds no network, storage keys or permissions and uses
controller save”: it requires the literal `this.controller.setDraft(text)` at
line 237, followed by a literal `this.controller.save()` assertion. The new
implementation captures the original Controller and its methods, then invokes
`setDraft.call(c, text)` and `save.call(c)` after ownership checks. It does not
retain a dynamic public Controller call or add dead code/comments to satisfy the
old string search. The existing no-network/no-storage checks still pass.

The complete failure and unmodified old test are retained and the mismatch was
reported to the coordinating owner. The root explicitly approved a purpose-
preserving adjustment to those two implementation-string assertions. The owner
made that change personally, requiring construction-lifecycle Controller capture,
captured `c.setDraft`/`c.save` methods and calls with receiver `c`. The original
no-network/no-storage assertion remains unchanged. This implementation worker did
not edit any old test or helper. The original combined run is not represented as a
fully passing compatibility gate.

Candidate 1 coverage includes all source/control replacements, pending completion
and confirmation, same- and cross-document transfers, public receipt substitution
and payload mutation, file/property/decoder/Blob/translation/focus callbacks,
Cancel-setter reentry, real newer Controller edits, exact text and append edges,
original validation, unseen CAS, failed writes, lost acknowledgements, dropped
writes and an already-dispatched successful original write with a newer draft.

## First freeze and verification limits

The implementation returned the exclusive Node execution window immediately after
candidate 1's result. Source and tests were frozen for independent review; only this
validation document was then authored. `git diff --check` passed. Of 1,497 tracked
baseline files, 1,496 remain unchanged; the sole changed tracked file is View.
All 432 files in the protected subset remain byte-identical.

SHA-256 evidence:

- New test, identical for RED and candidate 1:
  `8b12f891951168f734a254cecb73a2ce7dc97d8f9cda40414279198650f7291a`
- Untouched-source RED output:
  `20603c3fa89ba6efd00f20f05a871b2aedbea6e4540707e4c757ac3d9442d4f0`
- Candidate 1 View:
  `474caf246014d256c1ebacb2306231ad74a990905166c88d9091d13b35267e52`
- Candidate 1 combined output:
  `9d2c8769d19b169cc2ead0a1c5ff25628709cbaa1f23f844f905831a1d1b1335`

These are focused deterministic checks, not native Chrome/file-picker, IME,
assistive-technology, screenshot or full-suite evidence. No browser, user device,
paid platform, local full/scale run, npm command, schema/settings/manifest/workflow
change, commit, push, tag or Release was performed by this implementation worker.
Independent audit, broader regression, packaging, exact remote CI and publication
remain coordinating-owner gates.

## Approved compatibility rerun and final implementation freeze

After the owner applied the explicitly approved old-test assertion update, the
implementation worker was given the exclusive Node window once more. No production
or new-test edits were made. The exact focused command was:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-scratchpad-import-source.test.js \
  tests/local-scratchpad-view.test.js \
  tests/local-scratchpad-view-lifecycle-source.test.js \
  tests/local-scratchpad-teardown-targets.test.js \
  tests/local-scratchpad-export-source.test.js \
  tests/local-scratchpad-controller-source.test.js \
  tests/local-scratchpad-store.test.js
```

Result: **803/803 passed**, **0 failures, cancellations or skips**, exit **0**,
**7537.592275 ms**. All eight source/test execution hashes matched before and after
the run. The exclusive Node window was immediately returned. This is seven
explicit related files, not a full local suite, scale test or native browser run.

- Production View remains
  `474caf246014d256c1ebacb2306231ad74a990905166c88d9091d13b35267e52`.
- New 176-case test remains
  `8b12f891951168f734a254cecb73a2ce7dc97d8f9cda40414279198650f7291a`.
- Owner-approved existing View test is
  `a9b72afc0c5718efedc52ee02ca63ddec89968a7ad0da4a239b22be8cb01c743`.
- Full successful rerun output is
  `ec9f79ca3aac8e37ed0a0315f0dfbcd051f936951545b6155f0789b3bc16c7c6`.

At final implementation freeze, 1,495 of 1,497 original tracked files remain
unchanged. The only tracked differences are the production View and the owner's
approved existing static-test case. Of the 432-file protected subset, 431 remain
identical; the sole exception is that approved old test. The new regression file
and this validation document are the two added files. All helper files remain
unchanged. Independent owner review and final delivery evidence will be recorded
separately after this worker stops all source, test and document writes.

## Independent owner gates

A separate owner suite exercised real original and foreign Store/Controller pairs.
Its first 46-case run passed 45 cases; one new fixture triggered its editor-focus
hook during Cancel's earlier focus restoration, before the draft handoff it meant
to test. The original log and fixture are retained. The fixture now arms that hook
only once the genuine imported draft has been accepted, preserving the separate
Cancel-time callback coverage. No production or existing test was changed for this
new-fixture correction.

Three further cases verify actual original Controller method receivers and counts:
normal confirmation calls original setDraft/save once each; replacement before
entry calls neither; replacement during the genuine original setDraft calls that
method once but does not call save. Foreign setDraft/save counts are zero in all
three cases, with foreign raw content and all I/O counters unchanged. This verifies
the approved static assertion update's behavior rather than just its spelling.
The full independent 49 cases reproduce **14 pass / 35 fail** on the untouched
source (**336.90767 ms**) and pass **49/49** on the candidate (**385.444527 ms**).

Final sequential owner gates after all implementation-worker writes stopped:

- 22 explicitly enumerated independent files: **1080/1080**, no failed, skipped or
  cancelled tests, **18272.740958 ms**. All absolute file paths were checked first.
- 42 explicit repository files: **2521/2521**, no failed, skipped or cancelled tests,
  **31400.260353 ms**. All 43 execution source/test hashes remained unchanged.
- Python: **84 tests passed**, **2.018 s**.
- Package build and verification: **133 runtime files**, **4,081,667 source bytes**;
  runtime SHA-256 `674d3bc24b01a0f28fd6a5d3133bfb7624e933e43ec17e01f2049b3c7d4ba489`.
- Production, new-test and approved old-test syntax checks passed.

Static comparison verifies the constructor, eight import methods and the one
private import-retirement addition in destroy are the only changed View methods;
30 methods are identical. All pre-existing top-level helpers, fallback strings
and settings/export tail are unchanged. **1,495 unaffected tracked files** match
the 1,497-file baseline. The canonical **500-file protected inventory** has only
the approved old static-test difference; the other **499 files** are identical.
The old View test is byte-for-byte its baseline after replacing exactly the two
approved source-string assertions; its other 57 cases and its no-network/no-storage
assertion remain unchanged.

These are focused local gates. Full acceptance still requires the unchanged
exact-commit GitHub workflow, runtime hash readback and frozen Release verification.
No native browser run, screenshot or full local/scale test is claimed.
