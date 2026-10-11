# Scratchpad text copies

Scratchpad is optional, plain text and saved only in this browser profile on this device. Settings exports, browser Sync and Drive backups exclude it. Removing the extension or clearing browser data can erase it.

**Export text** downloads the current draft, including unsaved or conflicted text. Keep each draft you need. It remains available during import preview and save recovery.

**Import text** accepts one local UTF-8 `.txt` file, at most 128 KiB and 32,000 Unicode characters. Invalid UTF-8, larger files and read failures leave saved text untouched. Whitespace, Unicode, emoji, line endings and a literal leading BOM are preserved. Text is never interpreted as HTML.

Import is available only after the visible note is loaded and settled, with no unsaved draft or conflict. Selecting a file only opens an inline preview with its filename, character count and byte count. Export a copy of the old text first if needed. **Replace Scratchpad text** replaces the entire note. Select **Keep saved text and append this file** to preview the saved note followed by the file, then confirm **Append to Scratchpad**. A single LF line break is added only when both texts are nonempty and neither adjoining edge already has CR or LF. Existing whitespace, BOMs and line endings are untouched. The preview and counts describe the complete resulting note; combined text must fit the same limits. If it is too long, nothing is saved: shorten the file or turn off append to preview replacement. Each new file selection starts in replacement mode. **Cancel** or Escape dismisses without writing. Focus starts on Cancel and returns to Import on cancellation, or to the editor after confirmed import.

Editing, IME composition, a refreshed/changed saved state, a load error or closing the card invalidates the preview. Choose the file again against the latest saved note. Both import modes use the existing revision check: another tab cannot silently be overwritten. If saving fails, the imported draft stays in the editor with Retry and Export. Resolve any conflict explicitly. “Saved on this device” requires verified storage readback.

No new storage keys, permissions, network calls, file watching or import history are used. Keep your TXT backup somewhere safe; it can contain private text.
