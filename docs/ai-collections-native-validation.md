# Native acceptance summary — 2026-10-10

The bounded native gate passed against the frozen 82-file collection candidate (manifest 1.1.21). Release-source 1.1.24 changes only the manifest version; all other runtime bytes match the final tested candidate. This is a local candidate, not evidence of publication.

[Native flows, screenshots and untested scope](qa/collections-native/acceptance-notes.md) · [Exact original-download comparisons](qa/collections-native/comparison.json). Reproduce with `cd docs/qa/collections-native && node verify.cjs` from the repository root.

Post-fix aggregate regression passed 1442 Node tests and 52 Python tests. Native checks covered manual literal text, notes, search/filter, metadata-only editing, reviewed body/history changes, archive/restore, stale-tab drafts, actual standalone exports and source-omission copies, complete-backup replacement and exact prior-state recovery. Desktop light and 553-pixel outer-window dark layouts were sampled.

Native QA found and retested missing default theme attributes, a case-insensitive heading locale-key collision, and generic task labels in collection backup counts. Earlier independent review fixed standalone export double serialization; actual downloaded bytes now parse exactly once. Native Unicode/IME, exhaustive layout/keyboard matrices, capacity faults and interrupted-restore behavior remain unverified.

## Original comprehensive checklist (not all executed)

# AI result collection: native validation checklist

## Scope and implementation status

The standalone collection page is an implemented local manual-capture surface. It
reuses the prompt library's appearance tokens and layout primitives, with a
separate small collection stylesheet. It requires the coordinated workspace
manager's `createCollectionBackend(Core)` and fails closed when unavailable.
There is no fallback writer, provider execution, conversation scraper, remote
preview, new permission, credential field or workspace membership relationship.

This UI preserves exact user-pasted excerpts and stores annotations separately.
Metadata changes cannot revise excerpt bodies. New body versions and historic
restores require a current/proposed text review and explicit acceptance. Prompt
references retain exact prompt and body-version IDs and are visibly unresolved
in this first slice; no latest-version fallback is attempted. Collection-only
JSON export includes archive, history, annotations and recovery. Import/recovery
replacement belongs to the complete-backup review integration, not this page.

## Automated checks completed

- `node --check collections.js`
- `node --check shared/local-ai-collections-controller.js`
- `node --check shared/local-ai-collections-view.js`
- `node --test tests/local-ai-collections-ui.test.js tests/local-ai-collections-store.test.js`
- 46 focused tests passed (17 UI/controller + 29 core tests).
- UI/controller checks cover exact capture, notes separation, reviewed versions,
  archive/restore, filters, unresolved links, pending-write retries, cross-tab
  fences, conflict-as-copy, text-only rendering, source-host visibility,
  duplicate cancellation, textarea identity during typing, modal IME Escape,
  kept proposal resumption, proposal-as-new overwrite prevention and catalogs.

These are model-DOM tests, not native browser or visual validation. No browser was
launched and no full suite or package build was run for this isolated slice.

## Native checks still required after integration

1. Load the unpacked extension with collection backend, core, UI, English and
   Chinese catalog additions and packaging allowlist merged. Open from new tab
   and prompt library; verify links and back navigation. No manifest permission
   changes should be present.
2. Check light and dark appearance, English and Chinese, 1440/1024/768/390 px
   widths, keyboard focus rings, 200% zoom, sidebar overflow, long titles/tags,
   long source URLs and long preformatted text. Capture actual screenshots.
3. Paste CRLF, tabs, trailing spaces, emoji and literal HTML/Markdown. Save,
   reopen and export; inspect exact bytes. Verify nothing renders as active HTML
   and no source/image/preview request appears in the network log.
4. Add notes, tags, tool label and a type. Search title/body/tags; intersect type,
   tool and tag filters. Notes/URL/history are intentionally not search fields.
5. Save an exact duplicate with and without a source. Cancel then accept the
   duplicate suggestion; verify separate IDs and no merging. Include an archived
   duplicate. Keep multiple metadata drafts and switch between them.
6. Edit metadata and confirm excerpt remains read-only. Revise the excerpt,
   cancel the proposed-input or current/proposed review, then resume the kept
   proposal. Accept once and verify earlier history remains. Restore historic
   text as a new reviewed version. Verify double-clicks do not duplicate saves.
7. In a second tab, edit the same record during metadata editing and during a
   proposed revision. Confirm stale saves are refused, draft/proposal remains,
   and saving as a separate new item never overwrites an existing new-item draft.
8. Simulate unavailable local storage, read failure and post-write verification
   loss. Confirm safe error UI, retained draft and exact-operation retry. Repeat
   while a coordinated complete-backup restore is pending; no fallback writes.
9. Use a source URL with a nondefault port and an internationalized hostname.
   Confirm the actual parsed ASCII host is visible, original URL is selectable,
   the source opens only on a click, and opener/referrer access is suppressed.
   Reject credentials, JavaScript/data/file/scheme-relative URLs.
10. Link an exact prompt/version ID, then change/delete/restore prompts elsewhere.
    Confirm both IDs remain unchanged and unresolved, with no implicit relinking.
11. Archive and restore an item; verify body/history/notes/reference identity.
    Reach 20 body versions and collection/size limits. Confirm proposals remain,
    no history or archive is evicted, and proposal-as-new creates a draft.
12. Download normal and omit-source-URL exports after the privacy review. Verify
    active/archived records, versions, notes and snapshots; drafts are excluded.
    Confirm omit-source-URL affects the exported copy only, including snapshots.
13. Test Escape during IME composition, Tab/Shift+Tab dialog containment, Cancel
    focus restoration, Ctrl/Meta+S in an editor, repeated keys, page close and
    navigation warnings with metadata drafts, proposals or uncertain writes.
14. Test complete-backup collection selection and restoration separately using
    the backup worker's native checklist, including legacy backup preservation.

## Integration inputs

Apply core patch and coordinated backend/backup patch before the UI. The UI patch
adds only collection page/assets/controller/view/tests and this checklist. The
separate proposed-entry patch adds new-tab and prompt-library links plus runtime
packaging entries. Merge the two `itab-collections-locales-*.json` object fragments
into the existing locale objects; do not replace a catalog wholesale. No version
bump, commit, push, manifest change or cloud sync-scope expansion is included.
