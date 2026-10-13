# Navigation selected-only view — development verification

Implementation is based on 1.1.101 and leaves its manifest unchanged. It adds a
session-only pressed-state toggle and a separate hidden-selection count. Existing
full-name/destination review and explicit confirmation are unchanged. Source
metadata/disclosures, all filter intersections, and the 20-site selection limit
remain intact. No permission, storage schema, or network behavior is added.

Verification on 2026-10-13:

- Strict unhandled-rejection Node suite, 1 GiB old-space limit: 2570 passed;
  no failures, skips or cancellations.
- Python: 81 passed.
- Reproducible runtime package and source comparison: 112 files verified.
- Six new view tests cover hidden counts, all filter intersections, full-selection
  review and stale confirmation, zero writes, missing destination, retained
  disclosures, empty state, adjacent-checkbox/last-toggle focus, 20-site cap,
  close/reopen and stale nodes, repeat/composition, pending/conflict guards,
  and English/Chinese text.
- Limited Chinese desktop-light native checks passed: two selections across queries, selected-only AND query, hidden-two complete review cancellation, clear filters preserving selection/category draft, first/last checkbox focus transfer, clear-selection empty-view exit and close/reopen reset. No additions occurred. Native did not cover 20/21 limits, middle-of-many focus, exhaustive filter intersections, dark/responsive/IME or full accessibility; aria-pressed was not introspected.
