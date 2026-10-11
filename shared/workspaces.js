/* Device-local workspaces. No network, provider initialization or credentials. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else {
        root.LocalItabWorkspaces = api;
        api.manager = api.createManager();
        let requestedId;
        try { requestedId = new URL(root.location.href).searchParams.get('workspace') || undefined; } catch (_) {}
        api.session = api.manager.capture(requestedId);
    }
})(typeof window === 'undefined' ? globalThis : window, function (root) {
    'use strict';
    const REGISTRY_KEY = '__localItabWorkspaceRegistryV1';
    const ACTIVATION_KEY = '__localItabWorkspaceActivationV1';
    const SNAPSHOT_KEY = '__localItabWorkspacePreMigrationV1';
    const STAGE_KEY = '__localItabWorkspaceStageV1';
    const RECOVERY_KEY = '__localItabWorkspaceRecoveryV1';
    const LEGACY_CONFLICT_KEY = '__localItabWorkspaceLegacyConflictV1';
    const LEGACY_RECOVERY_PREFIX = '__localItabWorkspaceLegacyRecoveryV1:';
    const reviewedLegacyConflicts = new WeakMap();
    const PREFIX = '__localItabWorkspaceV1:';
    const LOCK = 'local-itab-workspaces-v1';
    const DEFAULT_ID = 'default';
    const CONFIG_KEYS = Object.freeze(['clock', 'search', 'bg', 'themePreset', 'appearance', 'show', 'categories', 'links', 'weather', 'hot', 'movie', 'quote', 'layout', 'ui']);
    const PERSONAL_KEYS = Object.freeze(['__localItabPersonalTasksV1', '__localItabFocusV1', '__localItabScratchpadV1', '__localItabCountdownV1']);
    const SCOPED_KEYS = Object.freeze([...CONFIG_KEYS, ...PERSONAL_KEYS, 'schemaVersion', '__localItabLayoutGeneration', '__localItabSettingsGeneration', '__localItabIdentityRecovery', '__localItabRestoreRecovery', '__localItabCompleteRecoveryV1']);
    const GLOBAL_KEYS = Object.freeze(['privacy', 'sync', '__localItabSyncIdentityState']);
    const scoped = key => SCOPED_KEYS.includes(key);
    const own = (value, key) => Object.hasOwn(value, key);
    const same = (a, b) => a === b || Boolean(a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => own(b, key) && same(a[key], b[key])));
    function fault(code) { const error = new Error(`Local workspaces: ${code}`); error.code = `WORKSPACE_${code}`; return error; }
    function check(value, code = 'INVALID') { if (!value) throw fault(code); }
    function object(value) { check(value && typeof value === 'object' && !Array.isArray(value)); return value; }
    // Reject values JSON would silently drop/change and never invoke accessors.
    function copy(value, depth = 0, seen = new Set(), budget = { nodes: 0, chars: 0 }) {
        check(++budget.nodes <= 500000 && depth <= 40, 'SIZE_LIMIT');
        if (typeof value === 'string') { budget.chars += value.length; check(budget.chars <= 128 * 1024 * 1024, 'SIZE_LIMIT'); return value; }
        if (value === null || typeof value === 'boolean') return value;
        if (typeof value === 'number') { check(Number.isFinite(value)); return value; }
        check(value && typeof value === 'object' && !seen.has(value));
        const proto = Object.getPrototypeOf(value);
        check(Array.isArray(value) || proto === null || Object.getPrototypeOf(proto) === null);
        seen.add(value); const result = Array.isArray(value) ? [] : {};
        check(Object.keys(value).length <= 250000, 'SIZE_LIMIT');
        for (const key of Object.keys(value)) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key);
            check(descriptor && own(descriptor, 'value'));
            Object.defineProperty(result, key, { value: copy(descriptor.value, depth + 1, seen, budget), enumerable: true, writable: true, configurable: true });
        }
        if (Array.isArray(value)) check(result.length === value.length && Object.keys(result).length === value.length);
        seen.delete(value); return result;
    }
    const token = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
    const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
    function name(value) { check(typeof value === 'string' && value.trim().length > 0 && Array.from(value.trim()).length <= 80 && !/[\u0000-\u001f\u007f]/.test(value), 'NAME'); return value.trim(); }
    function validateRegistry(input) {
        const value = object(copy(input));
        check(Object.keys(value).length === 6 && ['schemaVersion', 'revision', 'defaultId', 'lastUsedId', 'migrationId', 'workspaces'].every(key => own(value, key)));
        check(value.schemaVersion === 1, 'VERSION');
        check(Number.isSafeInteger(value.revision) && value.revision >= 0 && value.defaultId === DEFAULT_ID && token(value.lastUsedId) && token(value.migrationId));
        check(Array.isArray(value.workspaces) && value.workspaces.length > 0 && value.workspaces.length <= 100, 'CAPACITY');
        const ids = new Set(), orders = new Set();
        for (const entry of value.workspaces) {
            object(entry); check(Object.keys(entry).length === 7 && ['id', 'name', 'order', 'generation', 'createdAt', 'updatedAt', 'deletedAt'].every(key => own(entry, key))); check(token(entry.id) && token(entry.generation) && !ids.has(entry.id));
            check(name(entry.name) === entry.name && Number.isSafeInteger(entry.order) && entry.order >= 0 && !orders.has(entry.order));
            check(date(entry.createdAt) && date(entry.updatedAt) && (entry.deletedAt === null || date(entry.deletedAt)));
            ids.add(entry.id); orders.add(entry.order);
        }
        check(value.workspaces.some(entry => entry.id === DEFAULT_ID && entry.deletedAt === null));
        check(value.workspaces.some(entry => entry.id === value.lastUsedId && entry.deletedAt === null));
        return value;
    }
    const bundleKey = entry => `${PREFIX}${entry.id}:${entry.generation}`;
    function validateValues(input) {
        const values = object(copy(input));
        check(Object.keys(values).every(scoped), 'BOUNDARY');
        return values;
    }
    class Manager {
        constructor({ chrome = root.chrome, locks = root.navigator?.locks, now = () => new Date().toISOString(), id = () => root.crypto.randomUUID(), validate } = {}) {
            this.chrome = chrome; this.locks = locks; this.now = now; this.id = id; this.validate = validate || null;
            this._ready = null; this._listeners = new Set(); this._activated = false; this._legacyConflict = false; this._legacyPending = null;
            chrome?.storage?.onChanged?.addListener((changes, area) => {
                if (area !== 'local') return;
                if (own(changes, LEGACY_CONFLICT_KEY)) {
                    if (changes[LEGACY_CONFLICT_KEY].newValue && !changes[LEGACY_CONFLICT_KEY].newValue.resolvedAt) this.signalLegacyConflict();
                    else this._legacyConflict = false;
                }
                const legacyKeys = Object.keys(changes).filter(scoped);
                if (this._activated && legacyKeys.length) {
                    this.signalLegacyConflict();
                    if (!this._legacyPending) {
                        this._legacyPending = this.locks.request(LOCK, { mode: 'exclusive' }, () => this.persistLegacyConflict(legacyKeys));
                        this._legacyPending.catch(() => { this.signalLegacyConflict(); }).finally(() => { this._legacyPending = null; });
                    }
                }
                if (!own(changes, REGISTRY_KEY)) return;
                let registry;
                try { registry = validateRegistry(changes[REGISTRY_KEY].newValue); } catch (error) { registry = { error }; }
                this._knownRegistry = registry.error ? null : copy(registry);
                for (const listener of this._listeners) { try { listener(registry); } catch (_) {} }
            });
        }
        signalLegacyConflict() {
            this._legacyConflict = true;
            for (const listener of this._listeners) { try { listener({ error: fault('LEGACY_CONFLICT') }); } catch (_) {} }
        }
        async persistLegacyConflict(keys) {
            const old = (await this.get([LEGACY_CONFLICT_KEY]))[LEGACY_CONFLICT_KEY];
            const pending = old && !old.resolvedAt ? old : null;
            const value = { schemaVersion: 1, id: pending?.id || this.id(), detectedAt: pending?.detectedAt || this.now(), keys: [...new Set([...(pending?.keys || []), ...keys])].filter(scoped).sort() };
            await this.verifiedSet({ [LEGACY_CONFLICT_KEY]: value }); this.signalLegacyConflict();
        }
        async checkLegacySource() {
            const raw = await this.get([SNAPSHOT_KEY, LEGACY_CONFLICT_KEY, ...SCOPED_KEYS]);
            if (raw[LEGACY_CONFLICT_KEY] && !raw[LEGACY_CONFLICT_KEY].resolvedAt) { this.signalLegacyConflict(); throw fault('LEGACY_CONFLICT'); }
            const snapshot = raw[SNAPSHOT_KEY]; check(snapshot?.schemaVersion === 1 && snapshot.values, 'MIGRATION_INCOMPLETE');
            const baseline = raw[LEGACY_CONFLICT_KEY]?.resolvedAt ? raw[LEGACY_CONFLICT_KEY].baseline : snapshot.values;
            object(baseline);
            const changed = SCOPED_KEYS.filter(key => own(raw, key) !== own(baseline, key) || !same(raw[key], baseline[key]));
            if (changed.length) { await this.persistLegacyConflict(changed); throw fault('LEGACY_CONFLICT'); }
        }
        async readLegacyConflictRecovery() {
            const raw = await this.get([REGISTRY_KEY, ACTIVATION_KEY, LEGACY_CONFLICT_KEY, ...SCOPED_KEYS]);
            const registry = validateRegistry(raw[REGISTRY_KEY]); this.validateActivation(raw[ACTIVATION_KEY], registry);
            check(raw[LEGACY_CONFLICT_KEY] && !raw[LEGACY_CONFLICT_KEY].resolvedAt, 'NO_CONFLICT');
            return { format: 'local-itab-workspace-conflict-recovery', schemaVersion: 1, exportedAt: this.now(), conflict: copy(raw[LEGACY_CONFLICT_KEY]),
                legacy: Object.fromEntries(Object.entries(raw).filter(([key]) => scoped(key))), workspaces: await this.readSnapshot(registry) };
        }
        async exportLegacyConflictRecovery() {
            this.available();
            return this.locks.request(LOCK, { mode: 'exclusive' }, async () => {
                const recovery = await this.readLegacyConflictRecovery();
                const portable = values => Object.fromEntries(Object.entries(values).filter(([key]) => [...CONFIG_KEYS, ...PERSONAL_KEYS, 'schemaVersion'].includes(key)));
                // Internal recovery records may contain provider bookkeeping.
                // Preserve those on-device but never include them in downloads.
                recovery.legacy = portable(recovery.legacy);
                recovery.workspaces.bundles = recovery.workspaces.bundles.map(bundle => ({ ...bundle, values: portable(bundle.values) }));
                return recovery;
            });
        }
        async reviewLegacyConflict() {
            const snapshot = await this.locks.request(LOCK, { mode: 'exclusive' }, () => this.readLegacyConflictRecovery());
            const count = values => ({ sites: Array.isArray(values.links) ? values.links.length : 0,
                tasks: Array.isArray(values['__localItabPersonalTasksV1']?.records) ? values['__localItabPersonalTasksV1'].records.length : 0,
                scratchpadCharacters: typeof values['__localItabScratchpadV1']?.content === 'string' ? Array.from(values['__localItabScratchpadV1'].content).length : 0 });
            const workspaces = { count: snapshot.workspaces.registry.workspaces.filter(entry => entry.deletedAt === null).length,
                trash: snapshot.workspaces.registry.workspaces.filter(entry => entry.deletedAt !== null).length, sites: 0, tasks: 0, scratchpadCharacters: 0 };
            for (const bundle of snapshot.workspaces.bundles) { const counts = count(bundle.values); for (const key of Object.keys(counts)) workspaces[key] += counts[key]; }
            const review = Object.freeze({ id: snapshot.conflict.id, detectedAt: snapshot.conflict.detectedAt, legacy: Object.freeze(count(snapshot.legacy)), workspaces: Object.freeze(workspaces) });
            reviewedLegacyConflicts.set(review, { owner: this, snapshot }); return review;
        }
        async resolveLegacyConflict(review, { confirmed = false } = {}) {
            const reviewed = reviewedLegacyConflicts.get(review); check(confirmed && reviewed?.owner === this, 'REVIEW_REQUIRED');
            return this.locks.request(LOCK, { mode: 'exclusive' }, async () => {
                const comparable = value => { const result = copy(value); delete result.exportedAt; return result; };
                const current = await this.readLegacyConflictRecovery();
                check(same(comparable(current), comparable(reviewed.snapshot)), 'CONFLICT');
                const recoveryKey = `${LEGACY_RECOVERY_PREFIX}${this.id()}`;
                await this.verifiedSet({ [recoveryKey]: { schemaVersion: 1, createdAt: this.now(), recovery: current } });
                check(same(comparable(await this.readLegacyConflictRecovery()), comparable(current)), 'CONFLICT');
                const resolved = { ...current.conflict, resolvedAt: this.now(), baseline: current.legacy, recoveryKey };
                await this.verifiedSet({ [LEGACY_CONFLICT_KEY]: resolved });
                this._legacyConflict = false;
                try { await this.checkLegacySource(); }
                catch (error) { this.signalLegacyConflict(); throw error; }
                reviewedLegacyConflicts.delete(review); this._ready = null;
                return { resolved: true, reloadRequired: true };
            });
        }
        configureValidation(validate) { this.validate = validate; }
        available() { check(this.chrome?.storage?.local && this.locks?.request, 'UNAVAILABLE'); }
        async get(keys) {
            this.available();
            try { const result = await this.chrome.storage.local.get(keys); return object(copy(result)); }
            catch (error) { if (error.code?.startsWith('WORKSPACE_')) throw error; throw fault('READ'); }
        }
        async verifiedSet(values) {
            try { check((await this.chrome.storage.local.set(copy(values))) !== false, 'WRITE'); }
            catch (error) { if (error.code?.startsWith('WORKSPACE_')) throw error; throw fault('WRITE'); }
            const readback = await this.get(Object.keys(values));
            check(Object.keys(values).every(key => own(readback, key) && same(values[key], readback[key])), 'VERIFY');
        }
        legacyLock(fn) { return this.locks.request('local-itab-personal-tasks-v1', { mode: 'exclusive' }, () => this.locks.request('local-itab-focus-v1', { mode: 'exclusive' }, () => this.locks.request('local-itab-local-write', { mode: 'exclusive' }, fn))); }
        ready() {
            if (!this._ready) this._ready = this.initialize().catch(error => { this._ready = null; throw error; });
            return this._ready.then(async () => { this._activated = true; return this.registry(); });
        }
        async initialize() {
            this.available();
            return this.locks.request(LOCK, { mode: 'exclusive' }, () => this.legacyLock(async () => {
                const metadata = await this.get([REGISTRY_KEY, ACTIVATION_KEY]);
                if (own(metadata, REGISTRY_KEY) && own(metadata, ACTIVATION_KEY)) {
                    const registry = validateRegistry(metadata[REGISTRY_KEY]); this.validateActivation(metadata[ACTIVATION_KEY], registry);
                    await this.checkLegacySource(); await this.readSnapshot(registry); return registry;
                }
                const raw = await this.get(null);
                // An interrupted activation is resumable only from its verified stage.
                if (own(raw, REGISTRY_KEY) || own(raw, ACTIVATION_KEY) || own(raw, STAGE_KEY) || own(raw, SNAPSHOT_KEY)) {
                    check(own(raw, SNAPSHOT_KEY), 'MIGRATION_INCOMPLETE');
                    const snapshot = object(raw[SNAPSHOT_KEY]);
                    if (!own(raw, STAGE_KEY)) {
                        check(!own(raw, REGISTRY_KEY) && !own(raw, ACTIVATION_KEY) && snapshot.schemaVersion === 1 && token(snapshot.id) && date(snapshot.createdAt), 'MIGRATION_INCOMPLETE');
                        check(same(this.legacySource(raw), snapshot.values), 'MIGRATION_CHANGED');
                        const values = Object.fromEntries(Object.entries(snapshot.values).filter(([key]) => scoped(key)));
                        await this.validateBundle(values, snapshot.values);
                        const entry = { id: DEFAULT_ID, name: 'Default', order: 0, generation: this.id(), createdAt: snapshot.createdAt, updatedAt: snapshot.createdAt, deletedAt: null };
                        const registry = validateRegistry({ schemaVersion: 1, revision: 0, defaultId: DEFAULT_ID, lastUsedId: DEFAULT_ID, migrationId: snapshot.id, workspaces: [entry] });
                        await this.writeBundle(entry, values);
                        await this.verifiedSet({ [STAGE_KEY]: { schemaVersion: 1, migrationId: snapshot.id, registry, snapshotId: snapshot.id } });
                        check(same(this.legacySource(await this.get(null)), snapshot.values), 'MIGRATION_CHANGED');
                        await this.verifiedSet({ [REGISTRY_KEY]: registry });
                        await this.verifiedSet({ [ACTIVATION_KEY]: this.activation(registry) });
                        return registry;
                    }
                    const stage = object(raw[STAGE_KEY]);
                    const registry = validateRegistry(stage.registry);
                    check(stage.schemaVersion === 1 && snapshot.schemaVersion === 1 && stage.migrationId === registry.migrationId && snapshot.id === registry.migrationId, 'MIGRATION_INCOMPLETE');
                    check(stage.snapshotId === snapshot.id, 'MIGRATION_INCOMPLETE');
                    const source = this.legacySource(raw);
                    check(same(source, snapshot.values), 'MIGRATION_CHANGED');
                    if (own(raw, REGISTRY_KEY)) check(same(raw[REGISTRY_KEY], registry), 'MIGRATION_INCOMPLETE');
                    await this.readSnapshot(registry);
                    if (!own(raw, REGISTRY_KEY)) await this.verifiedSet({ [REGISTRY_KEY]: registry });
                    await this.verifiedSet({ [ACTIVATION_KEY]: this.activation(registry) });
                    return registry;
                }
                const source = this.legacySource(raw), values = Object.fromEntries(Object.entries(source).filter(([key]) => scoped(key)));
                await this.validateBundle(values, source);
                const timestamp = this.now(), generation = this.id(), migrationId = this.id();
                const entry = { id: DEFAULT_ID, name: 'Default', order: 0, generation, createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
                const registry = validateRegistry({ schemaVersion: 1, revision: 0, defaultId: DEFAULT_ID, lastUsedId: DEFAULT_ID, migrationId, workspaces: [entry] });
                const snapshot = { schemaVersion: 1, id: migrationId, createdAt: timestamp, values: source };
                // Keep a complete readback-verified original, including unknown keys.
                // These writes are staged and recoverable, not a crash-atomic transaction.
                await this.verifiedSet({ [SNAPSHOT_KEY]: snapshot });
                await this.writeBundle(entry, values);
                await this.verifiedSet({ [STAGE_KEY]: { schemaVersion: 1, migrationId, registry, snapshotId: migrationId } });
                check(same(this.legacySource(await this.get(null)), source), 'MIGRATION_CHANGED');
                await this.verifiedSet({ [REGISTRY_KEY]: registry });
                await this.verifiedSet({ [ACTIVATION_KEY]: this.activation(registry) });
                return registry;
            }));
        }
        legacySource(raw) { return Object.fromEntries(Object.entries(raw).filter(([key]) => ![REGISTRY_KEY, ACTIVATION_KEY, SNAPSHOT_KEY, STAGE_KEY, RECOVERY_KEY, LEGACY_CONFLICT_KEY].includes(key) && !key.startsWith(PREFIX))); }
        activation(registry) { return { schemaVersion: 1, migrationId: registry.migrationId, defaultId: registry.defaultId }; }
        validateActivation(marker, registry) { check(same(marker, this.activation(registry)), 'ACTIVATION'); }
        async registry() {
            check(!this._legacyConflict, 'LEGACY_CONFLICT');
            const raw = await this.get([REGISTRY_KEY, ACTIVATION_KEY, LEGACY_CONFLICT_KEY]);
            if (raw[LEGACY_CONFLICT_KEY] && !raw[LEGACY_CONFLICT_KEY].resolvedAt) { this.signalLegacyConflict(); throw fault('LEGACY_CONFLICT'); }
            const registry = validateRegistry(raw[REGISTRY_KEY]); this.validateActivation(raw[ACTIVATION_KEY], registry); this._knownRegistry = copy(registry); return registry;
        }
        async validateBundle(values, globals = {}) {
            validateValues(values);
            try {
                if (this.validate) await this.validate(copy(values), copy(globals));
                else {
                    const validator = typeof module === 'object' && module.exports ? new (require('../storage.js'))() : root.storageManager;
                    check(validator?.validateWorkspaceValues, 'VALIDATOR_UNAVAILABLE');
                    validator.validateWorkspaceValues(copy(values), copy(globals));
                }
            } catch (error) { if (error.code?.startsWith('WORKSPACE_')) throw error; throw fault('CORRUPT'); }
        }
        async readBundle(entry) {
            const key = bundleKey(entry), raw = await this.get([key]), bundle = raw[key];
            check(bundle && Object.keys(bundle).length === 4 && ['schemaVersion', 'id', 'generation', 'values'].every(key => own(bundle, key)) && bundle.schemaVersion === 1 && bundle.id === entry.id && bundle.generation === entry.generation, 'BUNDLE_MISSING');
            return validateValues(bundle.values);
        }
        async writeBundle(entry, values) {
            await this.validateBundle(values);
            await this.verifiedSet({ [bundleKey(entry)]: { schemaVersion: 1, id: entry.id, generation: entry.generation, values: copy(values) } });
        }
        async readSnapshot(registry, keys = null) {
            const bundles = [];
            for (const entry of registry.workspaces) {
                let values = await this.readBundle(entry);
                if (keys !== null) { check(Array.isArray(keys) && keys.every(scoped), 'BOUNDARY'); values = Object.fromEntries(Object.entries(values).filter(([key]) => keys.includes(key))); }
                bundles.push({ id: entry.id, generation: entry.generation, values });
            }
            return { registry: copy(registry), bundles };
        }
        capture(id) { return new Session(this, id === undefined ? this._knownRegistry?.lastUsedId : id); }
        subscribe(listener) { this._listeners.add(listener); return () => this._listeners.delete(listener); }
        async list() { await this.ready(); return this.locks.request(LOCK, { mode: 'shared' }, async () => { const registry = await this.registry(); await this.readSnapshot(registry); return registry; }); }
        async transaction(action, options = {}) {
            const expectedRevision = options.expectedRevision;
            await this.ready();
            return this.locks.request(LOCK, { mode: 'exclusive' }, async () => {
                const registry = await this.registry();
                if (expectedRevision !== undefined) check(expectedRevision === registry.revision, 'CONFLICT');
                return action(registry);
            });
        }
        async commit(registry) { const checked = validateRegistry(registry); await this.verifiedSet({ [REGISTRY_KEY]: checked }); this._knownRegistry = copy(checked); return copy(checked); }
        async change(id, action, options) {
            return this.transaction(async registry => {
                const entry = registry.workspaces.find(entry => entry.id === id); check(entry, 'NOT_FOUND');
                await action(entry, registry); registry.revision++; entry.updatedAt = this.now(); await this.commit(registry); return copy(entry);
            }, options);
        }
        async create(label, options = {}) {
            const labelCopy = name(label);
            return this.transaction(async registry => {
                check(registry.workspaces.length < 100, 'CAPACITY');
                const now = this.now(), entry = { id: this.id(), generation: this.id(), name: labelCopy, order: Math.max(...registry.workspaces.map(entry => entry.order)) + 1, createdAt: now, updatedAt: now, deletedAt: null };
                check(!registry.workspaces.some(item => item.id === entry.id), 'CONFLICT');
                await this.writeBundle(entry, {}); registry.workspaces.push(entry); registry.revision++; await this.commit(registry); return copy(entry);
            }, options);
        }
        async rename(id, label, options = {}) { const next = name(label); return this.change(id, entry => { check(entry.deletedAt === null, 'DELETED'); entry.name = next; }, options); }
        async duplicate(id, label, options = {}) {
            const next = name(label);
            return this.transaction(async registry => {
                check(registry.workspaces.length < 100, 'CAPACITY');
                const source = registry.workspaces.find(entry => entry.id === id && entry.deletedAt === null); check(source, 'NOT_FOUND');
                const values = await this.readBundle(source); await this.validateBundle(values); this.resetTimer(values);
                const now = this.now(), entry = { id: this.id(), generation: this.id(), name: next, order: Math.max(...registry.workspaces.map(entry => entry.order)) + 1, createdAt: now, updatedAt: now, deletedAt: null };
                check(!registry.workspaces.some(item => item.id === entry.id), 'CONFLICT');
                await this.writeBundle(entry, values); registry.workspaces.push(entry); registry.revision++; await this.commit(registry); return copy(entry);
            }, options);
        }
        resetTimer(values) {
            const focus = values['__localItabFocusV1'];
            if (focus) { focus.revision++; focus.session = { id: null, phase: 'focus', status: 'ready', remainingMs: focus.durations.focus * 60000, startedAt: null, deadline: null }; }
        }
        async trash(id, options = {}) {
            check(id !== DEFAULT_ID, 'DEFAULT_PROTECTED');
            return this.change(id, async (entry, registry) => {
                check(entry.deletedAt === null, 'DELETED');
                const values = await this.readBundle(entry); await this.validateBundle(values);
                const focus = values['__localItabFocusV1'];
                if (focus?.session.status === 'running') {
                    const now = Date.parse(this.now()), session = focus.session;
                    check(Number.isSafeInteger(now) && now >= session.startedAt, 'CLOCK');
                    session.remainingMs = Math.max(0, Math.min(session.remainingMs, session.deadline - now));
                    session.status = session.remainingMs === 0 ? 'completed' : 'paused'; session.startedAt = null; session.deadline = null; focus.revision++;
                    entry.generation = this.id(); await this.writeBundle(entry, values);
                }
                entry.deletedAt = this.now(); if (registry.lastUsedId === id) registry.lastUsedId = DEFAULT_ID;
            }, options);
        }
        restore(id, options = {}) {
            return this.change(id, async entry => {
                check(entry.deletedAt !== null, 'NOT_DELETED'); const values = await this.readBundle(entry); await this.validateBundle(values);
                check(values['__localItabFocusV1']?.session.status !== 'running', 'TIMER_REVIEW');
                entry.generation = this.id(); entry.deletedAt = null; await this.writeBundle(entry, values);
            }, options);
        }
        select(id, options = {}) { return this.change(id, (entry, registry) => { check(entry.deletedAt === null, 'DELETED'); registry.lastUsedId = entry.id; }, options); }
        async exportSnapshot(keys = null) { return this.transaction(registry => this.readSnapshot(registry, keys)); }
        async replaceSnapshot(snapshot, options = {}) { const input = copy(snapshot); return this.transaction(registry => this.replaceLocked(registry, input, options), options); }
        async withSnapshotLock(action) { return this.transaction(registry => action({ registry: copy(registry), snapshot: keys => this.readSnapshot(registry, keys ?? null), replace: (snapshot, options = {}) => this.replaceLocked(registry, copy(snapshot), options) })); }
        async replaceLocked(current, input, options = {}) {
            object(input); const incoming = validateRegistry(input.registry);
            check(Array.isArray(input.bundles) && input.bundles.length === incoming.workspaces.length);
            const seen = new Set();
            for (const bundle of input.bundles) { object(bundle); const entry = incoming.workspaces.find(item => item.id === bundle.id); check(entry && bundle.generation === entry.generation && !seen.has(bundle.id)); seen.add(bundle.id); await this.validateBundle(bundle.values); }
            const prior = await this.readSnapshot(current);
            await this.verifiedSet({ [RECOVERY_KEY]: { schemaVersion: 1, createdAt: this.now(), snapshot: prior } });
            for (const entry of incoming.workspaces) {
                const values = copy(input.bundles.find(bundle => bundle.id === entry.id).values);
                const previous = current.workspaces.find(item => item.id === entry.id);
                const previousValues = prior.bundles.find(bundle => bundle.id === entry.id)?.values;
                if (previous && previous.deletedAt === entry.deletedAt && same(previousValues, values)) entry.generation = previous.generation;
                else { entry.generation = this.id(); entry.updatedAt = this.now(); await this.writeBundle(entry, values); }
            }
            incoming.migrationId = current.migrationId; incoming.revision = current.revision + 1;
            check(same(await this.readSnapshot(await this.registry()), prior), 'CONFLICT');
            check(!options.isCurrent || options.isCurrent(), 'CANCELED');
            const priorDefault = prior.bundles.find(bundle => bundle.id === DEFAULT_ID).values;
            const nextDefault = input.bundles.find(bundle => bundle.id === DEFAULT_ID).values;
            const configChanged = CONFIG_KEYS.some(key => !same(priorDefault[key], nextDefault[key]));
            if (options.blockDefaultSync || configChanged) {
                const globals = await this.get(['sync', '__localItabSyncIdentityState']);
                if (globals.sync?.enabled) await this.verifiedSet({ __localItabSyncIdentityState: {
                    ...(globals.__localItabSyncIdentityState || {}),
                    blocked: { kind: 'restore', reason: 'Default workspace was restored locally. Review compatible cloud data before resuming Sync.' }
                } });
                // A canceled or uncertain restore may leave Sync safely paused,
                // never activate unchecked data or resume an old cloud copy.
                check(same(await this.readSnapshot(await this.registry()), prior), 'CONFLICT');
                check(!options.isCurrent || options.isCurrent(), 'CANCELED');
            }
            return this.commit(incoming);
        }
    }
    class Session {
        constructor(manager, requestedId) {
            check(requestedId === undefined || token(requestedId), 'NOT_FOUND');
            this.manager = manager; this._identity = null; this.invalidated = false;
            Object.defineProperties(this, {
                requestedId: { value: requestedId, enumerable: true },
                id: { get: () => this._identity?.id || null, enumerable: true },
                generation: { get: () => this._identity?.generation || null, enumerable: true }
            });
            this._ready = null; this._suspended = false; this._pending = new Set(); this._listeners = new Set();
            // One origin write lock also serializes device-global privacy fields
            // edited from two different workspaces; lifecycle holds stay shared.
            this.lockedLocal = Object.freeze({ get: keys => this.get(keys), set: values => this.set(values), remove: keys => this.remove(keys), getBytesInUse: keys => manager.chrome.storage.local.getBytesInUse(keys), get QUOTA_BYTES() { return manager.chrome?.storage?.local?.QUOTA_BYTES; } });
            this.local = Object.freeze({ ...this.lockedLocal,
                set: values => { const captured = copy(values); return this.withLock(() => this.set(captured)); },
                remove: keys => { const captured = copy(keys); return this.withLock(() => this.remove(captured)); }
            });
            manager.subscribe(registry => { if (!this.id) return; const entry = registry.workspaces?.find(item => item.id === this.id); if (registry.error || !entry || entry.deletedAt !== null || entry.generation !== this.generation) this.invalidated = true; });
            manager.chrome?.storage?.onChanged?.addListener((changes, area) => {
                if (area !== 'local' || !this.id || this.invalidated) return;
                const decoded = {}, entry = changes[bundleKey(this)];
                if (entry) {
                    const before = entry.oldValue?.values || {}, after = entry.newValue?.values || {};
                    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) if (!same(before[key], after[key])) decoded[key] = { oldValue: before[key], newValue: after[key] };
                }
                for (const key of GLOBAL_KEYS) if (own(changes, key)) decoded[key] = changes[key];
                if (Object.keys(decoded).length) for (const listener of this._listeners) { try { listener(decoded, 'local'); } catch (_) {} }
            });
        }
        ready() {
            if (!this._ready) this._ready = (async () => {
                await this.manager.ready(); const registry = await this.manager.registry();
                const wanted = this.requestedId === undefined ? registry.lastUsedId : this.requestedId;
                const entry = registry.workspaces.find(item => item.id === wanted); check(entry, 'NOT_FOUND'); check(entry.deletedAt === null, 'DELETED');
                await this.manager.readBundle(entry); this._identity = Object.freeze({ id: entry.id, generation: entry.generation });
                return this._identity;
            })();
            return this._ready.then(copy);
        }
        async assertActive() {
            await this.ready(); check(!this.invalidated, 'INVALIDATED'); const registry = await this.manager.registry();
            const entry = registry.workspaces.find(item => item.id === this.id);
            if (!entry || entry.deletedAt !== null || entry.generation !== this.generation) { this.invalidated = true; throw fault('INVALIDATED'); }
            return entry;
        }
        suspendWrites() { this._suspended = true; }
        resumeWrites() { this._suspended = false; }
        async flush() { await Promise.all([...this._pending]); }
        withLock(action) {
            if (this._suspended) return Promise.reject(fault('SWITCH_PENDING'));
            const promise = (async () => {
                await this.ready();
                return this.manager.locks.request(LOCK, { mode: 'shared' }, () => this.manager.locks.request(`${LOCK}:write`, { mode: 'exclusive' }, async () => { await this.assertActive(); return action(this.lockedLocal); }));
            })();
            this._pending.add(promise); promise.then(() => this._pending.delete(promise), () => this._pending.delete(promise)); return promise;
        }
        async get(keys) {
            const entry = await this.assertActive(); const values = await this.manager.readBundle(entry);
            const requested = keys === null || keys === undefined ? [...Object.keys(values), ...GLOBAL_KEYS] : typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(object(keys));
            check(requested.every(key => scoped(key) || GLOBAL_KEYS.includes(key)), 'BOUNDARY');
            const globalKeys = requested.filter(key => !scoped(key)); const globals = globalKeys.length ? await this.manager.get(globalKeys) : {};
            const result = {};
            for (const key of requested) { const source = scoped(key) ? values : globals; if (own(source, key)) result[key] = copy(source[key]); else if (keys && !Array.isArray(keys) && typeof keys === 'object') result[key] = copy(keys[key]); }
            // Public reads do not hold the writer lock, so recheck the pinned
            // generation after every awaited bundle/global read before delivery.
            await this.assertActive();
            return result;
        }
        async set(input) {
            const values = object(copy(input)), keys = Object.keys(values); check(keys.every(key => scoped(key) || GLOBAL_KEYS.includes(key)), 'BOUNDARY');
            const entry = await this.assertActive(), scopedValues = Object.fromEntries(Object.entries(values).filter(([key]) => scoped(key)));
            check(entry.id === DEFAULT_ID || !keys.some(key => key === 'sync' || key === '__localItabSyncIdentityState'), 'PROVIDER_BOUNDARY');
            if (Object.keys(scopedValues).length) {
                const before = await this.manager.readBundle(entry); await this.manager.writeBundle(entry, { ...before, ...scopedValues });
            }
            const globals = Object.fromEntries(Object.entries(values).filter(([key]) => !scoped(key)));
            if (Object.keys(globals).length) await this.manager.verifiedSet(globals);
        }
        async remove(keys) {
            const requested = typeof keys === 'string' ? [keys] : keys; check(Array.isArray(requested) && requested.every(scoped), 'BOUNDARY');
            const entry = await this.assertActive(), values = await this.manager.readBundle(entry); for (const key of requested) delete values[key]; await this.manager.writeBundle(entry, values);
        }
        subscribe(listener) { this._listeners.add(listener); return () => this._listeners.delete(listener); }
        createBackend(key) {
            check(scoped(key), 'BOUNDARY');
            return { workspace: this, lock: fn => this.withLock(fn), read: async () => (await this.get([key]))[key], write: state => this.set({ [key]: state }), subscribe: listener => this.subscribe(changes => { if (own(changes, key)) listener(); }) };
        }
    }
    return { createManager: options => new Manager(options), Manager, Session, validateRegistry, validateValues, bundleKey, copy, same, fault, DEFAULT_ID, REGISTRY_KEY, ACTIVATION_KEY, SNAPSHOT_KEY, STAGE_KEY, RECOVERY_KEY, LEGACY_CONFLICT_KEY, LEGACY_RECOVERY_PREFIX, PREFIX, LOCK, CONFIG_KEYS, PERSONAL_KEYS, SCOPED_KEYS, GLOBAL_KEYS };
});
