/* Small, independent views: never reload Settings, submit its form, or install files. */
(function (root) {
    'use strict';
    const api = root.LocalItabUpdates;
    const text = (key, fallback, values = []) => {
        const translated = root.i18n?.t(key, values);
        return translated && translated !== key ? translated : fallback.replace(/\$(\d)/g, (_, n) => values[Number(n) - 1] || '');
    };
    const messages = {
        checking: ['updateChecking', 'Checking GitHub…'],
        available: ['updateAvailable', 'A newer published version is available.'],
        current: ['updateCurrent', 'Your installed version is as new as, or newer than, the latest published release.'],
        offline: ['updateOffline', 'Could not reach GitHub. Check your connection and try again.'],
        timeout: ['updateTimeout', 'GitHub did not respond in time. Try again later.'],
        rateLimit: ['updateRateLimit', 'GitHub is limiting requests. Please wait before checking again.'],
        unavailable: ['updateUnavailable', 'GitHub could not complete this check. Try again later.'],
        noRelease: ['updateNoRelease', 'No published release was found.'],
        invalid: ['updateInvalid', 'GitHub returned unexpected version data. It was not used.'],
        stale: ['updateStale', 'GitHub returned an older release than the saved result. The saved result is shown.'],
        busy: ['updateBusy', 'A check is already running in another tab.'],
        storage: ['updateStorageError', 'Update preferences could not be read or saved. Try again.'],
        saved: ['updatePreferenceSaved', 'Update preference saved on this device.'],
        cancelled: ['updateCancelled', 'Check cancelled.'],
        idle: ['updateIdle', 'No check yet. Checking is manual by default.']
    };
    const message = key => text(...(messages[key] || messages.unavailable));
    function mountSettings(host, checker) {
        if (host.updateView) return host.updateView;
        const find = id => host.querySelector(`#${id}`);
        const current = find('update-current-version'), automatic = find('update-automatic');
        const check = find('update-check'), status = find('update-status'), latest = find('update-latest-version');
        const checked = find('update-last-checked'), link = find('update-release-link'), ignore = find('update-ignore');
        let busy = false, changing = false, destroyed = false, refreshVersion = 0, release = null;
        current.textContent = checker.currentVersion;
        function say(value) { status.textContent = message(value); }
        async function refresh({announce = false} = {}) {
            const version = ++refreshVersion;
            try {
                const state = await checker.read();
                if (destroyed || version !== refreshVersion) return;
                automatic.checked = state.automatic;
                release = state.latest;
                latest.textContent = release?.version || text('updateNotChecked', 'Not checked');
                checked.textContent = state.lastSuccess ? new Intl.DateTimeFormat(root.document.documentElement.lang, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(state.lastSuccess)) : text('updateNotChecked', 'Not checked');
                link.hidden = !release; link.href = api.releaseUrl(release) || `${api.REPOSITORY}/releases`;
                ignore.hidden = !release || api.compareVersions(release.version, checker.currentVersion) <= 0;
                ignore.disabled = busy || changing || state.ignoredVersion === release?.version;
                ignore.textContent = state.ignoredVersion === release?.version ? text('updateIgnored', 'Ignored for automatic notices') : text('updateIgnore', 'Ignore this version');
                if (announce && !busy && !changing) say((state.requestId ? 'busy' : '') || state.error || (release ? api.compareVersions(release.version, checker.currentVersion) > 0 ? 'available' : 'current' : 'idle'));
            } catch (_) { if (!destroyed && version === refreshVersion) say('storage'); }
        }
        async function runCheck(automaticCheck = false) {
            if (busy || destroyed) return;
            busy = true; check.disabled = true; ignore.disabled = true; say('checking');
            try {
                const result = await checker.check({automatic: automaticCheck});
                if (!destroyed) say(result.status === 'skipped' ? 'saved' : result.status);
            } catch (_) { if (!destroyed) say('storage'); }
            finally { busy = false; check.disabled = false; await refresh(); }
        }
        for (const button of [check, ignore]) button.addEventListener('keydown', event => {
            if ((event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') &&
                (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
        });
        check.addEventListener('click', () => runCheck());
        automatic.addEventListener('change', async () => {
            if (changing || destroyed) return;
            const enabled = automatic.checked;
            changing = true; automatic.disabled = true;
            try {
                await checker.setAutomatic(enabled);
                if (!destroyed) { say('saved'); if (enabled) await runCheck(true); }
            } catch (_) { if (!destroyed) say('storage'); }
            finally { changing = false; automatic.disabled = false; await refresh(); }
        });
        ignore.addEventListener('click', async () => {
            if (!release || ignore.disabled || destroyed) return;
            const version = release.version; ignore.disabled = true;
            try { await checker.ignore(version); }
            catch (_) { if (!destroyed) say('storage'); }
            await refresh();
        });
        // All controls are outside Settings' Save flow. Ordinary native activation stays intact.
        const unsubscribe = checker.subscribe(() => refresh({announce: true}));
        const ready = refresh({announce: true});
        api.installation().then(kind => {
            if (destroyed) return;
            for (const node of host.querySelectorAll('[data-update-install]')) node.hidden = node.dataset.updateInstall !== kind;
        });
        const view = {ready, refresh, destroy() { destroyed = true; ++refreshVersion; unsubscribe(); }};
        host.updateView = view; return view;
    }
    function mountNotice(host, checker) {
        if (host.updateView) return host.updateView;
        const link = host.querySelector('a'), ignore = host.querySelector('button');
        let running = false, destroyed = false, shown = null;
        async function hideIfNeeded() {
            try {
                const state = await checker.read();
                if (destroyed || !shown) return;
                if (!state.automatic || state.ignoredVersion === shown.version) { host.hidden = true; shown = null; }
            } catch (_) { host.hidden = true; }
        }
        async function run() {
            if (destroyed || running || root.document.visibilityState === 'hidden') return;
            running = true;
            try {
                await checker.check({automatic: true});
                if (destroyed || root.document.visibilityState === 'hidden') return;
                const release = await checker.claimNotice();
                if (!release || destroyed) return;
                shown = release; link.textContent = text('updateNotice', 'Local iTab $1 is available. View update details.', [release.version]);
                ignore.textContent = text('updateIgnore', 'Ignore this version'); host.hidden = false;
            } catch (_) { /* Automatic failures stay quiet; Settings can explain them. */ }
            finally { running = false; }
        }
        ignore.addEventListener('click', async () => {
            if (!shown || ignore.disabled || destroyed) return;
            ignore.disabled = true;
            try { await checker.ignore(shown.version); await hideIfNeeded(); }
            catch (_) { /* Keep the notice so the user can try again. */ }
            finally { ignore.disabled = false; }
        });
        const unsubscribe = checker.subscribe(hideIfNeeded);
        root.document.addEventListener('visibilitychange', run);
        const view = {ready: run(), destroy() { destroyed = true; unsubscribe(); root.document.removeEventListener('visibilitychange', run); }};
        host.updateView = view; return view;
    }
    root.LocalItabUpdateViews = {mountSettings, mountNotice};
    root.document.addEventListener('DOMContentLoaded', () => {
        const settings = root.document.getElementById('version-update-settings'), notice = root.document.getElementById('update-notice');
        if (!settings && !notice) return;
        try {
            const checker = new api.Checker();
            const view = settings ? mountSettings(settings, checker) : mountNotice(notice, checker);
            root.addEventListener('pagehide', () => { view.destroy(); checker.dispose(); }, {once: true});
        } catch (_) {
            if (settings) {
                settings.querySelector('#update-current-version').textContent = root.chrome?.runtime?.getManifest().version || '—';
                settings.querySelector('#update-status').textContent = message('storage');
                for (const button of settings.querySelectorAll('#update-check, #update-ignore, #update-automatic')) button.disabled = true;
            }
        }
    });
})(window);
