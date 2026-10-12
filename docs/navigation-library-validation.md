# Navigation library validation — 1.1.76 candidate

## Source and package scope

This candidate applies the reviewed 17-file feature patch with SHA-256
`790db80ee7d944eb105a8c085041d160d19bb44aae0b87f120a0b50cd98e10bb`
on top of the final local 1.1.75 source, preserving the 1.1.74/1.1.75 acceptance
documents. Release preparation adds the 1.1.76 manifest version and
release/validation records. A subsequent bounded count-label correction changes
English to `1 site` while preserving `0 sites`, plural `sites` and Chinese
`个网站`; it updates the view, both locale records and one regression test.

The canonical runtime allowlist grows from 108 to 112 files, adding only:

- `shared/navigation-catalog.js`
- `shared/navigation-sites.js`
- `shared/navigation-library-view.js`
- `navigation-library.css`

The manifest changes only its version. Permissions and extension security
policy are unchanged. There is no CI workflow change. The existing packager
allowlist and its test are updated to include the four feature runtime files.

## Automated evidence

The full feature candidate passed 2273 Node tests (0 failures) and 53 Python
tests. Its unchanged-version 1.1.75 candidate-4 runtime ZIP SHA-256 was
`b0252c0e4b62d4b56b7aa335fc25b41a25bed6ae3f036ee3e363aec5d5d2fb2d`.
Its 112 runtime files and all four new allowlist entries were checked. This
historical full-suite result is for candidate-4, not a claim that a new full
suite was rerun solely for this version/documentation reconstruction.

The catalog contains 84 unique sites and 116 bilingual use tags. Catalog and
view/storage regression tests cover structured records, filtering, safe links,
explicit addition, existing-link identity, save-state checks and lifecycle
behavior. Synthetic checks do not establish real browser timing, every site’s
current metadata or every possible concurrent-write situation.

The post-label targeted catalog/view run passed 21 tests with 0 failures.
The final versioned/count-label source
`586ac40b5e35f278f32d2af5265c509cff146a33` then passed all 2274 Node tests
and 53 Python tests. The Node command used strict unhandled-rejection mode,
a 1 GiB heap and serial files; no unhandled-rejection/asynchronous-activity
diagnostics occurred. Node v24.19.0 and Python 3.12.14 were used. HEAD and
clean working-tree state matched before/after; selected runtime source hashes
were unchanged and diff whitespace checks passed. The later keyboard correction and its separate verification are recorded below.

## Bounded native acceptance — 2026-10-12

The existing independent Chrome for Testing 155.0.8059.39 synthetic installation
was used through ordinary native controls. The coordinating reviewer inspected
real light desktop, light 320px cards and dark 320px screenshots.

Candidate-4 representative coverage, English UI / Clarity only:

- Light and dark at desktop (1188-pixel browser window) and a real 320 CSS-pixel
  responsive viewport: wrapping header, scrollable category region, single-column
  cards, descriptions, tags, official-site affordance and Add/Added fitted.
- Default count 84. Searching github plus Development produced GitHub; the Use
  menu narrowed to development uses, and Code hosting retained that result.
  Details displayed company, unknown location, pricing description and source
  review date. Clear filters restored 84 and focused search.
- Existing synthetic GitHub in Learning showed Added even with Work selected as
  target. Selecting Learning and adding ChatGPT returned Added to Learning.
  Clicking Added again did not duplicate it: dashboard All and Learning both
  showed two synthetic shortcuts, GitHub and ChatGPT.
- Closing/reopening or browsing without Add preserved that count. Escape returned
  visible focus to Discover sites; Return reopened with search focus. Close also
  worked. Official-site links were visually inspected but not opened.

Final 1.1.76 smoke used ZIP SHA-256
`ad22f685d9172bec6ebbb30f4c3748490d1374ad4af050191c5bf7d2e7be7ec0`.
All 112 runtime paths match candidate-4. Exactly four runtime files differ:
`manifest.json`, `shared/navigation-library-view.js`, `_locales/en/messages.json`
and `_locales/zh_CN/messages.json`. The change is the manifest version plus the
bounded singular-label view and locale updates; layout CSS, catalog data and
all other runtime bytes are unchanged.

After replacing the same fixed runtime and ordinary extension Reload, the native
extension UI showed 1.1.76. Two synthetic Learning shortcuts survived reload.
Discover sites opened with the default 84/card display; github plus Development
showed exactly `1 site`, GitHub and the existing Added state. The wider matrix
was not repeated solely for this four-file version/label delta. That smoke binds the ad22 runtime before the subsequent keyboard correction
below; it does not certify that new focus-boundary change.

Limits: representative English Clarity paths, not every theme/locale, all 84
records or every filter combination. Chinese/CJK native input, external-link
opening and arbitrary concurrent-write behavior were not tested. No personal
records, API keys, new permissions or provider calls were used. UI counts do not
constitute a native audit of every catalog record. Screenshots stay local and
are not included in source or release assets. This combines candidate-4 layout/
transaction checks with the final-76 identity/entry/label smoke; it is not an
exhaustive acceptance claim.

## First source-summary keyboard correction — native check failed

A keyboard boundary review found that the native details summary was omitted
from the shared focus-trap selector. The navigation view now gives its source
summary explicit `tabindex="0"`; the shared trap is unchanged. This keeps the
collapsed summary in forward/reverse Tab boundaries, including when Add is
already disabled, and lets expanded source links own the final boundary.

Three new deterministic view tests fail against the prior view and pass with
the correction. The independent corrected candidate passed all 2277 Node tests
and 53 Python tests. Its runtime change relative to the ad22 package is only
the navigation-view summary tabindex; version remains 1.1.76. These synthetic
focus-boundary tests are not a native keyboard acceptance claim.

Native testing of ZIP `1be572d1b09977ba7614c7b9e5a08eb64b137b9f08b129c08c1c526bfa2eab24`
failed the collapsed-details focus boundary. In English Clarity dark desktop,
a single Claude result was added to synthetic Work. The summary was reachable
in Added state, but Tab from the collapsed summary escaped to the background
footer instead of wrapping to Close, twice including after expansion/collapse.
Expanded source links correctly looped to Close and reverse back to the last
source. That limited comparison does not clear the failed collapsed state.
Source links were not activated and screenshots remain local.

## Closed-details ancestor correction — bounded native retest passed

The observed failure exposed an invalid assumption: descendants hidden inside
closed details can retain nonzero layout rectangles. The shared dialog focus
helper now explicitly filters closed-details ancestors, allowing only the first
direct summary subtree and applying the same rule at every nested ancestor.
The navigation summary retains its explicit tabindex. No shared-helper behavior
outside the reviewed closed-details visibility rule is intentionally changed.

The incremental patch SHA-256 is
`1d03648d67b1b625bdb8e71257a3a81c888cd1f7c6eba907096bc8ee6b18497a`.
Tests deliberately retain nonzero rectangles for collapsed links, cover nested
closed/open details, first-summary descendants, missing summaries and siblings.
The old implementation fails all seven boundary regressions; the corrected
candidate passes them, all 87 related tests, the full 2281 Node tests and 53
Python tests. These remain synthetic guarantees, not native acceptance.

The superseding exact-package native retest passed for ZIP SHA-256
`622e124b4c33b62dc0216565fbac18e7b76ac55167b34bc1b2771c2cd324d0e5`.
All 112 paths match the failed first keyboard package; only
`shared/dialog-focus.js` differs. Ordinary Chrome for Testing Reload replaced
the same fixed synthetic runtime, still version 1.1.76. This final documentation
update preserves those exact tested runtime bytes.

Passed, English Clarity dark desktop only:

- Existing Added Claude single result: search ShiftTab to Close, then ShiftTab
  to collapsed summary; summary Tab wraps to Close without reaching the footer.
- Enter expands Claude details; Tab reaches source1, source2, then Close.
  Reverse traversal reaches source2, source1, summary. Enter collapses and Tab
  goes straight to Close, skipping the hidden links.
- Unadded Grok single result: Close ShiftTab reaches collapsed summary and
  summary Tab wraps to Close. No add was needed for that state.
- Escape returns visible focus to Discover sites.
- Ordinary Add Shortcut dialog smoke: initial Title focus, Tab to URL, reverse
  traversal through Title/Close wrapping to Save, Save Tab wrapping to Close,
  and Escape returning focus to the Add Shortcut tile. No fields were entered
  or saved during this ordinary-dialog check.

The failed summary-only package remains documented above as superseded evidence,
not a passing build. This retest clears the focused regression and one ordinary
shared-dialog smoke only: not every dialog consumer, multi-card boundary, theme,
locale or assistive technology, and not a full accessibility audit. Source links
were not opened; screenshots remain local. Version remains 1.1.76 within the
same unpublished feature commit. No release or remote update is implied.
