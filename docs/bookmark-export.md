# Local browser-bookmark HTML export

In **Settings → Data**, select **Export bookmarks HTML** and review the privacy
confirmation. Cancelling that prompt happens before the saved configuration is read
or a file is created. After confirming, review the site/folder counts and choose
**All saved categories and sites** (the default) or one existing category. Then select
**Download reviewed scope**. The preview creates no file; **Cancel preview** closes
it without downloading. Every new preview resets to All, without saving a preference.
The download is a local UTF-8 Netscape bookmark HTML file named
`local-itab-bookmarks.html`. No additional permission or network request is added.
The browser decides where downloads are saved; the success notice means a download
was requested, not that the browser or disk confirmed completion.

## Included and excluded

The serializer reads only shortcut titles, full HTTP(S) URLs and category membership,
plus category IDs/names for mapping folders. IDs are not written into the file.
Category order and saved shortcut order within each folder are retained. Duplicate
URLs, same-name folders and empty folders are retained; unknown-category shortcuts
are placed at the root after folders. Duplicate category IDs reject the whole export
because membership would be ambiguous. Text and attribute delimiters are escaped;
supported tabs/newlines/carriage returns use numeric HTML references.

The file contains full URLs, which can contain private query parameters or fragments.
Keep it private and review it before sharing. It excludes unsaved form edits, icons,
layout, images, other settings, Tasks, Focus, Scratchpad and Countdown. Existing
JSON settings export remains separate and unchanged.

Export reads through `getAllForBackup()`, the existing successful-read configuration
normalization boundary. That boundary can normalize URLs, trim names/titles and
filter invalid stored entries. This feature does **not** promise byte-for-byte raw
storage fidelity. The pure serializer preserves supported strings it receives and
rejects an unsupported snapshot rather than dropping or truncating its entries.
Read failures do not export fallback defaults. Feedback never includes saved values.

## Scope preview and saved-state check

- All includes every category and saved site, including root-level orphan membership.
  A single-category export includes exactly that existing folder and all its sites.
  An empty category is a valid zero-site, one-folder export. There is no separate
  synthetic “uncategorized” option.
- Selection uses category identity, not its label. Same-name categories display
  their IDs in the selector so they can be distinguished. A real category ID of
  `all` is an ordinary category and cannot collide with the All option. IDs remain
  excluded from the generated HTML.
- The entire normalized source is validated before scoping, including all existing
  count, field, duplicate-ID, URL and HTML-byte limits. Selecting an empty/small folder
  cannot bypass an unsupported or oversized source elsewhere.
- The preview owns an independent in-memory copy of only ordered category IDs/names
  and shortcut titles/URLs/category memberships, plus its already generated HTML.
  It never reads unsaved form inputs or saves Settings.
- Download reads saved configuration again and compares all ordered export fields,
  including records outside the selected category. A changed value/order, read
  failure or replaced/invalid workspace ends the old preview. Open a new preview
  and review it again; there is no silent refresh, scope fallback or automatic retry.
  Unrelated saved fields such as appearance or icons do not change the comparison.
- Cancel, hiding/leaving the Data section or page, removing its host, destroying
  the view or leaving its workspace retires the review and any late read completion.
  Choosing another scope also retires an in-flight verification for the old scope.
- Open previews participate in the existing reload, complete-restore and workspace
  draft guards. “Save drafts” never downloads an export. Close or finish this preview
  before proceeding; an explicitly discarded/departing review cannot later download.

The final browser request uses the exact reviewed HTML, fixed filename/MIME and
existing delayed object-URL cleanup. This is a best-effort saved-state recheck, not
an atomic lock across future storage edits and the browser's download machinery.

## Bounds and compatibility

- At most 20,000 shortcuts and 2,000 categories, matching bookmark storage count bounds.
  This supports accumulated saved data beyond one import batch without unbounded export
- At most 256 Unicode code points per title, category name or category ID; the text
  bound follows bookmark import's title/path budget, with a bounded ID lookup key
- At most 4,096 UTF-16 code units per saved URL, using the importer's numeric URL budget
- At most 32 MiB of UTF-8 HTML output, matching the bookmark storage byte budget;
  escaping and HTML markup count toward this limit
- Unsupported control characters (except text tab, LF and CR), lone surrogates,
  malformed fields, and unsafe/non-HTTP(S) URLs reject the whole export
- URL validation reuses the importer's strict HTTP(S) safety check, including no
  userinfo, whitespace, backslashes or malformed percent escapes

The export is intended as an ordinary browser-bookmark interchange file. The bounded Chrome import check below passed; other browser versions and
products remain unverified. It is **not** a lossless Local
iTab settings backup or a guaranteed exact Local iTab import round trip. The current
Local iTab importer has different limits (10 MiB input, 10,000 encountered bookmarks,
2,000 additions and 200 new categories), deduplicates URLs, and does not recreate
empty folders. It may normalize folder paths and whitespace, skip empty or replacement-
character titles, reject such folder names, and apply its URL bound to escaped HTML
attribute text as well as decoded/canonical URLs. Thus some supported exports exceed its import limits or differ when
reimported. Use JSON settings backup for configuration migration.

## Offline validation

`tests/bookmark-export.test.js` covers deterministic ordering, duplicates, same-name
and empty folders, orphan membership, escaping, Unicode, private-field exclusions,
URL rejection, malformed values, limits and ordinary parser fixtures.
`tests/bookmark-export-options.test.js` runs the actual bound options click handler
with a controlled DOM/storage/download model: cancellation before reads, saved-only
source, privacy prompt, scope/count preview, explicit second action, ordered saved-state
rechecks, late cancellation and lifecycle/workspace fences, MIME/filename, repeated and
overlapping clicks, read/serializer failure, download failure, URL cleanup, retry and
EN/ZH/fallback locale/script wiring. `tests/bookmark-export-scope.test.js` adds small
pure scope/snapshot fixtures. See [scope-preview validation](bookmark-export-scope-validation.md)
for the bounded commands and remaining acceptance gates.

The automated checks do not operate a browser, clipboard, cloud service or production
store. Actual native acceptance is recorded separately below.


## 中文使用说明

在「设置 → 数据」点击「导出书签 HTML」，阅读提示后确认。在该提示取消不会读取配置或
创建下载文件。确认后先查看网站和文件夹数量，选择「全部已保存分类和网站」（默认）或
一个现有分类，再点击「下载已预览范围」。预览本身不会创建文件，可随时取消；每次重新
打开均恢复「全部」，不保存选择偏好。生成的 `local-itab-bookmarks.html` 可用于浏览器书签交换；它只包含
已保存的网站标题、完整网址和分类文件夹，不包含未保存编辑、图标、布局、其他设置，
也不包含待办、专注计时、便笺或倒计时内容。网址可能带有私人查询参数，请妥善保管文件。

导出按分类 ID 分组，保留分类顺序、同组网站顺序、重复网址、同名分类和空分类；
没有匹配分类的网站放在根目录。读取失败或序列化数据超出支持范围时，整次导出会失败，
不会用默认配置替代成功结果。同名分类在选项中附带 ID 区分；单分类导出只保留该文件夹
及其中网站，空分类也可导出。筛选前会校验完整来源，不能用小范围绕过全量限制。

下载前会再次读取并核对所有有序导出字段，包括未选择分类中的内容。相关内容或工作区
发生变化、读取失败时，旧预览失效，需要重新打开并核对；无关外观字段不参与内容比对。
取消、隐藏、离开页面或切换工作区后，迟到的读取结果不会触发下载。预览只使用已保存
内容，不保存表单；「保存草稿」也不会自动下载。浏览器提示下载开始，不代表磁盘保存已经完成。

上限为 20,000 个网站、2,000 个分类、32 MiB UTF-8 HTML；标题、分类名和分类 ID
最多 256 个 Unicode 码点，网址最多 4,096 个 UTF-16 编码单元。网址仅支持严格校验的
HTTP/HTTPS，不支持含用户名密码等不安全格式。超过限制不会静默截断。

导出读取的是现有配置规范化后的数据，并不是原始存储的逐字备份。本插件现有 HTML
导入器的容量更小，而且会合并重复网址、不恢复空文件夹，所以不能保证导出后再导入
完全一致。迁移完整主页配置请使用 JSON 设置备份，并按照迁移说明另存私人模块内容。


## Historical Chrome download and import (2026-10-09, previous one-step export)

This preserved native evidence covers the earlier one-step **all-bookmarks** export
only. It does **not** validate the new two-stage scope preview, its controls, keyboard
or screen-reader behavior, or its asynchronous cancellation/recheck flow. Those new
flows currently have bounded model tests only; native Chrome acceptance is still pending.

以下保留的是 2026-10-09 旧版「一步全量导出」的原生记录，不代表新增范围预览已通过
原生 Chrome 验收。新增两阶段流程目前仅完成有限自动化模型验证。


A normal-sandbox official Chrome for Testing 155.0.8059.39 Linux profile imported
an ordinary synthetic Settings JSON containing four shortcuts and three categories.
Cancelling the HTML-export prompt left Chrome Downloads empty. Confirming the next
attempt downloaded a real 659-byte `local-itab-bookmarks.html`, independently
compared byte-for-byte with the expected serializer output. File SHA256:
`291227cc494697f576b5728400a01410d079d1dbaa0432002c07013708a20ac7`.

Importing that file through Chrome's ordinary bookmark manager established:

- `Work & notes` retained both `A & B <Guide>` and `Duplicate reference`, including
  their duplicate `https://example.com/?a=1&b=2` URL.
- The folder `研发 <Local>` and title `中文文档` retained their Unicode and delimiters.
- The unmatched-category `Root reference` appeared at the bookmarks-bar root.
- The HTML contained `Empty folder`, but this Chrome importer dropped that empty
  folder. Export retention does not guarantee an importing browser will retain it.

No bookmark URL was opened. These are ordinary synthetic-profile UI observations,
not an all-browser, all-limit, real-provider, IME or assistive-technology guarantee.
The integrated source passed 427 Node tests and 19 Python packaging tests. A separate
Node stress check serialized 20,000 ordinary links and rejected a 20,000-link oversized
output instead of creating a partial file; this is not a browser-performance claim.

本次已在真实 Chrome 测试浏览器中验证取消、下载和书签导入，四个测试网站、重复网址、
中文名称及 `&`、`<`、`>` 均保留。导出文件确实含有空分类，但 Chrome 导入时会丢弃
空文件夹。其他浏览器及极限容量尚未进行原生验证。

The Data-section control and scope note also passed an English narrow 514 × 848
outer-window check. Static Settings search found the new export label and opened
the Data section. All 58 runtime hashes matched the frozen native snapshot, and
the owned test browser was closed normally.
