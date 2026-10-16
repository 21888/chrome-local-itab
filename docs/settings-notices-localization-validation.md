# Settings status notice localization

## Scope

Five existing Settings messages now use the English/Chinese catalog with the existing readable-English fallback:

- The DOM-ready initialization failure alert
- The denied optional online-favicon permission alert
- Reset-in-progress status
- The existing false-result reset refusal
- The generic reset-error prefix

Error details remain literal text appended after the translated prefix. `$&`, `$1`, other replacement tokens, newlines, HTML-like content and Chinese text are not substituted or interpreted as markup. The reset refusal is thrown and handled only within `resetAllSettings`; repository inspection found no external classification based on that string. Console diagnostic labels remain unchanged.

Only five message expressions change in `options.js`. Reversing those five expressions reproduces baseline `995e1fb6146c92caa97d918d041697ada0bdc8d2` byte-for-byte, including its existing mixed line endings. Initialization ordering, privacy helpers, permission requests/checks, asynchronous ownership, checkbox rollback, subsequent saves, reset confirmation, replacement transaction, storage behavior and reload guards are unchanged. No storage/controller/schema/manifest change is included.

## Focused synthetic verification

The new `tests/settings-notices-localization.test.js` runs the real DOM-ready callback, actual controls identified from `options.html`, bound button/change handlers, i18n, toast rendering, production StorageManager/workspaces and content-lifecycle reload guard. Browser storage, permission APIs, locks, DOM/events and timers are deterministic in-memory models.

Its 66 cases cover:

- English, Chinese and unsupported-language English fallback; missing, throwing, absent, key-returning and missing-helper catalogs; each individual missing message
- Initialization failure with no action binding, false success or write; ordinary read fallback retaining its existing unavailable-baseline Save guard
- Denied/rejected permission requests, exact request/check/save ordering, checkbox/hint rollback and preservation of unrelated edits
- Pending permission blocking Save, newer off-change ownership, reset fencing a late denial, and a simulated grant still requiring the original `contains` check
- Stored opt-in checking permission without requesting it or changing saved values
- Reset cancellation with unchanged confirmation and zero writes; false-return and thrown failures; literal error details; a committed fence followed by lost acknowledgment retaining existing failure meaning
- Default and non-default workspace resets preserving the sibling workspace, all four personal modules (including an active synthetic Focus session), shared preferences and protected local import evidence
- Reset clearing its configuration/clock draft while a separate private-note draft still blocks automatic reload and retains beforeunload protection

Final-test baseline run: 51 passed, 15 failed on the missing localization/catalog expectations. Candidate: 66 passed, zero failed.

Focused regression command:

```sh
node --test --test-concurrency=1 \
  tests/settings-notices-localization.test.js \
  tests/settings-stale-save.test.js \
  tests/local-content-lifecycle.test.js \
  tests/settings-transfer-localization.test.js \
  tests/workspaces-invariants.test.js
```

Result: 310 passed, zero failed. `node --check` passed for the changed Options and test scripts; both changed locale JSON files parsed successfully. The CRLF-aware whitespace check passed.

## Boundary

This is Node/model-DOM/RAM evidence, not native Chrome, browser permission UI, screen-reader, rendering or extension-reload acceptance. All data is synthetic; even simulated permission grants are stub return values. No real permission request/grant, network/provider request, personal profile, user device, paid service, screenshot, store submission or publication is involved in these checks. Full-suite and release integration are separate checks.
