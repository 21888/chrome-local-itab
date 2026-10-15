# Local and self-hosted AI catalog entries

Reviewed on 2026-10-15. This append-only update adds Ollama, ComfyUI and
LibreChat to the existing AI category: 146 → 149 unique sites and 25 → 28 AI
entries. The same 18 categories and 218 bilingual use labels are retained.
All 146 previous records, including their order and every metadata field, are
unchanged. Their serialized JSON SHA-256 is
`24686256ab720a5c3cef1e0f330e50ddf1826e4c58d8a48f6204c1f999b0d472`.

## Official evidence and scope

- **Ollama** links to the [official home page](https://ollama.com/) for local model
  downloads/execution and optional Ollama cloud models. The
  [pricing page](https://ollama.com/pricing) distinguishes free local software,
  limited free cloud usage, paid subscriptions and usage-based credits. Local
  execution requires suitable hardware, and each model has its own license.
  [Terms](https://ollama.com/terms) identify **Ollama Inc.** but do not establish a
  sufficiently verified operator country for this record. US hosting and
  California governing law are not evidence of incorporation location; country
  remains `unknown`. The local software's original
  [MIT license](https://github.com/ollama/ollama/blob/main/LICENSE) is linked.
- **ComfyUI** links specifically to the [local download](https://comfy.org/download/),
  rather than the paid hosted service. The
  [official repository](https://github.com/Comfy-Org/ComfyUI) documents node-based
  image and video workflows on the user's hardware and provides the original
  [GPL-3.0 license](https://github.com/Comfy-Org/ComfyUI/blob/master/LICENSE).
  `free` applies to the local core, with suitable hardware and separately licensed
  models required. [Pricing](https://comfy.org/pricing/) distinguishes Comfy Cloud
  and usage-based Partner Nodes; a cloud trial is not permanently free access.
  [Terms](https://comfy.org/terms-of-service/) identify **Comfy Organization, Inc.**
  as a Delaware corporation, supporting `US` as operator location.
- **LibreChat** links to the official
  [local setup guide](https://www.librechat.ai/docs/quick_start/local_setup).
  It is a self-hosted unified chat interface that can connect local or cloud
  models. The [official repository](https://github.com/LibreChat-AI/LibreChat)
  and original [MIT license](https://github.com/LibreChat-AI/LibreChat/blob/main/LICENSE)
  support `free` for the software. Deployment, suitable hardware or hosting,
  model connections and any external API/hosting charges remain the user's
  responsibility. The company field is **LibreChat project**, a project label,
  not a verified legal entity. The
  [ClickHouse announcement](https://clickhouse.com/blog/librechat-open-source-agentic-data-stack)
  does not establish a specific legal operator/country for this entry, so country
  remains `unknown`.

These are editorial descriptions of external projects. No SDK, model, source code
or license text is copied into the extension. The links to original licenses let
users review the respective projects' terms; model licenses and paid-service terms
are separate. No software is installed, models downloaded or accounts created by
this catalog addition.

Language and signup metadata remain `unknown`. Country continues to describe
verified operator location, not hosting location, product nationality or an
access-country list. The source-review date does not guarantee future pricing,
regional availability, hardware compatibility, privacy or offline operation.

## Search and interaction

Search-only task aliases are deliberately bounded:

- Ollama: 本地模型 / local models
- ComfyUI: 本地绘图 / 节点工作流 / local image generation / node workflows
- LibreChat: 自托管 / self hosted

Existing normalization also matches `self-hosted`; the English and Chinese
LibreChat descriptions match local-model queries. Displayed brands and official
URLs remain unchanged by aliases. No new purpose label, UI control or permission
is introduced. All three entries use only existing AI/use filters, with bilingual
descriptions and pricing notes.

Browsing, searching, filtering, source-detail inspection and selection remain
local and read-only. No external request or default/personal shortcut is added.
Only explicit official-site/source-link actions navigate to the external sites;
the existing review/add workflow is required to save shortcuts. These entries do
not configure a model connection in the extension or claim an integration.

## Verification boundary

Focused tests pin the 146-record preservation hash, exact three appended IDs,
149 unique canonical HTTPS URLs, 28 AI memberships, unchanged categories/tags,
complete bilingual metadata, reviewed evidence/license links, former empty task
searches, AND semantics, all exact selectors, scoped pricing and unknown countries.
The actual navigation view runs under the existing DOM model in both languages:
all three cards, notes/source links, AI/category/use/company/country/pricing/saved
filters, hidden selections, review cancellation and close/reopen are covered
without shortcut writes or external navigation. Loading the catalog cannot call
network/storage/permission APIs or populate default shortcuts.

This preparation keeps manifest version 1.1.152. Focused tests and static checks
are recorded separately from full-suite, packaged-browser and publication checks;
this document does not claim those later stages have run.

## 中文摘要

新增 Ollama、ComfyUI 和 LibreChat 三个入口，目录共 149 个网站、AI 分类共 28 项；
旧 146 条记录逐字段保留，仍为 18 个分类和 218 个用途标签。Ollama 标记为有免费及
付费方案；ComfyUI 的免费仅指本地核心，LibreChat 的免费仅指自托管软件。硬件、
模型许可、云端服务、外部 API 和托管费用需分别核对。来源查阅日期为 2026-10-15。

只提供外部项目介绍与官方来源，不复制项目代码、SDK、模型或许可证原文。运营方
所在地不代表可访问地区；Ollama 与 LibreChat 未充分核验的国家维持未知。浏览和
筛选不会安装软件、下载模型、建立连接、添加默认快捷方式或请求权限。
