# Local iTab

[简体中文](README.md) · [English](README.en.md) · [Español](README.es-ES.md)

A local-first Chrome new tab page that keeps search, saved websites, and a small personal dashboard together. A simple starting point for the things you use every day.

**Offline-first · Categorized shortcuts · Custom layouts · Optional sync and backups**

No build step or Local iTab account is required. The clock, shortcut management, local images, and manually maintained cards work offline; web searches, website visits, and optional cloud features need a network connection.

[Preview](#preview) · [Install](#install) · [Features](#features) · [Privacy & backups](#privacy) · [Development](#development)

**A local AI workflow:** organize prompts and body versions, review variable previews, and save results linked to the exact version. Optionally connect your own model provider, review the destination and exact prompt, send it, and choose whether to save the response. [Usage](#local-ai)

<a id="preview"></a>

## Preview

### Current interface · 1.1.118

Captured on 2026-10-13 from the published 1.1.118 runtime in isolated Linux Chrome for Testing. These four original fullscreen images use 100% browser zoom and retain the browser notice, without cropping, redrawing or retouching. 1364 × 1024 is the image size, not a tested mobile CSS viewport. Interface languages are stated below; workspace names and record contents are synthetic examples, with natural-English sample text.

**Homepage · Chinese, light**: the new L brand, compact toolbar and five demonstration shortcuts visible together.

![1.1.118 Chinese light homepage with a demonstration workspace and five complete shortcut cards](docs/screenshots/release-1.1.118/dashboard-light-zh.jpg)

**Discover sites · Chinese, light**: full-catalog category counts and use, operator-location, company and pricing filters.

![1.1.118 Chinese discovery overview with category counts, filters and site cards](docs/screenshots/release-1.1.118/navigation-overview-light-zh.jpg)

**Local prompt review · Chinese, light**: view sources beside the question and full prompt built from a synthetic excerpt. No model request was sent or answer generated.

![1.1.118 Chinese local prompt review with synthetic source material and an unsent full prompt](docs/screenshots/release-1.1.118/ai-context-local-review-light-zh.jpg)

**AI collections · English, dark**: exact study-tag filtering with the synthetic excerpt and annotation.

![1.1.118 English dark collections showing study-tag filtering, an excerpt and annotation](docs/screenshots/release-1.1.118/collections-tags-dark-en.jpg)

[Capture provenance and checksums](docs/screenshots/release-1.1.118/capture-metadata.json) · [Corresponding release](https://github.com/21888/chrome-local-itab/releases/tag/v1.1.118)

<details>
<summary>Earlier workspace, feature and template captures</summary>

The following retain their original capture versions, provenance and verification scope.

### Prompt comparison and result drafts

These original English-interface captures were taken on 2026-10-11 in cloud Linux Chrome for Testing, using isolated synthetic data only. Prompt comparison shows 1.1.35; the unsaved exact-version result draft shows 1.1.36. They document the interface and acceptance scope of their capture versions, not the current version or full all-device validation.

![Prompt version comparison: removed, added and unchanged literal lines](docs/qa/prompt-version-comparison/diff-light.jpg)
![Exact-version result draft: reviewed version link in a new tab, with an empty unsaved body](docs/qa/exact-version-result-draft/unsaved-exact-v1-review.jpg)

[Comparison acceptance and limits](docs/qa/prompt-version-comparison/native-acceptance.md) · [Result-draft acceptance and limits](docs/qa/exact-version-result-draft/native-acceptance.md)


### Earlier workspace screenshots · pre-release 1.1.22 acceptance

Captured in native cloud Linux Chrome on 2026-10-10 with disposable synthetic data. The frozen runtime is 1.1.21 plus the complete workspace feature; the then-local 1.1.22 candidate changed only its version number and had not yet been pushed. These original screenshots are not represented as post-release captures.

![Light Folio dashboard with workspace navigation](docs/qa/workspaces-native/screenshots/05-folio-workspace-bar.jpg)
![Light workspace manager and Trash](docs/qa/workspaces-native/screenshots/15-workspace-manager-light.jpg)
![Dark workspace dashboard](docs/qa/workspaces-native/screenshots/16-workspace-dashboard-dark.jpg)

<details><summary>Narrow window and keyboard focus</summary>

![Dark workspace picker in a 510-pixel native window](docs/qa/workspaces-native/screenshots/18-workspace-picker-dark-narrow.jpg)

</details>

[Verified scope and limitations](docs/workspaces-native-validation.md) · [Capture provenance](docs/qa/workspaces-native/captures.json)

### Release captures · 1.1.14

Captured on 2026-10-10 from the published 1.1.14 runtime in an isolated Chrome profile. These two original fullscreen captures use the English interface, with no cropping, resizing or redrawing. The five sample sites came from Create Starter Set. Automatic update checks, online icons and sync stayed off by default; no account was signed in.

**Version & updates · Light**: installed version, the disabled-by-default checking option, and the settings/Countdown backup shortcuts.

![1.1.14 English light Version & updates with backup guidance and both export-navigation buttons](docs/screenshots/release-1.1.14/updates-backup-light-en.jpg)

**New tab · Dark**: localized default categories, five starter examples and local letter/emoji icons.

![1.1.14 English dark new tab with localized categories and starter-example sites](docs/screenshots/release-1.1.14/newtab-dark-en.jpg)

[Release package](https://github.com/21888/chrome-local-itab/releases/tag/v1.1.14) · [Capture provenance and checksums](docs/screenshots/release-1.1.14/capture-metadata.json) · [Backup-navigation validation scope](docs/upgrade-backup-navigation-validation.md)

<details>
<summary>Earlier feature and template captures</summary>

These historical examples retain their own version and crop records; they were not all captured from 1.1.14.

Real extension screenshots captured at different feature stages. Template previews use the English interface with Chinese sample category names; feature sections identify their capture languages. Site choices, icons, and card content are illustrative; weather, topics, and movie cards are manually entered examples, not live feeds.

[Narrow templates, focus spacing and upgrade-preservation checks](docs/narrow-template-and-upgrade-validation.md)

### Earlier interactions · 1.1.7 Undo completion and scientific literals

Undo an accidental completion without automatically pinning the task again; the current draft and filter remain. Calculator results in scientific notation can now be reused, for example `=1e-7*2`. These are original 1.1.7 development desktop captures, including browser chrome, with no cropping or redrawing.

<details>
<summary>View Chinese / English dark Tasks and the light calculator</summary>

![Chinese dark Tasks: Undo completion](docs/screenshots/completion-calculator-1.1.7/tasks-undo-dark-zh.jpg)

![English dark Tasks: draft and filter retained alongside Undo completion](docs/screenshots/completion-calculator-1.1.7/tasks-undo-dark-en.jpg)

![English light calculator: reuse a scientific literal](docs/screenshots/completion-calculator-1.1.7/calculator-scientific-light-en.jpg)

[Capture provenance](docs/screenshots/completion-calculator-1.1.7/capture-metadata.json)

</details>

### Earlier feature captures · 1.1.7 Tasks and Focus

Complete the pinned Next up task directly, without expanding a long list. Start stays disabled while minutes are unsaved; saving a duration never starts the timer. These actual 1.1.7 development captures use synthetic English tasks: the Chinese light interface shows saved 30-minute Ready state; the cropped English dark Focus card shows an unsaved 30-minute draft while the committed timer remains 25 minutes.

![Chinese light interface: direct pinned-task completion and saved Focus duration](docs/screenshots/tasks-focus-1.1.7/tasks-focus-light-zh.png)

![English dark interface: unsaved minutes reveal Save and disable Start](docs/screenshots/tasks-focus-1.1.7/tasks-focus-draft-dark-en.png)

[Capture provenance and crops](docs/screenshots/tasks-focus-1.1.7/capture-metadata.json) · [Tasks acceptance scope](docs/tasks-pinned-completion-validation.md) · [Focus draft protection](docs/focus-duration-draft-validation.md)

### Earlier captures · More actions

Every saved-site tile now has a visible “⋯” button for the existing Open, Edit, Delete and reorder menu, with keyboard access. These actual English-interface captures use six test sites and are cropped only, not redrawn.

![Earlier light wide interface with a site's More actions menu](docs/screenshots/shortcut-menu/more-light-wide.png)

<details>
<summary>Dark narrow menu capture</summary>

![Dark narrow interface with the edge menu kept in the visible area](docs/screenshots/shortcut-menu/more-dark-narrow.png)

</details>

[Usage and acceptance scope](docs/shortcut-order.md) · [Capture versions and crops](docs/screenshots/shortcut-menu/capture-metadata.json)

**A / Clarity · Light · Grid layout**

![Local iTab Clarity light template with sample categorized shortcuts, search, and clock](docs/screenshots/clarity-light-grid.png)

### Earlier template captures · Twelve additional styles · Light / Dark

Actual interface captures of the twelve additional templates use the same 18-site sample setup, with English controls and Chinese categories. Only the browser's testing notice and bottom bar were cropped away; the interface was not redrawn. Images show the captured visible area, and longer content continues below it. Weather and other cards contain manually entered examples, not live data.

The overviews below are contact sheets assembled from proportionally reduced actual captures. See the links for individual images and capture/crop provenance.

![Twelve new light templates, ordered Atelier, Quiet, Studio, Console, Prism, Library, Horizon, Ledger, Meadow, Blueprint, Terrace, Column](docs/screenshots/templates/overview-light.png)

![Twelve new dark templates in the same order as the light overview](docs/screenshots/templates/overview-dark.png)

[View all 24 individual captures and the style guide](docs/template-gallery.en.md#screenshot-gallery) · [Capture provenance and crop details](docs/screenshots/templates/capture-manifest.json)

<details>
<summary>More templates and actual feature captures</summary>

### Earlier feature captures

Actual interface captures with sample data and English controls. The images are cropped, never redrawn. Task captures focus on the cards; the other images show the visible page area at capture time. Some content requires scrolling.

**Local tasks and focus timer · Light / Dark**: the light capture shows one match for `review` and the clear-filter control; the dark capture shows both tasks without a filter.

![Light task cards with one filtered match and the focus timer](docs/screenshots/current-features/tasks-filter-light.png)

![Dark task cards with two unfiltered tasks and the focus timer](docs/screenshots/current-features/tasks-filter-dark.png)

**Local calculator**: entering `=(12+3)/2` in search displays `7.5`.

![Local calculation result in the search box](docs/screenshots/current-features/calculator.png)

**Bookmark import preview**: review new-item counts, folder mapping and privacy settings before saving.

![Bookmark HTML import preview and confirmation controls](docs/screenshots/current-features/bookmark-preview.png)

[Original captures, revision and crop details](docs/screenshots/current-features/capture-manifest.json)

### Original A / B / C templates and Free layout

**B / Graphite · Dark · Category groups**

![Local iTab Graphite dark template with shortcuts grouped by their categories](docs/screenshots/graphite-dark-grid.png)

**C / Folio · Light · Category groups**

![Local iTab Folio light template showing the first two category groups and sample weather and topics cards](docs/screenshots/folio-light-grid.png)

**A / Clarity · Dark · Grid layout**

![Local iTab Clarity dark template using the same sample setup](docs/screenshots/clarity-dark-grid.png)

**B / Graphite · Light · Category groups**

![Local iTab Graphite light template with shortcuts grouped by their categories](docs/screenshots/graphite-light-grid.png)

**C / Folio · Dark · Category groups**

![Local iTab Folio dark template showing the first two category groups and sample weather and topics cards](docs/screenshots/folio-dark-grid.png)

**A / Clarity · Light · Free layout without grid snapping**

![Local iTab Clarity light Free layout after dragging GitHub, with Saved status visible](docs/screenshots/free-layout.png)

</details>

</details>

</details>

<a id="install"></a>

## Install and get started

1. Download and extract the repository source, or clone this repository. The source loads directly without a build step.
2. Open `chrome://extensions/` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select **the folder that directly contains `manifest.json`**, usually `chrome-local-itab/` or the extracted repository folder. Do not select the ZIP file or its parent folder.
4. Open a new tab, add your favorite websites, and visit Settings to customize appearance, search, and modules.

Use Chrome with Manifest V3 support. Shortcut and layout write-conflict protection also relies on `navigator.locks`; if the required browser API is unavailable, those writes fail with an error.

**Backup reminder:** Settings JSON and Drive snapshots exclude Tasks, Focus timer, Scratchpad and Countdown. Use [Complete local backup](docs/complete-backup.en.md) for saved personal modules, or keep using separate exports. Unsaved drafts and Focus sessions cannot be migrated. World-clock preferences belong to settings. Before uninstalling or clearing data, save the copies you need using the [migration checklist](docs/migration.en.md).

### Upgrade an existing unpacked installation

1. Save edits in all open pages and download a [complete local backup](docs/complete-backup.en.md), selecting the saved modules you need. Ordinary settings JSON and Drive snapshots exclude personal modules. Older versions without complete backup require the available separate exports and manually noted Focus preferences. Unsaved drafts and timer sessions cannot be migrated. Export Scratchpad from the existing tab containing the text you want to keep, especially an unsaved or conflicted draft.
2. Download the runtime ZIP from the GitHub release, extract it, and replace files **inside the same permanent folder originally loaded**, keeping `manifest.json` at that folder's root. Do not remove the extension or load the newly extracted folder as another extension; changing folders may change its identity and make existing data inaccessible.
3. Find Local iTab at `chrome://extensions/` and click **Reload**, then refresh open new-tab and Settings pages and verify the installed version and existing data.

See [version checks, separate backup shortcuts and update steps](docs/version-updates.md). Checking for updates never downloads, replaces files or reloads automatically.

<a id="features"></a>

## Features

<a id="local-ai"></a>

### Local AI libraries: from prompts to saved results

Prompt library and AI collections are device-local libraries shared across workspaces. They do not call models or upload content automatically. The optional [model workflow](docs/ai-model-workflow.md) lets you choose an OpenAI-compatible HTTPS endpoint, grant that origin access, review the exact prompt and explicitly send it. Providers may charge. Keys stay only in the dialog and never enter storage or backups; saving the response is a separate action.

1. **Save a template and review its preview.** Create a title and body, optionally add categories, tags and `{{variables}}`, then explicitly Save when you want to keep it. New unsaved drafts also support an explicit local preview: fill variables, review the completed text and choose Copy without saving. Editing any draft field, switching prompts, closing, or starting a save clears these temporary values. Saved templates keep placeholders. Saving body changes retains version history. [Prompt library guide](docs/prompt-library.md#english)
2. **Choose the version to use.** Selecting a history row only inspects its body; **Use this version** switches the usable preview, and **Return to current version** explicitly switches back. Each exact version keeps separate temporary variable values in this tab. Reloading or closing loses them; they never enter saved bodies, history or backups. **Clear values** clears the active and current versions' values and returns to current. Compare two saved versions from history to inspect added, removed and unchanged lines and newline summaries, without restoring or editing either body. [Historical previews](docs/prompt-history-preview.md) · [Version comparison](docs/prompt-version-comparison.md)
3. **Review an excerpt before inserting it.** Choose an active saved collection item, inspect its full body and the value to be replaced, then explicitly replace that one variable. Only the reviewed body is inserted; notes, source and tool labels are excluded. The template and other variables stay unchanged. [Excerpt-to-variable guide](docs/prompt-excerpt-variables.md)
4. **Save a result manually with its exact version.** **Save a result for this version** opens a new tab with an empty, unsaved collection draft linked to the version actually used by the preview. Enter the result body, review its link and explicitly Save; nothing reads the clipboard or fills in a result. You can also choose a prompt and exact version in the collection editor, review and apply the link, then Save. Result lists in the preview and history show only active collections linked to that exact prompt/version. They do not follow the latest version or rank quality; cards open in a new tab. [Collection guide (Chinese)](docs/ai-collections.zh-CN.md) · [Exact linked results](docs/prompt-linked-results.md) · [New result drafts](docs/releases/1.1.36.md#english)
5. **Find saved material again.** Unified search on the new tab matches saved prompt and collection titles, bodies and tags, including collection notes. Filter by record type. Reopening retains this page's query and type while rereading saved data; Clear removes only the query, and a page reload resets both. [Search scope](docs/ai-library-search.md#english)

In an active collection detail with an exact version link, choose **Compare saved results**, then explicitly choose another saved result with the same prompt ID and version ID. The two current bodies appear as literal text side by side (stacked on narrow screens), with titles, tool labels and an equal-body indication, without scoring or ranking. Drafts, archived items, other versions and recovery snapshots are excluded. A missing prompt still allows comparison by saved IDs, with source availability disclosed. Comparison is read-only and makes no network requests. A collection refresh, write or read failure clears it; close and reopen to choose again. Candidates are never silently replaced.

Context answers and pasted excerpts without a prompt link can also use **Compare any saved excerpts**. Explicitly choose another current unarchived item and inspect literal bodies with their own source and body-version details; no shared input or model is assumed. Exact-prompt comparison remains separate, and read failure or saved-data changes require choosing again. [Manual saved-excerpt comparison](docs/manual-saved-excerpt-comparison.md)

The web-page context menu can send selected text to a new unsaved collection draft for review and explicit Save. Source URLs are excluded by default; opting in strips query and fragment. The browser may change original line breaks. [Selected-text review](docs/selection-capture.md)

**Export and back up:** review and download one saved item as Markdown. Prompts keep variable placeholders; collections include their current body, notes and metadata, with source URLs separately opt-in. Markdown is a readable copy, not a history-restoration format. Use library JSON exports or select the libraries in a complete local backup; ordinary settings JSON, Chrome Sync and Drive snapshots exclude them. Unsaved drafts and temporary variables are not backed up. Local data and exported files are unencrypted. [Markdown export](docs/local-ai-markdown-export.md) · [Complete backup](docs/complete-backup.en.md)

Collection **Import / recover JSON** strictly reviews this product’s standalone collection JSON before explicitly replacing the device-wide collection (not merging). The old library remains in recovery and can be reviewed and restored from the same dialog. Cancel writes nothing; changed data needs a new review and uncertain outcomes should be checked read-only. [Standalone collection JSON import](docs/collection-json-import.md#english)

### AI context Q&A: review and copy locally first

For Answer mode only, **Show answer progressively** is optional and off by default. Local and endpoint reviews show whether it is on. Tasks stay non-streaming. Partial text appears in a separate, explicitly incomplete area; it cannot be saved or copied with answer controls. Only a validated complete response becomes an answer. Stop, failures and truncated streams keep an incomplete label; previous completed responses remain separate. Switching away from the page stops the request and clears the key; closing discards the partial text. Nothing runs persistently in the background. This uses the existing strict SSE parser and unchanged explicit review/allow/send flow. Real-provider streaming compatibility has not been verified; tests use only synthetic SSE and mocks.

Open **AI context Q&A** from the new tab, enter a question and optionally select saved excerpts from the global AI collection and the current workspace’s saved note. No source is selected automatically. Without configuring an endpoint, model or key, choose **Review prompt locally**, inspect the complete text and then **Copy reviewed prompt**. The prompt includes selected excerpts; check for private information or secrets before pasting it into an external service. Local review and copying do not call a model, grant endpoint access or save content.

To use a model inside the extension, configure your own connection and separately review the complete request, allow endpoint access and explicitly send it. Local review does not replace these steps; providers may charge. Save an answer explicitly, or preview every extracted task before confirming its addition to Tasks. Tasks are never executed automatically. [Workflow and privacy](docs/ai-context-workflow.md)

For tasks returned by an external AI website, choose **Draft tasks for review** → **Review external task JSON**. Paste plain `{"tasks":["one task"]}` JSON, explicitly load it, select the tasks, review the exact list and confirm adding it. No connection or key is required. Loading and reviewing do not send or save anything; only final confirmation writes tasks. The result is marked manually pasted and cannot be saved as an answer or source snapshot. [Limits and safe replacement](docs/ai-context-external-tasks.md).

In the AI context panel, explicitly choose **Copy answer** or **Copy task JSON** to copy only the currently displayed response. No question, source snapshot, endpoint or key fields are appended. An earlier answer stays copyable after request edits, with its previous-request label intact. Copying does not save anything or change task review; if blocked, select the response text and copy manually. Responses may repeat private input, so inspect the text before copying.

### New tab and everyday tools

- **Browser bookmark export**: In Settings → Data, export saved site titles, full URLs and category folders to a local HTML file. Review the privacy confirmation first; unsaved edits, icons, settings and local tools are excluded. [Scope and limits](docs/bookmark-export.md).

- **Search and go**: Use Google, Bing, DuckDuckGo, or a custom search URL, or open a website directly. Use `%s` for the search term in a custom template, such as `https://example.com/search?q=%s`.
- **Organized shortcuts**: Add, edit, and delete saved websites; filter by category; choose Grid (default, with drag reordering), Free placement (no snapping), or Manual · snap to grid using the Placement selector on the dashboard or in Settings. Switching keeps saved positions. The context menu includes shortcut actions and an option to open every website in a category.
- **Try a template with your content**: The new-tab gallery now offers a temporary preview followed by explicit Apply or Cancel. Closing or Escape discards the preview; existing backgrounds, card overrides, module drafts and saved site coordinates are preserved. Apply verifies a template-only local save before any already-enabled Sync scheduling. Settings and the compact selector retain immediate saving. [Preview behavior and safety](docs/template-live-preview.md).
- **Twenty-one workspace templates**: Choose A / Clarity, B / Graphite, C / Folio or one of eighteen other designs, each with light and dark colors. The six latest additions, Dispatch, Today, Bookmark, Dock, Mosaic and Paper, offer different structures, densities and navigation patterns. [Six-layout guide](docs/dashboard-template-expansion.md). New installations use A/light. Selecting a style saves appearance only, preserving sites, categories, Tasks, backgrounds, placement mode and stored coordinates. Grouped styles use real categories in Grid; manual layouts retain one coordinate plane. [Style guide](docs/template-gallery.en.md).
- **Card order and width**: In Customize, reorder cards while keeping the selected template structure, or choose a clearly labeled custom grid with widths of 1–4 columns. Existing layouts keep their saved behavior. Live preview, Cancel, Save and restore defaults keep control in your hands; widths shrink on narrow screens and rows grow automatically. [Card layout guide](docs/dashboard-card-layout.md).
- **Your layout and appearance**: Use the template background, a solid color, or a local image. Adjust columns, spacing, icons, and titles, and show or hide individual modules.
- **Small local cards**: A clock, weather, topics, a movie, and a personal quote. Weather, topic, and movie cards are manually maintained and hidden by default; they do not fetch live feeds.
- **Local JSON backups**: Export settings and local images, or import an existing backup. Imports validate the data and ask for confirmation. Restoring replaces the current configuration, so export a copy first. Files over 10 MiB show a memory-risk warning before reading and can be cancelled. Restoring large files still depends on available browser memory. The current device's sync state is retained.
- **Optional cloud features**: Chrome Sync handles lightweight settings synchronization; Google Drive stores manual snapshots grouped by computer name. Their behavior and limits are explained below.

- **Find a setting**: Search built-in setting names across all six Settings tabs, then open the matching section with a click or keyboard. Queries stay temporary and local; saved content and form values are excluded. [Settings search guide](docs/settings-search.md).

Settings saves only changed fields and keeps conflicting drafts for review. The dashboard search selector and hide/show controls preserve the latest saved custom search URL, shortcut styles and other preferences. Open fresh Settings and dashboard pages after a whole restore, reset or applied Chrome Sync snapshot. [Save protection and scope](docs/settings-save-safety.md).

### Complete local backup

Settings → Data can export seven selected saved modules: configuration (including sites and local images), Tasks and history, Scratchpad, Countdown, Focus preferences and both global prompt and AI collection libraries (schema 4 with collections; schema 3 with prompts but no collections; schema 2 with workspace modules only). Review modules and confirm each selected global destination before replacement; unselected modules remain unchanged. A recovery snapshot containing all workspace modules and only the selected global libraries is retained before restore, with no automatic page reload. Unsaved drafts and live timer sessions are excluded; unfinished Focus sessions block restoring Focus preferences. Chrome Sync and Drive scope is unchanged. [Guide, limits and recovery](docs/complete-backup.en.md).

## Search and website management

Shortcut and task editors keep the dialog and draft when Escape is used during IME composition. Ordinary Escape after composition still closes the dialog. [Behavior and verification scope](docs/dialog-ime-validation.md#english).

Reloading or closing a tab requests Chrome’s native warning while an Add/Edit shortcut has changed fields or an unresolved save. Pristine or fully reverted forms do not warn. Cancel, ×, backdrop clicks and ordinary Escape still discard the draft; successful saves release protection. Chrome may suppress the warning, and unsaved drafts are not persisted. [Scope and verification](docs/shortcut-departure-validation.md#english).

[Offline local-workflow checks and scope](docs/offline-local-validation.md).

### Discover and add sites

Choose **Discover sites** in the new-tab shortcut area to browse 146 built-in sites, 18 categories and 218 use tags. Search by name or use, then combine category, use, operator location, organization, pricing and **All / Not added / Added** filters. Operator location does not indicate where a site is accessible. Pricing and account requirements can change; check the card’s sources and the official website.

Select sites individually or use **Select current results**, keeping up to 20 selected sites. Choose an existing destination category or enter a new category name, then choose **Review selected**. Check the complete list and destination, then choose **Confirm and add** for an existing category or **Create category and add (N)** for a new one. Sites hidden by filters stay selected, and review includes the whole selection. **Deselect current results (N)** only deselects currently visible results, keeping hidden selections, filters, the destination and any new-category draft; it does not save shortcuts.

Browsing, searching and filtering are offline, and no site is added automatically. Adding uses and rechecks your existing Sync and online-icon settings. Opening a website or source link needs a network connection. [Site library and privacy](docs/navigation-library.md)

### Find saved sites

Use the local shortcut finder to search saved titles, addresses and categories in the current workspace, or explicitly choose All workspaces for active workspaces on this device. Browse an exact category and narrow it with text without sending queries to the web. Results are verified against the latest saved record before opening; queries never alter layout or Tasks. [Finder guide](docs/shortcut-finder.en.md).

### Import browser bookmarks

Preview and add bookmarks from a local Chrome, Edge or Firefox HTML export without replacing your saved dashboard. Review duplicate skips, folder mapping and currently enabled Sync/icon settings before Apply. [Bookmark import guide](docs/bookmark-import.en.md).

After deleting a shortcut, **Undo delete** restores the latest deletion on the same page. Refreshing clears it; later changes may prevent undo. [Scope and safety details](docs/shortcut-undo.md).

### Local calculator

Start a search with `=` and press Enter (or Calculate), for example `=(12 + 3) / 2` → `7.5`. Supports decimals, unary `+`/`-`, `+ - * /` and parentheses. Expressions, results and errors stay in this tab: no search request, history or storage, including with an unconfigured custom search engine. Remove `=` to return to ordinary search. Editing clears the previous result.

After a successful calculation, Tab to the readonly result field to select its exact value, then press Ctrl/Cmd+C to copy with your browser. Calculation keeps focus on the expression; editing or starting IME composition clears the field. Results may display scientific notation and can be pasted into a new calculation, for example `=1e-7 * 2`.

<details>
<summary>Calculator scope and precision limits</summary>

Limit: 256 characters after `=` and 32 combined levels of nested parentheses/unary signs. Uses JavaScript floating-point numbers: decimal rounding, underflow and large-integer precision limits apply (`=0.1 + 0.2` gives `0.30000000000000004`). Not for exact financial calculations. Division by zero and non-finite results show local errors. Decimal literals accept an optional `e`/`E`, optional `+`/`-`, then one or more exponent digits, with no spaces inside the literal (for example `.5E+2`). Exponent digits count toward the same 256-character limit; overflow is an error, while underflow may become zero. Percentages, variables and unit conversions are not supported. A settings-sync reload is deferred while calculator input remains; explicitly reloading can discard it.

</details>

## Local productivity tools

### Local Tasks

Enable the optional, empty-by-default Tasks card in module visibility settings. Add/edit/complete tasks, filter all task states locally by text, pin one next action and recover removed items. Tasks stay on this device; settings exports, Chrome Sync and Drive backups exclude all task content and recovery copies. Settings reset/import/restore preserve Tasks. Use the separate task export/import or select Tasks in a complete local backup for migration. [Task guide](docs/local-tasks.en.md).

Use **Add multiple tasks** to paste one task per nonblank line, inspect a numbered preview and confirm the entire batch together. Spaces, bullet prefixes and duplicate lines stay intact; ordinary Add still supports Shift+Enter inside one task. Preview/cancel writes nothing. Limits stay at 500 total records (including completed/removed), 1,000 Unicode characters per task and a 2 MiB collection/file budget. A failed validation adds no tasks; uncertain saves retry the same batch safely. [Batch validation and screenshots](docs/tasks-batch-capture-validation.md).

### Local focus timer

Enable the optional Focus timer in Settings. It starts hidden, with 25-minute focus and 5-minute break defaults; each phase accepts whole minutes from 1 to 180 while ready. Start, Pause/Resume and Stop/reset are explicit. Choosing the next phase never starts it automatically.

All open extension pages share one device-local session. Hiding the card keeps that session. Settings-only reset preserves its exact state; templates and configuration imports do not start or replace it. Configuration exports, Chrome Sync and Drive backups exclude the timer. It has no task association, history, sound, network requests or system notifications and needs no new permission.

<details>
<summary>Timing and recovery limits</summary>

While a page is active, elapsed time is checked against a monotonic clock. After all pages close, reopening estimates remaining time from the device clock; a clock change during that gap cannot be distinguished from elapsed time. Detected clock disagreement asks you to reset. Completion is shown locally: there is no exact-time alert while all pages are closed. Storage failures offer Read latest state; a failed acknowledgement may still have saved the change, so check the refreshed state before trying again.

</details>

### Local Scratchpad

Enable Scratchpad under Settings → Module Visibility for plain-text notes, links or snippets. It is off by default and autosaves on this device after typing pauses. Conflicting tabs keep your draft and offer an explicit choice between the saved text and your version. Export the current draft as TXT, or select one UTF-8 TXT file to preview and explicitly replace the saved note. Import requires a settled note and accepts up to 32,000 Unicode characters / 128 KiB; Cancel writes nothing. [Text import, limits and recovery](docs/local-scratchpad.en.md).

Scratchpad is excluded from configuration exports, Chrome Sync and Google Drive backups. Before uninstalling or clearing browser data, include saved Scratchpad text in a complete local backup or export text separately; unsaved/conflicted drafts still need export from their original tabs. [Scope and validation](docs/local-scratchpad-validation.md).

<details>
<summary>Scratchpad TXT import captures</summary>

![Scratchpad TXT import preview: actual English light interface](docs/screenshots/scratchpad-import/scratchpad-import-light-wide.png)

![Scratchpad TXT import preview: actual English dark interface](docs/screenshots/scratchpad-import/scratchpad-import-dark-wide.png)

[Capture provenance and crop record](docs/screenshots/scratchpad-import/capture-metadata.json)

</details>

### Local month calendar

Open **Calendar** beneath the clock date to browse months locally. **Previous / Next / Today** change the view; dates are read-only, with no events or reminders. It works offline, does not save the browsed month and has no calendar state to back up or sync. [Calendar guide](docs/month-calendar.en.md) · [Validation scope](docs/month-calendar-validation.md).

<details>
<summary>Calendar captures and dimensions</summary>

The light wide capture uses Simplified Chinese; the dark narrow capture uses English.

![Simplified Chinese month calendar in a real light wide window, with the localized date](docs/screenshots/month-calendar/calendar-light-wide.png)

![English month calendar in a real dark narrow window, with the date and calendar expanded](docs/screenshots/month-calendar/calendar-dark-narrow.png)

[Calendar captures and dimensions](docs/screenshots/month-calendar/capture-metadata.json)

</details>

### Offline world clocks

Add up to four time zones in Settings, with optional short labels. They share your clock format, work offline and compare each calendar date with your device date. Use **Move up / Move down** to reorder the draft, then **Save clocks** or **Save settings** to apply it. Saved changes update open dashboards directly; configuration backups and optional Sync retain the saved order. [Setup and backup behavior](docs/world-clocks.en.md).

Choose **Compare times** on the world-clock card to preview a call time. The slider moves from −24 to +24 hours in 15-minute steps, measured as elapsed minutes from the instant you opened comparison. The preview stays fixed while the main clock, calendar and timers remain live. The local reference includes date, time and time-zone abbreviation; Same day / Previous day / Next day (or signed day counts) are relative to that reference date. Daylight-saving changes and half-/quarter-hour zones use the browser’s time-zone rules. Use the slider’s arrow keys or Home/End, and choose **Back to now** to restore live world clocks. Comparison is only on this page: no save, sync, backup, network request or added permission. Clock setting/template changes preserve the preview while the card exists; removing all clocks or reloading clears it.

### Offline Countdown

Name one milestone and see local calendar days left, Today, or days ago. Hidden by default, saved only on this device, with explicit Save/Cancel and text export. [Usage and privacy](docs/local-countdown.en.md).

<details>
<summary>Countdown captures</summary>

Actual Countdown card in light and dark appearance, with English controls:

![Local Countdown: actual light interface](docs/screenshots/countdown/countdown-en-light-wide.png)

![Local Countdown: actual dark interface](docs/screenshots/countdown/countdown-en-dark-wide.png)

[Capture provenance](docs/screenshots/countdown/capture-metadata.json)

</details>

## Appearance and workspaces

### Independent workspaces

Keep sites, categories, layouts, appearance, Tasks, Scratchpad, Countdown and Focus state separate for work, study or personal use. Create, rename, duplicate and recover spaces from Trash. Existing tabs stay pinned; switching handles drafts explicitly. Migration preserves original data in Default, and complete archives include live and trashed spaces. Chrome Sync / Drive retain their original Default-only configuration scope. These are not account or security boundaries. [Usage and recovery guide](docs/workspaces.en.md).

The recommendations below only choose module visibility; they are separate from independent data workspaces.

### Recommended workspaces

Preview and explicitly apply local Tasks/Focus visibility recommendations separately from visual themes. Existing content and timer sessions stay intact. [Workspace guide](docs/workspace-presets.en.md).

<a id="privacy"></a>

## Data, privacy, and network behavior

**Backup reminder:** Settings JSON and Drive snapshots exclude Tasks, Focus timer, Scratchpad and Countdown. Use [Complete local backup](docs/complete-backup.en.md) for saved personal modules, or keep using separate exports. Unsaved drafts and Focus sessions cannot be migrated. World-clock preferences belong to settings. Before uninstalling or clearing data, save the copies you need using the [migration checklist](docs/migration.en.md).

### Moving to another browser or device

Configuration backups do not include Tasks, Focus timer, Scratchpad or Countdown. Follow the [migration checklist](docs/migration.en.md) to keep a complete local backup or separate exports before uninstalling or clearing data.

Settings, shortcuts, and uploaded images are primarily stored in `chrome.storage.local`. Website icons use a local IndexedDB cache, and some interface state is stored in browser local storage. The extension includes no analytics or advertising scripts.

- **Search**: Typing does not send search input. Submitting a search or opening a URL visits the selected provider or destination website.
- **Website icons**: Online fetching is off by default. Enabling it also requires the optional `https://www.google.com/*` permission on the current device. The extension then sends website domain names to Google's favicon service to retrieve icons. Valid cached icons can be reused offline; the current cache lifetime is seven days.
- **Local cards and backgrounds**: Weather, topic and movie content, and uploaded backgrounds do not depend on remote content feeds.
- **Chrome Sync**: The default configuration is off. Once enabled, settings are shared through `chrome.storage.sync`. A new installation may automatically read and apply an existing enabled sync configuration from the same Chrome account.
- **Google Drive**: Requires separate Google authorization. Connecting, refreshing, backing up, downloading, restoring, and deleting snapshots contact Google APIs. There is no scheduled automatic backup.

Offline-first means the core page can run locally. When you enable cloud features or visit a website, the relevant service receives the data needed for that action.

### Chrome Sync: lightweight settings

Sync shortcuts and settings between browsers using the same Chrome account, subject to Chrome's sync availability and storage quotas. Embedded background images, posters, and icons are omitted or replaced with defaults in the synced data. Use JSON export or Drive snapshots when you need the images included.

Duplicate URLs can have independent positions without losing legacy coordinates. Identity-bearing backups use schema 2 and require an updated importer. Older clients can strip these fields, so Chrome Sync preserves local data and asks for review when copies are incompatible. See [independent positions, compatibility and recovery](docs/layout-identities.md).

### Google Drive: manual snapshots

- Connect Google Drive in Settings and choose a computer name for your backups.
- Snapshots contain settings and local images. They are stored in Drive's hidden `appDataFolder`, using the `drive.appdata` authorization scope.
- Browse, download, restore, or delete snapshots by computer name. After a normal backup, the extension attempts to remove older snapshots for that computer, keeping the latest 20.
- Each snapshot is limited to 25 MiB. Snapshots over 5 MiB require an additional confirmation.
- Before restoring from Drive, the extension attempts to upload the current configuration as a safety snapshot. If that fails, it asks whether to continue. Restoring replaces the current configuration on this device.

This feature depends on the Chrome Identity API, a working OAuth configuration, and Google authorization. Check that configuration for development or self-packaged installations. Local use and JSON import/export do not depend on Drive.

### Extension permissions

The permissions declared in [manifest.json](manifest.json) include:

- `contextMenus`: explicit selected-text review in a fresh unsaved collection draft.
- `storage` and `unlimitedStorage`: settings and local image data.
- `identity` and `https://www.googleapis.com/*`: optional Google Drive authorization and backups.
- Optional `https://www.google.com/*`: online website icon fetching.
- Optional `https://*/*`: user-chosen HTTPS model providers. Runtime permission requests name only the reviewed hostname and port; granting access alone never sends content.

## Documentation and interface languages

The default README is [Simplified Chinese](README.md), with English and [Spanish](README.es-ES.md) translations.

The extension currently includes Simplified Chinese (`_locales/zh_CN`) and English (`_locales/en`) interface resources. It uses the browser language through `chrome.i18n`, with English as the fallback. Spanish is currently a documentation translation only.

The main clock’s complete date, including date order and weekday/month names, follows an explicit locale tag in the displayed CN/EN message catalog, falling back to Chrome’s predefined `@@ui_locale` message, Chrome’s UI language, the preferred browser language and then the runtime locale if unavailable or invalid. Day-of-year and ISO-week labels also use the interface language. Time formatting and date placeholders in custom quotes are unchanged. Newly generated welcome text is localized; saved or imported quotes (including the old English welcome) are never translated or migrated. Existing quote validation, including trimming and the English fallback for empty strings, is unchanged. Missing quote fields receive the new localized default.

New default category names follow the CN/EN message catalog actually selected by Chrome, with English fallback for other languages or unavailable messages. Category IDs, icons and order stay the same. Saved or imported names do not change with the interface language, including names matching old defaults and custom categories. Configurations without a category field and explicit resets receive localized defaults; a saved empty category list remains empty.

<a id="development"></a>

## Local development and checks

Built with Manifest V3, vanilla JavaScript, and CSS. No dependency installation or bundling is needed. With Node.js installed, run these commands from the repository root:

```bash
# Run all regression tests
node --test tests/*.test.js

# Check JavaScript syntax
for file in *.js shared/*.js tests/*.js tests/helpers/*.js assets/*.js; do
  node --check "$file" || exit 1
done

# Validate manifest and locale JSON
node -e 'const fs = require("node:fs"); for (const file of ["manifest.json", ...fs.readdirSync("_locales").map(locale => "_locales/" + locale + "/messages.json")]) JSON.parse(fs.readFileSync(file, "utf8")); console.log("JSON OK");'

git diff --check
```

These checks cover logic regressions, JavaScript syntax, and JSON validity; they do not replace testing in a real browser. Before a release, load the unpacked extension and check both interface languages, keyboard use, dragging, editing across tabs, backup restoration, and optional online flows. See the [release checklist](docs/release-checklist.md) for additional release tasks.

### Build and verify an extension ZIP

For unpacked development, no build is required. For an offline runtime-only ZIP, use Python 3.10+ (standard library only) from the repository root:

```bash
python3 tools/package_extension.py --output dist/local-itab-current.zip
python3 tools/package_extension.py --verify dist/local-itab-current.zip
python3 -m unittest discover -s tests -p '*_test.py'
```

The commands above explicitly use ignored `dist/local-itab-current.zip`. Without `--output`, the filename uses the version in `manifest.json`: `dist/local-itab-<version>.zip`. Existing files are never overwritten; use `--output /path/to/new-package.zip` for another output. Paths inside the source tree must be under `dist/`; historical `release/*.zip` files are preserved and are not current build inputs.

The explicit runtime list includes the shared modules, both interface locales and used icons. Missing listed files or local HTML script/link/image, CSS `url()`/`@import`, and manifest entrypoint/icon references fail the check. New dependencies must be added to `RUNTIME_FILES` in the utility; JavaScript-generated paths and dynamic imports still require manual review. Tests, docs, screenshots, tooling, unlisted files and old archives are excluded. ZIP entries use sorted paths, fixed timestamps and uncompressed bytes for reproducibility.

The command reports the source Git revision (and working-tree status, or unavailable for a source download), file count and ZIP SHA256. `--verify` checks the ZIP against the current source bytes and canonical ZIP metadata, so a package from another revision may fail. This is packaging verification, not browser testing or release approval. Before uploading, extract the new ZIP into a separate directory, load that directory in Chrome and complete the [release checklist](docs/release-checklist.md). Packaging does not change the manifest version or publish anything.

**Commit and release policy:** Make one coherent commit per feature or fix and promptly push it to `master` after testing, leaving `manifest.json` unchanged for ordinary development. After 2–3 feature commits, use a separate release commit to increment the patch version once and record the whole batch; documentation maintenance and the release commit itself are not mechanically counted as features. Every master push in this public repository runs full tests and runtime-package verification. Development commits skip publication; only an explicit version bump creates the matching tag, Release, runtime ZIP and checksums from its exact SHA. The version must be one patch above the latest ancestor formal Release; finish or recover the previous release before retrying a blocked later one. A version already pointing to another SHA is rejected; published files are never overwritten. A short source hash in a test filename is traceability, not an extension version. `master` and GitHub Releases may be ahead of store approval. Chrome Web Store submissions remain consolidated to at most one per UTC+08 calendar day, only with new tested changes and no version under review; otherwise skip submission. CI makes no version-bump commit and does not submit to the store. This guarantees neither daily store availability nor review timing. Each version also requires a source-controlled `docs/releases/<version>.md` with actual additions, fixes, caveats and a concise English summary; changes precede installation instructions. See [GitHub release workflow and recovery](docs/github-releases.md).

### Code map

- `newtab.html` / `newtab.css` / `newtab.js`: new tab interface and interactions.
- `options.html` / `options.css` / `options.js`: settings and data management.
- `storage.js`: local storage, validation, import/export, and Chrome Sync.
- `drive-backup.js`: Google Drive snapshot backups.
- `favicon-cache.js`: website icon caching.
- `shared/`: shared search-template and dialog logic.
- `_locales/`: interface translations; `assets/`: icons and screenshots; `tests/`: local regression tests.

### Version & updates

Settings → Privacy → Version & updates shows the installed version and offers manual GitHub release checks. Optional checks run at most daily while using the new-tab page, with quiet notices and per-version ignore. No automatic installation or reload. See [version checks, privacy and installation guidance](docs/version-updates.md).

Before updating, use the shortcuts in that section to reach the existing settings and Countdown export sections without leaving Settings, saving drafts or downloading files. Tasks and Scratchpad still export from their new-tab cards; the exact paths are listed alongside the shortcuts. Saved Focus preferences can migrate through complete local backup; timer sessions cannot.

## License

The existing project documentation identifies the license as MIT. A separate `LICENSE` file is not currently included in the repository.

**Reviewed prompt refinement:** choose a saved prompt, review the exact template and refinement instruction sent to your model, compare the proposal, and explicitly accept a new version. Filled values are excluded; original history and variable placeholders are protected. [Workflow](docs/ai-prompt-refinement.md)

The optional original-versus-proposal trial uses one fresh temporary variable mapping and the same model for both reviewed requests. Answers remain temporary; accepting the proposal is still a separate decision.

### Compare models on the same completed prompt

The Prompt library's **Compare models** action can send the same reviewed prompt to one or two saved connections, with separate temporary keys, explicit origin access and a disclosed request count. Side-by-side results fail/cancel independently and are saved individually only on request. No automatic calls or retries. See [comparison workflow and verification boundaries](docs/ai-model-comparison.md).

### Check an earlier AI answer save

If persistence succeeded but its readback failed, the answer panel retains the original operation, title and snapshot choice. **Check earlier save** only reads the original receipt: it does not call the provider, write or re-save content, or request new permissions. Only an exact operation digest with valid current collection-state evidence unlocks the draft. Confirmation acknowledges historical success, not the answer's current presence: it may since have been changed, removed or restored. Backup replacement, recovery, expired receipts or unreadable storage can make verification unavailable; without valid evidence the original operation stays locked rather than guessing success.

### Filter saved excerpts by a detail tag

Click a real tag in a saved or archived excerpt’s details to apply the existing exact tag filter. Type and tool labels remain text. Search, type, tool and archive scope still intersect; comma-bearing and Unicode tags stay intact. The selected detail, focus and unsaved drafts are preserved, with no storage write. The tag dropdown and pressed state stay in sync; use Clear filters to reset.

Configuration imports now verify a local receipt before retrying an uncertain save. Older extension versions may refuse to open workspaces containing this receipt, so do not downgrade that profile. [Interrupted-import protection and recovery limits](docs/settings-save-safety.md#interrupted-configuration-imports).
