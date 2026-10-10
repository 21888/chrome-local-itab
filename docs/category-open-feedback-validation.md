# Category Open all: exact confirmation and honest feedback

## Scope

This candidate is based on `13e1a8ff23b14abf0bd9864e64912e832419ff15`.
It changes only the category-opening function, its English/Chinese messages,
its model tests and this note. No permissions, storage writes, network
providers, dependencies or manifest version changes were added.

- Validate and normalize HTTP(S) URLs before confirmation. The displayed count
  is the number of opening attempts that confirmation authorizes. Duplicate
  saved destinations remain separate attempts, as before.
- Capture URL strings and the category label before confirmation. Edits to the
  saved arrays or records during the dialog do not change that batch.
- Show the category name as plain text, with readable fallbacks for All or a
  missing name. One valid address uses singular English wording.
- Empty or entirely invalid selections show a helpful notice without a
  confirmation or any opening attempt. Cancel opens nothing.
- Retain page-local ownership beginning before confirmation, at most five
  pending 120 ms opening timers, scheduler-failure invalidation/cleanup, and
  later deliberate requests. This is not a cross-page lock or a limit on
  simultaneous network loads.
- Inspect only the returned handle's `closed` flag. A null, closed, missing or
  unreadable handle is **unconfirmed**; it is not proof of popup blocking.
  An exception from `window.open` is counted separately as an opening failure.
- Emit one existing-style notification at batch completion if there are failed
  or unconfirmed attempts. It gives the affected count and advises checking
  existing tabs and popup settings, then opening missing sites individually.
  It does not retry automatically or claim destination content loaded.
  Observable open handles produce no extra success toast.
- No destination URLs or raw exceptions are logged by this path or included in
  its feedback. Category names are shown only through native confirmation or
  the existing notification's `textContent` assignment.

## Verification: 2026-10-10

In an isolated source copy:

- `node --test tests/category-open-operation.test.js`: 14 passed.
- `node --test tests/*.test.js`: 652 passed; none failed/skipped/cancelled.
- `python3 -m unittest discover -s tests -p '*_test.py'`: 19 passed.
- Repository-documented JavaScript syntax loop: passed.
- Manifest and both locale JSON parses: passed.
- Runtime-only ZIP generation and verification: passed, 60 runtime files.
  The packaging tool reports source revision unavailable because the isolated
  candidate is an archive extraction, not a Git checkout.

The category tests execute the actual page script with deterministic timers
and modeled openers. They cover mixed valid/invalid URLs, missing/null entries,
zero valid addresses, missing labels, both translations and fallback, plain
text labels, confirmation mutation, cancellation, same/different-category
reentry, timer concurrency, stale callbacks, cleanup, manual later requests,
open handles, null/closed/unreadable handles, opening throws, aggregate counts,
and absence of destination/exception logging.

After integration with the Focus duration-draft change, the full production-source suite passed 674 Node tests and 19 Python packaging tests.

Four selected new regression tests were also run against a separate extraction
of the unchanged base function. All four failed, verifying that these checks
detect the old count/snapshot/no-address/feedback behavior.

No browser was launched and no real website was opened for this candidate's
QA. These checks establish attempted calls, displayed messages and operation
ownership. They do not verify native popup permissions, rendered dialog
layout, real tab creation, destination loading or behavior on other operating
systems. Existing native smoke results in `category-open-validation.md` apply
to that earlier implementation, not this candidate.

## Bounded native confirmation check

Official Chrome for Testing 155 on cloud Linux showed “Open 2 new tabs for ‘Open QA batch’?” for a category with two valid links and a third link in a different category. Cancel dismissed the dialog and menu; the same two owned tabs and the local extension URL remained. The isolated fixture used example.invalid destinations, and none was opened. This is visible tab/navigation evidence, not a packet-level audit. Actual approval, real destination loading and partial native opener failures remain untested.
