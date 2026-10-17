# Date interval clear validation

## Scope — 2026-10-17

**Clear dates** / **清空日期** is a stable native button within the existing
Date interval tool. It empties both raw text drafts and clears only interval
validation, calculated result and copy feedback. Empty fields still allow this
cleanup, including stale errors or copy feedback. It retains the browsed month,
its independent year/month drafts, error and announcement, both open disclosures,
and existing focus. Normal browser pointer activation may focus the clicked
button; the handler does not call focus or change selection in the month editor.

Clearing does not parse or calculate dates, read the current device date, navigate,
write to storage, make network requests or write to the clipboard. Entering fresh
dates still requires an explicit calculation before copying. It reuses the
existing draft-edit receipt invalidation and interval rendering paths; it does
not call the session reset that closes the tool. An already-issued system write
cannot be cancelled: its feature-wide lock remains until actual Promise
settlement. Late success or failure cannot revive feedback or move focus, even
after a view or clock-owner replacement.

The new handler alone checks the original button, fields, view and ancestor
identities, exact parent relationships and ownerDocument, followed by the
existing current-owner, visibility and lifecycle guard. Hidden, inert,
aria-hidden, disabled, detached, reparented, replaced or superseded controls,
closed disclosures and hidden/departing pages cannot clear drafts. Neither date
field nor the year field may be composing. Handled, repeated, IME/key-229 and
double-click continuation activations are ignored. Fresh Enter/Space retain
native activation; guarded keydown does not itself clear. Other action buttons
may be hidden, disabled or removed without preventing a valid Clear dates action.
Existing Swap, endpoint Today and shared eligibility behavior is unchanged.

## Synthetic regression coverage

The independent `tests/month-calendar-interval-clear.test.js` uses a copy of the
existing bounded calendar fixture, the unchanged shared DOM model, and the
shipped ClockComponent/MonthCalendar source. Its 18 tests cover:

- English, Simplified Chinese and missing-key fallback; button type, focusability,
  stable identity and existing wrapping/focus-style rules.
- Valid, invalid, empty, whitespace, CR/LF and Unicode drafts; explicit traps for
  date parsing/arithmetic/navigation and any device-date access during clear.
- Independent month state, invalid year/month drafts, errors, announcement,
  disclosures and focus, including modeled non-target month-editor selection.
- Empty drafts with old invalid state, results or settled success/failure feedback.
- Handled/repeated/double-click activation, native fresh-key pass-through and all
  three composing fields; existing dashboard routing and Escape behavior.
- Hidden, folded, disabled, detached, adopted, reparented and replaced nodes,
  connected old views/owners and independence from other action buttons.
- Pending and settled clipboard success/failure; receipt invalidation, repeated
  clear, explicit recalculation, folding, view/owner replacement and manual retry.
- Stable state across ticks, locale and clock-preference changes without added
  timer, global key handler, I/O, automatic copy or focus calls.

The DOM model deliberately retains line breaks in text values to check raw-draft
cleanup. Native text inputs may sanitize line breaks during entry. Likewise,
modeled ownerDocument changes and synthetic keyboard/click events test routing
and ownership only; they do not establish native browser adoption or activation.

## Execution record

Static checks completed: both locale JSON files parse; `git diff --check` is
clean; all 1,408 CRLF line endings in `newtab.js` are preserved; manifest version
remains `1.1.155`; existing tests, assertions and shared helpers are unchanged.
No workflow, permission, schema, setting, storage, timer or package change is
included. No pre-implementation RED run was performed or claimed.

The first execution began at 2026-10-17 21:37:05 UTC. Both `newtab.js` and the new
test file passed `node --check`. The focused command was:

```sh
NODE_OPTIONS=--max-old-space-size=512 node --test --test-concurrency=1 --test-reporter=tap \
  tests/*clock*.test.js tests/month-calendar*.test.js \
  tests/dashboard-customization.test.js tests/dashboard-customization-contrast.test.js
```

All **322 tests in 18 files passed** on the first run, including all 18 new Clear
dates tests. There were 0 failures, cancellations, skips or TODOs; the observed
suite duration was 10.87 seconds and the process exited 0. The actual expanded
file list and full TAP output were retained. No pre-implementation RED run,
failure-driven repair or rerun occurred. Source and test files were frozen after
this pass; only this execution record was updated.

This is a focused regression pass, not a local full-project or scale run. Remote
CI and publication are separate stages and are not claimed here.

## Independent review

A separate first-run review passed **9/9** probes using the existing copy-test
harness and shipped initializer. These covered no device-date reads, independent
month/focus preservation, pending-copy success and failure with the unresolved
lock preserved, stale button/field references, original ancestor relationships,
cross-document controls and missing sibling action buttons. The focused command
and this independent probe command together passed **331/331** checks. The nine
probes are additional coverage, not a rerun of the 322-test command.

The separate Python regression passed **84/84**. Offline ZIP construction and
source verification both confirmed **133 runtime files**, with package SHA256
`0e22f3954d3f65e16a8285c23ce6918401e63c3c9927693d7f4e50d39877e11c`.
Manifest remains `1.1.155`; no workflow or release files changed. These checks do
not establish native browser or OS-clipboard acceptance.

## Native limits and privacy

No native Chrome or OS-clipboard run, screenshot, screen-reader test or visual
layout/zoom/contrast acceptance was performed for this change. Trusted activation,
actual held-key/IME ordering, browser focus behavior, real clipboard settlement
and native node-adoption behavior remain unverified. Historical screenshots
predate this control. All fixture dates and text are synthetic, with no personal
data or credentials. Clear dates neither reads nor writes the system clipboard;
a previously issued copy may still complete and remain/sync according to the
user's operating-system settings.
