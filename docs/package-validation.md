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

## Scratchpad delivery artifact — 2026-10-09

- Published runtime source: `3f20fa9a061c6828b66f29f9856d76fbb876746d`.
- Archive: `local-itab-current-3f20fa9.zip`, 1,082,490 bytes; 51 runtime files totaling 1,076,384 uncompressed bytes.
- SHA-256: `b9090699e131f6e8dc60763211f5c3ef9b8a76e7dda8dcacc105f852db82e860`.
- Includes optional local Scratchpad, retained Add-draft visibility and DST-safe calendar-day calculation. Manifest remains 1.1.5.
- Integrated regression: 262 Node tests and 19 Python packaging tests passed; canonical byte verification passed.

The exact hash was checked and the archive extracted to a fresh directory without development additions. Official cloud Chrome for Testing 155.0.8059.39 loaded it in a new owned profile with the normal sandbox. New tab and Settings rendered; optional cards began disabled. Enabling Scratchpad and entering a 27-character multiline synthetic note reached Saved and retained the visible text after a full reload. Tasks and Focus were also enabled through the ordinary Settings controls. Seven original screenshots and per-file hashes were retained.

This establishes bounded startup and persistence for the actual artifact, not console/network audits, every feature/template, native DST transitions, IME, assistive technology or live Sync. The owned browser was reused for a separately scoped appearance sweep. No external account or security setting was changed. Keep the same installation directory and export configuration, Tasks and Scratchpad separately before replacement when those local tools are used.

## World Clocks and Settings corrections — 2026-10-09

Published snapshot `776d62f8c784140345fd0acd7957bc53d3232a14` was packaged as `local-itab-current-776d62f.zip`: 52 runtime files, 1,106,971 source bytes and 1,113,197 archive bytes; SHA256 `03fe4a17df4c8492e22b96328cd93d7b748ac42191b2ebdbd2582ca4847a8643`. The canonical packager created and verified it against a clean source checkout. Every packaged runtime file's SHA256 exactly matched the final native-tested source snapshot.

Native evidence covers world-clock save/reload, invalid/duplicate rejection, two-Settings-tab conflict, live add/remove/off/on with an unsaved Task draft retained, dark/light/narrow toast readability, and padded clock editor layout. This archive was compared to that tested runtime; it was not separately relaunched as a new ZIP smoke profile. See the [clock validation](world-clocks-validation.md), [live-refresh record](world-clocks-live-validation.md), [toast record](settings-toast-validation.md) and [editor layout](world-clock-editor-layout.md). The source suite passed 320 Node tests and 19 Python packaging tests.

The ZIP updates the same downloadable package identity. It includes World Clocks and the Settings corrections, but not the separate in-development Countdown candidate. No store submission, manifest version bump or live-provider validation is implied.

## Countdown, migration and hidden-note corrections — 2026-10-09

Published snapshot `682b515e9fc28691f1d0676c058464826f154ad2` was packaged as `local-itab-current-682b515.zip`: 56 runtime files, 1,160,252 source bytes and 1,167,014 archive bytes. SHA256: `6992426230f747ffed5aea53d791aafc94916611e9d7429124c7547693e4e72c`. Creation and source-comparison verification passed against a clean checkout. Every archive runtime hash matched the final native integration snapshot.

The integrated source passed 406 Node tests and 19 Python packaging tests. Native checks separately established Countdown date/save/conflict/hide/export behavior; full-capacity Tasks import followed by exact record/history comparison of the actual download; and ordinary Scratchpad save/hide/restore/reload with readable migration guidance in wide/narrow windows. See [Countdown](local-countdown-validation.md), [Tasks full archive](tasks-full-archive-validation.md), [hidden-note correction](scratchpad-hidden-state-validation.md) and [migration guide](migration.en.md). The passive-storage-failure privacy cases remain independently source/model tested, not native fault injection.

The current package was delivered as the existing download's updated version. Its runtime was matched to the tested unpacked snapshot rather than claiming a separate fresh-profile launch of the ZIP. All QA data were synthetic and owned test windows were closed. No store submission, manifest-version bump, new permission, live provider validation or user-computer operation was involved.
