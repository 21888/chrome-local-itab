# Store Assets

Prepared Chrome Web Store materials for Local iTab.

## Upload Files

- Extension package: generate a fresh runtime ZIP with `python3 tools/package_extension.py`, then verify it with `python3 tools/package_extension.py --verify dist/local-itab-1.1.5.zip`. See the [packaging instructions](../README.en.md#build-and-verify-an-extension-zip). Do not upload the historical `release/local-itab-1.1.5.zip` as the current source: it is stale and lacks a referenced shared helper. Preserve historical archives. The tool does not publish or change the version; check store version requirements separately.
- Store icon: `store-assets/icon/icon128.png`
- Screenshots: `store-assets/screenshots-1280x800/*.png`
- Fallback screenshots: `store-assets/screenshots-640x400/*.png`
- Small promo tile: `store-assets/promo/small-promo-440x280.png`
- Listing copy and permission text: `store-assets/store-listing.md`
- Privacy policy draft: `store-assets/privacy-policy.md`

## Before Final Submit

- Record the source revision and ZIP SHA256 printed by the packager; extract and browser-test that exact ZIP before uploading. Static packaging verification is not browser testing.

- Publish `privacy-policy.md` to a public URL and paste that URL into the developer dashboard.
- Confirm the Chrome Web Store privacy practices form matches `store-listing.md`.
- Use `Productivity` as the initial category unless you prefer `Personalization`.
- Do not enable online favicon permissions in reviewer notes as default behavior; they are optional, user-triggered features.
