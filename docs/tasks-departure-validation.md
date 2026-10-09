# Tasks departure protection

The existing shared `beforeunload` handler now includes the Tasks view's
`hasUncommittedWork()` ownership and the Tasks settings controller's pending
visibility write. The existing Countdown, Scratchpad and World Clock settings
guards remain unchanged. No extra listener, unload-time save, storage schema,
permission, or general reload behavior is added.

## Verification

`tests/local-tasks-departure.test.js` loads the actual shared lifecycle listener
and mounts the actual Tasks view or settings view with the real controller and
store against a deferred in-memory backend. It checks:

- Empty/cleared input and filter-only interaction do not request a warning.
- Unsent quick-entry text and an in-flight write do request a warning.
- A save completing after newer typing leaves the newer draft protected.
- Successful quick-entry saves release the guard.
- Open edits, failed edits, and pending edits remain protected; cancel and
  successful saves release ownership when no write remains pending.
- Pending import reads, import reviews, and replacement writes remain protected;
  cancelling a review or finishing the replacement releases ownership.
- Settings visibility writes request a warning only while pending.
- The existing three settings owners retain their behavior; other modules'
  reload protection does not become departure protection.

The shortcut reload regression now tests its actual departure behavior rather
than requiring an exact source-code string listing the former guard owners.

Focused Node checks: 40 passed. Full Node checks: 438 passed.
Python packaging tests: 19 passed. JavaScript syntax and manifest/locale JSON
checks passed. The four Tasks integration tests also failed against the original
handler, demonstrating the missing protection before the fix.

This is DOM/event-model validation, not a native browser dialog test. Chrome
controls whether a native warning is shown (including interaction requirements).
The handler requests a warning with `preventDefault()` and an empty `returnValue`;
it cannot guarantee that Chrome displays it or save content after departure.

## Integrated and native checks, 2026-10-09

After integration with the category-opening fix, 443 Node tests and 19 Python
packaging tests passed. All 58 frozen runtime files matched the source.

A disposable normal-sandbox Chrome for Testing 155.0.8059.39 Linux profile
verified these actual interactions:

- Typing `draft42` without Add and refreshing displayed Chrome's native
  departure warning. Cancel/Stay retained the exact draft.
- Clearing the quick-entry draft allowed refresh without a warning.
- Adding `saved42` and refreshing showed no warning; the saved task persisted.
- A filter query alone allowed refresh without a warning.
- Editing the task to `edited42` and refreshing displayed the warning; Stay
  retained the editor draft. Cancelling the editor then allowed refresh without
  a warning, and the original `saved42` persisted.

These are observed results for this profile, not a guarantee of browser warning
display on every platform or without prior user interaction. Native import,
injected storage failures and simultaneous races were not exercised; their
coverage remains in the deterministic tests above.
