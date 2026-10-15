(function (root) {
    'use strict';
    // This adapter deliberately does not adopt data into the tile component or rerender it.
    // An open edit elsewhere, selected category and Free-layout coordinates stay untouched.
    root.LocalItabFinder.mountForShortcuts = function (host, component) {
        let revision = 0;
        let scope = 'current', allReader = null, allSnapshot = null, allLease = null, allDeparted = false, notifyAll = () => {};
        const visible = () => !root.document?.hidden && root.document?.visibilityState !== 'hidden';
        const activationVisible = () => Boolean(allLease?.canContinue() && (visible() || allLease.blankVisible()));
        const visibilityChanged = () => {
            if (scope !== 'all') return;
            // A foreground reserved tab hides its opener. Only that exact,
            // still-owned and visible blank may continue this activation.
            if (!visible() && allLease?.canContinue() && allLease.blankVisible()) return;
            allReader?.invalidate();
        };
        const sourcePageHide = () => {
            if (scope !== 'all') return;
            // The source may already be hidden behind its owned blank. Closing,
            // navigation and BFCache departure need their own cancellation fence.
            allDeparted = true; stopAll(); notifyAll();
        };
        function stopAll() {
            allLease?.close();
            if (allReader) {
                allReader.stop();
                root.document?.removeEventListener('visibilitychange', visibilityChanged);
                root.removeEventListener('pagehide', sourcePageHide);
            }
            allReader = null; allSnapshot = null;
        }
        function reader() {
            if (allDeparted) throw new Error('Finder unavailable');
            if (!allReader) {
                if (!root.LocalItabFinderWorkspaces || !root.addEventListener || !root.removeEventListener) throw new Error('Finder unavailable');
                allReader = root.LocalItabFinderWorkspaces.createReader({
                    local: root.chrome?.storage?.local, locks: root.navigator?.locks, changes: root.chrome?.storage?.onChanged,
                    getSession: () => root.storageManager.workspace, isVisible: visible, isActivationVisible: activationVisible,
                    onInvalidate() { allSnapshot = null; notifyAll(); }
                });
                root.document?.addEventListener('visibilitychange', visibilityChanged);
                root.addEventListener('pagehide', sourcePageHide);
            }
            return allReader;
        }
        let snapshot = { links: [], categories: [] };
        const adopt = next => {
            // Unchanged legacy rows must retain the references held by visible tokens.
            // Keep the raw records intact; never normalize away a real storage change.
            if (snapshot.links.some(link => !link.layoutId) && JSON.stringify(snapshot.links) === JSON.stringify(next.links)) {
                next.links = snapshot.links;
            }
            snapshot = next;
        };
        async function readSnapshot(isCurrent = () => true) {
            // Native read only: do not run migration, provider initialization or writes.
            const ownRevision = ++revision;
            const fresh = await root.storageManager.local.get(['links', 'categories']);
            const next = { links: fresh.links || [], categories: fresh.categories || [] };
            if (revision === ownRevision && isCurrent()) adopt(next);
            return next;
        }
        return root.LocalItabFinder.mount(host, {
            shortcutEnabled: component.finderShortcutEnabled !== false,
            getCatalogFields: root.LocalItabFinder.catalogLookup(root.LocalItabNavigationCatalog, root.LocalItabNavigationSites, tag => {
                const key = `navigationTag${tag.split(/[-_]/).map(part => part[0]?.toUpperCase() + part.slice(1)).join('')}`;
                const value = root.i18n?.t(key);
                return value && value !== key ? value : tag.replace(/[-_]/g, ' ');
            }),
            getScope: () => scope,
            setScope(value) {
                const next = value === 'all' ? 'all' : 'current';
                if (next !== scope) { stopAll(); scope = next; allDeparted = false; }
            },
            getSnapshot: () => scope === 'all' ? allSnapshot : snapshot,
            activateAll: (token, open, current) => allReader?.activate(token, open, () => scope === 'all' && current()) || Promise.resolve('stale'),
            readSnapshot,
            async prepareSnapshot(isCurrent = () => true) {
                if (scope === 'all') {
                    const owned = reader();
                    const next = await owned.scan(() => scope === 'all' && allReader === owned && isCurrent());
                    if (scope === 'all' && allReader === owned && isCurrent() && owned.isCurrent(next)) allSnapshot = next;
                    else throw new Error('Finder unavailable');
                    return;
                }
                // A storage notification may overtake a read. Re-read rather than
                // publishing an incomplete initial snapshot or an older sequence.
                let expected;
                do {
                    if (!isCurrent()) return;
                    expected = revision + 1; await readSnapshot(isCurrent);
                } while (revision !== expected && isCurrent());
            },
            reserve() {
                const all = scope === 'all', ownedReader = allReader;
                let tab;
                try {
                    tab = root.open('about:blank', '_blank');
                    if (!tab) return null;
                    tab.opener = null;
                } catch (_) { try { tab?.close(); } catch (_) {} return null; }
                let completed = false, retired = false, blankWasVisible = false, blankDocument = null;
                let cleanupLease = () => {};
                const ownsBlank = () => {
                    if (completed) return false;
                    try {
                        if (tab.closed || tab.location.href !== 'about:blank' || (blankDocument && tab.document !== blankDocument)) { completed = true; return false; }
                        return true;
                    } catch (_) { completed = true; return false; }
                };
                const lease = {
                    open(link) {
                        if (!ownsBlank()) return false;
                        if (all) {
                            if (allLease !== lease || !lease.canContinue() || !activationVisible()) return false;
                            // Known synchronous navigation. Detach our blank-only
                            // lifecycle hooks before our own verified navigation.
                            const destination = root.LocalItabStoredURL?.destinationForSavedURL(link.url);
                            if (!destination) return false;
                            completed = true; cleanupLease();
                            try { tab.location.replace(destination); return true; }
                            catch (error) { completed = false; throw error; }
                        }
                        const opened = component.openShortcutRecord(link, tab);
                        if (opened !== false) completed = true;
                        return opened;
                    },
                    close() {
                        const close = ownsBlank(); cleanupLease();
                        if (close) { completed = true; try { tab.close(); } catch (_) {} }
                    }
                };
                if (!all) return lease; // Current adds no blank-document hooks.
                try {
                    blankDocument = tab.document;
                    if (!blankDocument?.addEventListener || !blankDocument.removeEventListener || !tab.addEventListener || !tab.removeEventListener) throw new Error('Finder blank unavailable');
                    const invalidate = () => { if (scope === 'all' && allReader === ownedReader) ownedReader?.invalidate(); };
                    const blankHidden = () => {
                        if (allLease !== lease || completed) return;
                        if (!lease.blankVisible()) { retired = true; invalidate(); }
                    };
                    const blankLeft = () => {
                        if (allLease !== lease || completed) return;
                        // A user navigation/close relinquishes ownership before
                        // cancellation, so it can never close their chosen page.
                        completed = true; retired = true; cleanupLease(); invalidate();
                    };
                    lease.blankVisible = () => {
                        try {
                            const shown = ownsBlank() && blankDocument.visibilityState === 'visible' && blankDocument.hidden === false;
                            if (shown) blankWasVisible = true;
                            return shown;
                        } catch (_) { retired = true; return false; }
                    };
                    lease.canContinue = () => {
                        if (allLease !== lease || retired || !ownsBlank()) return false;
                        const shown = lease.blankVisible();
                        if (blankWasVisible && !shown) retired = true; // Even before a queued visibility event.
                        return !retired;
                    };
                    cleanupLease = () => {
                        try { blankDocument.removeEventListener('visibilitychange', blankHidden); } catch (_) {}
                        try { tab.removeEventListener('pagehide', blankLeft); } catch (_) {}
                        try { tab.removeEventListener('beforeunload', blankLeft); } catch (_) {}
                        if (allLease === lease) allLease = null;
                    };
                    allLease = lease;
                    blankDocument.addEventListener('visibilitychange', blankHidden);
                    tab.addEventListener('pagehide', blankLeft);
                    tab.addEventListener('beforeunload', blankLeft);
                    lease.blankVisible();
                    return lease;
                } catch (_) { lease.close(); return null; }
            },
            subscribe(notify) {
                notifyAll = notify;
                const onChanged = (changes, area) => {
                    if (area !== 'local' || (!changes.links && !changes.categories)) return;
                    revision++;
                    snapshot = {
                        links: changes.links ? (changes.links.newValue || []) : snapshot.links,
                        categories: changes.categories ? (changes.categories.newValue || []) : snapshot.categories
                    };
                    if (scope === 'current') notify();
                };
                const unsubscribe = root.storageManager.onLocalChanged(onChanged);
                return () => { stopAll(); notifyAll = () => {}; unsubscribe(); };
            }
        });
    };
})(window);
