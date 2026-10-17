# Copy a recent calculation / 复制最近计算记录

## English

1. Enter an expression beginning with `=` and explicitly submit it. A successful calculation joins the page-local recent list, newest first, up to five entries.
2. Expand **Recent calculations on this page** and choose **Copy calculation** on the entry you want. The copied text is the saved original expression, exactly one LF separator, and its complete saved numeric result. Original whitespace, `=` and scientific-notation spelling are preserved. No label, numbering, metadata, newer draft or extra trailing newline is added.
3. The row displays **Copying calculation…**, then a past-action success or failure receipt. Copying leaves the input, focus, caret and list unchanged and does not evaluate again. A receipt does not claim what is currently on the system clipboard.

For example, an expression `=1.0E-7` copies these two lines, with no newline after the numeric value:

```text
=1.0E-7
1e-7
```

A copy failure leaves the original expression and numeric value visible for manual selection and the browser's usual copy command. There is no permission query, clipboard read, legacy fallback or automatic retry; choose **Copy calculation** again to retry explicitly.

The current result's **Copy result** and every historical **Copy calculation** share one in-flight system-write lock. Editing, clearing, collapsing, hiding or remounting can discard stale feedback but cannot cancel an already-issued write or unlock a second write early. Row feedback is separate from current-result and search feedback, and is cleared on relevant edits, redraw/clearing, folding or departure. **Use result** and **Edit expression** keep their existing draft-editing behavior.

Recent entries remain page-local, capped at five, and are never persisted, synced or exported. Clearing removes only the recent list; remounting or reloading discards it. See the [bounded validation and native-browser limits](calculator-recent-copy-validation.md).

## 中文

1. 在搜索框中输入以 `=` 开头的表达式并明确提交。成功计算会加入本页最近记录，最新在前，最多五条。
2. 展开**本页最近计算**，在所需记录上选择**复制计算记录**。复制内容依次为已保存的原始表达式、一个 LF 换行和已计算的完整数值。保留原始空白、`=` 和科学记数法写法，不附加标签、编号、元数据、新草稿或额外的结尾换行。
3. 对应行先显示**正在复制计算记录…**，然后显示本次操作成功或失败的提示。复制不会改变输入、焦点、光标或记录列表，也不会重新计算；提示不代表系统剪贴板此刻仍包含该内容。

例如，表达式 `=1.0E-7` 复制为上面的两行，数值 `1e-7` 后没有结尾换行。

复制失败时仍保留原始表达式和数值，可选中后使用浏览器的常规复制操作。不会查询权限、读取剪贴板、调用旧式复制接口或自动重试；再次明确选择**复制计算记录**才能重试。

当前结果的**复制结果**和各条历史记录的**复制计算记录**共用同一个未完成系统写入锁。编辑、清空、折叠、隐藏或重新挂载会使旧提示失效，但不能取消已发出的写入，也不能提前允许第二次写入。每行复制提示与当前结果、搜索反馈相互独立；相关编辑、重绘/清空、折叠或离开页面会清除旧提示。**用结果继续计算**与**编辑表达式**保持原有草稿编辑行为。

记录仍仅属于本页，最多五条，不持久化、同步或导出。“清空最近计算”只清空记录；重新挂载或重新加载后记录丢弃。[验证范围与原生浏览器限制](calculator-recent-copy-validation.md)。
