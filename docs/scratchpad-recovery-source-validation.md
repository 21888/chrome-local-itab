# Scratchpad recovery-button source validation

## Scope and evidence boundary

Feature 101 binds the original Scratchpad card's Retry, Use saved text and Replace
click listeners to the View's construction source and original controls. Runtime
changes are confined to `shared/local-scratchpad-view.js`: a private recovery owner,
a shared synchronous action token, the three click closures, and constructor capture
of original DOM chains. General rendering, editor/IME listeners, Find, copy, export,
import, settings mounting, Controller, Store and workspace protocols are unchanged.

The source/control substitutions and one-shot accessor callbacks are deliberate
robustness fault injections. They do not establish that normal navigation retargets
View fields or caused historical personal-data loss. Production workspace switching
coordinates the original pending work and navigates; an old View is not a setter
for a destination workspace. All fixture text and storage snapshots are synthetic.
No personal data, credentials or user device was accessed.

## Existing contracts reviewed

- Each original button previously closed over its construction Controller, but
  consulted no View/DOM ownership before looking up and invoking the public method.
  A substituted View/controller field did not redirect that lexical receiver; it
  did leave the old button able to issue original-source recovery after its UI or
  source context had been replaced.
- Controller and Store already protect their construction storage source and real
  transaction/CAS outcomes. Recovery UI must not invent error, pending, conflict,
  generation or write acknowledgements.
- Retry can recover an initial/passive read error, reconcile an unsaved draft, or
  recognize an exact draft already committed despite a lost acknowledgement.
  Composition does not categorically forbid Retry's original read/reconciliation.
- Use saved text does not require a conflict. It reads the original latest state
  and keeps a genuine newer draft or ongoing composition rather than discarding it.
  It does not programmatically focus/select the editor.
- Replace uses the currently displayed saved revision as its CAS baseline. Pending,
  composition and read-error gates remain Controller decisions; another intervening
  write must conflict again and preserve the draft.
- The existing button helper adds no visibility, connectivity, enabled, inert,
  readonly or availability gate. Hidden or detached original fragments are distinct
  from same-document reparenting and cross-document adoption.
- View lifecycle, editor and import retain construction workspace/Session identity.
  Export is a separate read-only recovery exception with action-time metadata.
  Recovery clicks that can read/discard/write are bound to the construction source;
  late metadata or a replacement Session cannot reauthorize an old card.

## Implementation contract

1. The private recovery owner retains the existing lifecycle record, every original
   rendering control's ancestor chain, and one epoch shared by all three actions.
   Successful Controller recovery may emit into all those controls, so ownership is
   checked across the complete original rendering set.
2. Construction Controller, Store, backend, workspace object/ID/generation, Session,
   host, document and controls must still match. Reparenting or adoption rejects
   dispatch; same-document detachment alone remains permitted. A source restored
   exactly to its original identity can recover again. Private View retirement
   cannot be undone by resetting public `closed` fields.
3. Every click reserves its epoch and captures real generation, saved-state and
   error references, pending, composing, loaded, read-error, write-error and conflict
   values before the first observable ownership/event access. A newer recovery,
   draft or composition cannot become an older click's replacement baseline.
4. The event target must be the exact original button. A supplied non-null
   `currentTarget` must also be that button. Foreign targets and bubbled descendant
   targets cannot authorize dispatch. A retained no-argument callback remains
   compatible, but is still subject to all source/lifecycle checks.
5. Source, DOM, event, epoch and real-state snapshots are checked again after public
   Controller method lookup, including repeated checks against one-shot stale
   accessors. The function is called with the original Controller receiver. A newer
   genuine click, draft, IME, or synchronous pending action stops the outer call.
6. These are pre-dispatch ownership checks only. They do not add an asynchronous
   action protocol, change a Controller method's internals, cancel an already issued
   write, or make general rendering transactional. Actual original pending/error/CAS
   behavior remains authoritative.

## Reproduction and preserved evidence

Before editing production, all **1,503 tracked files** were hashed and the original
View was archived. The protected set is every other tracked file: **1,502 files**,
including every existing test/helper, Controller, Store, settings, manifest, locale
and workflow. The new suite uses actual Store/Controller modules and the unchanged
DOM helper with serialized locks, cloned snapshots, real notifications, held
reads/writes, actual backend read/write/lost-acknowledgement failures and actual
`Workspaces.Session` suspension/invalidation. It never assigns Controller state,
error, conflict, pending or composing fields to manufacture recovery outcomes.

Each foreign source has its own actual Controller, Store and synthetic backend.
Negative probes compare real state/error references, drafts, feedback, raw storage
bytes, requests and read/write/lock counts for both sources. Separate instrumented
foreign Controller probes assert zero reads of its fields or recovery methods.
The DOM helper does not automatically unlink/adopt on append, so transfer probes
explicitly remove and recursively adopt nodes. The focus check covers only the
existing DOM-model semantics, not browser caret/undo behavior.

All Node runs used the sole reserved execution window and this explicit focused
command (with `SCRATCHPAD_VIEW_SOURCE` selecting the archived original where noted):

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-scratchpad-recovery-source.test.js
```

All complete outputs, exit statuses, candidate source bytes, test revisions and
hash inventories are preserved in the feature-101 evidence archive. Files named
`.tap` retain the actual complete Node reporter output; the reporter emitted its
human-readable format in this environment.

### Untouched original source

The first 300-case run was **69 passed / 231 failed**, zero cancelled/skipped,
exit **1**, **2219.954085 ms**. That provisional new suite expected action-time
workspace/Session admission for 15 metadata cases. The owner clarified the intended
construction-source contract before any production edit. Only those newly authored
expectations were replaced with source-rejection plus exact-restoration recovery;
the first test bytes and full report remain retained.

The corrected 300-case original-source RED was **54 passed / 246 failed**, zero
cancelled/skipped, exit **1**, **2208.491787 ms**. The View remained byte-identical
through both RED runs. No existing test or helper was edited.

### Candidate 1 and actual admission-time defect

Candidate 1 passed the identical corrected suite: **300/300**, zero failures,
cancellations or skips, exit **0**, **2117.291483 ms**.

Before freezing, 24 additional probes were appended without changing the 300 prior
assertions: 18 admission-time accessor reentries, three explicit foreign-field-read
checks, and three genuine closed-Controller checks. Candidate 1 then produced
**306 passed / 18 failed**, zero cancelled/skipped, exit **1**, **2351.306828 ms**.
The 18 failures were a real candidate defect: the first View-controller,
button-ownerDocument or event-target accessor could call genuine `setDraft` or
`setComposing`; the snapshot taken afterward accepted that newer work as the old
click's baseline. Candidate 1 source/tests/output remain preserved.

### Final exact-byte RED/GREEN

The expanded 324-test bytes were run against the archived untouched View:
**54 passed / 270 failed**, zero cancelled/skipped, exit **1**, **2293.656197 ms**.

Candidate 2 moves capture of the real state snapshot before the first observable
ownership/event check. The byte-identical expanded tests passed **324/324**, zero
failures, cancellations or skips, exit **0**, **2166.32496 ms**. The implementation
worker then released the Node window and froze production/tests for independent
owner review.

## Positive coverage retained

- Original Retry after real WRITE, lost acknowledgement, initial/passive/dirty READ
  errors, including exact committed content recognition without duplicate writes.
- Use saved text with and without conflict, real failed reads, exact raw text,
  original focus behavior, and a genuine newer editor draft during its held read.
- Replace after actual conflict, another real saved revision before dispatch,
  honest repeated CAS conflict, explicit subsequent successful replacement, and
  recovery from real read errors through Retry.
- All three actions during an actual pending write and genuine IME composition,
  preserving the original Controller gates and draft behavior.
- All three actions from hidden/disabled/inert/readonly UI, hidden documents,
  detached original host/button/editor, and disabled modules without adding a
  new availability requirement.
- Original synthetic availability flags do not change identity; actual original
  Session suspension/invalidation still reaches the Controller and reports the
  real `WORKSPACE_SWITCH_PENDING` / `WORKSPACE_INVALIDATED` errors without writes.
- Exact restoration of workspace object, ID/generation and Session permits the
  original button's real recovery after rejecting the substituted source.

## First freeze integrity

At first freeze, **1,502/1,502 protected tracked files** were byte-identical. The
sole modified original tracked file was View. New files were this validation
record and the focused test. `git diff --check` passed. The complete render-to-end
region and all pre-existing helper bodies remain unchanged; the constructor's
three recovery handlers and new private capture are the only existing-code edits.

SHA-256:

- Original View: `16def6f75a56a08ee37c8ae80e12467b6e88338188c01117d35a848c037ac527`
- First provisional tests: `22e161d5349d508295927de8fe1e08d28d9cb2cec4eb8025cf4d6441017cb790`
- First RED report: `26f63fa0a58e7807b7aa2b9cd86a13c6d0e28b1b32bb5f0357d8b5c39a3a9660`
- Corrected 300-case tests: `3cb56d793b0bbf13fa8f103d4d49ebcd824180600d73a0435c90f7cb61f790f9`
- Corrected original-source RED: `6daef0bd71c6c2042e5b52bf8fec6a166eab8561731e974354bfd48b5befe5f0`
- Candidate-1 View: `cbcc1840fd8bb52481e14e5de28c4b82863a8a4a228fe15c059dd02613df4577`
- Candidate-1 300-case GREEN: `1f0fb28e8fcd023ee0399c21ee79fccd490281f866c2a565f1a16c71a4ad0ad7`
- Candidate-1 expanded RED: `4f585a2e0824e0fbfbcfb43b685305c7e3fe7365b43d3d8c76d29b087a29b8d4`
- Final 324-case tests: `dac41da1e750863ffed3c583becfe0d0b69de3de858cfa1d7f41f11b98d29c19`
- Final original-source RED: `8f7a2e5b6f4e9741bb681e06b2e705407f02cbfc820aa9a610314fed4c927f75`
- Frozen candidate-2 View: `00de258a3330071e0d45a2a44209db030ca819343b690ded216271749bbdbb07`
- Final GREEN report: `4bf3189be4b97f1f6a9e7b0def44aeef4503084d40298d4d584f2c310c828aa3`

## Verification limits

This document records the implementation worker's focused reproduction, correction
and first freeze. Independent owner tests, pre-existing compatibility suites,
syntax checks, Python/package validation, full/scale execution and exact-commit
remote CI are separate owner gates and are not claimed by the 324 focused cases.
The worker did not use a browser, native Chrome, screenshots, user device, paid
platform, permission expansion, commit, push, tag or GitHub Release. Native event,
IME, focus, selection, undo and browser lifecycle behavior remain unverified by
this synthetic DOM model. Manifest version remains 1.1.155; Release/CWS are frozen.

## Independent owner audit and pre-publication gates

After the implementation worker's final freeze, the owner independently reviewed
all changed production lines and ran a separate 66-case harness against three
preserved versions. Actual results:

- Untouched feature-100 View: **15 passed / 51 failed**, 657.877325 ms.
- Preserved candidate 1: **57 passed / 9 failed**, 649.929546 ms. All nine failures
  are the independently reproduced first-admission controller/parent/event accessor
  accepting a genuinely newer draft as an old Retry/Use saved/Replace baseline.
- Frozen candidate 2: **66/66 passed**, 667.744185 ms.

The independent harness checks real original and foreign state/error references,
raw bytes, method receivers and I/O. Exact original-source restoration then performs
the actual recovery. Additional cases preserve hidden/detached original controls,
method-getter nested clicks, lost-acknowledgement Retry without a second write,
Use saved's genuine newer draft during an issued read, and Replace's honest CAS
conflict. No private predicate assertion replaces an actual recovery outcome.

The explicit 25-file accumulated independent boundary suite passed **1253/1253**,
zero failed/cancelled/skipped, **19776.350988 ms**. The explicit 45-file repository
compatibility set passed **3303/3303**, zero failed/cancelled/skipped,
**39009.94057 ms**; this includes the 324 new cases and all 2979 prior selected
cases without changing old assertions. All 46 execution hashes were identical
before and after that run. View and new-test syntax checks returned zero.

Python validation passed **84/84** in **1.868 s**. The verified runtime package
contains **133 files**, **4,096,548 source bytes**, with SHA-256
`650bdfe80276db6b89c304601183e1b033980e2dbef739654738a64902182272`.
All **503 canonical protected files** and **1502 unaffected tracked files** remain
unchanged. Of the 40 View methods, only the constructor changed; the other 39,
all pre-existing private helpers, and the complete render-to-settings tail are
byte-identical. No Controller/Store/session protocol or existing test was edited.

These are focused local gates, not a local full/scale run. Exact remote CI must
still run on the published master commit; its expected Node count is 15964, but
that future result is not claimed here. Release/manifest/CWS freeze remains in
force. The implementation worker stopped all writes before this owner section.
