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
- Native browser, visual layout, and assistive-technology verification have not
  been performed for this patch.
