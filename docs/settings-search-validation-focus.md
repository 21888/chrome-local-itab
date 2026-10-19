# Finding an invalid custom-search URL after Save

## Actual baseline

On 2026-10-19 at 06:01–06:02 UTC, the exact production renderer from
`8932cbba` was checked in dot-cloud Chrome through the explicit synthetic
page-memory API bridge. Selecting Custom, entering
`ftp://example.test/?q=%s`, switching to Appearance and pressing Enter on Save
correctly showed the HTTP/HTTPS validation error. Focus stayed on Save while
the invalid input had zero client rectangles in the other panel. The user had
to find Search & cards manually. Returning there and correcting the value to
`https://example.test/?q=%s` saved successfully. No external search was opened.

The normal auto-save and explicit Save both reported their existing errors.
An initial `.toast` DOM query matched no nodes; the actual AX and screenshot
showed the visible messages, and the later query used `#toast-container > *`.
The test-only compatibility commit `056d6b1a` has identical runtime bytes.

## Scoped correction

Only the main Save Settings button opts into validation focus. Its submission
captures that button, the original search controls and their exact values.
Only the existing empty/invalid custom-search rejection selects this behavior.
If the same Save still owns focus and the original controls, values and visible
page remain current, the existing Search & cards tab action reveals the panel;
the URL input is focused and scrolled to the center. No form is remounted.

Auto-save, Save clocks, ordinary storage failures, conflicts and earlier
unrelated validation errors do not redirect focus. A newer focus, changed URL
or engine, replaced input, or hidden document is not reclaimed. The original
URL policy, normalization, exact draft values, error strings, save queue,
storage/CAS paths and recovery behavior are unchanged. This change does not
add an invalid attribute or claim screen-reader announcement behavior.

## Automated evidence

Thirteen new tests execute the production event, tab, validation and save
functions with the real Store over synthetic RAM Chrome storage. The unchanged
source fails five new assertions and passes eight; the candidate passes all
thirteen. English/Chinese empty and unsafe submissions reveal the original
field with zero reads/writes and all raw data unchanged. Correcting the field
saves exactly the normal search mutation once. The tests also cover ordinary
auto-save, queued newer focus/draft/engine/control/visibility changes, a real
deferred Store rejection and an earlier empty-category error.

The first test run reported only a failed test process, without individual
results. It is retained and not counted as coverage. The new test's DOM identity
assertions were changed from object comparisons to boolean identity checks;
the subsequent complete RED and GREEN runs establish the counts above.
No existing test body or helper is changed. The related Settings, category,
world-clock layout and passive-guide suite passes 459 tests; Python passes 84.
The DOM fixture models native button clicks and inactive-panel rectangles;
actual browser geometry is separate. Full exact-source CI is still required.

Independent source review and a separate 13-test run passed before rendered
verification. At 06:24–06:25 UTC, the frozen candidate's 138 runtime files
differed from baseline only in `options.js`:

- English/light: after switching to Appearance, Enter on Save with the exact
  spaced draft ` ftp://example.test/?q=%s ` selected Search & cards and focused
  `search-custom`. Its rectangle was y=353.48–405.08px in a 759px viewport; the
  full input and focus ring were visible. Correcting to the spaced HTTPS value
  displayed Settings saved and retained that exact draft.
- Chinese/dark in a 390×844 CSS-pixel iframe: switching to 外观, then Space on
  Save with an empty custom URL returned to 搜索与卡片 and focused the field at
  y=394.50–446.09px. Document scroll/client widths were both 375px. The existing
  localized required-URL message was visible above it.

These observations verify that the production tab's programmatic click does not
take focus away from Save before the subsequent input focus guard. The final
ordinary-navigation observation retained 外观 and its focus, but did not capture
an auto-save completion notice; it is not claimed as a native auto-save failure
test. Delayed failures/newer edits remain model coverage. The service was stopped
and the shared desktop released after these checks.

Screenshots stay local. The renderer fixture is not an installed extension,
durable profile, external search service or historical upgrade test.
