# Navigation library empty-state recovery

The library distinguishes an empty selected-only view, selected sites hidden by
filters, ordinary zero matches, an empty built-in catalog, an unavailable catalog,
and failure to read saved shortcuts. English and Chinese copy describe the actual
state. Hidden selections include their count.

A filtered empty state has at most one low-emphasis recovery action. With no
selection, it exits selected-only view and preserves other filters. Otherwise it
uses the existing clear-filter path. Both preserve selection, existing destination
and a new-category draft; neither saves or adds anything. Clearing filters also
exits selected-only view, as before. Changing the view invalidates the old review.
Focus returns to the selected-only toggle or search field respectively. Empty or
unavailable catalogs do not offer a misleading clear-filter action.

Synthetic regression coverage includes both languages, both destination modes,
zero save calls, retired confirmations, hidden-selection counts, focused recovery,
IME and repeated activations, pending external work and saves, uncertain failures,
detached nodes and close/reopen. Existing card/filter/selection coverage remains.

Manifest remains 1.1.102. No permissions, catalog entries, storage schema, network
provider or save behavior was added. Browser testing was not performed in this
implementation task. All new test content is synthetic.

Validation: focused navigation view 113/113; Python 81/81; JavaScript syntax and
whitespace checks passed. Offline package verification passed with the unchanged
112-file runtime inventory. Full serial Node validation is recorded below.

Full frozen source: `node --unhandled-rejections=strict --max-old-space-size=1024
--test --test-concurrency=1 tests/*.test.js` passed 2581/2581, with no failures,
skips or cancellations. Package SHA256:
`b20364a6b067743c4f28045807a5f585c182a42a04d9b7877a0185e2edc452ba`.
