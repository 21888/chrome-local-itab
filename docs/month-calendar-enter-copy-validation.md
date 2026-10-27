# Calendar calculation: keep the result when leaving an unchanged date field

## Actual user-path failure

On 2026-10-27, cloud Chrome with the current production ClockComponent reproduced this sequence:

1. Open Calendar, choose February 2000, and open Date interval.
2. Type `2000-02-28` and `2000-03-01`; press Enter in End date.
3. The page correctly displays `2000-02-28 → 2000-03-01: +2 calendar days` and enables Copy result.
4. Click Copy result. Chrome first commits the unchanged text field with a `change` event when focus leaves it. The previous handler treated that event as a new edit, erased the just-calculated result and disabled Copy before its action. The synthetic clipboard adapter received no call.

An explicit Calculate-button → Copy sequence copied the complete result correctly. Swap produced −2 days. Invalid `2000-02-30` remained unmodified; however, leaving that field also erased the just-shown validation error. On the baseline page the first Clear click after invalid Enter removed the error but retained the fields; the second cleared both. That latter observation is retained as part of the native sequence, not claimed as an independently proved mechanism.

## Minimal behavior change

Each explicit calculation remembers the exact two raw date strings used for that attempt, including invalid attempts. A subsequent `change` with both strings still identical preserves the displayed result or validation error. It does not recalculate, normalize input or manufacture a successful result.

Actual `input` events still retire the calculation, even if the text is changed away and back to its old value. A `change` containing genuinely different text also retires it. A fresh calculation is required afterward. Closing/resetting the calendar clears the remembered attempt. Existing visibility, current-view and composition guards remain in force.

Copy feedback/receipts have a separate safety contract: **even an unchanged change event still invalidates a previous copy receipt**. A dispatched pending clipboard operation remains locked until settlement; late success/failure cannot revive feedback. This fix does not relax that contract merely to keep the calculated text visible.

No storage, time-zone setting, system clock, permission, automatic copy or network action is introduced. The month viewer and interval tool remain page-local.

## Regression evidence

Before the production change, the actual-component tests failed with an empty result after unchanged `change`, rather than the expected +2-day text. The tests explicitly model the native event order; they do not synthesize an inaccessible control action to create the bug.

The complete calendar/clock-related set passed **150/150** after the fix. The final fixed source then passed the complete serial Node suite **17,304/17,304** (370.19 seconds, exit 0) and **91/91 Python tests** (exit 0). `git diff --check` passed. New coverage checks Enter and button calculation; invalid-attempt error retention; input/change edit-away-and-back without result revival; composition completion with and without an input event; and unchanged change during a pending copy. Existing stale-view, visibility, copy-lock, late-settlement and read-only tests remain intact.

The first post-fix model run exposed that the shared test DOM's `dispatch` helper does not supply `event.type`. This test file now explicitly supplies `type: 'change'` where it models a real change event, including the existing same-value pending-copy regression. The initial model failures are retained in local evidence rather than reported as a passing run.

## Native acceptance scope

The baseline used a full new-tab page, production runtime and legal synthetic workspaces on loopback port 8808. External requests were denied and online favicons/Sync disabled. Copy used an in-memory `writeText` adapter, **not the system clipboard**. Native calendar actions caused zero synthetic storage writes. Closing/reopening the calendar returned to the actual device-local month and blank, collapsed interval fields; the system clock was not changed.

The fixed production source was then frozen in an independent loopback fixture on port 8809, with the same legal seed and an isolated synthetic storage key. Real controls verified:

- Enter calculation → **first Copy click** retains +2 days and sends that exact visible string once to the in-memory adapter.
- Swap → Calculate button → Copy produces and captures −2 days.
- Typing a different date and typing the original value back clears the old result; Copy remains unavailable until a fresh calculation.
- Invalid Enter → Tab preserves the validation message and exact raw invalid date.
- A fresh invalid Enter → **first Clear click** empties both date fields and feedback, while February 2000 remains selected.
- Folding/reopening Date interval retains its raw drafts and displayed calculation. Closing/reopening the entire calendar starts the current device-local month with empty, folded interval fields.

The final fixture recorded two exact expected copy strings, **0 storage writes**, and no captured application errors. The owned browser tab, server and dedicated Terminal tab were cleaned up. Actual OS input-method composition remains model-only coverage; no system-clipboard success or installed-extension upgrade is claimed.

No screenshots or personal data are uploaded. Neither this local usability fix nor its synthetic acceptance resolves the historical upgrade incident or changes the import/publication gates.
