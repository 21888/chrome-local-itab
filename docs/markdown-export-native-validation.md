# Saved-item Markdown: native validation

2026-10-11. Tests used official Chrome for Testing on the dot cloud Linux desktop with isolated profiles and synthetic records. Original downloaded bytes and screenshots are preserved. No real account data or user device was used.

## Two bounded native passes

[V1 report](qa/markdown-export-native/v1/REPORT.md): three actual Markdown downloads proved that a saved prompt template retains literal variables while excluding completed values, older prompt history and unrelated prompts; collection source URL is absent by default and included literally only after opt-in. A fourth original download confirmed the existing collection JSON export remained usable. Escape cancellation made no download and restored visible focus. The first pass exposed a usability issue: focusing Cancel initially scrolled the tall review past its heading and warning.

[V2 report](qa/markdown-export-native/v2/REPORT.md): after a Markdown-only initial-heading-focus correction, both reviews immediately showed their heading and complete scope/privacy warning. Forward Tab, reverse wrapping, Escape and opener restoration worked. One actual new prompt download preserved the same exact content and omission semantics; the fresh record necessarily had a different body-version ID. V1 evidence was not rewritten.

The integrated version 1.1.29 matches all 88 non-manifest V2 runtime hashes; the 89th file, manifest.json, differs only by version from the native candidate's 1.1.28. See [integration record](qa/markdown-export-native/integrated-runtime.json). V2 broadly retains V1 results through the narrowly scoped focus delta; it was not a second exhaustive replay of every V1 flow.

## Reproduce evidence checks

Run node docs/qa/markdown-export-native/v1/verify.cjs and node docs/qa/markdown-export-native/v2/verify.cjs. Each standalone verifier checks its original artifacts without needing a sibling checkout. Optional runtime verification uses each original frozen candidate manifest, not the integrated version-bumped manifest. Historical hashes intentionally remain unchanged.

## Automated coverage and limits

Final integrated 1.1.29 regression also passed all 1,638 Node and 52 Python tests. Integration corrected a test-only baseline-version pin; exact permission checks remain intact and runtime bytes were unchanged.

The exact V2 source passed 1,638 Node and 52 Python tests before native recheck. Independent audit found and verified fixes for pending-refresh stale export, BFCache review retention and stale opener focus after disposal. Unicode/CRLF, long Markdown fences, state races, forced errors and disposal boundaries are automated tests, not native claims.

There was no exhaustive language/theme/resolution matrix, restored/archived-record native pass, browser-restart durability test or full-backup compatibility replay. Collection history/other-record exclusion has automated coverage; the V1 native collection fixture had one body version. Markdown is an unencrypted readable copy, not an importable recovery backup.
