# 1.1.94 batch verification

This batch combines navigation-details commit
f42da6caaa753e2a58c2e68989e24b144e686f7c and AI response-protection commit
941af621360f96fcd8fd83cafd5df3c93f97ed4a. Both ordinary commits retained93
without publication; second exact-source CI passed2490 Node/64 Python tests.
Release changes only version93→94 and docs; official v1.1.93 baseline is
8360ab5213e43f978e2a00c435558adcf9e7977d.

Feature scopes are in navigation-details-state-validation.md and
ai-previous-response-validation.md. AI core old-response retention, immutable
snapshot, replacement cancellation and save outcomes are synthetic-only.
Native AI checks used no-response local review/edit/clear, not a real provider
or end-to-end old-answer flow. No dark/responsive/full matrix is claimed.

## Final identity smoke — 2026-10-12

Exact112-file ZIP SHA-256:
`af6a5d3b1ec4760a117542a3fc65a78cb1f8c8a16929819a459997afe610ea33`.
Release preparation compared all entries with development ZIP
`5c1d4b6e748be45495f89ed73f532ff9966d15e09545825765f3eaabba6b4dbd`
and found only manifest.json changed. Native QA separately verified the final
hash,112 files and version before staging. This docs-only finalization preserves
those bytes.

Existing independent CfT155 Chinese synthetic profile, foreground confirmed,
used normal Reload. Settled extension card showed1.1.94 and a fresh tab loaded
normally with Default14, prior category counts, selected qa remaining2,
Clarity light and Grid. No feature-flow rerun occurred in this minimal smoke.

No data edits/saves, provider calls, new permissions, DevTools, injection,
external links or uploaded screenshots. AI/note originals were untouched and
not re-audited here. This is candidate identity, not live GitHub publication;
exact-source released CI and assets require subsequent verification.
