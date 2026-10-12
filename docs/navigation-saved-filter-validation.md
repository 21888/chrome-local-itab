# Navigation saved-state filters — 1.1.77 candidate

This separate feature adds All / Not added / Added view filters and counts.
Counts respect existing search/category/advanced filters before saved-state
selection. Canonical URL matches use the current workspace across all its
categories; category destination changes and renamed shortcuts do not redefine
saved status. Existing storage transaction/conflict handling is reused.

A successful Add in Not added updates counts, removes the card and keeps the
success message. The next/previous remaining card receives focus, or the empty
result message when none remain. Clear filters resets saved-state choice;
reopening reloads workspace state and resets view filters.

## Automated verification

The reviewed six-file implementation patch passed 2293 Node tests and 53 Python
tests on its independent candidate. Synthetic regressions cover filtering,
counts, canonical matching, workspace/category boundaries, add-result focus,
empty results, reset/reopen and existing save protections. This versioned
preparation applies that patch unchanged and adds only manifest/release/validation
documents. No extra runtime file, permission or catalog record is introduced.
Its package continues to contain 112 allowlisted runtime files.

## Bounded native acceptance — 2026-10-12

The same synthetic Chrome for Testing 155.0.8059.39 installation loaded ZIP
SHA-256 `7bbae209aace8a99dc3e534fbbc32d9aec10d22b49c6b7cb9a59258238006da7`.
All 112 expected paths were verified and ordinary extension Reload showed
1.1.77. This documentation update preserves those runtime bytes.

Passed representative English Clarity paths:

- Initial All84 / Not added81 / Added3 matched three existing synthetic links.
- Searching grok in Not added produced 1/1/0. Adding Grok to Learning displayed
  success, removed the only result and updated counts to 1/0/1 with empty state.
  The next Tab reached modal Close rather than escaping the dialog.
- Added showed Grok with its Add control disabled. Changing target to Work and
  clearing filters restored 84/80/4. The dashboard showed four shortcuts, Grok
  once and Learning three; the selected target did not redefine saved status.
- Clear reset search/status/category and focused search. Close/reopen reset to
  All and preserved four shortcuts; Escape returned visible focus to the entry.
- Actual 320px light and dark viewports: chips wrapped two then one, with full
  readable labels/counts and no horizontal overflow. Tab from selected Not added
  reached Added with a visible focus ring in dark mode.

The empty-message focus property was not directly observable and had no visible
ring: only the following Tab to Close was observed. Do not claim a verified
activeElement or screen-reader announcement. Remaining next/previous-card focus,
Chinese, other themes and exhaustive catalog/filter combinations were not tested.
The earlier 1.1.76 summary containment matrix was not repeated in this pass.
No personal data, browser injection, external links/provider calls, new permission
or screenshot upload was involved. Screenshots remain local.
