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

## Keep an Add draft reachable after remote hiding — 2026-10-09

A different tab disabling Tasks or applying a preset previously hid a local Add draft. The text remained in memory, but its card and Retry control became inaccessible until reenabled. Effective visibility now retains nonempty Add text or that view's owned pending Add. It does not change the saved visibility preference; clearing or successfully saving the draft honors the saved hidden state. Host visibility and the dashboard container callback use the same value. Disposable filter text alone does not keep the card visible.

Seventeen focused tests cover remote and preset disable, clean/dirty state, pending success/failure/newer drafts, retries, explicit clearing, owner identity and callback agreement. Thirteen of those tests fail against the original implementation. The full integrated repository passes 258 Node tests and 19 Python packaging tests. No new settings writes, general lifecycle redesign or storage schema were added.

Bounded native Chrome for Testing 155.0.8059.39 checks on cloud Linux used English Graphite and two real tabs: A retained its unsaved Add text after B disabled Tasks; clearing it hid the card while B stayed unchecked. Reenabling restored the clean card. In a second case, A saved the retained draft with keyboard Tab/Enter while the preference was disabled; the card hid, B remained unchecked, and reenabling/reloading showed the new task beside both existing tasks. Final shared/local-tasks-view.js SHA256: `d3c0c426b08feae12d8ee616b1e4dc47d5bf84d5ddc6c9c3c272e82c94a36b54`.

Pending-write failures, workspace-preset interaction, IME and assistive-technology behavior were not newly verified natively; the applicable local cases above use models. This change does not claim that a volatile draft survives closing the browser.
