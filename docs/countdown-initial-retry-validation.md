# Countdown: finish the initial-read Retry flow

## Reproduced gap

After Countdown settings failed its first storage read, Retry called the background `refresh()` path without entering a pending state. The Retry button stayed enabled during the read; on success its render hid the still-focused button and the DOM model dropped focus to the document body. The shared lifecycle also could not observe this explicit recovery read as pending.

Two new tests failed against `493aba2affea42407cb098743973061ddab1cd22`, separately demonstrating the missing pending state and the final body focus. They run the real Store, Controller and SettingsView with a paused synthetic read, using the existing model for native disabled/hidden focus loss. This is not a native-browser or assistive-technology observation.

## Small, shared-path correction

Before the first successful read there is no editable controller draft. The initial Retry branch now uses the existing read-only `useSaved()` recovery path instead of background `refresh()`. It synchronously enters pending, blocks repeated activation, reads and validates the saved record, and clears pending on settlement.

This lets the existing Settings action handler move only its own lost Retry focus to the existing visible status paragraph while the button becomes disabled. No timer, promise-settlement focus callback, focus watcher, new status string or new DOM control is added. Later outside/body focus is left alone, and hiding, leaving, removing or destroying the editor never causes late focus recovery.

The shared lifecycle can now wait for this actual read before completing Save-and-switch. Recovery itself does not write, repair, reset, migrate or export data. A loaded title/date/visibility still needs an explicit Save after editing. Failed reads retain the existing error and Retry; a queued saved-state notification is reconciled through the existing pending/refresh rules. Already-loaded Retry, failed-write replay, conflicts, subscription failure and ordinary background refresh behavior are unchanged.

## Coverage

- Synchronous pending state and repeated-click suppression; successful read preserves a stable focused status without writes.
- A second failed read remains recoverable; later successful Retry restores the saved fields, then a new explicit Save performs exactly one write.
- Later successful/failed settlement never takes newer outside or body focus.
- Pagehide, hidden or detached editor, and destruction suppress late focus changes; destroyed readers do not publish a loaded state.
- The real shared lifecycle's Save-and-switch wait does not resolve while the recovery read is pending.
- Another page's saved notification during Retry retains the latest title/date/revision without an extra local write.

The older initial-load boundary test now expects the same synchronous handoff as other explicit settings actions. Its earlier documented limitation is retained as history and linked to this correction.

## Acceptance and limits

Final local checks passed:

- Focused initial-read recovery and synchronous-focus cases: **14/14**, including the two baseline failures now passing.
- `node --test --test-concurrency=1 tests/local-countdown*.test.js tests/workspace-lifecycle.test.js tests/local-content-lifecycle.test.js`: **501/501** across 11 files, exit 0.
- `node --test --test-concurrency=1 tests/*.test.js`: **17,519/17,519** across 446 files; zero failures, cancellations, skips or TODOs, exit 0.
- `python3 -m unittest discover -s tests -p '*_test.py'`: **91/91**, exit 0.
- README's documented JavaScript syntax checks, manifest/locale JSON parsing and `git diff --check`: passed.

All dates, text, errors and events are synthetic. No screenshot/upload, native keyboard/focus painting, screen-reader, GUI file selection, extension-page navigation, installed upgrade or actual storage-durability acceptance is claimed. Existing navigation restrictions and the exact-package native gate remain unchanged. Manifest, permissions, release workflow and CI are not modified.
