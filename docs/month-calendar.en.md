# Local month calendar

Open **Calendar** under the clock date to see the device's current month. **Previous** and **Next** move one month; **Today** returns to the current device date. The current day has a heavier number and outline. Grid dates are for viewing only: there are no events, reminders or date selection.

- To view a specific month, enter a **Year**, choose a **Month**, then click **View** or press Enter in the year field. Editing either field alone does not move the calendar. Use 1–4 ASCII digits (0–9) for a year from 1 to 9999; leading zeros such as `0001` and `0099` are allowed. Empty, zero, negative, decimal, exponent and mixed-text years are rejected without truncating or removing the draft. A localized error explains what to enter.
- The viewer starts collapsed. Closing and reopening it returns to the current month and initializes the fields again. Closing or hiding the clock/dashboard clears the temporary draft and error.
- While open, the month you browse and any year/month draft stay in place across midnight, clock-preference updates, language changes and returning to the tab. The today marker follows the device's local date. Previous, Next and Today explicitly replace the draft with the newly viewed month and clear errors.
- Tab to the summary and use the browser's normal Enter/Space behavior to open it. Continue through the navigation buttons, year field, month selector and View button. A successful jump keeps focus on its invoking control and announces the viewed month. Escape from the year field or buttons closes the viewer and returns focus to the visible summary; the month selector keeps its native keys, including Escape. Enter does not submit during IME composition. A fresh Enter submits once; holding the key does not repeatedly submit. Hiding the clock or dashboard closes the viewer without moving focus to a hidden element.
- Date names follow the clock's interface date locale. The grid always uses the Gregorian calendar, supports years 1–9999, and uses the locale's week start when the browser provides it. On older browsers without week information, English falls back to Sunday; Simplified Chinese and other/unknown locales fall back to Monday.
- This is part of the existing clock. It uses the same timer, stores nothing, adds no permissions, makes no network requests and has no separate settings or card. Turning off the clock hides it too.

## Date interval

Open **Date interval** at the bottom of the calendar. Enter a **Start date** and **End date** as complete `YYYY-MM-DD` text, then click **Calculate** or press a fresh Enter in either date field. Use ASCII digits and years `0001`–`9999`, including the leading zeros. Empty, incomplete, impossible dates and surrounding whitespace stay in the fields with a local error; nothing is silently corrected.

The result shows both original dates and the signed integer **end minus start** in Gregorian calendar days. The same date is 0, the next date is +1 and the previous date is −1. Leap years, early years and reversed ranges are supported. This is date-only arithmetic, independent of time zones, DST and skipped civil dates. It is not elapsed hours, workdays or an inclusive count of both endpoints.

Editing either date immediately clears the old result. Calculating does not navigate the month. Month navigation, a year/month jump, Today, midnight, clock settings and language changes keep these separate date drafts and the result. Folding **Date interval** retains them while the main calendar stays open. Closing/reopening the main calendar or hiding the clock/dashboard clears both dates, errors and results, and folds the tool again. The extension does not save or sync these date drafts or results.

After a successful calculation, choose **Copy result** to copy the entire visible result, including both ISO dates, the sign and localized calendar-day unit. It copies only the calculated result; uncalculated or edited drafts cannot be copied this way. Copying neither recalculates nor moves focus. A separate message reports progress, success or failure. If clipboard access is unavailable or denied, the result remains selectable for manual Ctrl/Cmd+C; there is no automatic retry.

Editing or recalculating, changing the result language, folding the interval, hiding/leaving the page, closing the main calendar or replacing its view clears copy feedback. A write already sent to the system cannot be cancelled; another copy waits for that request to settle. Normal month navigation, Today, a month jump and clock ticks preserve valid feedback. Copying does not read the clipboard, request a new permission or save calendar state. The system clipboard may retain or sync copied text according to your OS settings; dates you enter may be personal information.

Each field has its own IME completion state. Composition Enter and held Enter do not calculate; a later fresh Enter does. Escape follows the calendar convention: it closes the main calendar and returns to its visible summary. Hidden, folded, detached and old controls cannot calculate or move focus. The date fields are plain text, without a native date-picker popup.

On narrow screens, opening the viewer moves the clock into its own header row. The collapsed layout is unchanged. There is no calendar state to back up or sync.

See [validation scope and native checks](month-calendar-validation.md) and [date-result copy checks](month-calendar-interval-copy-validation.md).
