# Privacy summary

Local iTab's core new tab page can work offline. Optional cloud features send data to Google when used.

- Configuration, shortcuts, categories, layout and theme settings, uploaded backgrounds, and local card content are primarily stored in `chrome.storage.local`. Website icons use local IndexedDB with a browser Cache API fallback; some interface state uses browser local storage.
- The extension does not send search input while the user types. Submitting a search or opening a URL visits the selected provider or destination website.
- Online favicon fetching is off by default and requires the optional `https://www.google.com/*` host permission on the current device. When enabled and granted, it sends shortcut domain names to Google's favicon service.
- Weather, topic, and movie cards display locally configured content, without remote feeds.
- Chrome Sync is off in the default configuration. When enabled, supported settings and shortcut data sync through the user's Chrome account, including later changes. Initialization checks for existing enabled sync data, which a new installation on the same account may automatically apply. Embedded backgrounds, posters, and shortcut icons are omitted or replaced with defaults in this sync payload.
- Google Drive backup requires separate Google authorization and stores JSON snapshots in the app-specific `appDataFolder`, using the `drive.appdata` scope. Snapshots include validated settings, shortcuts and URLs, categories, layout, theme and appearance, search and privacy preferences, local card content, and local background/poster/embedded shortcut images. They also include a generated device ID, the selected computer name, snapshot ID and time, extension and backup format versions, backup reason, and item counts. The separate favicon cache is not included; the snapshot's Chrome Sync state is replaced with disabled defaults.
- Connecting to Drive, listing or refreshing snapshots, uploading, downloading, restoring, deleting, and cleaning up older snapshots can contact Google APIs. There is no scheduled automatic Drive backup. After a restore is confirmed, the extension first attempts to upload the current configuration as a safety snapshot; if that fails, it asks whether to continue.
- The manifest declares `storage`, `unlimitedStorage`, `identity`, and host access to `https://www.googleapis.com/*`. Drive use is optional even though its Identity/API permissions are declared. Online favicon host access is separately optional.
- The extension does not include analytics, tracking scripts, ads, or remote content feeds. Local use needs no account; optional Chrome Sync and Google Drive use the user's Chrome or Google account.

See the [privacy policy](../store-assets/privacy-policy.md) and [extension manifest](../manifest.json) for details.
