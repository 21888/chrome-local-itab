# Finder pending-result keyboard continuity

## Scope

A focused Finder result must keep keyboard navigation inside the open dialog while its existing fresh local read verifies the saved site. The existing `updatePending()` path disabled that focused result directly. In Chrome-style focus behavior, this moves `document.activeElement` to the body, so the overlay-local Escape and Tab handlers no longer receive subsequent key events. In particular, Escape cannot cancel the pending verification and close its owned blank tab.

The fix transfers focus to the query input immediately before disabling an active result. It does not move focus when the user is already in the query, match selector, category selector, or Close button. Async success/failure does not restore or reclaim focus. Matching, pagination, snapshot validation, blank-tab ownership, URLs, storage, schema, locales, styles, permissions, and dependencies are unchanged.

## Deterministic reproduction and verification

Base: `f4bb62149a879eb5062825cca620a6dd56afdc7c` (v1.1.127). Tests use only the synthetic `https://example.test/` URL and in-memory snapshots. No real tab or network request is made.

The existing Finder DOM helper now accepts the opt-in `blurUnavailableFocus` behavior already used by the task DOM helper. It simulates loss of active focus when a control is disabled or hidden. Keyboard checks dispatch to the resulting `document.activeElement`, rather than dispatching directly to a stored reference to a formerly focused control.

The new `tests/shortcut-finder-pending-focus.test.js` covers:

- English and Chinese: focus a result with ArrowDown, activate, retain focus in the query before disabling the result, and cancel through Escape. The owned blank-tab lease closes exactly once; a late read never opens the site.
- Pending Shift+Tab remains trapped; choosing another matching mode cancels the owned verification and preserves selector focus.
- Successful navigation, a stale target, a failed read, and a blocked navigation preserve newer category-selector focus.
- An activation whose current focus is elsewhere never reclaims that focus, during or after the read.
- A blocked initial popup reservation keeps normal failure feedback and query-focus recovery.
- Cancel followed by reopen: the old read cannot alter the new dialog's selector focus or open the old target.

Before the production fix, eight of these ten cases failed with the focus-loss model; the unrelated-focus and blocked-reservation controls passed. After the fix, all ten pass. This is deterministic component/model evidence. Native browser focus, real tab activation, screen readers, and operating-system IME behavior are not established by these tests and require their own checks.
