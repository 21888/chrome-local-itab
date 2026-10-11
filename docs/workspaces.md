# Local workspaces

Use the **Current workspace** control at the top of a new tab to switch. Use **Settings → Workspaces** to create, rename, duplicate, move to Trash, or restore a workspace.

Each workspace has its own saved sites and categories, layout, visual template, task history, Scratchpad, Countdown, and Focus timer. Creating a workspace starts with default settings and empty personal modules. Duplicating copies saved content; it does not include unsaved page drafts or a running Focus session.

## Tabs and drafts

An open tab stays attached to the workspace it loaded, even if another tab switches. New tabs use the last selected workspace. Settings opened from a dashboard stay attached to that dashboard’s workspace, and ordinary reloads preserve the workspace in the URL.

Switching waits for pending actions. Unsaved drafts or open reviews require an explicit choice:

- **Stay here** keeps the page and resumes ordinary autosave.
- **Save and switch** runs ordinary validated saves. Conflicting edits, unfinished reviews, invalid drafts, and unsupported open editors remain on the page for attention. It does not auto-confirm imports or overwrite conflicts.
- **Discard drafts and switch** explicitly leaves unsaved drafts behind. Previously saved content remains saved.

Scratchpad autosave and category autosave pause while this decision is open. New writes are suspended and accepted writes are flushed before leaving. No unload-time asynchronous save is used.

Moving a workspace to Trash pauses a running Focus timer at deletion. Restoring preserves its saved paused, ready, completed, or interrupted state and never auto-starts a timer.

Deleting or replacing a workspace in another tab invalidates the old tab’s save session. The old page keeps its text, displays a warning, and offers **Export page text**. That private text download includes editable form values and is not a restorable backup. Restoring from Trash does not revive stale tabs; reopen the workspace to obtain a new valid session.

## Older-tab storage conflicts

If an older Local iTab tab writes to the previous storage format, saving is blocked and both saved copies are retained. Close older tabs, then use **Download both saved copies** for a recovery JSON without provider settings or credentials. **Review recovery choice** shows the conflict time and counts for the current workspaces and older-tab copy. **Keep current workspaces and retain older-tab copy** explicitly retains current workspaces as active and preserves the older copy separately. It never merges or deletes either copy. A concurrent change invalidates the review and requires a new review.

After resolution, old tabs still cannot save. Export unsaved page text and explicitly reopen a workspace; reopening uses the same Stay/Save/Discard draft guard.

## Shared settings and recovery

Default preserves the original installation’s configuration and cannot be deleted. Language, privacy permissions, and cloud accounts remain shared. Chrome Sync and Google Drive apply to Default only. Drive controls outside Default explain that boundary and are disabled. Complete local backup covers workspaces and Trash according to the selected module scope.

Reset to Defaults resets only the current workspace’s sites/layout/configuration. Tasks, Scratchpad, Countdown, Focus, and shared device preferences are preserved.

The previous “recommended workspace” control is now called **Recommended modules**. It only previews and applies module visibility for a visual template; it does not create or switch workspaces.

## Verification

Automated ownership/DOM-model coverage lives in `tests/workspaces-view.test.js` and `tests/workspace-lifecycle.test.js`. It covers repeated submission, pending writes, validation, IME Enter, stale controls, focus restoration, Trash, deleted/restored sessions, private text export, dirty decisions, failed selection, and typing during delayed selection. Existing Settings keyboard/search fixtures cover the seventh tab and the new public-label search destination.

Native validation must still check actual layout, keyboard focus painting, browser history, real extension storage events, narrow widths/zoom, and the latest integrated backup schema. No browser QA is claimed by these model tests.
