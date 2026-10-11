# Card order and width / 卡片顺序与宽度

Open **Customize → Card order and width** on the dashboard or Settings.

- Move any information card earlier/later with its labeled arrow buttons. Numbers show its place; the miniature preview includes all eight cards, even disabled cards.
- Width is measured in grid columns (1–4). Setting an order or width places information cards below shortcuts, using the chosen Card columns value or 3 columns when blank.
- A requested width is capped by the number of available columns. Screens up to 1000 px use at most 2 columns; up to 620 px use 1. Stored widths remain unchanged when the screen narrows.
- Rows grow automatically to fit content. This is not a fixed row-count or free-position card editor. Placement follows reading order without dense backfilling; wide cards may leave a gap before the next row.
- Hidden cards retain order and width but stay hidden. Enable/disable them in their existing controls. This editor never enables a module or changes a card's content.
- Preview does not write settings. **Cancel** restores the latest saved layout. **Restore card order and widths** resets only these two preferences in the preview; **Reset preview** resets all customization. **Save** commits the preview.

Saved order also becomes DOM/keyboard reading order. Existing card elements are moved, not rebuilt, preserving notes and other in-progress module input. Shortcut Free coordinates, shortcuts, module data, templates and palette remain separate.

## Persistence and safety

`appearance.customization.cardOrder` is null (default) or an exact permutation of the eight known information-card IDs. `cardSpans` is null or a known-ID map of integer widths 1–4. Unknown/duplicate/missing IDs, malformed maps and out-of-range values fail import validation. Old backups without these fields keep default behavior. Configuration/manual/Drive backups round-trip both preferences; these fields contain layout choices only.

Writes use the existing immutable workspace session, write lock and settings generation fence. Order and width maps are independently compared structurally against the opening snapshot; unrelated appearance fields merge. Concurrent conflicting changes to the same order or width map keep the preview and require reopening. Switching the selected workspace cannot redirect an open page's save; deleted/replaced workspace sessions fail closed.

## 中文

在新标签页或设置页打开「自定义 → 卡片顺序与宽度」。用带名称的上下箭头调整顺序，选择卡片宽度占 1–4 列。预览包含全部八张卡片，不会自动打开隐藏模块。

调整顺序或宽度后，信息卡片排在快捷方式下方；未指定网格列数时使用 3 列。宽度不超过实际可用列数：屏宽不超过 1000 像素时最多 2 列，不超过 620 像素时为 1 列。行数按内容自动增加，不提供固定行数，也不会改变快捷方式 Free 坐标。

修改先实时预览；「取消」恢复最新已保存布局。「恢复卡片顺序与宽度」仅重置这两项预览，「重置预览」重置全部自定义项，均需「保存」才生效。模块原有 DOM 节点、未保存内容、显示开关与个人数据保持不变。备份严格校验完整顺序和有效宽度；工作区切换不会把旧页面的保存重定向到另一个工作区。

## Verification scope

Focused Node tests cover schema/backup rejection and round-trips, structural concurrency, Cancel/Save/reset, hidden nodes, node identity and focus, pending/error-save keyboard focus, boundary-arrow Escape, responsive math/CSS contracts, and workspace session isolation. These synthetic tests do not replace native browser geometry, keyboard and unpacked-extension acceptance on the final integrated candidate.

Legacy complete archives with customization but no card order/width fields remain valid. The portable validator compares the original optional-field projection, preserving archive content and checksums; supplied invalid or unknown fields still fail. The synthetic pre-card-layout regression fixture is kept byte-for-byte and checksum-pinned.
