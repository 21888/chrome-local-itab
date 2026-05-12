# Local iTab Privacy Policy

Effective date: May 12, 2026

Local iTab is designed to be a private, local-first Chrome new tab page for search, shortcuts, and user-controlled dashboard settings.

## Data Stored On Your Device

Local iTab stores user configuration, shortcuts, categories, layout preferences, theme settings, uploaded backgrounds, local cards, privacy settings, and cached icons in Chrome local storage on your device. If you enable Chrome Sync, supported settings and shortcut data may sync through your Chrome account. Large local assets are intentionally kept on the current device.

## Network Behavior

Local iTab works offline by default. The extension does not send search text anywhere while you type. A network request occurs only when you submit a search, open a URL, enable and use online random wallpapers, or enable online favicon fetching.

Online random wallpapers are disabled by default. When enabled, granted, and selected as the background type, Local iTab may request images from `https://api.paugram.com/wallpaper/`.

Online favicon fetching is disabled by default. When enabled and granted, Local iTab may request favicon images from `https://www.google.com/s2/favicons` for shortcut domains.

## Data Collection

The developer does not collect, sell, transfer, or use user data for advertising, analytics, creditworthiness, or unrelated purposes. Local iTab does not include analytics, tracking scripts, accounts, ads, or remote content feeds.

## Google API Limited Use

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Permissions

Local iTab uses `storage` to save settings and shortcut data. It uses `unlimitedStorage` so user-controlled local assets and cached icons can remain on the device reliably. Host access for Google favicon lookup and Paugram wallpaper loading is optional and requested only when the user enables the matching feature.

## Contact

For support or privacy questions, use the project issue tracker:

https://github.com/21888/chrome-local-itab/issues

