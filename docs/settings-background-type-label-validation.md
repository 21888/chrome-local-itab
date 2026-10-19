# Background Type label association

2026-10-19, baseline fad1b574e64c69ce076272ac1b1b43dc0aafbde8.

The visible Background Type label lacked an association with the existing
bg-type select. Earlier actual cloud Chromium accessibility inspection showed
its value without a name. The only production change is for="bg-type" on that
label. Options, localization, styles, settings logic and storage are unchanged.

Two new English/Chinese tests read the real HTML and execute the real i18n
helper. They fail on the baseline's missing association and pass on the fix,
checking the unique ID, original option values/order, label visibility and
retention of selection and focus through repeated localization. The combined
focused run passed 27 tests; all 84 Python tests passed. Independent source
review found no blocker; the reviewer did not independently execute tests.

Candidate native label activation and screen-reader speech are not verified:
the current desktop interaction channel stalled during a separate synthetic
bookmark-file selection and subsequent read-only window query. The file action's
completion is unknown and was not replayed. These tests do not establish
installed-extension persistence or historical upgrade safety. No screenshots
were uploaded, no version changed, and no store upload or submission occurred.
