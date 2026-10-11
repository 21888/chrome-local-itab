# AI collections native acceptance: bounded gate passed

Tested 2026-10-10 in dot's cloud Linux desktop using official Chrome for Testing 155.0.8059.39, isolated profile and synthetic data. No user computer/accounts. Native CUA/Sky mouse, keyboard and file manager only. No app JavaScript injection, CDP, headless browser, storage seeding or runtime/source edits by this QA worker.

## Candidate and fixes

Frozen candidate: `/workspace/shared/ai-collections-native-candidate/runtime` (82 runtime files, manifest 1.1.21). Parent refreshed presentation-only changes at saved checkpoints:
- Initial clean profile rendered heading “Title” and lacked theme colors/borders. Fixed default HTML theme attributes and case-insensitive locale-key collision; verified corrected native light presentation and focus outline.
- Backup collection counts initially said “Active tasks/Removed tasks”. Parent refreshed collection-specific labels; native final review verified “Saved excerpts/Archived excerpts”. Final review canceled, no second restore.

Current and previous hash manifests are included. Core collection store, controller, workspace backend hashes remained unchanged throughout; `backend-before.sha256` verification passed. Runtime/source/manifest/git were not edited by QA. No publication claim.

## Native observed acceptance

1. New-tab AI collection link opened separate collection tab. Created `QA Native Collection` manually with exact body `<script>literal</script>` + newline + two spaces + `const answer = 42;`. Markup stayed literal. Added separate annotation, tags `blue,green`, tool `Testing`, type Code and source `https://example.com:8443/source?qa=1`. Visible attribution showed host and nondefault port. Source was not opened.
2. Saved and reloaded record. Mixed-case tag search `gReEn` plus Code type filter returned the item. Metadata-only Ctrl+S changed notes to `Metadata edited only.` and left body/history at one version.
3. Explicit revision dialog and current/proposed review accepted appended `Reviewed revision B.`. History displayed original and revised bodies. Reviewing and accepting original history created version three and retained the other entries.
4. Archive removed the item from Saved after reload; Archived retained the body and three versions. Restore from archive returned the saved record.
5. Two native tabs: first kept title draft `Stale draft A`; second saved title `Saved B`. First showed latest saved data plus exact retained draft; Ctrl+S did not overwrite, save button was disabled. Explicit discard confirmation discarded only unsaved draft.
6. Standalone export privacy dialog downloaded normal and omit-source copies. Both actual downloads parsed once as JSON objects, not encoded JSON strings. Omitted export differs only by empty sourceUrl and export timestamp. Subsequent complete export matches original saved record exactly, proving omission affected only the exported copy.
7. Complete source export used schema 4 and one global collections payload. Further reviewed revision appended `Backup changed C.` and created version four; changed destination export captured it.
8. Native file picker loaded original source backup. Full review showed one collection ID conflict, incoming three/current four body versions, and required explicit global prompt/collection destination choices. Explicit Replace completed with “restored and verified”. Downloaded actual pre-restore recovery and post-restore backup. Reopened collection showed original source body and three versions.
9. Offline verifier passed: restored record identity/title/tags/tool/type/notes/source/body/history/current-version ID/timestamps exact to source except renewed mutable version/revision fence; workspace content exact; recovery globals and workspaces exact to pre-restore state except export timestamps; displaced collection snapshot exact. Stale draft absent from every export.
10. Corrected desktop light view and native Dark appearance sampled. A 553-pixel outer native browser window showed stacked sidebar/detail and wrapping header actions with readable body, notes and source; no horizontal clipping in sampled views. Width is native outer window, not measured CSS viewport.
11. Final count-label-only refresh reviewed without replacement. Isolated browser closed; desktop handed back.

## Evidence and reproduction

16 original native screenshot PNGs under `evidence/`. Original browser download bytes copied through native file manager into `exports/`:
- normal standalone: `local-itab-ai-collection.json` (1081 bytes)
- source-omitted standalone: `local-itab-ai-collection (1).json` (1045 bytes)
- complete source: `local-itab-complete-2026-10-10 (13).json` (3169 bytes)
- changed destination: `local-itab-complete-2026-10-10 (14).json` (3348 bytes)
- restored: `local-itab-complete-2026-10-10 (15).json` (4403 bytes)
- pre-restore recovery: `local-itab-pre-restore-2026-10-10 (3).json` (3348 bytes)

Run `node verify.cjs`; it reads only these files and writes `comparison.json` with semantic checks, byte counts and SHA-256 hashes. Run `python package-evidence.py` to rebuild the allowlist ZIP. Browser profile and logs are excluded.

## Limitations

Bounded acceptance, not entire repository native checklist. Did not test IME/Unicode/CRLF/tab/trailing-space matrix, network inspection, source-link navigation, duplicate capture, exact prompt references, stale revision proposals/save-as-copy, cap/quota/fault injection, interrupted restore recovery, legacy backups, deselected module preservation, exhaustive search/filter/locale/zoom/theme/width/keyboard/focus matrix or browser restart durability. No formal accessibility contrast measurements. Native accessibility provider is x11 fallback; native keypresses/coordinates were used. Parent reported full automated suite separately; not rerun by QA. A native pathname-entry picker attempt closed without starting review; selecting visible file row and Open succeeded. No data-loss or unresolved functional failure observed within tested scope.
