# Unified Local iTab product icon

The green/cream mark was originally generated for this project with OpenAI image generation (imagegen), then selected by the user. The user explicitly authorized using the selected design inside the extension and making technical size adaptations: “你插件内也用这个图标吧,需要调整什么的你就自己处理”. This records the design source and project-use authorization; it does not claim a third-party stock license, exclusive copyright, or trademark clearance. The approved mark is reused without redesign, recoloring, or further generative edits. Only deterministic RGBA resizing and transparent canvas placement were performed.

Approved original: `local-itab-store-icon-original.png`, SHA-256 `9070b4b56cad97206d205dd33efdedbdb98da4382d123bea98a9272a24eeaae0`. The original is a design source, not a runtime dependency.

## Asset inventory

- `assets/icon16.png`: 16×16, one-pixel minimum transparent margin; small browser extension surfaces.
- `assets/icon32.png`: 32×32, two-pixel minimum margin; high-density small extension surfaces and all four page favicons.
- `assets/icon48.png`: 48×48, three-pixel minimum margin; extension management and in-page brand marks.
- `assets/icon128.png`: exact approved store export, 128×128 RGBA, 96×94 nontransparent bounds, margins 16/17/16/17. This is also the manifest's large icon.

For 16/32/48, the implementation uses Pillow **12.3.0**. Convert the original to RGBA, crop with `source.crop(source.getbbox())` without thresholding alpha, copy, then use LANCZOS `thumbnail` within `(size − 2 × margin)` preserving aspect ratio. The original 1254×1254 image has alpha bounds `(0, 33, 1129, 1254)`, including faint edge pixels. The cropped input is 1129×1221; thumbnail outputs are 13×14, 26×28, and 39×42 for the three target sizes. Center with integer floor offsets on a transparent RGBA canvas using **`alpha_composite`**, not `paste`: they can differ in invisible RGB values where alpha is zero. No source pixels inside the alpha bounds are cropped. Export as PNG. Expected asset SHA-256 values are in `brand-icon-hashes.json`.

Exact small-icon export recipe (the 128×128 asset is copied from the approved store export, not produced by this recipe):

```python
from PIL import Image
source = Image.open("local-itab-store-icon-original.png").convert("RGBA")
source = source.crop(source.getbbox())
for size, margin in ((16, 1), (32, 2), (48, 3)):
    thumbnail = source.copy()
    thumbnail.thumbnail((size - 2 * margin, size - 2 * margin), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size))
    canvas.alpha_composite(thumbnail, ((size - thumbnail.width) // 2, (size - thumbnail.height) // 2))
    canvas.save(f"assets/icon{size}.png")
```

The recipe was rerun in memory and all three PNG byte streams exactly matched the checked-in exports. No icon bytes changed during this reproduction check.

Manifest icons cover Chrome's existing extension surfaces. The extension has no `action`, `browser_action`, or `page_action` declaration; this change does not create a new toolbar interaction. Existing Chrome surfaces that use the manifest icon receive the same mark.

The new-tab template header, settings header, prompt library header, and AI collection header use the same mark. Header images are decorative beside existing product text or the page title and have empty alternative text. Template-specific shapes/backgrounds no longer mask or recolor the brand image; responsive dimensions are preserved. All four pages declare the local 32×32 favicon. Existing shortcut-image fallback continues to use the product's 48×48 asset; third-party website icons and catalog branding are untouched.

The explicit runtime packaging allowlist gains only `assets/icon32.png`. No permissions, network behavior, CSP, version, third-party resources, or store account settings change.

## Validation

- Dependency-free Python tests verify PNG signatures, per-chunk CRCs, RGBA bit depth, decoded image dimensions, alpha transparency, safe margins, the exact 128-pixel export bounds, frozen export hashes, and page/manifest references.
- Visual contact sheet reviewed at actual 16/32/48 sizes against light and dark backgrounds. The cream L and mint blocks remain recognizable; the dark outer green naturally has lower contrast on dark surfaces.
- Full Node/Python suites and runtime source-comparison packaging are run before handoff; counts and SHA-256 accompany the handoff.
- Real-browser visual validation is assigned to the release's single browser QA owner, and is not claimed by this static/image review. Check new tab (especially folio/prism), settings, prompt library and collections in light/dark themes, plus the browser tab favicon and Chrome extension icon. Refresh/reload the extension to avoid cached old favicons.

## Integrated development validation

Integrated after the AI context workbench on version1.1.117, preserving both toolbar repairs and current README capture history. Actual combined strict serial regression passed2833/2833 Node tests with a1GiB heap and84/84 Python tests. Independent brand review reproduced the size derivatives, confirmed the selected128px image byte-for-byte, checked the exact114-file allowlist and passed2828 Node/84 Python on the standalone brand baseline. Combined package/source verification passed114 runtime files. Native brand-page/favicon/template checks are pending; automated results do not certify rendered appearance.
