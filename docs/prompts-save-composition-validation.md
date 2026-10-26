# Prompt editor: do not save an unfinished composition through Ctrl/Meta+S

## User behavior and fix

The prompt editor's Save shortcut already rejected key events with `isComposing`, key code 229, or held-key repetition. It did not retain composition lifecycle state. A synthetic real View/Controller reproduction started a body composition, entered intermediate text and dispatched Ctrl+S without those key flags: saved-data writes increased from one to two instead of preserving the active draft.

The editor's main region now tracks the exact composing field for its Save shortcut. A matching compositionend or focusout releases that field. A removed field, a field outside the current main region, or one that no longer owns keyboard focus cannot leave the shortcut blocked. Old-field completion cannot release another field's composition. Flagged-key and repeat cases still reject app saves. For the current editor's Ctrl/Meta+S, default browser Save Page handling is prevented even when composition/repetition blocks the app write. Other keys, the search field and retired views/controllers are not consumed.

This changes only shortcut admission. It does not alter save commands, storage semantics, model requests, explicit Save buttons, forms, permissions or general draft ownership. It does not introduce a global shortcut or a global guard against every stale DOM event.

## Regression evidence

The original write-count counterexample is retained locally in `evidence/prompts-save-composition/negative.log`, not uploaded.

Eighteen new tests cover:

- Missing-key-flag composition cannot save or remove the editor/draft.
- Ctrl and Meta variants, input-before-end and end-before-input completion: normal Save resumes and saves exactly once; held-key repeats remain ignored.
- Lost compositionend followed by focusout permits a later ordinary Save.
- Late title end/focusout cannot unlock a newer body composition.
- Replaced editor DOM does not retain a stale composition lock.
- Switching records retains the first unsaved draft while protecting and then explicitly saving only the second record's final text.
- The search field remains outside editor Save ownership.
- Both modifier variants prevent default browser Save during composition without an app write. Flagged events, key code 229 and held repeats also prevent default Save while preserving the draft.
- Ordinary typing, unrelated shortcuts, outside search and retired view/controller events are not consumed.

All **24** complete Prompts test files pass **464/464**, including **72/72** tests in the complete View file. Both changed JavaScript files pass syntax checks and `git diff --check` passes.

These are synthetic event/logic regressions, not proof of a particular native OS input method omitting flags. Default prevention is asserted in the event model; no actual browser Save Page window was exercised. No GUI file selection/import, file-selection approval, version, Release or Web Store action is changed.

The complete Python suite (`python3 -m unittest discover -s tests -p '*_test.py'`) passes **91/91**, exit 0. The first full Node aggregate was interrupted by the execution-environment transition at 17:17 UTC: its process handle disappeared and the log had no terminal summary or exit marker. It is not counted as passed; the partial log is retained locally as `interrupted-node-suite-1717.log`. Review also reproduced missing default prevention in both modifier variants before that gap was fixed (`default-save-negative.log`). The fresh complete Node aggregate against the final code (`node --test --test-concurrency=1 tests/*.test.js`, 430 files) passed **17,092/17,092**, zero failures, exit 0.
