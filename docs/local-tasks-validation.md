# Local Tasks validation — 2026-10-08

## Automated checks

- Full repository run: `node --test tests/*.test.js` — 49 passing tests, no failures or skips. This includes the preexisting regression scripts and the integrated Tasks reset/privacy tests.
- JavaScript syntax checks and manifest/locale JSON parsing pass.
- Actual storage/configuration code under modeled Chrome storage and Web Locks verifies task-only operations do not initialize providers, schedule Sync uploads or include task/recovery sentinels in settings/Drive/Sync payloads.
- Settings reset, import and restore retain the complete task key. Independent review also covered concurrent writes, stale tasks/imports, recovery and failure handling.
- Read-back verification accepts changed object property order, while rejecting changed values, reordered arrays and invalid schema fields. The property-order test reproduced a real Chrome false-error bug before its repair.
- Page-listener and DOM models cover reload deferral during task drafts, editor/import review and pending writes; they do not claim native browser or assistive-technology coverage.

## Bounded native check

Performed using an unpacked extension in a disposable Chrome for Testing 155 profile, with synthetic task content and no live provider accounts.

Passed:

- Enable an initially empty Tasks card; add, edit, pin, complete, reopen, remove and Undo
- Persistence after reload and updates across two pages
- Separate export, import preview cancellation, reviewed replacement and recovery-copy restore
- Task text double-click does not hide the dashboard or change its visibility setting
- Visual samples: Clarity dark, Graphite dark and Folio light; repaired Folio composer at an approximately 1188 px browser window and a real approximately 764 px narrow window

Native testing found and prompted repairs for the Tasks-only parent visibility rule, object-key-order save verification, Add-label wrapping and Folio's narrow composer. Final repaired files were retested. These widths describe browser windows, not an independently measured CSS viewport.

## Not claimed

The native pass was not an exhaustive six-template/palette matrix, a Chinese-input/IME pass, an assistive-technology audit or live Chrome Sync/Google Drive testing. CN/EN strings and the remaining template/palette combinations have source/model coverage; further native appearance and accessibility checks remain useful before a public store release. Privacy/provider isolation statements above are backed by production-code models, not live account traffic.

## Local text filter — 2026-10-09

- The integrated repository passes 204 Node tests and 19 Python packaging tests. Four added actual-view regressions cover literal case-insensitive filtering across active/completed/removed tasks, no storage writes, IME events, draft and pending-retry ownership, result refresh, focus, empty states and disabled reordering while filtered. Independent review additionally checked stale commands, remove/Undo reprojection and refresh/new-view behavior.
- Bounded native Chrome for Testing checks passed in English Graphite dark and Chinese light with synthetic tasks. A matching query showed one result, a nonmatching query showed localized guidance, and keyboard Tab/Enter Clear restored the list and focus. An unsaved add draft survived filtering; reorder controls were disabled while filtering and available after clearing. Reload kept saved task text/order and the Focus session while resetting the disposable filter.
- The Chinese narrow sample used a 510 × 848 native browser window, not an independently measured CSS viewport. Filter placeholder, matching count, clear button and empty guidance were readable without overlapping. The Chinese settings quote helper was also verified after restarting the owned test profile so the latest catalog was actually loaded.
- No real IME composition, assistive-technology announcements, full 15-template matrix or live provider traffic is claimed by these checks. A synthetic 500-row DOM benchmark is not a native browser performance measurement.
