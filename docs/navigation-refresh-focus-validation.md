# Navigation refresh keyboard and read-only recovery

## Contract

- A keyboard-triggered saved-state refresh places focus on the dialog panel before disabling its button. Escape continues to dismiss a pending read. Tab can reach the enabled Close control through the browser's normal focus navigation.
- Completion restores the refresh button only when focus remains on that temporary panel and the button is enabled. A user who moves focus keeps it. Closed or superseded reads never restore focus or adopt stale results.
- The existing, narrowly verified invalidated-layout read exception also permits local Clear filters, selected-view toggling, and empty-view recovery. These actions only change the view; they do not clear the layout write fence.
- Checkboxes, Select current results, Deselect current results, Clear selection and review-row removal share the selection-unavailable guard. Invalidation, actual pending mutations, departure and uncertain saves must not authorize selection changes or Add/Review writes.
- A rejected native checkbox toggle restores its actual selected state and moves focus before disabling the checkbox. A rejected review-row removal preserves both the review and focus, with the existing reload notice.
- Canceling review falls back to an enabled browsing control (or the panel) when its original return target was disabled by a rejected confirmation.

## Regression coverage

The DOM tests in `tests/navigation-library-view.test.js` cover pending-read Escape, default Tab availability, success/failure focus restoration, deliberate user focus movement, pre-render stale batch controls, all batch selection controls after read-only refresh, an emptied selected-only view, review removal after external invalidation, a rejected native checkbox change, and cancel after rejected invalidated/pending confirmation. All fixtures are synthetic; no permissions, dependencies, network requests or storage writes were added.

The DOM model deliberately does not perform the browser's default Tab movement. Tests verify that Tab is not suppressed and Close remains enabled, then model that native focus transition. Native browser traversal remains a separate acceptance check; this document does not claim it was performed by the implementation worker.

## Frozen implementation checks

On the exact historical-prompt master parent `19d497882439e54bbc5b4c4ae9eaf70e01f21af9`, the final snapshot passed 2,925 strict serial Node tests, 84 Python tests, 165 focused view tests, and all eight new regressions. The 118-file development ZIP passed source verification with SHA-256 `774add317b88a5cb7215c81e2c17d13e199dc666b12dc5c5bf431b9e7280df52`; the independently integrated package is byte-identical. Native browser acceptance is pending for this ordinary source commit.
