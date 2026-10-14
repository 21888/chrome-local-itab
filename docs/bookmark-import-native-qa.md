# HTML bookmark migration: release QA plan

Run against the complete frozen candidate, in a throwaway Chrome profile with no real accounts/bookmarks. Never replace a user's real dashboard to test. The importer must remain separate from JSON restore. Record browser/version, locale, viewport, candidate hash and screenshots.

## Native Settings UI and permission boundary

1. Load the candidate unpacked and open Settings → Data management in English and Simplified Chinese. Inspect light/dark mode at desktop and ~360 px width. The browser-bookmarks section must be distinct from JSON import/export. Check readable contrast, wrapped full folder labels, no overflow, correctly associated file picker/review labels and status announcements.
2. Choose each synthetic `tests/fixtures/bookmarks/{chrome,firefox,edge}.html`. Review counts/reasons/mapping against fixture output, then Cancel. Check local storage unchanged. Repeat and Escape. Review is inline; Escape must not affect unrelated controls or steal focus from elsewhere.
3. Choose a different file while a large first file is still reading. Only the latest file may own preview or error. Cancel during reading, then choose again; the old response must not replace the new one. The same file must be selectable after cancel/failure/success.
4. Use keyboard only: reach the file button, file picker, Apply/Cancel, and scrollable mapping. Repeated Enter/Space must not duplicate import. Check Escape, focus restoration and no focus jump after the user moves focus elsewhere. Verify file picker cancellation does not destroy unrelated settings edits. The bounded result below covers preservation of an unrelated Countdown draft; it does not close the other checks in this item.
5. Files above 10 MiB reject before text reading. Malformed/unsupported exports and hostile script/IMG/BASE/ICON data show bounded plain-text feedback with no HTML rendering, script execution or requests. A 2,000-link/200-category import should render only summary, mapping and bounded reasons, not 2,000 preview cards.
6. Manifest permissions are unchanged: no bookmarks permission. With Sync/online icons disabled, instrument fetch/XHR/Image or inspect DevTools Network during file selection, preview and Apply. No import network request should occur. Do not generalize this to unrelated extension providers.

## Transaction, privacy and category ownership

7. Seed unrelated links, duplicate URLs, same-name categories, positions, wallpaper, recovery copies, Tasks and a running Focus session. Snapshot raw storage. Apply. Existing records and positions remain exact; imported bookmarks/categories append with fresh category IDs, glyph icons and correct source-folder identity. The import uses one local set transaction, not one write per bookmark.
8. Repeat the same import: all canonical duplicates skip and Apply writes nothing. Queries/fragments remain distinct. Existing category names never cause merging; repeated source-folder names remain separate.
9. Keep two Settings tabs. Preview in A, change a link/category/layout identity in B, then Apply in A: require fresh preview and no mutation. A coordinate-only move in B survives successful A Apply. Reset/JSON restore in B after preview must invalidate it.
10. Preview with Sync/icons disabled; change either setting, then Apply: require fresh preview. Preview again and inspect the new disclosure. Do not enable real remote providers for this test without permission; preference-change testing may use an isolated fixture. When enabled already, imported links may later sync and normal dashboard icon behavior may contact providers; importer must not silently disable settings.
11. Dirty category name/icon/order/blank/new-row edits block preview/Apply until saved. While Apply is pending, category controls and repeated Apply/Cancel must be disabled. Inject a newer programmatic category edit during pending write: preserve it and leave its older CAS baseline, so subsequent save conflicts rather than dropping new imports. After normal success, category form shows imported categories; other unsaved settings fields retain their input.
12. Simulate rejected write, accepted-write/failed-readback and missing Web Locks. Never claim success for ambiguous results; no retry/rollback; fresh preview deduplicates any actually committed links. Cancel/Escape cannot pretend a pending write was cancelled. Configuration reload guard must defer reload while reading/reviewing/applying.

## Existing features

13. Switch grid/free/snap; drag existing and imported tiles. Existing duplicate identity maps remain unchanged; new identity-mode links have independent fresh IDs. Legacy mode is not migrated by import. Finder locates and opens the imported bookmark using current saved data.
14. Export JSON after import; validate and restore it in another throwaway state. Links/categories/positions round-trip. Existing whole-backup replacement confirmation remains unchanged. Tasks/Focus and their recovery data stay outside configuration backup boundaries.

## Evidence and limits

Automated tests model native file reads, storage, event ownership and races; they do not certify Chrome's real file picker, native keyboard behavior, screen-reader announcements, focus painting, quota behavior or OS/browser render performance. Native checks beyond the bounded observations recorded below remain release gates, not claims inferred from a passing Node suite.

### Item 4: unrelated Countdown draft preservation — 2026-10-14

English/light mode in Chrome 155 exercised the complete production Settings page from commit `15709ffad69b31ad8fdb84a28c4f9af64fa1410e` (version `1.1.134`). All 123 production runtime files, the Settings body and its 41-script order were preserved; platform storage used isolated synthetic RAM, with a read-only test observer. Only synthetic data and an `example.invalid` bookmark were used.

- Edited the saved Countdown title and date without saving. After cancelling the native HTML file picker and returning to Countdown, the exact draft remained visible and Save remained available.
- Selected the synthetic bookmark HTML through the native picker, reviewed its import preview, then pressed Escape. Returning to Countdown again retained the same unsaved title/date and enabled Save. Both cancellation paths left the entire saved RAM state unchanged, with zero import writes and no Apply action.
- One explicit Countdown Save then made exactly one local write: only the Countdown title, date and revision (3 → 4) changed inside its workspace bundle. All other saved data remained exact. Initialization had completed before the draft baseline; startup and workspace-accounting writes were also zero in this fixture.

Three separate actual-module model branches covered picker cancellation, the preview Cancel button and preview Escape followed by explicit Countdown Save. The Cancel-button branch is model coverage only in this added draft-preservation check.

This result covers native interaction with the full Settings UI over synthetic RAM. It does not establish installed-extension storage behavior, disk durability, other unsaved Settings forms, keyboard-only completion of the full flow, or the remaining accessibility, race, permission and performance checks above. No production code or version changed.
