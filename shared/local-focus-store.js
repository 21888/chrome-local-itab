/* Dedicated device-local state. Deliberately independent of StorageManager and providers. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabFocus = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const KEY = '__localItabFocusV1', LOCK = 'local-itab-focus-v1';
    const LIMITS = Object.freeze({ minMinutes: 1, maxMinutes: 180, clockToleranceMs: 2000 });
    const clone = value => JSON.parse(JSON.stringify(value));
    const same = (a, b) => a === b || (a && b && typeof a === 'object' && typeof b === 'object' && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && same(a[key], b[key])));
    function fault(code) { const error = new Error(`Local focus: ${code}`); error.code = code; return error; }
    function check(ok, code = 'INVALID') { if (!ok) throw fault(code); }
    function object(value, keys) { check(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every(k => Object.hasOwn(value, k))); }
    const minutes = value => Number.isInteger(value) && value >= 1 && value <= 180;
    function initial() { return { schemaVersion: 1, revision: 0, enabled: false, durations: { focus: 25, break: 5 },
        session: { id: null, phase: 'focus', status: 'ready', remainingMs: 1500000, startedAt: null, deadline: null } }; }
    function validate(value) {
        object(value, ['schemaVersion', 'revision', 'enabled', 'durations', 'session']);
        check(value.schemaVersion === 1 && Number.isSafeInteger(value.revision) && value.revision >= 0 && typeof value.enabled === 'boolean');
        object(value.durations, ['focus', 'break']); check(minutes(value.durations.focus) && minutes(value.durations.break));
        const s = value.session; object(s, ['id', 'phase', 'status', 'remainingMs', 'startedAt', 'deadline']);
        check(s.id === null || (typeof s.id === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(s.id)));
        check(['focus', 'break'].includes(s.phase) && ['ready', 'running', 'paused', 'uncertain', 'completed'].includes(s.status));
        check(Number.isFinite(s.remainingMs) && s.remainingMs >= 0 && s.remainingMs <= value.durations[s.phase] * 60000);
        if (s.status === 'running') check(s.id !== null && s.remainingMs > 0 && Number.isSafeInteger(s.startedAt) && s.startedAt >= 0 && Number.isSafeInteger(s.deadline) && s.deadline - s.startedAt === s.remainingMs);
        else check(s.startedAt === null && s.deadline === null);
        if (s.status === 'completed') check(s.remainingMs === 0 && s.id !== null);
        if (s.status === 'ready') check(s.remainingMs === value.durations[s.phase] * 60000);
        return value;
    }
    function project(state, now) {
        const result = clone(state), s = result.session;
        if (s.status === 'running') {
            if (!Number.isFinite(now) || now < s.startedAt) s.status = 'uncertain';
            else { s.remainingMs = Math.max(0, Math.min(s.remainingMs, s.deadline - now)); if (!s.remainingMs) s.status = 'completed'; }
        }
        return result;
    }
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
        constructor(backend = createChromeBackend(), { now = () => Date.now(), id = () => crypto.randomUUID() } = {}) { this.backend = backend; this.now = now; this.id = id; }
        async raw() { let value; try { value = await this.backend.read(); } catch (error) { if (error.code?.startsWith('WORKSPACE_')) throw error; throw fault('READ'); }
            return value === undefined ? initial() : clone(validate(value)); }
        read() { return this.backend.lock(() => this.raw()); }
        subscribe(fn) { return this.backend.subscribe(fn); }
        mutate(command) { return this.backend.lock(async () => {
            const state = await this.raw(); check(command.revision === state.revision, 'CONFLICT');
            const now = this.now(); check(Number.isSafeInteger(now) && now >= 0, 'CLOCK');
            const projected = project(state, now).session, s = state.session;
            const reset = () => { s.status = 'ready'; s.remainingMs = state.durations[s.phase] * 60000; s.startedAt = null; s.deadline = null; };
            switch (command.kind) {
                case 'visibility': check(typeof command.value === 'boolean'); state.enabled = command.value; break;
                case 'duration': check(projected.status === 'ready', 'TRANSITION'); check(minutes(command.value), 'DURATION'); state.durations[s.phase] = command.value; reset(); break;
                case 'phase': check(['ready', 'completed'].includes(projected.status), 'TRANSITION'); check(['focus', 'break'].includes(command.value)); s.phase = command.value; reset(); break;
                case 'start': check(projected.status === 'ready', 'TRANSITION'); s.id = this.id(); s.status = 'running'; s.startedAt = now; s.deadline = now + s.remainingMs; break;
                case 'pause': check(projected.status === 'running', 'TRANSITION'); s.remainingMs = projected.remainingMs; s.status = 'paused'; s.startedAt = null; s.deadline = null; break;
                case 'resume': check(projected.status === 'paused' && s.remainingMs > 0, 'TRANSITION'); s.status = 'running'; s.startedAt = now; s.deadline = now + s.remainingMs; break;
                case 'complete': check(projected.status === 'completed' && s.status === 'running', 'TRANSITION'); s.status = 'completed'; s.remainingMs = 0; s.startedAt = null; s.deadline = null; break;
                case 'uncertain': check(s.status === 'running', 'TRANSITION'); s.status = 'uncertain'; s.startedAt = null; s.deadline = null; break;
                case 'reset': reset(); break;
                default: throw fault('INVALID');
            }
            state.revision++; validate(state);
            try { await this.backend.write(state); } catch (_) { throw fault('WRITE'); }
            const saved = await this.raw(); check(same(saved, state), 'VERIFY'); return saved;
        }); }
    }
    function formatRemaining(ms) { const seconds = Math.ceil(Math.max(0, ms) / 1000); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; }
    return { KEY, LOCK, LIMITS, Store, initial, validate, project, fault, formatRemaining, createChromeBackend };
});
