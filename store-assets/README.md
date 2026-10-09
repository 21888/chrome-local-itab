# Store Assets

Prepared Chrome Web Store materials for Local iTab.

## Latest image set

Use [the 1.1.6 asset set](1.1.6/README.md) for the next image update. It contains five reviewed 1280 × 800 screenshots, the required 440 × 280 small promo, an optional 1400 × 560 marquee, editable promotional sources, optional bilingual listing text and exact capture provenance.

These files are prepared, not uploaded. As recorded on 2026-10-09, the 1.1.6 review was withdrawn (`CANCELLED`). Follow the [Chinese upload guide](1.1.6/UPLOAD-GUIDE.zh-CN.txt): replace the global screenshots and promotional images in the publisher's own Developer Dashboard, save them, then confirm completion before resubmitting. The Dashboard is the source for later publication status.

## Upload files

- Extension package: generate a fresh runtime ZIP with `python3 tools/package_extension.py --output dist/local-itab-1.1.6.zip`, then verify it with `python3 tools/package_extension.py --verify dist/local-itab-1.1.6.zip`. Existing output files are not overwritten. See the [packaging instructions](../README.en.md#build-and-verify-an-extension-zip). Do not use the historical `release/local-itab-1.1.5.zip` as current source; preserve historical archives. The tool does not publish or change the version.
- Store icon: `icon/icon128.png`, unchanged.
- Current screenshots: `1.1.6/screenshots/*.png`, in numbered order.
- Required small promo: `1.1.6/promo/small-promo-440x280.png`.
- Optional marquee: `1.1.6/promo/marquee-promo-1400x560.png`.
- Optional latest listing drafts: `1.1.6/listing-copy/`.
- Permission and privacy-reference text: `store-listing.md` and `privacy-policy.md`; check these against current behavior before submission.

The older screenshot directories and `promo/` remain historical material. They are not the recommended current upload set.

## Before final submission

- Record the source revision and ZIP SHA-256 printed by the packager. Extract and browser-test that exact ZIP before uploading; static packaging verification is not browser testing.
- Check that the saved Store listing shows the current images in the intended order. Also check existing localized screenshots, which can appear before global screenshots.
- Verify the public privacy-policy URL and confirm the Store privacy practices form reflects actual behavior.
- Use `Productivity` as the initial category unless another category is intentionally selected.
- Online favicon retrieval is optional and user-triggered; do not describe its permission as enabled by default.
