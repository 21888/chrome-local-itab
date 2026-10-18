# Scratchpad Find source and target ownership

## Scope and caller contract

Feature 99 binds Scratchpad Find opening, selected-text prefill, literal navigation,
keyboard admission, feedback, Find-only rendering and closing to the View's original
source and controls. Production changes are limited to `shared/local-scratchpad-view.js`:
a private Find record and helpers, constructor Find callbacks/capture, and the seven
existing Find methods. The generic `findVisible()` helper is unchanged because
clipboard paths also use it. General `render()`, ordinary editor-input callbacks,
all import/copy/export methods, teardown, Store, Controller, workspace navigation,
settings, schema, keys, permissions, locales, manifest and workflows are unchanged.
The manifest remains 1.1.155.

`newtab.js` mounts Scratchpad after workspace mounting. `options.js` mounts its
separate settings view. The actual workspace switch in `shared/workspaces-view.js`
waits for pending work, flushes the original Session, selects the destination and
navigates; it does not retarget an existing View's public fields. Find therefore
retains construction Controller, Store, backend, workspace object/ID/generation and
global Session identity, consistent with the existing View lifecycle and import.
Views whose original Controller stubs have no Store/backend/workspace remain
supported. Completed workspace/session substitutions are rejected; restoring exact
original identities permits a subsequent explicit Find. No workspace availability,
suspension, invalidation, permission or storage-read gate is added.

All public-field replacements and synchronous callback injections here are
synthetic robustness probes. They are not normal workspace navigation, evidence of
a historical upgrade/personal-data-loss cause, or an arbitrary hostile-JavaScript
security guarantee. No user device, browser, native Chrome, screenshots, paid
platform, OS clipboard, local full suite, scale matrix or new permission was used.
This implementation worker did not commit, push, tag or publish.

## Ownership and operation behavior

- Privately capture the original host, construction document and complete ancestor
  chains of editor, Find button, selected-text button, panel, input, Previous,
  Next, Close and status before prior-owner invalidation callbacks can run.
  Source checks retain original public-handle identity and use the existing
  two-pass chain predicate. Original detachment remains owned; new parents or
  documents do not. Former ancestors beyond a detached link are still checked.
- Ownership is distinct from admission. Original hidden/detached/closed states
  still run their existing local cleanup when the targets remain owned. Actions
  retain loaded, visible, connected, non-IME, non-inert, non-disabled controls and
  visible-document requirements. A same-host unrelated button cannot become a
  Find navigation origin.
- Each action reserves a private epoch before observable readiness callbacks.
  Focus, selection, method lookup, translation and successive DOM writes recheck
  ownership/currentness. A synchronously newer Find, input, genuine edit or close
  retires the older outer action. Public `closed = false` cannot revive retirement.
- Find uses exact current DOM text, preserving native textarea newline offsets,
  literal case/whitespace/markup, overlapping matches, UTF-16 selection offsets,
  both directions, wrap feedback and counts. Dirty, pending, failed, conflicted,
  read-only recovery and over-limit DOM drafts remain searchable without saving,
  retrying, refreshing, reading storage or changing recovery state.
- Selected-text Find uses the original editor's current complete, nonempty,
  single-line Unicode selection. It preserves the original selection/direction,
  does not scan, and rechecks the text, query and selection after focus. A focus
  failure keeps the old query and reports only while its original feedback remains
  current. Invalid selection guidance cannot label a later query.
- Translation occurs before the final feedback check. Changed source, text, query,
  selection, feedback or genuine edit generation cannot receive an old success.
  Failure translation likewise cannot overwrite a query changed during translation.
  Counts and held-Enter authority publish only after successful original selection.
- Close and reset clear only independently owned original targets. Replaced public
  fields never redirect cleanup; a transferred target retains its new owner's
  value. Successive setters/method getters cannot let an older close overwrite a
  newly opened Find. Focus returns to the original Find button only from the old
  panel, while that ownership and focus claim remain current; a newer outside
  focus is preserved.
- A repeated control Enter consumes no new action epoch. Only the original
  successful gesture suppresses repeats following focus into the editor; fresh
  editor Enter, other new editing keys, keyup, pointer input, IME, blur and closure
  retain their release behavior. A genuine unchanged Controller refresh preserves
  the held gesture, whereas a genuine new draft does not inherit its repeat guard.
  Already handled older events cannot clear a synchronously newer held gesture
  when they finish bubbling.

No action can undo a selection/focus already issued before a callback changes its
source. Checks suppress subsequent selection/feedback/focus effects; they do not
claim to roll back a prior DOM effect or detect a change made and undone entirely
between observations. Existing pending Store operations may still settle normally.

## Fixtures and baseline evidence

The new `tests/local-scratchpad-find-source.test.js` uses actual Scratchpad Store
and Controller instances and the unchanged shared DOM model. Serialized backend
locks, actual Store mutations/notifications, real backend read/write failures,
lost acknowledgements and deferred writes produce saved, dirty, conflict,
read-error, write-error, over-limit and pending success/failure states. No
Controller state/error/pending/conflict/Retry result is assigned to fabricate them.
Foreign sources have independent real Store/Controller instances. Snapshot checks
cover raw bytes, I/O counters, state identity/content, draft, generation, timers,
pending/error/conflict state and recovery UI. DOM identity assertions avoid cyclic
object deep comparisons.

The shared model's append does not implement native unlink/adoption. Transfers
explicitly remove the old parent link, recursively change ownerDocument when
needed, and append to the destination. One-shot metadata/method getters and
property setters model bounded synchronous reentry. These tests do not establish
native selection painting, scrolling, keyboard defaults, IME or screen-reader QA.

Before production edits, all **1,499 tracked files** and a **433-file protected
subset** were hashed and the original View saved. Baseline View SHA-256:

`474caf246014d256c1ebacb2306231ad74a990905166c88d9091d13b35267e52`

The first 211-case unchanged-source run was **55 pass / 156 fail**, zero
cancelled/skipped, exit 1, **1121.821287 ms**. All tracked files still matched before
production editing. Complete logs, exit statuses and test/source snapshots are
retained, including every failed candidate.

The final pre-independent-review 236-case test bytes were also run against that
same original source: **64 pass / 172 fail**, zero cancelled/skipped, exit 1,
**1238.018184 ms**. That RED and the first focused GREEN use identical 236-case
bytes. Three independently discovered entry cases were appended afterward; this
worker did not rerun all 239 final bytes against the original source after its
second Node handback.

## Candidate failures and compatibility correction

The first production candidate passed all 211 new cases but two of the 32 old Find
cases failed: **243 tests / 241 pass / 2 fail**, **1953.635901 ms**.

1. The old hidden/inert/closed cleanup matrix created its wrapper by reparenting
   the host after View construction. Its intended hidden-host query clearing now
   conflicted with construction-chain transfer rejection. The complete failure
   was saved, and old-test edits were paused for owner/root approval. The owner,
   not this worker, added an opt-in `wrapped = false` fixture option and enabled it
   only for that one case, constructing the same wrapper before the View. All 14
   subsequent blocking actions and cleanup assertions remain unchanged; the other
   31 case bodies remain unchanged, and default fixture behavior remains equivalent.
   Independent same/cross-document transfer negatives remain separate. The owner
   reported all 32 old cases passing in **674.690092 ms** after this approved setup.
2. Control repeat Enter created a new epoch and inadvertently retired the original
   held token, allowing a following editor repeat. This was a real implementation
   regression, fixed without weakening the old assertion. A new exact regression
   preserves repeated control-to-editor Enter suppression and fresh editing keys.

The expanded candidate-1 matrix then established **232 tests / 216 pass / 16 fail**
(**1556.909783 ms**): pre-readiness reentry, translated snapshot changes, original
panel cleanup, and genuine unchanged Controller refresh all required correction.
A further four-case candidate-3 RED (**236 tests / 232 pass / 4 fail**,
**1774.565161 ms**) demonstrated unowned same-host origins, failed-selection
translation and two newer-outside-focus boundaries. All were fixed within Find.
The first 236 new assertions remain unchanged in the final 239-case file.

## First focused GREEN and independent entry correction

The first frozen nine-file run passed **1216/1216**, zero failed/cancelled/skipped,
exit 0, **11294.449675 ms**. It comprised 236 new cases and 980 unchanged related
compatibility cases:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-scratchpad-find-source.test.js \
  tests/local-scratchpad-view.test.js \
  tests/local-scratchpad-view-lifecycle-source.test.js \
  tests/local-scratchpad-teardown-targets.test.js \
  tests/local-scratchpad-export-source.test.js \
  tests/local-scratchpad-import-source.test.js \
  tests/local-scratchpad-copy-text.test.js \
  tests/local-scratchpad-copy-transaction.test.js \
  tests/local-scratchpad-copy-feedback-targets.test.js
```

Both source/new-test syntax checks passed, and all ten execution hashes matched
before/after that run. The separately run old Find suite still had its one known
approved-but-not-yet-edited wrapper fixture at this first handback. This was not
reported as a complete old-suite pass. The sole Node window was returned at GREEN.

Independent owner review then found three additional entry gaps: Close click,
panel Escape and input compositionstart captured their epoch only after canFind.
A synchronous visibility callback could finish a newer query/navigation before the
old handler cleared it. The owner's 64-case candidate run was **61 pass / 3 fail**
(**517.200459 ms**), while its original-source run was **35 pass / 29 fail**
(**444.428821 ms**).

Node was explicitly returned for only that correction. Three matching tests were
appended, yielding a local unchanged-candidate RED of **239 tests / 236 pass /
3 fail**, zero cancelled/skipped, **1697.732985 ms**. The repair captures the token
before readiness in those three constructor handlers and rechecks it before the
subsequent close/composition mutation. No other production path changed in this
last correction.

The final explicit run of the new test, approved old Find test and owner's
independent file passed **336/336**, zero failed/cancelled/skipped, exit 0,
**2868.198219 ms**: **239 new + 32 old + 65 owner cases**. The owner file contained
65 cases at execution time. The archived log's filename contains “335”; the actual
complete test summary and count are 336. Node was immediately returned a second
time. This worker performed no further Node invocation, source/test edit, or
fixture edit after that handback.

Final worker-frozen SHA-256:

- View: `3e966a7d8b65a0157da4c661afb132fc20cfd3ab3ca033f6486e719ffc15c532`
- New test: `84830458f73b1212165dec9b37c2d9b4efc44be266b148b92b7b7f49d1226af9`
- Owner-approved old Find fixture: `f2753d509d7c0bf20f4d74e7c6ae1047262a05f4aa10512cc2f51e4b788594a5`

Static comparison identifies exactly eight changed methods among forty:
constructor, canFind, resetFindResult, closeFind, renderFind, findSelectedText,
findEnter and findText. The other 32 methods, every previous top-level helper,
ordinary editor-input constructor prefix and the complete canImport-to-file-end
region remain byte-identical. Besides the permitted View and owner's approved
old-fixture change, all **1,497 other tracked files** and **432 other protected
files** matched the original baseline during the worker audit. The new test and
this document are the worker's only new repository files.

## Remaining delivery gates

The first 1216-case broad focused GREEN and syntax checks precede the last three
entry-handler changes. The final worker run covers those changes with 336 cases;
it does not replace the owner's final broader regression, final syntax checks,
exact-final-test original-source RED, Python tests, packaging, unchanged full
exact-commit CI, 133 runtime hash comparisons, master readback or frozen Release
verification. Those publication gates belong to the coordinating owner. No native
Chrome, screenshot, browser-store release or new version availability is claimed.

## Final independent owner gates

After the implementation worker stopped all writes, the owner reran the exact
final test bytes against the original source: **239 tests / 64 pass / 175 fail**,
zero cancelled/skipped, **1202.27304 ms**. The independent 65-case suite reproduced
**36 pass / 29 fail** on the original source (**451.453137 ms**) and passed
**65/65** on the final candidate (**512.237477 ms**). This includes the three
independently discovered entry gaps, real unchanged-refresh held-Enter behavior,
real error/dirty/over-limit draft searches, transferred targets and zero storage
effects on both original and foreign backends.

The approved helper change was independently compared against its exact baseline
default behavior. Both helpers ran the same current production View. DOM structure,
attributes, listener inventory, draft/state/generation, selection, focus and effect
logs matched after creation, opening, query entry, Next, Previous, closing and
destruction. The new wrapper option defaults to false. Static comparison also
proves that only this optional construction setup and the single approved case's
wrapper setup differ; all 14 original blocking branches and all assertions remain,
and the other 31 case bodies are byte-identical.

Final sequential owner acceptance gates:

- 23 explicit independent files: **1145/1145**, zero failures/cancellations/skips,
  **19119.272749 ms**. Every absolute path was checked before execution.
- 43 explicit repository files: **2760/2760**, zero failures/cancellations/skips,
  **34474.895794 ms**. All 44 source/test execution hashes remained unchanged.
- Python: **84 tests passed**, **1.954 s**.
- Package build and verification: **133 runtime files**, **4,089,634 source bytes**;
  runtime SHA-256 `07418b0f157d797e9213ab7ca5118ab6a80a7a145faeee26651c1a8c96d1577a`.
- Final production, new-test and approved old-test syntax checks all passed.

Independent static review confirms eight changed View methods and 32 unchanged
methods. All existing top-level helpers, generic findVisible and the complete
canImport-to-file-end region are identical. Of the canonical **501 protected
files**, **500** remain identical; the sole exception is the approved old Find
fixture. The other **1,497 tracked baseline files** are unchanged.

Full acceptance still requires the unchanged exact-commit GitHub workflow and
master/runtime/frozen-Release readback. These focused gates do not claim a local
full/scale run, native Chrome selection test, screenshot or newly published Release.
