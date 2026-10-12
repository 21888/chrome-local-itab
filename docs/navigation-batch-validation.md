# Navigation batch-add candidate — 1.1.80

The seven-file patch adds explicit site selection capped at 20, retained across
filters. The review displays every selected site's name and the destination
category before confirmation. Existing single-site Add remains available.
Closing the library clears selection. Browsing, selecting and review/cancel are
not save authorization by themselves.

The storage contract accepts the existing single-site request or a bounded batch,
rejects ambiguous/invalid requests before writing, deduplicates canonical URLs,
allocates noncolliding identities and writes additions together. Existing links,
metadata, categories, workspace/layout identity and privacy guards remain.
Unknown save results preserve the existing read-back/blocking behavior rather
than pretending success or blindly retrying.

## Automated and independent review evidence

Patch SHA-256:
`1328210c3348c95ff191f4e6733fb78d65a45bf87f2e07d949d2d161a66b0a5c`.
The implementation candidate passed 2328 Node tests, 53 Python tests and canonical
112-file package verification. This versioned preparation changes the manifest
79→80 and adds release/validation records; implementation tests remain unchanged.

Independent read-only transaction review found no established must-fix or high-
risk issue. Its storage/view/integration tests passed 102/102, plus three separate
synthetic combination checks: single Add retains remaining selections while
invalidating stale review; filtered-out selections remain in the complete review
and submit once; cancel/close stale confirmation callbacks do not write. Review
covered the one-write boundary, deduplication, preserved metadata, workspace and
privacy checks, failure/unknown read-back, double activation and late results.
It did not operate a real browser and does not establish native acceptance.

## Bounded native acceptance — 2026-10-12

The existing synthetic Chinese Chrome for Testing 155.0.8059.39 installation
loaded the 112-file 1.1.80
ZIP with SHA-256
`6dc0b948c9c7f1e6a2a39d3e8f5b7de20026b4b8b09fc7d1314f769b95f714c1`.
Hash, expected paths and version were checked; standard Reload showed 1.1.80.
This documentation-only update preserves those runtime bytes.

Chinese Clarity desktop and real 320px light/dark representative checks passed:

- Explicitly selecting DeepSeek and Kimi across filters retained both names in
  the review, together with the Learning destination, even after a zzzz search
  hid both cards. Keyboard Space toggled a checkbox.
- Returning from review/canceling wrote nothing. Confirming the two-site review
  grew saved shortcuts from six to eight and Learning from five to seven.
  Clicking the disabled already-added checkbox/control did not add duplicates.
- Confirmation Tab wrapped to Close, ShiftTab returned; returning to browsing
  restored the review trigger. Escape returned to the library entry and reopening
  reset selection to zero. Clear selection also reset without writing.
- Review names and buttons fitted 320px light/dark layouts without observed
  horizontal overflow; the coordinating reviewer inspected both review images.
- An unsubmitted Gemini selection at light 320px was canceled, and Escape
  returned focus to the entry without adding it.

The 20-item cap, hanging-save competition, malformed batches, uncertain readback
atomic one-write behavior and wider workspace/privacy race conditions remain covered by deterministic
synthetic tests and code review, not native reproduction in this pass. This is
not all-language/theme/width, all selection-count or complete accessibility
acceptance. Only synthetic sites/categories were used; screenshots stay local.
