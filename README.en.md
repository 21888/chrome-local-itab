# Local iTab

[简体中文](README.md) · [English](README.en.md) · [Español](README.es-ES.md)

A local-first Chrome new tab page that keeps search, saved websites, and a small personal dashboard together. A simple starting point for the things you use every day.

**Offline-first · Categorized shortcuts · Custom layouts · Optional sync and backups**

No build step or Local iTab account is required. The clock, shortcut management, local images, and manually maintained cards work offline; searches, website visits, and optional cloud features need a network connection.

## Preview

Real extension screenshots with the English interface and the same sample setup, including Chinese category names. Site choices, icons, and card content are illustrative; weather, topics, and movie cards are manually entered examples, not live feeds.

**A / Clarity · Light · Grid layout**

![Local iTab Clarity light template with sample categorized shortcuts, search, and clock](docs/screenshots/clarity-light-grid.png)

**B / Graphite · Dark · Category groups**

![Local iTab Graphite dark template with shortcuts grouped by their categories](docs/screenshots/graphite-dark-grid.png)

**C / Folio · Light · Category groups**

![Local iTab Folio light template showing the first two category groups and sample weather and topics cards](docs/screenshots/folio-light-grid.png)

<details>
<summary>More light/dark variants and Free layout (4 screenshots)</summary>

**A / Clarity · Dark · Grid layout**

![Local iTab Clarity dark template using the same sample setup](docs/screenshots/clarity-dark-grid.png)

**B / Graphite · Light · Category groups**

![Local iTab Graphite light template with shortcuts grouped by their categories](docs/screenshots/graphite-light-grid.png)

**C / Folio · Dark · Category groups**

![Local iTab Folio dark template showing the first two category groups and sample weather and topics cards](docs/screenshots/folio-dark-grid.png)

**A / Clarity · Light · Free layout without grid snapping**

![Local iTab Clarity light Free layout after dragging GitHub, with Saved status visible](docs/screenshots/free-layout.png)

</details>

## Features

- **Search and go**: Use Google, Bing, DuckDuckGo, or a custom search URL, or open a website directly. Use `%s` for the search term in a custom template, such as `https://example.com/search?q=%s`.
- **Organized shortcuts**: Add, edit, and delete saved websites; filter by category; choose Grid (default, with drag reordering), Free placement (no snapping), or Manual · snap to grid using the Placement selector on the dashboard or in Settings. Switching keeps saved positions. The context menu includes shortcut actions and an option to open every website in a category.
- **Three workspace templates**: A / Clarity, B / Graphite, and C / Folio each support light and dark colors. New installations use A/light; legacy theme records remain intact with a compatible initial color choice. Selections save immediately without changing sites, categories, backgrounds, arrangement mode, or stored coordinates. B/C group real categories in Grid; manual layouts retain one coordinate plane.
- **Your layout and appearance**: Use the template background, a solid color, or a local image. Adjust columns, spacing, icons, and titles, and show or hide individual modules.
- **Small local cards**: A clock, weather, topics, a movie, and a personal quote. Weather, topic, and movie cards are manually maintained and hidden by default; they do not fetch live feeds.
- **Local JSON backups**: Export settings and local images, or import an existing backup. Imports validate the data and ask for confirmation. Restoring replaces the current configuration, so export a copy first. Files over 10 MiB show a memory-risk warning before reading and can be cancelled. Restoring large files still depends on available browser memory. The current device's sync state is retained.
- **Optional cloud features**: Chrome Sync handles lightweight settings synchronization; Google Drive stores manual snapshots grouped by computer name. Their behavior and limits are explained below.

## Install and get started

1. Download and extract the repository source, or clone this repository. The source loads directly without a build step.
2. Open `chrome://extensions/` in Chrome and enable **Developer mode**.
3. Click **Load unpacked** and select **the folder that directly contains `manifest.json`**, usually `chrome-local-itab/` or the extracted repository folder. Do not select the ZIP file or its parent folder.
4. Open a new tab, add your favorite websites, and visit Settings to customize appearance, search, and modules.

After updating the source, click **Reload** on the extension management page, then refresh any open new tab and Settings pages. Export a backup before uninstalling the extension or clearing its data.

Use Chrome with Manifest V3 support. Shortcut and layout write-conflict protection also relies on `navigator.locks`; if the required browser API is unavailable, those writes fail with an error.

## Data, privacy, and network behavior

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

## Local Tasks

Enable the optional, empty-by-default Tasks card in module visibility settings. Add/edit/complete tasks, pin one next action and recover removed items. Tasks stay on this device; settings exports, Chrome Sync and Drive backups exclude all task content and recovery copies. Settings reset/import/restore preserve Tasks. Use the separate task export/import for backup and migration. [Task guide](docs/local-tasks.en.md).

## Find saved sites

Use the local shortcut finder to search saved titles, addresses and categories without sending queries to the web. Results are verified against the latest saved record before opening; queries never alter layout or Tasks. [Finder guide](docs/shortcut-finder.en.md).
