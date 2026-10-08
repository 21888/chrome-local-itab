# Development progress

Small, local-first improvements are kept in separate commits. No new network services or permissions are added.

## Baseline · 2026-10-08

- Starting revision: `1796b92`.
- Vanilla JavaScript / Manifest V3; no package installation or build step required.
- Passed all three existing Node suites, JavaScript syntax checks, and manifest/locale JSON parsing.
- Unpacked-extension browser checks are pending: this environment cannot launch the isolated Chromium process or open the extension-manager page. DOM-model tests are not a substitute for browser/assistive-technology verification.

## Shortcut dialog keyboard and dismissal safety · 2026-10-08

- Added named modal/alert-dialog semantics, keyboard focus containment, background inertness, Escape dismissal, and focus return on dismissal.
- Delete confirmation initially focuses Cancel. Closing and reopening a confirmation cannot leave an old timeout that removes the new dialog; repeated old clicks cannot delete twice.
- Added `tests/dialog-focus.test.js`, covering focus wrap in both directions, disabled/hidden controls, Escape, prior inert state, cleanup ownership, reopen, and repeated delete.
- Verification: all four Node suites, JavaScript syntax, JSON parsing, and `git diff --check` passed. Actual unpacked-extension browser verification remains pending.

## Backup import data-loss protection · 2026-10-08

- Import now rejects unrelated JSON, missing/corrupt shortcuts, malformed categories/topics, wrong nested setting types, corrupt image assets, foreign envelopes, and unsupported format/schema versions before confirmation or storage writes.
- Full replacement requires an explicit `links` array. Empty arrays remain valid; raw settings, legacy `settings` and `version/data` envelopes, and current manual/Drive snapshots remain supported. Older backups may omit newer modules.
- Restoring still preserves the current device's sync state and skips sync side effects.
- Verification: `tests/import-safety.test.js` covers invalid payloads, supported formats, valid empty backups, no input mutation, provider-state preservation, and the actual manual-import function's no-confirm/no-write failure path. All five Node suites, JavaScript syntax, JSON parsing, and whitespace checks passed.

## Preserve shortcut category after mutations · 2026-10-08

- Grid refresh now reapplies the active category before layout measures visible tiles. Deleting or reordering no longer reveals shortcuts from other categories.
- Centralized mutation filtering, removing redundant form/starter filtering; normal category changes still reflow free layout.
- Verification: `tests/category-mutations.test.js` covers delete/reorder success, rejected writes and thrown writes across Work, Social, All and empty categories; deleting the last visible shortcut; and filter-before-layout ordering. All six Node suites and static checks passed (DOM-model coverage, no browser claim).

## Guard shortcut writes across tabs · 2026-10-08

- Dashboard mutations compare the caller's shortcut snapshot with an authoritative storage read while holding one origin-wide Web Lock. Stale tabs refresh instead of resurrecting deleted items or overwriting edits.
- Local full replacement, reset, and sync application share the same short local-write lock. Existing remote work stays outside it. Ordinary settings saves no longer write an untouched shortcut snapshot.
- Conflicting edit drafts remain visible, with Save disabled until the editor is reopened so an old array index cannot edit a different shortcut. Failed starter-set transactions roll back and can be retried.
- API assumption: a supported Chrome extension page exposes `navigator.locks`; guarded shortcut saves fail safely if it is unavailable. Web Locks coordinate the same origin/storage partition ([specification](https://www.w3.org/TR/web-locks/)); no claim of cross-profile coordination is made.
- Verification: seven Node suites pass. Deterministic simulated locks hold one tab between read/write and verify that a second tab, full replacement, and reset cannot interleave. Coverage includes stale delete/reorder/starter, retry, read/write failures, corrupt stored data, valid empty lists, unsupported locks, and retained edit drafts. Actual native multi-tab/browser verification remains pending.

## Isolate pending save completion from reopened editors · 2026-10-08

- Each opened editor owns a session. A delayed save may finish after dismissal, but cannot close a newly opened editor or attach its old errors to a new draft.
- Save remains disabled across close/reopen while the earlier request is pending. The visible list is updated only after successful persistence; newer drafts remain intact on success/failure.
- Verification: eight Node suites pass. New deferred-save tests cover success/false/throw across reopen, duplicate-submit prevention, same-session retry, closed-form errors, and an older conflict shrinking the list underneath a newer draft. Static syntax/JSON/whitespace checks passed; browser verification remains pending.

## Make free-layout dragging intentional and cancellable · 2026-10-08

- A normal click or movement of at most three pixels no longer moves/saves a tile. Real drags ignore the dragged position key when resolving collisions, so returning to its own cell does not displace it.
- Pointer cancel, lost capture, category/layout change, and grid rebuild restore the exact initial inline position without saving. Cleanup owns one pointer, releases capture safely, and ignores late events.
- Modified clicks and edit/delete buttons remain ordinary actions. Competing native HTML drag is suppressed only in free-layout mode.
- Verification: nine Node suites pass. The new DOM-event-model test covers click/jitter, self-cell/collision/hidden tiles, cancellations, post-commit lost capture, repeated/foreign pointers, modifier clicks, action controls and cleanup. Browser event/rendering validation remains pending; duplicate-URL layout keys are unchanged.

## Build custom search URLs around fragments correctly · 2026-10-08

- Custom templates without `%s` now place the search query in the URL query string before `#fragment`, while preserving other query parameters and the fragment.
- An existing `q` value is replaced instead of creating duplicate query parameters. Explicit `%s` templates keep their path/query/fragment substitution behavior.
- Verification: nine Node suites pass, with expanded search regression cases for fragments, existing parameters, duplicate queries, trailing `#`, Unicode/reserved characters, empty input, explicit placeholders and non-HTTP rejection. Static checks passed; no requests are made while typing.

## Keep snapped tiles within the available grid · 2026-10-08

- Drop placement now checks the full tile rectangle against current grid dimensions after snapping, including a resize during the drag. It avoids visible neighboring tile rectangles even when the grid step is smaller than a tile.
- The nearest fitting cell is found lazily, without allocating the whole canvas. If no cell fits, the original position is retained without a write and a localized notice explains why.
- Verification: all nine Node suites pass. Expanded drag tests cover narrow grids, resize, dense overlapping cells, no-space restoration, invalid dimensions, a billion-pixel sparse canvas, and 60 small-grid comparisons against an exhaustive nearest-cell oracle. Actual browser rendering remains unverified.

## Restore large local-image backups without an arbitrary import cutoff · 2026-10-08

- Manual imports above 10 MiB now show a localized resource warning before reading the file instead of rejecting the app's own larger exports. Users can cancel before text allocation; practical limits still depend on browser memory.
- The resource warning is separate from data validation and the existing replacement confirmation. Invalid data never reaches replacement/write, and every exit clears the file input for same-file retry.
- Verification: ten Node suites pass. Actual export Blobs containing 4+4 MiB and 5+5 MiB synthetic image payloads restore exact assets, links, categories and layout while preserving the current device's sync state. Tests cover the 10 MiB boundary, both cancellation stages, malformed large files, read/write failures, no false success/reload and retries. This does not claim browser image decoding or memory-stress verification.

## Make the README Chinese-first with linked translations · 2026-10-08

- The default README is Simplified Chinese, with complete English and Spanish counterparts and reciprocal language links.
- Documentation explains actual local/cloud behavior, permissions, installation, interface-language support and reproducible checks. All three versions describe the new large-import warning and browser-memory caveat, not the removed 10 MiB rejection.
- Verification: all relative links resolve, all five original preview image URLs are preserved, and the documented ten-test/syntax/JSON/whitespace checks pass. No runtime behavior changes are included in this documentation commit.

## Keep background controls truthful when persistence fails · 2026-10-08

- Image upload/removal and background-type/color changes now check rejected or false storage results. Preview/type changes and success messages follow confirmed persistence; failures restore the preceding committed background and leave retry usable.
- Recovery uses a strict background read, so read failures cannot masquerade as default settings. Invalid file selections do not supersede an accepted pending operation.
- Background-only operations share a serial queue and request ownership. Superseded reads cannot write, already-started writes finish before the newer operation, and old completions cannot overwrite a newer choice or its feedback.
- Verification: eleven Node suites pass. New DOM/storage-model regressions cover false/thrown writes, file/storage reads, invalid/oversized inputs, cancellation, same-file retry, delayed read/write ownership across upload/removal/color changes, and recovery when a newer choice fails after an older write commits. General settings snapshots and cross-tab background conflict handling are unchanged; no native browser verification is claimed here.

## Add keyboard launch controls and preserve mutation focus · 2026-10-08

- Site launch and Add now use native, named buttons; edit/delete stay separate controls with site-specific names. Existing actions become visible on focus without changing the layout or chosen style.
- Grid replacement restores only owned/active grid focus after filtering. Edits return to their rebuilt control, Add returns to Add, and deletion selects the next/previous visible launcher or Add. Dismissed saves cannot pull focus from search or a newer editor.
- Native button activation is routed once; local held-Enter guards prevent repeat cascades. The launch button remains a pointer drag handle while action buttons stay excluded.
- The first native smoke confirmed single Enter/Space launch and visible action focus, but caught a visibility transition blocking initial editor focus. Observation-only diagnostics in a disposable native copy traced inherited visibility transitions through the dialog and input. Overlay and descendant transitions now list visual properties explicitly, keeping visibility synchronous without focus timers. The clean replacement passed native initial-focus and immediate-Escape checks.
- Verification: twelve Node test files and static/JSON/whitespace checks pass, including semantics, single activation, filtered/disabled controls, duplicate URLs, successful/failed save focus, old-session completion, and primary-button drag routing. Isolated native Chrome with synthetic local data verified single Enter/Space launch, visible action focus, save/delete and Grid/Free drag on the initial candidate. Clean runtime revision `905b7757` then verified Add/Edit initial title focus, immediate Escape and rapid reopen, real Add save, and confirmation Cancel focus/Escape recovery after the CSS correction. Async storage-failure focus recovery remains model-tested, not natively fault-injected.

## Add three independent workspace templates · 2026-10-08

- A / Clarity, B / Graphite and C / Folio use the real clock, search, shortcuts, categories and optional cards, with independent light/dark choices. Fresh installs use A/light; explicit legacy theme records remain preserved and older backups still load.
- Appearance-only selection is serialized, checks strict reads and save results, supports retry, and ignores stale completion/refresh. Unrelated options saves omit both appearance and untouched legacy theme, so a fresh light choice cannot turn dark from an injected default.
- B/C group actual categories only in Grid while retaining original data-index routing. Manual layouts stay flat; template/viewport changes fit displayed positions and canvas height without rewriting stored coordinates. Switching never recreates an open editor or writes a new layout baseline.
- Verification: fourteen Node files plus JS/JSON/whitespace checks and independent source review pass. Regressions cover all six preferences, legacy/backup paths, save/read failure and interleaving, unchanged nonappearance data, mixed-order groups, category emptiness, draft/pending-save ownership and manual coordinates.
- Native evidence on clean runtime `9ec2d97`: all six template/palette states render with the real imported fixture; real exports before/after the cycle match the complete data object, including 18 links and 36 saved positions. A grouped edit changes only its intended original record/title, and restoring it returns the complete export to baseline.
- Still pending at publication: completion of the 18-case target-resolution/palette capture set, targeted custom-background checks and the remaining template-specific modal/zoom checks. Existing whole-window overviews are not counted as target-resolution passes, and prototype screenshots are not production evidence. Remaining QA continues against the identical frozen runtime; any discovered fixes will be separate small commits. This is not a claim of full visual acceptance.

## Confirmed next priorities

- Complete the remaining integrated native A/B/C visual checks and address confirmed defects in separate commits.
- Add explicit Grid/Free placement selection while preserving saved layouts.
