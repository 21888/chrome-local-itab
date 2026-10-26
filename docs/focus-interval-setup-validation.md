# Preserve the keyboard path through interval setup

## Complete flow and counterexample

The actual Focus Store/Controller plus DOM model exercised **choose Break → edit minutes → explicit Save → Start → Pause → Resume → Reset → choose Focus again**. The original implementation preserved both phases' durations and all seven expected writes, and kept the timer Ready after Reset/phase changes. However, both explicit interval selections lost focus when the select was temporarily disabled; their successful settlement left focus on the page body. The model assertion recorded `[false, false]` for the two original select identities.

This establishes lost control ownership in the event model, not an unverified claim that native Tab necessarily restarts at the top of the page. An initial object-reference assertion produced only a file-level failed result; switching to a boolean identity assertion yielded the precise failure without dumping the cyclic DOM model.

## Scoped behavior

Only the explicit phase select supplies itself as both focus source and successful return target. The existing action receipt still defaults to Start for Start/Pause/Resume and explicit Save/Reset. This avoids treating a phase choice as an instruction to jump to Start. Successful phase choices do not start a timer.

The same existing focus-intent cancellation, visibility, current workspace, source focus and saved-revision checks still apply. Removed/disabled targets cannot receive restoration. Failed writes, newer pointer/keyboard/focus intent, destroyed/detached views and replaced workspaces do not reclaim selection. Minute input still owns its draft; a newer edit made after phase settlement defeats the previous selection's focus receipt.

No duration normalization, automatic change-save, explicit Save, timer calculation, persistence or retry semantics change.

## Validation

- All 12 Focus test files: **158/158 passed**.
- The complete chain verifies Break minutes 7 and original Focus minutes 25 after returning, Ready state, and exact write counts.
- Additional cases cover current-source failure, newer focus (including editing minutes before the old receipt completes), focus-away/back, pointer/Tab, hidden page, detach/destroy, newer action, workspace object/generation change, removed select and unfocused invocation.
- Final aggregate: Node **17,214/17,214 passed** (432 files), Python **91/91 passed**, both exit 0.

## Native complete-page acceptance

Cloud Chromium used the actual new-tab runtime on an isolated loopback page, with legal synthetic workspace storage and external requests/providers disabled. Both interval selections returned focus to the original Interval select. The real sequence and cumulative workspace writes were:

| Action | Writes | Observed result |
| --- | ---: | --- |
| Select Break | 1 | Ready, Interval select focused |
| Type 7 minutes, Tab away | 2 | Native change/blur saved 7; next Tab reached Start |
| Type 8 minutes, click visible Save minutes | 3 | Change/blur saved 8 once; no duplicate write |
| Tab to Start, Enter | 4 | Running, Pause focused |
| Enter Pause | 5 | Paused, Resume focused |
| Enter Resume | 6 | Running, Pause focused |
| Tab to Stop/reset, Enter | 7 | Ready, Start focused; no automatic restart |
| Select Focus | 8 | Ready, Interval select focused, Focus 25 / Break 8 retained |

The visible Save click triggered the existing change/blur save before any separately established click-handler save. This is **not** evidence that the explicit Save handler executed in the browser. The isolated model separately covers that handler. Native automatic saves briefly left body focus, but the following Tab reached Start; this is not claimed as a new product defect or a jump to the page header. No automatic/manual save behavior was changed to force a preferred test sequence.

Final DOM-exposed synthetic readback confirmed exact preservation of the other workspace, global settings and non-Focus personal data, with no opened sites. This was synthetic full-page acceptance, not installed-extension migration/upgrade or OS IME testing. The new browser tab was closed, only the dedicated port 8775 server stopped, and its terminal tab closed. Original Options/approval tabs were untouched.

Synthetic evidence remains local. No real user data, Options import, file selection, external model/provider, Release or store submission is involved.
