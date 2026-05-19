# Privacy summary

Local iTab is designed to work offline by default.

- User configuration, shortcuts, uploaded backgrounds, local cards, and cached icons are stored in Chrome local storage on the user's device.
- The extension does not send search input anywhere while the user types.
- A network request is made only when the user submits a search, opens a URL, or enables online favicon fetching.
- Online favicon fetching also requires the matching optional host permission on the current device.
- Chrome Sync is optional. Large local assets are intentionally excluded from sync because Chrome Sync has a small quota.
- The extension does not include analytics, tracking scripts, accounts, ads, or remote content feeds.
