# New category with reviewed navigation sites — 1.1.84 candidate

The feature adds a new-category draft and immutable review alongside existing
personal-category selection. All requested sites and the new name require
explicit review/confirmation. Storage validates the whole request before writes,
rejects normalized duplicate names, deduplicates URLs and allocates a category
identity avoiding current categories and legacy/identity-layout references.
Category, links and necessary layout updates share the protected write.
No additions means no empty new category. Existing workspace/privacy/uncertain
save guards and single-site compatibility remain.

The UI bounds names to 1–80 Unicode characters after trim/NFC normalization,
rejects control characters, invalidates old review when draft/target changes,
and prevents confirmation during IME composition or saves. Successful adoption
refreshes category navigation without changing active category/reflowing layout.

## Automated verification

The first implementation full run passed 2376 Node tests and 53 Python tests.
Two further storage regressions were added for identity-allocation exhaustion
followed by retry and definite write failure followed by an external duplicate;
focused storage 77 and related 158 tests passed. The final full run including
those two additions passed all 2378 Node tests and 53 Python tests. All ten
implementation/test files were compared byte-for-byte with the tested frozen
source and match. The versioned build changes only manifest 83→84 and adds
release/validation documentation.

## Bounded native category checks — 2026-10-12

The existing synthetic Chrome for Testing 155.0.8059.39 installation loaded the exact 112-file
1.1.84 ZIP with SHA-256
`a9712faea2a1644b1a7ab61d3df4a7f671ae3a5b77ad9ccf97f357d4d1984e8f`.
Hash, paths and version were checked; standard Reload showed 1.1.84.
This documentation-only update preserves those runtime bytes.

Representative Chinese UI checks passed:

- Canceling a single-site new-category review left eight saved sites and no
  empty category. Explicit single-site Canva confirmation created qa-single
  with only Canva; a separately checked Leonardo was not mixed into that action.
- The single and batch reviews showed full site URLs, the new-category name
  and disabled Sync/online-icon disclosures. A two-Copilot batch review explicitly
  created qa-batch with Microsoft Copilot and GitHub Copilot.
  Original Work1 / Learning7 remained; total became eleven. New categories were
  immediately visible while the current All view was not switched.
- A duplicate category name was rejected. At 320px dark, the reviewed name/list
  and controls wrapped and remained usable, with Return reopening confirmation and a separate Return confirming; focus
  then moved to the first result card.
- Existing-target compatibility: opening from Work and confirming Notion into
  existing Learning retained the current Work view rather than switching it.
- Ordinary refresh preserved total12 / Learning8 / qa-single1 / qa-batch2 and
  Work1, comprising the original eight plus four new synthetic additions.
  Clarity light desktop was restored afterward.

No zero-category native scenario, IME composition, race/failure injection or
atomic-write instrumentation was performed. Those boundaries remain covered by
synthetic tests and code review only. This pass does not certify every name,
selection count, language, theme or accessibility path. No new runtime file,
permission or external call is introduced; screenshots remain local.
