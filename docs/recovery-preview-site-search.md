# Find a site inside an inspected recovery copy

## Scope and user flow

The independent, read-only recovery page now offers **Find title or URL in this inspected copy** inside **Preview site text**. This helps find a remembered site beyond the first 100 displayed records without repeatedly paging through a retained copy.

1. Read the copy's source, attribution, integrity and warnings.
2. Open its site-text preview. Type a title fragment or literal URL text, then choose **Find site text** or press Enter.
3. Read the match count and **original record numbers**. Duplicate records remain separate and in their original order. The paging range counts positions within the matching sequence; the number beside each record is its original position in the selected copy (for example, matching range 1–1 of 1 can show original record 205).
4. Choose **Clear site search** to return to the complete preview. Keyboard activation returns focus to the search input.
5. If eligible, separately review/download the selected **complete configuration**. Search does not select a subset for recovery or export.

Search is local, case-insensitive literal substring matching of the already inspected title/URL strings. Input is limited to 1,000 characters and outer whitespace is ignored. It does not decode URLs, interpret regular expressions, remove accents or apply compatibility normalization. It can match inspected text beyond the 4,000-character display truncation; existing preview warnings remain visible. A zero-match message explicitly says this is not proof that a site was deleted. URLs are text only, never followed or used to load images.

## Data and lifecycle contract

- Filtering changes only a list of original indices; it does not mutate the inspected links, source selection, stored data, review ticket or export payload.
- Investigation JSON retains its existing allowed-field projection. A reviewed configuration retains the entire validated configuration. Neither export becomes a filtered subset.
- The configuration review itself deliberately has no search control: its full-copy scope/count remain explicit.
- Typing does not rebuild the list. Explicit search scans the already inspected copy, then renders at most 100 rows per page. This bounds DOM work, not the size of the existing inspection safety limits.
- Hidden, disconnected, refreshed and destroyed previews reject old search/page actions. Reopening a preview creates fresh, unfiltered controls. Existing inspection/source and file-review invalidation guards remain in force.
- No storage writer, workspace bootstrap, remote request, permission, provider or import operation is added.

## Model verification, 2026-10-27

The before-change regression reproduced the missing search affordance with a 205-record preview: the remembered record was outside the first 100 rendered rows, and no local search input existed. This is an added usability feature, **not evidence of an original storage-loss bug**.

The complete recovery-view and recovery-file-view files passed **87/87**. Coverage includes a later-page match retaining original number 205; duplicate indices; English/Chinese labels; literal punctuation, Chinese and emoji text; percent-encoded URL spelling; missing/empty fields; a suffix beyond display truncation; no-match/Clear; whitespace; composition/229/repeat Enter guards; 153 matches paged 100 + 53; and stale controls after hide/reopen, refresh, hidden visibility and destroy.

The actual Inspector + ConfigurationCodec integration filters three preserved records down to one displayed match, then reviews and exports all three original records and layout data. It asserts unchanged raw storage, no additional reads, no writer bootstrap and exclusion of an unrelated synthetic secret. The complete related recovery/import-closure/codec-parity group passed **882/882**, serially. Final unchanged production/test sources then passed the complete Node suite **17,296/17,296** (363.18 seconds, exit 0) and all **91 Python tests** (exit 0). `git diff --check` passed.

## Cloud Chrome verification, 2026-10-27

A new loopback-only tab on port 8807 used the production recovery view, inspector and codecs, a lawful synthetic checksummed 205-site retained copy, a local translation shim and an in-memory download capture. Storage set/remove/clear were forbidden. This was not an installed-extension upgrade, real-profile recovery or an actual browser file-download test.

Verified through real controls:

- first 100 records → type `needle`, Enter → one match with original ordinal **205**, retaining `Needle 中文` and its literal URL;
- Tab → Tab → Enter on Clear → first 100 records restored, search input focused;
- absent text → explicit zero-match/not-deletion explanation;
- search again → **Review configuration file** still reports **205** records and shows the complete first page, not the one-match subset;
- reviewed export capture is version **2.0** with **205** links; reads remain **48**, writes **0**, and the original raw snapshot remains unchanged.

Two fixture mistakes were retained rather than presented as product failures or silently declared passing:

1. The first schema-2 fixture omitted required layout identities and review correctly rejected it with `FIELDS`. Adding lawful synthetic identities/identity layout data made the unchanged production review pass.
2. The browser proof's first `fullLinks` comparator used plain `JSON.stringify` and reported false because codec validation puts `layoutId` before `title` in object key order. An offline replay of the same fixture through the actual Inspector/export/Codec confirmed **205/205 links equal under stable-key serialization**, including every field value and array order. Native evidence establishes the full count; this stronger equality is the separate replay, not an invented passing native comparator.

The owned browser tab and loopback server were closed and its dedicated Terminal tab removed. Inventory afterward contained no Electron and only the pre-existing blank Chrome tab. No screenshot, fixture binary, personal data or credential was uploaded.

## Limits

Synthetic keyboard composition events are not OS input-method validation. This feature neither imports a backup nor guarantees that a retained copy contains the newest user edits. It does not resolve the historical data-loss incident, establish the missing historical Web Store package identity, or relax any installation/import/publication gate.
