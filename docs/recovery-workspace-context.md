# Workspace context in read-only Recovery

Options' pending-import conflict link carries the captured workspace ID. Recovery now treats that query as a view context, never as authority to restore or as an automatic selection.

- Exactly one nonempty `workspace` parameter must match the existing workspace-token grammar (ASCII letters, digits, underscore or hyphen, maximum 100 characters). Percent encoding is decoded once. Empty, repeated, malformed and oversized links show an invalid-context warning, with no default fallback.
- An exact ID initially shows only snapshot entries whose workspace attribution is verified and matches that ID. Current and retained records keep their original source, workspace, integrity and Trash labels.
- The context discloses hidden other/unattributed copies. “Show all saved copies” explicitly exposes the original complete snapshot without claiming those rows belong to the requested workspace. A toggle returns to the requested view or warning.
- Unknown IDs and unverified-only attribution show a no-match warning, not proof of deletion. No-query direct entry explicitly shows all workspaces. No records are removed from the inspector or its export capabilities.
- Refresh and page resumption recalculate matching against their new snapshot. Changing the view retires rendered and in-flight reviews and disables stale export controls. Nothing is selected or downloaded automatically.
- The independent read-only inspector and its storage/provider boundary are unchanged. The UI does not boot the workspace writer, change the active workspace, save settings, import or repair data.

Tests: `node --test tests/recovery-view.test.js tests/recovery-file-view.test.js tests/recovery-inspector.test.js tests/recovery-file.test.js`.

Coverage includes Default/named/Trash contexts, direct entry, invalid/unknown/duplicate/percent-encoded queries, unverified attribution, explicit all/back navigation, refreshed identity, English/Chinese disclosure, actual inspector automatic bootstrap and stale/in-flight review retirement. These are synthetic scripted DOM tests, not installed-extension or native-browser claims.
