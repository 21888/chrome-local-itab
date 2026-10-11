# Workspaces native QA checklist

Test the integrated unpacked extension with a disposable browser profile and no live user-data deletion.

- On an existing-data fixture, verify Default retains sites, free/grid positions, appearance, task/history, notes, countdown, Focus preferences/session, and global privacy/provider settings after migration.
- In light/dark Clarity, Graphite, Folio, and representative gallery templates, check the workspace bar and Settings management at desktop and 390 CSS-pixel width; repeat at 200% zoom.
- Use Tab, Shift+Tab, Enter, Space, Escape, IME composition, repeated activation, and focus outside pending dialogs. Check visible focus and focus return after rename/delete/restore.
- Create two same-named workspaces and confirm row actions still target the correct ID. Fill different sites/layout/template/tasks/notes/countdown/Focus preferences in each; switch and reload both.
- Keep A open while B becomes last-used. Confirm A stays A, a new tab opens B, Settings from A opens A, and automatic/ordinary reload of A remains A.
- Delay a save and attempt switching twice. Confirm one transition waits. Enter a draft while selection is delayed and confirm navigation stops for a fresh decision.
- Test Stay, Save and switch, and Discard with Scratchpad, Countdown Settings, task quick entry, invalid Focus duration, Settings form, and unfinished import/review. Failed/conflicted saves must not navigate or erase fields.
- Delete a non-Default workspace from another Settings tab. Confirm old tabs cannot save, text stays available, and Export page text downloads the exact visible draft. Restore and confirm those old tabs remain invalid while newly opened tabs work.
- Delete the current non-Default workspace: retain its draft and warning, restore in the management view, reopen explicitly. Default must remain undeletable.
- Duplicate a running-timer workspace and confirm the original timer is untouched and the copy starts ready. Verify saved task/history and Scratchpad were copied; uncommitted text was not.
- Attempt Drive restore outside Default: controls and direct handler are bounded to Default. Confirm other workspace settings are unchanged by Default Sync events and global preferences remain shared.
- Verify Settings search finds Workspaces/Create/Trash/Restore labels without indexing any actual workspace names or private content.
- Request page-text export, inspect downloaded text, then confirm focus and original fields remain. Cancel/deny download and confirm no false claim of verified completion.

- In Folio, confirm the workspace bar occupies the explicit row between header and search, rather than an implicit grid row after the footer. In quote-only mode, confirm the bar is reachable at the top.
- Trigger a post-migration write from an old-version fixture. Confirm a persistent legacy-conflict banner, blocked saving, two-copy recovery JSON without provider/credential data, counted review, and explicit keep-current/retain-old confirmation. Change either saved copy while reviewing and confirm re-review is required. After successful resolution, drafts remain and old sessions require explicit reopen.
