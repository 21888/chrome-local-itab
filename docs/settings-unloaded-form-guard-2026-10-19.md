# Disable unowned Settings forms after an early load failure

## Reproduction

A synthetic Work workspace with `quote: 42` causes the real storage validation path to reject `getAll()` with `WORKSPACE_CORRUPT`. A separate failing local-storage read produces `WORKSPACE_READ`. In both cases Settings never establishes its form owner, but the ordinary form remained visible and editable. The world-clock label could accept a draft without lifecycle ownership; Back and other departure methods did not recognize that draft. Save had no handler. No successful-save message or storage write was observed.

The initial three regression tests produced two failures for the early paths and one passing late-error control. The late case first establishes the real form and its draft ownership, then rejects a subsequent read. Its draft and departure protection must remain intact.

## Narrow change

For an ordinary initialization error, when `settingsFormView` has not been established, make the normal main/footer inert and disable their form controls. Keep displayed values visible, and add one persistent alert explaining that they may be defaults or incomplete and are not a verified copy of saved settings. Editing and saving are unavailable; the existing Back action remains available when no other work is pending.

The original error is still logged and shown. No error is admitted to the separate interrupted-restore or structural-recovery download modes. No storage value is substituted, reset or written. Once a form owner exists, this helper does nothing: it must not hide, clear or lock an existing draft after a later failure.

This change does not identify or repair the reported 1.1.71 upgrade incident. Release, version and store-update gates remain unchanged.

## Validation

- Focused real-startup tests: 29/29 passed. Old committed Options script: 26 passed, 3 failed. Two early paths preserve raw storage with zero writes, removes, provider calls or repairs; the late-error control retains draft ownership and departure protection.
- Repeated initialization produces one persistent notice and one Back listener. The original unrelated-error assertion changes only to expect the newly inert form; error logging and no-recovery assertions remain.
- Native dot-cloud Chromium exposed a disabled Skip target. The unloaded notice now has tabindex=-1 and becomes that state’s Skip target; normal and late-error targets are unchanged. Native Tab → Enter focused the notice, then Tab focused Back.
- English and Chinese persistent notices remained visible after the toast disappeared. The ordinary main/footer controls were excluded from the accessibility tree. Back navigated the same Work tab. Static headings retain their existing English fallback because initialization failed before normal localization.
- All 138 runtime hashes matched the frozen preview. The fixture is synthetic, with two live workspaces and one Trash entry; the corrupted Work quote was the only deliberate invalid module. The destination preview resets its fixture, so the Back check proves navigation, not recovery.
- Final serial complete suite: 16,760/16,760 passed, zero failures/cancellations. Python: 84/84 passed. The 138-file runtime package passed static checks.

Synthetic tests do not establish installed-extension upgrade preservation.
