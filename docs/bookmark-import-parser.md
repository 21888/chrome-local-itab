# Offline bookmark migration: parser/planner contract

Standalone implementation for a later additive importer. There are **no changes to JSON backup import, UI, storage, browser permissions, sync, layout, or icon loading**. The existing JSON backup remains a whole-replacement feature. Source baseline: `chrome-local-itab` commit `2d804fc`.

## API

Browser script export: `globalThis.LocalItabBookmarkImport` (or `window.LocalItabBookmarkImport`). CommonJS: `require('./shared/bookmark-import.js')`. No dependencies; requires standard `URL`.

- `parse(text)` returns `{inputBytes, encountered, folders, records, skipped}`. Folder nodes have `{nodeId, parentId, title, path}`. Root node is `root`, other source identities are encounter-order `f1`, `f2`, etc. Records have `{title, url, folderId, bookmarkIndex}`. Record indices are 1-based, including invalid encountered bookmarks. This is an inspection API, not a persistence payload.
- `planImport(text, existing, options)` parses the original text internally and returns `{additions: {links, categories}, preview}`. It does not accept a caller-forged parse result.
- `canonicalURL(raw)` returns a canonical absolute HTTP(S) URL, or `null` for an invalid value. The parser separately caps raw/decoded/serialized import URLs at 4096 UTF-16 code units. This helper does not enforce import-field length limits, so existing valid URLs of any length can still participate in canonical deduplication.
- `LIMITS` is a frozen object containing the exact limits below.

`existing` must contain `links` and `categories` arrays. Existing category records must have unique nonempty string IDs and string names. No existing object or array is mutated. Invalid existing URLs are ignored for deduplication; they are never rewritten or removed. Existing category IDs, existing link category references (including orphan references), and reserved `all` are unavailable for allocation.

`options.createCategoryId({index, sourceNodeId})` is mandatory. It must be a pure synchronous deterministic allocator returning a fresh ID matching `[a-zA-Z0-9_-]{1,128}`. The module never uses random, clock, storage, network, or retries to choose IDs. A collision with an existing/reserved/already-created ID throws `ID_COLLISION_OR_INVALID`; no partial plan is returned. The caller owns the injected callback and must not put I/O in it. `options.rootLabel` defaults to `Imported bookmarks`; callers should supply the localized label. It must be nonempty text without control characters and fit the path limit.

Example:

```js
const result = LocalItabBookmarkImport.planImport(htmlText, snapshot, {
  rootLabel: 'Imported bookmarks',
  createCategoryId: ({ index }) => `import_batch42_${index}`
});
// Render result.preview as text. Do not save anything during preview.
// A separate authorized, category-CAS-safe storage layer must commit additions.
```

New links contain only `{title, url, category, icon: '🔗'}`. They do not receive a `layoutId`; layout identity belongs to the later validated storage mutation. New categories contain `{id, name, icon: '📁'}`. These are local glyphs, never imported ICON/ICON_URI or generated favicon URLs.

## Accepted format and deliberate strictness

Requires an explicit `<!DOCTYPE NETSCAPE-Bookmark-file-1>` declaration, case-insensitive, before non-whitespace content or ordinary tags. An initial BOM and leading comments/whitespace are allowed. A marker inside a comment is not sufficient. HTML `<META>` declarations do not substitute for this marker. Files are already decoded strings; encoding detection is outside this module.

One balanced outer `DL` is required. `H3` names a folder and must be followed by its own balanced `DL`; nested lists without a folder are rejected. Folder titles and anchor titles must have matching closing `H3`/`A` tags. Optional `DT` and `P`, Firefox `DD` descriptions, separators, and ordinary wrapper/inline tags are accepted without browser-style tree repair. Multiple outer lists, orphan lists, dangling folder headings, nested anchors, and unterminated comments/tags/raw text reject the entire file. This is a constrained Netscape-export reader, not a browser HTML parser. Malformed files must be re-exported rather than partially repaired.

Quoted attributes may contain `>`; unquoted values support ordinary URL characters including `/` and `=`. Attribute names are case-insensitive. Only the anchor's first `HREF` value is retained; duplicate HREF attributes skip that bookmark as ambiguous. Other attributes are scanned but not retained. Resource attributes, ICON, ICON_URI, META and BASE have no behavior. Comments are discarded. Script, style, iframe, textarea and xmp raw text is ignored through its matching close tag, including hidden anchors. Template, noscript and object containers are rejected as unsupported to avoid ambiguous nested/hidden subtree extraction. Nothing is instantiated as a DOM element, parsed by DOMParser, inserted via innerHTML, evaluated, or loaded.

Title text is decoded once, whitespace-collapsed and trimmed; markup is discarded rather than rendered. Supported entities: `amp`, `lt`, `gt`, `quot`, `apos`, `nbsp`, and decimal/hex numeric references with semicolons (up to 10 decimal or 8 hex digits). Unknown names remain literal. Numeric zero, surrogates and out-of-range values produce a replacement character and invalidate the affected title/URL; DTD/entity declarations reject the file. Unicode text and internationalized hosts are supported.

URLs must start with `http://` or `https://` with a nonempty authority. Relative/scheme-relative, missing-scheme, javascript, data, file, chrome, whitespace/control characters, backslashes, userinfo (including an empty `@`), malformed percent escapes and URL-constructor failures are rejected. No base URL or scheme is inferred. Canonicalization uses the standard URL serializer, normalizing hostname case, IDN, default ports and dot segments; query and fragment are retained. No network request occurs, including to local/private hosts.

## Limits and atomic rejection

| Resource | Hard limit / units |
|---|---:|
| Input | 10 MiB = 10,485,760 UTF-8 bytes |
| Encountered anchors | 10,000, including invalid and duplicate records |
| Accepted new links | 2,000 after deduplication |
| New nonempty categories | 200 |
| Source folders | 10,000, excluding synthetic root; includes empty folders |
| Folder depth | 16, excluding the outer DL |
| Normalized decoded title | 256 Unicode code points |
| Full source path and final category name | 256 Unicode code points |
| HREF | 4,096 UTF-16 code units, raw and decoded; canonical serialized URL also <=4,096 |
| Skip examples | 50; aggregated counts include every skip |

Invalid UTF-16 (unpaired surrogates) rejects before parsing. Limits are fixed; callers cannot relax them. Structural errors and any resource breach throw an Error with a stable `code`; **no partial plan is returned and no value is silently truncated**. Main resource codes are `INPUT_LIMIT`, `BOOKMARK_LIMIT`, `ADDITION_LIMIT`, `CATEGORY_LIMIT`, `FOLDER_LIMIT`, `DEPTH_LIMIT`, `TITLE_LIMIT`, `PATH_LIMIT`, and `URL_LIMIT`. Other error codes name the specific format/configuration fault.

Individually invalid bookmarks skip with `invalid_url`, `invalid_title`, or `duplicate_href_attribute`. Planner duplicates skip with `duplicate_url`. Empty/invalid folder titles reject as structural ambiguity. Sources used only by skipped bookmarks create no categories.

## Additive planning and preview

Canonical URLs already present anywhere in existing links are skipped. Within the file, the first valid occurrence wins globally; query/fragment variants remain distinct. Existing categories are never merged with imported categories, even if names match.

Each source folder node with **direct accepted bookmarks** gets one fresh flat category whose name is its full path joined with ` / `. Empty ancestors do not create categories; their path remains part of descendant labels. Root bookmarks share a new localized `Imported bookmarks` category. Distinct source nodes with the same path/name remain distinct and get visible suffixes ` (2)`, ` (3)`, etc., also avoiding existing category names. Labels are never silently shortened; if suffixing exceeds the path cap, reject the batch. Mapping uses source node identity, not a name-keyed map.

`preview` contains byte count, encountered/valid/added/skipped bookmark counts, new category count, aggregated skipped reasons, at most 50 `{reason, bookmarkIndex}` examples, omitted example count, and complete mapping for new nonempty categories. Mapping entries are `{sourceNodeId, sourcePath, sourceTitle, parentNodeId, categoryId, categoryName}`. Skip examples contain no copied sensitive URL/title and are bounded even on hostile input. Parser-invalid examples precede planner-duplicate examples; bookmarkIndex retains source order for any sorting by the UI.

## Integration obligations (not implemented here)

- Import is preview-first and additive. Do not route this through JSON backup replacement.
- Pass already-loaded state to the pure planner, then use the category-CAS-safe storage path to revalidate and commit against that same snapshot. A stale preview must be regenerated/reconfirmed; never overwrite intervening category/link changes.
- Do not attach the HTML to any DOM, iframe, renderer, preview browser, or server. UI renders titles, paths and reasons as plain text only.
- Import itself never generates or requests favicons. Existing already-enabled sync or icon behavior is a separate product setting and must be disclosed appropriately; this parser neither disables nor enables either.
- A generated plan is not proof of persistence, category ownership, identity allocation, or successful user confirmation.

## Verification and performance

Run `node --test tests/bookmark-import.test.js` from this isolated stage (or specify its full path). Fixtures model complete Chrome, Firefox and Edge Netscape export shapes; they are synthetic, not user data. Tests include immutability, canonical duplicate handling, same-name folder identity, resource boundaries, quoted/unquoted attrs, numeric/entity attacks, hidden anchors, raw-text boundaries after Unicode, malformed tokens and strict marker enforcement.

The tokenizer scans left-to-right; raw-text searches advance over disjoint ranges in the original source and compare only fixed-size closing tag names case-insensitively. No whole-input case-folded copy is allocated, so Unicode cannot shift offsets and uppercase input does not create callback-per-character memory overhead. Entity regular expressions have fixed bounded alternatives and no recursive/unbounded nested quantifiers. Input/field scanning is O(input size); stored records/folders are capped at 10,000 each and output additions at 2,000/200. Memory is bounded by input and those record limits, plus the caller-owned existing snapshot and duplicate sets. Category suffix probing is bounded by existing names plus the 200 generated names per base label. Existing snapshot size is not capped by this module.

The zero-I/O test runs the module in a VM with document, DOMParser, fetch, XMLHttpRequest, Image, chrome, localStorage, navigator, require, eval, Function and timers denied. Large-scan tests include a 5 MiB ignored ICON, 5 MiB malformed quote, 1 MiB ampersand text, the full 10 MiB input boundary, all count caps, and a generous 10-second regression ceiling for the adversarial scan group. A separate child-process regression scans full 10 MiB uppercase comments and script bodies and requires peak process RSS below 256 MiB (including Node runtime overhead), with a 10-second timeout. This catches the reviewed whole-input uppercase replacement allocation regression. These are local performance regression tests, not cross-device latency or memory guarantees.
