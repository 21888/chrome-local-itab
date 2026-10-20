# Identify interrupted-restore diagnostic downloads

Settings now explains the **Download both saved copies** action at its point of use, in English and Simplified Chinese, with the same English fallback when localization is unavailable.

The visible description distinguishes the diagnostic package from an importable complete backup. It identifies `before` as the verified pre-restore copy and `current` as the captured saved state, which can mix old and new values after a partial write. It explains that downloading does not repair or merge data and names the separate pre-restore download for an importable file.

The button references this explanation with `aria-describedby`; multiple mounted views get distinct description IDs. The description is hidden when the action is unavailable or the structural-failure view permits only the retained pre-restore download. After a download request settles, feedback explicitly identifies the diagnostic package, does not claim file completion, and does not claim recovery or merging.

This changes only presentation. Existing selection/review ownership, storage reads, recovery confirmation, diagnostic bytes and filename remain unchanged. Portable backup and raw interrupted-restore recovery retain their different Focus-session contracts. No permission, provider, network, version or release changes are included.

## Verification

`tests/complete-backup-diagnostic-guidance.test.js` covers the real view using synthetic DOM and read/download boundaries:

- English, Chinese and fallback text in ordinary and recovery-only views.
- No automatic export, unchanged downloaded bytes and filename.
- Accessible description linkage, separate mounted identities and hidden/unavailable controls.
- Feedback waits for the download boundary; duplicate actions stay blocked and rejected downloads never announce success.

The existing complete-backup view and download-review suites additionally cover stale reviews, cancellation, newer selections, late completions, read/download failures, active Focus protection and uncertain restores. This is automated DOM/model coverage, not native browser or assistive-technology acceptance, an installed-extension upgrade test, or a finding about the historical data-loss incident.

Validation on 2026-10-20: 16,909 Node tests passed, 497 complete-backup tests passed separately, and 84 Python tests passed. The nine new focused cases were rerun after tightening their failure-feedback assertion. All JavaScript syntax checks, manifest/locale JSON parsing and whitespace checks passed. The runtime-only ZIP build and byte verification passed for 138 files. No native browser or screenshot check was performed for this copy-only change.
