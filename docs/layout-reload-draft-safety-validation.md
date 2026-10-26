# Layout Reload preserves the existing draft/save boundary

## User-visible problem and bounded change

When another layout context invalidates the current layout editor, its visible
**Reload page** action previously called `location.reload()` directly. Unlike the
other configuration reload paths, it bypassed the shared content lifecycle's
pending-write check and explicit draft-discard choice. Browser `beforeunload`
may warn in some circumstances; it is not a reliable application save boundary,
and this evidence does not claim that every browser necessarily lost data.

The invalidated Layout Controller now calls the existing
`LocalItabContentLifecycle.reload()` when available. Clean pages still reload;
unsaved work displays the existing notice and requires its normal confirmation;
submitted writes cannot be discarded through the notice. This does not save,
retry, clear, or overwrite any draft, change layout write ownership, or create a
new confirmation protocol. Standalone hosts without the lifecycle retain their
previous reload fallback. Normal, non-invalidated layout retry is unchanged.

## Executed model evidence

`tests/layout-reload-drafts.test.js` mounts the real Layout controls and actual
Tasks Store/Controller/View with the actual content lifecycle. Only the DOM,
storage backend, confirmation response and location reload boundary are modeled.

On the old production implementation, the unsaved-task and submitted-task-write
cases failed (`reloads` was 1 instead of 0); the clean-page positive control
passed. A preliminary fixture run lacked a storage subscription stub and failed
before exercising the product; it is kept separately and is not product proof.

The final six cases pass:

- Unsaved task survives the layout action; cancelling the existing confirmation
  retains it, while explicit acceptance permits reload without a task write.
- An actual submitted task write blocks reload; after settlement the saved task
  remains and clean reload succeeds.
- Clean invalidated layout reloads without confirmation or writes.
- A failed submitted write retains its draft; cancelling reload then explicitly
  choosing Tasks Retry saves exactly once.
- A new pending write started after the notice is displayed is rechecked rather
  than discarded by a stale decision.
- A standalone host without content lifecycle preserves the existing fallback.

Complete related Layout, content-lifecycle and Tasks View files: **226/226**,
exit 0. `node --check shared/layout.js` and `git diff --check` pass.

## Native complete-page acceptance

A separate Chromium tab served the full new-tab runtime on loopback port 8785.
All 138 runtime files were checked against the final source. A visible fixture
control changed only the synthetic workspace bundle's layout generation and
sent the ordinary storage change notification; the real Shortcuts/Layout
controls, Tasks controller, and content lifecycle handled the subsequent flow.
The storage backend was synthetic session storage, not installed-extension
Chrome storage. External provider requests and site opening were blocked.

- An unsaved task remained after the layout **Reload page** action. The ordinary
  notice appeared; its discard confirmation was explicitly cancelled, retaining
  the same draft and page boot count.
- That task was explicitly added and survived a subsequent normal reload.
- In a second invalidated layout context, a verified synthetic gate held an
  actual Tasks write before commit. The layout action displayed the notice;
  clicking its Reload button displayed **An action is still running. Wait for it
  to finish, then reload.** No confirmation appeared, boot stayed unchanged, the
  draft remained visible, and the write remained pending.
- Releasing the gate through its visible button completed exactly one task
  write. The notice then allowed reload; both newly added records and the
  original task remained. The other three personal modules, global privacy,
  sync, Prompts, Collections, and the second workspace stayed equal to seed.
  There were four total synthetic writes: two deliberate layout-context changes
  and two explicit task additions. No site was opened.

The first attempted gate-arm mouse click did not activate its fixture button:
logging above the controls shifted its position. That attempt is counted only
as a successful ordinary save/reload, not pending-write evidence. The subsequent
run verified `armed` and `pending` before testing the protected path; keyboard
activation released the shifted fixture control. A confirmation-producing click
also timed out at the automation boundary; the already-open confirm was read
and cancelled without repeating the action. Neither observation required a
production change or weakening a guard.

The owned browser tab, server and terminal tab were closed; the original
Options/new-tab approval context was not touched. Screenshots were inspected
locally only. Local logs and synthetic fixture are not shipped. This is not
installed-extension upgrade, real storage failure, or original import approval
validation.

Final fixed-source validation: **17,243/17,243 Node tests across 437 files**,
exit 0, followed by **91/91 Python tests**, exit 0. Production and new test
SHA-256 snapshots matched before/after the run. The separate later Prompt to
Collection journey experiment is not part of these counts or this change.
