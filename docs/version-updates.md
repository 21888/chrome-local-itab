# Version checks / 版本检查

## English

Settings → Privacy → Version & updates shows the installed manifest version,
the saved latest-published GitHub version, and the last successful check time.
The setting-name search also finds this section.

- Manual is the default. **Check GitHub now** makes one metadata request.
- Optional **Check at most once a day** saves immediately on this device. While
  enabled, a visible new-tab page checks when opened or returned to, at most once
  per rolling 24 hours, including failed attempts. Enabling can also check if due.
  There is no service worker, alarm, always-running timer, or guarantee of a
  background check while the extension is not in use.
- Automatic notices are quiet, at most one per rolling 24 hours across tabs,
  and never repeat the same version. **Ignore this version** suppresses its
  automatic notice. A later version can qualify; manual checks still work.
- The source is the project's public GitHub `releases/latest` metadata. The UI
  says **latest published version**, not a separately curated stable or daily
  recommendation channel. Manual checks may see a newer release between daily
  automatic checks. Publication does not prove store approval or compatibility
  with a particular local setup.
- Settings drafts are not submitted, remounted, reset or reloaded by these
  controls. Update preferences and metadata are separate device-local state,
  excluded from settings exports, Chrome Sync, Drive and recovery snapshots.
  Reset to Defaults clears update preferences, including opt-in, and cached
  metadata. Importing/restoring ordinary settings does not opt in another device.

### Backup shortcuts

**Back up before updating** provides two in-page buttons: **Go to settings export**
selects Data and focuses its heading; **Go to Countdown export** selects
Search & cards and focuses the Countdown heading. The existing export buttons
remain a separate, deliberate action. Navigation preserves Settings fields,
Countdown drafts, pending controllers and the setting-name search query/results.
It does not save, remount, reload, change the URL, enable a module or download a file.
The shortcuts remain usable if update-checker initialization fails.

The adjacent instructions name the actual new-tab controls: **Tasks → Task data →
Export tasks**, and **Scratchpad → Export text**. These are instructions rather
than fake direct-export links. A hidden card can be enabled under **Settings →
Shortcuts → Module Visibility**. Export Scratchpad from the existing tab containing
the text you want to keep, especially an unsaved or conflicted draft.

Settings exports still exclude all four private local modules. Tasks use their
existing JSON export; Scratchpad and Countdown use their existing text exports.
Record Focus preferences manually; an active Focus session cannot be migrated.
These shortcuts neither verify backup completeness nor change formats or restore behavior.

### Privacy and safety

The only automated request destination is
`https://api.github.com/repos/21888/chrome-local-itab/releases/latest`.
GitHub sees the user's IP address and ordinary connection metadata. No bookmarks,
tasks, settings, installed-version parameter, account, token, cookies or request
body are sent. The request uses CORS with `credentials: omit`, no referrer,
no HTTP cache and redirects rejected. Clicking **View release on GitHub** is a
separate, explicit navigation to the project's release page.

The manifest adds only `https://api.github.com` to `connect-src`; no new required,
optional host or management permission. GitHub supports public CORS requests:
[GitHub CORS documentation](https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests).
Unpacked detection uses permission-free
[`management.getSelf`](https://developer.chrome.com/docs/extensions/reference/api/management#method-getSelf).
A `normal` install alone is not proof of a store installation; it also needs the
standard store `update_url`. Unknown and administrator-managed installs receive
neutral instructions.

Requests time out after 10 seconds. HTTP 403/429 produce a rate-limit message
and a bounded local retry delay. Errors retain the previous result and timestamp,
which are explicitly labeled as saved. Older responses cannot replace a newer
cached version. Numeric component comparison handles `1.1.10 > 1.1.9`.
Responses are bounded to 256 KiB; only validated numeric release tags are kept.
Release names, Markdown bodies, assets and remote URLs are never rendered or
executed. Links are constructed from the fixed repository and validated tag.
Opt-out, Settings reset and newer requests invalidate late responses.

### Installation

For unpacked use, save open edits and export appropriate backups first. Download
the runtime ZIP from the project's release, replace extension files inside the
same permanent folder originally loaded, and manually Reload Local iTab at
`chrome://extensions`. Do not remove the installed extension or load a different
folder as an upgrade. Settings exports exclude Tasks, Focus, Scratchpad and
Countdown: use the modules' own exports where available and record Focus
preferences separately. Reopen a new tab and verify the installed version.

Chrome manages store-installed updates; GitHub may be ahead of store review.
Organization-managed installations are updated by their administrator. The
extension never overwrites files, installs a ZIP, requests Chrome updates or
reloads a page/extension automatically.

## 中文

在「设置 → 隐私 → 版本与更新」查看当前安装版本、已保存的 GitHub 最新已发布版本
及上次成功检查时间。设置搜索也能找到此项。

默认仅手动检查。打开「每天最多检查一次」后，偏好立即保存在本设备；打开或返回
可见的新标签页时，若距上次尝试已满 24 小时才会联网。没有后台定时器，不保证
浏览器未使用时也检查。跨标签页每 24 小时最多轻提示一次，同一版本不重复提醒；
「忽略此版本」只关闭该版本的自动提示，手动检查仍可使用。

检查只请求本项目的 GitHub 公开版本信息。GitHub 会收到 IP 地址及常规连接信息；
不发送书签、任务、设置、当前版本参数、账号、令牌、Cookie 或请求正文。
没有新增主机或管理权限；不会运行远程代码、自动替换扩展文件或自动重新加载。
来源是 GitHub 最新已发布版本，不代表另有稳定版/每日推荐渠道，也不代表商店已审核。

更新偏好及缓存仅在本设备保存，不进入设置导出、Chrome Sync、Drive 或恢复快照。
恢复默认设置会关闭自动检查并清除缓存；检查或切换偏好不会提交或重置其他未保存的设置。

解压加载的用户应先保存并分别备份设置和本地模块，从 GitHub 下载运行文件 ZIP，
替换原固定文件夹中的文件，再到 chrome://extensions 手动重新加载。不要移除扩展或
更换文件夹。商店安装由 Chrome 更新，组织管理的安装由管理员处理。

### 更新前备份入口

「更新前先备份」提供两个设置页内入口：「前往设置导出」定位「数据」标题，
「前往倒计时导出」定位「搜索与卡片」中的「倒计时」标题。焦点落在标题，
导出按钮仍需另行点击。定位保留未保存的设置、倒计时草稿、待完成的控制器操作
以及设置搜索内容与结果，不保存、不重新挂载、不重新加载、不修改网址，也不下载文件。
更新检查器初始化失败时，备份入口仍可使用。

待办的导出在新标签页「待办 → 待办数据 → 导出待办」，便笺则在卡片中选择
「导出文本」。卡片隐藏时，可在「设置 → 快捷方式 → 模块显示」启用；请在包含
要保留文本的原标签页中导出便笺，尤其是未保存或冲突草稿。
这两个模块仅显示准确操作路径，不提供假冒的直接导出入口。

设置备份仍不包含这四种本地模块。待办继续单独导出 JSON，便笺和倒计时继续导出
文本；专注偏好需手动记录，会话无法迁移。新入口不验证备份是否完整，
不改变格式、导入或恢复行为。

## Español

En Ajustes → Privacidad → Versión y actualizaciones, los accesos de copia de
seguridad llevan al encabezado de Datos o al de Cuenta atrás en Búsqueda y tarjetas.
Conservan los borradores y los resultados de búsqueda de ajustes. No guardan,
recargan, habilitan tarjetas ni descargan nada: exportar requiere una acción aparte.

Las tareas se exportan en la nueva pestaña, mediante **Tasks → Task data → Export
tasks**; el bloc de notas, mediante **Scratchpad → Export text**. Si una tarjeta está
oculta, actívala en **Settings → Shortcuts → Module Visibility**. Exporta el bloc de
notas desde la pestaña que contiene el texto que quieres conservar. Estos nombres
son los de la interfaz inglesa; la interfaz también tiene traducción al chino.

La copia de ajustes no incluye tareas, concentración, bloc de notas ni cuenta atrás.
Las tareas mantienen su exportación JSON; el bloc de notas y la cuenta atrás,
exportaciones de texto. Anota las preferencias de concentración manualmente; sus
sesiones no se pueden migrar. No se cambia el formato ni la restauración y no se
verifica que la copia esté completa.
