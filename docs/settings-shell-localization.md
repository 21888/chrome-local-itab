# Localize the Settings shell before storage initialization

The document title, heading, subtitle and Back label now use the existing locale catalog before the first awaited workspace/storage initialization. The first Skip link also has an English/Chinese catalog entry instead of hard-coded English. The existing ordinary post-setup localization pass remains, so dynamically prepared normal Settings controls retain their prior localization behavior.

This closes a directly observed recovery-startup gap: native cloud Chromium with synthetic interrupted-restore state rendered Chinese recovery messages beneath an English static header and navigation. Document localization formerly ran only after ordinary initialization, which the recovery early return bypasses. This is a language/accessibility improvement, not a recovery or historical data-loss fix.

The early operation changes only text/attributes and document language. It does not read storage, grant write access, change the recovery allowlist, remove inert/disabled protections, navigate, restore or download. Existing skip destinations remain the ordinary search input or the limited recovery region. Cancellation still hides the recovery choice and returns focus to Inspect.

## Coverage

The production Settings startup test uses the actual i18n helper and English/Chinese catalogs, real StorageManager and Backup View/Store, with synthetic DOM and RAM storage boundaries. It covers:

- Ordinary startup and pending-restore early return in both languages, including document language/title, header and navigation.
- Recovery inspection/cancellation and retained focus/isolation with unchanged raw storage.
- A delayed real storage read, followed by success or failure: Chinese labels are already available while ordinary form areas remain inert.
- Structural download-only recovery with translated shell and no exposed diagnostic/repair action.

Before the fix, ordinary startup localized correctly in the new tests while both recovery variants failed; after the fix all focused startup tests pass. This does not establish installed-extension upgrade behavior or screen-reader speech output.

## Native synthetic acceptance · 2026-10-20

Actual production `options.html` and its frozen 138-file runtime ran in dot cloud Chromium against synthetic interrupted-restore data and page-memory Chrome/Web Storage boundaries. The Chinese page displayed the translated title, heading, subtitle, Back and Skip labels, with document language `zh-CN`. Inspect followed by Cancel hid the recovery choice and returned focus to Inspect. Activating the translated Skip link focused the recovery region. The English page retained its English catalog title/navigation/subtitle. The fixture reported zero Chrome writes and zero blocked external/file actions throughout. No download, restore or file chooser was activated, and no screenshots were uploaded.

The owned preview tab and server were closed afterward. This is production-page rendering and input coverage with synthetic state, not an installed extension, real profile, full responsive matrix or screen-reader certification. Delayed reads, ordinary initialization and structural failures were checked by the production model tests, not all repeated natively.

Final validation: 16,916 Node tests and 84 Python tests passed; 59 focused recovery/passive-guide cases passed separately. All JavaScript syntax, manifest/locale JSON and whitespace checks passed. The 138-file runtime ZIP build/verification passed. The passive-guide regression explicitly expects early shell localization followed by initialization and the existing dynamic localization pass; its no-request/no-permission guards remain intact.
