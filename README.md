# Local iTab Extension


<img width="640" height="400" alt="p1 (3)" src="https://github.com/user-attachments/assets/f072e511-7ded-45da-9cd5-4725efd4cd28" />
<img width="640" height="400" alt="p1 (1)" src="https://github.com/user-attachments/assets/74106bd6-98f8-4ac1-8328-02f2323687ec" />
<img width="640" height="400" alt="p1 (2)" src="https://github.com/user-attachments/assets/d020a9a6-6971-48f0-9abd-10da306d5731" />
<img width="640" height="400" alt="p1 (4)" src="https://github.com/user-attachments/assets/56076d9f-9d46-4fde-bff7-0f104512d889" />
<img width="640" height="400" alt="p1 (5)" src="https://github.com/user-attachments/assets/26868e31-a6f5-4811-a1d1-730755638a3d" />
A private, local-first Chrome new tab page for search, shortcuts, and lightweight personal context. It works offline by default, with optional online enhancements that must be enabled explicitly.

## New Additions

- Public-release visual refresh with a restrained utility interface
- Shared search URL template validation for the dashboard and settings
- Release and privacy documentation under `docs/`
- Default-off online controls for random wallpapers and favicon fetching
- Search module with Google, Bing, DuckDuckGo, and custom URL templates
- Local weather, hot topic, and movie cards maintained by the user
- Custom themed context menu with category and shortcut actions
- Favicon persistent cache: IndexedDB first; 7-day TTL; no network fetch unless enabled
- Internationalization through `chrome.i18n` with `_locales/en` and `_locales/zh_CN`

## Features

- **Offline by Default**: New installs make no external requests unless online enhancements are enabled
- **Customizable Dashboard**: Time display, search, shortcuts, local weather, hot topics, and movie cards
- **Multiple Search Engines**: Google, Bing, DuckDuckGo, and custom search support
- **Background Customization**: Upload images, solid colors, or gradients
- **Import/Export**: Backup and restore settings via JSON
- **Module Visibility**: Show/hide different dashboard components
- **Internationalization**: Menu items and dialogs are localized through chrome.i18n
- **Icon Caching**: Cached favicons can be reused offline
- **Chrome Sync**: Optional settings sync with large local assets omitted when necessary

## Privacy and Network Behavior

Local iTab is designed to be privacy-forward:

- Default state: no random wallpaper request, no favicon request, no remote weather/hot-topic/movie feed.
- Online random wallpapers: disabled by default; when enabled and selected, the extension may request `https://api.paugram.com/wallpaper/`.
- Online favicon fetching: disabled by default; when enabled, the extension may request `https://www.google.com/s2/favicons`.
- Search: typing does not send data anywhere; a request is made only after you submit a search or open a URL.
- User data is stored in `chrome.storage.local`; Chrome Sync is opt-in and subject to Chrome's sync quota.

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `local-itab` folder
4. The extension will override your new tab page

## i18n Usage

- Add messages under `_locales/<locale>/messages.json`
- In HTML, use `data-i18n` and `data-i18n-title` attributes; in JS use `i18n.t('key')`

## Favicon Cache

- API: `faviconCache.getIconDataUrl(origin)`, `faviconCache.invalidate(origin)`, `faviconCache.prefetch(origin)`, `faviconCache.setOnlineEnabled(enabled)`
- Used by shortcuts to resolve cached icons; network fetching is disabled until the privacy setting enables it

## Context Menu

- Initializes on the new tab page; only triggers on category header/list and shortcut items
- Actions: `open_all` for categories; `open`, `edit`, `delete` for site cards

## Development

This extension is built with:
- Manifest V3
- Vanilla JavaScript (no external dependencies)
- Chrome Storage API for local data persistence
- Responsive CSS Grid layout

## Design Direction

Local iTab should feel like a calm browser utility, not a marketing page. The primary workflow is search plus local shortcuts. Optional weather, topic, movie, sync, and online image features must stay visually secondary and explicit.

See `.impeccable.md` for the design context used by implementation agents.

## Release Preparation

- `docs/privacy-summary.md` summarizes default-off network behavior.
- `docs/release-checklist.md` lists the Chrome Web Store readiness checks.
- Before packaging, reload the unpacked extension, verify both locales, and confirm the default install makes no external requests.

## File Structure

```
local-itab/
├── manifest.json           # Extension manifest
├── newtab.html            # New tab page
├── newtab.css             # New tab styles
├── newtab.js              # New tab logic
├── options.html           # Settings page
├── options.css            # Settings styles
├── options.js             # Settings logic
├── assets/                # Extension icons
└── README.md              # This file
```

## Requirements

- Chrome browser with Manifest V3 support
- No internet connection required for default operation

## License


This project is open source and available under the MIT License.
