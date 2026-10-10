# Local iTab

[简体中文](README.md) · [English](README.en.md) · [Español](README.es-ES.md)

A local-first Chrome new tab page that keeps search, saved websites, and a small personal dashboard together. A simple starting point for the things you use every day.

**Offline-first · Categorized shortcuts · Custom layouts · Optional sync and backups**

No build step or Local iTab account is required. The clock, shortcut management, local images, and manually maintained cards work offline; searches, website visits, and optional cloud features need a network connection.

[Preview](#preview) · [Install](#install) · [Features](#features) · [Privacy & backups](#privacy) · [Development](#development)

<a id="preview"></a>

## Preview

Real extension screenshots captured at different feature stages. Template previews use the English interface with Chinese sample category names; feature sections identify their capture languages. Site choices, icons, and card content are illustrative; weather, topics, and movie cards are manually entered examples, not live feeds.

### Latest interactions · Undo completion and scientific literals

Undo an accidental completion without automatically pinning the task again; the current draft and filter remain. Calculator results in scientific notation can now be reused, for example `=1e-7*2`. These are original 1.1.7 development desktop captures, including browser chrome, with no cropping or redrawing.

<details>
<summary>View Chinese / English dark Tasks and the light calculator</summary>

![Chinese dark Tasks: Undo completion](docs/screenshots/completion-calculator-1.1.7/tasks-undo-dark-zh.jpg)

![English dark Tasks: draft and filter retained alongside Undo completion](docs/screenshots/completion-calculator-1.1.7/tasks-undo-dark-en.jpg)

![English light calculator: reuse a scientific literal](docs/screenshots/completion-calculator-1.1.7/calculator-scientific-light-en.jpg)

[Capture provenance](docs/screenshots/completion-calculator-1.1.7/capture-metadata.json)

</details>

### Latest feature captures · Tasks and Focus

Complete the pinned Next up task directly, without expanding a long list. Start stays disabled while minutes are unsaved; saving a duration never starts the timer. These actual 1.1.7 development captures use synthetic English tasks: the Chinese light interface shows saved 30-minute Ready state; the cropped English dark Focus card shows an unsaved 30-minute draft while the committed timer remains 25 minutes.

![Chinese light interface: direct pinned-task completion and saved Focus duration](docs/screenshots/tasks-focus-1.1.7/tasks-focus-light-zh.png)

![English dark interface: unsaved minutes reveal Save and disable Start](docs/screenshots/tasks-focus-1.1.7/tasks-focus-draft-dark-en.png)

[Capture provenance and crops](docs/screenshots/tasks-focus-1.1.7/capture-metadata.json) · [Tasks acceptance scope](docs/tasks-pinned-completion-validation.md) · [Focus draft protection](docs/focus-duration-draft-validation.md)

### More actions captures

Every saved-site tile now has a visible “⋯” button for the existing Open, Edit, Delete and reorder menu, with keyboard access. These actual English-interface captures use six test sites and are cropped only, not redrawn.

![Latest light wide interface with a site's More actions menu](docs/screenshots/shortcut-menu/more-light-wide.png)

<details>
<summary>Dark narrow menu capture</summary>

![Dark narrow interface with the edge menu kept in the visible area](docs/screenshots/shortcut-menu/more-dark-narrow.png)

</details>

[Usage and acceptance scope](docs/shortcut-order.md) · [Capture versions and crops](docs/screenshots/shortcut-menu/capture-metadata.json)

**A / Clarity · Light · Grid layout**

![Local iTab Clarity light template with sample categorized shortcuts, search, and clock](docs/screenshots/clarity-light-grid.png)

### Twelve new templates · Light / Dark

Actual interface captures of the twelve additional templates use the same 18-site sample setup, with English controls and Chinese categories. Only the browser's testing notice and bottom bar were cropped away; the interface was not redrawn. Images show the captured visible area, and longer content continues below it. Weather and other cards contain manually entered examples, not live data.

The overviews below are contact sheets assembled from proportionally reduced actual captures. See the links for individual images and capture/crop provenance.

![Twelve new light templates, ordered Atelier, Quiet, Studio, Console, Prism, Library, Horizon, Ledger, Meadow, Blueprint, Terrace, Column](docs/screenshots/templates/overview-light.png)

![Twelve new dark templates in the same order as the light overview](docs/screenshots/templates/overview-dark.png)

[View all 24 individual captures and the style guide](docs/template-gallery.en.md#screenshot-gallery) · [Capture provenance and crop details](docs/screenshots/templates/capture-manifest.json)

<details>
<summary>More templates and actual feature captures</summary>

### Current features

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

<a id="install"></a>

## Install and get started

1. Download and extract the repository source, or clone this repository. The source loads directly without a build step.
2. Open `chrome://extensions/` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select **the folder that directly contains `manifest.json`**, usually `chrome-local-itab/` or the extracted repository folder. Do not select the ZIP file or its parent folder.
4. Open a new tab, add your favorite websites, and visit Settings to customize appearance, search, and modules.

After updating the source, click **Reload** on the extension management page, then refresh any open new tab and Settings pages. Export a backup before uninstalling the extension or clearing its data.

Use Chrome with Manifest V3 support. Shortcut and layout write-conflict protection also relies on `navigator.locks`; if the required browser API is unavailable, those writes fail with an error.

**Backup reminder:** Settings JSON and Drive snapshots exclude Tasks, Focus timer, Scratchpad and Countdown. Export/import Tasks separately; export Scratchpad and Countdown as separate text files. Focus sessions cannot be migrated. World-clock preferences belong to settings. Before uninstalling or clearing data, save the copies you need using the [migration checklist](docs/migration.en.md).

<a id="features"></a>

## Features

- **Browser bookmark export**: In Settings → Data, export saved site titles, full URLs and category folders to a local HTML file. Review the privacy confirmation first; unsaved edits, icons, settings and local tools are excluded. [Scope and limits](docs/bookmark-export.md).

- **Search and go**: Use Google, Bing, DuckDuckGo, or a custom search URL, or open a website directly. Use `%s` for the search term in a custom template, such as `https://example.com/search?q=%s`.
- **Organized shortcuts**: Add, edit, and delete saved websites; filter by category; choose Grid (default, with drag reordering), Free placement (no snapping), or Manual · snap to grid using the Placement selector on the dashboard or in Settings. Switching keeps saved positions. The context menu includes shortcut actions and an option to open every website in a category.
- **Fifteen workspace templates**: Keep A / Clarity, B / Graphite and C / Folio, or choose one of twelve additional designs, each with light and dark colors. New installations use A/light. Selecting a style saves appearance only, preserving sites, categories, Tasks, backgrounds, placement mode and stored coordinates. Grouped styles use real categories in Grid; manual layouts retain one coordinate plane. [Style guide](docs/template-gallery.en.md).
- **Your layout and appearance**: Use the template background, a solid color, or a local image. Adjust columns, spacing, icons, and titles, and show or hide individual modules.
- **Small local cards**: A clock, weather, topics, a movie, and a personal quote. Weather, topic, and movie cards are manually maintained and hidden by default; they do not fetch live feeds.
- **Local JSON backups**: Export settings and local images, or import an existing backup. Imports validate the data and ask for confirmation. Restoring replaces the current configuration, so export a copy first. Files over 10 MiB show a memory-risk warning before reading and can be cancelled. Restoring large files still depends on available browser memory. The current device's sync state is retained.
- **Optional cloud features**: Chrome Sync handles lightweight settings synchronization; Google Drive stores manual snapshots grouped by computer name. Their behavior and limits are explained below.

- **Find a setting**: Search built-in setting names across all six Settings tabs, then open the matching section with a click or keyboard. Queries stay temporary and local; saved content and form values are excluded. [Settings search guide](docs/settings-search.md).

Settings saves only changed fields and keeps conflicting drafts for review. The dashboard search selector and hide/show controls preserve the latest saved custom search URL, shortcut styles and other preferences. Open fresh Settings and dashboard pages after a whole restore, reset or applied Chrome Sync snapshot. [Save protection and scope](docs/settings-save-safety.md).

## Search and website management

### Find saved sites

Use the local shortcut finder to search saved titles, addresses and categories without sending queries to the web. Results are verified against the latest saved record before opening; queries never alter layout or Tasks. [Finder guide](docs/shortcut-finder.en.md).

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

Enable the optional, empty-by-default Tasks card in module visibility settings. Add/edit/complete tasks, filter all task states locally by text, pin one next action and recover removed items. Tasks stay on this device; settings exports, Chrome Sync and Drive backups exclude all task content and recovery copies. Settings reset/import/restore preserve Tasks. Use the separate task export/import for backup and migration. [Task guide](docs/local-tasks.en.md).

### Local focus timer

Enable the optional Focus timer in Settings. It starts hidden, with 25-minute focus and 5-minute break defaults; each phase accepts whole minutes from 1 to 180 while ready. Start, Pause/Resume and Stop/reset are explicit. Choosing the next phase never starts it automatically.

All open extension pages share one device-local session. Hiding the card keeps that session. Settings-only reset preserves its exact state; templates and configuration imports do not start or replace it. Configuration exports, Chrome Sync and Drive backups exclude the timer. It has no task association, history, sound, network requests or system notifications and needs no new permission.

<details>
<summary>Timing and recovery limits</summary>

While a page is active, elapsed time is checked against a monotonic clock. After all pages close, reopening estimates remaining time from the device clock; a clock change during that gap cannot be distinguished from elapsed time. Detected clock disagreement asks you to reset. Completion is shown locally: there is no exact-time alert while all pages are closed. Storage failures offer Read latest state; a failed acknowledgement may still have saved the change, so check the refreshed state before trying again.

</details>

### Local Scratchpad

Enable Scratchpad under Settings → Module Visibility for plain-text notes, links or snippets. It is off by default and autosaves on this device after typing pauses. Conflicting tabs keep your draft and offer an explicit choice between the saved text and your version. Export the current draft as TXT, or select one UTF-8 TXT file to preview and explicitly replace the saved note. Import requires a settled note and accepts up to 32,000 Unicode characters / 128 KiB; Cancel writes nothing. [Text import, limits and recovery](docs/local-scratchpad.en.md).

Scratchpad is excluded from configuration exports, Chrome Sync and Google Drive backups. Export it separately before uninstalling or clearing browser data. [Scope and validation](docs/local-scratchpad-validation.md).

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

### Recommended workspaces

Preview and explicitly apply local Tasks/Focus visibility recommendations separately from visual themes. Existing content and timer sessions stay intact. [Workspace guide](docs/workspace-presets.en.md).

<a id="privacy"></a>

## Data, privacy, and network behavior

**Backup reminder:** Settings JSON and Drive snapshots exclude Tasks, Focus timer, Scratchpad and Countdown. Export/import Tasks separately; export Scratchpad and Countdown as separate text files. Focus sessions cannot be migrated. World-clock preferences belong to settings. Before uninstalling or clearing data, save the copies you need using the [migration checklist](docs/migration.en.md).

### Moving to another browser or device

Configuration backups do not include Tasks, Focus timer, Scratchpad or Countdown. Follow the [migration checklist](docs/migration.en.md) to keep separate copies before uninstalling or clearing data.

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

- `storage` and `unlimitedStorage`: settings and local image data.
- `identity` and `https://www.googleapis.com/*`: optional Google Drive authorization and backups.
- Optional `https://www.google.com/*`: online website icon fetching.

## Documentation and interface languages

The default README is [Simplified Chinese](README.md), with English and [Spanish](README.es-ES.md) translations.

The extension currently includes Simplified Chinese (`_locales/zh_CN`) and English (`_locales/en`) interface resources. It uses the browser language through `chrome.i18n`, with English as the fallback. Spanish is currently a documentation translation only.

The main clock’s complete date, including date order and weekday/month names, follows an explicit locale tag in the displayed CN/EN message catalog, falling back to Chrome’s predefined `@@ui_locale` message, Chrome’s UI language, the preferred browser language and then the runtime locale if unavailable or invalid. Day-of-year and ISO-week labels also use the interface language. Time formatting and date placeholders in custom quotes are unchanged. Newly generated welcome text is localized; saved or imported quotes (including the old English welcome) are never translated or migrated. Existing quote validation, including trimming and the English fallback for empty strings, is unchanged. Missing quote fields receive the new localized default.

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

### Code map

- `newtab.html` / `newtab.css` / `newtab.js`: new tab interface and interactions.
- `options.html` / `options.css` / `options.js`: settings and data management.
- `storage.js`: local storage, validation, import/export, and Chrome Sync.
- `drive-backup.js`: Google Drive snapshot backups.
- `favicon-cache.js`: website icon caching.
- `shared/`: shared search-template and dialog logic.
- `_locales/`: interface translations; `assets/`: icons and screenshots; `tests/`: local regression tests.

## License

The existing project documentation identifies the license as MIT. A separate `LICENSE` file is not currently included in the repository.
