# New draft from a saved body version / 从正文版本新建草稿

In **Body version history**, select a version and choose **New draft from this
body version**. This opens an independent, unsaved new editor and focuses its
title. The body is the selected saved text, including Unicode, line endings and
variable placeholders. It is not the active filled preview or the latest body.
Title, category, tags, tool note and favorite come from the currently saved
prompt; history stores body versions, not earlier metadata snapshots.

Opening the draft only copies page memory. It does not write or reread storage,
copy to the clipboard, run a model, or change the original prompt, its history,
linked results or variable sessions. A tag containing commas remains one tag
until its text is actually edited. Selecting or comparing history still does
not switch the active preview.

Use normal **Save prompt** or Ctrl/⌘ + S to create a fresh prompt ID with one body
version. Source IDs, history and result associations are not carried over. Once
opened, the draft is independent: later source changes or archiving do not block
its ordinary save. Existing required-field, capacity and uncertain-save/retry
rules still apply. Closing or reloading the tab can lose unsaved work.

Only one new-draft slot is available. A nonempty existing new draft is never
replaced: choose **Continue existing draft**, or save or explicitly discard it
before creating another. Other unsaved editors and the source preview's values
are kept. The existing 20-version restore-limit recovery and editor **Save draft
as new prompt** actions are unchanged.

## 来源与验证边界

- 点击新建时，以当前页面已加载的资料校验提示词 ID、记录版本、正文版本 ID
  与确切正文；不新增 Store 读取，也不声称已同步验证其他标签页尚未送达的变化。
- 读取中、读取失败、保存中、保存结果未确定，以及来源归档、消失或已替换时，
  操作会拒绝。失效、离开后重接的旧历史控件也不能打开草稿。
- 所选正文可以与正在使用的预览、最新正文三者不同。标题、分类、标签、工具备注
  和收藏明确来自当前已保存提示词，不代表该历史正文保存时的元数据。
- 新草稿以空基线标记未保存，保留原有临时预览的失效保护；普通保存后仅含一个初始
  正文版本。来源在建立草稿后变化，不会使独立草稿产生来源冲突。

## Focused verification

Synthetic fixtures only. The focused Node/DOM-model tests cover distinct selected,
preview and current bodies; Unicode/CRLF/placeholders; comma-bearing tags; zero
opening I/O; current metadata; title focus and Ctrl/⌘ + S; existing draft/session
preservation; invalid/stale/reattached controls; read, save and pending gates;
source changes after creation; capacity, validation, discard and uncertain retry.
They are not native-browser, real clipboard or full-suite acceptance. Release
validation must report those gates separately.

On 2026-10-17, 240 focused tests passed, including 41 dedicated history-draft
checks and synthetic persisted-pagehide/reattached-panel regressions:

```sh
timeout 60s node --max-old-space-size=512 --test --test-concurrency=1 \
  tests/local-prompts-history-draft.test.js tests/local-prompts-controller.test.js \
  tests/local-prompts-view.test.js tests/local-prompts-history-preview.test.js \
  tests/local-prompts-comparison.test.js tests/local-prompt-starters.test.js \
  tests/local-prompts-draft-preview.test.js tests/local-prompts-tags-preservation.test.js \
  tests/local-prompts-save-focus.test.js
```

The initial missing-entry/button probes failed before implementation. A separate
persisted-pagehide regression exposed an unrelated export-generation guard;
using the current history panel's own identity fixed it while retired reattached
panels remained inert. This verifies the synthetic lifecycle model only, not
native BFCache behavior.
