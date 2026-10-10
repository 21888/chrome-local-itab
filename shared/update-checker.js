/* Optional, metadata-only GitHub checks. No configuration or personal data enters a request. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabUpdates = api;
})(typeof window === 'undefined' ? globalThis : window, function (root) {
    'use strict';
    const KEY = '__localItabUpdatesV1';
    // Share Settings' write lock so reset cannot race a completed network request.
    const LOCK = 'local-itab-local-write';
    const DAY = 24 * 60 * 60 * 1000, TIMEOUT = 10000, MAX_BYTES = 256 * 1024;
    const REPOSITORY = 'https://github.com/21888/chrome-local-itab';
    const ENDPOINT = 'https://api.github.com/repos/21888/chrome-local-itab/releases/latest';
    const fault = code => Object.assign(new Error(`Update check: ${code}`), {code});
    const timestamp = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
    function versionParts(value) {
        if (typeof value !== 'string' || !/^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/.test(value)) return null;
        const parts = value.split('.').map(Number);
        return parts.every(part => part <= 65535) ? parts : null;
    }
    function compareVersions(a, b) {
        const left = versionParts(a), right = versionParts(b);
        if (!left || !right) throw fault('invalid');
        for (let index = 0; index < 4; index++) {
            const difference = (left[index] || 0) - (right[index] || 0);
            if (difference) return Math.sign(difference);
        }
        return 0;
    }
    function releaseTag(tag) {
        if (typeof tag !== 'string') return null;
        const version = tag.startsWith('v') ? tag.slice(1) : tag;
        return versionParts(version) ? {tag, version} : null;
    }
    function parseRelease(data) {
        const release = releaseTag(data?.tag_name);
        if (!release || data.draft !== false || data.prerelease !== false) throw fault('invalid');
        // Names, Markdown, asset URLs, html_url and remote instructions are never used.
        return release;
    }
    const source = Object.freeze({url: ENDPOINT, parse: parseRelease});
    function releaseUrl(release) {
        const valid = releaseTag(release?.tag);
        return valid && valid.version === release.version ? `${REPOSITORY}/releases/tag/${valid.tag}` : null;
    }
    function initial() {
        return {schemaVersion: 1, automatic: false, lastAttempt: 0, lastSuccess: 0, latest: null,
            ignoredVersion: '', lastNoticeAt: 0, lastNotifiedVersion: '', requestId: '', retryAt: 0, error: ''};
    }
    function normalize(value) {
        const state = initial();
        if (!value || value.schemaVersion !== 1) return state; // Unknown schema never opts in.
        state.automatic = value.automatic === true;
        for (const key of ['lastAttempt', 'lastSuccess', 'lastNoticeAt', 'retryAt']) state[key] = timestamp(value[key]);
        for (const key of ['ignoredVersion', 'lastNotifiedVersion']) state[key] = versionParts(value[key]) ? value[key] : '';
        state.latest = releaseUrl(value.latest) ? {tag: value.latest.tag, version: value.latest.version} : null;
        state.requestId = typeof value.requestId === 'string' && /^[\w-]{1,100}$/.test(value.requestId) ? value.requestId : '';
        state.error = ['offline', 'timeout', 'rateLimit', 'unavailable', 'noRelease', 'invalid', 'stale'].includes(value.error) ? value.error : '';
        return state;
    }
    function createBackend(chromeApi = root.chrome, locks = root.navigator?.locks) {
        if (!chromeApi?.storage?.local || !locks?.request) throw fault('storage');
        return {
            lock: operation => locks.request(LOCK, operation),
            read: async () => (await chromeApi.storage.local.get([KEY]))[KEY],
            write: value => chromeApi.storage.local.set({[KEY]: value}),
            subscribe(listener) {
                const changed = (changes, area) => { if (area === 'local' && Object.hasOwn(changes, KEY)) listener(); };
                chromeApi.storage.onChanged.addListener(changed);
                return () => chromeApi.storage.onChanged.removeListener(changed);
            }
        };
    }
    async function readJSON(response) {
        if (Number(response.headers?.get('content-length')) > MAX_BYTES) throw fault('invalid');
        const reader = response.body?.getReader();
        if (!reader) throw fault('invalid');
        const decoder = new TextDecoder(); let bytes = 0, text = '';
        try {
            while (true) {
                const chunk = await reader.read();
                if (chunk.done) break;
                bytes += chunk.value.byteLength;
                if (bytes > MAX_BYTES) { await reader.cancel(); throw fault('invalid'); }
                text += decoder.decode(chunk.value, {stream: true});
            }
            text += decoder.decode();
            return JSON.parse(text);
        } catch (error) { if (error.code) throw error; throw fault('invalid'); }
        finally { reader.releaseLock(); }
    }
    function retryTime(response, now) {
        const reset = Number(response.headers?.get('x-ratelimit-reset')) * 1000;
        const delay = response.headers?.get('retry-after');
        const retry = delay && /^\d+$/.test(delay) ? now + Number(delay) * 1000 : Date.parse(delay || '');
        return Math.min(now + DAY, Math.max(now + 60000, Number.isFinite(reset) ? reset : 0, Number.isFinite(retry) ? retry : 0));
    }
    class Checker {
        constructor({backend = createBackend(), fetch = root.fetch?.bind(root), now = () => Date.now(), id = () => root.crypto.randomUUID(),
            currentVersion = root.chrome?.runtime?.getManifest().version, timeout = TIMEOUT} = {}) {
            this.backend = backend; this.fetch = fetch; this.now = now; this.id = id;
            this.currentVersion = currentVersion; this.timeout = timeout; this.active = null; this.disposed = false;
            if (!versionParts(currentVersion)) throw fault('invalid');
            this.unsubscribe = backend.subscribe(() => {
                // Revoking opt-in/reset cancels an in-flight automatic request, including another tab's changes.
                this.read().then(state => {
                    if (this.active && (state.requestId !== this.active.id || (this.active.automatic && !state.automatic))) this.active.abort.abort();
                }).catch(() => this.active?.abort.abort());
            });
        }
        read() { return this.backend.lock(async () => normalize(await this.backend.read())); }
        subscribe(fn) { return this.backend.subscribe(fn); }
        change(operation) {
            return this.backend.lock(async () => {
                const state = normalize(await this.backend.read());
                const changed = operation(state);
                if (changed !== false) await this.backend.write(state);
                return state;
            });
        }
        async setAutomatic(enabled) {
            if (!enabled && this.active?.automatic) this.active.abort.abort();
            return this.change(state => {
                state.automatic = enabled === true;
                // Invalidate any automatic request's ownership on opt-out. A manual request may also
                // be discarded, which is safer than allowing late data to restore reset preferences.
                if (!state.automatic) state.requestId = '';
            });
        }
        ignore(version) {
            if (!versionParts(version)) return Promise.reject(fault('invalid'));
            return this.change(state => { state.ignoredVersion = version; });
        }
        async check({automatic = false} = {}) {
            if (this.disposed) return {status: 'cancelled'};
            let requestId = '', skipped = 'skipped';
            const now = this.now();
            await this.change(state => {
                if (state.retryAt > now) { skipped = 'rateLimit'; return false; }
                if (state.requestId && state.lastAttempt <= now && now - state.lastAttempt < this.timeout + 1000) { skipped = 'busy'; return false; }
                if (automatic && (!state.automatic || (state.lastAttempt && (now < state.lastAttempt || now - state.lastAttempt < DAY)))) return false;
                requestId = this.id(); state.requestId = requestId; state.lastAttempt = now; state.error = '';
            });
            if (!requestId || this.disposed) return {status: this.disposed ? 'cancelled' : skipped};
            const abort = new AbortController(), active = {id: requestId, automatic, abort};
            this.active = active; let timer, abortListener;
            let result, error = '', retryAt = 0;
            try {
                const request = async () => {
                    // Recheck authorization immediately before starting network, after the lease is saved.
                    const state = await this.read();
                    if (this.disposed || abort.signal.aborted || state.requestId !== requestId || (automatic && !state.automatic)) throw fault('cancelled');
                    const response = await this.fetch(source.url, {method: 'GET', mode: 'cors', credentials: 'omit',
                        redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store',
                        headers: {Accept: 'application/vnd.github+json'}, signal: abort.signal});
                    if (response.status === 403 || response.status === 429) { retryAt = retryTime(response, this.now()); throw fault('rateLimit'); }
                    if (response.status === 404) throw fault('noRelease');
                    if (!response.ok || response.redirected) throw fault('unavailable');
                    return source.parse(await readJSON(response));
                };
                const interrupted = new Promise((_, reject) => {
                    abortListener = () => reject(fault('cancelled'));
                    abort.signal.addEventListener('abort', abortListener, {once: true});
                    timer = setTimeout(() => { reject(fault('timeout')); abort.abort(); }, this.timeout);
                });
                result = await Promise.race([request(), interrupted]);
            } catch (failure) { error = failure.code || 'offline'; }
            finally {
                clearTimeout(timer); abort.signal.removeEventListener('abort', abortListener);
                if (this.active === active) this.active = null;
            }
            let status = 'cancelled';
            await this.change(state => {
                if (this.disposed || state.requestId !== requestId || (automatic && !state.automatic)) return false;
                state.requestId = ''; state.retryAt = retryAt;
                if (error === 'cancelled') return;
                if (!error && state.latest && compareVersions(result.version, state.latest.version) < 0) error = 'stale';
                state.error = error;
                if (!error) { state.latest = result; state.lastSuccess = this.now(); }
                status = error || (compareVersions(state.latest.version, this.currentVersion) > 0 ? 'available' : 'current');
            });
            return {status};
        }
        async claimNotice() {
            let release = null;
            await this.change(state => {
                const now = this.now();
                if (!state.automatic || !state.latest || state.error || !state.lastSuccess || now < state.lastSuccess || now - state.lastSuccess >= DAY ||
                    compareVersions(state.latest.version, this.currentVersion) <= 0 || state.latest.version === state.ignoredVersion ||
                    state.latest.version === state.lastNotifiedVersion || (state.lastNoticeAt && (now < state.lastNoticeAt || now - state.lastNoticeAt < DAY))) return false;
                release = state.latest; state.lastNoticeAt = now; state.lastNotifiedVersion = release.version;
            });
            return release;
        }
        dispose() { this.disposed = true; this.active?.abort.abort(); this.unsubscribe(); }
    }
    async function installation(chromeApi = root.chrome) {
        try {
            const info = await chromeApi.management.getSelf();
            if (info.installType === 'development') return 'unpacked';
            if (info.installType === 'admin') return 'managed';
            if (info.installType === 'normal' && chromeApi.runtime.getManifest().update_url === 'https://clients2.google.com/service/update2/crx') return 'store';
        } catch (_) { /* No management permission is needed for getSelf; unknown stays neutral. */ }
        return 'unknown';
    }
    return Object.freeze({KEY, DAY, TIMEOUT, MAX_BYTES, REPOSITORY, source, versionParts, compareVersions, parseRelease, releaseUrl,
        initial, normalize, createBackend, Checker, installation});
});
