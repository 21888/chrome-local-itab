# Move to another browser or device

Keep the old installation until you have checked the restored data. Removing the extension or clearing browser data can erase its device-local content. Downloads stay wherever you save them; they are not automatically uploaded or synced.

## Before leaving the old browser

- **Configuration:** Settings → Data → Export Settings saves configuration JSON, including shortcuts, categories, layout, appearance, local images and the saved world-clock list and order. This excludes **Tasks**, **Focus timer**, **Scratchpad** and **Countdown**, including their device-only visibility/preferences. Chrome Sync, Drive backups and configuration recovery copies exclude these modules too.
- **Tasks:** In the Tasks card, open **Task data → Export tasks**. This separate JSON includes active/completed/removed tasks, the pin and previous local copies. Finish saving task edits first; the export reads saved data.
- **Scratchpad:** Choose **Export text** to save the current visible draft, including unsaved text. Keep every draft you want when different tabs conflict.
- **Countdown:** Choose **Export text**. The card exports saved values; Settings exports its current draft, which may be incomplete or invalid. Check the title and target date in the file.
- **Focus timer:** Manually note your focus/break durations and whether the card is shown. There is no dedicated export/import for preferences or timer state; an active or paused session cannot be migrated. Note other local cards' visibility too.

## In the new browser

1. Install an up-to-date Local iTab. Export any existing destination configuration first, then use **Import Settings** and review the replacement. Configuration imports do not replace the destination's personal modules. Open fresh Settings and dashboard pages after importing so you do not keep using a pre-restore page.
2. Enable Tasks if needed, then use **Task data → Import tasks** with its separate JSON. Review before replacing the destination list and pin; this is not an additive task merge. Export existing destination tasks first. [Task limits and recovery](local-tasks.en.md).
3. Enable Scratchpad, choose **Import text** and select its UTF-8 TXT file. Review the preview, export existing text if needed, then choose **Replace Scratchpad text** and wait for a confirmed save. Cancel makes no changes. [Scratchpad limits and recovery](local-scratchpad.en.md).
4. Enter the Countdown title and date manually in Settings, choose its visibility, and save. Its text file is not an automatic import format. Correct incomplete/invalid drafts before saving. [Countdown details](local-countdown.en.md).
5. Set Focus durations and local card visibility manually; start a new timer when ready.

The month calendar uses the current device's date and does not store the browsed month; it needs no separate migration.

Check the new browser's configuration, tasks, notes and countdown before removing the old installation or any backup files. Keep exported files private: they can contain personal text and saved URLs.
