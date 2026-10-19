# Skip navigation when shortcuts are disabled

## User-visible fix

The saved **Show shortcuts** preference already hides the shortcuts section.
The keyboard-only **Skip to shortcuts** link now follows that section's existing
`module-hidden` state instead of remaining a jump to an invisible target.
Enabling shortcuts and reopening the dashboard restores the original native link.

The production change is one CSS rule in `newtab.css`, limited to the body-level
skip link whose href exactly names the hidden shortcuts section. No JavaScript,
HTML, preference default, layout setting, storage protocol, migration, or existing
test/helper changed. The existing Clarity quote-only and temporary Focus rules
continue to apply independently. The project already uses `:has()` selectors.

## Evidence, 2026-10-19 UTC

Baseline: remote `6c1aa4d30ae3788df84c7604d65f3e5c7b085d13`, tree
`87ba5f73870f72dfee0c666e50d2f004ca6b7dd2`.

- Actual cloud Chrome production-renderer baseline, Chinese/light, synthetic saved
  `show.shortcuts=false`: the first Tab focused the skip link. Enter changed the
  URL fragment, but the shortcuts section had zero rendered rectangles.
- Corrected renderer, same saved preference: both link and target have zero
  rectangles; the link is absent from the accessibility tree. The first Tab goes
  to the existing category-management button instead.
- English/dark with shortcuts disabled and Clarity quote-only enabled: native
  Enter on **Show dashboard** restores the main screen and workspace-switch focus,
  while the disabled shortcuts section and its skip link remain hidden.
- A fresh English/light load with shortcuts enabled initializes the original 12
  synthetic sites. First Tab focuses the original skip link; Enter reaches its
  fragment and the rendered target, with scrollTop 159 in this viewport. The grid
  contains 13 `.shortcut-item` elements because the Add Shortcut tile is included;
  the visible heading correctly says **All shortcuts · 12**.
- Frozen baseline and candidate preview manifests contain 138 runtime files;
  only `newtab.css` differs.

## Automated and independent checks

- New test against baseline: 3 pass, 1 RED (missing CSS rule). An earlier fixture
  used `parentNode`, which this repository's DOM model does not expose; it was
  corrected to `parentElement` before retaining the meaningful RED. The initial
  fixture-error log is also retained.
- Owner focused run: 42 pass. Its command accidentally included a nonexistent
  `dashboard-show-button.test.js`; that file contributed no tests and is not
  counted as coverage. The independent run explicitly includes the actual
  `dashboard-field-writes.test.js` behavior tests.
- Independent review: 119 pass across 10 existing/new test files, including module
  visibility, localization, Clarity, temporary Focus, customization, templates,
  Show dashboard, failure/retry and focus preservation. Existing tests/helpers are
  unchanged.
- Python: 84 pass. `git diff --check`: clean. Hash comparison of 1,545 pre-existing
  tracked files finds only `newtab.css` changed.
- The four new tests lock the exact CSS condition and execute the real
  `applyModuleVisibility` function, checking its target class, original anchor,
  draft nodes/values, focus, and zero I/O. They are DOM-model/source checks, not a
  CSS engine or browser-keyboard substitute.

## Scope and limits

The browser checks use the production renderer with a separately injected local
synthetic Chrome API bridge and saved-config seeds. They do not install the
extension or exercise actual options-page saving, Chrome storage persistence,
screen-reader speech, a real user profile, or an extension upgrade. The initial
asynchronous loading interval and other ways of hiding targets are outside this
small fix. Local evidence includes the bridge, seeds, frozen hashes, AX/DOM
observations, original RED and review logs; no screenshots were uploaded.

The manifest remains 1.1.155. The unchanged full CI is required for the exact
published commit. Release and Chrome Web Store publication remain frozen pending
the separate real-upgrade data-preservation investigation.
