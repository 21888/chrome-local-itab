# 1.1.89 batch verification

Two independent feature commits form this batch:

- Title search: 25612a8e47e922936bc6c8135eda2f51c4e05a6c.
- Selected-only view: 15889076b19b6315247a5eb371ec336c0d1e5b56.

Both retained version88 and passed exact-source CI with publication skipped.
The second combined tree passed 2414 Node and 64 Python tests. This release
commit adds only version88→89 and release documentation, based on official
v1.1.88 at a540592b35a0e2956ba2aee5fbcf933a8f84120d.
Feature-native scope and remaining synthetic-only boundaries are documented in
ai-source-title-search-validation.md and ai-selected-sources-view-validation.md.

## Final identity smoke — 2026-10-12

The 112-file final ZIP SHA-256 is
`7a7b1e2eed3a1e24abb7a31aa400dc679d7cfad17b486aa55d93db38a2635da1`.
Compared with development ZIP
`e063a0a9b1890746efda3e3c5fa180e23fef8915c76d3e9d6c4511afb769ece2`,
the path set is identical and only manifest.json differs. This docs-only
finalization preserves those bytes.

Independent Chrome for Testing 155.0.8059.39 Chinese synthetic profile used
ordinary Reload and visibly showed 1.1.89. A fresh tab retained fourteen sites.
AI showed title search, selected-only toggle, one existing source, selected0 and
budget279. Selected-only with zero selections showed0/1 and guidance; clear
restored blank query/full1/1/inactive toggle. Escape closed without confirmation
and returned opener focus. Default14, existing category counts, Clarity light
and Grid remained.

This is minimal final identity validation, not a full repeat of native feature
cases, provider checks or live Release verification. No data saved, new sources,
permissions or external navigation; earlier AI/note fixture contents were not
re-audited in this smoke. Screenshots remain tool-transcript evidence rather than
release attachments. Publication still requires exact-source CI/asset verification.
