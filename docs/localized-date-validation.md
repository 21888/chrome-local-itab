# Localized clock date validation

The main date line now formats its complete date with the existing catalog-first locale selection and uses the existing day/week keys as complete substituted messages. Day and ISO week calculations, clock time, quote placeholders, configuration and storage are unchanged.

Verified exact output for 9 October 2026:
- Chinese: `2026年10月9日星期五 • 第282天 • 第41周`
- Shipped English catalog: `Friday, October 9, 2026 • Day 282 • Week 41`

The regression harness loads the actual `i18n.js` and locale catalogs, emulates Chrome positional message substitution, and verifies string substitutions. It covers absent helpers, empty/key-echo/throwing message APIs, leap day, ISO year boundaries, repeated calls, input-date immutability and unchanged configuration. Existing locale-priority, clock-time, quote/storage and four-time-zone calendar tests also pass. When the catalog is unavailable and the UI locale is en-GB, native date ordering is intentionally `Friday, 9 October 2026`; no artificial US-order preservation branch is needed.

Validation on the isolated current-source snapshot:
- Initial isolated `node --test tests/*.test.js`: 495 passed, zero failures/skips
- `python3 -m unittest discover -s tests -p '*_test.py'`: 19 passed
- `node --check` for root, shared, test/helper and asset JavaScript: passed
- Manifest and all locale JSON parsing: passed
- Patch whitespace and exact apply/reconstruction checks: passed

## Narrow expanded-calendar follow-up

The first native Chinese narrow test found a dangling `第` at a line boundary:
the expanded calendar had moved the clock to its own row, but the date retained
the old 135px cap. One rule now allows `max-width: 100%` only inside the existing
≤600px, open-calendar header selector. Collapsed and wide rules, date text and
DOM remain unchanged. The original template cap remains in place for other
states. A source regression locks down this scope. Integrated verification:
496 Node tests and 19 Python packaging tests passed.

## Native acceptance — 2026-10-09

Normal-sandbox Chrome for Testing 155.0.8059.39 on cloud Linux verified the exact
Chinese and English strings above through the real Chrome message API. No
literal `$1` appeared. The Chinese month calendar remained Monday-first and
highlighted day 9. At an actual 514-pixel native outer width, the corrected
expanded Chinese and English dates each fit on one line without clipping or
overlap. Chinese collapsed → open → closed returned to the original compact
geometry. Wide rendering remained unchanged. Pointer-free Chinese light-wide
and English dark-narrow frames now supply the
[current README crops](screenshots/month-calendar/capture-metadata.json).

Both initial and final native snapshot hashes were checked. Final V2 includes
60 runtime files and matches ZIP SHA256
`a408ce5e8fb0e9b57b03ac3ab7afeaf01eadc66cc2b6d787744fb0ba896330a6`.
Owned browser windows were closed normally. Native checks were limited to
these date/calendar states, not a repetition of every earlier calendar flow,
all templates, screen readers, IME, clock changes or other operating systems.
Window dimensions are not measured CSS viewport dimensions.
