# Local Tasks

Enable **Tasks** under module visibility settings. It starts empty and is optional. Hiding the card keeps its contents.

- **Filter tasks** matches plain task text locally, ignoring case and outer spaces, across active, completed and removed tasks. All matching active tasks are shown; open **Completed** or **Removed** for their matching rows. **Clear filter** returns to your prior Show all/Show fewer view. Clear the filter before moving tasks up/down. The filter is not saved, does not search the web, and does not change task order, the pin, drafts or backups.
- Add a plain-text task with Enter, or use Shift+Enter for a new line.
- **Add multiple tasks** opens a separate plain-text editor. Every nonblank line becomes one task in its original order; spaces, bullet prefixes and duplicate lines are kept. **Review tasks** checks the full batch and shows a numbered preview, exact count and remaining record capacity. Only **Add reviewed tasks** writes, in one all-or-nothing operation. Editing or an observed list change requires another review. The existing pin, records, previous copies and settings are preserved.
- Preview and cancel write nothing. If confirmation fails after a possibly successful save, **Retry previous add** retries the same reviewed batch, even if you have typed a newer draft. That newer draft remains untouched and needs its own review. A later acknowledged mutation requires a fresh review rather than repeating the older operation. Closing a draft does not undo a save already in progress; unfinished input is page-local and is not saved when the dialog/page closes.
- Complete or reopen a task. Open **Actions** to edit, pin one next action, move up/down, or remove it.
- Use **Complete** beside **Next up** to finish the pinned task even when it is outside the four-row preview or current filter. The task text stays plain text; the button works with Enter or Space. Completing it clears the pin without choosing another task. If another page changes the pin or task first, the older action stops for review. Focus returns to Add a task only after a confirmed save, if you have not moved on.
- **Undo completion** reopens the last successfully completed task, including **Next up**, without restoring its old pin. It shares one page-local Undo slot with **Undo removal**: the latest completion or removal replaces the previous one, and reloading clears it. Later changes to that task prevent Undo; unrelated tasks and a newer pin stay unchanged. An uncertain save must be explicitly retried and confirmed first. **Completed** and **Removed** still let you reopen or restore items after reloading.
- **Task data** contains separate export, reviewed import, and previous local copies.

Tasks stay in this extension's storage on this device. Settings exports, Chrome Sync and Drive backups do not contain tasks, completed items, removed items or their previous copies. Export tasks separately before moving devices or removing browser data. A downloaded file is not automatically a cloud backup. Uninstalling the extension or clearing its data can remove local tasks.

Import replaces the current task list and pin only after review. The preceding list remains in **Previous local copies**. Canceling or a failed replacement does not erase it. Settings reset/import/restore preserve task content. No permanent purge is offered in this version.

The local list holds up to 500 tasks, including completed/removed items, and each task can contain up to 1,000 Unicode characters. Up to 8 previous local copies are retained; the total task collection/file is capped at 2 MB. Reaching a limit blocks the new operation and keeps existing data. Exporting does not free space. At the copy limit, an existing copy can still be restored while retaining the current one.

When two pages edit the same task or a list changes during a reviewed import, the older action stops for review. Your current draft remains available. A save is confirmed only after local storage has been checked. If an uncertain save is followed by another change, retry asks you to review rather than assuming that the earlier result still exists.

There are no reminders, due dates, link previews, external accounts or automatic resets at midnight.

When a settings update needs to reload the page, an unfinished task draft, open editor/batch/import review or pending save defers automatic reload. Use the page's Reload option when ready. Discarding drafts requires confirmation; an active save must finish first.

A backup containing all 8 previous copies can be imported into a destination with no task records, no pin and no previous copies. Only in this case, the redundant empty destination snapshot is omitted. All incoming copies are retained; visibility stays as configured on the destination, even if it was previously toggled. Active, completed or removed destination tasks, or any existing previous copies, retain the normal protection and capacity checks. Restoring an existing local copy is unchanged.
