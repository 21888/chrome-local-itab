# AI Collections: protect the editor Save shortcut during composition

## User behavior

The collection editor checked key-event IME flags but did not retain composition lifecycle state. In the real Collections View/Controller model, starting composition in the notes field, entering an unfinished annotation, and pressing Ctrl+S without key flags increased storage writes from one to two. The original counterexample is retained locally in `evidence/collections-save-composition/negative.log`, not uploaded.

The main editor now tracks the exact composing field. Matching end/focusout releases it; removed fields or fields that no longer own focus cannot strand the shortcut. Older field events cannot release a newer field's composition. Ctrl/Meta+S within the current editor prevents the browser default even when composition, key code 229 or held-key repetition blocks the application save. Other keys, search controls and retired views/controllers are not consumed.

Only shortcut admission changes. The existing metadata-save path, duplicate-excerpt confirmation, explicit Save buttons, forms, body-revision review, storage rules and model-call behavior remain unchanged. This is not a global stale-DOM guard or a new autosave feature.

## Regression coverage

Seventeen new tests cover:

- Unfinished annotations cannot be saved by a flagless shortcut and the editor remains present.
- Ctrl and Meta variants with input-before-end and end-before-input: one deliberate save stores the final annotation while excerpt bytes, current body-version ID and history remain unchanged.
- IME flags, code 229, repeats and tracked composition all prevent browser default Save without an app write.
- Missing end plus blur does not autosave or block a later ordinary Save.
- Old title completion cannot unlock a newer notes composition.
- Switching records preserves the first unsaved annotation and only saves the explicitly completed second record.
- Rebuilt editor DOM does not retain the old composition lock.
- New duplicate excerpts do not open confirmation during composition. After completion, Cancel still writes nothing; a subsequent approved Save creates exactly one separate record.
- Ordinary keys, unrelated shortcuts, search Save and retired view/controller events remain unconsumed.

All **28** complete `*collection*.test.js` files pass **780/780**, including **103/103** in the complete Collections UI file. Both changed JavaScript files pass syntax checks; `git diff --check` passes.

These are synthetic events with actual application logic and synthetic data. They do not establish native OS IME behavior or exercise an actual browser Save Page window; default prevention is asserted in the event model. No GUI file selection/import, file-approval retry, permission, schema, version, Release or Web Store action is included.

The complete Python suite (`python3 -m unittest discover -s tests -p '*_test.py'`) passes **91/91**, exit 0. The final complete Node aggregate (`node --test --test-concurrency=1 tests/*.test.js`, 430 files) passes **17,109/17,109**, zero failures, exit 0.
