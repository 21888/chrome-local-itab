# Undo the latest shortcut deletion / 撤销最近一次快捷方式删除

After confirming a deletion, use **Undo delete** on the same dashboard page. Only the latest successful deletion is retained in memory; reloading closes this opportunity. Later changes to shortcuts, categories, layout, schema, or the existing replacement generation can prevent restoration. Changes that return to exactly the same state are accepted. Other settings are neither restored nor overwritten.

确认删除后，可在同一首页点击**撤销删除**。只保留最近一次成功删除的内存凭据；刷新后失效。后续快捷方式、分类、布局、格式或整体替换版本的变化可能使撤销失效；完全回到相同状态则可接受。撤销不会恢复或覆盖其他设置。

Close any shortcut editor or confirmation dialog and finish arranging shortcuts before using Undo. Drafts are not discarded. Restoration inserts the original record at its original list position, with its existing independent layout identity and every saved view coordinate. Legacy duplicate URLs may acquire independent identities using the existing allocation logic; surviving identities and historic URL coordinates remain intact.

请先关闭快捷方式编辑或确认窗口，等待排列保存完成，再撤销。草稿不会被丢弃。恢复会将完整记录放回原列表位置，保留独立布局标识及各视图坐标。旧版重复网址可能通过已有分配逻辑获得独立标识；现有标识及历史网址坐标均保留。

## Safety boundary

- Dedicated deletion and restoration transactions use the existing origin-wide Web Lock. Receipts originate only from the lock's actual read and a verified write, never a later separate baseline read.
- Raw links/categories/layout, key presence, schema, and existing layout generation are compared structurally. Object key order is irrelevant; array order, types, and field sets matter.
- Restoration consumes its receipt once, including on conflict. It writes the current list plus the deleted record; categories and unrelated settings are never rolled back.
- An uncertain write or failed readback clears the receipt. The UI asks to reload and inspect; there is no blind retry or rollback. Chrome Sync scheduling is separately guarded outside the local lock.
- No recycle bin, durable undo key, new permission, cross-change merge, or additional global revision is introduced.

## Verification and native Chrome checklist

Automated storage tests: `tests/shortcut-undo-storage.test.js`. UI regression coverage accompanies the dashboard session tests. Native Chrome validation remains required before release:

1. Delete/undo first, middle, last, only and visually identical shortcuts; test two and three legacy duplicates.
2. In Grid, Free, and Manual placement, verify every visible/hidden category coordinate survives and no unrelated layout changes.
3. Use a second new-tab page or Settings to edit/reorder/import/restore/reset/Sync after deletion: restoration must refuse changed context. Returning to the exact original post-deletion context may succeed.
4. Double-click Undo; start a second deletion; reload the tab. Confirm one restoration at most and only the most recent receipt.
5. Keep Add/Edit drafts open during deletion; close them before Undo. During delayed writes, open an editor or focus the search field: drafts and focus must remain safe.
6. Exercise storage quota failures, write completion with failed readback, and delayed own `storage.onChanged` events. No optimistic success, rollback, or stale retry; delayed own events must not invalidate an otherwise valid receipt.
7. Verify English/Chinese wording, keyboard access, screen-reader status announcement, narrow viewport and dark templates. No focus automatically moves into the Undo control.

Automated model tests do not establish native extension or screen-reader behavior. An initially empty, always-mounted visually hidden status region is populated only after a verified deletion; the visible Undo button remains hidden when there is no receipt. Model tests cover this structure, not actual assistive-technology announcements.

### Recorded acceptance — 2026-10-09

The integrated runtime passed 217 Node tests, 19 Python packaging tests, syntax checks and deterministic package verification. Independent review exercised receipt lifecycle failures, unknown nested fields, full-state conflicts, unrelated settings, and delayed UI ownership. A second deletion that fails before writing preserves the previous verified receipt; a proven conflict or uncertain write clears obsolete receipts. These fault/race checks are models, not native failure injection.

Bounded native checks ran in official Chrome for Testing 155.0.8059.39 on cloud Linux with the normal sandbox. English Graphite/dark verified middle-item deletion and original order restoration, keyboard activation, and disabled Undo with an intact Add draft. With two real tabs, an intervening edit in tab B caused tab A's Undo to refuse and clear; refreshing preserved B's edit without restoring the removed item. Free and Manual placement restored a dragged item's observed visual position. Chinese Clarity/light at a 510×848 native window deleted the only shortcut to zero and restored it to one; the notice wrapped and the button remained visible.

The final native runtime used newtab.js SHA256 `49131fec90aee6cd7e28bda110b64954cf74dc9988a303642ec5269ffe55ce97` and storage.js SHA256 `27925ee294010d1f3602a85b6cb0229eceb27a84c7d0219cc63a85a40a0fc115`. Earlier basic-order/draft checks preceded the final live-region-only change; later conflict, Free/Manual and Chinese-only-item checks used it. The change adds no visible controls or layout.

Exact hidden coordinates/IDs, consecutive-delete receipt replacement, independent refresh-expiry behavior, quota failures, actual IME, screen-reader announcements, live Chrome Sync and other operating systems were not verified natively in this run. Model tests cover applicable local cases. Window dimensions are not asserted as CSS viewport dimensions.
