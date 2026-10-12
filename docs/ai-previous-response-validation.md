# Preserve the previous AI response — development validation

This ordinary feature retains manifest1.1.93 and is not a release. Editing the
next request preserves the previous response and its original immutable reviewed
request. A previous-request notice distinguishes it from the edited draft;
saving an answer/context snapshot uses the response's original request, not new
question/model/endpoint values. Snapshots do not include API-key fields or auth
headers. A new send still needs current review and explicit permission; replacing
an unsaved response requires explicit confirmation. Clear/dispose removes it.
Existing task/save uncertainty and busy guards remain.

The six frozen implementation files match the independently tested source
(2485 Node/64 Python,95 focused). The actual merged navigation-details plus AI
tree passed2490 Node with strict unhandled rejections and64 Python tests. Tests
cover old response provenance, request edits, tasks, replacement cancellation,
failed/stopped replacement, saved responses and uncertain-write protection.
No real provider was called in automated tests.

Native verification is pending. Synthetic transport/controller tests do not
prove native received-response flows or real-provider behavior. No automatic
persistence, history, permissions or extra network action is introduced. Formal
release requires bounded native checks and final runtime identity verification.
