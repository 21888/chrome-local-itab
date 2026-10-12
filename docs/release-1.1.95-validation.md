# 1.1.95 batch verification

This batch combines Unicode-label commit043853d70232a183306d376feaf3d5601b0c3650
and tag-fidelity commit769a250f5ee8ab8f617442c715f0145f2626cfcd. Both retained94
without publication; second exact-source CI passed2498 Node/64 Python tests.
Release changes only version94→95 and docs. Official v1.1.94 baseline is
c36f2108626b508a207e770850e2213a1b26aa51.

Feature limits are in ai-unicode-source-label-validation.md and
collection-tags-preservation-validation.md. Unicode/emoji boundary correctness
and imported comma-tag save/copy fidelity remain synthetic-only. Native smoke
used existing ASCII sources/local review and empty-tag draft discard, not native
boundary fixtures, save/import or provider requests.

## Final identity smoke — 2026-10-12

Exact112-file ZIP SHA-256:
`87513d0ac2a2a1787284e81c42bc64452e54a3e73ddbedd3c31294299d567e8d`.
Preparation compared all files with development ZIP
`72d3d878a4846cdb84e1e9f1a54b947eaf62aa2e2ce8ed13a48fa152aa579246`
and found only manifest.json differs. Native QA verified final hash,112 entries
and version before staging. This docs-only update preserves those bytes.

Existing independent CfT155 Chinese synthetic profile, foreground confirmed,
performed normal Reload; settled extension card visibly showed1.1.95. A fresh
tab loaded normally with Default14, original category counts, selected qa remaining2,
Clarity light and Grid. No feature-flow rerun occurred in this minimal smoke.

No edits/saves, provider activity, new permissions, DevTools, injection, external
links or uploaded screenshots. AI/note originals untouched, not re-audited here.
This is candidate identity, not full native regression or live publication;
exact-source released CI and assets need subsequent verification.
