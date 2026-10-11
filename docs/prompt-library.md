# 个人提示词库 / Personal prompt library

这是 AI 浏览器工作台的提示词管理基础。本机保存、搜索和预览不会自动连接模型或上传内容。
可选模型功能在审核明确的目标和内容并点击发送后才发起请求；授予访问权限本身不会发送。

从新标签页右上角的「提示词库」打开独立页面。全部工作空间共用同一份资料，
当前版本没有工作空间归属编辑或筛选。

## 使用流程

1. 新建提示词，填写标题和正文，按需加入分类、标签、适用工具说明或收藏。
2. 显式保存。可以按标题、正文、分类、标签或说明搜索；收藏、分类和回收站
   提供独立筛选。
3. 正文可使用 `{{主题}}` 等变量。同名变量填写一次、替换所有位置。
   `\{{名称}}` 保留字面括号；也可以选择按原文使用整个模板。
4. 先填写变量并查看完成版预览，再点击复制到自己选择的工具。未填写的变量
   会阻止完成版复制；确实要留空时点击「使用空值」。复制失败可选中文本手动
   复制。没有后台剪贴板读取。
5. 修改正文并保存会保留历史版本。元数据修改不新建正文版本；恢复历史正文
   会生成新版本，并保留后续历史。
6. 编辑已有提示词时，可随时点击「将草稿另存为新提示词」。这会复制编辑器中的
   标题、正文、分类、标签、工具备注和收藏，生成新 ID 和一个初始正文版本，
   原提示词及完整历史保持不变。它不复制临时变量值或当前选中的历史预览；
   未修改的模板也可以另存。新建编辑器只提供普通保存，避免重复操作。

草稿、变量和预览只存在当前标签页的内存中。浏览库内其他条目时会保留，离开
页面前有提示；仍应主动保存草稿，不能依赖浏览器一定弹出离开警告。变量不会
自动进入正文、历史或备份。另一标签页保存引起冲突时，本页保留草稿，并提供
查看已保存内容、另存新提示词或确认丢弃草稿的选择，不自动覆盖。

删除会移至回收站并保留 ID、正文和历史。恢复后可再次使用。当前没有永久删除、
清空回收站或自动清理历史。正文最多 20 个版本；达到上限后可以另存为新提示词，
旧提示词和历史保持不变。库内最多 200 条（包含回收站），总存储预算 2 MiB。
达到容量上限时会保留草稿并阻止写入，导出备份本身不会删除本机数据。

## 数据边界

提示词是全局独立资料，不是普通设置。不得通过 Chrome Sync、Drive 设置同步
或工作空间设置副本自动发送或重复存储。完整本地备份集成必须经过单独验收，
不能将旧设置导出误认为提示词备份。

本机存储和 JSON 备份未加密，请勿保存密码或 API 密钥。能访问设备或备份文件
的人可能看到这些内容。开源便于审查，不代表绝对安全。

## English

Open **Prompt library** from the new-tab header. Create a titled prompt, optionally
add tags/category/tool notes/favorite, then explicitly save it. Search saved text,
fill `{{variables}}`, review the completed text and copy it into your chosen tool.
Local saving, search and preview do not call a model. Optional model workflows send only after explicit destination/content review and Send; granting access alone never sends anything.

One global library serves every workspace. Drafts and variable values remain only
in the current tab; navigation within the library keeps them, but leaving can
lose them. Cross-tab conflicts preserve your draft and require an explicit choice.
Only body edits create versions. Restoring appends a version and keeps later
history. Trash is recoverable; this slice has no permanent deletion or purge.

While editing any saved prompt, choose **Save draft as new prompt** to keep a
separate variation. It copies the editor's title, body, category, tags, tool note
and favorite into a fresh ID with one initial body version; the original record
and full history are untouched. Filled preview values and a selected historical
preview are not substituted for the editor draft. An unchanged template can also
be saved separately. New-prompt editors keep just the normal Save action.

Both save actions require a title and body. Invalid input or capacity errors keep
the draft. If a save result is uncertain, use **Retry same save**; editing and new
saves stay blocked while that operation is pending. Repeated clicks are guarded,
and retry reuses the operation when its receipt remains the latest saved receipt.
If another write intervenes, the original operation stays pending and the action
changes to **Check saved outcome**. This only reads the exact operation receipt;
a matching digest confirms the original save without writing another copy.
The current library may include later edits. Missing or mismatched receipts never
unlock a fresh save: keep this tab open to retain the draft and inspect the library.
Ctrl/⌘ + S still performs the normal Save, never Save as new.

At 20 versions, save your draft as a new prompt to continue with a fresh ID while
retaining the original history. The 200-record count includes Trash. Capacity
errors preserve drafts and never truncate or evict saved content. Backups are
unencrypted. Do not store passwords or API keys.

See [temporary historical-version previews / 临时使用历史版本](prompt-history-preview.md) for exact-version switching and Clear values behavior.
