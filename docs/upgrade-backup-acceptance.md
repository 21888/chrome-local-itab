# Current upgrade and complete-backup acceptance

## Evidence boundary

Initially prepared against `0d4f9e1` (manifest 1.1.38), 2026-10-11, as automated model checks and documentation. Subsequent native-download comparison results for the 1.1.39 candidate are recorded below. Model tests alone do not establish a native upgrade, a downloaded older-release installation or browser-crash atomicity. The [older native report](complete-backup-native-validation.md) exercised a five-module schema-1 candidate and remains historical evidence only.

The current complete backup has five per-workspace modules and two global libraries. Archives with collections are schema 4, prompts without collections schema 3, workspace-only schema 2, and supported legacy standalone archives schema 1. Schema numbers describe file formats, not extension release versions. The staging-timestamp comparator correction below was subsequently checked against `828a5c6` (1.1.39 candidate); it does not change runtime behavior.

## Automated coverage and exact comparison

Run from the repository root:

```sh
node --test --test-concurrency=1 tests/complete-backup*.test.js tests/migration-guidance.test.js
node docs/qa/upgrade-backup-acceptance/generate.cjs /tmp/itab-synthetic-backup-new
node docs/qa/upgrade-backup-acceptance/verify.cjs /tmp/itab-synthetic-backup-new
```

Use a new output directory: the generator refuses to overwrite files. It creates only fabricated data through an in-memory Chrome-storage model and supported prompt/collection store operations, never browser storage. Files are `source.json`, `baseline.json`, `restored.json` and `recovery.json`. They contain two live workspaces, one recoverable Trash workspace, active/completed/removed tasks and task recovery, multilingual notes, countdowns, focus preferences, two prompt body versions and a revised collection linked specifically to the older prompt body. Both global libraries also contain an archived record and a recovery snapshot created by a supported reviewed self-import. Source and target differ in Focus preferences, workspace names and last-used workspace as well as saved content. The generated target uses an advancing clock, so staging timestamps differ from source/baseline metadata. The generator's files are model outputs, not browser downloads.

The verifier also accepts separately collected files using those names. An optional comma-separated third argument specifies selected modules. The source, baseline and restored files must be schema-4 full exports; recovery may be schema 2/3/4 according to selected globals. File comparison alone never establishes native provenance.

New cross-feature checks in `tests/complete-backup-acceptance.test.js`:

- Restore all seven modules, JSON-serialize the storage snapshot, construct new managers/stores, re-export and resolve the exact older linked prompt body. Reconstructed stores establish model persistence, not native disk durability.
- Restore only the five workspace modules, only Scratchpad, only collections or only prompts. Deselected global raw states compare exactly, including revision/receipt metadata. Collections restored without source prompts remain explicitly unresolved with their original reference IDs.
- Cancel during staged workspace writes; reconstructed stores still export the exact prior authoritative workspace/global content and can read the verified recovery file.
- Inject a partial combined authority submission. New store instances observe the durable fence, reject ordinary reads/writes, require a separate recovery confirmation, then restore the exact prior global state and workspace exports. This is fault injection into the model, not a browser crash test.
- Corrupt immutable prompt body text, a linked version ID or a deselected global revision. The independent comparison must reject all three.

Comparison rules are deliberately narrow. Export timestamps are excluded. Selected live task mutation tokens must change; all other task fields and task recovery remain exact. Selected prompt/collection mutation tokens must change and revisions must equal the prior/incoming maximum plus one; IDs, immutable body history, current body-version IDs, references, annotations and all remaining fields remain exact. Global recovery is compared against the precise retained/imported history plus the displaced prior content. Unselected payloads are not normalized. Workspace registry metadata, order and Trash metadata compare exactly for the reviewed scope except the narrowly checked staging timestamp below.

### Workspace staging timestamp contract

`workspaces.replaceLocked` refreshes `updatedAt` when it stages a changed bundle (including Trash). Complete-backup restores with any workspace module selected necessarily stage the affected workspaces: personal-module writes increment saved revisions; configuration replacement generates fresh layout/settings fences. This also applies when portable text/configuration is identical. Full five-module restores use incoming workspace metadata; partial scoped restores retain destination metadata, with only staged `updatedAt` refreshed. Global-only restores preserve all workspace/Trash timestamps exactly. A direct unchanged `replaceSnapshot` retains both timestamps and bundle generations; that lower-level no-op is not the selected-module complete-backup operation.

The comparison requires the actual pre-restore recovery export. For staged workspaces only, `updatedAt` must be a canonical, valid UTC ISO timestamp within the inclusive interval `[recovery.exportedAt, restored.exportedAt]`. It also requires `baseline.exportedAt <= recovery.exportedAt <= restored.exportedAt`. The recovery copy is produced before bundle staging and the result export after confirmation. No fallback to stale source timestamps, broad timestamp deletion or arbitrary time tolerance is permitted. Clock reversal or evidence outside this interval causes comparison failure and requires investigation; the verifier does not silently widen the interval.

All other metadata, including `createdAt` and `deletedAt`, remains exact. Global-only workspace `updatedAt` remains exact even if a forged replacement falls within that interval. Recovery workspace timestamps remain exactly the baseline timestamps. Inputs are never rewritten: the verifier validates the permitted field and compares a private copy. CLI output identifies whether workspace timestamps are `staged-within-window` or `exact-baseline` and prints the observed bounds.

Advancing-clock regressions cover full/scoped-only, Scratchpad-only, configuration-only and both global-only restores; identical-content scoped replacement; invalid dates, pre-window/post-window/stale timestamps; changes to unrelated metadata; and the unchanged direct snapshot branch. The original fixed-clock fixture had masked this comparator defect. The correction changes only acceptance tooling/tests, not extension runtime or native artifacts.

Existing tests already cover schema-1 explicit live destination choice and Trash rejection, schema-2/3 exclusion of globals, stale previews, active Focus refusal, recovery write/readback failures, staging failure, uncertainty fences, identity collisions, capacity limits, explicit destination UI, draft refusal and cancellation. These are retained rather than duplicated. See `complete-backup-workspaces`, `complete-backup-prompts`, `complete-backup-prompts-independent-audit`, `complete-backup-collections` and corresponding view test files.

## Native-download comparator results, 2026-10-11

The repaired verifier passed all five named evidence sets without changing the raw files. Each set supplies a synthetic source plus the native baseline, restored and pre-restore recovery exports. SHA-256 checks before/after comparison confirmed that all 20 JSON inputs were unchanged. These are file-comparison results; native interaction provenance belongs to the separately retained cloud-browser QA evidence. No screenshots, browser profiles or raw backups are added by this correction.

- **full-confirmed — PASS:** all seven modules. Every staged live/Trash `updatedAt` is within `2026-10-11T16:14:18.858Z` through `2026-10-11T16:14:46.645Z`. Selected records, immutable versions and exact prompt references match the reviewed source under the documented mutation-token/revision rules; recovery matches the prior native baseline.
- **scratchpad-only — PASS:** only saved notes replaced; other portable modules and both global libraries remain exact. Staging interval: `2026-10-11T16:25:24.140Z` through `2026-10-11T16:26:02.533Z`. Recovery contains all prior workspace modules and no deselected globals.
- **no-globals — PASS:** all five workspace modules replaced; both global libraries remain exact. Staging interval: `2026-10-11T16:27:24.147Z` through `2026-10-11T16:27:48.037Z`. Recovery preserves the prior workspace modules and excludes deselected globals.
- **prompts-only — PASS:** prompt records/history replaced with the documented retained recovery; workspace/Trash metadata, including every `updatedAt`, and collection payloads remain exact. The observed recovery/result export times are `2026-10-11T16:23:39.977Z` and `2026-10-11T16:24:06.793Z`; they do not permit workspace timestamp changes.
- **collections-only — PASS:** collection records/history replaced with exact prompt/version IDs and retained recovery; workspace/Trash metadata, including every `updatedAt`, and prompt payloads remain exact. The observed recovery/result export times are `2026-10-11T16:18:20.430Z` and `2026-10-11T16:18:50.273Z`; they do not permit workspace timestamp changes.

The earlier exploratory `full` set is deliberately excluded: its baseline preceded an auto-saved quote edit, so it is not the immediate pre-restore state. Its failed comparison is retained, not relabeled as a pass or a runtime defect. The clean `full-confirmed` repeat supplies the matching baseline/recovery pair.

Limits: these comparisons establish saved exported payload equality under the stated contracts. They do not themselves prove a same-profile upgrade from an authentic older released package, native disk durability after browser restart, browser-crash/quota behavior, cross-tab races, UI accessibility or additional platforms/locales. Source setup includes synthetic reviewed imports. Collections-only references in this sequential native lane can resolve from retained prompt recovery; a truly absent prompt-version UI case is not established by this dataset. Automated missing-reference and fault-injection tests remain distinct evidence. Do not infer that the checklist below is fully completed from these comparator passes.

## Native acceptance checklist and remaining coverage

Do not mark an item passed without its evidence. Use only synthetic content and an isolated cloud-browser profile; never publish a profile, credentials or personal data.

1. Establish authentic old-build provenance: record the actual released tag, commit, release asset URL and downloaded bytes/hash. Merely reading older GitHub source, changing a manifest version or importing a synthetic schema-1 file does not prove an old-release upgrade.
2. Load that unpacked older release from a permanent directory. Record browser version, extension ID/path/version and exact runtime hashes. Save data through supported native controls; export a baseline. Record which features actually exist in the chosen old release instead of inventing prompt/collection data it cannot support.
3. Close extension pages, replace runtime files in the same permanent folder, reload through Chrome's extension controls without removing the extension, then reopen. Verify the same extension identity, new version and retained old data. Keep the original installation/baseline available until checked.
4. On the current candidate, use native controls to prepare source A and different destination B: two live workspaces plus Trash, tasks/history/pin, multilingual note, countdown and Focus preferences, archived/live prompts with older body versions, and collections linked to exact older prompt versions. Export A and B and confirm completed downloads. If supported UI imports are used for fixtures, record exactly which ones; do not call injected storage native setup.
5. Choose A with the native picker. Review all seven module counts, all-workspace/Trash replacement scope and both separate global destinations. Exercise missing destination choice, cancel/Escape, an unsaved editor refusal and changed module selection. Export again and compare unchanged B saved payloads.
6. Complete the confirmed seven-module restore, preserve drafts and use the separate Reload control. Export the result and pre-restore recovery file. Compare payloads with the verifier; visually inspect recovered Trash and open the exact linked older prompt body. Verify in a newly opened extension page after closing previous pages.
7. Repeat selective restoration with both global libraries deselected; export and compare exact globals to B. Restore collections without prompts and confirm exact unresolved links rather than relinking by title. Verify workspace-only and global-only scope separately.
8. Import a genuine supported older schema-1 export: review the explicit live target, confirm non-target workspaces and Trash unchanged, and verify the destination after reopening. Record genuine file origin; synthetic legacy compatibility is only automated evidence.
9. Capture keyboard focus, cancellation and readable review/recovery controls in Chinese and English, both themes and a narrow window. Spanish is a documentation locale, not an implemented UI-locale claim.
10. Do not simulate browser crashes or quota failures by claiming ordinary reload coverage. Record untested crash, disk durability, provider/account, cross-tab race, quota and platform variants explicitly. The automated fault matrix supports the safety contract but cannot certify those native outcomes.

Archive only verified synthetic downloads and original screenshots with source hashes and capture provenance. Keep pending items visibly pending when reporting a release.
