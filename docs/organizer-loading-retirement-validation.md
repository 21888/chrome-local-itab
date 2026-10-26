# Retire an organizer while it is still preparing its read

## Reproduced failure

The organizer used one `busy` flag for both layout/read preparation and a submitted move. `destroy()` refused all busy states. Actual `ShortcutsComponent.render()` calls destroy before replacing the toolbar and mounting its next organizer; while a read was pending, that left the old modal attached to the document body. Its late result could still populate obsolete controls and claim focus over the new page.

Both a direct loading-destroy test and a test invoking the actual shortcuts render failed against the previous implementation. The new render test mounts the replacement organizer, enters a new query, then settles the old read and verifies one current modal, unchanged query and unchanged current focus. No site move is submitted in these counterexamples.

## Change and preserved contract

- Read preparation is cancellable. Destroy closes its dialog, increments its opening revision, removes its opener and retires its public open method.
- After layout flush, the original opening must still own its revision, connected host, captured storage manager, workspace/session object and id/generation, and layout controller before any snapshot read begins. The same source checks apply after the read resolves or rejects. A late flush cannot start reading a replacement manager.
- Retiring a changed source uses the existing dialog cleanup without focus restoration, so it cannot pull newer focus back to the old origin. Ordinary Cancel/Escape keep their existing focus-return behavior.
- Ordinary Cancel remains reusable: closing a loading opening does not permanently destroy the view, and a new opening can complete while the former flush settles.
- A submitted move remains non-cancellable while pending. Destroy returns false without removing its review, cancelling the write or enabling another submission. A retryable failure retains the original reviewed request and enabled retry; no new write path is introduced.

The change is confined to organizer view lifecycle ownership. Storage transactions, shortcut contents, category movement semantics, layout flush behavior, search normalization and workspace switching rules are unchanged.

## Validation

- All four organizer Node test files: **103/103 passed**.
- New cases cover loading destruction, actual render replacement, late flush resolve/reject, late read rejection, replacement storage, same-object workspace/session id or generation changes, controller replacement, rejection after a source change, Cancel/reopen, and both successful and retryable submitted-write settlement.
- One test-authoring failure used the existing resolve-only deferred helper as though it supported rejection. The tests now use a local rejection-capable helper; this was not a product regression. Original negative and fixture diagnostic logs remain local and are not committed.
- The pre-source-fence aggregate passed 17,156 tests; it is not the final-code claim. An early final-suite start was interrupted with exit 130 after the focused newer-focus regression surfaced, and is not counted as a pass. Final-code aggregate: `node --test tests/*.test.js` **17,184/17,184 passed**, exit 0 (431 files).
- Python aggregate: **91/91 passed**, exit 0.

These are synthetic DOM/event and real-method integration tests, not a forced native browser race or installed-extension upgrade test. No user data, network provider, file picker, import approval, Release or store submission is used.
