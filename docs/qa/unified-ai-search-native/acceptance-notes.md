# Unified AI search: bounded native acceptance

Completed 2026-10-11 UTC. No confirmed functional defects in the exercised scope.

## Environment and integrity

- Frozen runtime: `/workspace/shared/unified-ai-search-native-candidate/runtime`, manifest 1.1.25 as supplied. All 85 supplied file hashes unchanged after testing; see `source-integrity.json`.
- Official Chrome for Testing v155.0.8059.39, isolated synthetic profile in this evidence directory, cloud desktop only.
- All application input used native CUA screenshot coordinates and keyboard. No CDP, headless automation, injected app JavaScript, application/storage writes, or storage seeding.
- AT-SPI paste was unavailable, so text was entered with native individual key events. Screenshot-visible focus was tested; internal DOM focus was not inspected.
- No backup/export was needed or used for this bounded gate. No export bytes or export verifier are claimed. Profile/logs are local test state and excluded from sanitized evidence.

## Exercised results

1. Created prompt `aurora prompt` with body `aurora <b>literal</b> {{topic}}` via UI; saved with Ctrl+S.
2. Created collection `aurora collection` with exact excerpt `aurora <i>exact</i> & plain` via UI; saved with Ctrl+S.
3. Edited original collection title to `aurora collection draft kept` without saving, keeping that tab open.
4. New-tab Search AI library opened a dialog. Query `aurora` returned both saved records. Prompt filter showed one prompt; AI excerpt filter showed one collection. All types showed both. Angle brackets, braces, and ampersand remained literal. Unsaved draft title was not substituted for the saved title. Evidence 01.
5. From query, Down/Down visibly focused prompt; Enter opened the exact prompt in a new tab with its record query ID. Original source tab still showed its unsaved collection title. Evidence 02.
6. Returned to search tab; Up then Enter opened exact collection in another tab, with saved title and exact body.
7. Archived that synthetic collection via UI, then reloaded its exact record URL. Page showed archived notice, no selected record or fallback. Evidence 03. Reopened search afterward showed only the active prompt.
8. Prompt record URL with `record=missing` showed invalid-link notice while the first saved prompt remained visible but unselected. Evidence 04.
9. Prompt record URL with valid absent UUID `00000000-0000-4000-8000-000000000000` showed missing-record notice and explicitly nothing else selected; saved prompt remained unselected. Evidence 05.
10. Escape from dialog restored visible blue focus outline to Search AI library opener. Enter reopened dialog. Evidence 06.
11. Resized native Chrome window to 556 by 848 screen pixels (Sky inventory), 100% zoom. Light and dark search dialog samples remained readable, within window, with usable inputs/type selector/actions and visible keyboard-result focus. Evidence 07 and 08. This is a bounded sample, not an exhaustive responsive audit.

## Limits

Real OS IME composition and forced storage read-fault/retry injection were not exercised. No claim of those native paths passing. No full backup/restore repeat. Archived guard sampled on collection; invalid/missing guards sampled on prompt. Exact chosen-record opening exercised on both record types.

## Evidence

Eight original full-desktop screenshot JPEGs are in `evidence/`; bytes saved directly from CUA screenshots, without synthesis or editing. Sanitized archive includes these screenshots, this report, original source hash manifest, and after-test integrity result, but no browser profile or logs.
