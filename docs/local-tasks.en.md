# Local Tasks

Enable **Tasks** under module visibility settings. It starts empty and is optional. Hiding the card keeps its contents.

- Add a plain-text task with Enter, or use Shift+Enter for a new line.
- Complete or reopen a task. Open **Actions** to edit, pin one next action, move up/down, or remove it.
- Completing a pinned task clears the pin. No other task is chosen automatically.
- **Undo removal** is immediate. **Removed** also lets you restore an item after reloading.
- **Task data** contains separate export, reviewed import, and previous local copies.

Tasks stay in this extension's storage on this device. Settings exports, Chrome Sync and Drive backups do not contain tasks, completed items, removed items or their previous copies. Export tasks separately before moving devices or removing browser data. A downloaded file is not automatically a cloud backup. Uninstalling the extension or clearing its data can remove local tasks.

Import replaces the current task list and pin only after review. The preceding list remains in **Previous local copies**. Canceling or a failed replacement does not erase it. Settings reset/import/restore preserve task content. No permanent purge is offered in this version.

The local list holds up to 500 tasks, including completed/removed items, and each task can contain up to 1,000 Unicode characters. Up to 8 previous local copies are retained; the total task collection/file is capped at 2 MB. Reaching a limit blocks the new operation and keeps existing data. Exporting does not free space. At the copy limit, an existing copy can still be restored while retaining the current one.

When two pages edit the same task or a list changes during a reviewed import, the older action stops for review. Your current draft remains available. A save is confirmed only after local storage has been checked. If an uncertain save is followed by another change, retry asks you to review rather than assuming that the earlier result still exists.

There are no reminders, due dates, link previews, external accounts or automatic resets at midnight.

When a settings update needs to reload the page, an unfinished task draft, open editor/import review or pending save defers automatic reload. Use the page's Reload option when ready. Discarding drafts requires confirmation; an active save must finish first.
