# Countdown settings: recover explicit Save after composition blur

## User behavior

A title/date composition whose end event was lost on focus departure left Countdown settings in composing state. Later ordinary edits could not re-enable Save, Cancel or the relevant recovery controls. The real Store/Controller/SettingsView model first reproduced this with a title: composition start, input, focusout without end, ordinary input, and a still-disabled Save button.

The settings editor now lets normal final input/end events finish before a next-turn fallback releases only the original composition. It reads the current field into the existing draft and releases the existing composition gate. **This is still manual saving:** blur does not call Save, Retry, overwrite, restore, or write storage. The user must choose Save explicitly.

The fallback privately captures the original controller, store, backend, workspace/session identity and generation, host and title/date elements. Closed/suspended or replaced sources cannot use it. A shared composition epoch across both text fields prevents an older title blur from unlocking a newer date composition. A matching compositionend retires the pending fallback. Old-field completion cannot end the new field; new-field start first preserves the previous field's current text into its original draft. Relative-date numeric parameters are unchanged.

## Regression coverage

Twenty-seven new tests cover:

- The original title/ordinary-edit failure and explicit Save.
- Both title and date, with input-before-end, end-before-input, or no-end final text; no write before Save, exactly one write after Save.
- A title blur followed by a new date composition, including a late old-field compositionend that must not release the new composition.
- Retired start/end events are rejected. Completion rechecks ownership after a draft notification synchronously starts another composition.
- Switching fields preserves both drafts before explicit Save (one write) or Cancel (no write). A detached previous editor is not read; a newer composition started during handoff notification keeps ownership.
- Destroy, pagehide, changed workspace/session/session generation, changed controller/field and remount retirement, without adopting the old field's uncommitted text or writing data.
- Conflict remains a conflict, requiring the existing recovery choice.
- Older pending Save settlement retains the newer draft, which still needs its own explicit Save.
- Failed writes remain errors after blur. Explicit Retry replays the exact old failed action, retaining newer edits for a subsequent Save.

Review also exposed two additional counterexamples: an old title end could release a newer date composition, and rejecting that old end alone could lose the previous field's final DOM text on the next render. Both have retained negative logs and dedicated regressions. The private field owner plus guarded handoff address these paths; unrelated ordinary input listeners are not refactored.

An intermediate new Retry assertion incorrectly expected Retry to save the newer draft. It was corrected to the existing exact-command replay contract; no production retry behavior was changed. This diagnostic and the original product counterexample remain in local `evidence/countdown-composition-blur/` and are not uploaded.

These are synthetic event/logic tests, not native OS IME acceptance. No GUI file selection/import, permission, schema, version, Release or Web Store operation is changed.

## Acceptance

The nine complete Countdown test files pass **467/467**, including all **92** tests in the complete View file. The complete Python suite (`python3 -m unittest discover -s tests -p '*_test.py'`) passes **91/91**, exit 0. Both changed JavaScript files pass syntax checks, and `git diff --check` passes. The final complete Node aggregate (`node --test --test-concurrency=1 tests/*.test.js`, 430 files) passes **17,074/17,074**, zero failures, exit 0.
