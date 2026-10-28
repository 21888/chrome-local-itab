# Focus: retain failed-action feedback when returning to a tab

Date: 2026-10-28. Scope: local Focus dashboard visibility refresh only.

## Reproduced user flow

1. Enable Focus, start an interval, then choose **Pause**.
2. The local write fails, or the pause is saved but its acknowledgement fails.
3. Leave the tab and return without choosing **Read latest state**.

Before the fix, a successful visibility refresh cleared the original failure and
hid **Read latest state**. A failed refresh replaced the original write failure
with a read failure. Neither tab navigation is an explicit acknowledgement of
the failed Pause operation.

The visibility handler now uses the controller's existing background-refresh
path. It still reads and publishes saved state; it preserves the failed action's
feedback rather than borrowing explicit recovery authority. **Read latest
state** does not replay Pause; in these fixed-clock cases it performs no write.
The timer's existing interval, clock, storage and draft rules are unchanged.

## Verification

- Added five focused real Store/Controller + modeled-DOM checks. Before the fix,
  all four Pause cases failed; the initial-read recovery control passed.
- Four Pause cases cover rejected versus saved-but-unacknowledged writes,
  combined with successful versus failed return reads. Each verifies the same
  failure remains visible, no extra write/replay occurs, and explicit successful
  recovery clears the feedback and shows the actual Pause/Resume action.
- Initial read failures without a failed action can still recover automatically
  on tab return, without a storage write.
- `node --test --test-name-pattern='tab return' tests/local-focus-view.test.js`:
  **5 passed** after the fix.
- `node --test tests/local-focus-*.test.js`: **163 passed**, including duration
  drafts, feedback ownership, keyboard focus, title, expected end, progress,
  workspace retirement, temporary focus view and local-only boundaries.
- Syntax checks for the changed runtime/test and `git diff --check`: passed.

## Boundary

Synthetic in-memory storage, clocks and modeled DOM only; no real user data,
browser profile, provider or network request. No native-browser acceptance is
claimed by the model checks above. No full regression rerun, build, version bump,
Release, Chrome Web Store action or screenshot upload was performed. The existing
Chrome Web Store data-loss incident remains outside this change.

## Native component check: partial, visibility not established

2026-10-28 15:26–15:29 UTC. A dedicated loopback 8836 page mounted the actual
Focus Store, Controller, View and CSS, with four frozen production files matching
local `3f826125` before and after the check. Chrome used native Web Locks and
clocks. Only the Chrome storage boundary and one-shot Pause failures were
synthetic in-memory data. This was not an installed extension, full new-tab page
or evidence of a real Chrome storage fault; the fixture CSP denied outgoing
connections.

Confirmed visibly in the real browser:

- Start succeeded. Rejected Pause left the saved timer running, displayed the
  existing failure guidance and **Read latest state**, and recorded two write
  attempts / one committed write. Explicit **Read latest state** changed reads
  from 6 to 7, cleared the error and kept **Pause**, without another write.
- A second Pause committed but then rejected its acknowledgement. The UI showed
  **Paused**, **Resume**, the failure guidance and **Read latest state** together.
  The cumulative count was three attempts / two commits. Explicit recovery
  changed reads from 10 to 11, cleared the error and retained **Resume**, without
  repeating Pause or adding a write. Application-error journal remained empty.

**The changed tab-return path is not natively accepted by this check.** An owned
away tab was opened, then the native tab strip was used to return. A single
normal native Chrome minimize/restore was also tried. The journal recorded zero
`visibilitychange` events after both attempts, with only the initial trusted
`pageshow`; reads stayed at 6 until explicit recovery. Thus neither route
established the required browser-trusted hidden → visible sequence. Keeping the
error visible during those actions is not proof that the new background-refresh
call ran. No event was manually dispatched, no visibility property overridden,
and no browser emulation, flags, permissions or further retries were used. The
four red-to-green model cases remain separate evidence for that path.

Text observations are retained locally in `evidence/focus-tab-return/`, including
the zero-event observations, both failures/recoveries and runtime hashes. The
two owned test tabs and dedicated server Terminal tab were closed, the server
exited normally on Ctrl+C, and the other browser tab was left untouched. GUI
ownership was released before documentation work. No screenshots or fixture
binaries were uploaded.
