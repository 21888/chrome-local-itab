# Offline world clocks

In Settings → Appearance → World clocks, enter an IANA time zone (for example America/New_York or Asia/Kathmandu) and an optional short label. The suggestion list is just a starting point; any named zone recognized by your browser is supported. Select Add clock, then Save clocks (or Save settings). Remove a clock and save to remove it from the dashboard. Use Move up or Move down to change the display order. Add, remove and reorder only change the draft until an explicit save. Keyboard focus follows the moved clock; at an end of the list it switches to the available direction. A maximum of four different zones and 40 Unicode characters per label is supported.

Saved clock changes update an already-open homepage without reloading or discarding its drafts.

Clocks appear as a compact information card when at least one is saved and Show clock is enabled. They inherit the existing 12/24-hour and seconds settings. Today, Yesterday and Tomorrow compare the zone’s calendar date with your device’s calendar date; the most distant zones may show +2 or -2 days. Time-zone rules come from your browser’s Intl database. No location request, network request, stored offset, new permission or external service is involved.

World clocks are ordinary configuration: JSON export/import, Google Drive backup and optional Chrome Sync include them in their saved order. Older backups default to no world clocks; resetting settings clears them. Invalid lists in an import are rejected. Local private Tasks, Focus and Scratchpad content keeps its existing independent behavior.

An unrelated Settings auto-save does not apply your pending world-clock changes. Another page’s clock change causes a clear save conflict rather than overwriting it: keep your draft visible and open a new Settings tab to review the latest values. Unsaved clock drafts delay automatic reloads; intentional reload can discard them after confirmation. A browser departure warning is best effort. No unload-time saving is attempted.
