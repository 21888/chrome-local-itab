# Countdown export feedback preserves recovery guidance

## Reproduced problem

On the recovered `b790eba0a1a2c2b38dfddef8e2765a361d3e529f` baseline, two new synthetic Store/Controller/SettingsView regressions failed before implementation:

1. An explicit Save failed with `WRITE`. A later text-export failure replaced the save-recovery explanation with an export error, even though the failed action and unsaved draft still needed recovery.
2. An export failure replaced `Unsaved changes`. A later successful export request did not restore the overwritten guidance.

These are newly reproduced failures, not a claim that pre-reset uncommitted tests or screenshots were recovered.

## Behavior

Countdown settings and the dashboard card now use an independent, polite export-status region. Export errors never replace the controller-owned saving, unsaved, validation, read-error, conflict, or failed-save guidance. Existing Retry, Load saved, Replace, Save and Cancel behavior is unchanged.

A successful export request clears only the preceding export error. It does **not** claim that the browser saved a file, acknowledge a failed storage write, clear unsaved work, or save the draft. File contents, filename, MIME type, download and cleanup behavior are unchanged.

An export error survives unrelated renders and dashboard calendar ticks. Editing the exported title/date, or loading a different title/date, retires that old source's error. Changing visibility alone does not: visibility is not included in the text copy. Export during composition still uses the current DOM title/date without publishing them to storage.

The new region uses existing localized export messages and theme/error styles; no permission, schema, manifest version, backend, controller or network behavior changes.

## Regression coverage

Thirteen added tests cover:

- Failed Save → failed export → successful export retry → explicit storage Retry, preserving the exact original failed action until recovery.
- Unsaved draft guidance, focus, read/write counts and generation through export failure and retry.
- Failed dashboard Hide, calendar tick, text export and explicit Retry.
- Conflict, read-error and validation guidance plus recovery-control availability in English and Chinese.
- Same-source re-render retention versus changed title/date invalidation.
- Live composition values and invalid Unicode without replacing unsaved guidance.
- Failed download activation, anchor/URL cleanup, and a later export request on settings and the card.
- A pending Save and newer unsaved edit, without an export changing which draft is committed.

Existing invalid-Unicode, oversized-export and date-preview regressions now assert the separate export region and retained unsaved guidance.

## Acceptance and limits

Final local checks passed on the changed source:

- `node --test --test-concurrency=1 tests/local-countdown*.test.js`: **480/480**, including **105** View tests and all **13** new export-feedback regressions; zero failures, exit 0.
- `node --test --test-concurrency=1 tests/*.test.js`: **17,470/17,470** across **446** test files; zero failures, cancellations, skips or TODOs, exit 0.
- `python3 -m unittest discover -s tests -p '*_test.py'`: **91/91**, exit 0.
- All JavaScript syntax checks documented in README, manifest/locale JSON parsing, and `git diff --check`: passed.

All new test titles, dates, error injections and event sequences are synthetic. DOM-model checks do not establish native browser download, screen-reader, file-picker, IME or visibility acceptance.

This recovery did not use the GUI, retry the denied `chrome://extensions` navigation, run CI, upload screenshots, publish a Release, submit to the Web Store, or access the user's device or a paid platform. The existing partial native Focus visibility gap is unrelated and remains unverified.
