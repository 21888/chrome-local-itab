# Shortcut deletion and editor ownership

Deletion keeps the visible list and controller list on the same snapshot until the guarded storage write succeeds. While it is pending, a newly opened editor shows the correct site and preserves its draft, with Save disabled. A second deletion, form submission, keyboard order change or native reorder drop cannot overlap that deletion.

On success, open editors for surviving sites follow their remapped slot. An editor for the removed site retains its draft with Save blocked; close and reopen to continue. A failed write leaves surviving drafts at their original slot. An authoritative cross-tab conflict preserves the existing conflict behavior and blocks the stale draft.

No storage schema, Sync behavior, permissions, network settings or layout persistence protocol changes.

Regression check: `node tests/shortcut-delete-session.test.js` covers success (boolean and authoritative snapshot), false/throw failures, cross-tab conflicts, Add, each edit target, cancel/reopen, and overlapping submission/deletion/drag. Run `node --test tests/*.test.js` for the aggregate suite. Browser validation should additionally hold a delete write, open the still-visible B tile from A/B/C, and check B's draft on success and failure; a deleted A draft must never overwrite B.

Native acceptance (2026-10-09): official Chrome for Testing, disposable local extension profile, identical final runtime passed cancelled deletion, first/middle/last removals, surviving identical twin editing, keyboard focus reopening, reload, and manual-position retention after deletion. Delayed failures/conflicts remain deterministic model verification, not injected native tests. Independent review additionally covered 360 lifecycle and 72 modal return-focus cases. Final aggregate: 120 passing tests.
