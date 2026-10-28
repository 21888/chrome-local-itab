# Scratchpad read Retry lifecycle — 2026-10-28

## Finding and non-finding

On baseline `27f0dd3f511e26b4995e0d627849d4a7f3330940`, the actual Scratchpad Store/Controller/View, workspace Manager/Session, content lifecycle and picker were joined with a synthetic local-storage backend and delayed reads.

Two regressions failed before production code changed:

- After an initial read failure, clicking Retry twice queued two serialized reads. The first read's pending state was not exposed to the controller or Retry button.
- During that explicit recovery, the configuration lifecycle's `reload()` returned true and requested a reload. Its pending check treated the recovery as idle. The test expects the existing deferred-reload notice instead.

The complete workspace-switch test **already passed on the baseline**: `Session.withLock()` tracks the real Store read, and `Session.flush()` waits for it. This change does not claim to fix a previously demonstrated workspace-switch data-loss bug. Initial investigation's pending-state assertion failed, but absence of that flag did not prove that workspace switching skipped the read.

## Narrow implementation

Only user-initiated Retry with no existing uncommitted work (including a failed first load) enters the private owned-refresh path. It sets `pending` synchronously, so repeat activation is ignored and the existing shared configuration lifecycle waits. It continues using normal refresh reconciliation; it does **not** call Use saved, discard text or write anything.

Saved-state notifications arriving during this read are coalesced and reread before pending ends. Newly entered text is retained and becomes a conflict if the latest saved content differs. Scheduling resumes under the existing autosave, draft, error and workspace-pause rules.

Passive refresh remains passive. `hasUncommittedWork()` does not acquire read-only ownership, preserving the rule that a clean hidden note is not revealed by background errors or read recovery. The existing failed-write Retry, acknowledgement, CAS, explicit conflict resolution and Store implementation are unchanged. Card/Settings UI uses its existing disabled Retry controls; no focus callback, timer-based focus repair or new translated string is added.

## Checks

- Two real baseline negatives retained in local evidence, with the already-protected workspace case recorded separately as a pass.
- Six complete workspace-flow tests cover Stay/Save-and-switch, write failure, newer typing, initial read recovery, duplicate Retry and deferred configuration reload. The recovery switch flow visits the second workspace and returns, checks the original exact saved text, and verifies the second workspace snapshot is unchanged.
- Ten additional real Store/Controller/View/lifecycle cases cover repeated read failure and later recovery in English/Chinese Card and Settings, hidden-note privacy, pending notification drainage, newer typing/conflict, destroyed/replaced source, and passive-read behavior.
- All sixteen flow/boundary cases passed. An initial model run exposed a missing `document.body.prepend` test-fixture method on the newly reached reload-notice branch; the local fixture was completed, not the production branch bypassed.
- Final full Node run: `node --test --test-concurrency=1 tests/*.test.js` — **17,532/17,532** passing across **447 files**, zero failure/cancellation/skip/TODO, exit 0.
- Python: `python3 -m unittest discover -s tests -p '*_test.py'` — **91/91** passing, exit 0.
- Every README JavaScript syntax check, manifest/locale JSON parse and `git diff --check` passed. Runtime/test source hashes were unchanged through the full run.

These are synthetic backend and DOM-model checks, not native browser navigation, installed-package, focus/IME, accessibility, real user-data recovery or import-approval validation. No screenshots, GUI actions, CI, remote writes or publication were performed for this change. Manifest remains `1.1.160`; an offline development package is not a new GitHub Release.
