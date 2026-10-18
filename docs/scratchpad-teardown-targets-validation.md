# Scratchpad find/import teardown target validation

## Scope

Feature 96 binds the remaining thirteen find/import DOM writes in Scratchpad
View destruction to their original private target ownership. The twelve targets
are `findInput`, `findStatus`, `findPanel`, `findButton`, `findPrevious`,
`findNext`, `importApply`, `importAppend`, `importPanel`, `importPreview`,
`importInfo` and `importFile`. `importAppend` has separate checked and disabled
writes. Feature 95's clipboard target behavior is retained unchanged.

Production changes are restricted to `shared/local-scratchpad-view.js`: two narrow
private write helpers, constructor-time target-chain capture and those thirteen
writes in `destroy()`. Ordinary find/import action admission, file reading,
applying, export, clipboard actions, general rendering, Store, Controller, Tasks,
source protocols, settings mounting, schemas, keys, locales, workflows and manifest
are outside scope. The manifest remains 1.1.155. This implementation worker does
not commit, push, tag, publish a Release, or use the Chrome Web Store, a user device,
paid service, native Chrome, browser screenshots or OS clipboard.

These tests are deliberate synthetic DOM/public-field ownership fault injection.
They establish a teardown boundary, not ordinary production workspace reachability
or the cause of historical personal-data loss. They make no security claim about
arbitrary hostile DOM getters or setters.

## Reproduction and unchanged-source RED

The new `tests/local-scratchpad-teardown-targets.test.js` uses the real Scratchpad
Store and Controller with serialized backend locks. Actual backend failures,
notifications and deferred writes produce dirty work, read errors, write errors,
lost acknowledgements, conflicts and pending success/failure. No Controller
state/error/pending/conflict/retry outcome is assigned to fabricate a scenario.
An import preview is produced by the real chooser/read/preview methods using a
synthetic UTF-8 file containing BOM, CRLF, CR, Unicode and literal markup. Every
foreign source has an independent real Store and Controller.

The unchanged shared DOM model does not detach or adopt when appending. The new
fixture explicitly removes a transferred node from its old parent, recursively
reassigns ownerDocument for actual cross-document adoption, and then appends it
to the new parent. Tests verify old-parent removal and descendant ownership.
No shared helper or previous test was edited.

Before production edits, all **1,493 tracked files** and **498 protected files**
were hashed, and the original View was saved. Baseline View SHA-256:

`f6f1cb1c2942bcc6caea7d6d1deaa00eaad606df0374a3f90d05996acf327b8b`

The complete new suite against that unchanged source produced **137 tests / 25
pass / 112 fail**, with zero cancelled/skipped tests, exit 1, in **824.675209 ms**.
The initial RED and first candidate GREEN use exactly the same new-test bytes.
Original source, complete RED logs, exit statuses, execution hashes and all test
snapshots are retained with the coordinating task's evidence. An independently
found method-access gap later expanded the new suite to 141 tests; that exact
final test also ran against unchanged feature 95: **25 pass / 116 fail**, zero
cancelled/skipped, exit 1, **809.180617 ms**.

The RED demonstrates that pinned node identity alone does not protect values after
same-document reparenting or cross-document adoption. Old destruction clears the
new owner's query, preview, status and file value, hides transferred panels,
disables transferred controls and resets their labels/attributes. It includes
transferred target ancestors, cleanup callbacks that move later targets, and
construction reentry through prior selection/saved owner invalidation callbacks.
Existing original-detachment and falsey-first-error positives also run on the
unchanged source.

## Ownership contract

- Capture each target's full private ancestor chain immediately after the original
  `lifecycle.nodes` snapshot, before previous selection or saved owner callbacks.
  Later public target/host/Controller/unsubscribe/owner replacement cannot change
  this private cleanup authority.
- Before each write, require the captured same-document chain and original parent
  links, allowing an original link to have become detached. Reuse feature 95's
  existing two-pass chain validation unchanged.
- Keep the full-chain detached contract conservative. Former ancestors beyond a
  detached break are still checked. If one of those former ancestors is reparented
  or adopted, cleanup is suppressed even when the target remains in an otherwise
  original detached fragment. This is not a broader fragment-ownership model.
- Independently recheck the second `importAppend` write and every subsequent
  target. A prior cleanup setter may synchronously transfer that target and install
  the new owner's exact values.
- Obtain the translated import label before the final property-write check. Read
  the original find button's `setAttribute` method only after an initial ownership
  check, revalidate after the method lookup, then call it with its original receiver.
  Already-foreign targets do not expose their new owner's method getter to old
  cleanup. Demonstrated one-shot translation
  and method-getter reentry cannot authorize a subsequent foreign write.
- Metadata getter cases exercise a bounded one-shot transfer which returns a stale
  original parent/document on the first read. Existing two-pass chain validation
  handles that case; it is not an arbitrary hostile-accessor guarantee.
- Retire privately before cleanup and keep existing boolean first-error handling.
  A thrown `undefined`, `null`, `false`, `0` or empty string remains the first
  observable failure while later owned cleanup is attempted. Reentrant destroy
  and resetting public `closed` cannot repeat retirement.
- Old listener removal remains authorized when its node has transferred because
  the listeners belong to the old View. Original listener removals, View
  unsubscribe and Controller destruction are attempted exactly once. Foreign
  listeners, foreign subscriptions and foreign Controllers remain untouched.
- Destruction cannot cancel or roll back an original Store write already issued.
  Real delayed success may commit; delayed failure may reject. Neither may publish
  later into the retired View or alter the foreign source.

## New matrix

The final 141 new cases cover:

- 36 exact-value/no-write cases for all twelve targets plus find label, append
  label, import controls, common controls, host and ancestor, each transferred
  within the document and across documents.
- 18 positive original-detachment cases and six conservative former-ancestor
  transfer cases.
- 24 one-shot metadata-getter cases across target and ancestor parent/document
  reads, plus 24 consecutive cleanup-setter transfer/reentrant-destroy cases.
- Four translation/method-getter transfer cases, four already-foreign method
  getter cases, six first-error cases including
  falsey values, and two throwing ownership-getter cases.
- Eight genuine saved/dirty/error/conflict/pending states with source-handle
  substitution, four original clipboard-resource cleanup cases with ordinary or
  throwing owned cleanup, and four prior-owner constructor callback cases.
- One complete public-target/source substitution positive, retaining owned cleanup
  and preserving the real foreign View.

Tests compare original raw bytes, backend counters, Controller state identity and
content, draft, generation, actual error/pending/conflict state, editor/saved
preview/status/retry UI, focus and selection where applicable. Foreign target
values and write counts are checked separately. Real pending settlement asserts
its actual allowed storage result and lack of late UI publication. No permission,
network, clipboard read, fallback command or automatic copy retry is requested.

## Candidate 1, independent finding and final frozen bytes

The first candidate passed **550/550**, zero failed/cancelled/skipped tests, exit 0,
in **5868.245939 ms**, using the six explicit files below. Source/test bytes were
frozen, their hashes checked, and Node ownership returned for independent review.
The coordinating task then found an in-scope method-access gap: the attribute
helper retrieved `setAttribute` before any ownership check. Even though its final
call was gated, an already-transferred button's new getter could still run.

Node ownership was explicitly returned to this worker for that narrow correction.
Four new same/cross-document returning/throwing method-getter cases produced a
real candidate-1 RED of **141 tests / 137 pass / 4 fail**, zero cancelled/skipped,
exit 1, **711.006549 ms**. The complete final test was also run on unchanged
feature 95, with the expanded RED result above. Candidate 1, its logs and hashes
remain preserved. No old test or helper changed.

Candidate 2 adds only the initial chain-eligibility check before method retrieval
and retains final revalidation after the lookup. Its first focused run passed
**554/554**, zero failed/cancelled/skipped, exit 0, **5961.252941 ms**:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-scratchpad-teardown-targets.test.js \
  tests/local-scratchpad-copy-feedback-targets.test.js \
  tests/local-scratchpad-copy-transaction.test.js \
  tests/local-scratchpad-view-lifecycle-source.test.js \
  tests/local-scratchpad-find-text.test.js \
  tests/local-scratchpad-view.test.js
```

This is 141 new cases and 413 unchanged existing cases. There were no old-test
compatibility failures, and no old test assertions/helpers were changed. Final
source/test bytes were frozen at this candidate-2 GREEN, execution hashes checked,
and the sole Node window immediately returned again. The final expanded RED and
GREEN test bytes match. This worker performed no further Node, including syntax,
full or scale runs, after that second handback.

Frozen SHA-256 values:

- View: `c242b308ac5fdb6609f717228a46241278ee949d6f410eb7bcd1cde171e25e13`
- New test: `b7167418b45f131706560ebbad691c97ee7913adc7cf8efcc76577df166fbc3e`

The post-GREEN static/hash audit confirms all **1,492 unaffected tracked files**
and all **498 protected files** match baseline. Only the permitted View changed
among tracked files; this new test and validation document are the added
files. Only constructor and destroy changed among the 40 View methods. The other
38 methods, all existing clipboard helpers, and the complete lexical
mountSettings/export tail are byte-identical.

This focused result does not replace independent ownership review, broader related
regression, Python tests, packaging, the exact remote commit's unchanged full CI,
master/runtime hash readback or frozen Release verification. Those gates remain
the coordinating task's responsibility.

## Independent review and final local gate

The independent matrix checks all twelve target types under same-document target
transfer, same-document ancestor transfer, recursive cross-document adoption and
original detachment. It separately checks whole-host transfers, earlier setters
transferring later targets, exactly-once original cleanup with a real foreign
Controller, and falsey first exceptions. The initial 54 cases produced **14 pass /
40 fail** on unchanged feature 95 (**320.640499 ms**) and passed on candidate 1
(**312.515684 ms**). Candidate 1 also passed the then-current combined 989 cases;
those logs and its package are retained as historical candidate evidence only.

Independent review then added the already-foreign findButton method-getter case:
candidate 1 was **54 pass / 1 fail** (**383.734546 ms**), and unchanged feature 95
was **14 pass / 41 fail** (**340.6321 ms**) with the same expanded 55-case bytes.
That actual failure motivated the narrowly scoped correction documented above.
Final candidate 2 passed **55/55** independent cases (**335.856327 ms**), then the
explicit 20-file combined independent regression passed **990/990**, zero
failures/cancellations/skips, **17303.206523 ms**.

Independent static review verifies only constructor and destroy changed among the
40 View methods; all 38 others, every pre-existing top-level helper and the full
settings/export tail are byte-identical. All 1,492 unaffected tracked files and
498 protected files match baseline, including every previous test and helper.

The final explicit 40-file related regression passed **2118/2118**, zero failures,
cancellations or skips, **28828.838434 ms**. All 41 source/test execution hashes
remained unchanged, and both syntax checks exited 0. Final Python discovery passed
**84 tests** in **1.949 s**. The unchanged package builder and verifier passed for
**133 runtime files**, **4,069,246 source bytes**, runtime SHA-256
`02f43c5b625dfc432f486f744f3b6dca874db7c87631356d3b31169325481097`.
The earlier candidate-1 package was preserved, not replaced.

These focused local gates are distinct from the unchanged full exact-commit CI.
Publication requires its terminal success, all 133 runtime-file hash comparisons,
master readback and frozen Release readback. Ordinary action admission and
historical data-loss causation remain outside this teardown-only change.
