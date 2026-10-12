# Complete local backup

Settings → Data → **Complete local backup** is a saved-data migration path. Choose any of seven modules:

- Configuration: sites, categories, layout, appearance and local images.
- Tasks: saved tasks, pin, removed/completed records and saved recovery history.
- Scratchpad: saved note and preferences.
- Countdown: saved title, target date and preferences.
- Focus: saved visibility and durations only. Running, paused or interrupted sessions are not portable.
- Global prompts: saved and archived prompts, immutable body versions and recovery history.
- Global AI collections: saved and archived excerpts, annotations, source URLs, exact prompt/version links and recovery history.

The first five modules belong to each workspace; the two global libraries occur once, shared by all workspaces. Global library visibility and unsaved editors are not portable. Selecting collections produces schema 4; without collections, prompts produce schema 3, and workspace-only archives use schema 2. Older single-workspace files use schema 1.

Finish saving first. This does not save open drafts for you. Unsaved settings, task edits, Scratchpad drafts, Countdown edits and calculator input are excluded. Separate Settings JSON, Tasks JSON, Scratchpad TXT, Countdown TXT and bookmark HTML exports remain available. Chrome Sync, Google Drive and configuration-only recovery do not gain personal content.

## Workspaces and reviewed destinations

Workspace-aware backups include all live workspaces and recoverable Trash. Selecting all five workspace modules can replace the workspace list, names, order and Trash. A partial workspace restore requires matching live/Trash identities and cannot create, rename, delete or resurrect workspaces. Global-only restoration does not replace workspace contents.

A schema-1 file requires explicitly choosing a live destination workspace in the preview; it cannot target Trash. Other workspaces remain unchanged. When selected, prompts and collections each require confirming their separate global destination. Review matching-ID conflicts before replacement. Exact prompt and body-version IDs are preserved; restoring collections without the matching prompts can leave unresolved links. Never substitute a similarly named prompt.

## Export and restore

1. Select modules and choose **Export selected modules**. A download request is not proof that a file was saved. Check the browser’s download list and open the destination folder before removing the old installation.
2. On the destination, export existing saved data and finish or separately preserve all drafts. Choose the complete JSON file (up to 32 MiB). The file is read locally. Large image files may briefly pause the page during bounded validation.
3. Review the selected modules, incoming/current counts and replacement scope. Changing selection creates a fresh preview. Selected current records are replaced rather than merged; global recovery histories are retained/imported. Only selected modules are replaced. Unselected modules and provider/authentication settings stay unchanged.
4. Focus restoration is blocked while the destination has a running, paused or interrupted session. Deselect Focus or stop/reset that session using the existing timer controls, then preview again. No timer is silently stopped.
5. Choose **Replace selected saved modules** once. A fresh baseline check rejects stale previews. Current Settings drafts or pending edits block restoration. Cancel, file read failure and preview errors do not replace saved data or discard drafts.
6. Wait for the verified result. Reload is a separate action; pages are not forcibly refreshed. Preserve newly entered or other-tab drafts before using Reload. Other open pages may show revision conflicts when their saved data changes.

## Recovery and failure

Before target replacement, a pre-restore snapshot of all five modules in every workspace (including Trash), plus only the selected global libraries, is saved locally and read back. If that step fails, target data is not replaced. Only the latest complete recovery snapshot is retained; starting another confirmed restore may replace that snapshot even if the final replacement does not finish. Download an existing recovery copy before proceeding if you need to keep it. This is distinct from the history inside Tasks.

Use **Download pre-restore recovery copy**, then choose that JSON through the same reviewed import flow. Recovery download does not restore automatically. A final write or verification failure may leave the result uncertain: inspect saved data and the recovery copy rather than automatically retrying. The UI explicitly distinguishes that from failures known to occur before replacement.

An interrupted combined restore can leave a durable pending marker that blocks cooperating writers even after reload. Use the offered inspection and separately confirmed recovery flow; it verifies the saved prior state before repairing. Do not repeatedly import or assume reload fixes an uncertain write. This is verified staged replacement, not a guarantee of browser-crash atomicity.

The JSON can contain personal notes, prompt bodies, saved excerpts, task history, complete URLs and images. Keep it private. No new network permission is required and private modules are not uploaded to cloud backups by this feature.

Files are unencrypted. Explicitly saved historical Q&A snapshots in collections retain the exact question, source excerpts and identifiers, full reviewed prompt and historical endpoint/model. These can contain private information or secrets entered in the text. Omitting attribution source URLs from a separate collection export does not remove the snapshot or historical endpoint. Review before sharing; see [historical Q&A snapshots](ai-context-workflow.md#optional-historical-questionsource-snapshot).

API-key fields and authentication headers are never saved or backed up. Connection presets (name, endpoint and model) are separate device-local preferences excluded from complete backups, manual exports, workspace copies and sync. Restore preserves destination presets and does not import or grant endpoint access. Recreate presets on the new device and separately allow access when needed. [Connection preset details](ai-model-workflow.md#device-local-connection-presets).
