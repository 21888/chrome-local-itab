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

## Review an export before downloading

Choose **Prepare export summary** after saving the data you need. Preparation reads the selected saved modules once and does not download or write them. Review the module names, exact snapshot generation time, JSON UTF-8 byte count, live/Trash workspace identity counts and existing module statistics. The summary shows only counts and saved preference statistics, without workspace names, site URLs, titles, note bodies, prompt bodies or collection content. The live status announces readiness without speaking private content.

Once the fingerprint is ready, **Copy fingerprint** copies only its 64 hexadecimal characters, never the backup body. Copy failure leaves manual selection and download available. Cancelling the summary cannot withdraw an already-requested clipboard write.

The summary also displays SHA-256 of the same UTF-8 JSON. Hashing runs locally without blocking download; an unavailable fingerprint does not prevent a backup. Compare it with the downloaded file’s SHA-256 to check byte identity. It does not prove download completion, recoverability, authenticity, or upgrade safety. Late results cannot overwrite a replacement summary.

Workspace counts include Trash and count repeated local-image references separately. “Enabled in at least one workspace” is an OR across workspaces, not a claim that every workspace is enabled. Cross-workspace Focus durations and Countdown titles/dates are not invented or listed. A schema-1 file has one workspace’s module contents and does not record live/Trash identities; its summary says so and counts Countdown title characters without showing the title or date. Each selected global library is counted once, with its active/archived records, saved body versions and recovery copies. Global-only files still contain workspace identity metadata but no workspace module contents; the summary states that distinction.

Choose **Download this backup** to request the exact UTF-8 JSON string used for the summary. It is the saved snapshot at the displayed generation time: later saves are not silently reread or mixed into it. To include newer changes, prepare a new summary. A ready summary is temporary, unencrypted page-local state; it is cleared when the selection changes, another file is selected, preparation is cancelled, the view is destroyed or its host/page leaves. It is not a restore review or authorization to replace data.

Preparation can be cancelled without downloading or changing saved data or drafts. An empty selection cannot prepare a file. The ordinary download button is single-use for that snapshot; while its request is pending, duplicate actions, cancellation and destruction cannot pretend to withdraw it. Once the request settles, the temporary bytes and lock are released, even if the host left. Success means only that a download was requested. On an error, inspect the browser’s downloads before preparing another copy; no automatic retry occurs. Existing pre-restore and interrupted-restore copy downloads retain their separate behavior.

The existing 32 MiB limit and large-image pause risk still apply. Summary validation is local and may briefly pause the page for a large file. No new network calls, permissions, sync, providers or telemetry are involved.

## Workspaces and reviewed destinations

Workspace-aware backups include all live workspaces and recoverable Trash. Selecting all five workspace modules can replace the workspace list, names, order and Trash. A partial workspace restore requires matching live/Trash identities and cannot create, rename, delete or resurrect workspaces. Global-only restoration does not replace workspace contents.

For a workspace-aware file (schema 2 or newer), selecting all five workspace modules also shows a collapsed **Workspace names and destinations** list in the restore review. Expand it to see the three group names and exact counts: workspaces brought in from the backup, those no longer retained in the current list or Trash after restoration, and existing identities whose name or live/Trash status changes. Each nonempty group starts collapsed and opens independently to show every full stable ID. You can inspect removals without first opening incoming rows. An empty group shows 0 without an expand control. Each row shows the current and proposed name/status, including “Not present.” Equal names never join different IDs, and a combined rename/status change is one row. The existing complete pre-restore recovery copy still applies.

This list describes only the verified preview’s names and membership. It does not confirm that a restore succeeded or resolve an interrupted restore. If there are no such changes, selected module contents still replace the saved contents; order and last-used workspace may still change. Final confirmation still checks the saved baseline. Changing the file or module selection clears and collapses the old list before checking again; cancellation, failed review and closing the view also clear it. Expanding or collapsing does not read or write storage. Older single-workspace, partial-workspace and global-only reviews do not show this list.

A schema-1 file requires explicitly choosing a live destination workspace in the preview; it cannot target Trash. Other workspaces remain unchanged. When selected, prompts and collections each require confirming their separate global destination. Review matching-ID conflicts before replacement. Exact prompt and body-version IDs are preserved; restoring collections without the matching prompts can leave unresolved links. Never substitute a similarly named prompt.

## Selecting modules together

Use **Clear selection** to uncheck the available modules, then check a single module such as Scratchpad. **Select all available modules** checks all seven modules before a file is loaded; after a file is checked, it selects only the modules included in that file. Missing modules remain disabled. These buttons only change the selection; they do not export or restore automatically. An empty selection cannot be exported or applied.

Changing a loaded file's selection clears the old preview and workspace-impact list and requests one fresh review. Clearing all modules keeps the file and its known module list for later reselection, without running an empty Store review. Existing explicit destinations for that same file are retained. Selecting everything does not choose a workspace or either global-library destination for you: all required destinations must still be selected explicitly, and replacement still needs its separate confirmation. Selecting all five workspace modules restores the full-workspace scope and its names/status impact list, so review that wider replacement carefully.

The buttons share the module checkboxes' locks while the first file check, a large-file confirmation, export or replacement is pending. Once the file's modules are known, you can change selection during a fresh review; older results cannot overwrite the newer choice. Repeating an already-complete selection or clear leaves the current review and feedback alone. Focus-session, unsaved-draft, configuration-import and recovery protections still apply.

## Export and restore

1. Select modules, choose **Prepare export summary**, review it, then choose **Download this backup**. Check the browser’s downloads and saved file before removing the old environment; this page cannot verify download completion.
2. On the destination, export existing saved data and finish or separately preserve all drafts. Choose the complete JSON file (up to 32 MiB). The file is read locally. Large image files may briefly pause the page during bounded validation.
3. Review the selected modules, incoming/current counts and replacement scope. Changing selection creates a fresh preview. Selected current records are replaced rather than merged; global recovery histories are retained/imported. Only selected modules are replaced. Unselected modules and provider/authentication settings stay unchanged.
4. Focus restoration is blocked while the destination has a running, paused or interrupted session. Deselect Focus or stop/reset that session using the existing timer controls, then preview again. No timer is silently stopped.
5. Choose **Replace selected saved modules** once. A fresh baseline check rejects stale previews. Current Settings drafts or pending edits block restoration. Cancel, file read failure and preview errors do not replace saved data or discard drafts.
6. Wait for the verified result. Reload is a separate action; pages are not forcibly refreshed. Preserve newly entered or other-tab drafts before using Reload. Other open pages may show revision conflicts when their saved data changes.

## Recovery and failure

Before target replacement, a pre-restore snapshot of all five modules in every workspace (including Trash), plus only the selected global libraries, is saved locally and read back. If that step fails, target data is not replaced. Only the latest complete recovery snapshot is retained; starting another confirmed restore may replace that snapshot even if the final replacement does not finish. Download an existing recovery copy before proceeding if you need to keep it. This is distinct from the history inside Tasks.

In ordinary Settings, use **Download pre-restore recovery copy**, then choose that JSON through the reviewed import flow. The limited recovery view described below cannot import files. Recovery download does not restore automatically. A final write or verification failure may leave the result uncertain: inspect saved data and the recovery copy rather than automatically retrying. The UI explicitly distinguishes that from failures known to occur before replacement.

An interrupted combined restore can leave a durable pending marker that blocks cooperating writers even after reload. Use the offered inspection and separately confirmed recovery flow; it verifies the saved prior state before repairing. Do not repeatedly import or assume reload fixes an uncertain write. This is verified staged replacement, not a guarantee of browser-crash atomicity.

### When ordinary Settings cannot load

If a pending combined restore blocks Settings initialization, the page offers a limited recovery view instead of editable defaults. Ordinary settings, workspace switching, Save and Reset stay unavailable. No automatic repair runs. The keyboard **Skip to settings** link moves focus to the recovery section.

1. Use **Download pre-restore recovery copy** or **Download both saved copies** if you want separate local files for safekeeping. These files may contain private content. A download request does not prove that the browser saved the file; check your downloads before relying on it.
2. Choose **Inspect interrupted restore**. Inspection does not restore data. **Cancel review** dismisses the review without changing saved data or drafts; it does not resolve the pending transaction or unlock ordinary settings.
3. If inspection offers **Restore verified previous state**, review its scope before choosing it. This is a separate explicit recovery action covering the affected workspaces, Trash and selected global libraries, not a merge of drafts. Keep needed drafts before proceeding. Do not automatically retry an uncertain result.
4. After a verified recovery, use **Reload saved state** to return to ordinary Settings. The limited page does not unlock its hidden form in place. File import and ordinary export remain unavailable there, including after cancelling inspection.

If no verified recovery action is offered, preserve the available copies and the reported error; do not assume that reloading repairs the pending state. This flow addresses an interrupted local transaction. It does not diagnose or resolve the earlier upgrade data-loss incident.

The JSON can contain personal notes, prompt bodies, saved excerpts, task history, complete URLs and images. Keep it private. No new network permission is required and private modules are not uploaded to cloud backups by this feature.

Files are unencrypted. Explicitly saved historical Q&A snapshots in collections retain the exact question, source excerpts and identifiers, full reviewed prompt and historical endpoint/model. These can contain private information or secrets entered in the text. Omitting attribution source URLs from a separate collection export does not remove the snapshot or historical endpoint. Review before sharing; see [historical Q&A snapshots](ai-context-workflow.md#optional-historical-questionsource-snapshot).

API-key fields and authentication headers are never saved or backed up. Connection presets (name, endpoint and model) are separate device-local preferences excluded from complete backups, manual exports, workspace copies and sync. Restore preserves destination presets and does not import or grant endpoint access. Recreate presets on the new device and separately allow access when needed. [Connection preset details](ai-model-workflow.md#device-local-connection-presets).
