# Markdown review initial focus: V2 narrow native acceptance

Passed 2026-10-11 approximately 04:13–04:17 UTC. The previously observed initial-warning visibility issue is resolved in both Markdown review dialogs.

## Runtime and fixture isolation

Frozen runtime: `/workspace/shared/markdown-export-native-candidate-v2/runtime`; 89 files all hash-matched before and after testing. Candidate version remains 1.1.28. No runtime/manifest bytes changed.

Because the original browser loaded the immutable V1 candidate directly, a normal reload would still load V1. As approved by parent, this check instead launched a fresh isolated Chrome for Testing 155.0.8059.39 profile against the V2 path. Its unpacked extension ID differs from V1. No identity workaround, manifest key, or browser storage manipulation was used. V2 launched fresh rather than hot-reloading V1. V1 runtime, profile, and original evidence were retained unchanged; `v1-preservation-verification.json` confirms V1 original evidence hashes plus all 89 V1 runtime hashes still pass.

All application actions used native CUA screenshot-guided mouse and keyboard on the dot cloud desktop. No CDP, injected application JavaScript, headless mode, storage seeding, security permission changes, or user computer. Existing windows were preserved.

## Exact bounded checks

- Saved a fresh prompt using the same title and literal current template as V1. Its new body-version ID is `541d6693-ba56-4983-9b26-76fe921d5a51`.
- Opened prompt Markdown review at the same 1188×848 native browser window size. Without any scroll or keyboard action after opening, the title and full unencrypted/single-current-item/unsaved-work-and-history exclusion/privacy warning were visible immediately. Screenshot 01.
- First forward Tab visibly focused the preview. Shift+Tab from that first focusable control wrapped to Download Markdown, retaining focus inside the review. Escape closed the dialog and visibly restored focus to the export opener. Screenshots 02–04.
- Pressed Enter on the opener to reopen. Shift+Tab from the initial static heading focused Download Markdown; Enter produced an actual 231-byte `local-itab-prompt (1).md`.
- Created a minimal saved collection `V2 review excerpt`, body `Synthetic saved excerpt.`. No source URL was needed for this narrow focus check.
- Opened collection Markdown review. Again, title and complete scope/privacy warning appeared immediately, without scrolling. Forward Tab focused preview; Shift+Tab wrapped to Download; Escape restored visible focus to the collection export opener. Screenshots 05–08.
- V2 Chrome download history contained exactly the one explicitly requested prompt download and no extra downloads from either cancellation. Screenshot 09.
- Copied the original download unchanged through the native file manager to `exports/`. Comparison proves title, literal variables, line break, indentation, markup, fence encoding, metadata scope and omissions are unchanged from V1. The expected new body-version ID is the only difference. This is not byte identity between different synthetic records.

## Evidence and portable verification

Nine genuine unedited PNG desktop screenshots; one original V2 Markdown download; one byte-preserving copy of the original V1 prompt export under `reference/` solely for independent comparison. Profile and logs are excluded from the evidence package.

Run `node verify.cjs` to verify hashes and content comparison without the sibling repo or runtime. `comparison.json` records the standalone pass and runtime skipped. Run `node verify.cjs --runtime-dir /path/to/runtime` for optional 89-file V2 integrity verification; the performed result is in `source-integrity.json`. An extracted standalone package was also verified in a fresh temporary directory.

## Limits and handoff

This was a narrow review-focus regression check, not a repetition of V1 full acceptance. V2 did not repeat populated source-checkbox navigation/opt-in downloads, original JSON export, filled ephemeral values, multiple history versions, exhaustive tab traversal, locale/theme/width variants, or forced async race/disposal/BFCache conditions. No DOM focus identity or accessibility-tree semantics were inspected. V1 retains the broader download/source/JSON evidence.

Desktop released to parent at approximately 04:17 UTC. V2 browser window 92274691 remains open with synthetic data; foreground file manager shows V2 exports. No pending downloads or full test processes.
