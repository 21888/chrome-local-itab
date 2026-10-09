# Local month calendar

Open **Calendar** under the clock date to see the device's current month. **Previous** and **Next** move one month; **Today** returns to the current device date. The current day has a heavier number and outline. Dates are for viewing only: there are no events, reminders or date selection.

- The viewer starts collapsed. Closing and reopening it returns to the current month.
- While open, the month you browse stays in place across midnight, clock-preference updates and returning to the tab. The today marker follows the device's local date.
- Tab to the summary and use the browser's normal Enter/Space behavior to open it. Tab through the three navigation buttons. Escape inside the viewer closes it and returns focus to the visible summary. Hiding the clock or dashboard also closes it, without moving focus to a hidden element.
- Date names follow the clock's interface date locale. The grid always uses the Gregorian calendar, supports years 1–9999, and uses the locale's week start when the browser provides it. On older browsers without week information, English falls back to Sunday; Simplified Chinese and other/unknown locales fall back to Monday.
- This is part of the existing clock. It uses the same timer, stores nothing, adds no permissions, makes no network requests and has no separate settings or card. Turning off the clock hides it too.

On narrow screens, opening the viewer moves the clock into its own header row. The collapsed layout is unchanged. There is no calendar state to back up or sync.

See [validation scope and native checks](month-calendar-validation.md).
