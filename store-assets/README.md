# Store Assets

Prepared Chrome Web Store materials for Local iTab.

## Historical image set

[The frozen 1.1.6 asset set](1.1.6/README.md) contains five reviewed 1280 × 800 screenshots, the required 440 × 280 small promo, an optional 1400 × 560 marquee, editable promotional sources, optional bilingual listing text and exact capture provenance.

These files are prepared, not uploaded. As recorded on 2026-10-09, the 1.1.6 review was withdrawn (`CANCELLED`). Its [Chinese upload guide](1.1.6/UPLOAD-GUIDE.zh-CN.txt) describes that historical candidate, not a standing instruction to resubmit it. The Dashboard is the source for later publication status; this repository does not confirm the current submission or saved form state.

## Upload files

- Extension package: choose the latest non-draft, non-prerelease [GitHub Release](https://github.com/21888/chrome-local-itab/releases) whose exact source SHA, successful required CI, runtime ZIP, checksums and documented validation have all been verified. Read its release notes and verification limits; a newer manifest or tag alone does not establish readiness. Match the selected ZIP's manifest version and SHA-256 to that release's provenance, then complete the [release checklist](../docs/release-checklist.md) for the exact package. GitHub publication does not establish Store approval or authorization to submit.
- If rebuilding is necessary, check out the selected release's exact source revision, generate a fresh runtime ZIP with `python3 tools/package_extension.py --output dist/local-itab-current.zip`, then verify it there with `python3 tools/package_extension.py --verify dist/local-itab-current.zip`. Existing output files are not overwritten. See the [packaging instructions](../README.en.md#build-and-verify-an-extension-zip). The tool packages that checkout's manifest version; it does not change versions, publish or establish browser acceptance. Preserve historical archives and provenance; never rename a newer package to an older version.
- Store icon: [`assets/icon128.png`](../assets/icon128.png), as declared in the selected release's manifest; verify that release's icon before upload.
- Historical 1.1.6 screenshots: `1.1.6/screenshots/*.png`, in numbered order.
- Historical 1.1.6 required small promo: `1.1.6/promo/small-promo-440x280.png`.
- Historical 1.1.6 optional marquee: `1.1.6/promo/marquee-promo-1400x560.png`.
- Historical 1.1.6 optional listing drafts: `1.1.6/listing-copy/`.
- Permission and privacy-reference text: `store-listing.md` and `privacy-policy.md`; check these against current behavior before submission.

The versioned image set, older screenshot directories and `promo/` remain historical material. Before reusing any image or listing draft, verify it accurately represents the selected release and record its original provenance. They are not evidence that newer features have been captured or reviewed.

## Before final submission

- Record the source revision and ZIP SHA-256 printed by the packager. Extract and browser-test that exact ZIP before uploading; static packaging verification is not browser testing.
- Check that the saved Store listing shows the current images in the intended order. Also check existing localized screenshots, which can appear before global screenshots.
- Open the actual public privacy-policy URL without signing in and check it matches the selected release. Review and verify the saved Store privacy practices form against actual data handling and provider transmissions; see [the submission guidance](store-listing.md#privacy-practices-form). A repository document or placeholder does not confirm the live URL or form.
- Use `Productivity` as the initial category unless another category is intentionally selected.
- Online favicon retrieval is optional and user-triggered; do not describe its permission as enabled by default.
