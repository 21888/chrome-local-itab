# Local Focus Timer validation

Validated 2026-10-09. This feature is a local, shared-device timer with visible completion, not a background notification service.

## Source and automated checks

The integrated candidate is based on `5ea1b8be40f33058e49333c39c06248fc42aa316`. Its complete 169-file SHA256 manifest digest is `ab96a2e5fbc414d54512bae70f17e60506bc12f7d706de498694e1d049234826`. The production integration was compared byte-for-byte with that candidate, including existing mixed line endings, before committing. This validation document is the only additional file beyond that candidate.

- `node --test tests/*.test.js`: 92 passed, zero failed or skipped (24 timer cases plus 68 prior cases).
- `node --check` on every JavaScript source/test: passed.
- Actual StorageManager and timer adapter tests use synthetic local/Sync backends. They cover reserved-key rejection, provider scheduling isolation, serialization exclusion and exact settings-reset retention, including failure and concurrent-save cases. They are not live-account tests.
- Clock models cover delayed rendering, disagreement, completion, stale revisions and state persistence. Separate review verifies recursive property-order changes do not falsely fail read-back, while altered nested values do fail.
- The DOM model reproduces native blur when a focused control becomes disabled. Successful primary actions restore focus only while ownership remains; newer focus/input, page loss, errors, detached/closed UI or changed state prevent restoration.
- Disclosure tests verify native summary structure, complete retained help, expanded-state retention and no writes from expanding/collapsing help.

## Native environment and geometry

Official Chrome for Testing 155.0.8059.39 ran with its default sandbox in the assistant's cloud Linux Xfce desktop, using native keyboard/mouse, disposable profiles and immutable runtime snapshots. No user computer, account/provider operation, injected browser script or system-clock change was involved.

V2 browser windows were 1188×848 wide and 636×848 narrow. V3 windows were 1188×848 wide and 628×848 narrow. These are native **window** dimensions, not measured web-content viewport dimensions. The original evidence screenshots are 1364×1024 desktop captures, not viewport screenshots.

## V2 full bounded native flows

V2 manifest digest: `1748bde9b8412f292ee783b437548f373d498dd2443189aafea138eb68fb3490`.

- Default off, enable into Focus 25:00 Ready, one-minute duration editing, Start/Pause/Resume and immediate Stop/reset passed.
- Held Enter started/paused once, retained visible primary focus, and a later separate Enter worked without refocusing. This directly retested a focus-loss defect found in V1.
- Hiding a running timer and returning after elapsed time showed completion without restart. Paused hide/restore/reload retained the exact remaining time.
- Native running reload continued the deadline. Two pages observed shared pause, resume and reset state.
- Real one-minute focus completion and real five-minute break completion passed. Choosing break with held Enter selected Ready without auto-start; a separate Enter started it. Completed reload stayed completed.
- An active interval survived appearance/template changes. Clarity dark and Folio light narrow cards were readable without observed timer horizontal clipping.
- A synthetic Task was added and pinned while timing continued. Finder opened, accepted a query on an empty saved-site dataset and closed with Escape. Successful-match navigation was not tested.
- Settings Reset to Defaults retained the active break and pinned Task while resetting appearance.

## V3 final compact-help retest

V3 is the final integrated candidate. Store, controller and CSS are byte-identical to V2; the view retains V2 focus handling and adds compact help with English/Chinese messages.

- Folio light wide/narrow showed a default-collapsed disclosure and the concise shared-device/no-background-alert notice.
- Native Tab focused the summary visibly; Enter expanded full timing/privacy text. Ordinary page scrolling revealed the full copy without observed clipping. Enter collapsed it again.
- Held Enter started once and retained Pause focus; separate Enter paused and resumed with visible focus preserved.
- Folio dark narrow paired Tasks/timer cards remained readable while the session continued.

V3 did **not** repeat the real-duration completion, hide/reload retention, two-page, settings-reset or Task/Finder mutation flows. Those were executed in V2. Unchanged timing-core hashes support equivalence, not a claim that the entire native suite ran again on V3.

## Explicit native coverage limits

Not executed natively: forced storage failure, controlled stale-revision races, focus movement during artificially delayed writes, clock disagreement or mutation while all pages are closed, OS suspend, Chinese locale switching, screen-reader/assistive-technology announcements, all templates/palettes/custom backgrounds, or successful-match Finder navigation. Automated/model checks must not be described as native evidence. No exact-time alert while all pages are closed is promised.
