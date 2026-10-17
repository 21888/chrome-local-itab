# 临时使用历史提示词版本 / Historical prompt previews

在正文版本历史中，点击版本行只查看已保存正文。点击「使用此版本」才会将预览切换到该版本的确切正文；「返回当前版本」切回最新已保存正文。两种操作都不保存、不新增历史、不修改编辑草稿，也不改变当前已保存版本。

每个确切的提示词 ID、版本 ID 和正文组合独立保留变量值与原样使用选项，且只保留在本标签页内。普通切换不会把同名变量值带到其他模板。复制、摘录填入变量、关联结果列表和「为此版本保存结果」链接均以实际使用中的版本为准。

「清空变量值」继续执行既有的返回当前正文行为，同时清除使用中版本与当前版本的变量值和原样使用选项；其他历史版本的变量值仍保留。若临时内存达到上限，可明确确认「清除本标签页所有预览变量值」；这不会删除已保存提示词、历史或编辑草稿。

其他标签页更新正文时，已输入值或明确选中的旧版本不会自动替换。原始版本被移除、归档或被完整备份以相同 ID 的不同正文替换时，旧值不会套入新模板；无效来源暂停复制和摘录填入，需明确返回当前版本或重新读取。记录消失时保留临时值并显示重新读取入口。读取期间暂时禁用预览输入与复制；重新读取成功后恢复。

历史面板中的「从此正文版本新建草稿」会将当前选中的原正文复制到独立的未保存草稿，标题、分类、标签、工具备注和收藏来自当前已保存提示词。它不切换预览，也不修改原条目；明确保存后才新增独立提示词。已有新草稿会保留，并提供「继续已有草稿」。详见 [历史正文新建草稿](prompt-history-draft.md)。

## Bounds and validation

- At most 100 cached exact-body sessions per page. Empty inactive sessions may be reclaimed; typed values and literal choices are never silently evicted.
- Aggregate variable values are limited to 2,097,152 UTF-16 code units; each value is capped at the existing 32,000-character input bound. Refused edits restore the retained field value and show an explicit limit message.
- Clear all previews is explicitly confirmed. Reload/disposal clears page-owned sessions. Nothing is added to storage, backup schemas, history, or network traffic.
- Version selection remains read-only. Use this version and Return to current version are explicit, memory-only actions. Clear values clears the active and current sessions and returns to the current body, preserving other versions’ input.
- An exact source requires matching prompt ID, version ID, and saved body. Missing, archived, replaced, loading, or unreadable sources cannot copy or accept excerpt insertion. Return is explicit and can recover a same-ID replaced body without carrying old values.
- Automated tests cover session switching, linked results and result-draft URLs, input/refusal consistency, async reads, chooser invalidation, missing/replaced sources, bounds, and no writes. Synthetic DOM tests are not native browser or real clipboard acceptance.
