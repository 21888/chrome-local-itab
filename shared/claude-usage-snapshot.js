/* Independent, on-demand experiment. No storage, identity inspection or polling. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.ClaudeUsageSnapshot = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const permission = { permissions: ['scripting'], origins: ['https://claude.ai/*'] };
    const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
    function validOrganizations(value) {
        return Array.isArray(value) && value.length <= 100 && value.every(org => typeof org?.id === 'string' && UUID.test(org.id) && typeof org.name === 'string' && org.name.length <= 120) && new Set(value.map(org => org.id.toLowerCase())).size === value.length;
    }
    function validTimestamp(value) {
        if (typeof value !== 'string') return false;
        const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
        if (!parts || !Number.isFinite(Date.parse(value))) return false;
        const [, y, m, d, h, min, sec,, oh, om] = parts;
        const monthEnd = new Date(0); monthEnd.setUTCFullYear(+y, +m, 0);
        return +m >= 1 && +m <= 12 && +d >= 1 && +d <= monthEnd.getUTCDate() && +h <= 23 && +min <= 59 && +sec <= 59 && +(oh || 0) <= 23 && +(om || 0) <= 59;
    }
    const exactTab = tab => Number.isInteger(tab?.id) && (() => { try { return new URL(tab.url).origin === 'https://claude.ai'; } catch { return false; } })();
    // Self-contained for executeScript serialization. Never accepts a URL or arbitrary path.
    async function readInPage(kind, selected) {
        const bad = code => ({ error: code });
        const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
        if (location.origin !== 'https://claude.ai' || window.top !== window) return bad('wrong_page');
        if (!['organizations', 'usage'].includes(kind) || (kind === 'usage' && !uuid.test(selected))) return bad('invalid_selection');
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        let reader;
        try {
            const path = kind === 'organizations' ? '/api/organizations' : `/api/organizations/${selected}/usage`;
            const response = await fetch(path, { method: 'GET', credentials: 'same-origin', mode: 'same-origin', redirect: 'error', cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller.signal });
            if (response.headers.get('cf-mitigated') === 'challenge') return bad('challenge');
            if (response.status === 401) return bad('login_required');
            if (response.status === 403) return bad('access_denied');
            if (response.status === 429) return bad('rate_limited');
            if (response.status >= 500) return bad('temporary_error');
            if (response.status !== 200) return bad('http_error');
            if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) return bad('non_json');
            if (Number(response.headers.get('content-length')) > 65536) return bad('too_large');
            if (!response.body?.getReader) return bad('unsupported_response');
            reader = response.body.getReader(); let size = 0, text = ''; const decoder = new TextDecoder();
            while (true) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 65536) return bad('too_large'); text += decoder.decode(part.value, { stream: true }); }
            text += decoder.decode();
            let data; try { data = JSON.parse(text); } catch { return bad('schema_changed'); }
            if (kind === 'organizations') {
                if (!Array.isArray(data) || data.length > 100) return bad('schema_changed');
                const organizations = [], seen = new Set();
                for (const item of data) {
                    if (!item || typeof item.uuid !== 'string' || !uuid.test(item.uuid)) return bad('schema_changed');
                    const id = item.uuid.toLowerCase(); if (seen.has(id)) return bad('schema_changed'); seen.add(id);
                    if (item.name != null && typeof item.name !== 'string') return bad('schema_changed');
                    organizations.push({ id, name: (item.name || '').slice(0, 120) });
                }
                return { organizations };
            }
            if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.hasOwn(data, 'five_hour') || !Object.hasOwn(data, 'seven_day')) return bad('schema_changed');
            const windows = {};
            for (const key of ['five_hour', 'seven_day']) {
                const item = data[key]; if (item === null) { windows[key] = null; continue; }
                if (!item || typeof item !== 'object' || Array.isArray(item) || typeof item.utilization !== 'number' || !Number.isFinite(item.utilization) || item.utilization < 0 || item.utilization > 100) return bad('schema_changed');
                let resetAt = null;
                if (item.resets_at != null) {
                    const value = item.resets_at;
                    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) return bad('schema_changed');
                    const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
                    const [, y,m,d,h,min,s,,oh,om] = parts;
                    if (+m < 1 || +m > 12 || +d < 1 || +d > new Date(Date.UTC(+y, +m, 0)).getUTCDate() || +h > 23 || +min > 59 || +s > 59 || +(oh || 0) > 23 || +(om || 0) > 59) return bad('schema_changed');
                    resetAt = value;
                }
                windows[key] = { usedPercent: item.utilization, resetAt };
            }
            return { windows, fetchedAt: new Date().toISOString(), unavailable: windows.five_hour === null && windows.seven_day === null };
        } catch { return bad(controller.signal.aborted ? 'timeout' : 'network_or_redirect'); }
        finally { clearTimeout(timer); if (reader) { try { await reader.cancel(); } catch {} } controller.abort(); }
    }
    function createController(chrome, publish = () => {}) {
        let epoch = 0, state = { phase: 'disabled' }, disposed = false;
        const emit = value => { state = value; publish(value); };
        const clear = (phase = 'idle') => { epoch++; emit({ phase }); };
        const active = token => !disposed && token === epoch;
        const errors = new Set(['wrong_page', 'invalid_selection', 'challenge', 'login_required', 'access_denied', 'rate_limited', 'temporary_error', 'http_error', 'non_json', 'too_large', 'unsupported_response', 'schema_changed', 'timeout', 'network_or_redirect', 'document_changed', 'permission_denied', 'organizations_changed']);
        const fail = (token, code) => { if (active(token)) emit({ phase: 'error', error: errors.has(code) ? code : 'read_failed' }); };
        async function allowed() { return chrome.permissions.contains(permission); }
        async function inject(tabId, documentId, kind, selected) {
            const result = await chrome.scripting.executeScript({ target: documentId ? { tabId, documentIds: [documentId] } : { tabId, frameIds: [0] }, world: 'MAIN', func: readInPage, args: [kind, selected || null] });
            if (!Array.isArray(result) || result.length !== 1 || result[0].frameId !== 0 || typeof result[0].documentId !== 'string' || !result[0].documentId || (documentId && result[0].documentId !== documentId)) throw new Error('document_changed');
            if (result[0].result?.error) throw new Error(result[0].result.error);
            return { data: result[0].result, documentId: result[0].documentId };
        }
        const onUpdated = (id, change) => { if (state.tabId === id && (change.url || change.status === 'loading')) clear('page_changed'); };
        const onRemoved = id => { if (state.tabId === id) clear('page_changed'); };
        const onPermissionRemoved = () => clear('disabled');
        chrome.tabs.onUpdated.addListener(onUpdated); chrome.tabs.onRemoved.addListener(onRemoved); chrome.permissions.onRemoved.addListener(onPermissionRemoved);
        return {
            getState: () => state,
            close() { clear('disabled'); },
            async enable() {
                clear('enabling'); const token = epoch;
                try {
                    // Must run directly within the user's click gesture.
                    const granted = await chrome.permissions.request(permission);
                    if (!active(token)) return;
                    if (!granted) return fail(token, 'permission_denied');
                    const tabs = (await chrome.tabs.query({ url: 'https://claude.ai/*' })).filter(exactTab).map(tab => ({ id: tab.id }));
                    if (active(token)) emit({ phase: 'tabs', tabs });
                } catch { fail(token, 'permission_denied'); }
            },
            async selectTab(tabId) {
                const tabs = state.tabs;
                if (state.phase !== 'tabs' || !tabs?.some(tab => tab.id === tabId)) return;
                clear('loading'); const token = epoch; emit({ phase: 'loading', tabId });
                try {
                    if (!await allowed()) throw new Error('permission_denied'); if (!active(token)) return;
                    const tab = await chrome.tabs.get(tabId); if (!active(token)) return; if (!exactTab(tab)) throw new Error('wrong_page');
                    const result = await inject(tabId, null, 'organizations'); if (!active(token)) return;
                    if (!validOrganizations(result.data?.organizations)) throw new Error('schema_changed');
                    emit({ phase: 'organizations', tabId, documentId: result.documentId, organizations: result.data.organizations.map(org => ({ id: org.id, name: org.name })) });
                } catch (e) { fail(token, e.message); }
            },
            async selectOrganization(id) {
                if (state.phase !== 'organizations' || !UUID.test(id) || !state.organizations.some(org => org.id === id)) return;
                const context = state; clear('loading'); const token = epoch; emit({ phase: 'loading', tabId: context.tabId });
                try {
                    if (!await allowed()) throw new Error('permission_denied'); if (!active(token)) return;
                    const refreshed = await inject(context.tabId, context.documentId, 'organizations'); if (!active(token)) return;
                    const canonical = orgs => JSON.stringify(orgs.map(org => [org.id, org.name]).sort((a,b) => a[0].localeCompare(b[0])));
                    if (!validOrganizations(refreshed.data?.organizations)) throw new Error('schema_changed');
                    if (canonical(refreshed.data.organizations) !== canonical(context.organizations)) throw new Error('organizations_changed');
                    if (!await allowed()) throw new Error('permission_denied'); if (!active(token)) return;
                    const result = await inject(context.tabId, context.documentId, 'usage', id); if (!active(token)) return;
                    const data = result.data;
                    if (!data?.windows) throw new Error('schema_changed');
                    const windows = {};
                    for (const key of ['five_hour', 'seven_day']) {
                        const item = data.windows[key];
                        if (item === null) { windows[key] = null; continue; }
                        if (!item || typeof item.usedPercent !== 'number' || !Number.isFinite(item.usedPercent) || item.usedPercent < 0 || item.usedPercent > 100 || !(item.resetAt === null || validTimestamp(item.resetAt))) throw new Error('schema_changed');
                        windows[key] = { usedPercent: item.usedPercent, resetAt: item.resetAt };
                    }
                    emit({ phase: 'snapshot', tabId: context.tabId, name: context.organizations.find(org => org.id === id).name, windows, fetchedAt: new Date().toISOString(), unavailable: windows.five_hour === null && windows.seven_day === null });
                } catch (e) { fail(token, e.message); }
            },
            dispose() { clear('disabled'); disposed = true; chrome.tabs.onUpdated.removeListener(onUpdated); chrome.tabs.onRemoved.removeListener(onRemoved); chrome.permissions.onRemoved.removeListener(onPermissionRemoved); }
        };
    }
    return { permission, readInPage, createController, exactTab, validTimestamp };
});
