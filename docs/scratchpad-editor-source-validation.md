# Scratchpad original-editor event source validation

## Scope and actual boundary

This change binds the original Scratchpad textarea's `input`, `compositionstart`
and `compositionend` listeners to their construction source and original DOM
ownership. The runtime edit is limited to `shared/local-scratchpad-view.js`.
The host's copy-composition callbacks distinguish those editor events from other
composition events so a rejected or superseded editor listener cannot continue
through the bubbling host callback.

These are deliberate public-field, DOM-transfer and synchronous-callback fault
injections. They are not evidence that normal workspace navigation replaces View
fields or that it caused historical personal-data loss. All fixture text is
synthetic. No user's saved data, profile, credentials or device was accessed.

The existing production mount creates one View with its original Controller.
Workspace switching coordinates original pending work and navigation; it does
not turn an old View into the destination by assigning public fields. A Session
backend's storage functions close over the original Session even though its
public `workspace` property can be replaced. This change adds no source setter,
new state schema, key, setting or storage operation.

Retry, Use saved text, Replace, settings, general rendering, Find actions, copy
actions, import, export, Store and Controller implementations remain unchanged.
No package, CI, manifest, localization, previous test or helper file was edited.

## Existing contracts reviewed before the change

- Controller construction-source ownership prevents foreign storage access while
  preserving the honest outcome of an already-dispatched original write.
  Controller editing is distinct from storage readiness.
- View lifecycle ownership retains construction Controller, Store, backend,
  workspace identity, Session identity, host, document and original controls.
  Hidden/detached original fragments and genuine original Session errors remain
  supported; retirement cannot be undone by resetting public `closed`.
- Copy retirement owns its original resources and status. It checks original
  ancestry again after cleanup callbacks and does not clear a transferred status
  or a newer receipt. Single-flight clipboard write ownership is independent.
- Find reset and composition callbacks already have their own original-source and
  reentry rules. The host's copy-composition guard also covers Find and other
  inputs; those events must not be mistaken for rejected main-editor events.
- The existing read-error/readonly test explicitly completes a genuinely ongoing
  IME and preserves its final draft. Existing copy-selection ABA probes also
  install workspace metadata after View construction. That late metadata does
  not authorize a new editor source, but the View must still be able to retire
  its own previously admitted copy feedback.

## Implementation contract

1. A private editor owner retains the construction lifecycle and original DOM
   chains. Every original rendering control is checked because a successful
   Controller edit emits a render. Replacing Controller, Store, backend,
   workspace object/id/generation, Session, host or one of those controls cannot
   grant the original listener authority over the replacement. A different
   parent or document is rejected; same-document detachment alone is allowed.
2. Each original editor invocation has a private event token. Its edit epoch and
   Controller generation are checked before subsequent effects, including after
   public copy invalidation, Find reset, textarea value access and method lookup.
   The draft value comes from the pinned original editor. Methods are invoked
   with their original View/Controller receiver. A real nested input or direct
   Controller draft update wins over its older outer event.
3. Composition has a separate serial. A newer compositionstart or compositionend
   supersedes the older composition completion. A normal nested input or direct
   draft change alone does not strand the Controller in `composing=true`: the
   completed original IME still releases its composing state and the existing
   Controller determines whether autosave may resume.
4. An already accepted original draft is not rolled back if its notification
   changes ownership. Subsequent outer event work must recheck ownership. No
   Controller state, error, pending flag, receipt or storage result is fabricated.
5. Host composition routing recognizes the exact original editor event token.
   Rejected or superseded editor events do not invoke public host cleanup/refresh
   hooks. Legitimate composition events from Find, another original input or the
   host retain the prior copy protection. The handler also rechecks after public
   method lookup and after invalidation before refreshing controls.
6. An original input/compositionstart with a mismatched source may only retire
   that View's old private copy feedback using existing strict retirement. This
   preserves late-workspace copy ABA invalidation without allowing a draft edit
   or refreshing replacement controls. The existing saved-copy exception for an
   ordinary input is retained.
7. There is no new loaded, visible, connected, enabled, readonly, disabled,
   suspended or invalidated gate for editor ownership. The original loaded
   `setDraft` check and Controller editing/save rules remain authoritative.

The work does not change the internals of arbitrary caller-supplied method
wrappers or make generic rendering transactional. In particular, the scope is
these three original textarea listeners and their host composition continuation.

## Reproduction and immutable evidence

Before editing production, all **1,501 tracked files** were hashed and the
original View was archived. The protected set is every tracked file except the
allowed runtime file: **1,500 files**, including all existing tests/helpers,
Controller, Store, settings, manifest and workflows.

The new suite uses actual Store and Controller implementations with serialized
backend locks, cloned snapshots, real notifications, real read/write failures,
held original writes and real `Workspaces.Session` suspension/invalidation.
It does not assign Controller state, errors, pending, conflict or composing
fields to manufacture recovery outcomes. Public source assignment is explicitly
limited to fault-injection probes. The unchanged DOM helper does not automatically
detach/adopt on append, so transfer probes explicitly unlink and recursively
adopt nodes. Assertions compare scalars and reference identity rather than deeply
comparing cyclic DOM/Controller objects.

All runs used this sole focused command:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-scratchpad-editor-source.test.js
```

The first untouched-production RED was **219 tests: 51 passed, 168 failed,
0 cancelled, 0 skipped**, exit **1**, **1319.84546 ms**. One newly authored
host-compositionend positive control attempted copying while its own IME was
still active. The fixture was corrected to finish that IME explicitly before
starting the newer copy; the first test bytes and entire failing report remain
archived. No pre-existing test was changed.

The corrected suite was rerun against the still-byte-identical original View:
**219 tests: 52 passed, 167 failed, 0 cancelled, 0 skipped**, exit **1**,
**1333.110661 ms**. The corrected test bytes were frozen before implementation.
Failures covered original editor admission after public source/control changes,
DOM transfers, stale metadata/method getters, cleanup/value-access reentry,
newer draft ownership, compositionend clearing a newer IME, private retirement,
and rejected/stale original-editor events continuing through host callbacks.

First implementation GREEN, with the corrected test bytes unchanged:
**219/219 passed**, **0 failures, cancellations or skips**, exit **0**,
**1281.958967 ms**. The implementation worker returned the sole Node execution
window immediately and froze production/tests for independent owner review.

Positive controls include hidden/disabled/off modules, detached host/editor,
hidden document, readonly/inert controls, original suspended/invalidated flags,
initial loading/read failure, actual dirty/write-error/lost-acknowledgement/
conflict/over-limit drafts, held original write success/failure, ordinary read
error rejection and ongoing-IME read-error completion, genuine Session failures,
other host composition targets, and late-workspace copy retirement.

## First freeze integrity

At the first GREEN freeze, **1,500/1,500 protected files were byte-identical**;
the only changed original tracked file was View. `git diff --check` passed.
New files were the focused test and this validation document.

SHA-256:

- Original View: `3e966a7d8b65a0157da4c661afb132fc20cfd3ab3ca033f6486e719ffc15c532`
- Original 219-test bytes: `4f0d0552c3a25212a862188b7aaddcbb391947cdced19df7e0e1788521484ebf`
- First RED report: `237a736515f8ef1ac1f65691050446b5a0d88cfa81f0f04a80365eca5c855fdc`
- Corrected tests, unchanged for GREEN: `5ef1738cebe6d42d7d348e9f0afa84b19c982616787250b89b37df762fe1276b`
- Corrected untouched-production RED report: `5424b86e89c6a78b838d9cb1897ca27a15177a31849a1c1782b49f421b340ea7`
- First frozen View: `16def6f75a56a08ee37c8ae80e12467b6e88338188c01117d35a848c037ac527`
- First GREEN report: `9ae2509688a7fbf7a8504d1adf36fd2eb56d429ea58952b86a68c0ebd0815864`

## Verification limits

This records the implementation worker's focused RED/GREEN and first freeze.
The worker did not run existing regressions, independent owner tests, syntax,
full/scale tests, Python/package validation or exact-commit CI. Those remain
separate owner gates and must not be inferred from the 219 focused results.
No browser, native Chrome, screenshots, user device, paid platform, permission
expansion, commit, push, tag or Release was used in this implementation window.
Native IME ordering, browser focus/undo behavior and OS clipboard integration
remain unverified by this DOM model. Manifest version remains 1.1.155.

## Final independent owner verification

A separately authored 42-case suite used real original and foreign Controllers and
backends. It reproduced **17 pass / 25 fail** on the untouched source
(**370.423303 ms**) and passed **42/42** on the candidate (**347.806479 ms**).
It checks event-source rejection, zero reads of substituted foreign editor text,
original hidden/detached and real failure recovery, method receiver/counts, nested
input through cleanup/value/method getters, private retirement, and the distinction
between newer compositionstart and an ordinary newer input during compositionend.

Four initial existing compatibility files passed **276/276**, zero
failed/cancelled/skipped, **4991.184208 ms**. These include the existing late-workspace
copy-selection ABA cases, complete View import/recovery cases, Find and clipboard
transaction behavior. No old test or helper needed modification.

After the implementation worker ended all writes, final sequential owner gates
confirmed the frozen source and test bytes:

- 24 explicitly enumerated independent files: **1187/1187**, no failures,
  cancellation or skips, **19737.237178 ms**. All absolute paths were checked first.
- 44 explicit repository files: **2979/2979**, no failures, cancellation or skips,
  **36401.474959 ms**. All 45 execution source/test hashes stayed unchanged.
- Python: **84 tests passed**, **2.149 s**.
- Package build and verification: **133 runtime files**, **4,094,525 source bytes**;
  runtime SHA-256 `cf36f36a330e0932a8fa12df4adaabbc27005b0e2f64f42b198ee7dbbcb7ac4e`.
- Final production and new-test syntax checks passed.

Independent static comparison confirms that only constructor changes among 40
View methods; the other **39 methods**, all pre-existing top-level helpers and the
entire render-to-file-end region remain identical. The only changed original
tracked file is View; all **1,500 other tracked files** and the owner's canonical
**502-file protected inventory** remain identical. All old tests and helpers are
unchanged.

Full acceptance still requires the original exact-commit GitHub workflow, runtime
hash comparison, master readback and frozen Release verification. Local full/scale,
native IME/browser behavior, screenshots and a new published Release are not claimed.
