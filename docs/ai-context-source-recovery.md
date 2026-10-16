# Recover from an unavailable saved-source preview

## 中文

从收藏详情进入「以此摘录继续提问」后，如果来源发生更改、归档、读取失败或切换到后台，原来的确切版本预览可能失效。原预览旁现在直接显示「加载最新已保存来源」，无需先关闭整个问题草稿，也不必展开来源帮助寻找重载入口。

- 此按钮复用「重新加载已保存来源」的只读流程。只有成功读取并核验后，才替换下方的已保存来源列表；有旧勾选或摘录编辑时会先确认，包括被筛选隐藏的内容。
- 新读取的已保存来源均不选中。用户需重新勾选需要的摘录、审阅完整问题，然后再决定复制或发送。已归档来源不会被历史版本或别的记录替代。
- 上方旧预览的正文、标注和版本保持原样，「用于本次问题」仍停用。重载列表不代表原来的确切来源交接已恢复。
- 问题、模型连接、标题、筛选条件、手动临时摘录及其编辑/选择、未添加的文字、已加载回答及原始上下文均保留。新旧回答的来源不会被混写。读取失败或取消确认时，下方原列表、编辑和请求审阅也保留。
- 重载过程中禁止重复启动；已有模型操作或待核验的保存仍保持原锁定。关闭、切后台、更新草稿后的旧异步结果不能替换新界面。
- 键盘启动时先将焦点放在就近状态，成功后移到来源数量，便于在保留的筛选条件下重新选择。失败留在就近错误状态；读取期间的新焦点选择不会被夺回。

操作不会写入存储、迁移数据、请求权限、读取剪贴板、抓取来源链接或调用模型。没有改变数据结构或版本号。

## English

After **Continue asking with this excerpt**, a saved source can change, be archived, fail verification or become unavailable after leaving the tab. Its invalid preview now exposes **Load latest saved sources** directly, instead of only instructing the user to close and reopen the panel or requiring discovery of the reload control inside collapsed help.

The action reuses the existing read-only source loader. A successful read replaces only the saved-source rows and leaves them unselected. Existing saved-source selections or edits, including hidden ones, require confirmation before replacement. Select the wanted excerpts and review the whole question again before copying or sending. Archived sources are not replaced with historical bodies or guessed matches.

The earlier exact preview stays unchanged and cannot be reused. Its body, attribution and version are not silently updated, and its disabled **Use this excerpt** action does not become available again. Reloading the list does not revalidate that old handoff.

The question, connection, title, filters, manual candidates and their exact outgoing edits/selections, unadded inputs, completed response and original response provenance remain intact. Cancellation or failed reads also retain all saved-source rows, edits and reviews. Repeated clicks cannot start overlapping loads, unresolved write locks retain priority, and stale asynchronous completions cannot overwrite a changed draft or departed panel.

Keyboard focus moves to local loading feedback before disabling the trigger, then to the source-count summary after success. Errors remain beside the recovery action. A newer focus choice is respected. Filters are retained, so a successful load may still show zero matching rows.

## Verification boundary

The synthetic browser-realm suite loads the actual collection page scripts, stores, workspace fences and dialog host. Recovery cases cover revised/renamed/archived sources, retained manual and answer drafts, hidden selections, cancellation without reads, failed reads and explicit retry, late close/hide/draft changes, repeated clicks, stale enabled controls, keyboard-focus ownership and both runtime locales. All source edits and answers in these fixtures are synthetic. Recovery is asserted to perform no storage writes, permission requests, clipboard operations or network requests.

Focused command:

    node --test tests/collection-context-handoff.test.js tests/ai-context-view.test.js tests/ai-context-manual-sources.test.js tests/ai-context-external-answer.test.js tests/ai-context-external-tasks.test.js tests/ai-context-task-edit.test.js tests/ai-context-prompt-reuse.test.js tests/ai-context.test.js

DOM-model coverage is not native Chrome layout, screen-reader or extension-upgrade acceptance. This change does not claim real-provider compatibility, a full repository test pass or publication; those checks belong to the integration/release result.
