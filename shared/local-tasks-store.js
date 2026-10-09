/* Device-local personal content. Never call StorageManager or a provider here. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabTasks = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const KEY = '__localItabPersonalTasksV1';
    const LOCK = 'local-itab-personal-tasks-v1';
    const FORMAT = 'local-itab-tasks';
    const LIMITS = Object.freeze({ records: 500, text: 1000, recovery: 8, bytes: 2 * 1024 * 1024 });
    const clone = value => JSON.parse(JSON.stringify(value));
    // Chrome storage preserves values, not JavaScript object insertion order.
    // Arrays remain ordered; dictionaries are compared by their own keys.
    const same = (a, b) => {
        if (a === b) return true;
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
    };
    const size = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
    const id = () => {
        if (!globalThis.crypto?.randomUUID) throw fault('UNAVAILABLE');
        return globalThis.crypto.randomUUID();
    };
    function fault(code) { const error = new Error(`Local tasks: ${code}`); error.code = code; return error; }
    function check(value, code = 'INVALID') { if (!value) throw fault(code); }
    function object(value, keys) {
        check(value && typeof value === 'object' && !Array.isArray(value));
        check(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
    }
    const token = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
    const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
    function text(value) {
        check(typeof value === 'string' && value.trim().length > 0, 'TEXT');
        check(Array.from(value).length <= LIMITS.text, 'TEXT_LIMIT');
        check(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), 'TEXT');
        return value;
    }
    function validateContent(value) {
        object(value, ['records', 'pinnedId']);
        check(Array.isArray(value.records) && value.records.length <= LIMITS.records, 'CAPACITY');
        const seen = new Set();
        for (const task of value.records) {
            object(task, ['id', 'version', 'text', 'state', 'removedFrom', 'createdAt', 'updatedAt']);
            check(token(task.id) && token(task.version) && !seen.has(task.id));
            seen.add(task.id); text(task.text);
            check(['active', 'done', 'removed'].includes(task.state));
            check(task.state === 'removed' ? ['active', 'done'].includes(task.removedFrom) : task.removedFrom === null);
            check(date(task.createdAt) && date(task.updatedAt));
        }
        check(value.pinnedId === null || value.records.some(task => task.id === value.pinnedId && task.state === 'active'));
        return value;
    }
    function validateRecovery(recovery) {
        check(Array.isArray(recovery) && recovery.length <= LIMITS.recovery, 'RECOVERY_LIMIT');
        const seen = new Set();
        for (const item of recovery) {
            object(item, ['id', 'createdAt', 'content']);
            check(token(item.id) && !seen.has(item.id) && date(item.createdAt));
            seen.add(item.id); validateContent(item.content);
        }
    }
    function initial() { return { schemaVersion: 1, revision: 0, enabled: false, records: [], pinnedId: null, recovery: [], receipts: [] }; }
    function validate(value) {
        object(value, ['schemaVersion', 'revision', 'enabled', 'records', 'pinnedId', 'recovery', 'receipts']);
        check(value.schemaVersion === 1, 'VERSION');
        check(Number.isSafeInteger(value.revision) && value.revision >= 0 && typeof value.enabled === 'boolean');
        validateContent({ records: value.records, pinnedId: value.pinnedId }); validateRecovery(value.recovery);
        check(Array.isArray(value.receipts) && value.receipts.length <= 128 && value.receipts.every(token));
        check(new Set(value.receipts).size === value.receipts.length);
        check(size(value) <= LIMITS.bytes - 4096, 'SIZE_LIMIT');
        return value;
    }
    const content = state => clone({ records: state.records, pinnedId: state.pinnedId });
    function parseBackup(source) {
        check(typeof source === 'string' && size(source) <= LIMITS.bytes, 'SIZE_LIMIT');
        let file;
        try { file = JSON.parse(source); } catch (_) { throw fault('INVALID'); }
        object(file, ['format', 'schemaVersion', 'exportedAt', 'content', 'recovery']);
        check(file.format === FORMAT && file.schemaVersion === 1, 'VERSION');
        check(date(file.exportedAt)); validateContent(file.content); validateRecovery(file.recovery);
        return clone(file);
    }
    function counts(state) {
        return { active: state.records.filter(t => t.state === 'active').length,
            done: state.records.filter(t => t.state === 'done').length,
            removed: state.records.filter(t => t.state === 'removed').length, recovery: state.recovery?.length || 0 };
    }
    function createChromeBackend(chromeApi = globalThis.chrome, locks = globalThis.navigator?.locks) {
        check(chromeApi?.storage?.local && locks?.request, 'UNAVAILABLE');
        return {
            lock: action => locks.request(LOCK, { mode: 'exclusive' }, action),
            read: async () => {
                const result = await chromeApi.storage.local.get([KEY]);
                check(result && typeof result === 'object' && !Array.isArray(result), 'READ');
                return result[KEY];
            },
            write: state => chromeApi.storage.local.set({ [KEY]: state }),
            subscribe: listener => {
                const changed = (changes, area) => { if (area === 'local' && Object.hasOwn(changes, KEY)) listener(); };
                chromeApi.storage.onChanged.addListener(changed);
                return () => chromeApi.storage.onChanged.removeListener(changed);
            }
        };
    }
    class Store {
        constructor(backend = createChromeBackend(), options = {}) {
            this.backend = backend; this.id = options.id || id;
            this.now = options.now || (() => new Date().toISOString());
        }
        async readRaw() {
            let raw;
            try { raw = await this.backend.read(); } catch (_) { throw fault('READ'); }
            return raw === undefined ? initial() : clone(validate(raw));
        }
        read() { return this.backend.lock(() => this.readRaw()); }
        subscribe(listener) { return this.backend.subscribe(listener); }
        request(kind, values = {}) { return { ...values, kind, operationId: this.id() }; }
        async mutate(command) {
            check(command && token(command.operationId), 'INVALID');
            return this.backend.lock(async () => {
                const current = await this.readRaw();
                if (current.receipts.includes(command.operationId)) {
                    // An acknowledged older operation is not proof its result still exists.
                    // After any later mutation, keep the editor/draft and require review.
                    check(current.receipts.at(-1) === command.operationId, 'CONFLICT');
                    return current;
                }
                const next = clone(current);
                const now = this.now();
                const find = () => {
                    const task = next.records.find(t => t.id === command.id);
                    check(task && task.version === command.version, 'CONFLICT');
                    return task;
                };
                const touch = task => { task.version = this.id(); task.updatedAt = now; };
                const unpin = task => { if (next.pinnedId === task.id) next.pinnedId = null; };
                switch (command.kind) {
                case 'enable':
                    check(typeof command.enabled === 'boolean'); next.enabled = command.enabled; break;
                case 'add': {
                    text(command.text); check(next.records.length < LIMITS.records, 'CAPACITY');
                    check(!next.records.some(t => t.id === command.operationId), 'CONFLICT');
                    next.records.push({ id: command.operationId, version: this.id(), text: command.text,
                        state: 'active', removedFrom: null, createdAt: now, updatedAt: now }); break;
                }
                case 'edit': {
                    const task = find(); check(task.state !== 'removed', 'CONFLICT'); text(command.text);
                    task.text = command.text; touch(task); break;
                }
                case 'complete': case 'reopen': {
                    const task = find(); check(task.state === (command.kind === 'complete' ? 'active' : 'done'), 'CONFLICT');
                    task.state = command.kind === 'complete' ? 'done' : 'active'; unpin(task); touch(task); break;
                }
                case 'pin': {
                    const task = find(); check(task.state === 'active' && current.pinnedId === command.expectedPin, 'CONFLICT');
                    next.pinnedId = current.pinnedId === task.id ? null : task.id; break;
                }
                case 'move': {
                    const task = find(); check(task.state === 'active');
                    const active = next.records.filter(t => t.state === 'active').map(t => t.id);
                    check(JSON.stringify(active) === JSON.stringify(command.order), 'CONFLICT');
                    check(command.direction === -1 || command.direction === 1);
                    const index = active.indexOf(task.id), neighbor = active[index + command.direction];
                    check(neighbor, 'CONFLICT');
                    const a = next.records.findIndex(t => t.id === task.id), b = next.records.findIndex(t => t.id === neighbor);
                    [next.records[a], next.records[b]] = [next.records[b], next.records[a]]; break;
                }
                case 'remove': {
                    const task = find(); check(task.state !== 'removed', 'CONFLICT');
                    task.removedFrom = task.state; task.state = 'removed'; unpin(task); touch(task); break;
                }
                case 'restore': {
                    const task = find(); check(task.state === 'removed', 'CONFLICT');
                    task.state = task.removedFrom; task.removedFrom = null; touch(task); break;
                }
                case 'replace': case 'recover': {
                    check(current.revision === command.revision, 'CONFLICT');
                    let target, incoming = [];
                    if (command.kind === 'replace') {
                        const file = parseBackup(command.source); target = file.content; incoming = file.recovery;
                    } else {
                        const snapshot = next.recovery.find(item => item.id === command.id);
                        check(snapshot, 'CONFLICT'); target = snapshot.content;
                        next.recovery = next.recovery.filter(item => item.id !== command.id);
                    }
                    for (const backup of incoming) {
                        const existing = next.recovery.find(item => item.id === backup.id);
                        check(!existing || same(existing, backup), 'CONFLICT');
                        if (!existing) next.recovery.push(clone(backup));
                    }
                    check(next.recovery.length < LIMITS.recovery, 'RECOVERY_LIMIT');
                    next.recovery.push({ id: this.id(), createdAt: now, content: content(current) });
                    next.records = clone(target.records).map(task => ({ ...task, version: this.id() }));
                    next.pinnedId = target.pinnedId; break;
                }
                default: throw fault('INVALID');
                }
                next.revision += 1;
                next.receipts = [...next.receipts, command.operationId].slice(-128);
                validate(next);
                try { if (await this.backend.write(next) === false) throw fault('WRITE'); }
                catch (_) { throw fault('WRITE'); }
                // Never advertise Saved merely because the write promise resolved.
                const verified = await this.readRaw();
                check(same(verified, next), 'VERIFY');
                return verified;
            });
        }
        async export() {
            const state = await this.read();
            return JSON.stringify({ format: FORMAT, schemaVersion: 1, exportedAt: this.now(), content: content(state), recovery: state.recovery });
        }
        async review(source) {
            const file = parseBackup(source); const current = await this.read();
            // Build no replacement until explicit confirmation. Snapshot is a checked precondition.
            return { source, revision: current.revision, incoming: counts({ ...file.content, recovery: file.recovery }), current: counts(current) };
        }
    }
    return { KEY, LOCK, FORMAT, LIMITS, initial, Store, createChromeBackend, parseBackup, validate, counts, fault };
});
