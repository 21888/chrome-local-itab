# Tasks filter: recover after cancelled input composition loses focus

## Behavior

The Tasks filter tracked composition only through `compositionstart` and `compositionend`. When focus left a cancelled composition without an end event, `filterComposing` stayed true and later ordinary searches were ignored until the user clicked Clear.

The filter now settles an interrupted composition on the next event turn after focus-out. This leaves room for the final same-turn input or normal composition-end to arrive. A later composition or explicit Clear invalidates the older callback. The callback and input handlers belong to the exact live filter, View, controller and workspace source, so destroyed, detached or replaced views cannot use an old event to affect a new filter. Refocusing without starting a new composition does not strand the filter again.

Only disposable filter presentation changes. Filtering never writes tasks, changes stored task text, clears the quick-entry/editor draft, or takes focus. Unicode search semantics remain unchanged; no normalization feature is bundled into this fix.

## Evidence

A new regression against the unchanged View, actual Tasks Store/Controller and existing synthetic DOM model failed: after composition-start, composing input, focus-out and no composition-end, `filterComposing` remained true and the next search could not proceed. The same case passes after the fix.

Seven initial event-sequence cases cover:

- Lost composition-end followed by another ordinary search.
- Final input after blur, normal composition-end after blur, and immediate refocus.
- A newer composition invalidating the old deferred blur.
- Clear plus a later search remaining authoritative.
- View destruction/reopening and workspace replacement preventing old callbacks and events from changing a new composing filter.
- Exact task storage remains unchanged; current focus is retained.

The initial complete `tests/local-tasks-view.test.js` passed **73/73**. These are controlled event-sequence tests, not a claim of native operating-system IME acceptance. The fixture returns its existing window to test an explicit workspace-session change; it does not weaken an assertion or fake a storage write.

This independent change follows the navigation composition fix, with separate source/test/documentation ownership. Negative and positive logs remain local under `evidence/tasks-filter-blur/` and are not uploaded. No schema, permission, file-import approval, screenshots, version bump, Release or Web Store action is included.

## Final acceptance and additional review cases

- Full aggregate on the final production code, including the preceding navigation fix: `node --test --test-concurrency=1 tests/*.test.js` passed **17,021/17,021**, exit 0, with no failed/cancelled/skipped tests.
- After that aggregate, three additional **test-only** review cases covered temporary hide/reattach and mouse Clear followed by the older composition-end and blur callback. The unchanged production code passed all three. The final complete Tasks View file passed **76/76**. The 17,021 aggregate count does not include these three subsequently added cases; it is not presented as a 17,024-test aggregate.
- Full Python suite: `python3 -m unittest discover -s tests -p '*_test.py'` passed **91/91**, exit 0.
- JavaScript syntax and whitespace checks passed.

The source guard is not claimed to record every temporary DOM hide/detach transition. If the same live filter returns before its timer, the timer merely filters using the **current** field value, never a captured old query; it does not change text or write storage. A newly started composition still owns a newer epoch. These supplementary tests establish the intended passive-refresh behavior without expanding lifecycle machinery or storage authority.

The feature commit contains only `shared/local-tasks-view.js`, its existing View test file and this document. Restored baseline files and local logs are excluded. Operating-system IME, installed upgrade, historical data recovery and publication remain outside this acceptance.
