# Scratchpad main-render source validation

## Scope and evidence boundary

Feature 102 protects the original Scratchpad card's synchronous `View.render`
continuations. The production change is limited to private render ownership
helpers, one constructor capture, and that main render method in
`shared/local-scratchpad-view.js`. Settings rendering, teardown, editor/IME,
recovery buttons, Find, copy, import/export action implementations, Controller,
Store and workspace/storage protocols are unchanged. The manifest remains 1.1.155;
this implementation window does not publish a Release or submit to the store.

Public-field substitutions, one-shot accessors and callback reentry below are
robustness fault injections. They do not establish that normal workspace
navigation retargets a View, nor explain historical personal-data loss. Actual
workspace switching coordinates original pending work before navigating. All
fixture text, saved snapshots, clipboard writes and backend failures are synthetic.
No personal data, credentials, user device or paid platform was used.

## Existing contracts reviewed

- Lifecycle feature 93 pins the original source and document. Its main render
  checked that source at entry and after `onVisibility`, while other public
  callback and DOM-access boundaries still allowed older continuations to write.
  Its previously passing nested visibility draft case alone did not prove a
  stale-render defect. This feature first reproduced stale import availability,
  count/status feedback and old callback continuation at other boundaries.
- Construction identity includes Controller, Store, backend, workspace object,
  workspace ID/generation, Session, host, document and every rendering control.
  Identity differs from availability: hidden or detached original fragments,
  initial loading/read errors and genuine original write/conflict/IME states
  must remain renderable.
- Editor feature 100 and recovery feature 101 already retain complete original
  ancestor chains and real action snapshots. Render can write all original
  controls, so it needs its own independently captured chains and synchronous
  ownership. It must not borrow an editing, recovery, import or clipboard token.
- Controller emissions and real Store transactions remain authoritative. Rendering
  does not manufacture pending/error/conflict state or write acknowledgements,
  cancel an issued write, modify draft/storage data, or introduce a storage protocol.
- Existing IME behavior avoids replacing the textarea during composition, while
  character and logical-line counts come from the same displayed DOM text.
  Saved-preview provenance is checked before replacement; Find, import and copy
  retain their existing action-specific readiness and ownership rules.
- A rejected source must still retire its original copy feedback through private
  ownership-aware cleanup. A newer render's feedback cannot be cleared by an
  older continuation. Public cleanup/refresh hooks cannot be dispatched merely
  because an old render had previously been admitted.

## Implementation contract

1. A private render owner retains the existing lifecycle, all original rendering
   controls' complete ancestor chains and an epoch. Original same-document
   detachment remains valid; reparenting or cross-document adoption does not.
2. Each render reserves its epoch and snapshots actual Controller generation,
   saved-state and error references, draft, loaded, pending/pending-write,
   read/write-error, conflict, composing and status values before its first
   observable source/DOM ownership check. First-admission accessor reentry cannot
   become the old render's replacement baseline.
3. Source identity, original chains, real state and epoch are checked repeatedly.
   A newer synchronous render supersedes the outer render even when it renders
   the same Controller snapshot. Genuine state changes also stop the outer render
   when a test temporarily suppresses the subscription render.
4. DOM reads and writes use captured original nodes. Public methods are looked up
   only while current, checked again after lookup, and called with their original
   receivers. A callback, translation, DOM getter or completed setter may transfer
   ownership or emit a newer actual render; the next effect is then rejected.
   This does not attempt to undo effects inside an already-entered callback/setter.
5. Main-render status calculation preserves the previous precedence but guards its
   work-query and translation lookups. The separate settings status helper remains
   byte-identical. Chained visibility assignments are separate guarded writes.
6. Import and copy sessions are captured before checking them; an older check does
   not cancel a newly substituted session/feedback transaction. Their implementations
   and independent action protocols are not changed.
7. On exit, source-rejected render may retire only the original owned copy feedback,
   and only while it still owns the render epoch. Cleanup cannot mask an already
   thrown render exception, including a falsey thrown value. A cleanup exception
   remains visible when there was no prior render exception. Existing copy helpers
   themselves are unchanged.

## Reproduction and preserved evidence

Before production edits, all **1,505 tracked files** were hashed and the untouched
View was archived. Every original tracked file other than View is protected:
**1,504 files**, including all existing tests/helpers, Controller, Store, settings,
manifest, locales and workflows. All source candidates, new-test revisions,
complete outputs, exit statuses and hash inventories are retained in the
feature-102 evidence archive. Files named `.tap` contain the complete actual Node
reporter output, which used its human-readable format in this environment.

The focused suite uses real Store and Controller modules and the unchanged shared
DOM model. Serialized locks, cloned snapshots, actual notifications, held reads
and writes, and genuine read/write/lost-acknowledgement failures produce states.
It never assigns Controller state, error, conflict, pending or composing fields
to manufacture outcomes. Foreign sources have separate actual Controllers,
Stores and synthetic backends. Probes check original/foreign state and error
identity, raw storage bytes, I/O, UI, callback receivers, write sequences and
zero foreign Controller field reads. DOM transfers explicitly unlink and
recursively adopt nodes because the existing model does not do so automatically.

All runs used the sole reserved Node window and this explicit focused command:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 tests/local-scratchpad-render-source.test.js
```

For baseline reruns, `SCRATCHPAD_VIEW_SOURCE` selected the archived untouched View.
No local full/scale/glob test command was used.

### Untouched baseline and new-test corrections

The first 245-case original-source run was **98 passed / 147 failed**, zero
cancelled/skipped, exit **1**, **1786.682165 ms**. Three new positive expectations
were corrected before editing production: two exact fallback-message literals,
and an IME count that correctly updates from the current DOM while preserving the
composing text. Their first bytes and full failure output remain archived.

The corrected 245-case untouched-source RED was **101 passed / 144 failed**,
zero cancelled/skipped, exit **1**, **1888.399614 ms**. The original View hash
remained unchanged through both runs.

### Candidate 1 and expanded boundaries

Candidate 1 passed **243/245**, with two failures caused by new tests forbidding
all writes after source rejection. Those cases had actual copy receipts: the
required original private retirement correctly cleared/hid the original copy
status while leaving the public callback uncalled. Only these two new expectations
were narrowed to allow exactly that owned cleanup. No existing assertion/helper
was edited. Candidate 1 and the original stricter report remain preserved.

Thirty-four probes were appended for real-state changes without nested render,
translation/work-query/DOM method getters, count-setter transfer and reentry,
exact source restoration, zero foreign-field reads and saved-copy nested-render
feedback. With the identical expanded 279-test bytes:

- Untouched baseline: **109 passed / 170 failed**, **2057.183359 ms**, exit **1**.
- Candidate 1: **279/279 passed**, **4497.909906 ms**, exit **0**.

Both runs had zero cancellations or skips.

### Owner-identified exception priority and candidate 2

Independent static review identified that the newly added `finally` could replace
an original callback exception if source-rejection cleanup also threw. Twenty-five
probes were appended without changing the existing 279 cases. Twenty-four combine
four callback boundaries with an Error, `false`, `0`, empty string, `null` or
`undefined` original throw. The other verifies a cleanup-only exception.

Candidate 1 produced **280 passed / 24 failed**, zero cancelled/skipped, exit **1**,
**5024.252858 ms**. All 24 failures reproduced exception masking. Candidate 2 adds
only render-local exception-priority handling and includes initial snapshot capture
inside that protected region; existing copy cleanup remains unchanged.

Final, byte-identical 304-test verification:

- Untouched baseline RED: **110 passed / 194 failed**, **2276.199767 ms**, exit **1**.
- Candidate 2 GREEN: **304/304 passed**, **5016.24324 ms**, exit **0**.
- Both: **0 failed test cancellations, 0 skipped tests**; GREEN has **0 failures**.

The implementation worker then released the Node window and froze source/tests
for independent owner review.

## Positive coverage retained

- Initial loading and initial/passive READ failures, genuine WRITE failures, lost
  acknowledgements, actual conflicts and over-limit drafts.
- Actual refresh to a newer saved revision, a conflicting read retaining a draft,
  and read-error rendering with synchronous nested render at translation.
- Real `setDraft`, IME composition and pending save emission, including newer work
  at first-admission accessors, translation, method lookup and count setters.
- Original hidden/detached host, wrapper, textarea, status and controls; hidden
  documents, readonly/inert UI, disabled module and original synthetic workspace
  availability flags without adding new availability gates.
- Exact BOM/Unicode/CRLF text, same-DOM character/line counts, open Find controls,
  real copy receipt feedback, real import chooser session, original receivers,
  storage/I/O invariance, and exact source restoration.
- Private retirement despite reset public `closed` flags, cleanup once after
  callback failure, original falsey exception visibility and cleanup-only errors.

## First freeze integrity and hashes

All **1,504/1,504 protected tracked files** remained byte-identical. View is the
only changed original tracked file. The new files are the focused suite and this
validation record. The entire `findVisible`-to-end region, all pre-existing
private helpers, and the constructor except its new private render capture are
unchanged. `git diff --check` passed.

SHA-256:

- Original View: `00de258a3330071e0d45a2a44209db030ca819343b690ded216271749bbdbb07`
- Corrected 245-case tests: `ea8855deab3c44907f85730ea5665eb32911117349422a809fa28d3d5a140251`
- Corrected original RED: `b0cf2adfda12b5de4d7b8d3b59207b3bc3fb28e54c08f658b2db77ca17c75a60`
- Candidate-1 View: `2130a7ae04c5b016f6acd904359427453bc23263298d1b9f95e44dadff0120e2`
- Candidate-1 exception RED: `f1cb3f1a847d8faae9d9603b26c61fa79e4aa0a05b6c4ef246e38a20e969198d`
- Final 304-case tests: `9a73b70580da4f408d65f246a1de77583d2298b85a119961ecf9873f80ab9c04`
- Final untouched-source RED: `60ea40e24dcd3f6ed79cf4ec4e53afe312d546da93d1de012b8a8e2dfd596b29`
- Frozen candidate-2 View: `509085de3d61004a2835880444781d01a3ca883d05b44a707b0dfd75a1862fdc`
- Final GREEN report: `3aad0baef80781fedc2703ecafce7d4e7631b991071169d79495a6bd09136825`

## Verification limits

This records focused implementation reproduction and first freeze. Independent
owner suites, unchanged compatibility suites, syntax/Python/package checks and
exact-commit remote CI are separate delivery gates and are not claimed by the
304 focused results. The worker did not run local full/scale tests or use native
Chrome, a browser, screenshots, the user's device, paid platforms, permission
changes, commits, pushes, tags, GitHub Releases or store submission. Native IME,
focus/caret, undo, browser lifecycle and OS clipboard behavior remain unverified
by this deterministic DOM model. Manifest/Release/CWS freeze remains in force.

## Independent owner verification and approved static-test update

After the implementation freeze, the owner's separate 59-case harness produced:

- Untouched original View: **33 passed / 26 failed**, **504.815411 ms**.
- Preserved candidate 1: **56 passed / 3 failed**, **1119.267082 ms**. All three
  independently reproduce a real Error, zero or undefined render throw being
  masked by a throwing original copy-feedback cleanup.
- Frozen candidate 2: **59/59 passed**, **992.537937 ms**.

The original 50-case harness and both reports are also retained. The nine added
cases instrument actual DOM setters and the late public copy refresh: even
same-value writes must stop after source/target transfer. Independent positives
cover real draft rendering, original/foreign I/O, hidden/detached controls, IME,
actual READ/WRITE/CONFLICT and original callback receiver/exception semantics.
The explicit accumulated 26-file independent suite passed **1312/1312**, zero
failures/cancellations/skips, **25790.38187 ms**.

The first unchanged 46-file repository run produced **3606 passed / 1 failed**,
**63205.845986 ms**. Its sole failure was the old static counting-block source
inspection in `tests/local-scratchpad-line-count.test.js`, not a dynamic count
failure. The removed `const text = statusText(c);` end marker made its slice run
almost to file end; it then required the former literal `this.textarea.value`,
whose count was zero after ownership-safe `read(nodes.textarea, 'value')` was
introduced. Original test bytes, full failure output and source hashes remain
preserved. Production was not changed to satisfy that literal assumption.

The owner obtained approval to update **only that static case** while retaining
its user-protection purpose. The revised check bounds main render and the exact
count block, verifies one original-editor guarded read, one for-of traversal,
one count-only guarded write, and one guarded translation call. The read/write
helpers must actually check current ownership. Direct editor reads, Controller
text substitutions, extra loops, arrays, normalization, other-node writes,
network/storage, timers/listeners, clipboard and focus/geometry remain forbidden.
**35 string-only negative probes** comprise 29 inserted hazards, two snapshot
substitutions and four missing anchors. These strings are inspected, never run.
The original CSS assertions, all other 18 dynamic cases and every helper are
byte-identical. An independent read-only review confirmed this mapping and the
unchanged protected bytes.

The final line-count file passed **19/19**, **463.618266 ms**, including its dynamic
Unicode/CRLF/IME/language/read-count and I/O assertions plus the stronger static
negative probes. Its final SHA-256 is
`7253113192d500637341d19ca371a2c79fdafde9f8dcee86518ddec3be745e23`.
The first owner adjustment and its actual 19/19 result are preserved separately.

The exact 46-file repository rerun passed **3607/3607**, zero failed/cancelled/
skipped, **64382.132572 ms**. All 47 execution hashes were unchanged before/after;
View, new test and the approved static test passed syntax checks. Python passed
**84/84** in **2.002 s**. The verified package contains **133 runtime files** and
**4,100,565 source bytes**, SHA-256
`038f708acded79213bb80bd8dc70331a7cca54a8539112182fb9bf79fddaff3a`.

Beyond the two authorized original tracked files (View and that one static test),
**1503 original tracked files** and **503 of the 504 canonical protected files**
are unchanged. The approved protected test is separately pinned to its final hash.
Only constructor/render changed among the 40 View methods; the other 38, all
pre-existing helper bodies and the entire findVisible-to-settings tail remain
byte-identical. Controller/Store/workspace protocols are unchanged.

These are focused local gates, not local full/scale results. Exact remote CI must
still verify the published master commit. Its expected Node count is 16268, but
that future result is not claimed here. The worker stopped all writes before this
owner appendix. Manifest155/Release/CWS freeze remains in effect.
