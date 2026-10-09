# Settings status-message readability

The native clock-conflict test exposed pale error text on a light template surface. Settings messages now use opaque semantic text/background pairs independent of the selected template, with explicit light/dark variants. Error contrast is 7.25:1 in light mode and 9.41:1 in dark mode. Success pairs are 7.83:1 and 9.35:1; information pairs are 9.15:1 and 10.37:1. These are computed sRGB contrast ratios for the CSS pairs, not an exhaustive accessibility certification.

Border-box sizing retains 20px horizontal viewport clearance; long text wraps and line height is 1.5. Literal text insertion, existing alert/status roles, pointer behavior and three-second dismissal are unchanged.

Eight focused tests cover all six color pairs, CSS bindings, width/wrapping and the sourced production message behavior. The integrated suite passes 319 Node tests and 19 Python packaging tests.

Native Chrome for Testing 155.0.8059.39 on cloud Linux rendered an actual stale-clock-save error in dark and light wide windows, and a light 510×848 narrow window. The complete message was readable and wrapped within the toast. Original captures 63, 65 and 66 and runtime hashes were retained. Window dimensions are not CSS viewport measurements. Screen-reader announcements, exhaustive browser zoom and all-template combinations were not verified by this check.
