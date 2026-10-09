# Chrome Web Store release checklist

Use this before packaging a public build.

## Product

- New tab opens without console errors and the core page works offline.
- With fresh local settings, online favicons remain off and the new tab does not initiate favicon or Drive requests. Test a Chrome profile with no existing enabled sync data separately from one with an existing enabled configuration, which initialization may apply automatically.
- Search input is not transmitted while typing; searches and direct URL navigation occur only after submit or an explicit open action.
- Online favicon fetching stays opt-in.
- Imported or synced online favicon flags are not used at runtime when the current device has not granted the matching optional host permission.
- Local weather, topic, and movie cards do not fetch remote feeds.
- Chrome Sync shares supported settings and shortcuts, excluding or replacing embedded background, poster, and shortcut image data. Drive snapshots include those configured local images, but not the separate favicon cache.
- Drive requires Google authorization. Verify connect, list/refresh, upload, download, restore, delete, and old-snapshot cleanup against the documented network behavior.
- Drive snapshots contain the documented configuration and device/snapshot metadata, with Chrome Sync state replaced by disabled defaults. There is no scheduled automatic Drive backup; a confirmed restore first attempts a safety upload and asks whether to proceed if that fails.
- Test duplicate-URL independent placement, edit/reorder/delete/reload, schema-2 manual/Drive roundtrips, legacy restore recovery, and visible mixed-version Sync blocking. Update other devices before enabling identity-bearing Sync; see [layout identity compatibility](layout-identities.md). Exercise explicit replacement/cancel and recovery-download paths with synthetic data.
- Empty shortcuts, invalid custom search URL, failed favicon fetch, import errors, and sync quota errors show actionable messages.

## Permissions

- `storage` is declared for local settings, shortcuts, and optional Chrome Sync.
- `unlimitedStorage` is declared for local image/icon data.
- `identity` is declared for authorization used by the optional Google Drive feature.
- `https://www.googleapis.com/*` is a declared host permission for Google Drive API requests, and `https://www.googleapis.com/auth/drive.appdata` is the declared OAuth scope for the app's backup data.
- `https://www.google.com/*` is the optional host permission for Google favicon lookup, requested when the feature is enabled on the current device.
- Compare these declarations with [manifest.json](../manifest.json). Do not describe Identity/API permissions as optional manifest permissions merely because using Drive is optional.
- Any permission or data-flow change must be reflected in README, the [privacy summary](privacy-summary.md), and the [store privacy policy](../store-assets/privacy-policy.md).

## Store assets

- 128px icon from `assets/icon128.png`.
- At least five screenshots showing dashboard, shortcuts, settings, privacy controls, and sync/data controls.
- Short description should mention offline-first and customizable new tab behavior.
- Long description should mention opt-in network features and local storage clearly, including the settings, local images, and metadata sent by optional Drive backups.

## Verification

- Run `node --test tests/*.test.js` and `python3 -m unittest discover -s tests -p '*_test.py'` from the repository root (Python 3.10+).
- Run `node --check` for JS files.
- Parse `manifest.json` and all `_locales/*/messages.json`.
- Run `git diff --check`.
- Generate a fresh runtime ZIP with `python3 tools/package_extension.py`, then run `python3 tools/package_extension.py --verify dist/local-itab-1.1.5.zip`. Existing outputs are never overwritten; use a new `--output` path when needed and verify that path. See the [packaging instructions](../README.en.md#build-and-verify-an-extension-zip).
- Record the reported source revision and ZIP SHA256. Keep `release/*.zip` as historical artifacts; do not upload them as the current build. Review the manifest version against the store listing before an actual upload; the packaging tool neither changes the version nor publishes.
- Extract that exact verified ZIP into a separate directory and load or reload that directory from `chrome://extensions/`. Complete the product checks above against this packaged output; static packaging verification is not browser testing.
- Test English and Chinese UI strings for overflow.
