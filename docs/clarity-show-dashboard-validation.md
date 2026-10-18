# Clarity quote-only view: visible return button

2026-10-18. Baseline master: `6d2efd2b2eae4956e53a7d81e1db9acf24848ca7`.

## User-facing change

Clarity's quote-only view previously retained the workspace and recovery bar,
but offered no visible return action. Returning required knowing the existing
background double-click gesture or using the background context menu. Add a
localized **Show dashboard / 显示主界面** native button to that surviving bar.
It is visible only when Clarity is selected and the dashboard is hidden.
Normal Clarity and all other templates retain their existing appearance.

Activation calls the existing `setDashboardHidden(false)`. That transaction,
`applyDashboardHiddenState`, and the existing double-click exclusion predicate
are unchanged. Saving still patches only the visibility preference, with the
same serialized writes, stale-view protection, visible errors and rollback.
No schema, recovery protocol, import, sync or data migration is changed.

A focused return button hands focus to the available workspace chooser (or
recovery link) before the button disappears. Unrelated focus is left alone,
and later save completion or failure does not steal focus. A failed save keeps
the saved quote-only state and the button available for an explicit retry.
Existing background double-click and context-menu controls remain usable.

## Automated checks

Eight appended tests failed on the unchanged baseline, while all 48 original
Clarity/field-write tests passed. All original test/helper bytes remain intact.
The additional two tests cover delayed success/failure focus and a template
round trip. Coverage uses the actual HTML control and production page functions
with the real StorageManager in the existing deterministic Chrome-storage/
Web-Locks model, including:

- one field-only write; complete saved configuration and exact search/custom
  engine drafts retained; original search host/input retained;
- actual write failure, unchanged raw data, visible feedback and explicit retry;
- repeated activation/remount and double-click do not duplicate writes;
- unavailable, detached, inert, disabled, other-template, composing and hidden
  page cases do not initiate the restore action;
- keyboard-style focus handoff and later focus preservation.

Owner focused validation passed 233 Node tests, including existing context
menu, template rendering/live preview/reuse, workspace, scratchpad and temporary
Focus suites. Python passed 84 tests. Independent initial review passed 127
cases and verified the three existing function bodies are unchanged. An optional
reviewer-only in-memory extra probe was terminated with exit 137 before it
completed and is not counted as a pass. Final independent validation passed
58 Clarity/field-write tests, reviewed both screenshots and the keyboard/DOM
records, and matched all 138 candidate runtime hashes to the frozen preview.
The unchanged full exact-commit CI remains the final delivery gate.

## Actual static-renderer checks

The documented dot cloud terminal/browser route served all 138 production
runtime files, with one external preview-only API bridge and synthetic
page-memory storage. Runtime hashes were frozen at startup and compared with
the baseline Git tree: only the two catalogs, HTML, JavaScript, base CSS and
Clarity CSS changed. No extension was installed and no user profile was used.

For the initial candidate, at 1180px English/light the 136-by-37px return button is visible in the bar at
x=16/y=16. Recovery and workspace controls are readable on the same row. Enter
restores the normal dashboard and moves focus to the workspace chooser. A
subsequent background double-click hides it again; Space on the return button
restores all 12 synthetic sites and the exact search draft including surrounding
spaces. The button has zero layout rectangles in normal mode.

At a 390-by-844px Chinese/dark iframe viewport, the 96-by-37px return button and
read-only recovery link share the first row; the chooser, management link and
help text wrap below. Content and scroll widths are both 390px. The quote text
is readable below the toolbar. Enter restores all 12 sites, focuses the
workspace chooser, and hides the button. The restored content and scroll widths
are both 382px after its scrollbar. Scoped screenshots remain local only.

These observations validate rendering and UI behavior under a synthetic bridge.
They do not establish native-extension upgrade behavior, real Chrome storage
fault recovery, or the root cause/resolution of the historical data-loss report.
Manifest 1.1.155, Release and Chrome Web Store publication remain unchanged.


## Full-CI recovery-entry contract correction

The first exact-source CI (`39173169087`, commit `350a38f0`) completed with
16,578 of 16,579 Node tests passing. Its only failure was the original
`recovery-view.test.js` static contract: the read-only recovery anchor must
remain immediately inside the workspace bar, before initialization. The new
button had been inserted before that anchor. The focused original recovery
suite reproduced the same single failure (50 of 51 passing).

The correction moves the new button after the unchanged original anchor. The
recovery link therefore retains its first-control position and its full
original markup, target and relationship attributes. The newly added feature
fixture follows this real HTML order. The original recovery test is unchanged;
no assertion or helper from the pre-feature baseline is weakened or removed.
Owner and independent recovery/Clarity/field-write runs both passed 109 tests.

The corrected production renderer was rechecked at 1180px English/light and
390-by-844px Chinese/dark. Both local screenshots show the recovery link first
and return button second, without overlap. At 390px the button is 96-by-37px at
x=152.015625/y=16, alongside the first recovery link. Widths remain 390/390 in
quote-only mode and 382/382 after restoration. Enter still restores all 12 site
actions and hands focus to the workspace chooser. The corrected 138-file
runtime manifest is frozen separately; only HTML changes from the first
candidate. Full exact-source CI is rerun for the correction commit.
