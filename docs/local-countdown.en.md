# Offline Countdown

Use Settings → Search & cards → Countdown to name one milestone and enter a target date in YYYY-MM-DD format. The date must be a real Gregorian calendar date between 0001-01-01 and 9999-12-31. Titles support up to 80 Unicode characters. Enable Show Countdown, then choose Save. Cancel reloads the latest saved version; it asks before discarding an edited draft.

The optional card is hidden by default. It shows days left, Today, or days ago relative to this device’s local calendar date. It compares calendar dates, not elapsed 24-hour periods, so daylight-saving changes do not shift the count. It refreshes on focus/visibility changes and at most one minute after a midnight passes while the card remains visible. There are no hours, recurrence, notifications, location requests or network services.

Hide keeps the saved title and date. Use Settings to show it again. Edit opens the Countdown settings; Save updates other open pages. Unsaved Settings changes do not appear on the card until saved.

Countdown is saved separately in this browser profile on this device. It is excluded from configuration JSON exports, Chrome Sync, Google Drive backups and configuration recovery snapshots. Settings reset/import/restore preserve the countdown. Removing the extension or clearing browser data can erase it.

Export text downloads the title and date as a plain-text file. Export from the card uses the saved values; export from Settings uses the current draft, including incomplete dates or a title too long to save. Recovery exports are bounded to 32,000 Unicode characters and 128 KiB. Complete exports can be reviewed with Import text and applied to the draft; Save remains a separate step. Incomplete recovery exports remain useful as a manual reference.

If another page saves while you are editing, your draft stays visible and the latest saved values appear for comparison. Load saved discards your draft after confirmation. Replace with my draft asks before replacing the displayed saved version; another intervening save still causes a conflict. An uncertain save is not treated as confirmed until Retry checks storage. Keep a text copy before leaving if a save cannot be verified. Corrupt or unreadable stored records are never silently replaced with defaults.

## Import an exported TXT into the draft

In Countdown settings, choose **Import text**, select a local UTF-8 `.txt`, and review the literal title and date. **Use title and date in draft** replaces only those fields in the current draft. It does not save, change visibility, or write storage; choose the existing **Save** separately. Cancel, Escape, or cancelling the file chooser leaves the draft unchanged. No file is uploaded.

The supported format is the existing exporter: title, newline, ISO calendar date, final newline. The last content line is the date; earlier newlines belong to the title. One leading BOM is treated as a UTF-8 transport marker, and CRLF line endings become LF. Bare CR, other controls, malformed UTF-8, unpaired surrogates, missing title/date/final newline, and impossible dates are rejected. Input is bounded before reading at 128 KiB and after decoding at 32,000 Unicode characters. Dates range from `0001-01-01` to `9999-12-31`.

Recovery exports can contain unfinished text. An incomplete or invalid date cannot be imported. A complete multiline or overlong title can be reviewed and brought into the draft without truncation, but existing Save rules still require a single-line title of up to 80 characters. The editor uses a textarea so recovery lines remain visible and editable. HTML-looking text remains plain text.

A newer edit, IME composition, save, saved-state refresh/conflict, read failure, page departure, or destroyed editor invalidates the review and any pending file read. Choose the file again to review it against the current draft. The same file may be selected again after a read failure.
