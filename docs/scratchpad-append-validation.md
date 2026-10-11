# Scratchpad TXT append validation

## Behavior

The existing TXT preview now offers an explicitly labelled native checkbox to keep the saved note and append the file. Replacement remains the initial mode. The preview, Unicode-character count and UTF-8 byte count represent the entire resulting note, and the confirmation button names the selected action. Choosing a file or toggling the mode never writes. Cancel and Escape keep the old note, clear the mode and return focus to Import.

Append preserves both strings exactly. It inserts one LF only when both are nonempty and the existing note does not end with CR/LF and the file does not begin with CR/LF. Empty-file append leaves existing content intact. Existing BOMs, whitespace, emoji, literal markup and line endings are not normalized. Combined text is validated against the existing 32,000-character and 128-KiB limits before saving; an over-limit combination disables confirmation and explains how to continue. Turning append off recovers the valid replacement preview.

The captured target state and edit generation remain the authority for both modes. Edits, IME, refreshed/remote state, visibility changes, cancellation, a new chooser and destruction invalidate stale previews. The final combined string goes through the unchanged controller/store CAS and verified-save path. A failed or conflicted save retains one complete combined draft for Export/Retry; retry never appends the source a second time.

No permissions, network requests, storage keys, schemas or backup boundaries change.

## Automated checks — 2026-10-11

- All 72 tests across the three Scratchpad Node test files passed after implementation.
- 19 append-specific cases cover newline edges, empty source/target, literal markup/BOM/Unicode, preview-only toggles, Cancel reset, exact combined character limits including the separator, completed-preview invalidation, unseen remote writes, exported conflict drafts and failed-save retry without duplication, and retiring decoded text before a second asynchronous file read.
- Existing 39 view tests continue to exercise file preflight, invalid UTF-8, async ownership, failed verification and recovery, native-undo/IME preservation and hidden-state privacy.
- This is deterministic DOM/controller/store coverage. Native browser appearance, real file-picker interaction and assistive-technology announcements for the new checkbox have not yet been verified.

## Independent adversarial review — 2026-10-11

Ten independent adversarial cases passed, including 81 newline/Unicode combinations, competing writes, a same-content remote revision, stale reads, draft guards, cancellation, combined limits, failed acknowledgements, held saves and repeated Retry. The reviewer found no blocking data-loss, stale-state or double-append issue in the feature commit. This is deterministic coverage, not native file-picker or assistive-technology verification.

## Integrated checks — version 1.1.43

The serial full Node suite passed 1,784 tests without failures or skips; all 53 Python packaging tests passed. The verified package contains 90 runtime files, SHA-256 11ac80866cc203cd4fa17b0748dcf992bb9eff90bc6447e1f4dd4ae769a740da. Subsequent parent-document rebases changed no runtime files.

## Bounded native persistence acceptance — 2026-10-11

The genuine native TXT chooser and extension Export text action were used with synthetic content. Baseline and post-Cancel exports are byte-identical (32 bytes, SHA-256 692e6a60ae1aebfdfb5790e4ea1272d60dc221a651ec16601abb9d5c52d5a51e). The confirmed appended and fresh-page reopened exports both exactly match the 114-byte expected result (SHA-256 4850cc4c928f7705ffa1e36d8404b9bef83a5046af37f913dd45eda14748a77e), preserving BOM, mixed CRLF/LF, trailing whitespace, Unicode and literal markup.

The complete append preview reported 98 Unicode characters / 114 bytes. The native textarea display reports 97 characters after its CRLF normalization; this display distinction did not change saved or exported bytes. Escape returned focus to Import, opening another chooser reset the append option, and keyboard confirmation returned focus to the editor. Earlier attempts to open a path with Return were resolved with ordinary folder navigation and explicit Open; no product defect was established from those picker attempts.

The native combined-limit check also passed: a 31,999-character saved note plus a one-character file requires a separator and reaches 32,001 characters, disabling append confirmation. Turning append off restored the valid one-character replacement preview; Escape canceled without confirming it.

This gate did not verify dark/narrow/Chinese UI, actual IME, assistive-technology announcements or injected storage failures natively. Adversarial failure/race coverage above remains model evidence. Browser captures and raw synthetic TXT exports remain local; no new screenshots are published.
