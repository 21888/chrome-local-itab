# Loaded AI context source scope filter

Adds a labelled native select with All sources, Current workspace note, and Global collection. The existing source contract uses `workspace` and `library`; no source acquisition or controller code changes.

The selected scope is ANDed with title search and selected-only view. Both rendering and visible batch-selection eligibility share the same predicate. The scope only hides existing row nodes, preserving order, checked states, edits, complete outgoing budgets, exact reviewed requests, results and snapshot choices. Hidden selections remain explicitly counted and remain outgoing. Batch selection includes all hidden selections when enforcing the existing 12-source limit and never selects a partial set.

Scope changes do not call the controller, storage, permission APIs or transport, and do not create a dirty draft. They remain available during a pending request. Clearing the title search leaves scope and selected-only state alone; clearing the complete draft resets scope to All sources. Empty scoped views explain changing the filters rather than implying another workspace will be loaded.

## Validation

- Added five actual-view regression cases: 25/201 mixed-source lists, no current workspace note, combined filters, exact row identity/order, hidden selected edited excerpts, unchanged budget/review/result/snapshot, 12-source batch cap including hidden selections, clear actions, native labelled select focus, and pending-request zero-I/O filtering.
- Focused view tests: 56 passed.
- Full Node suite: 2,443 passed, no failures, skipped or cancelled tests.
- Python suite: 64 passed.
- ZIP generation and independent ZIP verification passed; 112 runtime files.
- No manifest version change, commit, push, browser execution or screenshot capture in this change. Native browser keyboard/visual verification remains for integration.

## Combined development preparation

The merged Chinese-aliases plus source-scope tree passed all2446 Node tests
with strict unhandled rejections and64 Python tests. Version remains1.1.91;
this is an ordinary development commit, not a release. Exact native scope-filter
verification is still pending and will be documented for the batched release.
