# Focus presentation on a retired workspace page

## Scope

The new-tab Focus View now pins its presentation to the timer backend's captured workspace Session. A retired Session, changed generation/identity, or replacement page Session permanently retires that View. The original Manager subscription delivers workspace retirement immediately, including while the timer is paused or the page is hidden; it does not depend on a later timer tick or manual render.

Retirement exits temporary focus mode so the workspace warning is visible again, restores the title only while Focus still owns it, replaces the stale countdown with `—:—`, and shows localized unavailable/reopen guidance. Timer actions, phase/minute edits, retry, and temporary focus entry are disabled. Restoring the workspace cannot reconnect the old View. Opening a fresh Session reads the saved timer; it does not resume it automatically.

The View does not stop, reset, refresh, or rewrite the saved timer on retirement. It keeps page-local minute drafts, pending-write protection, and the controller's error/clock-uncertainty evidence. Retired-page errors use dedicated localized wording: the previous operation is unconfirmed and saved state must be checked after reopening. They never claim the latest state is displayed or invite a retry in the disabled old page. An already submitted write can still settle according to the unchanged store/controller rules. A missing acknowledgement can still mean the value was saved. Manager/pageshow subscriptions and presentation timeouts are cleaned up on destroy; old callbacks cannot affect a replacement View.

No Focus settings switch, timer store/controller, workspace manager/session protocol, storage record, permission, manifest version, or recovery behavior changed.

## Reproduction and automated evidence

A synthetic one-minute timer runs for ten seconds in workspace B. A second real Manager moves B to Trash, saving a paused `0:50` timer in the new generation. The original Session becomes invalidated, but its old controller snapshot can still project a running `0:45` five seconds later. The baseline View showed that stale countdown, enabled Pause, updated the title, and kept the workspace warning inside the CSS-hidden temporary-focus branch. The candidate leaves the saved `0:50` unchanged and renders the old View unavailable immediately.

The new regression suite runs real Manager, Session, Focus Store/Controller/View, workspace View, and content lifecycle with synthetic storage, clocks, and a DOM/event model. It covers remote Trash, Restore, generation replacement, hidden/paused pages, unrelated workspace changes, same-id page Session replacement, retained drafts, delayed write acknowledgement, clock uncertainty, external title ownership, locales/fallback, subscription cleanup, and late callbacks after replacement.

- Baseline `e8071af482a8367113779640d76d9dfc8b6c0da9`: 12 new tests, 11 failed and 1 passed.
- Candidate: all 12 new tests passed. The retired CONFLICT/WRITE/READ guidance additionally failed against the initial presentation fix before its dedicated error message was added.
- Named related suites: 275 tests passed, no failures or skips.
- Changed JavaScript syntax, manifest/locale JSON parsing, and `git diff --check` passed.

Related command:

```sh
node --test \
  tests/local-focus-retired-workspace.test.js \
  tests/local-focus-view.test.js \
  tests/local-focus-title.test.js \
  tests/local-focus-temporary-view.test.js \
  tests/local-focus-duration-draft.test.js \
  tests/local-focus-controller.test.js \
  tests/local-focus-boundary.test.js \
  tests/local-focus-integration.test.js \
  tests/local-focus-localization.test.js \
  tests/workspace-lifecycle.test.js \
  tests/workspaces-view.test.js \
  tests/workspaces-invariants.test.js
```

This is deterministic model evidence. No browser, native accessibility, screenshot, full-suite, Python packaging, remote push, or release verification was performed for this isolated change.
