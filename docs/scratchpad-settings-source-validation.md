# Scratchpad settings source and lifecycle validation

## Scope and actual caller boundary

Feature 104 changes only `mountSettings` and settings-private helpers immediately
before it in `shared/local-scratchpad-view.js`. The first **107,866 bytes** of the
original file, including every main `View` method and existing helper, remain
identical. Controller, Store, schema, CAS, readback/receipt behavior, workspace
navigation, configuration, locales, manifest, packaging and workflows are unchanged.
The manifest remains 1.1.155. Release and Chrome Web Store publication, screenshots,
browser and native Chrome checks are frozen for this implementation window.

The actual production caller in `options.js` already checks
`!window.localScratchpadSettingsView` before mounting. This repair protects the
public settings mount and retained callbacks against source substitutions,
control transfers/replacements, synchronous callback reentry and repeated mounts
on the exact same host. These are deliberate API/DOM fault-injection probes;
they do not establish ordinary navigation remounting settings or explain the
unresolved historical upgrade data-loss report.

All saved text, configuration, backend failures and DOM fixtures are synthetic.
No personal data, credentials, user device, paid platform, screenshot or browser
was used. This implementation worker did not commit, push, tag or publish.

## Ownership and action contract

- A settings-private WeakMap claims the host before observable option, source,
  translation, DOM, subscription or initialization work. A nested newest mount
  keeps its claim. Old construction never reinstalls itself or restores a prior
  owner when a newer mount is destroyed or fails.
- The original Controller, Store, backend, workspace object, workspace ID and
  generation, session, document, host ancestry, controls and their parent links
  are retained. Replacing the returned public `controller` handle suspends old
  settings rendering and dispatch; restoring it can restore authority only if
  the private host claim and the complete original source/DOM still match.
  Nothing routes writes, work queries or cleanup to the replacement Controller.
- Internal controls must retain their original exact parents. Moving a control,
  replacing it with another node or changing its document blocks UI publication
  and Controller dispatch. Original whole-host detachment and hidden or disabled
  controls do not themselves reject an action. Actual recovery availability is
  still decided by the real Controller.
- Each render and action reserves an epoch and captures real Controller state
  before observable source, DOM, event or method admission. State, source and
  epoch are rechecked around translation, original reads/writes and method lookup
  versus invocation. A newer real draft/render/remount invalidates its caller's
  continuation, even when the original Controller is still the same object.
- A change action reads the original checkbox's `checked` value exactly once,
  then separately looks up and conditionally invokes original `setEnabled` with
  the original receiver. Retry and Read latest saved state follow the same
  method-identity boundary. They do not simulate recovery or change its semantics.
- `init` lookup and invocation are separately guarded. A getter that remounts
  cannot dispatch the old initialization. Once the original init/read or save has
  already entered, its genuine result may settle; the view neither cancels nor
  rolls back that operation.
- Same-host succession does not destroy the old Controller, cancel an issued
  save, discard its draft or falsify its work query. An explicit old-handle query
  retains the original acquired Controller. Explicit destruction retains the
  captured original destroy method and receiver, regardless of later public
  handle/method substitutions.
- Destruction retires the lifecycle before cleanup callbacks, removes only known
  original listeners, and attempts the original unsubscriber and Controller
  cleanup independently. Repeated/reentrant destroy is idempotent. The first
  cleanup failure is preserved even when its thrown value is falsey; later cleanup
  still runs. A newest owner's resources are untouched.
- Explicitly sharing one Controller across mounts keeps its existing shared
  lifetime: destroying one handle still destroys that Controller. No reference
  counting or new sharing semantics are introduced.

### Construction boundaries and limitations

Known listener removers are captured before listener installation, and a returned
subscription cleanup is retained before checking whether its callback superseded
the construction. A construction failure cleans those known acquired resources
without destroying the supplied Controller and rethrows the exact original value,
even if cleanup also throws. An unsubscriber that an external callback never
returns is inaccessible and cannot be promised cleanup.

If the `options.controller` getter itself supersedes construction before the
mount binds its source, the abandoned call can return an inert, unbound handle.
It does not claim that the getter's potential Controller or draft was tracked or
destroyed. Once the original Controller is bound, its work query stays honest
through later source/translation/subscription/init supersession.

This is callback-boundary robustness, not rollback of arbitrary already-entered
JavaScript. A setter or method that has entered may perform its own effects before
it returns; the view can stop subsequent work, not undo external callback code.
There is no claim of security against arbitrary hostile JavaScript or native DOM,
Chrome, navigation, IME, focus or browser-event fidelity from this deterministic
DOM model.

## Focused regression suite

The only new test is `tests/local-scratchpad-settings-source.test.js`. It uses the
unchanged real Controller and Store, serialized backends, genuine emitted drafts,
actual read/write failures, revision conflicts, held issued reads/writes and real
Retry/useSaved transitions. It does not assign fabricated Controller state,
pending/error/conflict/retry flags. Backend mode flags control actual injected
storage failures. The Chrome-backend positive uses actual
`createChromeBackend` with synthetic storage and locks, and proves that a settings
visibility write changes only the Scratchpad key, preserves exact saved text and
leaves the synthetic configuration key byte-for-byte unchanged.

The final **169 cases** include:

- Four entry routes across seven original source identity substitutions, with
  restoration positives and unchanged original/foreign storage evidence.
- All four controls transferred, replaced or assigned a different document, for
  render, toggle, Retry and Read latest, with restored original-link positives.
- Hidden, detached-whole-host and disabled-control genuine recovery positives;
  foreign event target rejection and the single checkbox read/receiver assertion.
- Real newer drafts during checkbox, method, source and event getters, plus real
  nested renders through translation lookup/call, status lookup, checkbox setter,
  source lookup and work-query lookup.
- Same-host succession across render/actions; successful, rejected and lost-ack
  issued original saves; preserved original dirty/composing/error/conflict/pending
  work queries and passive read-failure behavior.
- Seventeen unloaded construction reentry boundaries, initialized-Controller
  reentry positives, separate init-getter rejection and entered-init completion.
- Captured destroy method/receiver, shared-Controller lifetime, reentrant cleanup,
  falsey teardown failures, known-resource construction failure cleanup and exact
  original thrown-value preservation.
- Genuine lost-ack Retry without duplicate write, exact saved/config separation,
  and a static assertion for the existing production single-mount guard.

## Preserved RED and candidate history

Original source, all original tracked-file hashes, intermediate test/source
snapshots and every execution log are retained in the coordinating owner's
separate evidence directory. No old test/helper was changed.

An initial evidence-path typo produced an ENOENT harness failure; its log and exit
code are preserved separately and are not treated as a regression reproduction.
After correcting that path, the **before-production-edit** 28-case run on untouched
source produced **6 pass / 22 fail**. Candidate 1 passed those 28 cases.

The first expanded 114-case candidate run had **66 pass / 48 fail**. All 48 were
new-test expectations that an untouched aggregate-text DOM node had `undefined`
text; the unchanged helper correctly returns an empty string. The first test
version and failure log are preserved. Correcting that expectation did not change
production or any old test/helper. The expanded 156-case suite then passed 156/156,
and the final added construction/cleanup positives passed 169/169.

Production remained on candidate 1 throughout those expansions. Exact final
source/test snapshots were pinned before the final comparison:

- Untouched original source: **34 pass / 135 fail**, **1265.427508 ms**, exit **1**.
- Frozen candidate: **169/169 pass**, **557.666790 ms**, exit **0**.
- Both runs: **zero cancellations and zero skips**.

Each invocation used the sole assigned Node window and the explicit command
`node --max-old-space-size=512 --test --test-concurrency=1 tests/local-scratchpad-settings-source.test.js`.
The baseline run used `SETTINGS_VIEW_SOURCE` to select the archived original View
without swapping production bytes. No local full suite, scale suite or test glob
was run. The Node window was released immediately after the exact final GREEN;
source and tests were frozen for independent owner review.

## Integrity and remaining delivery gates

All **1,508 other original tracked files** match their baseline SHA-256 hashes.
The View is the only changed baseline file; the focused test and this document are
the only new files. `git diff --check` passed. The entire original prefix before
`mountSettings` is byte-identical, so this work does not change any main View or
existing helper behavior. The final source and test match their execution copies.

SHA-256:

- Original View: `2326115c67bcaa42cb6ebd2dd6c57c0c2c6a607c00b4b00d6d21ed7451feb85d`
- Frozen View: `8d96d480d6301e03ae6d69eb3989d066c351bed6ed0f2f7a9ac9c5b010c13aac`
- Final new test: `82b1cef580647a8791f51713c1fcb3da10762ff1dd5b93c54988dcf4c32a96e1`
- Exact final RED log: `9d7be09f0555dc00dc7fadfb597d9f664519abb30884fc30d2d735d901c2c209`
- Exact final GREEN log: `0dbf6b77ef695f1e8a4fdce660de5cee7ee2ec5244268ad704ee8c9864ee6a69`

These focused results establish deterministic reproduction and repair. They do
not assert a full repository pass, native browser validation or published Release.
Independent owner probes, existing compatibility suites, canonical protected-file
checks, syntax/Python/package verification, unchanged exact-commit GitHub CI and
master/frozen-Release readback remain separate coordinating-owner gates.

## Coordinating-owner independent review and local gates

The owner independently inspected the actual implementation and authored a separate
47-case real-Controller probe. Exact original-source execution produced **6 pass /
41 fail**, 220.568816 ms; frozen source passed **47/47**, 305.087994 ms. Both had zero
cancellations/skips. The matrix verifies source/target transfers before actual
Controller calls, zero storage I/O, even same-value render writes being forbidden,
original hidden/detached-host/disabled recovery, exact public-handle restoration,
real newer drafts in checkbox/method getters, nested status render, genuine
issued-write completion, captured destruction with Error/zero failures, and
nested constructor/init dispatch boundaries. No Controller state was fabricated.

Final local delivery gates:

- 28 explicitly enumerated independent regression files: **1,381/1,381 pass**,
  27,403.235934 ms.
- 48 explicitly enumerated repository files: **3,869/3,869 pass**,
  66,020.941415 ms. Zero failures, cancellations or skips.
- The production file and new test passed `node --check`; 49 source/test hashes
  were recorded before execution and verified afterward. One Node window only.
- Python: **84 tests passed**, 1.906 seconds.
- Runtime package build and separate verification: **133 files**, **4,111,829
  source bytes**, SHA-256
  `faec67e72392e3df924b22bf4e33fa362a878fede88728f8b41e3c8fef132c43`.
- Independent byte/hash audit: **1,508 unaffected tracked files**, **506 protected
  hashes**, all **107,866 preceding source bytes**, the API export tail and all
  **40 main View method bodies** remain identical.

No existing test, helper or business assertion required adjustment. No local
full/scale run, workflow change, schema change or publication permission expansion
was made. At this pre-publication checkpoint, exact-commit full GitHub CI, all
runtime hash comparison and master/frozen-Release readback still remain required;
these local results do not claim those later gates have already passed.
