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

## Complete cross-component move flow (test-only follow-up)

`tests/shortcut-organizer-complete-flow.test.js` connects the actual organizer view, StorageManager, ShortcutsComponent and CategoryNavigation with synthetic storage and DOM. Both scenarios passed without finding another product defect; this follow-up changes tests/documentation only.

- Search across groups and select the second duplicate record, a Reading record and an orphan-category record; Review includes all three despite hidden matches. Back retains the query. Changing destination to Reading removes only the already-in-destination selection. Confirm moves the exact two remaining indices, preserving all other fields and records. The current Work category stays selected and its home count becomes one; choosing Reading displays the three expected cards.
- Cancel before submission writes nothing. A real pending storage write prevents Cancel/destroy, ignores repeat confirmation, and completes with exactly one write.
- Successful bulk movement intentionally retires the previous deletion Undo receipt. There is **no bulk-move Undo** promise. The test checks this existing contract rather than introducing one.

The two complete-flow tests are model integration, not additional native-browser acceptance. Grid filtering and card rendering are real; free-layout geometry is not exercised by these two tests.

Test-only follow-up validation: all five organizer files **105/105 passed**, exit 0. The earlier 17,184 full-suite count belongs to the runtime retirement commit and excludes these two newly added tests; no new aggregate result is claimed here.
