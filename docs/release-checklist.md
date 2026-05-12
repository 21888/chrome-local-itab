# Chrome Web Store release checklist

Use this before packaging a public build.

## Product

- New tab opens without console errors.
- Default install makes no external network request.
- Search only leaves the page after submit or direct URL open.
- Online wallpaper and favicon fetching stay opt-in.
- Imported or synced online feature flags are not used at runtime when the current device has not granted the matching optional host permission.
- Empty shortcuts, invalid custom search URL, failed favicon fetch, import errors, and sync quota errors show actionable messages.

## Permissions

- `storage` is required for local settings and shortcuts.
- `unlimitedStorage` is required for local image/icon data.
- Optional host permissions are limited to Google favicon lookup and Paugram wallpaper API.
- Any new host permission must be reflected in README and the store privacy text.

## Store assets

- 128px icon from `assets/icon128.png`.
- At least five screenshots showing dashboard, shortcuts, settings, privacy controls, and sync/data controls.
- Short description should mention offline-first and customizable new tab behavior.
- Long description should mention opt-in network features and local storage clearly.

## Verification

- Run `node --check` for JS files.
- Parse `manifest.json` and all `_locales/*/messages.json`.
- Run `git diff --check`.
- Reload the unpacked extension from `chrome://extensions/`.
- Test English and Chinese UI strings for overflow.
