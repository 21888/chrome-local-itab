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

## Confirmed next priorities

- Keep snapped free-layout positions within the final grid bounds.

- Correct fragment-only search templates.
