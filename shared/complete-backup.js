/* Explicit local-only archive. Never initialize Sync or call provider APIs here. */
(function (root, factory) {
    const api = typeof module === 'object' && module.exports
        ? factory(require('./local-tasks-store.js'), require('./local-scratchpad-store.js'), require('./local-countdown-store.js'), require('./local-focus-store.js'))
        : factory(root.LocalItabTasks, root.LocalItabScratchpad, root.LocalItabCountdown, root.LocalItabFocus);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabCompleteBackup = api;
})(typeof window === 'undefined' ? globalThis : window, function (tasks, scratchpad, countdown, focus) {
    'use strict';
    const FORMAT = 'local-itab-complete-backup', RECOVERY_KEY = '__localItabCompleteRecoveryV1';
    const MODULES = Object.freeze(['config', 'tasks', 'scratchpad', 'countdown', 'focus']);
    const LIMITS = Object.freeze({ bytes: 32 * 1024 * 1024, nodes: 250000, depth: 32 });
    const apis = { tasks, scratchpad, countdown, focus };
    const parsedFiles = new WeakMap();
    const clone = value => JSON.parse(JSON.stringify(value));
    const bytes = value => new TextEncoder().encode(value).length;
    const same = (a, b) => a === b || Boolean(a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => Object.hasOwn(b, key) && same(a[key], b[key])));
    function fault(code) { const error = new Error(`Complete local backup: ${code}`); error.code = code; return error; }
    function check(ok, code = 'INVALID') { if (!ok) throw fault(code); }
    function object(value, keys) {
        check(value && typeof value === 'object' && !Array.isArray(value));
        if (keys) check(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
    }
    function selection(value, available = MODULES) {
        check(Array.isArray(value) && value.length > 0 && new Set(value).size === value.length && value.every(name => available.includes(name)));
        return MODULES.filter(name => value.includes(name));
    }
    function serialize(value) { const source = JSON.stringify(value); check(bytes(source) <= LIMITS.bytes, 'SIZE_LIMIT'); return source; }
    // Backup-specific structural budget: count actual UTF-8 string bytes, not
    // the bookmark planner's deliberately conservative three-bytes-per-unit
    // estimate. The serialized envelope has a separate exact 32 MiB check.
    function boundedCopy(value, budget = LIMITS.bytes) {
        let used = 0, nodes = 0;
        const ancestors = new Set();
        const charge = amount => { used += amount; check(used <= budget, 'SIZE_LIMIT'); };
        const string = text => { check(text.length <= LIMITS.bytes, 'SIZE_LIMIT'); charge(bytes(text)); return text; };
        function walk(item, depth) {
            check(++nodes <= LIMITS.nodes && depth <= LIMITS.depth, 'SIZE_LIMIT');
            if (item === null || typeof item === 'boolean') { charge(5); return item; }
            if (typeof item === 'number') { check(Number.isFinite(item)); charge(8); return item; }
            if (typeof item === 'string') return string(item);
            check(item && typeof item === 'object' && !ancestors.has(item));
            const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
            check(array || prototype === null || Object.getPrototypeOf(prototype) === null);
            if (array) check(item.length <= LIMITS.nodes, 'SIZE_LIMIT');
            const result = array ? new Array(item.length) : {};
            ancestors.add(item); let count = 0;
            for (const key in item) {
                if (!Object.hasOwn(item, key)) continue;
                check(++count <= LIMITS.nodes, 'SIZE_LIMIT'); string(key);
                const descriptor = Object.getOwnPropertyDescriptor(item, key);
                check(descriptor && Object.hasOwn(descriptor, 'value'));
                if (array) check(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < item.length);
                Object.defineProperty(result, key, { value: walk(descriptor.value, depth + 1), enumerable: true, configurable: true, writable: true });
            }
            if (array) check(count === item.length);
            ancestors.delete(item); return result;
        }
        return walk(value, 0);
    }
    function portable(name, state) {
        const value = clone(state); delete value.revision;
        if (name === 'tasks') delete value.receipts;
        if (name === 'focus') delete value.session;
        return value;
    }
    function validateModule(name, value, manager) {
        if (name === 'config') return manager.validateCompleteBackupConfig(value);
        const keys = { tasks: ['schemaVersion', 'enabled', 'records', 'pinnedId', 'recovery'], scratchpad: ['schemaVersion', 'enabled', 'content'], countdown: ['schemaVersion', 'enabled', 'title', 'targetDate'], focus: ['schemaVersion', 'enabled', 'durations'] };
        object(value, keys[name]); check(value.schemaVersion === 1, 'VERSION');
        const state = { ...clone(value), revision: 0 };
        if (name === 'tasks') state.receipts = [];
        if (name === 'focus') { state.session = focus.initial().session; state.session.remainingMs = value.durations?.focus * 60000; }
        try { apis[name].validate(state); } catch (_) { throw fault('INVALID'); }
        return clone(value);
    }
    function parse(source, manager) {
        check(typeof source === 'string', 'INVALID'); check(source.length <= LIMITS.bytes && bytes(source) <= LIMITS.bytes, 'SIZE_LIMIT');
        let file; try { file = JSON.parse(source); } catch (_) { throw fault('INVALID'); }
        try { file = boundedCopy(file); } catch (_) { throw fault('SIZE_LIMIT'); }
        object(file, ['format', 'schemaVersion', 'exportedAt', 'modules']);
        check(file.format === FORMAT && file.schemaVersion === 1, 'VERSION');
        check(typeof file.exportedAt === 'string' && /^\d{4}-\d\d-\d\dT/.test(file.exportedAt) && Number.isFinite(Date.parse(file.exportedAt)));
        object(file.modules); selection(Object.keys(file.modules));
        for (const name of Object.keys(file.modules)) validateModule(name, file.modules[name], manager);
        return file;
    }
    function createBackend(manager, chromeApi = globalThis.chrome, locks = globalThis.navigator?.locks) {
        check(chromeApi?.storage?.local && locks?.request, 'UNAVAILABLE');
        return {
            // Legacy stores and already-open pages use these locks. Never call a
            // public Store or StorageManager writer while holding this chain.
            lock: fn => locks.request(tasks.LOCK, { mode: 'exclusive' }, () => locks.request(focus.LOCK, { mode: 'exclusive' }, () => locks.request('local-itab-local-write', { mode: 'exclusive' }, fn))),
            read: keys => chromeApi.storage.local.get(keys || [...Object.keys(manager.defaultConfig), 'schemaVersion', manager.layoutGenerationKey, manager.settingsGenerationKey, manager.syncIdentityStateKey, ...Object.values(apis).map(api => api.KEY)]),
            write: values => chromeApi.storage.local.set(values),
            readRecovery: async () => (await chromeApi.storage.local.get([RECOVERY_KEY]))[RECOVERY_KEY]
        };
    }
    class Store {
        constructor(manager, backend = createBackend(manager), { now = () => new Date().toISOString(), id = () => crypto.randomUUID() } = {}) {
            this.manager = manager; this.backend = backend; this.now = now; this.id = id; this.tickets = new WeakMap();
        }
        async raw(keys = null) {
            let raw; try { raw = await this.backend.read(keys); object(raw); } catch (_) { throw fault('READ'); }
            // A bounded, plain JSON copy prevents getters/cycles/unknown objects
            // from masquerading as a comparable read baseline.
            try {
                if (keys) {
                    const prototype = Object.getPrototypeOf(raw);
                    check(prototype === null || Object.getPrototypeOf(prototype) === null);
                    const selected = {};
                    for (const key of keys) if (Object.hasOwn(raw, key)) {
                        const descriptor = Object.getOwnPropertyDescriptor(raw, key);
                        check(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'));
                        Object.defineProperty(selected, key, descriptor);
                    }
                    raw = selected;
                }
                return boundedCopy(raw);
            } catch (_) { throw fault('CORRUPT'); }
        }
        snapshot(raw, names = MODULES) {
            const modules = {};
            try {
                if (names.includes('config')) modules.config = this.manager.completeBackupConfigFromRaw(raw);
                for (const [name, api] of Object.entries(apis)) {
                    if (!names.includes(name)) continue;
                    const state = raw[api.KEY] === undefined ? api.initial() : api.validate(raw[api.KEY]);
                    modules[name] = portable(name, state);
                }
            } catch (_) { throw fault('CORRUPT'); }
            const file = { format: FORMAT, schemaVersion: 1, exportedAt: this.now(), modules };
            check(typeof file.exportedAt === 'string' && /^\d{4}-\d\d-\d\dT/.test(file.exportedAt) && Number.isFinite(Date.parse(file.exportedAt)));
            return { file, source: serialize(file) };
        }
        counts(modules) {
            const result = {};
            for (const [name, value] of Object.entries(modules)) {
                if (name === 'config') result.config = this.manager.countBackupItems(value.data);
                else if (name === 'tasks') result.tasks = tasks.counts(value);
                else if (name === 'scratchpad') result.scratchpad = { characters: Array.from(value.content).length };
                else if (name === 'countdown') result.countdown = { enabled: value.enabled, title: value.title, targetDate: value.targetDate };
                else result.focus = { enabled: value.enabled, durations: clone(value.durations) };
            }
            return result;
        }
        export(selected = MODULES) {
            const names = selection(selected);
            // An explicit partial export depends only on selected saved modules.
            // Configuration still includes its schema/generation safety checks,
            // but provider state and unselected personal content are not read.
            const keys = names.flatMap(name => name === 'config'
                ? [...Object.keys(this.manager.defaultConfig).filter(key => key !== 'sync'), 'schemaVersion', this.manager.layoutGenerationKey, this.manager.settingsGenerationKey]
                : [apis[name].KEY]);
            return this.backend.lock(async () => this.snapshot(await this.raw(keys), names).source);
        }
        review(source, selected = null) {
            let cached = parsedFiles.get(this);
            if (!cached || cached.source !== source) {
                cached = { source, file: parse(source, this.manager) };
                parsedFiles.set(this, cached);
            }
            const file = cached.file, names = selection(selected || Object.keys(file.modules), Object.keys(file.modules));
            return this.backend.lock(async () => {
                const raw = await this.raw(), current = this.snapshot(raw);
                const preview = { modules: Object.keys(file.modules), selected: [...names], exportedAt: file.exportedAt, incoming: this.counts(file.modules), current: this.counts(current.file.modules) };
                preview.current.focus.activeSession = ['running', 'paused', 'uncertain'].includes(raw[focus.KEY]?.session?.status);
                this.tickets.set(preview, { file, names, raw }); return preview;
            });
        }
        async recovery() {
            let saved; try { saved = await this.backend.readRecovery(); } catch (_) { throw fault('RECOVERY'); }
            try { saved = boundedCopy(saved, LIMITS.bytes + 1024); } catch (_) { throw fault('RECOVERY'); }
            object(saved, ['source', 'checksum']);
            check(typeof saved.source === 'string' && saved.source.length <= LIMITS.bytes && bytes(saved.source) <= LIMITS.bytes && typeof saved.checksum === 'string' && /^[a-f0-9]{64}$/.test(saved.checksum), 'RECOVERY');
            check(await this.manager.fingerprint(saved.source) === saved.checksum, 'RECOVERY');
            const file = parse(saved.source, this.manager); check(MODULES.every(name => Object.hasOwn(file.modules, name)), 'RECOVERY');
            return saved.source;
        }
        restore(preview, { confirmed = false, isCurrent = () => true } = {}) {
            check(confirmed === true, 'CONFIRMATION');
            const ticket = this.tickets.get(preview); check(ticket, 'CONFLICT');
            // Consume before awaiting; retries always require a new review.
            this.tickets.delete(preview);
            return this.backend.lock(async () => {
                check(isCurrent(), 'CANCELLED');
                const raw = await this.raw(); check(same(raw, ticket.raw), 'CONFLICT');
                if (ticket.names.includes('focus')) check(!['running', 'paused', 'uncertain'].includes(raw[focus.KEY]?.session?.status), 'FOCUS_ACTIVE');
                const recoverySource = this.snapshot(raw).source, written = {};
                for (const name of ticket.names) {
                    const value = clone(ticket.file.modules[name]);
                    if (name === 'config') { Object.assign(written, this.manager.completeBackupConfigWrite(value, raw)); continue; }
                    const api = apis[name], current = raw[api.KEY] === undefined ? api.initial() : api.validate(raw[api.KEY]);
                    check(current.revision < Number.MAX_SAFE_INTEGER, 'CORRUPT');
                    const next = { ...value, revision: current.revision + 1 };
                    if (name === 'tasks') {
                        next.records = next.records.map(task => ({ ...task, version: this.id() }));
                        next.receipts = [...current.receipts, this.id()].slice(-128);
                    }
                    if (name === 'focus') { next.session = focus.initial().session; next.session.remainingMs = next.durations.focus * 60000; }
                    api.validate(next); written[api.KEY] = next;
                }
                const recovery = { source: recoverySource, checksum: await this.manager.fingerprint(recoverySource) };
                check(isCurrent(), 'CANCELLED');
                // Establish a verified recovery copy BEFORE touching target keys.
                // The final multi-key set is one submission, not a promise of
                // browser-crash atomicity. Never retry or roll back an uncertain set.
                try {
                    check(await this.backend.write({ [RECOVERY_KEY]: recovery }) !== false, 'RECOVERY');
                    check(same(await this.backend.readRecovery(), recovery), 'RECOVERY');
                } catch (_) { throw fault('RECOVERY'); }
                check(isCurrent(), 'CANCELLED');
                // Defend also against unsupported/out-of-band writers during the
                // awaited recovery write. Cooperating extension writers are locked.
                check(same(await this.raw(), raw), 'CONFLICT');
                check(isCurrent(), 'CANCELLED');
                try {
                    check(await this.backend.write(written) !== false, 'WRITE');
                    const saved = await this.raw();
                    check(Object.entries(written).every(([key, value]) => same(saved[key], value)), 'VERIFY');
                } catch (_) { const error = fault('UNCONFIRMED'); error.mayHaveCommitted = true; throw error; }
                if (ticket.names.includes('config')) this.manager.cancelSyncPush();
                return { changed: true, selected: [...ticket.names], recoveryAvailable: true };
            });
        }
    }
    return { FORMAT, MODULES, LIMITS, RECOVERY_KEY, Store, createBackend, parse, fault };
});
