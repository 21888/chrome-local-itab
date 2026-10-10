# Document language metadata validation

Verified on 2026-10-10 in Chrome for Testing 155 on Linux.

The document language now follows the extension catalog selected by Chrome: Chinese uses `zh-CN`; English and unsupported-locale fallback use `en`. This corrects metadata on both New Tab and Settings without changing stored settings or requesting additional permissions.

## Verification

- Ten Node tests cover supported catalogs, fallback and missing APIs, scoped roots, repeated localization, text attributes and both production pages.
- Full candidate suite: 851 Node tests and 19 packaging Python tests passed before integration with the release tooling.
- Native browser verification used fresh Chinese, English and French profiles. After reloading New Tab and Settings, all six page/catalog combinations showed the expected root language in the visible Elements panel.
- Native candidate was based on f535db9 with the language fix, before the release-only manifest version changes. Runtime copies were checked byte-for-byte.

## Limits

This verifies document metadata and rendered catalog content, not actual screen-reader pronunciation. Fresh English/French profiles still have Chinese default category names; that separate pre-existing localization issue is not resolved by this change.
