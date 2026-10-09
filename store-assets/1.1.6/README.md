# Local iTab 1.1.6 store assets

This is the current prepared Chrome Web Store image set. It contains five actual English-interface screenshots and two original promotional illustrations. All seven PNGs were reviewed at their final sizes. Preparation does not upload images or publish the extension.

As recorded on 2026-10-09, the 1.1.6 review was withdrawn (`CANCELLED`). Replace and save the images in the publisher's own Developer Dashboard before resubmitting. See the [Chinese upload guide](UPLOAD-GUIDE.zh-CN.txt); consult the Dashboard for subsequent status changes.

## Upload files

- [01 Clarity light](screenshots/01-clarity-light-1280x800.png): 1280 × 800, 12 example sites in a grid.
- [02 Graphite dark](screenshots/02-graphite-dark-1280x800.png): 1280 × 800, the same sites grouped into three categories.
- [03 Folio light](screenshots/03-folio-light-1280x800.png): 1280 × 800, six example sites in two groups.
- [04 Free placement](screenshots/04-free-layout-1280x800.png): 1280 × 800, eight sites in an asymmetric, nonoverlapping layout.
- [05 Local widgets](screenshots/05-local-widgets-1280x800.png): 1280 × 800, Tasks, Focus and Scratchpad, with the search and shortcuts modules hidden through supported settings.
- [Small promotional image](promo/small-promo-440x280.png): required 440 × 280 image.
- [Marquee promotional image](promo/marquee-promo-1400x560.png): optional 1400 × 560 image.

All files are opaque RGB PNGs. The screenshots are square-cornered, full-bleed actual UI, with no marketing overlays. The promotional images use the product name and symbolic artwork rather than a screenshot. Their sharp grid symbol follows the current dashboard's visible `▦` mark; the extension's existing icon is unchanged.

The [English](listing-copy/en.txt) and [Simplified Chinese](listing-copy/zh-CN.txt) listing drafts are optional text grounded in the current README. They have not been saved to the store or inserted into the manifest. They describe optional networking and the separate backup requirements for local tools, without claiming zero network access or that 1.1.6 is already public.

## Capture provenance

Chrome for Testing 155.0.8059.39 captured the actual extension using the native DevTools full-page screenshot command. The logical Desktop viewport was 1288 × 800 CSS pixels, DPR 1, with page zoom at 100%. Chrome excluded the 8-pixel vertical scrollbar from exported bitmaps, producing 1280-pixel content width. The originals were respectively 1280 × 963, 1280 × 960, 1280 × 943, 1280 × 997 and 1280 × 845.

Each final screenshot is the exact top-left `[0, 0, 1280, 800]` crop, encoded losslessly as RGB. Decoded-pixel equality against its native original was verified. No scaling, UI reconstruction, CSS/DOM edits or retouching was used. The screenshots show the upper page region; some content naturally continues below the frame. Original captures and full evidence are retained separately, not shipped as extension runtime files.

Examples use English synthetic categories, tasks and notes with original embedded PNG letter icons. Sync and online icons were disabled; example websites and searches were not opened. No live weather, news or movie feed is represented.

The captured 60-file runtime matches source revision `90b91e6456bfaea9a4519ae1ba9c5c5ed6e6b760` byte for byte. Its frozen capture checkout was `9f56a873918400f05bf8e73efadcc85afa4e4dd8`. Candidate ZIP SHA-256: `2256b00e487ccaf9ee692e69bd32e559d3f9b1ed1202236b6761554f99c06379`.

See [provenance.json](provenance.json) for image sizes, original/final hashes, crop boxes and sample state. These assets follow [Google's image guidance](https://developer.chrome.com/docs/webstore/images), checked on 2026-10-09.

## Editable promotional sources

`source/` contains both editable SVGs and a self-contained `build-promos.py` generator. It uses Python with Pillow, Inkscape and the locally installed Liberation Sans font; no external image or font API is called. From this directory run `python3 source/build-promos.py` to regenerate the two promotional PNGs. Artwork is rendered at 3× and downsampled with Lanczos. This rendering step applies only to the illustrations, never the screenshots.

## Bounded native acceptance

The same frozen runtime was also checked with ordinary native interactions:

- An already-open dashboard refused and reverted a stale appearance change after a separate Settings import, requesting a fresh tab.
- Folio chosen in Settings and Dark chosen in an already-open dashboard persisted together after reloading both pages.
- Successive same-page Light and Graphite selections persisted after reload.

These are sequential UI observations, not an exhaustive concurrency or forced-race test. They do not establish overlapping-write timing, lock contention or all possible interleavings.
