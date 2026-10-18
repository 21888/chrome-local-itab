# Scratchpad exact-host owner validation

## Scope and actual caller boundary

Feature 103 makes each new Scratchpad `View` claim its exact host before observable
construction work. The runtime change is confined to
`shared/local-scratchpad-view.js`: one private host-owner map/predicate,
construction and three existing ownership helpers. Controller, Store, settings,
workspace navigation, schemas, keys, locale, manifest and workflows are unchanged.
The manifest remains 1.1.155; Release and Chrome Web Store publication are frozen
for this implementation window.

Both public `LocalItabScratchpad.mount(host, options)` and `new View(host, options)`
construct a View. Neither previously required that the prior View be destroyed.
A subsequent `host.replaceChildren` detaches the original controls. Feature 102's
intentional original-detachment allowance then accepted the old control chains,
so the older subscription/direct render could still change the shared host's
`hidden` property and call its old `onVisibility` callback. Old editor/recovery
listeners and an already-previewed import could also operate their original
Controller after host succession.

The production call in `newtab.js` checks `!window.localScratchpadView` before
mounting, after workspace setup. `options.js` uses the separate settings mount.
Workspace changes coordinate pending work and navigate. The same-host remounts,
public-field resets, one-shot accessors and nested callbacks below are public-API
robustness probes, not evidence of ordinary navigation remounting a card, historical
personal-data loss, or security against arbitrary hostile JavaScript.

All text, files, clipboard promises and failures are synthetic. No user data,
credentials, user device, paid service, browser, native Chrome or screenshot was
used. This worker did not commit, push, tag or publish.

## Ownership and recovery contract

- A private WeakMap holds the exact host's latest lifecycle record. Its claim is
  installed before reading the supplied Controller's source or destroy method,
  translating labels, reading host methods or writing the host. Public handles
  and `closed` resets cannot recreate that private claim.
- Construction does not restore a predecessor on supersession, destruction or
  failure. A later explicit fresh mount can claim the host. Destroying the newest
  View or restoring an old subtree does not revive old editing/render authority.
- The construction source predicate checks the claim before and after its existing
  source/control checks. Main render, subscribed render, editor/IME and recovery
  use that predicate. The host's composition continuation also checks the claim.
  Import has its own strict write-source predicate and receives the same check;
  a real old preview cannot Apply after a later mount.
- Host class/attribute/children methods are looked up and called only while the
  constructor still owns the claim. Host hidden writes are guarded. A newer
  nested mount prevents the outer constructor from replacing its children,
  publishing obsolete selection/saved owner maps, adding further listeners,
  subscribing, rendering or starting initialization. Local detached controls can
  still be assembled; that grants them no shared-host write authority.
- Copy-owner invalidation functions exist before their owner is published and
  before invoking an older owner's callback. A nested mount at either callback
  therefore sees a complete owner and does not throw because `invalidate` is
  missing. The outer constructor cannot subsequently replace the newest map.
- Host/document/window listener registration is deferred until its complete
  identity inventory exists. If construction throws, only that attempt's known
  listeners, returned subscription and copy resources are cleaned. Its original
  thrown value, including zero, is retained if cleanup throws. No predecessor is
  reinstated and no Controller is destroyed by failed construction. This does not
  roll back DOM effects or arbitrary work already performed inside an entered
  callback. In particular, an external subscribe wrapper that installs a listener
  and throws before returning its unsubscribe does not provide a cleanup handle.
- Host supersession is separate from lifecycle retirement. An already mounted old
  View retains its honest original `hasUncommittedWork`/departure protection,
  original Controller, dirty draft, error and issued transaction. It is not
  automatically destroyed; no save is cancelled or rolled back. Explicit direct
  Controller recovery remains available and produces the actual original result.
- Explicit old `destroy()` still releases its own original subscription/listeners
  and Controller once, even after public Controller/unsubscribe substitution or a
  public closed reset. It cannot delete the newest copy owner or clear the newest
  independent View's controls. If callers deliberately pass the **same Controller**
  to two Views, destroying either still closes that shared Controller under the
  pre-existing contract. This feature adds no Controller reference counting.
- Original hidden/detached controls with no newer host owner retain their existing
  edit/recovery contracts. Export remains a separate read-only recovery exception:
  original detached text is exportable after supersession, including dirty text,
  read error, closed original Controller and completed late workspace setup. No
  construction-workspace gate was added to export or current/selection clipboard.
  Clipboard single-flight and target-owned cleanup remain unchanged; an issued old
  copy's settlement cannot clear a newest View's genuine feedback.

Find, copy/export action implementations, work-query and destroy method bodies,
the entire main-render-to-file-end region and settings code remain byte-identical.
The new claim is not an availability, visibility, connectivity or backend-readiness
check. Existing original same-document detached recovery is not replaced by a
blanket `isConnected` gate.

## Fixtures and preserved evidence

The new `tests/local-scratchpad-host-owner.test.js` loads one actual View module
per test and mounts two or three Views on the same actual DOM-model host. Each
ordinary owner has a separate real Controller, Store and synthetic backend.
Serialized backend locks, real Store mutations/notifications, genuine backend
READ/WRITE/lost-acknowledgement failures, deferred writes and real IME/draft methods
create the tested states. Controller state, pending, error and conflict fields are
never assigned to manufacture results. One explicit shared-Controller positive
checks the unchanged caller lifetime contract separately.

The unchanged `tests/helpers/task-dom-model.js` supplies `replaceChildren`, which
actually detaches old top-level controls. The fixture verifies child identities,
new-owner UI and visibility callbacks, source-state/error identity, draft and edit
generation, raw saved bytes and read/write/commit/lock counts. Export compares
actual Blob bytes, preserving BOM and CRLF rather than decoding away a BOM.
Clipboard tests use genuine held promises and newest successful copies.

Before edits, all **1,507 tracked files** were hashed and the untouched View was
archived. All new-test revisions, source candidates, complete actual reporter
outputs and exit statuses remain retained. Files named `.tap` contain the actual
human-readable Node reporter output from this environment.

Only explicitly enumerated focused Node runs were used:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-scratchpad-host-owner.test.js
```

`SCRATCHPAD_VIEW_SOURCE` selects the archived unchanged View for baseline runs.
There was no local full/scale/glob command.

### Untouched baseline and new-test corrections

The first 65-case baseline produced **11 pass / 54 fail**, zero cancelled/skipped,
exit **1**, **1307.049775 ms**. Four read-only-export positives incorrectly used
`Blob.text()`, whose BOM decoding removed the initial character from the test
comparison. They now compare exact bytes. The subscribe-throw probe initially
threw inside a wrapper after installing the subscription without returning its
cleanup handle. It was replaced by an observable subscribe-getter throw, because
View cannot undo an arbitrary hidden effect inside that already-entered wrapper.
These first test bytes and the complete output remain retained.

The corrected untouched-source 65-case run established **15 pass / 50 fail**,
zero cancelled/skipped, exit **1**, **1316.401302 ms** before production edits.
Failures include old shared-host visibility writes, stale editor/recovery/import
dispatch, late issued-write repaint, resurrection after later owners, nested
constructor overwrites, incomplete copy-owner callback publication and failed
constructor subscription cleanup.

### Candidate and expanded matrix

Candidate 1 produced **57 pass / 8 fail**, zero cancelled/skipped, exit **1**,
**1244.653540 ms**. All eight failures were a new fixture bug: `sameUI` mutated the
expected snapshot's child array during its first comparison, so its second call
expected zero children. That helper now compares copied values without changing
the expectation. No existing helper/test was edited.

Twenty-six cases were appended for construction claim timing, method/getter
reentry, nested successful mount followed by an outer throw, deliberate old direct
Controller recovery, old clipboard settlement against genuine newest feedback,
in-flight render/editor/recovery/import succession and the shared-Controller
contract. A provisional Find-source claim check in candidate 1 was also removed;
Find's existing action/cleanup policy is outside this narrow write-source repair.
Both source versions are preserved.

The final 91-case suite first passed **91/91**, **1564.136722 ms**. Exact final
source/test bytes were then pinned and rerun:

- Untouched original source: **21 pass / 70 fail**, **1689.177538 ms**, exit **1**.
- Frozen candidate: **91/91 pass**, **1575.084740 ms**, exit **0**.
- Both had **zero cancellations and zero skips**.

The sole Node window was immediately released after that final GREEN. Source and
tests were frozen for independent owner review. Node remained released until the
owner explicitly returned it for the initialization correction below.

## First-freeze integrity

All **1,506 other original tracked files** remain byte-identical. View is the only
changed baseline file; the focused test and this document are the two new files.
Every existing test/helper, Controller, Store and settings file is unchanged.
`git diff --check` passed. The final source and test exactly match their archived
execution snapshots.

SHA-256:

- Original View: `509085de3d61004a2835880444781d01a3ca883d05b44a707b0dfd75a1862fdc`
- Frozen View: `d35439aa1bb13ec4fb15caf61032648d71b0388eff1cd317a92c2e320658593d`
- Final new test: `cf54ae5812622ccf6b7323ff66a422c8c29e20fa5f6c50e6a8130d80d82348b5`
- Final untouched-source RED: `3384b316638120a76f6e591a3df684ce78f503164755859faa0a5bbc7884d87d`
- Final frozen GREEN: `adfb6f53a98ee876f73e454571c6aac4a70275c2f59c92ee1a04157450353082`

## Remaining delivery gates

The final 93 cases establish focused deterministic reproduction and repair, not a full
repository pass, native browser/IME/undo behavior, OS clipboard validation or a
published Release. Independent owner probes, existing compatibility suites, syntax,
Python, packaging/runtime hashes, exact-commit unchanged GitHub CI, master readback
and frozen Release verification remain separate coordinating-owner gates. No
permission, manifest version, Release or Chrome Web Store change is claimed.


## Independent initialization audit and final correction

The owner reported its first **20/20** independent probes and **1,312/1,312**
existing compatibility cases passing the first frozen candidate. Static audit then
identified one remaining observable method boundary: the constructor checked its
claim before `run(() => controller.init())`, but the subsequent `init` getter
could synchronously mount a newest View before the old init function was invoked.
The first frozen source, tests and document were preserved before reopening work.

Two real-Controller cases were appended without changing the prior 91 assertions:

1. An init getter performs a genuine newer mount. The old init invocation count
   and old backend I/O must remain unchanged, while newest UI remains intact.
2. The original init function has already entered and dispatched its real Store
   read before a nested mount. Its held read is allowed to settle honestly, with
   one invocation/read, unchanged retained draft and no newest-UI overwrite.

The first new positive observed the backend read before the Store lock's microtask
ran. That 93-case attempt was **91 pass / 2 fail**, **1538.790520 ms**, and is
preserved. Only the observation timing was corrected with one event-loop tick.
The corrected 93-case suite against the preserved pre-init candidate produced
**92 pass / 1 fail**, **1604.418316 ms**. Its sole failure is the genuine getter
boundary: the superseded init was invoked once. The entered-init positive passed.

The production correction only reads `controller.init` inside the existing `run`
error handling, rechecks the exact host claim after lookup, and calls the captured
method with the original Controller receiver. It does not cancel or roll back an
already-entered init/read and does not change Controller or Store behavior.

Exact final 93-test bytes were rerun:

- Untouched feature-102 source: **21 pass / 72 fail**, **1848.064546 ms**, exit **1**.
- Final corrected source: **93/93 pass**, **1631.293720 ms**, exit **0**.
- Both: **zero cancellations and zero skips**.

The Node window was immediately returned again and source/tests frozen. All
**1,506 other tracked files** are still byte-identical; the complete render-to-end
region is still unchanged. `git diff --check` passed. No old test/helper was
modified. The owner retains final independent comparisons, broader compatibility,
syntax/Python/package and exact-commit publication verification.

Final SHA-256:

- View: `2326115c67bcaa42cb6ebd2dd6c57c0c2c6a607c00b4b00d6d21ed7451feb85d`
- New test: `8b3d6e8dabcbfd4744bbc0c0d25faee66265ffa0f62df3e204b9f093a9361ce8`

## Coordinating-owner independent review and local delivery gates

The owner independently inspected the actual diff and used a separately authored
22-case executable probe with real Controllers, Stores, raw backends and shared
host mounts. The first 20 cases produced 3 pass / 17 fail on untouched source
(797.442610 ms), then 20/20 on the first frozen candidate (694.487462 ms).
The owner found the final initialization getter continuation during code review,
then independently added two tests without changing those first 20 assertions.
Exact final 22-case results were:

- Original feature-102 source: 4 pass / 18 fail, 881.038294 ms.
- Preserved pre-init-correction candidate: 21 pass / 1 fail, 691.755470 ms.
- Final source: 22/22 pass, 695.532708 ms.

The negative observes an actual nested mount from the older Controller's init
getter and proves zero invocation, zero read/write and no loaded-state fabrication.
The positive enters the original init first, then mounts the successor and retains
its real single read/result without repainting the successor. Other probes compare
new-owner DOM and source snapshots, genuine retry/conflict operations, exact raw
saved data, old issued-write completion, retained drafts and explicit Blob export.

Final focused gates, with exactly one Node process window at a time:

- 27 explicitly enumerated independent regression files: 1,334/1,334 pass,
  27,278.776731 ms. The earlier pre-init audit run was 1,332/1,332 pass,
  27,601.469398 ms; both outputs are retained.
- 47 explicitly enumerated repository files: 3,700/3,700 pass,
  66,317.510377 ms. Zero failures, cancellations or skips.
- Both changed/new JavaScript files passed `node --check`; all 48 source/test
  execution hashes were pinned before the repository run and verified afterward.
- Python: 84 tests passed in 1.894 seconds.
- Runtime packaging and independent verify: 133 files, 4,102,686 source bytes,
  SHA-256 `b5623f1dc115b1013ff7a241a053025e67565aba81d05e7655aece1721891c91`.
  The first packaging command was rejected by the tool's parent-traversal path
  guard before output. That failure is retained; using the same allowed destination
  as an absolute normalized path passed without changing the guard.
- All 1,506 unaffected tracked files and all 505 protected canonical hashes are
  identical. Of 40 View methods, only constructor changed; 39 method bodies and
  the entire render-through-settings tail are identical. The remaining production
  changes are the private host map and three ownership helpers described above.

No old test/helper was modified, no local full/scale run was attempted, and no CI
workflow, release protocol, permission, manifest, schema or recovery protocol was
changed. At this pre-publication checkpoint the exact-commit GitHub full suite and
final master/frozen-Release readback remain required; local results do not claim
those later gates have already completed.
