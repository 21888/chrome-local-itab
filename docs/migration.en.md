# Move to another browser or device

Keep the old installation until you have checked the restored data. Removing the extension or clearing browser data can erase its device-local content. Downloads stay wherever you save them; they are not automatically uploaded or synced.

## Complete saved-data migration

For one selectable JSON containing saved configuration and personal modules, use [Complete local backup](complete-backup.en.md). Choose among seven modules: five per workspace (configuration, Tasks, Scratchpad, Countdown and Focus preferences), plus global prompts and global AI collections. The archive includes recoverable workspace Trash and saved prompt/collection versions. Review the workspace replacement scope and each selected global destination. A legacy schema-1 file requires choosing one live destination workspace. Exact collection links can remain unresolved if their prompt versions are not restored.

Finish saving first and verify the downloaded file. After a confirmed restore, reopen pages and check every workspace, Trash, old prompt versions and linked collection excerpts before removing the original installation. Unselected globals stay unchanged; the pre-restore copy contains all workspace modules plus only selected global libraries. The individual migration paths below remain available.

## Separate-export path: before leaving the old browser

- **Configuration:** Settings → Data → Export Settings saves configuration JSON, including shortcuts, categories, layout, appearance, local images and the saved world-clock list and order. This excludes **Tasks**, **Focus timer**, **Scratchpad** and **Countdown**, including their device-only visibility/preferences. It also excludes the global prompt and AI collection libraries. Chrome Sync, Drive backups and configuration recovery copies exclude these modules too.
- **Tasks:** In the Tasks card, open **Task data → Export tasks**. This separate JSON includes active/completed/removed tasks, the pin and previous local copies. Finish saving task edits first; the export reads saved data.
- **Scratchpad:** Choose **Export text** to save the current visible draft, including unsaved text. Keep every draft you want when different tabs conflict.
- **Countdown:** Choose **Export text**. The card exports saved values; Settings exports its current draft, which may be incomplete or invalid. Check the title and target date in the file.
- **Global prompts and AI collections:** Use complete backup with both global modules selected to preserve exact linked versions, or their separate reviewed JSON exports/imports. Their Markdown/text exports are readable copies, not full restoration formats.
- **Focus timer:** When using separate exports, manually note your focus/break durations and whether the card is shown. There is no dedicated export/import for preferences or timer state; an active or paused session cannot be migrated. Note other local cards' visibility too.

## Separate-export path: in the new browser

1. Install an up-to-date Local iTab. Export any existing destination configuration first, then use **Import Settings** and review the replacement. Configuration imports do not replace the destination's personal modules. Open fresh Settings and dashboard pages after importing so you do not keep using a pre-restore page.
2. Enable Tasks if needed, then use **Task data → Import tasks** with its separate JSON. Review before replacing the destination list and pin; this is not an additive task merge. Export existing destination tasks first. [Task limits and recovery](local-tasks.en.md).
3. Enable Scratchpad, choose **Import text** and select its UTF-8 TXT file. Review the preview, export existing text if needed, then choose **Replace Scratchpad text** and wait for a confirmed save. Cancel makes no changes. [Scratchpad limits and recovery](local-scratchpad.en.md).
4. Enter the Countdown title and date manually in Settings, choose its visibility, and save. Its text file is not an automatic import format. Correct incomplete/invalid drafts before saving. [Countdown details](local-countdown.en.md).
5. Set Focus durations and local card visibility manually; start a new timer when ready.

The month calendar uses the current device's date and does not store the browsed month; it needs no separate migration.

Check the new browser's configuration, tasks, notes and countdown before removing the old installation or any backup files. Keep exported files private: they can contain personal text and saved URLs.
