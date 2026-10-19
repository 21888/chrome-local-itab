# Category-management entry destination

2026-10-19. Baseline: `92ec0ccc65483fc3bcb0549ce651a61de5ba3de4`.

## Defect and correction

The dashboard's Manage Categories button tested for
`chrome.runtime.openOptionsPage`, but both branches already used the existing
workspace-aware `openSettings` helper. When that Chrome API was present, the
button omitted `category-settings` and opened generic Settings instead. Only
the fallback branch retained the intended destination.

The correction removes that irrelevant branch and always passes
`category-settings` to the existing helper. The helper still includes the
current page's workspace, opens `_blank` with `noopener`, and leaves the
dashboard in place. The ordinary Settings button remains unanchored. No
storage, schema, migration, category mutation, settings layout or URL-helper
implementation changes.

## Automated evidence

`tests/category-settings-entry.test.js` executes the actual adjacent dashboard
click bindings and the complete production workspace-view module in a DOM model.
Only the browser-opening surface is recorded; the handler and URL helper are
not reimplemented.

The unchanged baseline failed two of seven cases: the Chrome-API-present
branches for Default and an encoded synthetic workspace identity both omitted
the fragment. The other five already passed. After the fix, all seven pass:

- intended category fragment, exact workspace identity and safe open arguments,
  with and without `openOptionsPage`;
- unchanged ordinary Settings destination in both environments;
- absent category button does not break the ordinary Settings binding;
- no storage read/write/remove or generic options-API call, preserved query
  text, session identity and original source focus.

The encoded identity case tests URL transport, not real Manager identity
validation. Existing test bodies and helpers are unchanged. Related category,
workspace-view, import-navigation and settings-keyboard checks passed 163 tests.
The full Python suite passed 84 tests. Independent source review and a separate
run of the seven new tests passed. The unchanged full exact-source CI remains
the delivery gate.

## Actual cloud-browser evidence and limits

The supported static production renderer used synthetic page-memory Chrome
APIs and frozen hashes for all 138 runtime files. A preview-only addition to
the existing `window.open` blocker displayed the requested URL, target and
features in a clearly labelled DOM status. It still returned `null` and opened
no window. CSP and all navigation restrictions remained unchanged.

At a 390 × 844 CSS-pixel iframe, English/light baseline keyboard Enter on
Manage Categories visibly reported `options.html?workspace=default`, without
a fragment. Chinese/dark candidate keyboard Space on 分类管理 reported
`options.html?workspace=default#category-settings`. Enter on ordinary Settings
still reported the same unanchored URL. These are real rendered button/event
checks under an explicit navigation substitute, not native-extension opening
or popup-success tests.

The observed anchored local URL was then opened explicitly through the browser
navigation tool. Production Settings selected Search & cards and scrolled the
existing Categories section into view. At the actual 1167px content width, its
heading was at y=23.27px and the five original synthetic category names remained
visible. Document client/scroll widths were both 1167px. No category was edited
or saved. The scoped screenshot remains local.

The frozen baseline and candidate runtime maps differ only in `newtab.js`.
The preview service was stopped and shared desktop released afterward. No
installed extension, real user profile, durable storage or historical upgrade
behavior was tested; this does not resolve the historical data-loss incident.
