# Preserve actions made immediately after opening the calendar — 2026-10-19

## Reproduction and scope

The baseline was master `cea2260087c6fde20cb33da04e9fd1c7e10f7072`,
tree `2c3cfc6827c0fdac014bfd83b31d101b3b1c9d77`. Its exact-source CI
[39186748801](https://github.com/21888/chrome-local-itab/actions/runs/39186748801)
passed 16,592 Node tests and 84 Python tests.

Cloud Chrome loaded the production renderer in a local 390 × 844 CSS-pixel
iframe. A separately injected synthetic Chrome API bridge used page-memory
fixtures; this was not an installed extension or a real storage/upgrade test.
Starting at the closed Calendar summary, native Return, seven Tabs and Space
exposed Date interval before the main disclosure's queued `toggle` was handled.
The interval then folded again: the settled DOM showed main/interval open states
`[true, false]`. A later Space opened it normally. A preceding fast two-summary
activation also reproduced the fold, while deliberately separated actions passed.

The main opening handler always initialized the current month and cleared the
interval. Native disclosure activation makes controls usable before that queued
notification; its late reset could therefore discard actions already taken in
the new session. This is an opening-order bug, not a persistent-data-loss finding.

## Minimal change

A local listener on the current, visible Calendar summary initializes a fresh
session immediately before its native default opening action. The queued opening
notification consumes that preparation without resetting newer interval drafts,
results or requested month navigation. Native default activation is not replaced
or prevented. Close invalidates the preparation. Programmatic/coalesced openings
without valid preparation retain the existing fresh-session initialization.
A cancelled default action cannot authorize skipping that fallback.

Only `newtab.js` changed among the 138 runtime files. No storage/schema, permissions,
clipboard, stylesheet or manifest version changed. There is no new timer or global
listener. Existing close/hidden/inert/retired-source guards remain in force.

## Automated checks and independent review

The original integration test's 46,351-byte prefix and every existing helper and
assertion remain unchanged. Five tests were appended:

1. Delayed opening preserves an already-open interval, exact drafts, calculated
   +2-day result, focused end field and the existing single clock timer.
2. Delayed opening preserves an already-requested Next month and its focus.
3. Closing before notification still clears drafts and makes later opening fresh.
4. Cancelled activation cannot skip initialization of a later programmatic open.
5. Hidden, document-hidden, inert, dashboard-hidden and retired summaries cannot
   preinitialize drafts.

Against the unchanged production baseline, the first two tests failed and the
close/fresh-session test passed. The fix passed all 38 integration tests and all
327 focused clock, calendar and dashboard-customization tests. An independent
review read the production diff and all five additions and separately ran all
138 month-calendar tests successfully. All 84 Python tests passed; syntax and
`git diff --check` passed.

The event-order model controls dispatch explicitly. Its cancellation case sets
`defaultPrevented` manually because the helper has no native default-action
machinery. It is not evidence of a real browser cancelling a default action.

## Actual browser GREEN

The same native Return → seven Tabs → Space sequence left both disclosures open
(`[true, true]`) with initialized year/month. Subsequent input retained the exact
leading-zero year `0200`, dates `2024-02-28` and `2024-03-01`, and the visible
`+2 calendar days` result. A local scoped screenshot confirms the expanded tool,
result and focused end field.

After Escape, native Return → three Tabs → Space activated Next immediately.
The caption and selected month became November 2026; a later independent DOM
read still showed November and month value `10`. Escape collapsed the calendar
and returned focus to its visible summary. The browser's local date was October
18 (GMT−07) while the checks ran on October 19 UTC; neither clock nor timezone
was altered.

The baseline and candidate runtime manifests, synthetic preview inputs, native
action records, local image and failing/passing logs were preserved locally.
Their 138-file comparison differs only at `newtab.js`, candidate SHA-256
`08b5e42d5b138d19146925c8af25d9b223e2a5f45d44d1d38279e376c81d5baf`.
No screenshot was uploaded. Real extension upgrade persistence, Chrome Web Store
delivery and the unresolved historical upgrade incident are outside this result.
