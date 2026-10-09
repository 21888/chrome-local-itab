# Empty-homepage Import Settings navigation

The empty homepage's Import Settings action opens the existing local
`options.html#import-settings-btn` destination. Settings selects Data and focuses
its existing Import Settings button after initialization. Navigation does not
click the hidden file input or import a file. Ordinary Settings and section-only
links retain their existing entry behavior.

The action uses the extension URL and the existing Tabs API, with a local
`window.open` fallback only when that API is absent. Rejected or unobservable
opening reports localized feedback through the existing error message. It never
retries automatically. Pending, double-click, held-key and composition guards
avoid duplicate activation. Stale/hidden source controls cannot open a tab;
layout/template rebuilding preserves the empty-state Import focus. Delayed
Settings focus is cancelled by newer navigation, other focused controls, changed
hashes, detached/replaced elements, or hidden/disabled destinations.

## Automated verification

`node --test tests/import-settings-navigation.test.js` runs 14 regression tests
through the actual rendered/delegated dashboard controls and actual Settings
DOMContentLoaded callback. Fixtures retain the shipped six-tab and Data/import
markup contract. Coverage includes callback, Promise and mixed API settlement,
runtime errors, uncertain results, popup failure, absent extension APIs, deferred
initialization, no automatic file picker/import/write, native-key event models,
ordinary Settings, and stale focus/rerender ownership.

The complete candidate passes 578 Node tests and 19 Python packaging tests.
JavaScript syntax checks and JSON parsing pass. These are deterministic DOM/event
models, not native browser popup, file-picker, focus-painting, IME or assistive
technology verification. No browser verification is claimed for this change.

## Native acceptance — 2026-10-09

Normal-sandbox Chrome for Testing 155.0.8059.39 on cloud Linux used a fresh owned
profile with default empty shortcuts. Both Enter and Space on the empty-state
Import Settings button opened a new Settings tab at
`options.html#import-settings-btn`, with Data active and Import visibly focused.
No native file picker opened automatically. Explicit activation of that focused
button opened the picker; Cancel and a dashboard reload preserved the default
empty data. With the test-created Settings tabs closed, the ordinary gear opened
bare `options.html` with Appearance active. An already-open Settings tab can be
reused by the normal gear, retaining that existing tab's current view.

The owned QA window was closed normally. This is bounded native UI acceptance,
not macOS/Windows, IME, rejected-window or fault-injected persistence testing.
The exact 60-file frozen runtime corresponds to canonical ZIP SHA256
`44e7df6db4fa9126957f2e7bb6a85f5c6c1f038133b5d33880f866128e1b751a`
(1,256,030 archive bytes, 1,248,768 source bytes). Integrated automated tests:
578 Node tests and 19 Python packaging tests passed.
