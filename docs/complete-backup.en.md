# Complete local backup

Settings → Data → **Complete local backup** is a saved-data migration path. Choose any of five modules:

- Configuration: sites, categories, layout, appearance and local images.
- Tasks: saved tasks, pin, removed/completed records and saved recovery history.
- Scratchpad: saved note and preferences.
- Countdown: saved title, target date and preferences.
- Focus: saved visibility and durations only. Running, paused or interrupted sessions are not portable.

Finish saving first. This does not save open drafts for you. Unsaved settings, task edits, Scratchpad drafts, Countdown edits and calculator input are excluded. Separate Settings JSON, Tasks JSON, Scratchpad TXT, Countdown TXT and bookmark HTML exports remain available. Chrome Sync, Google Drive and configuration-only recovery do not gain personal content.

## Export and restore

1. Select modules and choose **Export selected modules**. A download request is not proof that a file was saved. Check the browser’s download list and open the destination folder before removing the old installation.
2. On the destination, export existing saved data and finish or separately preserve all drafts. Choose the complete JSON file (up to 32 MiB). The file is read locally. Large image files may briefly pause the page during bounded validation.
3. Review the selected modules, incoming/current counts and replacement scope. Changing selection creates a fresh preview. No content is merged; only selected modules are replaced. Unselected modules and provider/authentication settings stay unchanged.
4. Focus restoration is blocked while the destination has a running, paused or interrupted session. Deselect Focus or stop/reset that session using the existing timer controls, then preview again. No timer is silently stopped.
5. Choose **Replace selected saved modules** once. A fresh baseline check rejects stale previews. Current Settings drafts or pending edits block restoration. Cancel, file read failure and preview errors do not replace saved data or discard drafts.
6. Wait for the verified result. Reload is a separate action; pages are not forcibly refreshed. Preserve newly entered or other-tab drafts before using Reload. Other open pages may show revision conflicts when their saved data changes.

## Recovery and failure

Before target replacement, a complete pre-restore snapshot is saved locally and read back. If that step fails, target data is not replaced. Only the latest complete recovery snapshot is retained; starting another confirmed restore may replace that snapshot even if the final replacement does not finish. Download an existing recovery copy before proceeding if you need to keep it. This is distinct from the history inside Tasks.

Use **Download pre-restore recovery copy**, then choose that JSON through the same reviewed import flow. Recovery download does not restore automatically. A final write or verification failure may leave the result uncertain: inspect saved data and the recovery copy rather than automatically retrying. The UI explicitly distinguishes that from failures known to occur before replacement.

The JSON can contain personal notes, task history, complete URLs and images. Keep it private. No new network permission is required and private modules are not uploaded to cloud backups by this feature.
