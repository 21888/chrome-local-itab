# Workspace preset validation and integration notes

Base: a2e81f0d0e3726fefd20b20a5eb1afb094970fc4. Isolated staging only; no publication or production edits.

## Scope

- Existing 15 visual templates now each declare immutable Tasks/Focus visibility recommendations; no added templates or modules.
- New explicit review/apply section on the settings Appearance tab. Existing immediate visual selection remains appearance-only.
- New device-local coordinator locks Tasks then Focus using their existing Web Locks, reads both directly without re-acquiring their locks, validates full snapshots, changes only enabled/revision, writes changed keys in one chrome.storage.local.set, and verifies read-back while locks remain held.
- No new storage keys, configuration schema, permissions, provider calls, timers, sample content, duration changes, or appearance writes.
- A single set is not described as a cross-store transaction guarantee. Any write/read-back failure reports unconfirmed state; there is no auto-retry/rollback. Fresh review shows actual committed state. Unchanged modules are not written.
- Task store exports its existing initial-state factory, avoiding a duplicate schema definition. It is not otherwise changed.
- Appearance refresh exposes an in-flight count; recommendations refuse unresolved appearance reads and recheck the selected template after preview and inside the locked apply predicate.
- Asynchronous focus moves are owned by the initiating control and cancelled by newer pointer/keyboard/focus/page-visibility/window-blur intent.
- Settings reload lifecycle now includes preset review/pending state while retaining latest shortcut-editor protection.
- English/Chinese UI and English/Chinese/Spanish guides, matching existing UI/documentation language boundaries.

## Automated coverage

Run `node --test tests/*.test.js` from the candidate root. Added store tests cover 15 recommendations, exact preservation of task/session/config fields, hidden running timer projection, no-op reapply, cancellation, deterministic locks, invalid/malformed state, stale snapshots after task/timer mutations, concurrent preset applications, errors before/after/partway through writes, missing locks/read failure, and export/Drive/Sync payload + settings restore/reset boundaries.

Added DOM-model tests cover separate preview/apply, exact visibility rows, Cancel/Escape, native repeat suppression, duplicate click protection, delayed cancellation, local/external template changes, conflicts/unconfirmed results, save pending controls, focus targets, destruction, lifecycle reload deferral, translations and script wiring. Additional regressions reproduce delayed external appearance refresh (including an unresolved refresh throughout attempted review/apply), changed appearance after preparation or during lock wait, and focus preservation on delayed preview, success and failure. Existing visual-only template tests remain unchanged.

DOM-model checks are not native browser QA. The parent owns independent review and Chromium validation.

## Native Chromium QA plan

1. Load this candidate unpacked into a disposable Chrome profile. Open two new tabs and Settings. Keep developer console visible for exceptions. Do not enable new network features.
2. At 1366×900 and 390×844, light/dark: verify review rows, wrapped copy/buttons, no horizontal overflow, visible focus ring, settings tab keyboard navigation, and native Enter/Space/held-key behavior.
3. In English and Chinese, preview Studio, Cancel, preview/apply Studio, then preview/apply Quiet and Clarity. Observe both module states update across tabs. Verify no task appears by itself and timer does not start by itself.
4. Seed active/done/removed/pinned tasks and prior local copies; start a timer. Use a free-positioned duplicate shortcut and saved baseline. Switch all 15 visual templates without applying workspace; verify no module visibility changes. Apply several recommendations and compare task content/recovery/receipts, timer session/deadline/durations and shortcut/free-position data before/after.
5. Hide a running timer through Clarity, wait, show it through Graphite. Remaining time should reflect elapsed wall time without a restart. Preserve normal clock-discontinuity behavior.
6. Preview, mutate task/timer in another tab, Apply: a fresh preview is required and newer data remains. Open competing reviews, apply one, then the other. Test changing template locally/remotely while preview is open and while a lock-delayed save waits.
7. With a delayed read, Cancel/Escape must close review without reopening it. During pending apply, duplicate clicks must not duplicate writes; Cancel is disabled. Check focus after success/error/cancel and background activity does not steal focus unexpectedly.
8. In a disposable profile only, simulate local write rejection/ack failure and verify unconfirmed-result notice, no automatic retry, and a fresh preview showing actual saved state.
9. Export settings and separate Tasks backup, import/reset settings, test Sync payloads using mocks or an authorized disposable account. Workspace/task/timer data must stay local, settings import/reset must preserve them, and preset review/pending saves must defer configuration-triggered reload.

## Limits

Recommendations intentionally expose only four combinations of two existing optional modules. They do not implement every legacy `recommendedModules` suggestion (for example Quote), and do not promise unique functionality for each visual template. Native extension QA and independent review are required before integration/publication. No GitHub screenshot approval action is attempted.

## Final independent and native acceptance (2026-10-09)

Independent review reproduced and fixed stale recommendations during appearance refresh and async focus stealing; final full suite passes 112 tests. Bounded native Chrome for Testing 155 acceptance on the identical final runtime passed explicit preview/apply/cancel, keyboard focus and held Enter, visual-only module preservation, task retention, a running timer hidden then restored without restarting, actual cross-tab stale-review rejection, and a 666px-wide browser window in light/dark. Captures are desktop pixels, not exact content viewport measurements.

Native acceptance did not cover injected failures, artificial latency/focus races, live Sync/Drive, unresolved external appearance refresh, screen readers, Chinese, all 15 combinations, 390px viewport, exact recovery-field comparisons, or DevTools console audit. Those automated checks remain model evidence only where present.
