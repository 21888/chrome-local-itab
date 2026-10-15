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
    const closureCodec = () => typeof module === 'object' && module.exports ? require('./import-closure.js') : root.LocalItabImportClosure;
    const IMPORT_CLOSURE_KEY = '__localItabImportClosureV1';
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
    const COLLECTIONS_KEY = '__localItabAICollectionsV1', COLLECTIONS_LOCK = 'local-itab-ai-collections-v1';
    const PROMPTS_KEY = '__localItabPersonalPromptsV1', PROMPTS_LOCK = 'local-itab-personal-prompts-v1';
    const RESTORE_TRANSACTION_KEY = '__localItabCombinedRestoreV1';
    const DEFAULT_ID = 'default';
    const CONFIG_KEYS = Object.freeze(['clock', 'search', 'bg', 'themePreset', 'appearance', 'show', 'categories', 'links', 'weather', 'hot', 'movie', 'quote', 'layout', 'ui']);
    const PERSONAL_KEYS = Object.freeze(['__localItabPersonalTasksV1', '__localItabFocusV1', '__localItabScratchpadV1', '__localItabCountdownV1']);
    const SCOPED_KEYS = Object.freeze([...CONFIG_KEYS, ...PERSONAL_KEYS, 'schemaVersion', '__localItabLayoutGeneration', '__localItabSettingsGeneration', '__localItabIdentityRecovery', '__localItabRestoreRecovery', '__localItabRestoreReceiptV1', '__localItabCompleteRecoveryV1']);
    const GLOBAL_KEYS = Object.freeze(['privacy', 'sync', '__localItabSyncIdentityState']);
    const scoped = key => SCOPED_KEYS.includes(key);
    const own = (value, key) => Object.hasOwn(value, key);
    const same = (a, b) => a === b || Boolean(a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b) && Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(key => own(b, key) && same(a[key], b[key])));
    async function digest(value) {
        const stable = item => Array.isArray(item) ? item.map(stable) : item && typeof item === 'object'
            ? Object.fromEntries(Object.keys(item).sort().map(key => [key, stable(item[key])])) : item;
        check(root.crypto?.subtle, 'UNAVAILABLE');
        const hashed = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(stable(value))));
        return Array.from(new Uint8Array(hashed), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    const workspaceFaults = new WeakSet();
    function fault(code) { const error = new Error(`Local workspaces: ${code}`); error.code = `WORKSPACE_${code}`; workspaceFaults.add(error); return error; }
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
            this._recoveryReviews = new WeakMap(); this._ready = null; this._listeners = new Set(); this._activated = false; this._legacyConflict = false; this._legacyPending = null;
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
        async checkLegacySource({ readOnly = false } = {}) {
            const raw = await this.get([SNAPSHOT_KEY, LEGACY_CONFLICT_KEY, ...SCOPED_KEYS]);
            if (raw[LEGACY_CONFLICT_KEY] && !raw[LEGACY_CONFLICT_KEY].resolvedAt) { this.signalLegacyConflict(); throw fault('LEGACY_CONFLICT'); }
            const snapshot = raw[SNAPSHOT_KEY]; check(snapshot?.schemaVersion === 1 && snapshot.values, 'MIGRATION_INCOMPLETE');
            const baseline = raw[LEGACY_CONFLICT_KEY]?.resolvedAt ? raw[LEGACY_CONFLICT_KEY].baseline : snapshot.values;
            object(baseline);
            const changed = SCOPED_KEYS.filter(key => own(raw, key) !== own(baseline, key) || !same(raw[key], baseline[key]));
            if (changed.length) { if (!readOnly) await this.persistLegacyConflict(changed); throw fault('LEGACY_CONFLICT'); }
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
        async restoreTransaction() {
            const value = (await this.get([RESTORE_TRANSACTION_KEY]))[RESTORE_TRANSACTION_KEY];
            if (value === undefined) return null;
            object(value); check(value.schemaVersion === 1 && token(value.id) && ['prepared', 'submitted', 'verified', 'recovered'].includes(value.status), 'RESTORE_PENDING');
            return value;
        }
        async assertRestoreSettled() {
            const value = await this.restoreTransaction();
            check(!value || ['verified', 'recovered'].includes(value.status), 'RESTORE_PENDING');
        }
        createPromptBackend(api) {
            check(api?.KEY === PROMPTS_KEY && api?.LOCK === PROMPTS_LOCK && typeof api.validate === 'function', 'BOUNDARY');
            const manager = this;
            return {
                // Global ordering: workspace lifecycle lock, then prompt lock.
                // No initialization, session capture or provider/config hydration.
                lock: action => { manager.available(); return manager.locks.request(LOCK, { mode: 'exclusive' }, () => manager.locks.request(PROMPTS_LOCK, { mode: 'exclusive' }, async () => {
                    try { await manager.assertRestoreSettled(); }
                    catch (error) {
                        if (workspaceFaults.has(error) && error.code === 'WORKSPACE_RESTORE_PENDING') throw api.fault('WORKSPACE_RESTORE_PENDING');
                        throw error;
                    }
                    return action();
                })); },
                read: async () => (await manager.get([PROMPTS_KEY]))[PROMPTS_KEY],
                write: state => { api.validate(state); return manager.verifiedSet({ [PROMPTS_KEY]: state }); },
                subscribe(listener) {
                    const changed = (changes, area) => { if (area === 'local' && (own(changes, PROMPTS_KEY) || own(changes, RESTORE_TRANSACTION_KEY))) listener(); };
                    manager.chrome.storage.onChanged.addListener(changed); return () => manager.chrome.storage.onChanged.removeListener(changed);
                }
            };
        }
        createCollectionBackend(api) {
            check(api?.KEY === COLLECTIONS_KEY && api?.LOCK === COLLECTIONS_LOCK && typeof api.validate === 'function', 'BOUNDARY');
            const manager = this;
            return {
                // Global ordering: workspace lifecycle lock, then collection lock.
                // No initialization, session capture or provider/config hydration.
                lock: action => { manager.available(); return manager.locks.request(LOCK, { mode: 'exclusive' }, () => manager.locks.request(COLLECTIONS_LOCK, { mode: 'exclusive' }, async () => {
                    try { await manager.assertRestoreSettled(); }
                    catch (error) {
                        if (workspaceFaults.has(error) && error.code === 'WORKSPACE_RESTORE_PENDING') throw api.fault('RESTORE_PENDING');
                        throw error;
                    }
                    return action();
                })); },
                read: async () => (await manager.get([COLLECTIONS_KEY]))[COLLECTIONS_KEY],
                // Called only by Store.mutate while the shared workspace fence is held.
                readPromptState: async () => (await manager.get([PROMPTS_KEY]))[PROMPTS_KEY],
                write: state => { api.validate(state); return manager.verifiedSet({ [COLLECTIONS_KEY]: state }); },
                subscribe(listener) {
                    const changed = (changes, area) => { if (area === 'local' && (own(changes, COLLECTIONS_KEY) || own(changes, RESTORE_TRANSACTION_KEY))) listener(); };
                    manager.chrome.storage.onChanged.addListener(changed); return () => manager.chrome.storage.onChanged.removeListener(changed);
                }
            };
        }
        globalLocks(action) { return this.locks.request(PROMPTS_LOCK, { mode: 'exclusive' }, () => this.locks.request(COLLECTIONS_LOCK, { mode: 'exclusive' }, action)); }
        async inspectRestoreTransaction() {
            this.available();
            return this.locks.request(LOCK, { mode: 'exclusive' }, () => this.globalLocks(async () => {
                const value = await this.restoreTransaction();
                if (!value || ['verified', 'recovered'].includes(value.status)) return { pending: false };
                check(Object.keys(value).length === 9 && ['schemaVersion', 'id', 'createdAt', 'status', 'prior', 'next', 'recoveryKey', 'recoveryChecksum', 'priorWorkspaceDigest'].every(key => own(value, key)) && date(value.createdAt), 'RESTORE_PENDING');
                check(value.recoveryKey === '__localItabCompleteRecoveryV2' && /^[a-f0-9]{64}$/.test(value.recoveryChecksum) && /^[a-f0-9]{64}$/.test(value.priorWorkspaceDigest), 'RESTORE_PENDING');
                object(value.prior); object(value.next);
                const authorityKeys = Object.keys(value.prior);
                check(authorityKeys.includes(REGISTRY_KEY) && authorityKeys.length >= 2 && authorityKeys.every(key => [REGISTRY_KEY, PROMPTS_KEY, COLLECTIONS_KEY].includes(key)) && same(authorityKeys.sort(), Object.keys(value.next).sort()), 'RESTORE_PENDING');
                const api = typeof module === 'object' && module.exports ? require('./local-prompts-store.js') : root.LocalItabPrompts;
                check(api?.validate, 'VALIDATOR_UNAVAILABLE');
                const collectionApi = typeof module === 'object' && module.exports ? require('./local-ai-collections-store.js') : root.LocalItabAICollections;
                for (const pair of [value.prior, value.next]) { validateRegistry(pair[REGISTRY_KEY]); if (own(pair, PROMPTS_KEY)) api.validate(pair[PROMPTS_KEY]); if (own(pair, COLLECTIONS_KEY)) { check(collectionApi?.validate, 'VALIDATOR_UNAVAILABLE'); collectionApi.validate(pair[COLLECTIONS_KEY]); } }
                const current = await this.get(authorityKeys);
                let priorIntact = false, currentSnapshot = null;
                try { priorIntact = await digest(await this.readSnapshot(value.prior[REGISTRY_KEY])) === value.priorWorkspaceDigest; } catch (_) {}
                try { currentSnapshot = await this.readSnapshot(validateRegistry(current[REGISTRY_KEY])); } catch (_) {}
                const result = Object.freeze({ pending: true, canRecover: priorIntact && currentSnapshot !== null, priorIntact, id: value.id, status: value.status,
                    outcome: same(current, value.next) ? 'replacement-present' : same(current, value.prior) ? 'previous-present' : 'mixed-or-changed',
                    recoveryAvailable: true, target: 'previous-complete-state' });
                this._recoveryReviews.set(result, { value, current, currentSnapshot }); return result;
            }));
        }
        async readInterruptedCandidates() {
            this.available();
            return this.locks.request(LOCK, { mode: 'exclusive' }, () => this.globalLocks(async () => {
                const marker = await this.restoreTransaction();
                check(marker && ['prepared', 'submitted'].includes(marker.status), 'NO_RECOVERY');
                const registry = await this.registry(), snapshot = await this.readSnapshot(registry);
                const state = await this.get([PROMPTS_KEY, COLLECTIONS_KEY, '__localItabCompleteRecoveryV2']);
                return { snapshot, prompts: state[PROMPTS_KEY], collections: state[COLLECTIONS_KEY], recovery: state.__localItabCompleteRecoveryV2 };
            }));
        }
        async recoverInterruptedRestore(review, { confirmed = false, isCurrent = () => true } = {}) {
            const ticket = this._recoveryReviews.get(review); check(confirmed && ticket && isCurrent(), 'REVIEW_REQUIRED'); check(review.canRecover, 'RECOVERY'); this._recoveryReviews.delete(review);
            return this.locks.request(LOCK, { mode: 'exclusive' }, () => this.globalLocks(async () => {
                check(same(await this.restoreTransaction(), ticket.value) && same(await this.get(Object.keys(ticket.value.prior)), ticket.current), 'CONFLICT');
                const recovery = (await this.get([ticket.value.recoveryKey]))[ticket.value.recoveryKey];
                check(recovery && recovery.checksum === ticket.value.recoveryChecksum && typeof recovery.source === 'string', 'RECOVERY');
                check(await digest(recovery.source) === recovery.checksum, 'RECOVERY');
                const priorSnapshot = await this.readSnapshot(validateRegistry(ticket.value.prior[REGISTRY_KEY]));
                check(await digest(priorSnapshot) === ticket.value.priorWorkspaceDigest, 'RECOVERY');
                // Explicit recovery restores both authorities together. Never retry
                // or roll back an unacknowledged submission automatically.
                check(same(await this.readSnapshot(validateRegistry(ticket.current[REGISTRY_KEY])), ticket.currentSnapshot), 'CONFLICT');
                const actual = await this.get(Object.keys(ticket.value.prior));
                check(same(actual, ticket.current) && same(await this.restoreTransaction(), ticket.value), 'CONFLICT');
                check(isCurrent(), 'CANCELED');
                await this.verifiedSet(ticket.value.prior);
                await this.verifiedSet({ [RESTORE_TRANSACTION_KEY]: { ...ticket.value, status: 'recovered' } });
                this._knownRegistry = copy(ticket.value.prior[REGISTRY_KEY]);
                return { recovered: true, reloadRequired: true };
            }));
        }
        async verifiedSet(values, beforeSubmit = null) {
            check(!own(values, IMPORT_CLOSURE_KEY), 'BOUNDARY');
            const detached = copy(values);
            if (beforeSubmit) await beforeSubmit();
            try { check((await this.chrome.storage.local.set(detached)) !== false, 'WRITE'); }
            catch (error) { if (error.code?.startsWith('WORKSPACE_')) throw error; throw fault('WRITE'); }
            const readback = await this.get(Object.keys(values));
            check(Object.keys(values).every(key => own(readback, key) && same(values[key], readback[key])), 'VERIFY');
        }
        legacyLock(fn) { return this.locks.request('local-itab-personal-tasks-v1', { mode: 'exclusive' }, () => this.locks.request('local-itab-focus-v1', { mode: 'exclusive' }, () => this.locks.request('local-itab-local-write', { mode: 'exclusive' }, fn))); }
        ready() {
            if (!this._ready) this._ready = this.initialize().then(async () => {
                // Old pages do not share the workspace lock. A legacy write can
                // arrive after the staged-source check while metadata commits.
                // Start observing before the last admission read and preserve
                // both saved branches instead of giving out a stale session.
                this._activated = true;
                await this.locks.request(LOCK, { mode: 'exclusive' }, async () => {
                    await this.checkLegacySource();
                    // onChanged may arrive while get() returns an older snapshot;
                    // its sticky conflict must win even if that read looks equal.
                    check(!this._legacyConflict, 'LEGACY_CONFLICT');
                });
            }).catch(error => { this._ready = null; throw error; });
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
                await this.assertRestoreSettled();
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
        legacySource(raw) { return Object.fromEntries(Object.entries(raw).filter(([key]) => ![IMPORT_CLOSURE_KEY, REGISTRY_KEY, ACTIVATION_KEY, SNAPSHOT_KEY, STAGE_KEY, RECOVERY_KEY, LEGACY_CONFLICT_KEY].includes(key) && !key.startsWith(PREFIX))); }
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
        async writeBundle(entry, values, globals = {}, beforeSubmit = null) {
            await this.assertRestoreSettled();
            await this.validateBundle(values, globals);
            await this.verifiedSet({ ...globals, [bundleKey(entry)]: { schemaVersion: 1, id: entry.id, generation: entry.generation, values: copy(values) } }, beforeSubmit);
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
                await this.assertRestoreSettled();
                const registry = await this.registry();
                if (expectedRevision !== undefined) check(expectedRevision === registry.revision, 'CONFLICT');
                return action(registry);
            });
        }
        async commit(registry, beforeSubmit = null) { await this.assertRestoreSettled(); const checked = validateRegistry(registry); await this.verifiedSet({ [REGISTRY_KEY]: checked }, beforeSubmit); this._knownRegistry = copy(checked); return copy(checked); }
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
        async readImportClosure(registry, entry, receipt) {
            const api = closureCodec(); if (!api) return null;
            try {
                const direct = api.copy(await this.chrome.storage.local.get([IMPORT_CLOSURE_KEY, bundleKey(entry)]), { bytes: 32 * 1024 * 1024, depth: 80, nodes: 300000 });
                if (!own(direct, IMPORT_CLOSURE_KEY)) return null;
                const original = api.copy(direct[bundleKey(entry)], { bytes: 32 * 1024 * 1024, depth: 80, nodes: 300000 });
                check(original && original.schemaVersion === 1 && original.id === entry.id && original.generation === entry.generation && Object.keys(original).length === 4, 'IMPORT_PENDING');
                check(api.same(original.values.__localItabRestoreReceiptV1, receipt), 'IMPORT_PENDING');
                const saved = await api.validate(direct[IMPORT_CLOSURE_KEY]);
                return api.matches(saved, { migrationId: registry.migrationId, workspaceId: entry.id, receipt }) ? saved : null;
            } catch (_) { return null; }
        }
        async guardImportClosures(snapshot, closures) {
            if (!closures?.length) return;
            const api = closureCodec(); check(api, 'IMPORT_PENDING');
            const sourceEntries = snapshot.bundles.map(bundle => snapshot.registry.workspaces.find(entry => entry.id === bundle.id));
            check(sourceEntries.every(Boolean), 'IMPORT_PENDING');
            const keys = [REGISTRY_KEY, ACTIVATION_KEY, IMPORT_CLOSURE_KEY, ...sourceEntries.map(bundleKey)];
            const direct = api.copy(await this.chrome.storage.local.get(keys), { bytes: 32 * 1024 * 1024, depth: 80, nodes: 300000 });
            const registry = validateRegistry(api.copy(direct[REGISTRY_KEY])); this.validateActivation(api.copy(direct[ACTIVATION_KEY]), registry);
            check(same(registry, snapshot.registry), 'CONFLICT');
            for (const bundle of snapshot.bundles) {
                const entry = snapshot.registry.workspaces.find(item => item.id === bundle.id);
                const original = api.copy(direct[bundleKey(entry)], { bytes: 32 * 1024 * 1024, depth: 80, nodes: 300000 });
                check(original && original.schemaVersion === 1 && original.id === entry.id && original.generation === entry.generation && Object.keys(original).length === 4 && same(original.values, bundle.values), 'CONFLICT');
            }
            check(closures.every(item => api.same(direct[IMPORT_CLOSURE_KEY], item.envelope)), 'IMPORT_PENDING');
        }
        async duplicate(id, label, options = {}) {
            const next = name(label);
            return this.transaction(async registry => {
                check(registry.workspaces.length < 100, 'CAPACITY');
                const source = registry.workspaces.find(entry => entry.id === id && entry.deletedAt === null); check(source, 'NOT_FOUND');
                const values = await this.readBundle(source); await this.validateBundle(values);
                const receiptKey = '__localItabRestoreReceiptV1';
                const originalValues = copy(values); let closure = null;
                if (own(values, receiptKey)) {
                    // Operation identity belongs to the source workspace. Never
                    // duplicate unresolved protection or silently waive it.
                    const validator = typeof module === 'object' && module.exports ? require('../storage.js').prototype : root.StorageManager?.prototype;
                    check(typeof validator?.validateRestoreReceipt === 'function', 'VALIDATOR_UNAVAILABLE');
                    try { validator.validateRestoreReceipt.call({ restoreReceiptError: () => fault('IMPORT_RECEIPT_INVALID') }, values[receiptKey]); }
                    catch (_) { throw fault('IMPORT_RECEIPT_INVALID'); }
                    if (values[receiptKey].status === 'pending') closure = await this.readImportClosure(registry, source, values[receiptKey]);
                    check(values[receiptKey].status === 'verified' || closure, 'IMPORT_PENDING');
                    delete values[receiptKey];
                }
                // readBundle returned a detached copy. Retain its exact recovery
                // objects; neither the source receipt nor source content changes.
                this.resetTimer(values);
                const now = this.now(), entry = { id: this.id(), generation: this.id(), name: next, order: Math.max(...registry.workspaces.map(entry => entry.order)) + 1, createdAt: now, updatedAt: now, deletedAt: null };
                check(!registry.workspaces.some(item => item.id === entry.id), 'CONFLICT');
                const sourceRegistry = copy(registry);
                const beforeSubmit = closure ? () => this.guardImportClosures({ registry: sourceRegistry, bundles: [{ id: source.id, generation: source.generation, values: originalValues }] }, [{ envelope: closure }]) : null;
                await this.writeBundle(entry, values, {}, beforeSubmit); registry.workspaces.push(entry); registry.revision++; await this.commit(registry, beforeSubmit); return copy(entry);
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
        async withSnapshotLock(action) { return this.transaction(registry => this.globalLocks(async () => {
            await this.assertRestoreSettled();
            return action({ registry: copy(registry), snapshot: keys => this.readSnapshot(registry, keys ?? null),
                collectionState: async () => (await this.get([COLLECTIONS_KEY]))[COLLECTIONS_KEY],
                promptState: async () => (await this.get([PROMPTS_KEY]))[PROMPTS_KEY],
                replace: (snapshot, options = {}) => this.replaceLocked(registry, copy(snapshot), options) });
        })); }
        async replaceLocked(current, input, options = {}) {
            object(input); const incoming = validateRegistry(input.registry);
            check(Array.isArray(input.bundles) && input.bundles.length === incoming.workspaces.length);
            const seen = new Set();
            for (const bundle of input.bundles) { object(bundle); const entry = incoming.workspaces.find(item => item.id === bundle.id); check(entry && bundle.generation === entry.generation && !seen.has(bundle.id)); seen.add(bundle.id); await this.validateBundle(bundle.values); }
            const prior = await this.readSnapshot(current);
            await this.verifiedSet({ [RECOVERY_KEY]: { schemaVersion: 1, createdAt: this.now(), snapshot: prior } }, options.beforeSubmit);
            for (const entry of incoming.workspaces) {
                const values = copy(input.bundles.find(bundle => bundle.id === entry.id).values);
                const previous = current.workspaces.find(item => item.id === entry.id);
                const previousValues = prior.bundles.find(bundle => bundle.id === entry.id)?.values;
                if (previous && previous.deletedAt === entry.deletedAt && same(previousValues, values)) entry.generation = previous.generation;
                else { entry.generation = this.id(); entry.updatedAt = this.now(); await this.writeBundle(entry, values, {}, options.beforeSubmit); }
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
                } }, options.beforeSubmit);
                // A canceled or uncertain restore may leave Sync safely paused,
                // never activate unchecked data or resume an old cloud copy.
                check(same(await this.readSnapshot(await this.registry()), prior), 'CONFLICT');
                check(!options.isCurrent || options.isCurrent(), 'CANCELED');
            }
            const replacements = [options.promptReplacement, options.collectionReplacement].filter(Boolean);
            if (replacements.length) {
                const priorAuthority = { [REGISTRY_KEY]: current }, nextAuthority = { [REGISTRY_KEY]: validateRegistry(incoming) };
                for (const item of replacements) {
                    check([PROMPTS_KEY, COLLECTIONS_KEY].includes(item.api?.KEY) && typeof item.api.validate === 'function', 'BOUNDARY');
                    item.api.validate(item.next); item.api.validate(item.prior);
                    const actual = (await this.get([item.api.KEY]))[item.api.KEY];
                    check(same(actual === undefined ? item.api.initial() : actual, item.prior), 'CONFLICT');
                    priorAuthority[item.api.KEY] = copy(item.prior); nextAuthority[item.api.KEY] = copy(item.next);
                }
                const first = replacements[0];
                check(replacements.every(item => item.recoveryKey === first.recoveryKey && item.recoveryChecksum === first.recoveryChecksum), 'RECOVERY');
                const recovery = (await this.get([first.recoveryKey]))[first.recoveryKey];
                check(recovery && recovery.checksum === first.recoveryChecksum && await digest(recovery.source) === recovery.checksum, 'RECOVERY');
                const marker = { schemaVersion: 1, id: this.id(), createdAt: this.now(), status: 'prepared',
                    prior: priorAuthority, next: nextAuthority,
                    recoveryKey: first.recoveryKey, recoveryChecksum: first.recoveryChecksum, priorWorkspaceDigest: await digest(prior) };
                // A durable fence comes before the multi-key authority submission.
                // Prepared/submitted fences block every cooperating writer, even
                // after reload. No browser-crash atomicity is assumed.
                try {
                await this.verifiedSet({ [RESTORE_TRANSACTION_KEY]: marker }, options.beforeSubmit);
                const authoritative = await this.get(Object.keys(priorAuthority));
                check(same(authoritative[REGISTRY_KEY], current) && replacements.every(item => same(authoritative[item.api.KEY] === undefined ? item.api.initial() : authoritative[item.api.KEY], item.prior)), 'CONFLICT');
                check(same(await this.readSnapshot(current), prior), 'CONFLICT');
                check(!options.isCurrent || options.isCurrent(), 'CANCELED');
                await this.verifiedSet({ ...marker.next, [RESTORE_TRANSACTION_KEY]: { ...marker, status: 'submitted' } }, options.beforeSubmit);
                await this.verifiedSet({ [RESTORE_TRANSACTION_KEY]: { ...marker, status: 'verified' } });
                this._knownRegistry = copy(incoming); return copy(incoming);
                } catch (error) { error.pendingRestore = true; throw error; }
            }
            return this.commit(incoming, options.beforeSubmit);
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
        readyExisting() {
            // Read-only entry for global-library pages. Never start/resume migration.
            // A cached identity is not proof that a later dialog can replace a
            // draft: recheck recovery, metadata and bundles on every admission.
            const inspect = async () => {
                this.manager.available();
                return this.manager.locks.request(LOCK, { mode: 'exclusive' }, async () => {
                    check(!this.invalidated, 'INVALIDATED');
                    await this.manager.assertRestoreSettled();
                    const registry = await this.manager.registry();
                    await this.manager.checkLegacySource({ readOnly: true });
                    const wanted = this.id || (this.requestedId === undefined ? registry.lastUsedId : this.requestedId);
                    const entry = registry.workspaces.find(item => item.id === wanted);
                    if (this._identity && (!entry || entry.deletedAt !== null || entry.generation !== this.generation)) this.invalidated = true;
                    check(!this.invalidated, 'INVALIDATED');
                    check(entry && entry.deletedAt === null, 'NOT_FOUND');
                    await this.manager.readSnapshot(registry);
                    await this.manager.checkLegacySource({ readOnly: true });
                    await this.manager.assertRestoreSettled();
                    const current = await this.manager.registry();
                    const currentEntry = current.workspaces.find(item => item.id === wanted);
                    if (this._identity && (!currentEntry || currentEntry.deletedAt !== null || currentEntry.generation !== this.generation)) this.invalidated = true;
                    check(!this.invalidated, 'INVALIDATED');
                    check(same(current, registry), 'CONFLICT');
                    if (!this._identity) {
                        this._identity = Object.freeze({ id: entry.id, generation: entry.generation }); this._existingOnly = true;
                    }
                    return this._identity;
                });
            };
            if (this._ready) return this._ready.then(inspect).then(copy);
            const ready = inspect().catch(error => { if (this._ready === ready) this._ready = null; throw error; });
            this._ready = ready;
            return ready.then(copy);
        }
        async assertActive() {
            await this.ready(); check(!this.invalidated, 'INVALIDATED');
            if (this._existingOnly) await this.manager.checkLegacySource({ readOnly: true });
            const registry = await this.manager.registry();
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
                return this.manager.locks.request(LOCK, { mode: 'shared' }, () => this.manager.locks.request(`${LOCK}:write`, { mode: 'exclusive' }, async () => { await this.manager.assertRestoreSettled(); await this.assertActive(); return action(this.lockedLocal); }));
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
        async set(input, beforeSubmit = null) {
            await this.manager.assertRestoreSettled();
            const values = object(copy(input)), keys = Object.keys(values); check(keys.every(key => scoped(key) || GLOBAL_KEYS.includes(key)), 'BOUNDARY');
            const entry = await this.assertActive(), scopedValues = Object.fromEntries(Object.entries(values).filter(([key]) => scoped(key)));
            check(entry.id === DEFAULT_ID || !keys.some(key => key === 'sync' || key === '__localItabSyncIdentityState'), 'PROVIDER_BOUNDARY');
            const globals = Object.fromEntries(Object.entries(values).filter(([key]) => !scoped(key)));
            if (Object.keys(scopedValues).length) {
                // One settings operation must not commit its workspace and then
                // fail a separate provider/privacy write. Submit and verify the
                // complete local update together, including its recovery copy.
                const before = await this.manager.readBundle(entry);
                await this.manager.writeBundle(entry, { ...before, ...scopedValues }, globals, beforeSubmit);
            } else if (Object.keys(globals).length) await this.manager.verifiedSet(globals, beforeSubmit);
        }
        async remove(keys) {
            await this.manager.assertRestoreSettled();
            const requested = typeof keys === 'string' ? [keys] : keys; check(Array.isArray(requested) && requested.every(scoped), 'BOUNDARY');
            const entry = await this.assertActive(), values = await this.manager.readBundle(entry); for (const key of requested) delete values[key]; await this.manager.writeBundle(entry, values);
        }
        subscribe(listener) { this._listeners.add(listener); return () => this._listeners.delete(listener); }
        createBackend(key) {
            check(scoped(key), 'BOUNDARY');
            return { workspace: this, lock: fn => this.withLock(fn), read: async () => (await this.get([key]))[key], write: state => this.set({ [key]: state }), subscribe: listener => this.subscribe(changes => { if (own(changes, key)) listener(); }) };
        }
    }
    return { createManager: options => new Manager(options), Manager, Session, validateRegistry, validateValues, bundleKey, copy, same, fault, DEFAULT_ID, REGISTRY_KEY, ACTIVATION_KEY, SNAPSHOT_KEY, STAGE_KEY, RECOVERY_KEY, LEGACY_CONFLICT_KEY, LEGACY_RECOVERY_PREFIX, PREFIX, LOCK, PROMPTS_KEY, PROMPTS_LOCK, COLLECTIONS_KEY, COLLECTIONS_LOCK, RESTORE_TRANSACTION_KEY, CONFIG_KEYS, PERSONAL_KEYS, SCOPED_KEYS, GLOBAL_KEYS };
});
