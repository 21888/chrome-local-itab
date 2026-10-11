(function (root) {
    'use strict';
    // This adapter deliberately does not adopt data into the tile component or rerender it.
    // An open edit elsewhere, selected category and Free-layout coordinates stay untouched.
    root.LocalItabFinder.mountForShortcuts = function (host, component) {
        let revision = 0;
        let snapshot = { links: component.links || [], categories: component.categories || [] };
        return root.LocalItabFinder.mount(host, {
            shortcutEnabled: component.finderShortcutEnabled !== false,
            getSnapshot: () => snapshot,
            async readSnapshot() {
                // Native read only: do not run migration, provider initialization or writes.
                const ownRevision = ++revision;
                const fresh = await root.storageManager.local.get(['links', 'categories']);
                const next = { links: fresh.links || [], categories: fresh.categories || [] };
                if (revision === ownRevision) snapshot = next;
                return next;
            },
            reserve() {
                let tab;
                try {
                    tab = root.open('about:blank', '_blank');
                    if (!tab) return null;
                    tab.opener = null;
                } catch (_) { try { tab?.close(); } catch (_) {} return null; }
                let completed = false;
                const ownsBlank = () => {
                    if (completed) return false;
                    try {
                        if (tab.closed || tab.location.href !== 'about:blank') { completed = true; return false; }
                        return true;
                    } catch (_) { completed = true; return false; }
                };
                return {
                    open(link) {
                        if (!ownsBlank()) return false;
                        const opened = component.openShortcutRecord(link, tab);
                        if (opened !== false) completed = true;
                        return opened;
                    },
                    close() { if (ownsBlank()) { completed = true; try { tab.close(); } catch (_) {} } }
                };
            },
            subscribe(notify) {
                const onChanged = (changes, area) => {
                    if (area !== 'local' || (!changes.links && !changes.categories)) return;
                    revision++;
                    snapshot = {
                        links: changes.links ? (changes.links.newValue || []) : snapshot.links,
                        categories: changes.categories ? (changes.categories.newValue || []) : snapshot.categories
                    };
                    notify();
                };
                return root.storageManager.onLocalChanged(onChanged);
            }
        });
    };
})(window);
