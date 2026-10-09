# Runtime package validation — 2026-10-09

## Exact artifact

- Runtime source: `fb39d1387e2f59ace7b027ede07d73566a88e7f6` (later screenshot commit `696a6ecc7ca423579818c6e4080b04c55616d6bc` does not change runtime files).
- Manifest version: `1.1.5`; no store release or version increase is implied.
- Archive: `local-itab-task-filter.zip`, 1,020,999 bytes, 47 runtime entries.
- Runtime source bytes: 1,015,437.
- SHA-256: `429cfaba72dad719172011c414c697f2c1df9ef222c2b2984cffa4a170d33944`.
- Full checks: 204 Node regression tests and 19 Python packaging tests passed. The packaging tool verified exact canonical ZIP bytes against the source snapshot.

## Extracted-output browser smoke

The archive hash was verified before extracting into a fresh directory. No development-tree files or diagnostic scripts were copied into that directory. Official Chrome for Testing 155.0.8059.39 on cloud Linux loaded that exact unpacked directory in a disposable profile with its normal sandbox.

Actual observations:

1. A new tab displayed the styled Clarity/light dashboard, clock/date and empty shortcut state.
2. The dashboard settings control opened the styled Settings page.
3. Shortcut settings displayed the Tasks and Focus controls.
4. After enabling Tasks, a new tab displayed its local filter and ready status.

No missing-resource symptom appeared in these paths. Richer task-filter behavior was checked separately in [Tasks validation](local-tasks-validation.md). Screenshots use synthetic data; see [current interface captures](screenshots/current-features/capture-manifest.json).

## Limits and updating

This is a bounded startup smoke, not a console/network audit, execution of every dependency, an all-feature matrix, a live Sync/Drive check or native macOS/Windows validation. Rebuild and repeat checks after runtime changes; do not apply this artifact hash to a later package. The historical `release/*.zip` files are not this verified artifact.

Before updating an existing installation, export configuration and Tasks separately if used. Keep the established unpacked-extension directory when replacing its files and reload it from Chrome's extension manager; loading another directory can create a separate extension identity with separate local data. Do not uninstall the old copy before verifying the update and backups.

## Updated artifact and smoke — 2026-10-09

A later delivered archive includes Finder's page shortcut, guarded search feedback, shortcut-deletion Undo and custom-search draft preservation.

- Published runtime source: `cf1e7675371e1a8923cfd18da8517cce84417201`.
- Archive: `local-itab-current-cf1e767.zip`, 1,049,735 bytes; 47 runtime files totaling 1,044,173 uncompressed bytes.
- SHA-256: `1cba7f8781da9f9c549770bd73c287aeefd4235392dbb5d9992e6a9b650a2ce9`.
- Manifest remains 1.1.5; this is an unpacked-extension delivery, not a store submission.
- Full integrated checks: 217 Node tests and 19 Python packaging tests passed; the archive passed canonical byte verification.

After checking the archive hash, a fresh directory was extracted without adding development files. Official Chrome for Testing 155.0.8059.39 on cloud Linux loaded it in a new owned disposable profile with the normal sandbox. Actual new-tab rendering, slash Finder open/Escape close, local `=2+3*4` result 14 without navigation, and the Settings page passed. Four original desktop screenshots and per-file hashes were retained. The test window was closed normally.

This exact-artifact check covers startup and exercised dependency paths. It does not establish all-template/all-feature coverage, console/network audits, Chinese layout, live Sync, native IME, screen readers or other operating systems. Feature-specific reports retain their separate scopes. Follow the backup and same-directory update guidance above.
