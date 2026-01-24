# Local iTab Extension


<img width="3806" height="1693" alt="image" src="https://github.com/user-attachments/assets/552c660a-cb0f-4ee8-b89e-2746ba938160" />


A customizable new tab page Chrome extension that works completely offline.

## New Additions

- Custom themed context menu (dark/light, rounded corners, shadow, keyboard hints, touch-close)
- Category right-click: Open all links (with confirmation and max concurrency)
- Site card right-click: Open in new tab / Edit / Delete
- Favicon persistent cache: IndexedDB first, fallback Cache API; 7-day TTL; rebuild/invalidate
- Internationalization: `chrome.i18n` with `_locales/en` and `_locales/zh_CN`

## Features

- **Offline First**: No network requests, all data stored locally
- **Customizable Dashboard**: Time display, search, shortcuts, weather, hot topics, and movie cards
- **Multiple Search Engines**: Google, Bing, DuckDuckGo, and custom search support
- **Background Customization**: Upload images, solid colors, or gradients
- **Import/Export**: Backup and restore settings via JSON
- **Module Visibility**: Show/hide different dashboard components
 - **Internationalization**: All menu items and dialogs are localized through chrome.i18n
 - **Icon Caching**: Favicons are cached locally for performance and offline use

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `local-itab` folder
4. The extension will override your new tab page

## i18n Usage

- Add messages under `_locales/<locale>/messages.json`
- In HTML, use `data-i18n` and `data-i18n-title` attributes; in JS use `i18n.t('key')`

## Favicon Cache

- API: `faviconCache.getIconDataUrl(origin)`, `faviconCache.invalidate(origin)`, `faviconCache.prefetch(origin)`
- Used automatically by shortcuts to resolve icons to data URLs

## Context Menu

- Initializes on the new tab page; only triggers on category header/list and shortcut items
- Actions: `open_all` for categories; `open`, `edit`, `delete` for site cards

## Development

This extension is built with:
- Manifest V3
- Vanilla JavaScript (no external dependencies)
- Chrome Storage API for local data persistence
- Responsive CSS Grid layout

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
- No internet connection required for operation

## License

This project is open source and available under the MIT License.