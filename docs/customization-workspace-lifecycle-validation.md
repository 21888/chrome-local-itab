# Customize editor lifecycle and workspace round trip — 2026-10-29

## Reproduced omissions

Baseline `3ca44e4f593d1cbeccd9f63740a6408e6c515388`, tree `b3588be1d67806b572a94813e23213b3f3a74d97`.

Two new tests failed before production changes. Both mount the actual Customize and Appearance components over a captured Work Session, real Workspace Manager and StorageManager, then execute the shared content lifecycle:

1. After changing Scratchpad card width to 2 in Customize, the shared configuration reload helper returned `true` and called reload instead of deferring for that editor's unsaved preview.
2. While an actual Customize Save had reached a held backing write, the existing beforeunload handler made no warning request. The outer Appearance Controller correctly had `pending === 0`: it does not own the separate customization save.

These are model-observed lifecycle omissions, not evidence that a native browser displayed or omitted its prompt, that a real user's draft was lost, or that the historical upgrade incident has been diagnosed.

## Narrow production change

- `shared/dashboard-customization.js` registers each mounted editor opening's own state. Unsaved work includes structural differences from its opening customization, raw invalid inputs, and its pending Save. Clean opening and exact restoration of the original values are not dirty. Explicit Cancel/closing and successful Save release that opening's registration.
- `shared/local-content-lifecycle.js` reads that state through the existing `pending`, `hasUncommittedWork` and beforeunload boundaries. Automatic configuration reload defers; submitted saves remain pending for the existing wait path; unsaved customization requests the same best-effort browser warning as other local drafts.
- The lifecycle never calls Customize Save. **Save and switch** cannot silently commit or discard this preview. The existing Customize **Save** and **Cancel** remain the only decisions for it.

No new storage writer, schema, permission, provider call, template, setting, localization string or version change. Existing field/geometry CAS, immutable captured workspace, retained copies, node-moving layout renderer, modal keyboard behavior and temporary gallery-preview policy are unchanged.

## Complete-flow validation

`tests/customization-workspace-lifecycle.test.js` exercises the real Workspace-backed paths, with synthetic DOM, storage and lock transport only:

- Original reload and pending-write warning failures.
- Clean opening, restored numeric value, Reset preview and Cancel release without stale guards or writes; clean reload remains available.
- Raw invalid numeric input remains protected even when the validated preview equals its original value.
- Shared Save-and-switch preparation does not submit a Customize preview.
- Actual rejected backing write retains the draft and warning; later explicit Save succeeds only in the original workspace.
- Actual same-field concurrent save conflicts; the original draft stays guarded, Cancel shows the latest saved value, and reopening permits an explicit new edit/save.
- Cancel → explicit Save → reopen/edit/Cancel → actual workspace selection away → fresh modeled page → switch back → fresh modeled page. Exact saved card settings, original personal stores, recovery snapshot, other workspace and global values are checked. Existing module DOM nodes and their input text remain intact during the local preview steps.
- Held Save waits through actual settlement, blocks reload without a discard confirmation, then permits a workspace switch without an extra customization save. Delayed failure releases pending ownership but not draft protection.
- Another real workspace selection cannot retarget the already-open editor's Save. A trashed original workspace rejects Save and keeps the preview until explicit Cancel.
- Explicit departure permission and its cancellation preserve their existing warning contract.

Final command results:

- New complete-flow file: **13/13**, exit 0.
- Related customization/card-layout/appearance/template/layout/workspace/lifecycle group: **371/371**, exit 0. Existing temporary gallery-preview departure behavior remains covered separately and unchanged.
- Complete `node --test --test-concurrency=1 tests/*.test.js`: **17,577/17,577**, **450 test files**, zero failure/cancellation/skip/TODO, original process **exit 0**, duration 414,593.465256 ms. The original process exit is retained independently of the full terminal log.
- Python unittest discovery: **91/91**, exit 0.
- Syntax checks for **557 JavaScript files**, parsing of the manifest and both locale JSON files, `git diff --check`, and the before/after SHA256 comparison for both production files and the new test file passed.

Intermediate test-fixture issues are retained in the external evidence directory: the first candidate run exposed the small DOM model's missing `prepend` support, and the first round-trip assertion incorrectly compared a Session projection (which includes global privacy/Sync) with a workspace-only bundle. Those fixtures/assertions were corrected; no production guard or stored data was changed to satisfy them. The original two baseline red failures remain separate.

## Native and release boundary

Dispatching beforeunload here verifies only that production requests a warning and performs no I/O in that event. Chrome decides whether to show a prompt; no native prompt or installed-extension persistence is claimed. Fresh page models are not browser-process restarts or disk durability evidence. The retained textarea checks existing DOM identity/text, not native input-blur behavior or a complete mounted Scratchpad flow.

No GUI, screenshot/upload, user device, CI, paid platform, store operation or release was used. Manifest remains `1.1.160`. The existing native exact-package refusal and unresolved historical incident remain separate gates. Once an authorized native route exists, verify dirty/invalid edits, pending Save, Cancel, successful/failed Save, workspace return and actual browser reload/close behavior on the exact package without substituting synthetic events for native acceptance.
