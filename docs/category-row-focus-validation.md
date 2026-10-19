# Category-row keyboard focus

2026-10-19. Baseline: `0e07315f8c27f9e3bf5af43c2e0511707cdbb26c`.

## Observed defect and correction

In the actual cloud Chrome static renderer, keyboard Space on a category's
Move up button correctly moved the row, but native removal/reinsertion dropped
focus to `BODY` and the viewport left the row behind. Enter on its Delete
button likewise left focus on `BODY`. The original five synthetic categories
and the exact edited name were retained; this was a keyboard-navigation defect.

The existing delegated handler now remembers whether the action owned focus.
After a move, it restores the same button only when focus was lost to `BODY`.
After removal, it uses the next category's name input, otherwise the previous
name, otherwise Add Category. It deliberately does not focus another Delete
button. The destination must still belong to the original connected editor;
newer focus is never reclaimed. Existing row mutation, save scheduling, storage,
CAS generation, validation, normalization and error handling are unchanged.

## Automated evidence

The nine new tests execute production `options.js` with the real StorageManager
and synthetic Chrome storage. A fixture-local supplement makes `insertBefore`
remove an existing node before reinsertion, reproducing the observed native
focus loss. Existing tests and shared DOM helpers are unchanged.

The unchanged baseline failed five focus assertions and passed four cases.
The correction passes all nine:

- Move up/down preserve the exact focused button and untrimmed editor draft.
  Existing autosave still trims the saved name, writes once, and changes only
  categories and its existing layout-generation CAS field.
- Middle/last/only-row removal chooses the next name, previous name or Add.
  The destination is non-destructive; the existing Add repeat guard remains.
  Model keydown checks are not a claim of native held-key autorepeat testing.
- Unfocused actions do not take another draft's focus, and focus acquired
  during movement remains authoritative.
- A real deferred backend write rejection leaves raw storage unchanged,
  preserves the reordered draft and newer focus, and reports an error.

Related category, localization, stale-save, keyboard and import-navigation
tests passed 185 tests. The full Python suite passed 84 tests. Independent
source review and a separate run of all nine new tests passed. Syntax and
diff-whitespace checks passed. The unchanged full exact-source CI is the
delivery gate.

Initial new-fixture errors are retained separately from the defect RED: a
Node 24 global-crypto assignment error, an unclassified file-level test-process
failure, and an incorrect new expectation that the existing CAS generation
would not change. Only the new fixture/assertion was corrected. Bounded
boolean identity assertions avoid formatting cyclic DOM objects on failure.
These setup failures are not counted as independent product regressions.

## Actual rendered GREEN and limits

At 05:00–05:01 UTC the exact candidate production runtime was served locally
to dot's cloud Chrome, with the existing explicit synthetic page-memory Chrome
API bridge. The 138-file baseline/candidate runtime maps differ only in
`options.js`. The known local Categories destination was used; no installed
extension or user profile was accessed.

Keyboard Enter added one synthetic category. Its name was filled with the
exact string `  Synthetic category <raw> 中文  `. Space moved it above
Learning and kept focus on its original Move up button, visibly outlined at
y=273.03–306.22px. Enter moved it down and kept the Move down button focused
at y=441.63–474.81px. A further Space moved it back above Learning; Enter on
Delete removed only that added row and focused Learning's name input at
y=343.83–395.42px. The five original names and order were unchanged after
removal. The viewport was 1182 × 759 CSS pixels. Scoped screenshots remain local.

The browser checks used supported locator keyboard actions and read-only DOM
inspection. A previously used tab timed out before navigation; a fresh tab in
the same selected browser worked using its documented recovery route. No
timeout, network or security settings were changed. The preview service was
stopped and the shared desktop released afterward.

Actual browser coverage is limited to add, up/down and middle-row deletion.
Last/only-row deletion and backend failure are model/real-Store tests, not
native-browser observations. Synthetic page-memory results do not establish
durable extension storage, real-profile upgrade safety or a cause or repair
for the historical data-loss incident.
