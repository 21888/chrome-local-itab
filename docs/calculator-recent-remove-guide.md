# Remove one recent calculation / 移除一条最近计算

## English

1. Submit a calculation beginning with `=`, then expand **Recent calculations on this page**.
2. Choose **Remove calculation** on the entry you want to discard. Only that entry is removed. Entries with identical expressions and results are still separate records; surviving entries keep their order.
3. Removing the last entry restores **No calculations yet.** and disables **Clear recent calculations**. The disclosure stays open. A later successful calculation starts filling the same five-entry, newest-first list again.

Removal does not evaluate an expression, edit or submit the search draft, change the current result, write to storage or access the clipboard. Readonly or disabled search input does not prevent an available history row from being removed. History remains page-local and is discarded on search remount or page reload.

The action is a native button, intended for pointer activation and the browser’s usual Enter/Space activation. If that Remove button actually held focus, focus goes to the next Remove button at the same position, the previous one if the removed entry was last, or the visible summary when the list becomes empty. An input or outside control keeps its focus. If redraw or a focus listener changes focus, the draft or the mounted search, the action does not reclaim focus or overwrite that newer state.

Removal redraws the list and discards every old recent-row copy receipt. An already-issued clipboard write cannot be cancelled, and its shared lock remains until the system promise settles. Its stale success/failure cannot appear on a newly rendered row. Current-result copy feedback remains separate: a still-current pending result copy can finish normally. **Use result**, **Edit expression**, **Copy calculation** and **Clear recent calculations** retain their existing roles.

These behaviors are covered by bounded DOM-model checks; native keyboard/focus, assistive-technology, clipboard and visual acceptance remain unverified. [Validation record](calculator-recent-remove-validation.md).

## 中文

1. 提交以 `=` 开头的计算，然后展开**本页最近计算**。
2. 在要丢弃的记录上选择**移除这条计算**。仅移除该条；表达式和结果完全相同的记录仍各自独立，其他记录顺序不变。
3. 移除最后一条后恢复**暂无计算记录。**空态，并禁用**清空最近计算**，列表仍保持展开。之后的成功计算继续按最新在前、最多五条加入列表。

移除不会求值、修改或提交搜索草稿，不改当前结果，不写存储，也不访问剪贴板。搜索框只读或禁用时，只要历史行本身可用仍能移除。记录仍只在本页内存中，重新挂载搜索框或重新加载页面后丢弃。

这是原生按钮，可使用指针及浏览器原有 Enter/Space 激活。仅当移除按钮确实持有焦点时，焦点才转到原位置的下一条移除按钮，末条则转到前一条，空列表则转到可见标题。输入框或外部控件的焦点不会被主动移走。若重绘或焦点回调改变焦点、草稿或当前搜索实例，不再次抢焦点，也不覆盖新状态。

移除会重绘记录列表并丢弃所有旧的记录复制提示。已发出的系统剪贴板写入无法取消，共享锁仍等到真实完成才释放；旧成功或失败提示不能出现在新行上。当前结果的复制提示独立保留，仍有效的待完成复制可正常显示结果。“用结果继续计算”“编辑表达式”“复制计算记录”和“清空最近计算”保持各自原有用途。

验证仅覆盖有界 DOM 模型；原生键盘与焦点、辅助技术、系统剪贴板和视觉验收未完成。[验证记录](calculator-recent-remove-validation.md)。
