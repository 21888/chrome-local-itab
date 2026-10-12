# 1.1.91 batch verification

Two ordinary feature commits form this release:
01e4ae4b82722d9e59b76f4b712c6f873ce4bb51 (complete navigation metadata) and
75b62484efd735eb14644b1e256d8f39d014ae0c (individual excerpt restore).
The second exact-source CI passed2438 Node and64 Python tests without publication.
This release changes only version90→91 and documentation; official v1.1.90
baseline is991213fa65e7369c2bb789f8377265d1bb3b7b16.

Feature-native scopes remain in navigation-complete-metadata-validation.md and
ai-restore-excerpt-validation.md; dark/large-input and complete language matrices
were not run. Final identity evidence below does not extend those feature claims.

## Final identity smoke — 2026-10-12

Exact112-file ZIP SHA-256:
`d8c779bc6b158317fcba1518987267d6e15eba1a056fc529957b8cd56c8a12c0`.
Compared with development ZIP
`0967280dabd315d9860384b5a02e142671ac24c3db36cb0e6ba52b915c8d9ff1`,
only manifest.json differs, and its parsed object changes only version90→91.
This docs-only finalization preserves those runtime bytes.

Independent Chrome for Testing155.0.8059.39 Chinese synthetic profile, with
foreground checked, performed ordinary Reload and visibly showed1.1.91.
Fresh navigation showed120/106 not added/14 added. PhET compact+1 and all three
expanded purposes were visible. AI opened blank with three existing sources;
selecting alpha showed original49-character excerpt, disabled restore and
budget420. Cancel/Clear reset selection/budget279; Escape closed cleanly.
Default14, prior categories, Clarity light and Grid remained.

No DevTools/dark/large-input tests or full native rerun. No provider setup,
Allow/Send, external links, saves, new permissions or uploaded screenshots.
Other original bodies/versions and note were not re-audited in this minimal
smoke; the preceding restore report separately verified all three originals.
This is candidate identity, not live Release verification; released exact-source
CI and asset identity must be checked after publication.
