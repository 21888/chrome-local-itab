# Saving Settings across tabs

## English

An open Settings page saves only the fields you changed. For example, changing
Show weather in one tab preserves a quote saved in another tab. Independent
visibility switches, weather fields, movie text and shortcut-style fields can
merge. A search-engine/URL pair, a background, dashboard padding, and each topic
list are compared as groups. Clock and category editors retain their existing
group conflict protection.

Before writing, Settings compares the changed fields with the values originally
loaded by that page, under the extension's shared Web Lock. A conflicting field
rejects the entire save. The page retains your form draft and tells you to open a
new Settings tab, review the latest values, and copy the changes you still want.
Repeated Save does not silently overwrite the newer copy.

A full JSON or Drive restore, reset, or applied Chrome Sync snapshot invalidates
older Settings pages even if the replacement contains identical values. Open a
new Settings page afterward. There is no automatic reload merely because a
local setting changes. Existing reload/departure protection now also recognizes
general Settings drafts, background-color typing, pending asset writes and topic
edits. A confirmed replacement started in this page still discards its old
configuration draft; separate private-tool drafts retain their own protection.

Background controls save immediately. A later typed color is kept if an older
save completes. If a color write fails, its controls remain available to retry
with Save Settings. A Save requested before an image upload finishes does not
replay its old background. Failed image selections must be selected again;
conflict feedback states this explicitly. Topic add/edit/delete keeps accepted
changes in the displayed list on failure, so the draft can be reviewed or copied.
The online-favicon preference can only be newly enabled after its optional host
permission has completed and is present. Ordinary saves do not copy provider
Sync state or request permission.

### Scope and implementation

- Guards all writes originating in the ordinary Settings form and its immediate
  background, topic and poster helpers. Poster helper functions remain guarded
  even though the current Settings markup exposes no poster file picker.
- Existing dedicated appearance, layout, shortcut, bookmark-import and private
  tool controllers remain separate. All ordinary `StorageManager` configuration
  writes now serialize with the same lock, including dedicated unguarded writers.
- The local `__localItabSettingsGeneration` marker identifies whole-configuration
  replacements. Layout's generation also changes on routine shortcut/category
  edits, so it cannot serve this narrower purpose. The marker is absent on legacy
  installs until the first replacement, is retained through reset, and is not
  included in config exports, Drive snapshots, Sync payloads or imported schemas.
- Comparing and patching happen inside one lock; storage-change notifications are
  not needed for correctness. Original raw storage and rendered-form baselines
  are distinct. Successful own writes advance only submitted paths; they never
  adopt unrelated external fields or overwrite later typing.
- Failed initial reads, failed locked reads/writes, or missing Web Locks fail
  closed. Optional post-commit Sync scheduling failure does not claim that a
  committed local save failed. Private local-content records are never included.

This change does not add a history or merge-conflict editor. Old-version pages,
manual DevTools writes and third-party direct storage writes cannot be protected
by a lock they do not use. Dashboard search selection and dashboard-hidden
controls still have their pre-existing cached whole-object writers; they are not
converted to field-level comparison in this Settings-scoped change. This is a
source-review limitation, not a new native-browser reproduction claim.

### Validation

`tests/settings-stale-save.test.js` runs the actual Options and StorageManager
code against shared Chrome storage and Web Lock models, including two tabs,
replacement fences, queued typing, failed reads/writes, permissions, background
and topic helpers, poster operations, export exclusion and private-data retention.
The original ordinary-tab overwrite, same-field overwrite, and delayed image-read
replacement cases fail on the prior code. Existing focused clock/category,
background, bookmark and lifecycle suites also run with the new guarded baseline.
These are DOM/storage-model tests, not proof of Chrome paint, OS permission UI or
live Drive/Sync authentication. Native-browser acceptance is a separate check.

## 简体中文

设置页只保存本页实际修改的字段。例如，在一个标签页开启天气，不会覆盖另一个
标签页刚保存的一句话。独立的显示开关、天气字段、电影文字和网站样式可分别合并；
搜索引擎与地址、背景、页面边距及每个热榜列表按组核对。时钟和分类沿用原有保护。

保存前会在共享写入锁内核对本页最初读取的值。若修改的字段已被其他页面更改，
整次保存都会拒绝，当前表单草稿仍保留。请打开新的设置标签页查看最新内容，再把
需要的修改复制过去。重复点击保存不会强行覆盖新内容。

JSON 或 Drive 整体恢复、重置、已应用的 Chrome 同步快照会让旧设置页失效，
即使恢复内容相同也如此。之后请打开新的设置页。普通本地设置变更不会强制刷新；
已有的刷新与离页保护也会识别普通表单草稿、未完成的背景颜色输入、图片写入和热榜
编辑。本页明确确认的整体恢复仍会丢弃旧配置草稿，本地私人小工具继续独立保护。

背景控件即时保存。较早保存完成时不会覆盖后来输入的颜色；失败后可保留颜色并用
“保存设置”重试。图片上传未完成前提交的旧背景不会被重新写入。失败的图片需重新
选择，冲突提示会明确说明。热榜增删改失败时会把修改保留在列表中供检查或复制。
在线图标只有在可选权限请求完成且已授权后才能新开启。

本次覆盖设置页及其背景、热榜、海报写入辅助逻辑，不修改首页搜索和隐藏看板控件
原有的整对象写入方式。新增的本地整体替换标记不会进入导出、Drive、Chrome 同步
或导入格式，也不包含或修改待办、专注、便签、倒计时等私人内容。实际代码的多页
存储模型回归覆盖并发、失败与草稿保留；浏览器画面和真实云端授权需另行验收。
