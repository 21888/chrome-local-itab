# Bookmark export and multi-workspace Finder: bounded native acceptance

2026-10-27, cloud Linux Chrome. These two actual UI journeys close distinct gaps explicitly identified by the existing guides; neither required a production change. Both use lawful synthetic workspace data, the real production renderer/controllers and a separate synthetic Chrome-storage bridge. No real bookmarks, account, provider, user device or file selector was accessed.

## Two-stage bookmark export, port 8814

The historical [bookmark export evidence](bookmark-export.md#historical-chrome-download-and-import-2026-10-09-previous-one-step-export) tested the earlier one-step exporter, not the newer scope preview. This run used all 138 runtime files matching local `7f91cb5ac9f34f9f7015b69b8fc924b8256b19e2` (remote `29761cec4b93437fd3a4bf7fae38f4588919ef92`). It tested **export only**, never import or a browser-bookmark API.

The saved source contained three sites and three categories: two categories shared the same name but had distinct IDs, the third was empty, two sites shared a URL, and strings included Chinese and HTML delimiters. Native controls exercised:

1. Privacy confirmation -> Cancel: no preview download/Blob capture.
2. Confirm -> All preview: **3 sites / 3 folders**. Keyboard selection of `Same & folder (ID: reading)` showed **1 / 1**, distinguishing it from the same-name Work category.
3. Cancel preview: no capture and focus returned to Export bookmarks HTML. Opening again reset the scope to All; no scope preference was persisted.
4. Empty category: **0 / 1**. Native Tab then Enter on Download reviewed scope captured exactly **247 UTF-8 bytes**, equal to the actual serializer's expected empty-folder HTML.
5. Reopen All -> explicit click Download: exactly **616 bytes**, equal to expected HTML with all three sites, three folders, duplicate URL, Unicode and escaped delimiters. Neither export included the seeded private-module/quote sentinels. Both object URLs were revoked; none remained active.

**Preserved test-design correction:** hour12 and quote fields use the existing one-second, change-triggered automatic save. The initial intention to treat those edits as unsaved drafts was incorrect. Two ordinary settings writes completed, and the visible readback confirmed the edited quote was already saved. Accordingly, the fixture's original `savedRawUnchanged=false` result is retained, not misreported as a product defect. All subsequent preview/cancel/download actions kept the write counter at **2**, meaning **zero additional export writes**, not zero writes for the entire journey. This run does not establish unsaved-settings preservation.

The download sink captured Blobs in memory, not OS files. No actual browser import, asynchronous saved-state race/read failure, assistive-technology behavior or upgrade acceptance is claimed. There were no captured application errors. Owned tab 74, server 8814 and its dedicated Terminal tab were closed normally at 09:19 UTC; the original blank tab 69 remained untouched.

## Finder across two actual synthetic workspaces, port 8815

The earlier [saved-site acceptance](saved-site-browser-acceptance.md) explicitly used only one synthetic workspace and did not activate a result. This run used 138 runtime files matching local `6ab7ec578d04368cb9a99edf5e6f3bfb20fec942` (remote `120d936239af63bfefb3c42c9a4724310127771d`). The only runtime change from the first journey was the independently tested Drive-retention fix; it is not part of these Finder results.

Two valid active workspace bundles contained six sites. Four shared the same title and URL, with copied layout IDs across workspaces and two distinct IDs within each workspace. All workspaces + `Shared` showed **four distinct results**, each labeled with its workspace. Selecting the second workspace's Work category showed exactly **two**, despite identical category IDs/names across workspaces. Clear retained All scope while resetting the query/category; `Other only` then showed one result from the other workspace.

Native activation reserved a **real `about:blank` tab**, not a successful-open stub. The production identity/read/lease path navigated that same owned tab to `http://127.0.0.1:8815/target-other.html`, whose heading was **Synthetic other target**. The target was a static loopback document with no scripts or external resources. Closing it returned to the source Default workspace. Escape restored the Finder opener. Reopening started with Current workspace, empty query and Continuous phrase.

Final visible evidence recorded **zero synthetic storage writes**, complete serialized saved-state equality, `lastUsedId=default`, one `window.open('about:blank', '_blank')` call and no captured errors. Thus the saved tasks, notes, layout and workspace registry remained unchanged; no source workspace switch was used to obtain the destination. This establishes bounded real-tab loopback activation, not arbitrary network-site behavior, system clipboard use, installed-extension operation or uncooperative-writer concurrency. Owned tabs 75/76, server 8815 and its dedicated Terminal tab were closed at 09:51 UTC; inventory contained no Electron and only the original blank tab 69.

## Scope and retained gates

The latest runtime baseline had independently passed **17,322 Node tests and 91 Python tests**, with exact-source CI successful for the Drive fix. Those counts are not new runs for this documentation-only batch. `git diff --check` passed. No screenshots, logs, fixture binaries, personal data or credentials are included here. No schema, permission, version, Release or Web Store change is made. Historical data-loss investigation and the outstanding import approval remain unresolved.
