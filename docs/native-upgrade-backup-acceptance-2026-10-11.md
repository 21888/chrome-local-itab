# Native upgrade and complete-backup acceptance, 2026-10-11

## Result and evidence boundary

Bounded acceptance passed for same-path **1.1.21 → 1.1.39** and **1.1.32 → 1.1.39** upgrades, a genuine schema-1 export restored into an explicitly chosen non-default workspace, and five current-format restore cases: all seven modules, Scratchpad only, all five workspace modules without globals, prompts only, and collections only.

These results combine native Chrome interactions/downloads with independent read-only payload comparisons. They supplement, rather than replace, the [automated acceptance contracts and remaining checklist](upgrade-backup-acceptance.md). The [older five-module report](complete-backup-native-validation.md) remains historical evidence. No claim here covers full browser-process restart, browser crashes, disk failure or all platforms.

Testing used Chrome for Testing **155.0.8059.39** in isolated, signed-out cloud-browser profiles with fabricated content. No user device, real account, credentials, sync or paid service was used. Browser input, file selection, downloads and extension reloads used native controls; no browser storage/script injection was used. Raw exports, original screenshots and profiles are not published with this report. The hash inventory below identifies retained JSON bytes without disclosing their contents or machine paths.

## Runtime provenance

All three ZIPs were existing local build bytes, **not newly downloaded release assets**. For 1.1.21 and 1.1.32, the complete ZIP digest matches the published release asset digest, and every runtime file matches the corresponding remote tagged tree. Thus the tested provenance is “published-digest/tag-runtime-matched local bytes.” The stricter checklist item requiring a newly captured old-release download remains open.

| Runtime | Source identity | Runtime files | ZIP SHA-256 |
| --- | --- | ---: | --- |
| [1.1.21](https://github.com/21888/chrome-local-itab/releases/tag/v1.1.21) | Tagged commit `9e3fa8848daafd1b1390415a82bb7ba5d295dcab` | 66 | `4ea7600c0c6f6538d212f558fa8f2aa62314fdceb0f253c9f9bf691349ece674` |
| [1.1.32](https://github.com/21888/chrome-local-itab/releases/tag/v1.1.32) | Tagged commit `b9476dca08b6311ddabbad034674971d24f013e0` | 89 | `c6fdfa0c8d354ee766fc890d99090b63158ca7c821a7f688438b25a0d40202f4` |
| 1.1.39 | Tested candidate `ba8af972cccb026ea01a355d3ba1788eecf0460a` | 90 | `18a6dd3fc5ff72f008f48e504de47afdd5de8044f4fbd03d06d5a236767378e6` |

The current-runtime identity is the tested candidate's verified runtime, not an assertion that a fresh 1.1.39 release asset was downloaded. Later acceptance-tooling changes do not alter these runtime bytes. The 1.1.21 pre-upgrade inventory matched all 66 snapshot files (manifest SHA-256 `2495e26eb31b0e3643cc62ef6112ec207c241ed5eec01989b9afa3ffd6c359ae`); the replacement inventory matched all 90 current lane files (manifest SHA-256 `2ed3971b8f7627695bd821d4304624e639cb38060b615a8a1d6050d7b35e1577`). Source/tag commits can differ from the earlier local packaging commit while producing exactly the same runtime; provenance was checked by bytes, not inferred from a version label.

## Same-path 1.1.21 → 1.1.39: PASS

1. Loaded the verified 66-file 1.1.21 runtime into a permanent unpacked-extension directory in a new signed-out profile. Recorded extension ID `nfieddlohiapnmpkbgmgbemjboonodan` and visible version 1.1.21.
2. Used supported controls to create an `example.com` shortcut, an active and a completed task, multiline English Scratchpad text with a final newline, an enabled 2027-03-15 countdown, and idle Focus preferences of 31 minutes plus a 5-minute break. Exported the genuine five-module schema-1 baseline and confirmed its download.
3. Closed extension pages, replaced only runtime files inside the same permanent directory with the 90 verified 1.1.39 files, and used Chrome's extension Reload control. The extension was not removed; its ID and installation path remained unchanged. Browser-profile data was not edited.
4. Opened the upgraded extension and exported retained data. Closed the extension pages, reopened fresh dashboard/settings pages, and exported again.

The five original module payloads migrated into one Default live workspace, with no Trash and empty new prompt/collection libraries. Tasks retained exact IDs, mutation versions, timestamps and state; the note retained its final newline; Countdown and Focus were exact. Configuration was exact except that schema-1 `privacy.onlineFavicons: false` is omitted from current portable workspace configuration because privacy is device-global. Native settings confirmed online favicon fetching remained off. This is a specific format-boundary exception, not permission to ignore arbitrary configuration differences.

The reopened-page export equals the initial upgraded export except the top-level, prompt-library and collection-library export timestamps. Task recovery was empty, so this case does not establish nonempty legacy task-recovery migration. Native Chinese typing was unavailable in this lane; its manually authored legacy note was English only. Fresh-page reopening is not a browser-process restart.

## Genuine schema-1 → non-default workspace: PASS

The exact native 1.1.21 baseline above was selected in the current 1.1.39 backup lane. The input bytes were not converted or rewritten. Native review required an explicit live destination; Work was chosen. Cancellation followed by a new native export left the entire prior backup unchanged except its three export timestamps.

The confirmed restore replaced only Work's five module payloads. Task mutation tokens were renewed as required by restore; all other task fields remained exact. The same device-global privacy exclusion applies. Default, Trash and both global libraries remained exact. The schema-2 pre-restore recovery export retained all prior workspace modules and excluded the deselected global libraries. Work's staged `updatedAt` was `2026-10-11T16:43:20.440Z`, inside the recovery/result interval `2026-10-11T16:43:20.393Z`–`2026-10-11T16:43:54.830Z`.

## Current seven-module and selective restore cases: PASS

The seven modules are configuration, tasks, Scratchpad, Countdown and Focus per workspace, plus the global prompt and collection libraries. Fixture setup used supported, reviewed UI imports of fabricated model-generated archives; it was not entirely hand-authored. Actual baseline, restored and recovery files were then downloaded natively. Each case preserves the exact selected source as well as the immediate native before-state.

The source/target fixtures differ across two live workspaces, a Trash workspace, saved content and preferences. They include task history/recovery, multilingual notes, live/archived prompts and collections, immutable older prompt bodies, collection revisions, exact prompt/body-version references and library recovery history.

Native review checked seven-module counts, all-workspace/Trash scope and separate explicit global destinations. Missing destinations blocked replacement. Escape cancelled review and returned focus to the chooser; Enter reopened the picker. Changing selected modules refreshed scope, and explicit Cancel closed review. A real unsaved Countdown title draft blocked restore and remained visible. A confirmed restore used the separate Reload control after success, with completed result/recovery downloads. Native inspection showed restored workspaces/Trash and the collection's exact older prompt body, including Chinese text and emoji.

| Case | Verified scope and retained data |
| --- | --- |
| `full-confirmed` | All seven modules restored; records, immutable versions and exact prompt references match the reviewed source under the documented token/revision/recovery rules. Recovery matches the immediate native baseline. |
| `scratchpad-only` | Saved notes replaced; other portable modules and both global libraries unchanged. Recovery contains prior workspace modules, without deselected globals. |
| `no-globals` | All five workspace modules restored; both global libraries exact and excluded from recovery. |
| `prompts-only` | Prompt content/history restored with documented recovery retention; all workspace/Trash metadata and collection payloads exact. |
| `collections-only` | Collection content/history and exact prompt/version IDs restored with documented recovery retention; all workspace/Trash metadata and prompt payloads exact. |

All five cases pass the [repaired independent comparator](qa/upgrade-backup-acceptance/verify.cjs). All 20 input JSON hashes remained unchanged during verification. The comparison allows only documented export timestamps, required renewed mutation tokens/revisions/recovery history, and selected-workspace staging timestamps bounded by the actual recovery/result export times. Unselected payloads are not broadly normalized. Global-only cases require exact workspace timestamps. See the [timestamp contract](upgrade-backup-acceptance.md#workspace-staging-timestamp-contract) for the precise rules and rejection tests.

Collections-only references in this sequential lane resolve from retained prompt recovery. This demonstrates exact historical resolution; it does **not** establish the native UI behavior when the referenced prompt version is genuinely absent. Missing-reference model tests remain separate evidence.

### Excluded exploratory result

The earlier `full` run is not counted as a pass: its baseline preceded an auto-saved quote edit, so it was not the immediate pre-restore saved state. Quote Text auto-saves and was not a valid unsaved-draft test. That mismatch and the original failed comparison were retained; the clean `full-confirmed` repeat supplies the correct baseline/recovery pair. Separately, original comparator failures on legitimate staged `updatedAt` values were tooling defects, addressed by a bounded timestamp contract without rewriting raw evidence or runtime behavior.

## Same-path 1.1.32 → 1.1.39: PASS

Loaded the verified 89-file 1.1.32 runtime in a separate permanent unpacked-extension directory and isolated signed-out profile. A supported, reviewed complete-backup import seeded all seven modules from the fabricated source. Native controls then appended a new prompt body revision and a reviewed saved-result revision. Both live records had three immutable body versions: the original two imported versions plus the native 1.1.32 edit. The native baseline included two live workspaces, one Trash workspace, and one archived record plus one recovery entry in each global library. The collection still referenced the exact oldest prompt body version, `source_global_2`.

After closing all extension pages, the runtime files were replaced inside the unchanged directory with the verified 90-file 1.1.39 runtime. Chrome's extension Reload control showed 1.1.39 with the same extension ID, `ablbnnafhffkhphcigfbkdlemepmlnbp`. The extension was never removed and profile data was not edited. Native checks showed the retained third versions, all three saved-result excerpt histories and the exact oldest linked prompt body with Chinese text and emoji. All extension pages were then closed and fresh pages reopened before a further export.

Independent comparisons of baseline → upgraded and upgraded → reopened passed: each entire seven-module archive is exact except the top-level and both global `exportedAt` fields. No workspace timestamps, task/library mutation tokens, revisions, archived records, recovery entries, immutable version bodies or exact link IDs changed during the upgrade. Nonempty task recovery was preserved: one entry each in Default, Work and Trash. All three native exports are 14,625 bytes. The old inventory matched all 89 snapshot files (manifest SHA-256 `e0ce243ebb52392aa6b3d15d9456a046763cc0a1e1a5470d659a1af7f19f1250`); the replacement inventory matched all 90 current lane files. This establishes the tested UI-import-seeded, manually revised same-path upgrade and fresh-page reopening, not wholly hand-authored fixture setup or browser-process restart durability.

## Remaining coverage

- Freshly downloaded old-release asset installation, rather than existing digest/tag-matched local bytes.
- Full browser-process restart, packaged CRX auto-update, downgrade, crash/kill recovery, disk/quota failure and native uncertainty-fence recovery.
- Cross-tab races, real-user migrations, account/provider flows and other operating systems/browser variants.
- A genuinely missing prompt-version reference in the native collections-only UI.
- Nonempty task recovery in the manually authored legacy 1.1.21 lane.
- The full Chinese/English × light/dark × narrow-window accessibility/focus matrix. Multilingual imported content is not full locale coverage; no Spanish UI claim is made.

This bounded report does not mark the complete [native acceptance checklist](upgrade-backup-acceptance.md#native-acceptance-checklist-and-remaining-coverage) finished.

## Retained raw JSON SHA-256 inventory

Paths below are case-relative evidence identifiers, not download links. Raw exports, screenshots and browser profiles are deliberately not included in the public repository. Hashes identify the preserved original bytes; they do not independently prove native provenance or make the raw evidence publicly reproducible. Runtime inventories and comparison logs are separate from the raw backup files listed here.

```text
8fa29720ecaba6ea76efca30aced06b5ffdc8cc83dbd053aa18d164c0b792b05  collections-only/baseline.json
b70276efc30cbe7ccd01801622d51bc7cfc89290e5d45e5b65955d2e330540a7  collections-only/recovery.json
f8fac725de8a9008f03c2c57f8541435648f5cd59a3004487db1f9fdf2483564  collections-only/restored.json
7ab393015ba8e99c1277e5a078b51a5ffd4da3602ef818d4e631585fdda04827  collections-only/source.json
8ccb2acfc1429696880b182d5ed53e548798fe84250d36d0803ae96265de8254  full-confirmed/baseline.json
52f98edb1be390c99df6c4f74f1b3f5999dcaffa3b8b76dcea094a73b26aefff  full-confirmed/recovery.json
8fa29720ecaba6ea76efca30aced06b5ffdc8cc83dbd053aa18d164c0b792b05  full-confirmed/restored.json
29859386c0cdea2183dc951530dd51329a8df6daa26e679db203c2ce328f33b6  full-confirmed/source.json
791b55266a88cafe001d28269f3b6e872e3cda65067b36bcb3fa3902967bfe52  no-globals/baseline.json
6204ff645cdc8e58c106fcb128668854416baa5f9a78a52d45a911346462ea49  no-globals/recovery.json
e4ea2643da489025b99aee6e40e7af9497b023061f36e854473814d170310d08  no-globals/restored.json
7ab393015ba8e99c1277e5a078b51a5ffd4da3602ef818d4e631585fdda04827  no-globals/source.json
f8fac725de8a9008f03c2c57f8541435648f5cd59a3004487db1f9fdf2483564  prompts-only/baseline.json
addddd0d3f284ee0918f4b895a4d1e407c5ce5b02c64973e5ac1c8429f7e05b1  prompts-only/recovery.json
9df88f3dbd0250f313f451fe8dd22152498b3b3a74acb13ecbc134537d5f17d8  prompts-only/restored.json
7ab393015ba8e99c1277e5a078b51a5ffd4da3602ef818d4e631585fdda04827  prompts-only/source.json
e4ea2643da489025b99aee6e40e7af9497b023061f36e854473814d170310d08  schema1-nondefault/baseline.json
c8710f5032af6aa678160ae7181f493c3442264838a7b30175e48014b47ead9e  schema1-nondefault/cancelled.json
beaa4c5426b14fa2fa634d4bf920427d7c0f240d05e8509a41d70d03356e585f  schema1-nondefault/recovery.json
f6e29eded3b79e81d7f71fdc29dce93154872495d2dd10ecb10f3169bdf147ab  schema1-nondefault/restored.json
583062eaf691aed880daa60b0c3733ca13e43579a0ed73153bb506472dad4610  schema1-nondefault/source.json
9df88f3dbd0250f313f451fe8dd22152498b3b3a74acb13ecbc134537d5f17d8  scratchpad-only/baseline.json
8150084dea96f0eff991ae168877b38d7cd1b89afba3001018e0aa872b810ab0  scratchpad-only/recovery.json
791b55266a88cafe001d28269f3b6e872e3cda65067b36bcb3fa3902967bfe52  scratchpad-only/restored.json
7ab393015ba8e99c1277e5a078b51a5ffd4da3602ef818d4e631585fdda04827  scratchpad-only/source.json
583062eaf691aed880daa60b0c3733ca13e43579a0ed73153bb506472dad4610  upgrade21/baseline.json
8f6d0d41d00e428773d158c7069c53a95db991b110e01de9fa85b92be4e53da9  upgrade21/reopened.json
d2eae265005bb6d4ce6ae8841f3fd09e7b6291d6aed9abd94aacef5549c33400  upgrade21/upgraded.json
7341f7d33da32d75acb11284609426c3d07ddffe9822f102a4c622b06b90aed0  upgrade32/baseline.json
4f506dec7b5b544cca3759697663ddb64969727c56c4ab766729384950e34837  upgrade32/upgraded.json
230fce9ea5db098f6170737f8a10774c94bf198263ece7250fe54bac2cb63560  upgrade32/reopened.json
```
