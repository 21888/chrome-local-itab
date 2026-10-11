/* Explicit local-only archive. Never initialize Sync or call provider APIs here. */
(function (root, factory) {
    const api = typeof module === 'object' && module.exports
        ? factory(require('./local-tasks-store.js'), require('./local-scratchpad-store.js'), require('./local-countdown-store.js'), require('./local-focus-store.js'))
        : factory(root.LocalItabTasks, root.LocalItabScratchpad, root.LocalItabCountdown, root.LocalItabFocus);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabCompleteBackup = api;
})(typeof window === 'undefined' ? globalThis : window, function (tasks, scratchpad, countdown, focus) {
    'use strict';
    const FORMAT = 'local-itab-complete-backup', RECOVERY_KEY = '__localItabCompleteRecoveryV1', WORKSPACE_RECOVERY_KEY = '__localItabCompleteRecoveryV2';
    const MODULES = Object.freeze(['config', 'tasks', 'scratchpad', 'countdown', 'focus']);
    const LIMITS = Object.freeze({ bytes: 32 * 1024 * 1024, nodes: 250000, depth: 32, workspaces: 100, name: 80 });
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
        check(file?.format === FORMAT && [1, 2].includes(file.schemaVersion), 'VERSION');
        if (file.schemaVersion === 2) return validateWorkspaceFile(file, manager);
        object(file, ['format', 'schemaVersion', 'exportedAt', 'modules']);
        check(typeof file.exportedAt === 'string' && /^\d{4}-\d\d-\d\dT/.test(file.exportedAt) && Number.isFinite(Date.parse(file.exportedAt)));
        object(file.modules); selection(Object.keys(file.modules));
        for (const name of Object.keys(file.modules)) validateModule(name, file.modules[name], manager);
        return file;
    }
    const workspaceId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
    const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
    function workspaceMetadata(value, removed = false) {
        object(value, removed ? ['id', 'name', 'createdAt', 'updatedAt', 'deletedAt', 'modules'] : ['id', 'name', 'createdAt', 'updatedAt']);
        check(workspaceId(value.id) && typeof value.name === 'string' && value.name.trim() === value.name && value.name.length > 0 && Array.from(value.name).length <= LIMITS.name && !/[\u0000-\u001f\u007f]/.test(value.name));
        check(date(value.createdAt) && date(value.updatedAt) && (!removed || date(value.deletedAt)));
    }
    function workspaceModule(name, value, manager) {
        if (name !== 'config') return validateModule(name, value, manager);
        object(value, ['schemaVersion', 'data']); object(value.data);
        check(!Object.hasOwn(value.data, 'privacy') && !Object.hasOwn(value.data, 'sync'));
        validateModule(name, { ...value, data: { ...value.data, privacy: clone(manager.defaultConfig.privacy) } }, manager);
        return value;
    }
    function validateWorkspaceFile(file, manager) {
        object(file, ['format', 'schemaVersion', 'exportedAt', 'modules', 'registry', 'workspaces', 'trash']);
        check(file.format === FORMAT && file.schemaVersion === 2, 'VERSION'); check(date(file.exportedAt));
        const names = selection(file.modules); check(same(names, file.modules));
        object(file.registry, ['defaultId', 'lastUsedId', 'entries']);
        check(file.registry.defaultId === 'default' && workspaceId(file.registry.lastUsedId));
        check(Array.isArray(file.registry.entries) && file.registry.entries.length > 0 && Array.isArray(file.workspaces) && Array.isArray(file.trash));
        check(file.registry.entries.length + file.trash.length <= LIMITS.workspaces, 'SIZE_LIMIT');
        const live = new Set(), all = new Set();
        for (const entry of file.registry.entries) { workspaceMetadata(entry); check(!all.has(entry.id)); live.add(entry.id); all.add(entry.id); }
        check(live.has('default') && live.has(file.registry.lastUsedId) && file.workspaces.length === live.size);
        const payloads = new Set();
        const validateModules = modules => { object(modules, names); for (const name of names) workspaceModule(name, modules[name], manager); };
        for (const bundle of file.workspaces) {
            object(bundle, ['id', 'modules']); check(live.has(bundle.id) && !payloads.has(bundle.id)); payloads.add(bundle.id); validateModules(bundle.modules);
        }
        for (const item of file.trash) {
            workspaceMetadata(item, true); check(item.id !== 'default' && !all.has(item.id)); all.add(item.id); validateModules(item.modules);
        }
        return file;
    }
    function workspaceKeys(manager, names) {
        return names.flatMap(name => name === 'config'
            ? [...Object.keys(manager.defaultConfig).filter(key => !['sync', 'privacy'].includes(key)), 'schemaVersion', manager.layoutGenerationKey, manager.settingsGenerationKey]
            : [apis[name].KEY]);
    }
    function workspaceShape(snapshot) {
        object(snapshot, ['registry', 'bundles']); object(snapshot.registry);
        check(Array.isArray(snapshot.registry.workspaces) && Array.isArray(snapshot.bundles));
        check(snapshot.registry.workspaces.length > 0 && snapshot.registry.workspaces.length <= LIMITS.workspaces, 'SIZE_LIMIT');
        const ids = new Set();
        for (const entry of snapshot.registry.workspaces) {
            check(workspaceId(entry.id) && !ids.has(entry.id)); ids.add(entry.id);
            const bundle = snapshot.bundles.filter(value => value.id === entry.id);
            check(bundle.length === 1 && bundle[0].generation === entry.generation); object(bundle[0].values);
        }
        check(snapshot.bundles.length === ids.size);
        return snapshot;
    }
    function createBackend(manager, chromeApi = globalThis.chrome, locks = globalThis.navigator?.locks) {
        check(chromeApi?.storage?.local && locks?.request, 'UNAVAILABLE');
        return {
            // Legacy stores and already-open pages use these locks. Never call a
            // public Store or StorageManager writer while holding this chain.
            lock: fn => locks.request(tasks.LOCK, { mode: 'exclusive' }, () => locks.request(focus.LOCK, { mode: 'exclusive' }, () => locks.request('local-itab-local-write', { mode: 'exclusive' }, fn))),
            read: keys => chromeApi.storage.local.get(keys || [...Object.keys(manager.defaultConfig), 'schemaVersion', manager.layoutGenerationKey, manager.settingsGenerationKey, manager.syncIdentityStateKey, ...Object.values(apis).map(api => api.KEY)]),
            write: values => chromeApi.storage.local.set(values),
            readRecovery: async (key = RECOVERY_KEY) => (await chromeApi.storage.local.get([key]))[key]
        };
    }
    class Store {
        constructor(manager, backend = createBackend(manager), { now = () => new Date().toISOString(), id = () => crypto.randomUUID(), workspaceManager = null } = {}) {
            this.manager = manager; this.backend = backend; this.now = now; this.id = id; this.tickets = new WeakMap(); this.workspaces = workspaceManager || manager.workspace?.manager || null;
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
        snapshot(raw, names = MODULES, workspace = false) {
            const modules = {};
            try {
                if (names.includes('config')) modules.config = workspace && this.manager.validateWorkspaceConfig
                    ? this.manager.validateWorkspaceConfig(raw) : this.manager.completeBackupConfigFromRaw(raw);
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
        workspaceSnapshot(snapshot, names = MODULES) {
            try {
                workspaceShape(snapshot);
                const entries = snapshot.registry.workspaces, bundles = new Map(snapshot.bundles.map(value => [value.id, value]));
                const metadata = entry => ({ id: entry.id, name: entry.name, createdAt: entry.createdAt, updatedAt: entry.updatedAt });
                const modules = entry => {
                    const raw = bundles.get(entry.id).values, result = this.snapshot(raw, names, true).file.modules;
                    if (result.config) delete result.config.data.privacy;
                    return result;
                };
                const file = { format: FORMAT, schemaVersion: 2, exportedAt: this.now(), modules: [...names],
                    registry: { defaultId: 'default', lastUsedId: snapshot.registry.lastUsedId, entries: entries.filter(entry => entry.deletedAt === null).sort((a, b) => a.order - b.order).map(metadata) },
                    workspaces: entries.filter(entry => entry.deletedAt === null).map(entry => ({ id: entry.id, modules: modules(entry) })),
                    trash: entries.filter(entry => entry.deletedAt !== null).map(entry => ({ ...metadata(entry), deletedAt: entry.deletedAt, modules: modules(entry) })) };
                validateWorkspaceFile(file, this.manager); return { file, source: serialize(file) };
            } catch (error) { if (error.code === 'SIZE_LIMIT') throw error; throw fault('CORRUPT'); }
        }
        async workspaceRead(tx, names = null) {
            let snapshot; try { snapshot = await tx.snapshot(names ? workspaceKeys(this.manager, names) : null); }
            catch (error) { if (error.code) throw error; throw fault('READ'); }
            try { return workspaceShape(boundedCopy(snapshot)); } catch (_) { throw fault('CORRUPT'); }
        }
        workspaceExport(names) {
            return this.workspaces.withSnapshotLock(async tx => this.workspaceSnapshot(await this.workspaceRead(tx, names), names).source);
        }
        workspaceCounts(file) {
            const result = {};
            for (const bundle of [...file.workspaces, ...file.trash]) {
                const counts = this.counts(bundle.modules);
                for (const [name, value] of Object.entries(counts)) {
                    if (!result[name]) result[name] = {};
                    for (const [key, amount] of Object.entries(value)) {
                        if (typeof amount === 'number') result[name][key] = (result[name][key] || 0) + amount;
                        else if (typeof amount === 'boolean') result[name][key] = Boolean(result[name][key] || amount);
                    }
                }
            }
            return result;
        }
        workspaceReview(file, names, options) {
            const targetWorkspaceId = options.targetWorkspaceId;
            return this.workspaces.withSnapshotLock(async tx => {
                const snapshot = await this.workspaceRead(tx), current = this.workspaceSnapshot(snapshot).file;
                const destinations = current.registry.entries.map(({id, name}) => ({id, name}));
                const target = file.schemaVersion === 1 ? destinations.find(entry => entry.id === targetWorkspaceId) : null;
                if (file.schemaVersion === 1 && targetWorkspaceId !== undefined) check(target, 'TARGET');
                const currentModules = target ? current.workspaces.find(entry => entry.id === target.id).modules : null;
                const currentCounts = currentModules ? this.counts(currentModules) : this.workspaceCounts(current);
                const relevant = snapshot.bundles.filter(bundle => !target || bundle.id === target.id);
                currentCounts.focus = { ...(currentCounts.focus || {}), activeSession: relevant.some(bundle => ['running', 'paused', 'uncertain'].includes(bundle.values[focus.KEY]?.session?.status)) };
                const preview = { schemaVersion: file.schemaVersion, modules: file.schemaVersion === 2 ? [...file.modules] : Object.keys(file.modules), selected: [...names], exportedAt: file.exportedAt,
                    incoming: file.schemaVersion === 2 ? this.workspaceCounts(file) : this.counts(file.modules), current: currentCounts,
                    requiresTarget: file.schemaVersion === 1 && !target, destinations, targetWorkspace: target ? clone(target) : null,
                    workspaces: { incoming: file.schemaVersion === 2 ? file.registry.entries.map(({id, name}) => ({id, name})) : [], current: destinations,
                        incomingTrash: file.schemaVersion === 2 ? file.trash.map(({id, name}) => ({id, name})) : [], currentTrash: current.trash.map(({id, name}) => ({id, name})),
                        incomingTrashCount: file.schemaVersion === 2 ? file.trash.length : 0, currentTrashCount: current.trash.length, scope: file.schemaVersion === 1 ? 'single' : names.length === MODULES.length ? 'all' : 'matching' } };
                if (file.schemaVersion === 2 && names.length !== MODULES.length) {
                    const signature = value => JSON.stringify({live: value.registry.entries.map(entry => entry.id).sort(), trash: value.trash.map(entry => entry.id).sort()});
                    check(signature(file) === signature(current), 'TOPOLOGY');
                }
                if (!preview.requiresTarget) this.tickets.set(preview, { workspace: true, file, names: [...names], snapshot, targetWorkspaceId: target?.id });
                return preview;
            });
        }
        restoredWorkspaceValues(modules, names, raw) {
            const written = clone(raw);
            for (const name of names) {
                const value = clone(modules[name]);
                if (name === 'config') {
                    // Device privacy is intentionally outside every workspace and
                    // is never imported, even from an older v1 configuration.
                    value.data.privacy = clone(this.manager.defaultConfig.privacy);
                    const config = this.manager.completeBackupConfigWrite(value, raw);
                    for (const [key, item] of Object.entries(config)) if (!['sync', 'privacy', this.manager.syncIdentityStateKey].includes(key)) written[key] = item;
                    continue;
                }
                const api = apis[name], current = raw[api.KEY] === undefined ? api.initial() : api.validate(raw[api.KEY]);
                check(current.revision < Number.MAX_SAFE_INTEGER, 'CORRUPT');
                const next = { ...value, revision: current.revision + 1 };
                if (name === 'tasks') { next.records = next.records.map(task => ({ ...task, version: this.id() })); next.receipts = [...current.receipts, this.id()].slice(-128); }
                if (name === 'focus') { next.session = focus.initial().session; next.session.remainingMs = next.durations.focus * 60000; }
                api.validate(next); written[api.KEY] = next;
            }
            return written;
        }
        workspaceReplacement(ticket, snapshot) {
            const next = clone(snapshot), names = ticket.names, oldBundles = new Map(snapshot.bundles.map(bundle => [bundle.id, bundle]));
            if (ticket.file.schemaVersion === 1) {
                const target = next.bundles.find(bundle => bundle.id === ticket.targetWorkspaceId);
                check(target && next.registry.workspaces.some(entry => entry.id === target.id && entry.deletedAt === null), 'TARGET');
                target.values = this.restoredWorkspaceValues(ticket.file.modules, names, target.values);
                return next;
            }
            const incoming = ticket.file, incomingBundles = new Map([...incoming.workspaces, ...incoming.trash].map(bundle => [bundle.id, bundle]));
            if (names.length === MODULES.length) {
                const live = incoming.registry.entries.map((entry, order) => ({ ...entry, order, deletedAt: null }));
                const trash = incoming.trash.map((entry, index) => ({ id: entry.id, name: entry.name, createdAt: entry.createdAt, updatedAt: entry.updatedAt, deletedAt: entry.deletedAt, order: live.length + index }));
                next.registry.workspaces = [...live, ...trash].map(entry => ({ ...entry, generation: oldBundles.get(entry.id)?.generation || this.id() }));
                next.registry.lastUsedId = incoming.registry.lastUsedId;
                next.bundles = next.registry.workspaces.map(entry => ({ id: entry.id, generation: entry.generation, values: this.restoredWorkspaceValues(incomingBundles.get(entry.id).modules, names, oldBundles.get(entry.id)?.values || {}) }));
            } else {
                // Partial archives cannot create/delete/rename workspaces or
                // resurrect trash. Only matching identities receive selected data.
                for (const bundle of next.bundles) bundle.values = this.restoredWorkspaceValues(incomingBundles.get(bundle.id).modules, names, bundle.values);
            }
            return next;
        }
        workspaceRestore(ticket, isCurrent) {
            return this.workspaces.withSnapshotLock(async tx => {
                check(isCurrent(), 'CANCELLED');
                const snapshot = await this.workspaceRead(tx); check(same(snapshot, ticket.snapshot), 'CONFLICT');
                if (ticket.names.includes('focus')) {
                    const affected = snapshot.bundles.filter(bundle => !ticket.targetWorkspaceId || bundle.id === ticket.targetWorkspaceId);
                    check(!affected.some(bundle => ['running', 'paused', 'uncertain'].includes(bundle.values[focus.KEY]?.session?.status)), 'FOCUS_ACTIVE');
                }
                const replacement = this.workspaceReplacement(ticket, snapshot);
                const source = this.workspaceSnapshot(snapshot).source, recovery = { source, checksum: await this.manager.fingerprint(source) };
                check(isCurrent(), 'CANCELLED');
                try {
                    check(await this.backend.write({ [WORKSPACE_RECOVERY_KEY]: recovery }) !== false, 'RECOVERY');
                    check(same(await this.backend.readRecovery(WORKSPACE_RECOVERY_KEY), recovery), 'RECOVERY');
                } catch (_) { throw fault('RECOVERY'); }
                check(isCurrent(), 'CANCELLED');
                check(same(await this.workspaceRead(tx), snapshot), 'CONFLICT'); check(isCurrent(), 'CANCELLED');
                // The workspace service stages+verifies every replacement bundle
                // before its one registry authority switch. Old generations remain
                // recoverable; an unacknowledged switch is never retried here.
                try { await tx.replace(replacement, { isCurrent, blockDefaultSync: ticket.names.includes('config') && (!ticket.targetWorkspaceId || ticket.targetWorkspaceId === 'default') }); }
                catch (error) {
                    if (['WORKSPACE_CANCELED', 'WORKSPACE_CANCELLED'].includes(error.code)) throw fault('CANCELLED');
                    if (error.code === 'WORKSPACE_CONFLICT') throw fault('CONFLICT');
                    const uncertain = fault('UNCONFIRMED'); uncertain.mayHaveCommitted = true; uncertain.cause = error; throw uncertain;
                }
                this.manager.cancelSyncPush();
                return { changed: true, selected: [...ticket.names], recoveryAvailable: true, targetWorkspaceId: ticket.targetWorkspaceId || null };
            });
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
            if (this.workspaces) return this.workspaceExport(names);
            // An explicit partial export depends only on selected saved modules.
            // Configuration still includes its schema/generation safety checks,
            // but provider state and unselected personal content are not read.
            const keys = names.flatMap(name => name === 'config'
                ? [...Object.keys(this.manager.defaultConfig).filter(key => key !== 'sync'), 'schemaVersion', this.manager.layoutGenerationKey, this.manager.settingsGenerationKey]
                : [apis[name].KEY]);
            return this.backend.lock(async () => this.snapshot(await this.raw(keys), names).source);
        }
        review(source, selected = null, options = {}) {
            let cached = parsedFiles.get(this);
            if (!cached || cached.source !== source) {
                cached = { source, file: parse(source, this.manager) };
                parsedFiles.set(this, cached);
            }
            const file = cached.file, available = file.schemaVersion === 2 ? file.modules : Object.keys(file.modules), names = selection(selected || available, available);
            if (this.workspaces) return this.workspaceReview(file, names, options);
            check(file.schemaVersion === 1, 'UNAVAILABLE');
            return this.backend.lock(async () => {
                const raw = await this.raw(), current = this.snapshot(raw);
                const preview = { modules: Object.keys(file.modules), selected: [...names], exportedAt: file.exportedAt, incoming: this.counts(file.modules), current: this.counts(current.file.modules) };
                preview.current.focus.activeSession = ['running', 'paused', 'uncertain'].includes(raw[focus.KEY]?.session?.status);
                this.tickets.set(preview, { file, names, raw }); return preview;
            });
        }
        async recovery() {
            let saved; try {
                saved = await this.backend.readRecovery(this.workspaces ? WORKSPACE_RECOVERY_KEY : RECOVERY_KEY);
                if (saved === undefined && this.workspaces) saved = await this.backend.readRecovery(RECOVERY_KEY);
            } catch (_) { throw fault('RECOVERY'); }
            try { saved = boundedCopy(saved, LIMITS.bytes + 1024); } catch (_) { throw fault('RECOVERY'); }
            object(saved, ['source', 'checksum']);
            check(typeof saved.source === 'string' && saved.source.length <= LIMITS.bytes && bytes(saved.source) <= LIMITS.bytes && typeof saved.checksum === 'string' && /^[a-f0-9]{64}$/.test(saved.checksum), 'RECOVERY');
            check(await this.manager.fingerprint(saved.source) === saved.checksum, 'RECOVERY');
            const file = parse(saved.source, this.manager); check(MODULES.every(name => file.schemaVersion === 2 ? file.modules.includes(name) : Object.hasOwn(file.modules, name)), 'RECOVERY');
            return saved.source;
        }
        restore(preview, { confirmed = false, isCurrent = () => true } = {}) {
            check(confirmed === true, 'CONFIRMATION');
            const ticket = this.tickets.get(preview); check(ticket, 'CONFLICT');
            // Consume before awaiting; retries always require a new review.
            this.tickets.delete(preview);
            if (ticket.workspace) return this.workspaceRestore(ticket, isCurrent);
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
    return { FORMAT, MODULES, LIMITS, RECOVERY_KEY, WORKSPACE_RECOVERY_KEY, Store, createBackend, parse, fault };
});
