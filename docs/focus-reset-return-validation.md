# Return keyboard control after an explicit timer reset

The actual Focus Store/Controller and disabled-control DOM model reproduced this sequence: Start → Pause → focus Stop/reset → confirm reset. The reset saved exactly once and left the timer Ready, but disabling its focused button moved focus to the page body. The subsequent keyboard restart lost its logical control.

Reset now supplies its own initiating button to the existing `run` focus receipt, just as explicit duration Save already does. After the original successful result, the existing receipt checks may return focus to the enabled Start button. No timer calculation, persistence, automatic-start or retry protocol changes.

## Checks

- All Focus test files: **143/143 passed**.
- The positive complete chain checks one reset write and Ready state; held Enter does not restart, and a fresh explicit Enter on focused Start causes exactly one further start write.
- Reset-specific cases preserve newer focus, focus-away/back, pointer and Tab intent, hidden-page state, detached host, newer action, destroyed view, failed write, replaced workspace and changed generation. A reset invoked without the button owning focus does not acquire a restoration receipt.
- A trial test directly set `host.hidden` while the stored enabled preference remained true. The ordinary controller render correctly derives this property again from saved visibility; this artificial property override is not a retained user hide action or product failure. Its diagnostic is retained locally; hidden-page and retired-workspace checks use their actual supported states.
- Final aggregate: `node --test tests/*.test.js` **17,199/17,199 passed**, exit 0 (432 files); Python unittest discovery **91/91 passed**, exit 0. The aggregate includes the separate two organizer cross-component tests; previous aggregate counts are not reused.
- Actual cloud Chromium full-newtab synthetic check passed: Start click → Enter to Pause → Tab to Stop/reset → Enter to reset. Readback write counts were 1 → 2 → 3; status was Ready to start, Reset disabled and the actual focused element was Start. A separate fresh Enter then changed to Running/Pause and write count 4. No automatic restart occurred.
- Synthetic DOM readback retained other-workspace registry/bundle, global privacy/sync/prompts/collections and workspace tasks/scratchpad/countdown exactly; only the intended Focus record changed. External open attempts stayed empty. The independent acceptance tab was closed and its dedicated loopback server stopped normally.
- The first generated fixture incorrectly enabled both legacy root Focus and the active workspace copy. The real old-format conflict guard correctly rejected that inconsistent migration-shadow input. No recovery/approval action was taken and no production guard changed. The corrected fixture retained the original legacy root and enabled only the workspace copy, using a separate synthetic session key. This is a fixture correction, not evidence that a real migration incident or release gate is resolved.

The negative case and model logs remain local. These event tests do not alone establish native assistive-technology behavior. No settings file picker, import approval, external provider or release/store submission is involved.
