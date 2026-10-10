# Tasks Edit keyboard focus regression — 2026-10-10

## Observed defect and repair

Native Chrome reproduced an existing ordinary Edit issue: clear a saved task, keyboard-activate Save, receive validation feedback, then immediately press Escape. Disabling the focused Save button moved focus outside the dialog; Escape no longer reached the modal handler.

The editor now moves focus from its own currently focused action to the same dialog's textarea before disabling or hiding that action. The same ownership guard covers Save, explicit conflict replacement and retry, and prevents detached controls or late callbacks from taking focus from another editor. Validation does not write invalid content. Existing schemas, permissions, storage, task text limits and version remain unchanged.

## Automated verification

Eleven new actual-view regressions use the DOM helper's opt-in native-like disabled/hidden-control blur behavior. Keyboard events are dispatched to the current active element, not to a stale button reference. They cover empty/too-long/control-character validation, pending save/retry/replacement, immediate Escape, Tab trapping, newer drafts/IME ownership, closed/reopened dialogs and valid save. Ten fail against the previous implementation; the valid-save happy path still passes there.

The focused actual-view/batch/dialog suite passes 88 tests. The full serial Node suite passes 835 tests without failures or skips; the Python packaging suite passes all 19 tests.

## Native verification

Official Chrome for Testing 155.0.8059.39 on the assistant's cloud Linux desktop, unpacked extension, Chinese/dark Clarity, visible DevTools responsive setting 400 × 760 at 75% preview scale. Only native keyboard/mouse interaction; no page evaluation or direct storage manipulation.

- Empty text → keyboard Save: validation error, textarea retains visible focus.
- Immediate Escape: dialog closes, Edit trigger regains focus, saved `alpha` remains unchanged.
- Reopen → valid `alpha edited` → keyboard Save: dialog closes and saved text updates; reload retains it.
- Adjacent batch review → immediate Escape still works and adds no unconfirmed tasks.

Eleven original desktop screenshots and before/after hashes are retained with the native record. All 60 tested runtime files match the production working tree byte-for-byte. No renderer crash occurred during this follow-on.

This is bounded Linux/Chrome native coverage, not screen-reader certification, fault injection, all operating systems/IMEs, concurrency or every keyboard path. Those additional asynchronous/error branches are model-tested; the earlier batch IME evidence is not counted as a new ordinary Edit IME test.
