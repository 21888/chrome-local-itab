# Offline Countdown

Use Settings → Search & cards → Countdown to name one milestone and enter a target date in YYYY-MM-DD format. The date must be a real Gregorian calendar date between 0001-01-01 and 9999-12-31. Titles support up to 80 Unicode characters. Enable Show Countdown, then choose Save. Cancel reloads the latest saved version; it asks before discarding an edited draft.

The date field also shows **Date preview (current draft)** with the exact entered ISO date and days left, Today, or days ago before saving, even while Countdown is hidden. It follows the current draft, including applied TXT imports; it is separate from the latest saved values shown during a conflict. Empty, incomplete, invalid dates and active IME composition clear the preview. The preview refreshes each visible minute and on return to the page, without saving, reloading storage, or moving focus.

The optional card is hidden by default. It shows days left, Today, or days ago relative to this device’s local calendar date. It compares calendar dates, not elapsed 24-hour periods, so daylight-saving changes do not shift the count. It refreshes on focus/visibility changes and at most one minute after a midnight passes while the card remains visible. There are no hours, recurrence, notifications, location requests or network services.

Hide keeps the saved title and date. Use Settings to show it again. Edit opens the Countdown settings; Save updates other open pages. Unsaved Settings changes do not appear on the card until saved.

## Copy the saved card

**Copy milestone** copies exactly the currently displayed saved title, one LF newline, and its saved `YYYY-MM-DD`. It adds no trailing newline, labels, day count, ID, or other metadata. **Copy date** still copies only the ten-character saved ISO date. Both actions leave Settings drafts and saved data unchanged. To make an importable TXT backup, use **Export text**, whose format includes the final newline.

The buttons use the already loaded saved snapshot, without a new storage read or write, permission query, added extension permission, clipboard read, or automatic retry. They share one in-flight clipboard write lock and copy feedback, separate from Save, recovery and export messages. If a copy fails, choose that action again or select the title/date manually. Hiding or editing the card, changing its saved state/workspace, or leaving invalidates its feedback; a system clipboard write already sent cannot be withdrawn. The operating system or other software may sync clipboard contents.

[Milestone-copy checks and native-test limits](countdown-copy-milestone-validation.md)

Countdown is saved separately in this browser profile on this device. It is excluded from configuration JSON exports, Chrome Sync, Google Drive backups and configuration recovery snapshots. Settings reset/import/restore preserve the countdown. Removing the extension or clearing browser data can erase it.

Export text downloads the title and date as a plain-text file. Export from the card uses the saved values; export from Settings uses the current draft, including incomplete dates or a title too long to save. Recovery exports are bounded to 32,000 Unicode characters and 128 KiB. Complete exports can be reviewed with Import text and applied to the draft; Save remains a separate step. Incomplete recovery exports remain useful as a manual reference.

If another page saves while you are editing, your draft stays visible and the latest saved values appear for comparison. Load saved discards your draft after confirmation. Replace with my draft asks before replacing the displayed saved version; another intervening save still causes a conflict. An uncertain save is not treated as confirmed until Retry checks storage. Keep a text copy before leaving if a save cannot be verified. Corrupt or unreadable stored records are never silently replaced with defaults.

## Fill a date using days from today

Enter **Days from today**, choose **After today** (the default) or **Before today** in **Direction from today**, then choose **Fill date**. Use a non-negative integer containing only digits `0–9`; `0` means today in either direction and leading zeros are accepted. Blank input, whitespace, signs, decimals, scientific notation, mixed text, unsafe integers, invalid directions and results outside `0001-01-01` to `9999-12-31` are rejected without changing the draft.

The calculation starts from the device’s local year, month and day **when you click**, adding or subtracting calendar days rather than fixed 24-hour periods. Repeated clicks always start from today, not from the previous target. Once filled, the target stays fixed: midnight and returning to the page refresh only the existing date preview, without recalculating the target.

Filling changes only the draft date. The title, visibility and saved state are unchanged. The day count and direction are temporary calculation parameters in this editor, not saved settings; they are excluded from exports and backups. A new editor starts with an empty count and After today. Choose **Save** separately to keep the filled date, or use the existing **Cancel** to reload the saved fields. Typing or composing the count, or changing direction, does not create an unsaved Countdown edit. Changing direction clears only the relative-date feedback.

Only an actual change of target date invalidates a reviewed TXT import or pending file read. An unchanged result, invalid count or direction, or parameter-only edit leaves that review intact. Filling is blocked during saving, IME composition, read failure, conflict, unknown save errors or editor departure. A valid result can correct the existing date-validation error. Separate fill/error feedback leaves the original Save and Retry workflow intact.

[Before/after validation scope and untested boundaries](countdown-relative-direction-validation.md); [original forward-only validation](countdown-relative-date-validation.md)

## Import an exported TXT into the draft

In Countdown settings, choose **Import text**, select a local UTF-8 `.txt`, and review the literal title and date. **Use title and date in draft** replaces only those fields in the current draft. It does not save, change visibility, or write storage; choose the existing **Save** separately. Cancel, Escape, or cancelling the file chooser leaves the draft unchanged. No file is uploaded.

The supported format is the existing exporter: title, newline, ISO calendar date, final newline. The last content line is the date; earlier newlines belong to the title. One leading BOM is treated as a UTF-8 transport marker, and CRLF line endings become LF. Bare CR, other controls, malformed UTF-8, unpaired surrogates, missing title/date/final newline, and impossible dates are rejected. Input is bounded before reading at 128 KiB and after decoding at 32,000 Unicode characters. Dates range from `0001-01-01` to `9999-12-31`.

Recovery exports can contain unfinished text. An incomplete or invalid date cannot be imported. A complete multiline or overlong title can be reviewed and brought into the draft without truncation, but existing Save rules still require a single-line title of up to 80 characters. The editor uses a textarea so recovery lines remain visible and editable. HTML-looking text remains plain text.

A newer title/date/visibility edit, title/date IME composition, save, saved-state refresh/conflict, read failure, page departure, or destroyed editor invalidates the review and any pending file read. Choose the file again to review it against the current draft. The same file may be selected again after a read failure.

To find this editor from another Settings tab, search **Days from today**, **Before today**, or **Fill date** in **Find a setting**, then open the Countdown result. The result navigates to the section without filling or saving anything.
