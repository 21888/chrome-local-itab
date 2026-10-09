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


## Settings search, selectable calculation results and safe backup reads

Published source `f6b4c807c44614ce7fffefb7e52ce5545bed1bcc` was packaged as
`local-itab-current-f6b4c80.zip`: 57 runtime files, 1,182,821 source bytes and
1,189,709 archive bytes. SHA256:
`5d903c465ebdc9a32ad40fa40808c3f681b006b88ea10e7cee223288d7616b3a`.
The clean-checkout archive passed canonical source comparison and matched all
57 final native runtime hashes. Integrated checks passed 415 Node tests and
19 Python packaging tests.

Actual browser acceptance established cross-tab static Settings search with
retained private drafts and visible keyboard focus; literal calculator output
selection and ordinary copy/paste of `7.5` and `1e+21`; and a downloaded Settings
JSON containing the exact saved quote and world-clock preference. Read/lock
failure prevention remains injected model evidence, not real provider failure
injection. Chinese search and calculator labels received a separate native
wide/narrow check. Details are in [Settings search](settings-search-validation.md),
[calculator](local-calculator-validation.md) and
[backup reads](backup-read-safety-validation.md).

The existing downloadable package was updated and delivered. Runtime bytes were
matched to tested unpacked snapshots; the ZIP was not separately launched in a
new profile. Manifest version remains 1.1.5. This is not a store submission,
version bump, live Drive/Sync test, or native macOS/Windows acceptance.

## Portable text/bookmark backups and interaction safeguards — 2026-10-09

Published runtime source `0c0252945d4e5b7fc1b94f98ddc17e6e0fc5c021` was
packaged as `local-itab-current-0c02529.zip`: 58 runtime files, 1,201,883 source
bytes and 1,208,897 archive bytes. SHA256:
`9f68638a9fc5660e42df23e1f7622e5e63131f7750372908e2e25e086813f562`.
The clean-checkout archive passed canonical verification twice. Every runtime
entry was independently compared with the final native-tested snapshot.

This snapshot adds portable bookmark HTML export, draft world-clock sorting,
page-local duplicate category-opening protection, Tasks departure warnings and
explicit Scratchpad TXT preview/replacement. The integrated suite passed 465
Node tests and 19 Python packaging tests; Scratchpad import also passed 26
independent actual-entrypoint adversarial cases.

Native cloud Chrome for Testing 155.0.8059.39 verified actual bookmark export and
Chrome import (Chrome omitted empty folders), clock move/focus/save persistence,
six synthetic loopback tabs and deliberate retry, Tasks refresh/Stay and clean
release, and Scratchpad preview/Cancel/Replace/persistence/invalid UTF-8 handling.
A downloaded 87-byte TXT exactly matched its synthetic multilingual input.
Relevant light/dark/narrow UI states were inspected; the reports retain their
precise scope: [bookmarks](bookmark-export.md), [clocks](world-clocks-validation.md),
[category opening](category-open-validation.md),
[Tasks departure](tasks-departure-validation.md) and
[Scratchpad import](scratchpad-import-validation.md).

The ZIP itself was not separately launched in a new profile: all its runtime
bytes match the tested unpacked snapshot. Fault/race injection remains model
coverage where stated. No all-template/locale/IME/assistive-technology guarantee,
live Drive/Sync validation, native macOS/Windows acceptance or store submission
is implied. Manifest version remains 1.1.5. Preserve the existing installation
directory and make separate private-module backups before replacing files.


## Offline calendar and localized dates — 2026-10-09

This checkpoint adds the offline month calendar published at `4999964` and the
separate localized clock-date correction recorded with this section. Its
canonical runtime ZIP has 60 files, 1,216,532 source bytes and 1,223,794 archive
bytes. SHA256:
`a408ce5e8fb0e9b57b03ac3ab7afeaf01eadc66cc2b6d787744fb0ba896330a6`.
It can be identified by this content hash regardless of download filename.
Integrated verification passed 496 Node tests and 19 Python packaging tests.

The exact candidate ZIP was verified, extracted to a fresh snapshot and loaded
by normal-sandbox official Chrome for Testing 155.0.8059.39 on cloud Linux.
All 60 file hashes matched the final source. Calendar navigation, focus,
visibility and bounded template checks were performed on the preceding
calendar snapshot; the final narrow-width/localization-only follow-up checked
real Chinese/English date substitution, Chinese Monday-first display,
514px expanded-date fit, collapsed restoration and unchanged wide geometry.
See [calendar scope](month-calendar-validation.md) and
[localized date acceptance](localized-date-validation.md) for the distinct
verification stages and [exact screenshot crops](screenshots/month-calendar/capture-metadata.json).

No full rerun of every earlier feature, all-template/locale/zoom matrix, live
Sync/Drive test, screen-reader validation or native macOS/Windows acceptance is
implied. Native windows could not be reduced below 510px, so 320/400px layout
remains unverified. Manifest version stays 1.1.5; no store submission occurred.


## Current artifact: cross-tab Settings and dashboard preservation — 2026-10-09

- Published source: `7b69ce03b53adce4bab5953c60f7a386010c3437`.
- Archive: `local-itab-current-7b69ce0.zip`, 1,250,866 bytes; 60 runtime files
  totaling 1,243,604 source bytes.
- SHA-256: `b6d4f479240eea7892f67c2f9189068ac2a38f9a63ec33fbcd003d324d5ed79f`.
- Full integrated checks: 564 Node regression tests and 19 Python packaging
  tests passed. Canonical package verification passed, and all runtime entries
  match the final native-tested dashboard snapshot.
- Manifest version remains 1.1.5. Documentation-only updates do not change these
  runtime ZIP bytes; no store submission or version increase is implied.

This artifact includes guarded changed-field Settings saves and field-level
dashboard search/visibility writes. On normal-sandbox Chrome for Testing
155.0.8059.39 on cloud Linux, an older dashboard preserved a newer custom search
URL while changing engine, retained newer title/spacing/icon preferences while
hiding and showing the dashboard, and visibly rejected a stale engine change
after a full configuration restore. See the [dashboard native acceptance](dashboard-field-native-validation.md).
Earlier [Settings native acceptance](settings-save-native-validation.md)
separately checked independent-field preservation, same-field conflict/draft
retention and rejection after configuration replacement. That earlier Settings
record has its own exact snapshot and does not claim a rerun on this ZIP.

The delivered ZIP was matched byte-for-byte to the tested unpacked runtime; it
was not separately launched in a fresh profile. Injected storage failures,
queued-write ordering and custom-search conflict cases retain their stated
source/model coverage. No exhaustive feature/theme/viewport matrix, native
macOS/Windows, live Sync/Drive authentication or permission-prompt acceptance is
implied. Keep the existing installation directory and follow the
[migration checklist](migration.en.md) before replacing files or clearing data.

## Current artifact: visible More actions — 2026-10-09

This revision includes the saved-site More button and guarded existing menu.
The verified 60-file runtime contains 1,255,027 source bytes; its canonical ZIP
contains 1,262,289 bytes, SHA256
`454052fc051d97b47c51bd2cddf0d2244fa45ae68ee595e7afbe6ebbfac58ba0`.
589 Node tests and 19 Python packaging tests passed. Exact runtime hashes match
the final native smoke snapshot; broader interaction and layout checks used a
snapshot differing only in two CSS line endings, as explicitly recorded in the
[More actions acceptance](shortcut-order.md#more-actions-acceptance--2026-10-09).
No store submission or version increase is implied; manifest remains1.1.5.
