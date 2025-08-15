# Local iTab Extension


<img width="3806" height="1693" alt="image" src="https://github.com/user-attachments/assets/552c660a-cb0f-4ee8-b89e-2746ba938160" />


A customizable new tab page Chrome extension that works completely offline.

## Features

- **Offline First**: No network requests, all data stored locally
- **Customizable Dashboard**: Time display, search, shortcuts, weather, hot topics, and movie cards
- **Multiple Search Engines**: Google, Bing, DuckDuckGo, and custom search support
- **Background Customization**: Upload images, solid colors, or gradients
- **Import/Export**: Backup and restore settings via JSON
- **Module Visibility**: Show/hide different dashboard components

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `local-itab` folder
4. The extension will override your new tab page

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