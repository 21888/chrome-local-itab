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
claimed for this change. No GUI session, full regression rerun, build, version
bump, Release, Chrome Web Store action or screenshot upload was performed. The
existing Chrome Web Store data-loss incident remains outside this change.
