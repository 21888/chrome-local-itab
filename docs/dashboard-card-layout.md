# Card order and width / 卡片顺序与宽度

Open **Customize → Card order and width** on the dashboard or Settings.

- Move any information card earlier/later with its labeled arrow buttons. Numbers show its place; the miniature preview includes all eight cards, even disabled cards.
- **Keep template structure** lets a new order-only customization preserve the selected template, including Today and Folio’s desktop card sidebar. The schematic separates shortcuts and cards; the dashboard itself is the live preview.
- **Custom grid below shortcuts** supports widths of 1–4 grid columns, using the chosen Grid columns value or 3 when blank. Choosing any width or column count switches to this mode. Switching back to template structure clears custom widths and columns in the preview but keeps order; Cancel restores the saved values.
- Existing saved layouts and older backups with order, width or column overrides keep their previous grid behavior until you explicitly change mode. No automatic migration rewrites or reorders them.
- A requested width is capped by the number of available columns. Screens up to 1000 px use at most 2 columns; up to 620 px use 1. Stored widths remain unchanged when the screen narrows.
- Rows grow automatically to fit content. This is not a fixed row-count or free-position card editor. Placement follows reading order without dense backfilling; wide cards may leave a gap before the next row.
- Hidden cards retain order and width but stay hidden. Enable/disable them in their existing controls. This editor never enables a module or changes a card's content.
- Preview does not write settings. **Cancel** restores the latest saved layout. **Restore card order and widths** resets card order, widths and explicit layout mode in the preview (the separate column count is kept); **Reset preview** resets all customization. **Save** commits the preview.

Saved order also becomes DOM/keyboard reading order. Existing card elements are moved, not rebuilt, preserving notes and other in-progress module input. Shortcut Free coordinates, shortcuts, module data, templates and palette remain separate.

Unsaved customization, incomplete invalid input and an in-progress Save now defer the shared configuration reload and request the existing best-effort browser departure warning. Opening without changes is clean; Cancel and confirmed Save release the guard. The workspace lifecycle never saves this preview automatically. Chrome decides whether to show a departure prompt, so explicit Save remains necessary. See the [Workspace-backed lifecycle validation and native limits](customization-workspace-lifecycle-validation.md).

## Persistence and safety

`appearance.customization.cardOrder` is null (default) or an exact permutation of the eight known information-card IDs. `cardSpans` is null or a known-ID map of integer widths 1–4. Unknown/duplicate/missing IDs, malformed maps and out-of-range values fail import validation. Old backups without these fields keep default behavior. `cardLayoutMode` is null (legacy interpretation), `template`, or `grid`. Complete archives may omit this optional field without being rewritten; unknown modes are rejected. Configuration/manual/Drive backups round-trip these preferences; these fields contain layout choices only.

Writes use the existing immutable workspace session, write lock and settings generation fence. Order is compared structurally against the opening snapshot; layout mode, width map and column count are checked together so a stale save cannot silently override another tab’s geometry change. Unrelated appearance fields merge. Conflicts keep the preview and require reopening. Switching the selected workspace cannot redirect an open page's save; deleted/replaced workspace sessions fail closed.

## 中文

在新标签页或设置页打开「自定义 → 卡片顺序与宽度」。用带名称的上下箭头调整顺序，选择卡片宽度占 1–4 列。预览包含全部八张卡片，不会自动打开隐藏模块。

首次仅调整顺序时保留所选模板结构，包括 Today 与 Folio 在桌面上的侧栏。布局选项与示意图明确区分模板结构和快捷方式下方的自定义网格。设置宽度或列数会切换至网格；未指定列数时使用 3 列。切回模板结构会清除预览中的宽度与列数，但保留顺序；取消可恢复原有值。已有顺序、宽度或列数设置及旧备份继续沿用原先网格布局，不会自动迁移或重新排序。宽度不超过实际可用列数：屏宽不超过 1000 像素时最多 2 列，不超过 620 像素时为 1 列。行数按内容自动增加，不提供固定行数，也不会改变快捷方式 Free 坐标。

修改先实时预览；「取消」恢复最新已保存布局。「恢复卡片顺序与宽度」重置顺序、宽度和显式布局模式预览（保留单独设置的列数），「重置预览」重置全部自定义项，均需「保存」才生效。模块原有 DOM 节点、未保存内容、显示开关与个人数据保持不变。备份严格校验完整顺序和有效宽度；工作区切换不会把旧页面的保存重定向到另一个工作区。

尚未保存的自定义、未完成的无效输入和进行中的保存会暂缓共享设置重载，并请求已有的浏览器离页提醒。仅打开未修改不会变脏；取消或确认保存成功后释放保护。工作区切换不会自动保存预览。Chrome 是否显示提醒仍由浏览器决定，不能代替明确保存。

## Verification scope

Focused Node tests cover schema/backup rejection and round-trips, structural concurrency, Cancel/Save/reset, hidden nodes, node identity and focus, pending/error-save keyboard focus, boundary-arrow Escape, responsive math/CSS contracts, and workspace session isolation. These synthetic tests do not replace native browser geometry, keyboard and unpacked-extension acceptance on the final integrated candidate.

Legacy complete archives with customization but no card order/width fields remain valid. The portable validator compares the original optional-field projection, preserving archive content and checksums; supplied invalid or unknown fields still fail. The synthetic pre-card-layout regression fixture is kept byte-for-byte and checksum-pinned.

## Bounded browser follow-up: width-triggered grid and cancellation, 2026-10-20

This closes the specific width-triggered mode switch and nondefault-span clearing gap retained in the 1.1.58 release notes, not its entire native-acceptance list. All 138 production runtime files matched master `afc5a3309a7e889d911bf6e33e8c7d81b6add046` (manifest 1.1.157). Cloud Chromium loaded the production dashboard with an external synthetic page-memory API bridge; no extension was installed. The English/light fixture contained 12 shortcuts and four populated local cards.

After selecting Today, an unsaved task draft was entered. In Customize, keyboard selection of Scratchpad width 2 automatically selected **Custom grid below shortcuts**. Returning to **Keep template structure** immediately reset the width to Default. Selecting width 2 again and explicitly saving added one RAM write; reopening retained grid mode and width 2. Rendered geometry placed the information-card grid below shortcuts, with three columns and Scratchpad spanning two (approximately 705 CSS pixels wide).

From that saved nondefault baseline, selecting template structure again cleared the preview width. Cancel made no additional write, restored focus to Customize, and reopening restored grid mode and width 2. Repeating the mode change and explicitly saving added one further RAM write. Reopening then showed template structure and Default width. Rendered Today geometry restored the right-hand card column alongside shortcuts, and Scratchpad no longer had a custom grid span. Both saves returned focus to Customize. The unsaved task text and 12-shortcut heading remained present throughout; no task submission occurred.

The fixture recorded five initialization writes, one explicit template-selection write and the two explicit customization saves, with zero external/file actions. No runtime defect was reproduced. The owned page and preview server were closed. This is a bounded rendered-control, focus, layout and page-memory save/reopen check, not full raw-module equality, browser reload persistence, installed-extension upgrade, crash/quota, Chinese/dark, narrow-screen or screen-reader certification. No historical data-loss conclusion changes.
