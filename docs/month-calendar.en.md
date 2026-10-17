# Local month calendar

Open **Calendar** under the clock date to see the device's current month. **Previous** and **Next** move one month; **Today** returns to the current device date. The current day has a heavier number and outline. Dates are for viewing only: there are no events, reminders or date selection.

- To view a specific month, enter a **Year**, choose a **Month**, then click **View** or press Enter in the year field. Editing either field alone does not move the calendar. Use 1–4 ASCII digits (0–9) for a year from 1 to 9999; leading zeros such as `0001` and `0099` are allowed. Empty, zero, negative, decimal, exponent and mixed-text years are rejected without truncating or removing the draft. A localized error explains what to enter.
- The viewer starts collapsed. Closing and reopening it returns to the current month and initializes the fields again. Closing or hiding the clock/dashboard clears the temporary draft and error.
- While open, the month you browse and any year/month draft stay in place across midnight, clock-preference updates, language changes and returning to the tab. The today marker follows the device's local date. Previous, Next and Today explicitly replace the draft with the newly viewed month and clear errors.
- Tab to the summary and use the browser's normal Enter/Space behavior to open it. Continue through the navigation buttons, year field, month selector and View button. A successful jump keeps focus on its invoking control and announces the viewed month. Escape from the year field or buttons closes the viewer and returns focus to the visible summary; the month selector keeps its native keys, including Escape. Enter does not submit during IME composition. A fresh Enter submits once; holding the key does not repeatedly submit. Hiding the clock or dashboard closes the viewer without moving focus to a hidden element.
- Date names follow the clock's interface date locale. The grid always uses the Gregorian calendar, supports years 1–9999, and uses the locale's week start when the browser provides it. On older browsers without week information, English falls back to Sunday; Simplified Chinese and other/unknown locales fall back to Monday.
- This is part of the existing clock. It uses the same timer, stores nothing, adds no permissions, makes no network requests and has no separate settings or card. Turning off the clock hides it too.

On narrow screens, opening the viewer moves the clock into its own header row. The collapsed layout is unchanged. There is no calendar state to back up or sync.

See [validation scope and native checks](month-calendar-validation.md).
