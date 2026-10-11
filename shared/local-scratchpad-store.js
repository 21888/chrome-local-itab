/* Device-local plain text. This module never uses configuration or cloud providers. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabScratchpad = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const KEY = '__localItabScratchpadV1', LOCK = 'local-itab-local-write';
    const LIMITS = Object.freeze({ characters: 32000, bytes: 128 * 1024 });
    function fault(code) { const error = new Error(`Local scratchpad: ${code}`); error.code = code; return error; }
    function check(ok, code = 'INVALID') { if (!ok) throw fault(code); }
    const isUnicode = value => typeof value === 'string' && !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
    function content(value) {
        check(typeof value === 'string', 'INVALID');
        // Reject unpaired surrogates: a UTF-8 export must round-trip exactly.
        check(isUnicode(value), 'TEXT');
        check(Array.from(value).length <= LIMITS.characters, 'TEXT_LIMIT');
        check(new TextEncoder().encode(value).length <= LIMITS.bytes, 'SIZE_LIMIT');
        return value;
    }
    function initial() { return { schemaVersion: 1, revision: 0, enabled: false, content: '' }; }
    function validate(value) {
        check(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 4 && ['schemaVersion', 'revision', 'enabled', 'content'].every(k => Object.hasOwn(value, k)));
        check(value.schemaVersion === 1 && Number.isSafeInteger(value.revision) && value.revision >= 0 && typeof value.enabled === 'boolean');
        content(value.content); return value;
    }
    const same = (a, b) => ['schemaVersion', 'revision', 'enabled', 'content'].every(k => a[k] === b[k]);
    function createChromeBackend(chromeApi = globalThis.chrome, locks = globalThis.navigator?.locks, workspace = globalThis.LocalItabWorkspaces?.session) {
        if (workspace) return workspace.createBackend(KEY);
        check(chromeApi?.storage?.local && locks?.request, 'UNAVAILABLE');
        return {
            lock: fn => locks.request(LOCK, { mode: 'exclusive' }, fn),
            read: async () => (await chromeApi.storage.local.get([KEY]))[KEY],
            write: value => chromeApi.storage.local.set({ [KEY]: value }),
            subscribe(fn) { const listener = (changes, area) => { if (area === 'local' && Object.hasOwn(changes, KEY)) fn(); };
                chromeApi.storage.onChanged.addListener(listener); return () => chromeApi.storage.onChanged.removeListener(listener); }
        };
    }
    class Store {
        constructor(backend = createChromeBackend()) { this.backend = backend; }
        async raw() { let value; try { value = await this.backend.read(); } catch (error) { if (error.code?.startsWith('WORKSPACE_')) throw error; throw fault('READ'); }
            if (value === undefined) return initial();
            try { return { ...validate(value) }; } catch (_) { throw fault('CORRUPT'); } }
        read() { return this.backend.lock(() => this.raw()); }
        subscribe(fn) { return this.backend.subscribe(fn); }
        mutate(command) { return this.backend.lock(async () => {
            const state = await this.raw(); check(command.revision === state.revision, 'CONFLICT');
            if (command.kind === 'content') state.content = content(command.value);
            else if (command.kind === 'visibility') { check(typeof command.value === 'boolean'); state.enabled = command.value; }
            else throw fault('INVALID');
            state.revision++; validate(state);
            try { await this.backend.write(state); } catch (_) { throw fault('WRITE'); }
            const saved = await this.raw(); check(same(state, saved), 'VERIFY'); return saved;
        }); }
    }
    return { KEY, LOCK, LIMITS, Store, initial, validate, content, isUnicode, fault, createChromeBackend };
});
