# Prompt library native acceptance: bounded gate passed

Candidate: `/workspace/shared/prompt-library-native-candidate/runtime`, manifest 1.1.21, frozen 76-file snapshot. Isolated official Chrome for Testing 155.0.8059.39 profile. Only native CUA/Sky UI input; no browser JS, headless browser, CDP extension control, or storage seeding.

## Observed passing flows

- Visible Prompt library new-tab entry opens a separate extension tab.
- Create title `QA Native Alpha`, tool note `Testing`, favorite. An initial coordinate-entry attempt did not populate category/tags; the exported bytes clarified this, so no category/tag claim is made for that first save. A later verified edit saved category `QA` and tags `blue,green`, with visible chips and successful tag-only mixed-case `gReEn` search.
- Body entered with native keys: `Explain {{topic}} to {{reader}}. Again {{topic}}.` followed by newline and two spaces, then `<script>literal</script>`.
- Save and browser tab reload retain saved prompt. Literal script markup renders as text.
- Mixed-case `nAtIvE` search returns the saved prompt; clear filters works.
- Two variable fields appear. Missing values disable completed-copy. `topic=stars` substitutes both occurrences. Explicit empty `reader` satisfies completion.
- Copy completed prompt then normal Ctrl+V into body editor yields `Explain stars to . Again stars.` followed by newline, indentation and literal script markup. No clipboard API inspection used.
- Ctrl+S saves a second body version. History previews original body and restore confirmation describes retained history. Restore creates version 3, preserving the later version.
- Trash confirmation names the prompt and explains recoverability. After confirmation All shows 0; after reload Trash shows 1 retained prompt.

## Further observed passing flows

- Restore from Trash retained the prompt and its three body versions; All included it again.
- Two native tabs edited one record. Tab A retained `Stale draft A`; tab B explicitly saved `Saved B`. Tab A showed conflict notice, preserved its exact draft, blocked Ctrl+S stale overwrite, and exposed a review of `Saved B`. Explicit discard had a confirmation and retained the saved record.
- Complete export produced schema 3 with the prompt library once under globals. Actual bytes parsed once as an object. The source had one prompt and four body versions.
- A subsequent native edit added `Backup changed C`, category `QA`, and tags `blue,green`; exported destination had five versions.
- Backup review showed one differing prompt ID and incoming four/current five versions. The global-library destination required an explicit choice. Replace selected saved modules completed with the visible `restored and verified` result.
- Recovery download and post-restore export both completed. Offline verifier passed: source body/metadata/identity/history exactly restored, editor version fence renewed, complete recovery matches all pre-restore workspace modules and prompt content, and displaced prompt retained in prompt recovery. Unsaved stale draft was absent.
- Reloaded prompt library showed restored saved content. The old workspace tab correctly warned that its workspace had been replaced; a fresh new tab opened normally.
- Desktop light screenshot captured. Through native appearance selector, Dark applied to prompt library after reload. A 553-pixel outer native window showed stacked sidebar/list/detail, wrapped header controls, and vertically stacked variable fields; document scrolling remained usable. No horizontal clipping observed in this sampled view. This is outer window width, not a JS-measured CSS viewport.
- Native QA browser closed after acceptance. No source/runtime edits, commits, or pushes were made.

## Evidence and reproduction

All fixtures are synthetic and created through normal extension UI in an isolated profile. Original browser downloads were copied byte-for-byte through the native file manager to the evidence folder. No user data, browser profile, or browser logs are packaged.

Run `node verify.cjs` beside `exports/` for offline comparison, then `python package-evidence.py` for the allowlist ZIP. `comparison.json` contains checks, byte counts, and SHA-256 hashes. Stable evidence aliases preserve original bytes:

- `source-a.json`: native `local-itab-complete-2026-10-10 (10).json`, 3205 bytes
- `changed-b.json`: native `local-itab-complete-2026-10-10 (11).json`, 3438 bytes
- `restored-c.json`: native `local-itab-complete-2026-10-10 (12).json`, 4693 bytes
- `recovery-b.json`: native `local-itab-pre-restore-2026-10-10 (2).json`, 3438 bytes

The comparison excludes only refreshed record revision/version when comparing source to restored record; it separately requires a changed version fence. Body strings, all history entries and their immutable IDs, timestamps, metadata, stable prompt ID, and currentVersionId compare exactly. Recovery prompt content and scoped workspace content compare exactly.

## Limitations

Desktop accessibility provider unavailable; all native apps expose x11 fallback and type_text fails. Standard native keypresses and coordinates work. Unicode/IME, exhaustive responsive/themes/zoom, capacity/quota/write-fault injection, denied clipboard, browser restart durability, category/favorite filter matrix, 20-version cap, interrupted-restore recovery, and exhaustive keyboard/focus matrix were not tested in this bounded native pass. These omissions prevent claiming completion of the entire repository native checklist. The parent separately reported aggregate 1351 Node / 52 Python passing; that suite was not rerun here.
