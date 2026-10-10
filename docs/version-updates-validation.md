# Version/update validation

Implementation base: `e296eea65605627c911871c0382069e6210e4bbc` (1.1.10).
Integrated after 1.1.11 as the 1.1.12 release candidate. Native checks used the
1.1.10-based feature snapshot described below; integration changed the manifest
version and documentation only, not the feature runtime logic.

## Automated

- `node --test tests/update-checker.test.js tests/update-view.test.js tests/settings-search.test.js`: 24 passing tests.
- JavaScript syntax checks for the two new modules and `git diff --check`: pass.
- Runtime package inventory grows from 60 to 63 explicit files, adding the
  checker, view and shared stylesheet. Packaging test count is updated.
- Final integration on the 1.1.12 candidate: 909 Node tests and 49 Python tests passed.
  Syntax/JSON checks and package verification also passed before integration.

The core tests use a shared lock/storage model to cover opt-in/default network
behavior, numeric versions, unsafe metadata, body limits, timeouts, errors,
rate-limit delay, cross-tab daily checks/notices, ignore, opt-out/reset/stale
response races and configuration-backup exclusion. Three view tests execute
production UI code in the repository's DOM/event model in both catalogs:
current/latest versions and exact release links, ignore and independent preference
writes with unrelated draft identity preserved, quiet notice default/claimed/
ignored states, and cached-result retention on a failed manual check.

## Real metadata integration

A separate Node `fetch` of the exact public production endpoint returned HTTP
200, `access-control-allow-origin: *`, and parsed through production
`parseRelease` as `{tag: 'v1.1.11', version: '1.1.11'}`. Its generated URL was
`https://github.com/21888/chrome-local-itab/releases/tag/v1.1.11`; numeric comparison
to the base installed 1.1.10 returned newer. No token or account was used.
This validates real payload shape/parser behavior; it is not native Chrome
online-success evidence.

## Native cloud Chrome for Testing

Fresh isolated profile, actual unpacked extension and native mouse/keyboard
only; no injected JavaScript, remote-debugging connection, synthetic network
response, change to proxy/security settings or host-permission grant.

Observed:

- Installed 1.1.10 is displayed; permission-free getSelf selects unpacked guidance.
- The update preference is off by default. Settings-label search finds the section.
- Manual check safely times out after 10 seconds. A later attempt shows the
  connection error and makes the Check button available again.
- Visible DevTools reports the exact GET endpoint failed with
  `net::ERR_CONNECTION_REFUSED` (36 ms), not a CORS/CSP error. A direct browser
  navigation to the endpoint independently displays `ERR_CONNECTION_REFUSED`.
- Opt-in saves immediately. Opt-out remains unchecked after reload.
- A typed, uncommitted world-clock short label survives navigating to updates,
  changing the update preference and returning to Appearance. No save/remount is
  triggered by the update checkbox. The clock draft is cleared manually after
  the check; no user profile/data was involved.
- Light and dark English views, and about 632 px of page width via docked
  DevTools, are readable and wrap without horizontal clipping.
- Test browser and launcher windows were closed; pre-existing Chromium and
  Thunar windows were preserved.

Four screenshots are kept with the implementation task's native QA artifacts:
`updates-light-en.png`, `updates-dark-en.png`, `updates-dark-narrow-en.png`, and
`draft-preserved.png`. They show real native UI, not rendered test doubles.
The final small repeat-key guard, external-status refresh and dynamic-ignore
localization cleanup were verified by the focused view suite after native QA.

## Remaining native verification

A network-capable native Chrome environment should verify successful fetch,
latest version/link, ignore and automatic notice across actual tabs. Native
Chinese rendering, 320/375 px layouts, repeated key activation, and a real
store-managed install are not claimed as checked here. Model tests cover both
catalogs and install-type branches. Full end-to-end daily passage was modeled,
not observed over 24 hours. No automatic download/reload path exists to test.
