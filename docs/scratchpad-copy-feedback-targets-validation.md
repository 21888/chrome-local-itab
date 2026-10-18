# Scratchpad copy feedback target validation

## Scope and evidence limits

Feature 95 binds clipboard feedback and final copy-control writes to the original
per-attempt DOM targets and ancestry. Production changes are restricted to
`shared/local-scratchpad-view.js`. Store, Controller, Tasks, input, import, export,
find, settings, schemas, locales, permissions, manifest and workflows are unchanged.
Manifest 1.1.155 and the frozen Release remain unchanged by this implementation.

Tests use the real Store and Controller, actual delayed synthetic clipboard
Promises and real backend operations to establish conflict, read failure, write
failure, lost acknowledgement and pending writes. DOM/public-field/accessor
injection is robustness evidence, not normal navigation or a demonstrated cause
of historical data loss. No OS clipboard, native Chrome, browser, screenshot,
user device, paid service, network flow, commit, push or Release was used.

The existing deterministic DOM helper does not automatically detach or adopt
appended nodes. Every transfer in the new tests explicitly removes the node;
cross-document transfers recursively update `ownerDocument` before appending.
Same-document cases construct the foreign host in the original document. The
shared helper is unchanged.

## Proven unchanged-source RED

The originally prepared diagnostic had never run and did not accurately model
cross-document adoption. Its exact unrun bytes were preserved before correction.
The corrected 24-case diagnostic covers all three copy routes, true same-document
reparenting and explicit cross-document adoption, each at success, failure,
explicit invalidation and destroy. All **24 fail on feature 93**, and all **24 fail
on unchanged feature 94**. The full-copy same-document route writes late success
or failure into the transferred status; the other boundaries clear and hide it.
Each original clipboard call remains single, and backend reads, writes, commits
and locks remain unchanged during these probes. This establishes that the target
ownership fault predates feature 94's private transaction fix.

The first complete new matrix produced **128 tests / 39 pass / 89 fail** on
unchanged feature 94, with zero cancelled or skipped, in **572.524473 ms**. The final
expanded matrix produced **143 tests / 48 pass / 95 fail**, zero cancelled or
skipped, in **634.197935 ms**. The expanded matrix's test bytes match the final
GREEN test bytes. Original source, diagnostics, test snapshots, execution hashes
and every complete RED log are retained with the coordinating task's evidence.

Before production edits, all **1,491 tracked files** and **497 protected files**
were snapshotted. Baseline View SHA-256:
`e10e1c80d05658e9ac52961a10ffa7d027a63dbd4f509d345f77441e2713b54c`.

## Clipboard-only contract

- Capture original editor, status and each copy-button ancestor chain per attempt.
  Currentness requires the exact same-document links and the captured host in each
  target chain. Public node identity alone cannot authorize late control writes.
- Keep action visibility distinct from cleanup ownership. An original detached
  node, host or ancestor fragment can still own feedback. A new parent or document
  cannot. The detached cleanup check is deliberately conservative: it validates
  the full captured chain, including former ancestors beyond a detached break.
  Adoption or reparenting of a former ancestor can therefore suppress cleanup of
  an otherwise original detached status. This is not a claim to cover every
  detached-fragment combination.
- Revalidate before each status text/hidden write and each final button write.
  Status setters or a previous button's setter can synchronously transfer later
  targets. A second ancestry pass handles the demonstrated one-shot metadata
  getter transfer that returned a stale link on its first read. This is bounded
  robustness testing, not a security guarantee against arbitrary hostile getters.
- Observe removal of the status and all captured copy buttons so a queued
  reparent/restore cycle cannot revive stale completion.
- Private feedback retirement, exactly-once resource cleanup and active clipboard
  reservation retain feature 94's contract. Foreign public receipt replacement,
  owned throwing cleanup and reentry cannot transfer cleanup authority or release
  a genuinely issued promise before actual settlement. A new explicit user copy
  works after settlement and restoration of eligible targets.
- Destroy's copy-status path uses receipt-owned ancestry when feedback exists.
  Without feedback it uses a private construction-time status chain, never a
  mutable public saved/selection owner as authority. Other teardown is unchanged.
- Keep existing current/selection late workspace/session admission. This patch
  does not impose construction-source eligibility on those routes. Saved copy's
  existing stricter source eligibility is unchanged.
- Preserve exact raw current/saved payloads, selected native DOM slices, original
  Controller state, actual status/buttons, storage bytes, backend counters, focus,
  selection and no permission/read/fallback/automatic retry effects.

## Candidate RED and approved compatibility changes

Candidate 1 passed all first 128 new cases, but the explicit six-file compatibility
run was **759 tests / 749 pass / 10 fail**, zero cancelled or skipped, in
**3919.192065 ms**. These were actual old assertions demanding clearing after the
status's ownership had transferred; the original files and failure log were
preserved before any approved assertion update.

The new metadata-getter coverage then demonstrated six additional candidate 1
failures. Its expanded three-file run was **539 tests / 523 pass / 16 fail**, zero
cancelled or skipped, in **2758.555375 ms**: the same ten old compatibility branches
plus six new getter-reentry cases. Candidate 1 source and both logs remain intact.
Candidate 2 adds a narrow second clipboard ancestry validation pass.

The coordinating/root review explicitly approved updates to exactly these ten old
branches, after their real failures were reported:

- `local-scratchpad-copy-selection.test.js`: `status document` and `status parent`
  in the four-case "cannot redirect old feedback" loop: two cases.
- `local-scratchpad-copy-saved.test.js`: `status reparent`, `host ancestor reparent`,
  `host document replacement`, and `copyStatus document replacement`, each in the
  `pending` and `settled` phases: eight cases.

Their original purpose remains: reject new copy admission after source loss,
retain an issued lock until actual settlement, reject late source acknowledgement,
and preserve substituted foreign status. Only those transferred-ownership branches
now install a new owner's message and assert unchanged text/hidden state, retired
original receipt, null receipt mirror and unchanged backend/Controller/UI snapshot.
Existing call counts, pending lock assertions and all other branches are retained.
Own detached originals, status replacement and controls-document cases still
require original-status clearing. All helpers and all other old test files remain
byte-identical; prefixes and suffixes outside the two approved loops are unchanged.

## First final GREEN and freeze

The first final explicit focused run passed **774/774**, zero failures,
cancellations or skips, exit 0, **4044.856922 ms**:

```sh
node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-scratchpad-copy-feedback-targets.test.js \
  tests/local-scratchpad-copy-transaction.test.js \
  tests/local-scratchpad-copy-text.test.js \
  tests/local-scratchpad-copy-selection.test.js \
  tests/local-scratchpad-copy-saved.test.js \
  tests/local-scratchpad-view-lifecycle-source.test.js
```

This comprises 143 new target cases and 631 existing cases, including exactly the
ten approved purpose-preserving updates. Production and test bytes were frozen at
this first GREEN and the sole Node window returned immediately. No subsequent
Node, syntax, full or scale run was performed by this implementation worker.
Independent review, broader regression, packaging, exact remote CI and publication
remain separate coordinating-task gates.

Frozen SHA-256 values:

- View: `f6f1cb1c2942bcc6caea7d6d1deaa00eaad606df0374a3f90d05996acf327b8b`
- New target test: `5f5c9584e56ab7306ad0290ee74405ccf935d809c15b3e944097ce2ded0cac39`
- Approved selection test: `6b0b0ee43dd9c42a1483f75dc0a67d68073a10c61a0a5f493243b00137ca1f6f`
- Approved saved test: `e078e3b0ab5aa84da5aa4692d3af328bbc68c52f294d28db403e626a58fcb333`

Post-run hash audit confirms all **1,488 unaffected tracked files** and **495
unmodified protected files** match baseline. The only changed baseline files are
the permitted View and the two specifically approved old test files. The new test
and this document are the two added deliverables. General lifecycle and other
find/import teardown ownership are not expanded by this patch.

## Independent review and final local publication gate

The independent 42-case matrix uses separate real Store/Controller instances,
real delayed clipboard outcomes and explicit DOM transfers. It covers each route's
same-document and cross-document status transfer at resolution, rejection,
invalidation and destroy; transferred controls at both actual clipboard outcomes;
and a status cleanup setter that transfers the node before the old hidden write.
It also verifies unchanged backend bytes/counters and a real fresh copy after
restoring ownership and settling the original promise.

That exact independent matrix produced **6 pass / 36 fail** on unchanged feature
94 (**320.854637 ms**), and **42/42** on the frozen candidate
(**384.151884 ms**). The explicit 19-file independent regression then passed
**935/935**, zero failures/cancellations/skips, **16678.421323 ms**. An earlier
path-setup attempt executed only the new 42 cases; its complete log was retained
separately and was not counted as the combined regression. The corrected run uses
verified absolute file paths and explicitly checks the expected 935-case count.

Independent static review verifies all ten approved old branches individually:
two selection cases plus four saved ownership changes at two phases. They now
preserve real new-owner feedback, invalidate the original receipt, and assert
unchanged backend/Controller/UI snapshots. Original call counts and pending locks
remain, and clearing still applies in every non-transferred branch. Both old test
files' text outside their approved loops, all helpers, 1,488 unaffected tracked
files and 495 other protected files remain byte-identical. Only constructor,
executeSavedCopy, executeCopy and destroy change among the 40 View methods; the
other 36 methods and complete lexical settings/export tail remain unchanged.

The final explicit 39-file related regression passed **1977/1977**, zero failures,
cancellations or skips, **27466.822959 ms**. All 40 execution hashes remained
unchanged, and all four source/test syntax checks exited 0. Python passed **84
tests** in **1.988 s**. The unchanged package builder and verifier passed for
**133 runtime files**, **4,067,497 source bytes**, runtime SHA-256
`9cb160a873ffd512185deb84b209e6a5fe8e0b3cf0dd66dee6cf95b2ade9bb4f`.

These local checks do not replace the exact remote commit's unchanged full CI.
Publication requires its successful full test/build workflow, every runtime-file
hash comparison, master readback and frozen Release readback. No general
find/import teardown, data-loss cause, new permission or browser validation is
claimed.
