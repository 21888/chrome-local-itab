# Scratchpad: resume autosave after an interrupted composition

## User behavior and scope

When an editor composition started but its completion event was lost on focus departure, Scratchpad kept `Controller.composing` true. Later ordinary input still updated the draft but could not autosave. The recovery actions that require composition to finish also remained unavailable.

The original Store/Controller/View model reproduced this before the fix: composition start, draft input, focusout without compositionend, and a later ordinary edit left `composing === true`. The negative assertion and logs remain local under `evidence/scratchpad-composition-blur/`; they are not published.

The original editor now schedules one next-turn composition completion on focusout. Normal final input/compositionend events get their existing chance to run first. If the same composition still owns the same editor/source, the fallback reads the **current** textarea through the existing editor draft helper and releases composition through the existing controller method. It neither writes storage directly nor captures an old draft to replay later.

A newer composition or normal compositionend retires the old fallback. Existing editor-source checks and composition ownership are reused, including the original allowance for owned hidden/detached fragments; focusout does not grant authority over replacement views or workspaces. Autosave still obeys the controller's lifecycle pause, pending-write, conflict and error gates. No draft is cleared, no failed save is silently retried, and no overwrite/recovery action is selected automatically.

## Regression coverage

Fourteen added model tests cover:

- Lost compositionend followed by ordinary typing resumes autosave.
- Final input before end, end before final input, and no end read the final text and save it once.
- An old blur callback cannot end a newer composition.
- Destroyed views, changed controllers, replacement workspaces and a new view on the same host reject the queued callback without saving the retired draft.
- Changing the original workspace object's ID or generation also rejects the callback.
- An older in-flight write settling does not erase the newer draft; normal autosave subsequently saves the newer text.
- A failed write remains an error after blur and requires an explicit Retry.
- A content-lifecycle autosave pause retains the current draft without a write; releasing the pause resumes the normal scheduling contract.

The complete View file passes **72/72**. The 23-file Scratchpad group passed **2,985/2,985** before the final three additional workspace/lifecycle tests; final aggregate results are recorded below. JavaScript syntax and whitespace checks pass.

The timer model uses real next-turn callbacks for the normal regression and a manually drained next-turn queue for ordering checks. These are synthetic event/logic tests, not a claim that a particular native OS input method lost an event. No installed-extension upgrade, GUI import, file-selection approval, permission, storage schema, version, Release or Web Store action is part of this change.

## Aggregate acceptance

The complete Python suite (`python3 -m unittest discover -s tests -p '*_test.py'`) passed **91/91**, exit 0. The final complete Node suite (`node --test --test-concurrency=1 tests/*.test.js`, all 430 JavaScript test files) passed **17,047/17,047**, zero failures, exit 0, including all fourteen new cases.
