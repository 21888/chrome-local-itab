/**
 * Storage Manager for Local iTab Extension
 * Handles all local storage operations with error handling and validation
 */

const ConfigurationCodec = typeof module !== 'undefined' && module.exports ? require('./shared/configuration-codec.js') : window.LocalItabConfigurationCodec;
const LayoutIdentity = typeof module !== 'undefined' && module.exports ? require('./shared/layout-identity.js') : window.LocalItabIdentity;
const DashboardTemplates = typeof module !== 'undefined' && module.exports ? require('./shared/dashboard-template-registry.js') : window.LocalItabTemplates;
const ClockPreferences = typeof module !== 'undefined' && module.exports ? require('./shared/world-clocks.js') : window.WorldClocks;
// Resolve lazily so non-import consumers need not load the bookmark parser.
const getStoredURL = () => typeof module !== 'undefined' && module.exports ? require('./shared/stored-shortcut-url.js') : window.LocalItabStoredURL;
const getImportClosureService = () => typeof module !== 'undefined' && module.exports ? require('./shared/import-closure-service.js') : window.LocalItabImportClosureService;
const getBookmarkImportPlanner = () => typeof module !== 'undefined' && module.exports ? require('./shared/bookmark-import.js') : window.LocalItabBookmarkImport;
const BOOKMARK_IMPORT_STORAGE_LIMITS = Object.freeze({ links: 20000, categories: 2000, bytes: 32 * 1024 * 1024, nodes: 250000, depth: 32 });

// Personal content is owned by dedicated local stores, never configuration.
const IMPORT_CLOSURE_KEY = '__localItabImportClosureV1';
const LOCAL_PERSONAL_CONTENT_KEYS = Object.freeze(['__localItabPersonalTasksV1', '__localItabFocusV1', '__localItabScratchpadV1', '__localItabCountdownV1']);

// Logical fields owned by the ordinary Settings form. Arrays and dependent
// pairs remain atomic; independent toggles/text fields merge independently.
const SETTINGS_FORM_PATHS = Object.freeze([
    'bg', 'search', 'quote', 'privacy.onlineFavicons',
    ...['clock', 'search', 'shortcuts', 'weather', 'hot', 'movie'].map(key => `show.${key}`),
    ...['city', 'temp', 'cond', 'aqiLabel', 'aqi', 'low', 'high'].map(key => `weather.${key}`),
    ...['tab', 'baidu', 'weibo', 'zhihu'].map(key => `hot.${key}`),
    'movie.title', 'movie.note', 'movie.poster', 'ui.dashboardPadding', 'ui.showShortcutTitles', 'ui.finderShortcutEnabled',
    ...['gapX', 'gapY', 'iconSize', 'titleSize', 'titleColor'].map(key => `ui.shortcutsStyle.${key}`)
]);
// Shared defaults and validators are browser independent; I/O stays in this class.
const DASHBOARD_CUSTOMIZATION_DEFAULTS = ConfigurationCodec.DASHBOARD_CUSTOMIZATION_DEFAULTS;

class StorageManager {
    constructor(options = {}) {
        // A page owns one immutable workspace session. Never resolve the current
        // global selection after an asynchronous operation has started.
        this.workspace = options.workspace || (typeof window !== 'undefined' ? window.LocalItabWorkspaces?.session : null) || null;
        this._defaultWorkspaceManager = null;
        this.syncMetaKey = '__localItabSyncMeta';
        this.layoutGenerationKey = '__localItabLayoutGeneration';
        this.settingsGenerationKey = '__localItabSettingsGeneration';
        this.settingsFormPaths = SETTINGS_FORM_PATHS;
        this.identityRecoveryKey = '__localItabIdentityRecovery';
        this.restoreRecoveryKey = '__localItabRestoreRecovery';
        this.restoreReceiptKey = '__localItabRestoreReceiptV1';
        this.syncIdentityStateKey = '__localItabSyncIdentityState';
        this.syncChunkPrefix = '__localItabSyncData_';
        this.syncMaxChunks = 20;
        this.syncTotalBudget = 98000;
        this._textEncoder = null;
        this._syncInitialized = false;
        this._syncInitPromise = null;
        this._isApplyingSync = false;
        this._syncCompatibilityError = null;
        this._syncPushTimer = null;
        this._shortcutUndoTicket = null;
        this.chromeApi?.storage?.onChanged?.addListener((changes, area) => {
            if (area === 'local' && changes[this.syncIdentityStateKey]) {
                const next = changes[this.syncIdentityStateKey].newValue;
                this._syncCompatibilityError = next?.blocked || null;
                if (next?.blocked) this.cancelSyncPush();
            }
        });

        // Default configuration schema
        this.defaultConfig = ConfigurationCodec.createDefaultConfig({
            getMessage: key => typeof chrome !== 'undefined' && chrome.i18n?.getMessage?.(key)
        });
        if (this.workspace) this.workspace.manager.configureValidation((values, globals) => this.validateWorkspaceValues(values, globals));
    }

    get chromeApi() { return this.workspace?.manager.chrome || (typeof chrome !== 'undefined' ? chrome : null); }

    get legacyLocal() {
        const backend = this.chromeApi.storage.local;
        if (this._legacyLocalBackend !== backend) {
            const guard = keys => {
                if ((Array.isArray(keys) ? keys : [keys]).includes(IMPORT_CLOSURE_KEY)) throw Object.assign(new Error('Protected import evidence.'), { code: 'IMPORT_CLOSURE_BOUNDARY' });
            };
            this._legacyLocalBackend = backend;
            this._legacyLocalFacade = Object.freeze({
                get: keys => backend.get(keys),
                set: values => { guard(Object.keys(values)); return backend.set(values); },
                remove: keys => { guard(keys); return backend.remove(keys); },
                clear: () => { throw Object.assign(new Error('Use configuration reset to retain protected local evidence.'), { code: 'IMPORT_CLOSURE_BOUNDARY' }); },
                getBytesInUse: keys => backend.getBytesInUse(keys),
                get QUOTA_BYTES() { return backend.QUOTA_BYTES; }
            });
        }
        return this._legacyLocalFacade;
    }

    get local() { return this.workspace?.local || this.legacyLocal; }

    // Writers in this class are enclosed by withLocalWriteLock. Keeping the
    // already-locked facade separate avoids reentrant locks without relying on
    // a shared boolean that would accidentally admit unrelated async callers.
    get _local() { return this.workspace?.lockedLocal || this.legacyLocal; }

    onLocalChanged(listener) {
        if (this.workspace) return this.workspace.subscribe(listener);
        const changed = (changes, area) => { if (area === 'local') listener(changes, area); };
        chrome.storage.onChanged.addListener(changed);
        return () => chrome.storage.onChanged.removeListener(changed);
    }

    forDefaultWorkspace() {
        if (!this.workspace || this.workspace.requestedId === 'default' || this.workspace.id === 'default') return this;
        if (!this._defaultWorkspaceManager) this._defaultWorkspaceManager = new StorageManager({ workspace: this.workspace.manager.capture('default') });
        return this._defaultWorkspaceManager;
    }

    async isDefaultWorkspace() {
        if (!this.workspace) return true;
        return (await this.workspace.ready()).id === 'default';
    }

    validateWorkspaceConfig(values) {
        // Old shortcuts/categories may omit cosmetic optional fields. Validate
        // their documented default projection without rewriting original IDs,
        // receipts, positions or stored content during migration.
        const projected = this.copyStoredConfiguration(values);
        if (Array.isArray(projected.links)) projected.links = projected.links.map(link =>
            link && typeof link === 'object' && !Array.isArray(link)
                ? { icon: '🌐', category: 'work', ...link } : link);
        if (Array.isArray(projected.categories)) projected.categories = projected.categories.map(category =>
            category && typeof category === 'object' && !Array.isArray(category)
                ? { icon: '📁', ...category } : category);
        return this.completeBackupConfigFromRaw(projected);
    }

    validateWorkspaceValues(values, globals = {}) {
        // Fill absent legacy fields only; supplied corruption must never activate
        // as a fresh/default workspace or silently replace the user's content.
        this.validateWorkspaceConfig({ ...values, ...(Object.hasOwn(globals, 'privacy') ? { privacy: globals.privacy } : {}) });
        const names = ['Tasks', 'Focus', 'Scratchpad', 'Countdown'];
        for (const name of names) {
            const api = typeof module !== 'undefined' && module.exports
                ? require(`./shared/local-${name.toLowerCase()}-store.js`)
                : window[`LocalItab${name}`];
            if (!api) throw new Error('Workspace content validation is unavailable.');
            if (Object.hasOwn(values, api.KEY)) api.validate(values[api.KEY]);
        }
    }

    /**
     * Get a value from storage with default fallback
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if key doesn't exist
     * @returns {Promise<*>} - Retrieved value or default
     */
    async get(key, defaultValue = null) {
        this.assertConfigurationKeys([key]);
        try {
            await this.ensureSyncInitialized();
            const result = await this._local.get(this.workspace ? null : [key]);
            if (this.workspace) {
                try { this.validateWorkspaceConfig(result); }
                catch (_) { const error = new Error('Workspace settings are invalid. Saved data has not been replaced.'); error.code = 'WORKSPACE_CORRUPT'; throw error; }
            }
            
            if (result[key] !== undefined) {
                // Validate retrieved data
                try {
                    const validatedValue = this.validateStoredData(key, result[key]);
                    return validatedValue;
                } catch (validationError) {
                    if (validationError.code === 'STORED_CONFIG_INVALID') throw validationError;
                    if (this.workspace) { const error = new Error('Workspace settings are invalid. Saved data has not been replaced.'); error.code = 'WORKSPACE_CORRUPT'; throw error; }
                    console.warn(`Data validation failed for key "${key}", using default:`, validationError);
                    
                    // Notify about data corruption recovery
                    if (typeof errorHandler !== 'undefined') {
                        errorHandler.showDataRecovery([key]);
                    }
                    
                    const defaultVal = defaultValue !== null ? defaultValue : this.getDefaultValue(key);
                    
                    // Try to save the corrected default value
                    try {
                        await this.set(key, defaultVal);
                    } catch (saveError) {
                        console.error(`Failed to save corrected value for key "${key}":`, saveError);
                    }
                    
                    return defaultVal;
                }
            }
            
            // Return provided default or schema default
            if (defaultValue !== null) {
                return defaultValue;
            }
            
            return this.getDefaultValue(key);
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_') || error.code === 'STORED_CONFIG_INVALID') throw error;
            console.error(`Storage get error for key "${key}":`, error);
            
            // Handle specific storage errors
            if (typeof errorHandler !== 'undefined') {
                errorHandler.handleStorageError(error, `retrieve ${key}`);
            }
            
            return defaultValue !== null ? defaultValue : this.getDefaultValue(key);
        }
    }

    assertConfigurationKeys(keys) {
        if (keys.includes(IMPORT_CLOSURE_KEY)) {
            throw Object.assign(new Error('Import closure evidence has a dedicated immutable boundary.'), { code: 'IMPORT_CLOSURE_BOUNDARY' });
        }
        if (keys.some(key => LOCAL_PERSONAL_CONTENT_KEYS.includes(key))) {
            const error = new Error('Personal content must use its dedicated local store.');
            error.code = 'PERSONAL_CONTENT_BOUNDARY';
            throw error;
        }
    }

    // Serialize configuration writes within this extension origin.
    async withLocalWriteLock(operation, required = false) {
        if (this.workspace) return this.workspace.withLock(operation);
        if (typeof navigator !== 'undefined' && navigator.locks?.request) {
            return navigator.locks.request('local-itab-local-write', operation);
        }
        if (required) {
            const error = new Error('Safe shortcut saving is unavailable in this browser.');
            error.code = 'LINKS_LOCK_UNAVAILABLE';
            throw error;
        }
        return operation();
    }

    settingsError(code = 'SETTINGS_CONFLICT') {
        const error = new Error('Settings changed or could not be safely compared. Your edits are still here. Open a new Settings tab to review the latest values and copy your changes there.');
        error.code = code; return error;
    }

    settingsPathValue(source, path) {
        return path.split('.').reduce((value, key) => value && typeof value === 'object' &&
            Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined, source);
    }

    setSettingsPath(target, path, value) {
        const keys = path.split('.'), last = keys.pop();
        let current = target;
        for (const key of keys) {
            if (current[key] === undefined) current[key] = {};
            if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) throw this.settingsError();
            current = current[key];
        }
        current[last] = LayoutIdentity.copy(value);
    }

    settingsSnapshot(raw) {
        const generation = raw[this.settingsGenerationKey] === undefined ? null : raw[this.settingsGenerationKey];
        if (raw[this.settingsGenerationKey] !== undefined && (typeof generation !== 'string' || !generation)) throw this.settingsError();
        const keys = [...new Set(SETTINGS_FORM_PATHS.map(path => path.split('.')[0]))];
        return { generation, values: LayoutIdentity.copy(Object.fromEntries(keys.filter(key =>
            Object.prototype.hasOwnProperty.call(raw, key)).map(key => [key, raw[key]]))) };
    }

    mergeSettingsPatch(raw, values, options) {
        const expected = options.expectedSettings;
        if (!expected || !expected.values || typeof expected.values !== 'object' ||
            this.settingsSnapshot(raw).generation !== expected.generation) throw this.settingsError();
        const paths = options.settingsPaths;
        if (!Array.isArray(paths) || paths.some(path => !SETTINGS_FORM_PATHS.includes(path))) throw this.settingsError();
        const merged = {};
        for (const path of paths) {
            const key = path.split('.')[0];
            if (!Object.prototype.hasOwnProperty.call(values, key)) throw this.settingsError();
            const prior = this.settingsPathValue(expected.values, path), latest = this.settingsPathValue(raw, path);
            if (!this.sameShortcutUndoValue(prior, latest)) throw this.settingsError();
            if (!Object.prototype.hasOwnProperty.call(merged, key)) {
                merged[key] = raw[key] === undefined ? {} : LayoutIdentity.copy(raw[key]);
            }
            this.setSettingsPath(merged, path, this.settingsPathValue(values, path));
        }
        // Only explicitly owned general fields are written. Clock/categories
        // retain their established whole-group validation and compare guards.
        for (const key of Object.keys(values)) {
            if (key === 'clock' || key === 'categories') {
                if (!Object.prototype.hasOwnProperty.call(options, key === 'clock' ? 'expectedClock' : 'expectedCategories')) throw this.settingsError();
                merged[key] = values[key];
            }
            else if (!paths.some(path => path.split('.')[0] === key)) throw this.settingsError();
        }
        return merged;
    }

    dashboardPreferenceError(code = 'DASHBOARD_PREF_CONFLICT') {
        const error = new Error('Saved preferences changed or could not be safely compared. Keep any draft and open a new tab before retrying.');
        error.code = code; return error;
    }

    // Dashboard controls own these fields, never their cached parent objects.
    // Select/toggle actions express a new value; an explicit custom-template
    // Save additionally compares the original search pair before replacing it.
    async patchDashboardPreferences(patch, baseline) {
        if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline) ||
            !baseline.values || typeof baseline.values !== 'object' || Array.isArray(baseline.values) ||
            !Object.prototype.hasOwnProperty.call(baseline, 'generation') ||
            (baseline.generation !== null && (typeof baseline.generation !== 'string' || !baseline.generation))) {
            throw this.dashboardPreferenceError('DASHBOARD_PREF_BASELINE_UNAVAILABLE');
        }
        const expected = {generation: baseline.generation, values: LayoutIdentity.copy(
            Object.prototype.hasOwnProperty.call(baseline.values, 'search') ? {search: baseline.values.search} : {})};
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw this.dashboardPreferenceError();
        const requested = LayoutIdentity.copy(patch);
        const keys = Object.keys(requested), has = key => Object.prototype.hasOwnProperty.call(requested, key);
        if (!keys.length || keys.some(key => !['engine', 'custom', 'dashboardHidden'].includes(key)) ||
            (has('engine') && !['google', 'bing', 'duck', 'custom'].includes(requested.engine)) ||
            (has('dashboardHidden') && typeof requested.dashboardHidden !== 'boolean') ||
            (has('custom') && (requested.engine !== 'custom' || typeof requested.custom !== 'string' ||
                !requested.custom || this.validateSearchConfig({engine: 'custom', custom: requested.custom}).custom !== requested.custom))) {
            throw this.dashboardPreferenceError();
        }
        await this.ensureSyncInitialized();
        let result;
        try {
            result = await this.withLocalWriteLock(async () => {
                const raw = await this._local.get(['search', 'ui', this.settingsGenerationKey]);
                if (this.settingsSnapshot(raw).generation !== expected.generation) throw this.dashboardPreferenceError();
                if (has('custom') && !this.sameShortcutUndoValue(raw.search, expected.values.search)) throw this.dashboardPreferenceError();
                const written = {};
                for (const key of ['search', 'ui']) {
                    if (key === 'search' ? !has('engine') && !has('custom') : !has('dashboardHidden')) continue;
                    if (raw[key] !== undefined && (!raw[key] || typeof raw[key] !== 'object' || Array.isArray(raw[key]))) throw this.dashboardPreferenceError();
                    written[key] = raw[key] === undefined ? {} : LayoutIdentity.copy(raw[key]);
                }
                if (has('engine')) written.search.engine = requested.engine;
                if (has('custom')) written.search.custom = requested.custom;
                if (has('dashboardHidden')) written.ui.dashboardHidden = requested.dashboardHidden;
                const committed = {generation: expected.generation};
                if (written.search) {
                    committed.search = this.validateSearchConfig(written.search);
                    committed.searchSource = LayoutIdentity.copy(written.search);
                }
                if (written.ui) committed.ui = this.validateUiConfig(written.ui);
                await this._local.set(written);
                return committed;
            }, true);
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            if (error.code === 'LINKS_LOCK_UNAVAILABLE') throw this.dashboardPreferenceError('DASHBOARD_PREF_LOCK_UNAVAILABLE');
            if (error.code?.startsWith('SETTINGS_')) throw this.dashboardPreferenceError();
            throw error;
        }
        try { if (!this._isApplyingSync && await this.isSyncEnabledLocally()) this.scheduleSyncPush(); }
        catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error; console.warn('Dashboard preference saved locally; Sync scheduling failed:', error); }
        return result;
    }

    async writeLocalValues(values, options = {}) {
        this.assertConfigurationKeys(Object.keys(values));
        if (this.workspace) {
            values = LayoutIdentity.copy(values);
            if (!(await this.isDefaultWorkspace())) delete values.sync;
        }
        const has = key => Object.prototype.hasOwnProperty.call(values, key);
        const guardedSettings = Object.prototype.hasOwnProperty.call(options, 'expectedSettings');
        if (guardedSettings && !(this.workspace?.manager.locks?.request || (typeof navigator !== 'undefined' && navigator.locks?.request))) throw this.settingsError('SETTINGS_LOCK_UNAVAILABLE');
        const replacesLayout = has('layout') || (has('links') && !Object.prototype.hasOwnProperty.call(options, 'expectedLinks'));
        const checksCategories = has('categories');
        const checksClock = has('clock');
        const guardedClock = checksClock && Object.prototype.hasOwnProperty.call(options, 'expectedClock');
        // Capture the expected value before waiting for another tab's write.
        const expectedClock = guardedClock ? this.validateClockBaseline(options.expectedClock) : null;
        if (guardedClock && !(this.workspace?.manager.locks?.request || (typeof navigator !== 'undefined' && navigator.locks?.request))) {
            const error = new Error('Safe clock saving is unavailable in this browser. Your edits have not been saved.');
            error.code = 'CLOCK_LOCK_UNAVAILABLE';
            throw error;
        }
        if (!has('links') && !replacesLayout && !checksCategories && !checksClock && !guardedSettings) {
            // Unguarded dedicated writers must still serialize with Settings
            // comparisons and import disclosures rather than race their reads.
            return this.withLocalWriteLock(() => this._local.set(values));
        }
        const guarded = Object.prototype.hasOwnProperty.call(options, 'expectedLinks');
        const guardedCategories = checksCategories && Object.prototype.hasOwnProperty.call(options, 'expectedCategories');
        return this.withLocalWriteLock(async () => {
            const raw = await this._local.get(null);
            if (guardedSettings) values = this.mergeSettingsPatch(raw, values, options);
            if (guardedClock && JSON.stringify(this.validateClockBaseline(raw.clock === undefined ? this.defaultConfig.clock : raw.clock)) !==
                JSON.stringify(expectedClock)) {
                const error = new Error('Clock settings changed in another tab. Your edits are still here. Review the latest clock settings in a new Settings tab before retrying.');
                error.code = 'CLOCK_CONFLICT';
                throw error;
            }
            // A clock-only transaction must not depend on shortcut validity.
            // Its comparison still precedes the single atomic multi-key write.
            if (!has('links') && !replacesLayout && !checksCategories) {
                if (Object.keys(values).length) await this._local.set(values);
                return;
            }
            let closedRestoreGuard = null;
            if (options.confirmedRestore) {
                const reconciled = await this.reconcileRestoreReceipt(raw, values, options);
                if (reconciled === true) return this.layoutSnapshot(raw);
                if (reconciled?.admit) closedRestoreGuard = reconciled.guard;
            }
            const latest = this.layoutSnapshot(raw);
            if (guardedCategories && JSON.stringify(this.validateCategoryBaseline(raw.categories === undefined ? this.defaultConfig.categories : raw.categories)) !==
                JSON.stringify(this.validateCategoryBaseline(options.expectedCategories))) {
                const error = new Error('Categories changed in another tab. Your category edits are still here. Review the latest categories in a new Settings tab before retrying.');
                error.code = 'CATEGORIES_CONFLICT';
                throw error;
            }
            if (guarded) {
                const expectedLinks = this.validateStoredLinksConfig(options.expectedLinks);
                if (JSON.stringify(latest.links) !== JSON.stringify(expectedLinks) ||
                    (Object.prototype.hasOwnProperty.call(options, 'expectedLayoutGeneration') && options.expectedLayoutGeneration !== latest.generation)) {
                    const error = new Error('Shortcuts changed in another tab. Reopen the shortcut and try again.');
                    error.code = 'LINKS_CONFLICT'; error.latestLinks = latest.links;
                    throw error;
                }
                if (options.operation) this.validateShortcutOperation(latest.links, values.links, options.operation);
            }
            let candidate = { ...raw, ...values };
            let allocated = false;
            if (guarded && options.operation && LayoutIdentity.needs(candidate.links)) {
                const assignment = LayoutIdentity.allocate(candidate.links, candidate.layout || this.defaultConfig.layout,
                    latest.links, options.operation, () => this.createLayoutIdentity());
                candidate = { ...candidate, links: assignment.links, layout: assignment.layout };
                allocated = assignment.changed;
            }
            LayoutIdentity.validateBundle(candidate);
            const schemaVersion = this.layoutSchemaForMutation(raw, candidate.layout);
            if (schemaVersion !== undefined) candidate.schemaVersion = schemaVersion;
            const protectedBefore = LayoutIdentity.active(latest.layout);
            if (protectedBefore && !(this.workspace?.manager.locks?.request || (typeof navigator !== 'undefined' && navigator.locks?.request))) { const error = new Error('Safe identity writes require Web Locks.'); error.code = 'LAYOUT_LOCK_UNAVAILABLE'; throw error; }
            const losesIdentity = protectedBefore && this.losesIdentityHistory(latest, this.layoutSnapshot(candidate));
            if (losesIdentity && !options.confirmedRestore) {
                LayoutIdentity.invalid('Replacing identity-bearing shortcuts requires a confirmed whole backup restore.');
            }
            let invalidatesLayout = replacesLayout || allocated;
            if (!invalidatesLayout && checksCategories) {
                const previous = this.validateCategoriesConfig(raw.categories ?? this.defaultConfig.categories);
                invalidatesLayout = JSON.stringify(previous) !== JSON.stringify(values.categories);
            }
            const written = { ...values };
            if (schemaVersion !== undefined && schemaVersion !== raw.schemaVersion) written.schemaVersion = schemaVersion;
            if (allocated) { written.links = candidate.links; written.layout = candidate.layout; }
            if (allocated && !protectedBefore && !raw[this.identityRecoveryKey]) written[this.identityRecoveryKey] = await this.makeRecovery(raw, 'beforeIdentity');
            if (options.confirmedRestore) {
                written[this.settingsGenerationKey] = this.createLayoutGeneration();
                // Provider preferences belong to this device at commit time, not
                // to the imported file or an earlier preview read.
                if (!this.workspace || this.workspace.id === 'default') written.sync = this.validateSyncConfig(raw.sync || this.defaultConfig.sync);
                else delete written.sync;
                written[this.restoreRecoveryKey] = await this.makeRecovery(raw, 'beforeRestore');
                // Preserve pre-existing recovery ancestry; ordinary, verified new
                // imports still rotate the latest beforeRestore copy.
                if (raw[this.restoreRecoveryKey]?.previousRecovery !== undefined) {
                    written[this.restoreRecoveryKey].previousRecovery = LayoutIdentity.copy(raw[this.restoreRecoveryKey].previousRecovery);
                }
                if ((!this.workspace || this.workspace.id === 'default') && raw.sync?.enabled) written[this.syncIdentityStateKey] = {
                    ...(raw[this.syncIdentityStateKey] || {}),
                    blocked: { kind: 'restore', reason: 'Restored data is kept locally. Review compatible cloud data before resuming Sync.' }
                };
            }
            if (invalidatesLayout) written[this.layoutGenerationKey] = this.createLayoutGeneration();
            if (options.confirmedRestore) {
                written[this.restoreReceiptKey] = {
                    version: 1, status: 'pending', request: await this.restoreRequestHash(values),
                    target: await this.fingerprint(this.restoreReceiptState({ ...raw, ...written })),
                    recovery: await this.fingerprint(written[this.restoreRecoveryKey])
                };
                try {
                    const outcome = closedRestoreGuard ? await this.workspace.set(written, closedRestoreGuard) : await this._local.set(written);
                    if (outcome === false) throw this.restoreReceiptError('RESTORE_UNCERTAIN');
                    await this.settleRestoreReceipt(written[this.restoreReceiptKey]);
                } catch (error) {
                    // Failure is not evidence that nothing committed. The receipt
                    // travels with the replacement and survives tabs/restarts.
                    error.message = this.restoreReceiptError('RESTORE_UNCERTAIN').message + ' ' + error.message;
                    if (!error.code) error.code = 'RESTORE_UNCERTAIN';
                    throw error;
                }
            } else await this._local.set(written);
            return this.layoutSnapshot({ ...raw, ...written });
        }, options.confirmedRestore || guardedSettings || guarded || guardedCategories || guardedClock || LayoutIdentity.active(values.layout));
    }

    shortcutUndoError(code, message) {
        const error = new Error(message); error.code = code; return error;
    }

    shortcutUndoState(raw) {
        // Selecting own keys preserves absence as well as every unknown nested
        // field. The bounded copier rejects unsupported/non-JSON values.
        const keys = ['links', 'categories', 'layout', 'schemaVersion', this.layoutGenerationKey];
        return this.copyBookmarkImportValue(Object.fromEntries(keys.filter(key =>
            Object.prototype.hasOwnProperty.call(raw, key)).map(key => [key, raw[key]])));
    }

    shortcutUndoSnapshot(raw) {
        const snapshot = this.layoutSnapshot(raw);
        const links = raw.links === undefined ? this.defaultConfig.links : raw.links;
        // Preserve unknown record fields, but refuse records requiring repair.
        // Never silently normalize a record as part of deletion or restoration.
        if (snapshot.links.length !== links.length || links.some((link, index) =>
            Object.keys(snapshot.links[index]).some(key => !this.sameShortcutUndoValue(link[key], snapshot.links[index][key])))) {
            throw this.shortcutUndoError('SHORTCUT_UNDO_INVALID', 'Stored shortcuts require review before deleting or restoring.');
        }
        if (Object.prototype.hasOwnProperty.call(raw, 'schemaVersion') &&
            raw.schemaVersion !== (LayoutIdentity.active(raw.layout) ? 2 : 1)) {
            throw this.shortcutUndoError('SHORTCUT_UNDO_INVALID', 'Unsupported shortcut schema.');
        }
        return { ...snapshot, links: this.copyBookmarkImportValue(links) };
    }

    async verifyShortcutUndoWrite(raw, written) {
        try {
            await this._local.set(written);
            const readback = await this._local.get(null);
            const actual = this.shortcutUndoState(readback);
            if (!this.sameShortcutUndoValue(actual, this.shortcutUndoState({ ...raw, ...written }))) {
                throw new Error('Shortcut write did not match its readback.');
            }
            return { snapshot: this.shortcutUndoSnapshot(readback), state: actual };
        } catch (cause) {
            const error = this.shortcutUndoError('SHORTCUT_UNDO_UNVERIFIED', 'The change could not be verified. It may already be saved. Reload this page to check before trying again.');
            error.mayHaveCommitted = true; error.cause = cause; throw error;
        }
    }

    async scheduleShortcutUndoSync() {
        // Local success stands independently of provider scheduling.
        try {
            if (!this._isApplyingSync && await this.isSyncEnabledLocally()) this.scheduleSyncPush();
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error; console.warn('Shortcuts saved locally; sync scheduling failed:', error); }
    }

    async readShortcutOrganizerSnapshot() {
        return this.withLocalWriteLock(async () => {
            const raw = await this._local.get(null);
            const snapshot = this.shortcutUndoSnapshot(raw);
            return { ...snapshot, categories: this.copyBookmarkImportValue(raw.categories === undefined ? this.defaultConfig.categories : raw.categories),
                state: this.shortcutUndoState(raw) };
        }, true);
    }

    catalogCanonicalURL(value) {
        if (typeof value !== 'string' || !/^https?:\/\//i.test(value) ||
            /[\s\u0000-\u001f\u007f-\u009f\\\ufffd]/u.test(value) || /%(?![a-f0-9]{2})/i.test(value)) return null;
        try {
            const authority = value.slice(value.indexOf('://') + 3).split(/[/?#]/, 1)[0];
            const url = new URL(value);
            if (!authority || authority.includes('@') || !url.hostname || url.username || url.password) return null;
            return url.href;
        } catch (_) { return null; }
    }

    navigationLibrarySnapshot(raw) {
        const fail = () => { throw this.shortcutUndoError('CATALOG_INVALID', 'Saved sites or privacy settings require review before adding a site.'); };
        try {
            // Workspace migration accepts absent legacy cosmetic fields without
            // rewriting saved records. Validate that same projection here only;
            // deletion/restoration stay strict and freshness still uses raw data.
            const links = raw.links === undefined ? this.defaultConfig.links : raw.links;
            const projectedLinks = Array.isArray(links) ? links.map(link =>
                link && typeof link === 'object' && !Array.isArray(link)
                    ? { icon: '🌐', category: 'work', ...link } : link) : links;
            const snapshot = this.shortcutUndoSnapshot({ ...raw, links: projectedLinks });
            snapshot.links = this.copyBookmarkImportValue(links);
            const categories = this.copyBookmarkImportValue(raw.categories === undefined ? this.defaultConfig.categories : raw.categories);
            if (!Array.isArray(categories) || categories.length > BOOKMARK_IMPORT_STORAGE_LIMITS.categories ||
                snapshot.links.length > BOOKMARK_IMPORT_STORAGE_LIMITS.links) fail();
            const ids = new Set();
            for (const category of categories) {
                if (!category || typeof category.id !== 'string' || !category.id || ids.has(category.id) ||
                    typeof category.name !== 'string' || !category.name.trim()) fail();
                ids.add(category.id);
            }
            const sync = raw.sync === undefined ? this.defaultConfig.sync : raw.sync;
            const settings = raw.privacy === undefined ? this.defaultConfig.privacy : raw.privacy;
            if (!sync || typeof sync.enabled !== 'boolean' || !settings || typeof settings.onlineFavicons !== 'boolean') fail();
            const privacy = { syncEnabled: sync.enabled, onlineFavicons: settings.onlineFavicons };
            // Sync is device-global but only the default workspace participates.
            // Keep the global flag in the guard so a preference change still
            // invalidates the review even when this workspace cannot sync.
            const effectivePrivacy = { ...privacy,
                syncEnabled: privacy.syncEnabled && (!this.workspace || this.workspace.id === 'default') };
            return { ...snapshot, categories, privacy: effectivePrivacy,
                state: { ...this.shortcutUndoState(raw), catalogPrivacy: privacy } };
        } catch (cause) {
            if (cause.code?.startsWith('WORKSPACE_') || cause.code === 'CATALOG_INVALID') throw cause;
            const error = this.shortcutUndoError('CATALOG_INVALID', 'Saved sites require review before adding a site.');
            error.cause = cause; throw error;
        }
    }

    async readNavigationLibrarySnapshot() {
        return this.withLocalWriteLock(async () => this.navigationLibrarySnapshot(await this._local.get(null)), true);
    }

    createCatalogCategoryIdentity() {
        const bytes = new Uint8Array(16);
        if (!globalThis.crypto?.getRandomValues) throw this.shortcutUndoError('CATALOG_INVALID', 'Secure category identity allocation is unavailable.');
        globalThis.crypto.getRandomValues(bytes);
        return `cat_library_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
    }

    async addCatalogShortcut(request) {
        // A review object is an immutable retry ticket. A retry first observes
        // saved state, including privacy, and never blindly repeats a write.
        const invalid = () => this.shortcutUndoError('CATALOG_INVALID', 'A valid site and a fresh library preview are required.');
        if (!request || typeof request !== 'object' || Array.isArray(request)) throw invalid();
        this._catalogRequests ||= new WeakMap();
        let ticket = this._catalogRequests.get(request);
        if (!ticket) {
            let plan;
            try { plan = this.copyBookmarkImportValue(request); } catch (_) { throw invalid(); }
            const batch = Object.prototype.hasOwnProperty.call(plan, 'sites');
            if (batch && Object.prototype.hasOwnProperty.call(plan, 'site')) throw invalid();
            const sites = batch ? plan.sites : [plan.site];
            const newCategory = Object.prototype.hasOwnProperty.call(plan, 'newCategory');
            const hasDestination = Object.prototype.hasOwnProperty.call(plan, 'destination');
            if (newCategory === hasDestination) throw invalid();
            if (newCategory) {
                const category = plan.newCategory;
                if (!category || typeof category !== 'object' || Array.isArray(category) ||
                    Object.keys(category).some(key => key !== 'name') || plan.confirmedNewCategory !== true) throw invalid();
                if (typeof category.name !== 'string' || /[\u0000-\u001f\u007f-\u009f]/u.test(category.name)) {
                    throw this.shortcutUndoError('CATALOG_CATEGORY_NAME', 'Choose a category name of 1 to 80 characters without control characters.');
                }
                category.name = category.name.trim().normalize('NFC');
                if (!category.name || Array.from(category.name).length > 80) {
                    throw this.shortcutUndoError('CATALOG_CATEGORY_NAME', 'Choose a category name of 1 to 80 characters.');
                }
            }
            if (!plan.baseline || typeof plan.baseline !== 'object' || !plan.baseline.catalogPrivacy ||
                (!newCategory && (typeof plan.destination !== 'string' || !plan.destination)) ||
                !Array.isArray(sites) || !sites.length || sites.length > 20) throw invalid();
            // Validate the whole selection before looking for duplicates or
            // allocating identities. An invalid later entry aborts everything.
            const candidates = sites.map(site => {
                const url = this.catalogCanonicalURL(site?.url);
                if (!site || typeof site.name !== 'string' || !site.name.trim() || site.name !== site.name.trim() || site.name.length > 160 ||
                    /[\u0000-\u001f\u007f]/.test(site.name) || !url || !url.startsWith('https://') ||
                    typeof site.icon !== 'string' || !site.icon.trim() || site.icon.length > 64 ||
                    /[<>\u0000-\u001f\u007f]|(?:https?:|data:|javascript:|\/\/)/i.test(site.icon)) throw invalid();
                return { title: site.name, url, icon: site.icon, category: plan.destination };
            });
            ticket = { plan, batch, candidates, newCategory, createdCategory: null, destination: newCategory ? null : plan.destination, attempted: false };
            this._catalogRequests.set(request, ticket);
        }
        if (ticket.pending) return ticket.pending;
        const result = snapshot => ({ ...snapshot,
            ...(ticket.newCategory ? {
                createdCategory: ticket.createdCategory ? this.copyBookmarkImportValue(ticket.createdCategory) : null,
                destination: ticket.destination } : {}),
            ...(ticket.batch ? { addedCount: ticket.addedCount, skippedCount: ticket.skippedCount }
                : { duplicate: ticket.addedCount === 0 }) });
        ticket.pending = this.withLocalWriteLock(async () => {
            let raw;
            try { raw = await this._local.get(null); } catch (cause) {
                if (cause.code?.startsWith('WORKSPACE_')) throw cause;
                const error = this.shortcutUndoError(ticket.attempted ? 'CATALOG_UNVERIFIED' : 'CATALOG_FAILED',
                    ticket.attempted ? 'Could not read the saved result. Reopen the library before trying again.' : 'Could not read saved sites. Nothing was added.');
                if (ticket.attempted) error.mayHaveCommitted = true;
                error.cause = cause; throw error;
            }
            const snapshot = this.navigationLibrarySnapshot(raw);
            const same = (left, right) => this.sameShortcutUndoValue(left, right);
            if (ticket.attempted && same(snapshot.state, ticket.after)) {
                this._shortcutUndoTicket = null; ticket.completed = true;
                return result(snapshot);
            }
            const conflict = () => this.shortcutUndoError('CATALOG_CONFLICT', 'Saved sites, categories, layout or privacy changed. Refresh the library before adding.');
            if (ticket.completed || !same(snapshot.state, ticket.plan.baseline)) throw conflict();
            if (ticket.newCategory) {
                const key = ticket.plan.newCategory.name.toLowerCase();
                if (snapshot.categories.some(category => category.name.trim().normalize('NFC').toLowerCase() === key)) {
                    throw this.shortcutUndoError('CATALOG_CATEGORY_EXISTS', 'A category with that name already exists. Choose it or enter a different name.');
                }
            } else if (!snapshot.categories.some(category => category.id === ticket.plan.destination)) throw conflict();
            const urls = new Set(snapshot.links.map(link => this.catalogCanonicalURL(link.url) || getStoredURL()?.destinationForSavedURL(link.url)).filter(Boolean));
            const additions = [];
            for (const candidate of ticket.candidates) {
                if (urls.has(candidate.url)) continue;
                urls.add(candidate.url); additions.push({ ...candidate });
            }
            ticket.addedCount = additions.length;
            ticket.skippedCount = ticket.candidates.length - additions.length;
            if (!additions.length) return result(snapshot);
            if (snapshot.links.length + additions.length > BOOKMARK_IMPORT_STORAGE_LIMITS.links) throw invalid();
            if (ticket.newCategory) {
                if (snapshot.categories.length >= BOOKMARK_IMPORT_STORAGE_LIMITS.categories) throw invalid();
                const reserved = new Set(['all', '__proto__', 'constructor', 'prototype',
                    ...snapshot.categories.map(category => category.id), ...snapshot.links.map(link => link.category)]);
                // Legacy position keys are category|URL, including orphan views.
                for (const key of Object.keys(raw.layout?.positions || {})) {
                    reserved.add(key.split('|', 1)[0]);
                    try {
                        const parsed = JSON.parse(key);
                        if (Array.isArray(parsed) && typeof parsed[0] === 'string') reserved.add(parsed[0]);
                    } catch (_) { /* Legacy category|URL keys are not JSON. */ }
                }
                for (const views of Object.values(raw.layout?.positionsById || {})) {
                    for (const view of Object.keys(views)) reserved.add(view);
                }
                let id;
                for (let attempt = 0; attempt < 32; attempt++) {
                    id = this.createCatalogCategoryIdentity();
                    if (/^cat_library_[a-f0-9]{32}$/.test(id) && !reserved.has(id)) break;
                    id = null;
                }
                if (!id) throw invalid();
                ticket.createdCategory = { id, name: ticket.plan.newCategory.name, icon: '📁' };
                ticket.destination = id;
                for (const link of additions) link.category = id;
            }
            const written = { links: [...snapshot.links, ...additions], [this.layoutGenerationKey]: this.createLayoutGeneration() };
            if (ticket.newCategory) written.categories = [...snapshot.categories, ticket.createdCategory];
            // Legacy workspaces stay legacy. Identity mode adds fresh entries
            // only; all existing positions and unknown fields survive.
            if (LayoutIdentity.active(raw.layout)) {
                const layout = this.copyBookmarkImportValue(raw.layout);
                const reserved = new Set([...snapshot.links.map(item => item.layoutId), ...Object.keys(layout.positionsById)]);
                for (const link of additions) {
                    let id;
                    for (let attempt = 0; attempt < 32; attempt++) {
                        id = this.createLayoutIdentity();
                        if (LayoutIdentity.idPattern.test(id) && !reserved.has(id)) break;
                        id = null;
                    }
                    if (!id) throw invalid();
                    reserved.add(id); link.layoutId = id; layout.positionsById[id] = {};
                }
                written.layout = layout;
            }
            ticket.after = this.navigationLibrarySnapshot({ ...raw, ...written }).state;
            ticket.attempted = true;
            let failure;
            try { await this._local.set(written); } catch (error) { failure = error; }
            try {
                const saved = this.navigationLibrarySnapshot(await this._local.get(null));
                if (same(saved.state, ticket.after)) {
                    this._shortcutUndoTicket = null; ticket.completed = true;
                    return result(saved);
                }
                if (same(saved.state, ticket.plan.baseline)) {
                    const error = this.shortcutUndoError('CATALOG_FAILED', 'Nothing was added. Retry the reviewed selection.');
                    error.cause = failure; throw error;
                }
            } catch (error) { if (error.code === 'CATALOG_FAILED' || error.code?.startsWith('WORKSPACE_')) throw error; }
            const error = this.shortcutUndoError('CATALOG_UNVERIFIED', 'Could not verify the addition. Retry checks the saved result before writing.');
            error.mayHaveCommitted = true; throw error;
        }, true);
        try {
            const saved = await ticket.pending;
            if (ticket.addedCount > 0) { try { await this.scheduleShortcutUndoSync(); } catch (_) {} }
            return saved;
        } finally { ticket.pending = null; }
    }

    async moveShortcutsToCategory(request) {
        // The same review object is the retry identity. Never infer completion
        // from matching titles/URLs, which may represent distinct legacy twins.
        this._organizerRequests ||= new WeakMap();
        let ticket = this._organizerRequests.get(request);
        if (!ticket) {
            ticket = { plan: this.copyBookmarkImportValue(request), attempted: false };
            this._organizerRequests.set(request, ticket);
        }
        if (ticket.pending) return ticket.pending;
        ticket.pending = this.withLocalWriteLock(async () => {
            const raw = await this._local.get(null);
            const current = this.shortcutUndoState(raw);
            if (ticket.attempted && this.sameShortcutUndoValue(current, ticket.after)) { ticket.completed = true; return this.shortcutUndoSnapshot(raw); }
            const conflict = () => this.shortcutUndoError('ORGANIZER_CONFLICT', 'Saved sites, categories or layout changed. Cancel and reopen to review the latest sites.');
            if (ticket.completed || !this.sameShortcutUndoValue(current, ticket.plan.baseline)) throw conflict();
            const snapshot = this.shortcutUndoSnapshot(raw);
            const categories = raw.categories === undefined ? this.defaultConfig.categories : raw.categories;
            const {indices, destination} = ticket.plan;
            if (!Array.isArray(categories) || categories.filter(category => category.id === destination).length !== 1 ||
                !Array.isArray(indices) || !indices.length || new Set(indices).size !== indices.length ||
                indices.some(index => !Number.isInteger(index) || !snapshot.links[index] || snapshot.links[index].category === destination)) throw conflict();
            const selected = new Set(indices);
            const links = snapshot.links.map((link, index) => selected.has(index) ? { ...link, category: destination } : link);
            LayoutIdentity.validateBundle({ ...raw, links });
            ticket.after = this.shortcutUndoState({ ...raw, links });
            ticket.attempted = true;
            // One atomic write; no identity allocation, reordering or coordinate
            // migration. All source categories and unknown fields stay intact.
            let failure;
            try { await this._local.set({ links }); } catch (error) { failure = error; }
            try {
                const readback = await this._local.get(null);
                const actual = this.shortcutUndoState(readback);
                if (this.sameShortcutUndoValue(actual, ticket.after)) {
                    this._shortcutUndoTicket = null; ticket.completed = true;
                    return this.shortcutUndoSnapshot(readback);
                }
                if (this.sameShortcutUndoValue(actual, ticket.plan.baseline)) {
                    const error = this.shortcutUndoError('ORGANIZER_FAILED', 'Nothing was moved. Retry the reviewed move.');
                    error.cause = failure; throw error;
                }
            } catch (error) { if (error.code === 'ORGANIZER_FAILED' || error.code?.startsWith('WORKSPACE_')) throw error; }
            const error = this.shortcutUndoError('ORGANIZER_UNVERIFIED', 'Could not verify the move. Retry checks the saved result before writing.');
            error.mayHaveCommitted = true; throw error;
        }, true);
        try {
            const saved = await ticket.pending;
            // Provider scheduling cannot turn a verified local save into a failure.
            try { await this.scheduleShortcutUndoSync(); } catch (_) {}
            return saved;
        } finally { ticket.pending = null; }
    }

    async deleteShortcutWithUndo(index, options = {}) {
        const expected = this.copyBookmarkImportValue(options.expectedLinks);
        await this.ensureSyncInitialized();
        let result;
        try {
            result = await this.withLocalWriteLock(async () => {
                const raw = await this._local.get(null);
                const currentState = this.shortcutUndoState(raw);
                if (this._shortcutUndoTicket && !this.sameShortcutUndoValue(currentState, this._shortcutUndoTicket.state)) {
                    this._shortcutUndoTicket = null;
                }
                const latest = this.shortcutUndoSnapshot(raw);
                if (!this.sameShortcutUndoValue(this.validateStoredLinksConfig(expected), this.validateStoredLinksConfig(latest.links)) ||
                    (Object.prototype.hasOwnProperty.call(options, 'expectedLayoutGeneration') && options.expectedLayoutGeneration !== latest.generation)) {
                    const error = this.shortcutUndoError('LINKS_CONFLICT', 'Shortcuts changed in another tab. Reopen the shortcut and try again.');
                    error.latestLinks = latest.links; throw error;
                }
                if (!Number.isInteger(index) || index < 0 || index >= latest.links.length) {
                    throw this.shortcutUndoError('SHORTCUT_UNDO_INVALID', 'The shortcut no longer exists.');
                }
                const record = this.copyBookmarkImportValue(latest.links[index]);
                const links = latest.links.filter((_, slot) => slot !== index);
                const written = { links };
                if (LayoutIdentity.needs(links)) {
                    const assignment = LayoutIdentity.allocate(links, raw.layout || this.defaultConfig.layout,
                        latest.links, { type: 'delete', index }, () => this.createLayoutIdentity());
                    written.links = assignment.links; written.layout = assignment.layout;
                    written[this.layoutGenerationKey] = this.createLayoutGeneration();
                    if (Object.prototype.hasOwnProperty.call(raw, 'schemaVersion')) written.schemaVersion = 2;
                    if (!LayoutIdentity.active(raw.layout) && !raw[this.identityRecoveryKey]) written[this.identityRecoveryKey] = await this.makeRecovery(raw, 'beforeIdentity');
                }
                LayoutIdentity.validateBundle({ ...raw, ...written });
                const verified = await this.verifyShortcutUndoWrite(raw, written);
                const receipt = Object.freeze({});
                // No caller-owned baseline and no read after releasing the lock.
                this._shortcutUndoTicket = { receipt, record, index, state: verified.state };
                return { snapshot: verified.snapshot, receipt };
            }, true);
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            // A definite pre-write failure does not erase the previous verified
            // deletion. Its next Undo still performs an authoritative lock read.
            if (error.code === 'LINKS_CONFLICT' || error.mayHaveCommitted) this._shortcutUndoTicket = null;
            if (!this._shortcutUndoTicket) error.invalidatesShortcutUndo = true;
            throw error;
        }
        await this.scheduleShortcutUndoSync();
        return result;
    }

    async undoShortcutDeletion(receipt) {
        const ticket = this._shortcutUndoTicket;
        if (!ticket || ticket.receipt !== receipt) throw this.shortcutUndoError('SHORTCUT_UNDO_INVALID', 'This deletion can no longer be undone.');
        this._shortcutUndoTicket = null; // Consume before awaiting: double clicks cannot retry.
        await this.ensureSyncInitialized();
        const result = await this.withLocalWriteLock(async () => {
            const raw = await this._local.get(null);
            if (!this.sameShortcutUndoValue(this.shortcutUndoState(raw), ticket.state)) {
                throw this.shortcutUndoError('SHORTCUT_UNDO_CONFLICT', 'Shortcuts, categories, or layout changed. This deletion can no longer be undone.');
            }
            const latest = this.shortcutUndoSnapshot(raw);
            const record = this.copyBookmarkImportValue(ticket.record);
            const categories = raw.categories === undefined ? this.defaultConfig.categories : raw.categories;
            if (!Array.isArray(categories) || !categories.some(category => category?.id === record.category)) {
                throw this.shortcutUndoError('SHORTCUT_UNDO_CONFLICT', 'The deleted shortcut category is unavailable.');
            }
            if (record.layoutId && latest.links.some(link => link.layoutId === record.layoutId)) {
                throw this.shortcutUndoError('SHORTCUT_UNDO_CONFLICT', 'The deleted shortcut identity is already in use.');
            }
            const links = latest.links.slice(); links.splice(ticket.index, 0, record);
            const written = { links };
            if (LayoutIdentity.needs(links)) {
                // All entries are historic, including the restored record. Use
                // the complete restored list as allocation provenance, not Add.
                const assignment = LayoutIdentity.allocate(links, raw.layout || this.defaultConfig.layout,
                    links, null, () => this.createLayoutIdentity());
                written.links = assignment.links; written.layout = assignment.layout;
                written[this.layoutGenerationKey] = this.createLayoutGeneration();
                if (Object.prototype.hasOwnProperty.call(raw, 'schemaVersion')) written.schemaVersion = 2;
                if (!LayoutIdentity.active(raw.layout) && !raw[this.identityRecoveryKey]) written[this.identityRecoveryKey] = await this.makeRecovery(raw, 'beforeIdentity');
            }
            LayoutIdentity.validateBundle({ ...raw, ...written });
            return (await this.verifyShortcutUndoWrite(raw, written)).snapshot;
        }, true);
        await this.scheduleShortcutUndoSync();
        return result;
    }

    validateShortcutOperation(previous, next, operation) {
        const sources = previous.map((_, index) => index);
        const validIndex = index => Number.isInteger(index) && index >= 0 && index < previous.length;
        if (operation.type === 'add' && Number.isInteger(operation.index) && operation.index === previous.length) sources.push(null);
        else if (operation.type === 'edit' && validIndex(operation.index)) { /* Same record. */ }
        else if (operation.type === 'delete' && validIndex(operation.index)) sources.splice(operation.index, 1);
        else if (operation.type === 'reorder' && validIndex(operation.from) && validIndex(operation.to)) sources.splice(operation.to, 0, sources.splice(operation.from, 1)[0]);
        else LayoutIdentity.invalid('Invalid shortcut operation.');
        if (sources.length !== next.length) LayoutIdentity.invalid('Shortcut operation no longer matches its baseline.');
        sources.forEach((source, index) => {
            if (source === null) { if (next[index].layoutId) LayoutIdentity.invalid('A new shortcut cannot reuse a layout ID.'); return; }
            if (previous[source].layoutId !== next[index].layoutId) LayoutIdentity.invalid('A shortcut edit cannot strip or replace its layout ID.');
            if (!(operation.type === 'edit' && index === operation.index) && JSON.stringify(previous[source]) !== JSON.stringify(next[index])) LayoutIdentity.invalid('Shortcut operation changed an unrelated record.');
        });
    }

    createLayoutIdentity() {
        const bytes = new Uint8Array(16);
        if (!globalThis.crypto?.getRandomValues) LayoutIdentity.invalid('Secure layout identity allocation is unavailable.');
        globalThis.crypto.getRandomValues(bytes);
        return `l_${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
    }

    async fingerprint(value) {
        const stable = item => Array.isArray(item) ? item.map(stable) : item && typeof item === 'object' ?
            Object.fromEntries(Object.keys(item).sort().map(key => [key, stable(item[key])])) : item;
        const bytes = new TextEncoder().encode(JSON.stringify(stable(value)));
        const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async makeRecovery(raw, reason) {
        const payload = this.buildManualExportPayload(this.validateStoredConfigObject(raw));
        return { reason, payload, providerState: this.validateSyncConfig(raw.sync || this.defaultConfig.sync), checksum: await this.fingerprint(payload) };
    }

    importClosureService() {
        const api = getImportClosureService();
        if (!api?.create) throw Object.assign(new Error('Local import closure is unavailable.'), { code: 'IMPORT_CLOSURE_UNAVAILABLE' });
        return api.create(this);
    }
    reviewImportClosure(options) { return this.importClosureService().review(options); }
    commitImportClosure(review, options) { return this.importClosureService().confirm(review, options); }
    cancelImportClosure(review) { return this.importClosureService().cancel(review); }
    recheckImportClosure() { return this.importClosureService().recheck(); }
    confirmClosedRestore(review, options) { return this.importClosureService().confirmClosedRestore(review, options); }
    cancelClosedRestore(value) { return this.importClosureService().cancelClosedRestore(value); }

    restoreReceiptError(code) {
        const messages = {
            RESTORE_CLOSED_RECONFIRM: 'This earlier unverified import was explicitly ended while keeping current settings. Review and confirm this file again to start a new import; its local evidence archive will be retained.',
            RESTORE_UNCERTAIN: 'The import may already have been saved. Its recovery copy is retained. Retry the same file to verify it; do not replace it blindly.',
            RESTORE_PENDING_CONFLICT: 'The previous import is unverified and the current settings or recovery copy have changed. Import is blocked; the current content and retained recovery copy have not been replaced. Export the current configuration and open Recovery to inspect and export the earlier copy. Reopening Settings or retrying cannot unlock this conflict; this version has no automatic resolution.',
            RESTORE_RETRY_CONFLICT: 'This file was already imported, but settings have since changed. Review the current settings and recovery copy before starting a new import.',
            RESTORE_RECONFIRM: 'The previous import is now verified and its recovery copy is retained. Review the current settings, then confirm the new import again.',
            RESTORE_RECEIPT_INVALID: 'The retained import receipt could not be verified. No replacement was submitted. Review the recovery copy.'
        };
        const key = { RESTORE_CLOSED_RECONFIRM: 'restoreClosedReconfirm', RESTORE_UNCERTAIN: 'restoreUncertain', RESTORE_RETRY_CONFLICT: 'restoreRetryConflict', RESTORE_PENDING_CONFLICT: 'restorePendingConflict', RESTORE_RECONFIRM: 'restoreReconfirm', RESTORE_RECEIPT_INVALID: 'restoreReceiptInvalid' }[code];
        return Object.assign(new Error(this.chromeApi?.i18n?.getMessage?.(key) || messages[code]), { code });
    }

    restoreReceiptState(raw) {
        const keys = [...Object.keys(this.defaultConfig).filter(key => key !== 'sync'), 'schemaVersion', this.layoutGenerationKey, this.settingsGenerationKey];
        return Object.fromEntries(keys.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]]));
    }

    async restoreRequestHash(values) {
        // Provider preferences are live device state, never the imported request.
        return this.fingerprint(Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'sync')));
    }

    validateRestoreReceipt(receipt) {
        if (!receipt || receipt.version !== 1 || !['pending', 'verified'].includes(receipt.status) ||
            Object.keys(receipt).sort().join(',') !== 'recovery,request,status,target,version' ||
            !['request', 'target', 'recovery'].every(key => typeof receipt[key] === 'string' && /^[a-f0-9]{64}$/.test(receipt[key]))) {
            throw this.restoreReceiptError('RESTORE_RECEIPT_INVALID');
        }
    }

    async verifyRestoreReceipt(raw, receipt) {
        this.validateRestoreReceipt(receipt);
        if (!raw[this.restoreRecoveryKey] || await this.fingerprint(raw[this.restoreRecoveryKey]) !== receipt.recovery ||
            await this.fingerprint(this.restoreReceiptState(raw)) !== receipt.target) {
            throw this.restoreReceiptError('RESTORE_RETRY_CONFLICT');
        }
    }

    async settleRestoreReceipt(receipt) {
        if (receipt.status === 'pending' && this.workspace) await this.importClosureService().assertUnclosedReceipt(receipt);
        const raw = await this._local.get(null);
        if (await this.fingerprint(raw[this.restoreReceiptKey] || null) !== await this.fingerprint(receipt)) throw this.restoreReceiptError('RESTORE_RECEIPT_INVALID');
        try { await this.verifyRestoreReceipt(raw, receipt); }
        catch (error) {
            if (receipt.status === 'pending' && error.code === 'RESTORE_RETRY_CONFLICT') throw this.restoreReceiptError('RESTORE_PENDING_CONFLICT');
            throw error;
        }
        if (receipt.status === 'verified') return;
        const verified = { ...receipt, status: 'verified' };
        if (await this._local.set({ [this.restoreReceiptKey]: verified }) === false) throw this.restoreReceiptError('RESTORE_UNCERTAIN');
        const saved = (await this._local.get([this.restoreReceiptKey]))[this.restoreReceiptKey];
        if (await this.fingerprint(saved || null) !== await this.fingerprint(verified)) throw this.restoreReceiptError('RESTORE_UNCERTAIN');
    }

    async reconcileRestoreReceipt(raw, values, options) {
        const receipt = raw[this.restoreReceiptKey];
        if (receipt === undefined) return false;
        this.validateRestoreReceipt(receipt);
        if (receipt.status === 'pending' && this.workspace) {
            const closed = await this.importClosureService().reconcile(raw, values, options);
            if (closed) return closed;
        }
        const sameRequest = receipt.request === await this.restoreRequestHash(values);
        if (receipt.status === 'pending') {
            // Even another file cannot replace an unverified transaction. A
            // matching readback settles only the earlier operation; the user
            // must then explicitly confirm the new operation in a later call.
            await this.settleRestoreReceipt(receipt);
            if (!sameRequest) throw this.restoreReceiptError('RESTORE_RECONFIRM');
            return true;
        }
        if (!sameRequest || options.newRestoreOperation === true) return false;
        try { await this.verifyRestoreReceipt(raw, receipt); }
        catch (error) {
            if (error.code === 'RESTORE_RETRY_CONFLICT') error.canStartNewRestore = true;
            throw error;
        }
        return true;
    }

    async persistVerifiedSyncRecovery(recovery, previous) {
        if (previous) recovery.previousRecovery = LayoutIdentity.copy(previous);
        // Hash before handing a detached value to the backend. Readback must
        // prove the requested copy, not merely echo a mutated input object.
        const expected = await this.fingerprint(recovery);
        await this._local.set({ [this.restoreRecoveryKey]: LayoutIdentity.copy(recovery) });
        const saved = (await this._local.get([this.restoreRecoveryKey]))[this.restoreRecoveryKey];
        if (!saved || await this.fingerprint(saved) !== expected) {
            throw new Error('The recovery backup could not be verified. No replacement was submitted.');
        }
    }

    async getRecoveryBackup(kind = 'latest') {
        const keys = kind === 'original' ? [this.identityRecoveryKey] : [this.restoreRecoveryKey, this.identityRecoveryKey];
        const raw = await this._local.get(keys);
        const recovery = keys.map(key => raw[key]).find(Boolean);
        if (!recovery) throw new Error('No recovery backup is available.');
        if (await this.fingerprint(recovery.payload) !== recovery.checksum) throw new Error('Recovery backup integrity check failed.');
        this.validateImportPayload(recovery.payload);
        return LayoutIdentity.copy(recovery.payload);
    }

    async getRecoveryAvailability() {
        const raw = await this._local.get([this.restoreRecoveryKey, this.identityRecoveryKey]);
        return { original: Boolean(raw[this.identityRecoveryKey]), latest: Boolean(raw[this.restoreRecoveryKey] || raw[this.identityRecoveryKey]) };
    }

    async getSyncCompatibilityStatus() {
        const raw = await this._local.get([this.syncIdentityStateKey]);
        return raw[this.syncIdentityStateKey]?.blocked || this._syncCompatibilityError;
    }

    losesIdentityHistory(before, after) {
        if (!LayoutIdentity.active(before.layout)) return false;
        if (!LayoutIdentity.active(after.layout)) return true;
        return Object.entries(before.layout.positionsById).some(([id, views]) =>
            !Object.prototype.hasOwnProperty.call(after.layout.positionsById, id) ||
            Object.keys(views).some(view => !Object.prototype.hasOwnProperty.call(after.layout.positionsById[id], view)));
    }

    /**
     * Set a value in storage with validation
     * @param {string} key - Storage key
     * @param {*} value - Value to store
     * @returns {Promise<boolean>} - Success status
     */
    async set(key, value, options = {}) {
        this.assertConfigurationKeys([key]);
        try {
            // Snapshot the caller value before yielding to another mutation.
            const validatedValue = this.validateStoredData(key, value);
            if (key === 'clock' && Object.prototype.hasOwnProperty.call(options, 'expectedClock')) {
                options = { ...options, expectedClock: this.validateClockBaseline(options.expectedClock) };
            }
            await this.ensureSyncInitialized();

            const committed = await this.writeLocalValues({ [key]: validatedValue }, options);

            if (!this._isApplyingSync) {
                if (key === 'sync') {
                    if (validatedValue.enabled) {
                        this.scheduleSyncPush();
                    } else {
                        await this.disableRemoteSync();
                    }
                } else if (await this.isSyncEnabledLocally()) {
                    this.scheduleSyncPush();
                }
            }

            return options.returnSnapshot ? committed : true;
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            if (error.code === 'LINKS_CONFLICT' || error.code === 'LINKS_LOCK_UNAVAILABLE' || error.code === 'CATEGORIES_CONFLICT' || error.code === 'CLOCK_CONFLICT' || error.code === 'CLOCK_LOCK_UNAVAILABLE') throw error;
            console.error(`Storage set error for key "${key}":`, error);
            
            // Handle quota exceeded error
            if (error.message && error.message.includes('QUOTA_EXCEEDED')) {
                throw new Error('Storage quota exceeded. Please remove some data or export your settings.');
            }
            
            return false;
        }
    }

    // Mutation reads must never turn unavailable/corrupt data into a default.
    async getLayoutForUpdate() {
        const raw = await this._local.get(['layout']);
        return this.validateStoredLayout(raw.layout);
    }

    validateStoredLayout(raw) {
        const value = raw === undefined ? this.defaultConfig.layout : raw;
        const object = entry => entry !== null && typeof entry === 'object' && !Array.isArray(entry);
        if (!object(value) || (value.positions !== undefined && !object(value.positions)) ||
            ['autoArrange', 'alignToGrid'].some(key => value[key] !== undefined && typeof value[key] !== 'boolean') ||
            ['gridSize', 'columns'].some(key => value[key] !== undefined && !Number.isFinite(value[key])) ||
            Object.values(value.positions || {}).some(pos => !object(pos) || !Number.isFinite(pos.x) || !Number.isFinite(pos.y))) {
            throw new Error('Stored layout settings are invalid.');
        }
        return JSON.parse(JSON.stringify(this.validateLayoutConfig(value)));
    }

    createLayoutGeneration() {
        return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    }

    readLayoutGeneration(raw) {
        const value = raw[this.layoutGenerationKey];
        if (value === undefined) return null; // Successful legacy read, no migration.
        if (typeof value !== 'string' || !value.length) throw new Error('Stored layout generation is invalid.');
        return value;
    }

    layoutSchemaForMutation(raw, nextLayout) {
        if (!Object.prototype.hasOwnProperty.call(raw, 'schemaVersion')) return undefined;
        const previous = LayoutIdentity.active(raw.layout) ? 2 : 1;
        if (raw.schemaVersion !== previous) LayoutIdentity.invalid('Stored schema does not match layout identities.');
        // Only an explicit mutation/restore owns this transition. Startup and
        // read projections retain both the original marker and its absence.
        return LayoutIdentity.active(nextLayout) ? 2 : 1;
    }

    layoutSnapshot(raw) {
        const rawLinks = raw.links === undefined ? this.defaultConfig.links : raw.links;
        const links = this.validateStoredLinksConfig(rawLinks);
        LayoutIdentity.validateBundle({ links, layout: raw.layout || this.defaultConfig.layout });
        if (links.length !== rawLinks.length) throw new Error('Stored shortcuts are invalid.');
        return JSON.parse(JSON.stringify({
            layout: this.validateStoredLayout(raw.layout),
            generation: this.readLayoutGeneration(raw), links
        }));
    }

    async getLayoutSnapshotForUpdate({ underLock = false } = {}) {
        const read = async () => {
            const raw = await this._local.get(['layout', 'links', this.layoutGenerationKey, 'schemaVersion']);
            // Unknown/mismatched schemas must not become a fresh write baseline,
            // including after an unverified compatibility write and restart.
            this.layoutSchemaForMutation(raw, raw.layout);
            return this.layoutSnapshot(raw);
        };
        return underLock ? read() : this.withLocalWriteLock(read);
    }

    bookmarkImportError(code, message) {
        const error = new Error(message); error.code = code; return error;
    }

    // Bound caller-owned snapshots before cloning/stringifying or passing them
    // to the pure planner, which deliberately does not bound existing state.
    copyBookmarkImportValue(value) {
        let units = 0, nodes = 0;
        const ancestors = new Set();
        const invalid = () => { throw this.bookmarkImportError('BOOKMARK_IMPORT_INVALID_STATE', 'Stored bookmark data could not be safely compared.'); };
        const limit = () => { throw this.bookmarkImportError('BOOKMARK_IMPORT_STATE_LIMIT', 'The existing bookmark state is too large for safe import.'); };
        const charge = amount => { units += amount; if (units > BOOKMARK_IMPORT_STORAGE_LIMITS.bytes) limit(); };
        const walk = (item, depth) => {
            if (++nodes > BOOKMARK_IMPORT_STORAGE_LIMITS.nodes || depth > BOOKMARK_IMPORT_STORAGE_LIMITS.depth) limit();
            if (item === null || typeof item === 'boolean') { charge(8); return item; }
            if (typeof item === 'number') { if (!Number.isFinite(item)) invalid(); charge(24); return item; }
            if (typeof item === 'string') { charge(item.length * 3 + 2); return item; }
            if (!item || typeof item !== 'object' || ancestors.has(item)) invalid();
            const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
            // Allow plain JSON objects across realms; reject class instances,
            // inherited serializers, accessors, and cyclic caller-owned state.
            if (!array && prototype !== null && Object.getPrototypeOf(prototype) !== null) invalid();
            if (array && item.length > BOOKMARK_IMPORT_STORAGE_LIMITS.nodes) limit();
            ancestors.add(item);
            const result = array ? new Array(item.length) : {};
            let count = 0;
            // Do not allocate Object.keys on an unbounded corrupt caller object.
            for (const key in item) {
                if (!Object.prototype.hasOwnProperty.call(item, key)) continue;
                if (++count > BOOKMARK_IMPORT_STORAGE_LIMITS.nodes) limit();
                charge(key.length * 3 + 4);
                const descriptor = Object.getOwnPropertyDescriptor(item, key);
                if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) invalid();
                if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= item.length)) invalid();
                Object.defineProperty(result, key, { value: walk(descriptor.value, depth + 1), enumerable: true, configurable: true, writable: true });
            }
            if (array && count !== item.length) invalid();
            ancestors.delete(item);
            return result;
        };
        return walk(value, 0);
    }

    bookmarkImportReadKeys() {
        return ['links', 'categories', 'layout', 'sync', 'privacy', 'schemaVersion', this.layoutGenerationKey];
    }

    bookmarkImportSnapshot(raw) {
        const has = key => Object.prototype.hasOwnProperty.call(raw, key);
        const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
        const invalid = () => { throw this.bookmarkImportError('BOOKMARK_IMPORT_INVALID_STATE', 'Stored bookmark data is invalid. Review it before importing.'); };
        if (!object(raw)) invalid();
        const links = has('links') ? raw.links : this.defaultConfig.links;
        const categories = has('categories') ? raw.categories : this.defaultConfig.categories;
        if (!Array.isArray(links) || !Array.isArray(categories)) invalid();
        if (links.length > BOOKMARK_IMPORT_STORAGE_LIMITS.links || categories.length > BOOKMARK_IMPORT_STORAGE_LIMITS.categories) {
            throw this.bookmarkImportError('BOOKMARK_IMPORT_STATE_LIMIT', 'The existing bookmark state is too large for safe import.');
        }
        const selected = Object.fromEntries(this.bookmarkImportReadKeys().filter(has).map(key => [key, raw[key]]));
        const source = this.copyBookmarkImportValue({ ...selected,
            links, categories, layout: has('layout') ? raw.layout : this.defaultConfig.layout,
            sync: has('sync') ? raw.sync : this.defaultConfig.sync,
            privacy: has('privacy') ? raw.privacy : this.defaultConfig.privacy });
        const planner = getBookmarkImportPlanner();
        if (!planner || typeof planner.planImport !== 'function') throw this.bookmarkImportError('BOOKMARK_IMPORT_UNAVAILABLE', 'Bookmark import is unavailable. Reload Settings.');
        for (const link of source.links) {
            if (!object(link) || typeof link.title !== 'string' || !link.title.trim() || link.title !== link.title.trim() ||
                typeof link.url !== 'string' || !(planner.canonicalURL(link.url) || getStoredURL()?.destinationForSavedURL(link.url)) ||
                typeof link.icon !== 'string' || typeof link.category !== 'string' || !link.category) invalid();
        }
        const ids = new Set();
        for (const category of source.categories) {
            if (!object(category) || typeof category.id !== 'string' || !category.id || ids.has(category.id) ||
                typeof category.name !== 'string' || !category.name.trim() || category.name !== category.name.trim() ||
                typeof category.icon !== 'string' || !category.icon) invalid();
            ids.add(category.id);
        }
        const layout = source.layout;
        if (!object(layout) || (layout.positions !== undefined && !object(layout.positions)) ||
            ['autoArrange', 'alignToGrid'].some(key => layout[key] !== undefined && typeof layout[key] !== 'boolean') ||
            (layout.gridSize !== undefined && (!Number.isFinite(layout.gridSize) || layout.gridSize < 48 || layout.gridSize > 240)) ||
            (layout.columns !== undefined && (!Number.isInteger(layout.columns) || layout.columns < 1 || layout.columns > 10)) ||
            Object.values(layout.positions || {}).some(position => !object(position) || !Number.isFinite(position.x) || !Number.isFinite(position.y))) invalid();
        LayoutIdentity.validateBundle({ links: source.links, layout });
        if (has('schemaVersion') && (source.schemaVersion !== (LayoutIdentity.active(layout) ? 2 : 1))) invalid();
        if (!object(source.sync) || typeof source.sync.enabled !== 'boolean' ||
            !object(source.privacy) || typeof source.privacy.onlineFavicons !== 'boolean' ||
            ['lastSync', 'lastError'].some(key => source.sync[key] !== undefined && typeof source.sync[key] !== 'string') ||
            (source.sync.includeLargeAssets !== undefined && typeof source.sync.includeLargeAssets !== 'boolean')) invalid();
        const generation = this.readLayoutGeneration(source);
        const nonPositions = Object.fromEntries(Object.entries(layout).filter(([key]) => !['positions', 'positionsById'].includes(key)));
        return { version: 1, links: source.links, categories: source.categories, layout, generation,
            privacy: { syncEnabled: source.sync.enabled, onlineFavicons: source.privacy.onlineFavicons },
            context: { present: Object.fromEntries(['links', 'categories', 'layout', 'schemaVersion'].map(key => [key, has(key)])),
                schemaVersion: has('schemaVersion') ? source.schemaVersion : null,
                nonPositions, identityIds: Object.keys(layout.positionsById || {}).sort() } };
    }

    async getBookmarkImportSnapshot() {
        // Never use getAll/ensureSyncInitialized here: preview must not repair
        // damaged data, initialize providers, or write a fallback configuration.
        return this.withLocalWriteLock(async () => this.bookmarkImportSnapshot(await this._local.get(this.bookmarkImportReadKeys())), true);
    }

    async appendBookmarkImport({ text, expectedSnapshot, expectedPrivacy, batchId, rootLabel } = {}) {
        if (typeof text !== 'string' || typeof batchId !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(batchId) ||
            typeof rootLabel !== 'string' || !expectedSnapshot || expectedSnapshot.version !== 1) {
            throw this.bookmarkImportError('BOOKMARK_IMPORT_INVALID_REQUEST', 'A fresh bookmark preview is required.');
        }
        // Cheap array caps precede even the bounded recursive copy.
        if (!Array.isArray(expectedSnapshot.links) || !Array.isArray(expectedSnapshot.categories) ||
            expectedSnapshot.links.length > BOOKMARK_IMPORT_STORAGE_LIMITS.links || expectedSnapshot.categories.length > BOOKMARK_IMPORT_STORAGE_LIMITS.categories) {
            throw this.bookmarkImportError('BOOKMARK_IMPORT_STATE_LIMIT', 'The bookmark preview cannot be safely compared.');
        }
        expectedSnapshot = this.copyBookmarkImportValue(expectedSnapshot);
        expectedPrivacy = this.copyBookmarkImportValue(expectedPrivacy);
        if (!expectedPrivacy || typeof expectedPrivacy.syncEnabled !== 'boolean' || typeof expectedPrivacy.onlineFavicons !== 'boolean') {
            throw this.bookmarkImportError('BOOKMARK_IMPORT_INVALID_REQUEST', 'Bookmark privacy confirmation is missing.');
        }
        // Chrome storage preserves JSON values, not dictionary insertion order.
        // Match the strict local-content comparison: retain array order/type,
        // scalar types, and the exact set of own keys at every nesting level.
        const same = (left, right) => {
            if (left === right) return true;
            if (!left || !right || typeof left !== 'object' || typeof right !== 'object' ||
                Array.isArray(left) !== Array.isArray(right)) return false;
            if (Array.isArray(left) && left.length !== right.length) return false;
            const keys = Object.keys(left);
            return keys.length === Object.keys(right).length && keys.every(key =>
                Object.prototype.hasOwnProperty.call(right, key) && same(left[key], right[key]));
        };
        if (!same(expectedSnapshot.privacy, expectedPrivacy)) throw this.bookmarkImportError('BOOKMARK_IMPORT_INVALID_REQUEST', 'Bookmark privacy confirmation does not match the preview.');
        const result = await this.withLocalWriteLock(async () => {
            const latest = this.bookmarkImportSnapshot(await this._local.get(this.bookmarkImportReadKeys()));
            if (!same(latest.privacy, expectedPrivacy)) throw this.bookmarkImportError('BOOKMARK_IMPORT_PRIVACY_CHANGED', 'Sync or online icon settings changed. Preview the file again before importing.');
            if (latest.generation !== expectedSnapshot.generation || !same(latest.links, expectedSnapshot.links) ||
                !same(latest.categories, expectedSnapshot.categories) || !same(latest.context, expectedSnapshot.context)) {
                throw this.bookmarkImportError('BOOKMARK_IMPORT_CONFLICT', 'Shortcuts, categories, or layout context changed. Preview the file again before importing.');
            }
            const plan = getBookmarkImportPlanner().planImport(text, { links: latest.links, categories: latest.categories }, {
                rootLabel, createCategoryId: ({ index }) => `import_${batchId}_${index}`
            });
            const result = { applied: false, addedBookmarks: plan.preview.addedBookmarks, newCategories: plan.preview.newCategories,
                preview: plan.preview, snapshot: latest };
            if (!plan.additions.links.length) return result;
            if (latest.links.length + plan.additions.links.length > BOOKMARK_IMPORT_STORAGE_LIMITS.links ||
                latest.categories.length + plan.additions.categories.length > BOOKMARK_IMPORT_STORAGE_LIMITS.categories) {
                throw this.bookmarkImportError('BOOKMARK_IMPORT_STATE_LIMIT', 'The imported bookmark state would exceed the safe import limit.');
            }
            let additions = plan.additions.links;
            const written = { links: [...latest.links, ...additions], categories: [...latest.categories, ...plan.additions.categories],
                [this.layoutGenerationKey]: this.createLayoutGeneration() };
            // Legacy mode stays legacy: do not migrate or rewrite existing
            // duplicate shortcuts. Identity mode adds independent fresh IDs.
            if (LayoutIdentity.active(latest.layout)) {
                const layout = this.copyBookmarkImportValue(latest.layout);
                const reserved = new Set([...latest.links.map(link => link.layoutId).filter(Boolean), ...Object.keys(layout.positionsById)]);
                additions = additions.map(link => {
                    let id;
                    for (let attempt = 0; attempt < 32; attempt++) {
                        id = this.createLayoutIdentity();
                        if (LayoutIdentity.idPattern.test(id) && !reserved.has(id)) break;
                        id = null;
                    }
                    if (!id) LayoutIdentity.invalid('Could not allocate a fresh bookmark layout identity.');
                    reserved.add(id); layout.positionsById[id] = {};
                    return { ...link, layoutId: id };
                });
                written.links = [...latest.links, ...additions]; written.layout = layout;
            }
            const candidateRaw = { links: written.links, categories: written.categories,
                layout: written.layout || latest.layout, sync: { enabled: latest.privacy.syncEnabled },
                privacy: { onlineFavicons: latest.privacy.onlineFavicons }, [this.layoutGenerationKey]: written[this.layoutGenerationKey],
                ...(latest.context.present.schemaVersion ? { schemaVersion: latest.context.schemaVersion } : {}) };
            this.bookmarkImportSnapshot(candidateRaw);
            try {
                await this._local.set(written);
                const readback = await this._local.get(this.bookmarkImportReadKeys());
                // Bound and validate the readback before recursively comparing it.
                const committed = this.bookmarkImportSnapshot(readback);
                if (Object.keys(written).some(key => !same(readback[key], written[key]))) throw new Error('Bookmark write did not match its readback.');
                if (!same(committed.privacy, expectedPrivacy)) throw new Error('Bookmark preferences changed during verification.');
                result.snapshot = committed; result.applied = true;
            } catch (cause) {
                // No rollback, blind retry, or optimistic success after an
                // ambiguous set/readback. A fresh preview safely deduplicates.
                const error = this.bookmarkImportError('BOOKMARK_IMPORT_UNVERIFIED', 'The import could not be verified. Some bookmarks may have been saved. Reload Settings and preview the file again before retrying.');
                error.mayHaveCommitted = true; error.cause = cause; throw error;
            }
            return result;
        }, true);
        if (result.applied && result.snapshot.privacy.syncEnabled && !this._isApplyingSync) {
            try { this.scheduleSyncPush(); } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error; console.warn('Bookmarks saved locally; sync scheduling failed:', error); }
        }
        return result;
    }

    async applyLayoutPatch(patch, positions, expected, onWrite = () => {}, identityPositions = {}) {
        // Copy before async initialization/lock acquisition. Provider work must
        // stay outside the shared local lock because sync may replace all data.
        const copy = value => JSON.parse(JSON.stringify(value));
        patch = copy(patch); positions = copy(positions); expected = copy(expected); identityPositions = copy(identityPositions);
        if (!expected || !Object.prototype.hasOwnProperty.call(expected, 'generation') || !Array.isArray(expected.links)) {
            throw new Error('A trusted layout baseline is required.');
        }
        const expectedLinks = this.validateStoredLinksConfig(expected.links);
        if (expectedLinks.length !== expected.links.length) throw new Error('Invalid expected shortcut list.');
        expected.links = expectedLinks;
        const fields = ['autoArrange', 'alignToGrid', 'gridSize', 'columns'];
        if (Object.keys(patch).some(key => !fields.includes(key))) throw new Error('Invalid layout patch.');
        this.validateStoredLayout({ ...patch, positions });
        await this.ensureSyncInitialized();
        let result;
        try {
            result = await this.withLocalWriteLock(async () => {
                const latest = await this.getLayoutSnapshotForUpdate({ underLock: true });
                const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
                const conflict = code => {
                    const error = new Error(code === 'LAYOUT_CONTEXT_CHANGED' ? 'Page data changed. Reload before arranging shortcuts.' : 'Layout changed in another page. Review and retry your change.');
                    error.code = code;
                    error.latestLayoutSnapshot = latest;
                    throw error;
                };
                if (expected.generation !== latest.generation || !same(expected.links, latest.links)) conflict('LAYOUT_CONTEXT_CHANGED');
                let candidate = this.validateLayoutConfig({ ...latest.layout, ...patch, positions: { ...latest.layout.positions, ...positions } });
                let links = latest.links, allocated = false;
                if (!candidate.autoArrange && LayoutIdentity.needs(links)) {
                    const counts = new Map(); links.forEach(link => counts.set(link.url, (counts.get(link.url) || 0) + 1));
                    if (Object.keys(positions).some(key => [...counts].some(([url, count]) => count > 1 && key.endsWith(`|${url}`)))) LayoutIdentity.invalid('Prepare independent shortcut positions before dragging a duplicate.');
                    const assignment = LayoutIdentity.allocate(links, candidate, links, null, () => this.createLayoutIdentity());
                    candidate = assignment.layout; links = assignment.links; allocated = assignment.changed;
                }
                const desired = this.validateLayoutConfig({ ...expected.layout, ...patch });
                if ('autoArrange' in patch || 'alignToGrid' in patch) {
                    const pair = value => [value.autoArrange, value.alignToGrid];
                    if (!same(pair(latest.layout), pair(expected.layout)) && !same(pair(latest.layout), pair(desired))) conflict('LAYOUT_CONFLICT');
                }
                for (const key of ['columns', 'gridSize']) {
                    if (key in patch && latest.layout[key] !== expected.layout[key] && latest.layout[key] !== desired[key]) conflict('LAYOUT_CONFLICT');
                }
                for (const [key, value] of Object.entries(positions)) {
                    const samePoint = (a, b) => a === b || (a && b && a.x === b.x && a.y === b.y);
                    if (!samePoint(latest.layout.positions[key], expected.layout.positions[key]) && !samePoint(latest.layout.positions[key], value)) conflict('LAYOUT_CONFLICT');
                }
                for (const [encoded, value] of Object.entries(identityPositions)) {
                    const { id, view } = LayoutIdentity.parseKey(encoded);
                    const read = layout => LayoutIdentity.has(layout.positionsById?.[id], view) ? layout.positionsById[id][view] : undefined;
                    const current = read(latest.layout);
                    const previous = read(expected.layout);
                    const equal = (a, b) => a === b || (a && b && a.x === b.x && a.y === b.y);
                    if (!equal(current, previous) && !equal(current, value)) conflict('LAYOUT_CONFLICT');
                    if (!links.some(link => link.layoutId === id)) LayoutIdentity.invalid('An orphan layout identity cannot be moved.');
                }
                candidate = LayoutIdentity.mergePositions(candidate, identityPositions);
                const written = { layout: copy(candidate) };
                if (allocated) {
                    written.links = links;
                    written[this.layoutGenerationKey] = this.createLayoutGeneration();
                    const raw = await this._local.get(null);
                    const schemaVersion = this.layoutSchemaForMutation(raw, candidate);
                    if (schemaVersion !== undefined && schemaVersion !== raw.schemaVersion) written.schemaVersion = schemaVersion;
                    if (!LayoutIdentity.active(latest.layout) && !raw[this.identityRecoveryKey]) written[this.identityRecoveryKey] = await this.makeRecovery(raw, 'beforeIdentity');
                }
                onWrite(copy(candidate));
                await this._local.set(written);
                if (!this.workspace) {
                    // Workspace writes already verify their full bundle. The
                    // compatibility adapter only forwards set(), so require an
                    // authoritative readback before exposing a saved snapshot.
                    try {
                        const keys = [...new Set([...Object.keys(written), 'links', 'layout', this.layoutGenerationKey, 'schemaVersion'])];
                        const readback = await this._local.get(keys);
                        if (Object.keys(written).some(key => !Object.prototype.hasOwnProperty.call(readback, key) ||
                            !this.sameShortcutUndoValue(readback[key], written[key]))) {
                            throw new Error('Layout write did not match its readback.');
                        }
                        this.layoutSchemaForMutation(readback, readback.layout);
                        return this.layoutSnapshot(readback);
                    } catch (cause) {
                        // Preserve ambiguous persisted state and its recovery.
                        // Never roll back or retry an unverified allocation.
                        const error = new Error('The layout change could not be verified. It may already be saved. Reload this page to check before trying again.');
                        error.code = 'LAYOUT_UNVERIFIED'; error.mayHaveCommitted = true; error.cause = cause;
                        throw error;
                    }
                }
                return { ...latest, links, layout: candidate, generation: written[this.layoutGenerationKey] || latest.generation };
            }, true);
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            if (error.code === 'LINKS_LOCK_UNAVAILABLE') error.code = 'LAYOUT_LOCK_UNAVAILABLE';
            throw error;
        }
        // A post-commit sync problem must not falsely roll back a successful
        // local layout. The sync module owns its separate status/recovery.
        try {
            if (!this._isApplyingSync && await this.isSyncEnabledLocally()) this.scheduleSyncPush();
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error; console.warn('Layout saved locally; sync scheduling failed:', error); }
        return copy(result);
    }

    // Mutation recovery must distinguish a failed read from a missing setting.
    async getBackgroundForUpdate() {
        const result = await this._local.get(['bg']);
        const background = result.bg === undefined ? this.defaultConfig.bg : result.bg;
        if (!background || typeof background !== 'object' || Array.isArray(background)) {
            throw new Error('Stored background settings are invalid.');
        }
        return this.validateBackgroundConfig(background);
    }

    // Backups must never mistake a failed read or recovery fallback for saved data.
    // Read configuration only: private local content and provider bookkeeping are
    // deliberately outside this boundary, even when their values are malformed.
    async getAllForBackup() {
        await this.ensureSyncInitialized();
        return this.withLocalWriteLock(async () => {
            const raw = await this._local.get(Object.keys(this.defaultConfig));
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
                throw new Error('Stored settings could not be read safely. No backup was created.');
            }
            // Preserve the existing successful-read normalization and allowlist.
            // Unlike getAll(), this boundary propagates errors instead of exporting
            // runtime fallback defaults as a successful backup.
            return this.validateStoredConfigObject(raw);
        });
    }

    /**
     * Get all stored data
     * @returns {Promise<Object>} - All stored data with defaults for missing keys
     */
    async getAll() {
        try {
            await this.ensureSyncInitialized();
            const result = await this.withLocalWriteLock(() => this._local.get(null));

            if (this.workspace) {
                try { this.validateWorkspaceConfig(result); }
                catch (_) { const error = new Error('Workspace settings are invalid. Saved data has not been replaced.'); error.code = 'WORKSPACE_CORRUPT'; throw error; }
            }
            const config = this.validateStoredConfigObject(result);
            try { Object.defineProperty(config, '_settingsBaseline', { value: this.settingsSnapshot(result) }); }
            catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error; console.warn('Settings baseline unavailable:', error); }
            // Only a successful, safely comparable read can authorize a clock
            // replacement. Runtime recovery alone is not a write baseline.
            try {
                Object.defineProperty(config, '_clockBaseline', {
                    value: this.validateClockBaseline(result.clock === undefined ? this.defaultConfig.clock : result.clock)
                });
            } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
                console.warn('Clock baseline unavailable:', error);
            }
            // Kept out of JSON/spreads/backups. An absent property after a failed
            // read is distinct from a successful legacy baseline with no token.
            try {
                Object.defineProperty(config, '_layoutBaseline', { value: this.layoutSnapshot(result) });
            } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
                // Do not replace otherwise readable configuration merely because
                // its layout cannot authorize a safe write. Controls fail closed.
                console.warn('Layout baseline unavailable:', error);
            }
            return config;
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            if (error.code === 'LAYOUT_IDENTITY_INVALID' || error.code === 'STORED_CONFIG_INVALID') throw error;
            console.error('Storage getAll error:', error);
            return { ...this.defaultConfig };
        }
    }

    /**
     * Set multiple values at once
     * @param {Object} data - Key-value pairs to store
     * @returns {Promise<boolean>} - Success status
     */
    async setAll(data, options = {}) {
        this.assertConfigurationKeys(Object.keys(data));
        try {
            // Snapshot values and all baselines before any asynchronous read.
            if (Object.prototype.hasOwnProperty.call(options, 'expectedSettings')) {
                options = { ...options, expectedSettings: LayoutIdentity.copy(options.expectedSettings), settingsPaths: [...options.settingsPaths] };
            }
            const validatedData = {};
            for (const [key, value] of Object.entries(data)) {
                validatedData[key] = this.validateStoredData(key, value);
            }
            if (Object.prototype.hasOwnProperty.call(data, 'clock') && Object.prototype.hasOwnProperty.call(options, 'expectedClock')) {
                options = { ...options, expectedClock: this.validateClockBaseline(options.expectedClock) };
            }
            if (!options.skipSyncInitialization) {
                await this.ensureSyncInitialized();
            }
            const wasSyncEnabled = await this.isSyncEnabledLocally();

            await this.writeLocalValues(validatedData, options);

            // A committed local patch remains successful if optional Sync bookkeeping fails.
            try {
                if (!this._isApplyingSync && !options.skipSyncSideEffects) {
                    const syncEnabled = validatedData.sync?.enabled || await this.isSyncEnabledLocally();
                    if (syncEnabled) {
                        this.scheduleSyncPush();
                    } else if (validatedData.sync && validatedData.sync.enabled === false && wasSyncEnabled) {
                        await this.disableRemoteSync();
                    }
                }
            } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error; console.warn('Settings saved locally; sync scheduling failed:', error); }
            return true;
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            if (error.code?.startsWith('IMPORT_CLOSURE_') || error.code?.startsWith('RESTORE_') || error.code?.startsWith('SETTINGS_') || error.code === 'CATEGORIES_CONFLICT' || error.code === 'LINKS_LOCK_UNAVAILABLE' || error.code === 'CLOCK_CONFLICT' || error.code === 'CLOCK_LOCK_UNAVAILABLE') throw error;
            console.error('Storage setAll error:', error);
            
            if (error.message && error.message.includes('QUOTA_EXCEEDED')) {
                throw new Error('Storage quota exceeded. Please reduce the amount of data being stored.');
            }
            
            return false;
        }
    }

    /**
     * Clear all stored data
     * @returns {Promise<boolean>} - Success status
     */
    async clear() {
        try {
            const current = await this._local.get(['sync']);
            const wasSyncing = !this.workspace && current.sync?.enabled === true;
            await this.withLocalWriteLock(async () => {
                const stored = await this._local.get(null);
                // Settings reset retains whole local personal-content records.
                // Preserve a new generation while removing configuration. If set fails,
                // do not clear; if removal fails, old pages are still invalidated.
                const fences = { [this.layoutGenerationKey]: this.createLayoutGeneration(), [this.settingsGenerationKey]: this.createLayoutGeneration() };
                if (this.workspace?.id === 'default' && stored.sync?.enabled) fences[this.syncIdentityStateKey] = {
                    ...(stored[this.syncIdentityStateKey] || {}),
                    blocked: { kind: 'restore', reason: 'Default workspace settings were reset locally. Review compatible cloud data before resuming Sync.' }
                };
                await this._local.set(fences);
                await this._local.remove(Object.keys(stored).filter(key => key !== IMPORT_CLOSURE_KEY && key !== this.layoutGenerationKey && key !== this.settingsGenerationKey && !LOCAL_PERSONAL_CONTENT_KEYS.includes(key) && (!this.workspace || !['privacy', 'sync', this.syncIdentityStateKey].includes(key))));
            });
            if (wasSyncing) {
                await this.disableRemoteSync();
            }
            return true;
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            console.error('Storage clear error:', error);
            return false;
        }
    }

    /**
     * Get storage usage information
     * @returns {Promise<Object>} - Storage usage stats
     */
    async getStorageInfo() {
        try {
            const bytesInUse = await this._local.getBytesInUse();
            const quota = this._local.QUOTA_BYTES || 5242880; // 5MB default
            const syncAvailable = this.isSyncAvailable();
            const syncBytesInUse = syncAvailable ? await this.chromeApi.storage.sync.getBytesInUse(null) : 0;
            const syncQuota = syncAvailable ? (this.chromeApi.storage.sync.QUOTA_BYTES || 102400) : 0;

            return {
                bytesInUse,
                quota,
                percentUsed: Math.round((bytesInUse / quota) * 100),
                available: quota - bytesInUse,
                local: {
                    bytesInUse,
                    quota,
                    percentUsed: Math.round((bytesInUse / quota) * 100),
                    available: quota - bytesInUse
                },
                sync: {
                    available: syncAvailable,
                    bytesInUse: syncBytesInUse,
                    quota: syncQuota,
                    percentUsed: syncQuota ? Math.round((syncBytesInUse / syncQuota) * 100) : 0,
                    availableBytes: syncQuota ? Math.max(0, syncQuota - syncBytesInUse) : 0
                }
            };
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            console.error('Storage info error:', error);
            return {
                bytesInUse: 0,
                quota: 5242880,
                percentUsed: 0,
                available: 5242880,
                local: {
                    bytesInUse: 0,
                    quota: 5242880,
                    percentUsed: 0,
                    available: 5242880
                },
                sync: {
                    available: false,
                    bytesInUse: 0,
                    quota: 0,
                    percentUsed: 0,
                    availableBytes: 0
                }
            };
        }
    }

    sanitizeConfigForBackup(config) {
        const sanitized = this.validateStoredConfigObject(config);
        sanitized.sync = this.getDisabledSyncConfig();
        return sanitized;
    }

    getExtensionVersion() {
        try {
            if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
                return chrome.runtime.getManifest().version || '';
            }
        } catch (_) {}
        return '';
    }

    countBackupItems(config) {
        const source = this.validateStoredConfigObject(config);
        const links = Array.isArray(source.links) ? source.links : [];
        const hot = source.hot || {};
        const dataUrlIcons = links.filter(link => typeof link.icon === 'string' && link.icon.startsWith('data:')).length;
        const hasBackgroundImage = source.bg?.type === 'image' && !!source.bg.value;
        const hasMoviePoster = !!source.movie?.poster;

        return {
            shortcuts: links.length,
            categories: Array.isArray(source.categories) ? source.categories.length : 0,
            hotTopics: (hot.baidu?.length || 0) + (hot.weibo?.length || 0) + (hot.zhihu?.length || 0),
            dataUrlIcons,
            hasBackgroundImage,
            hasMoviePoster,
            localImagesIncluded: !!(hasBackgroundImage || hasMoviePoster || dataUrlIcons > 0)
        };
    }

    hasLegacyURLSpelling(config) {
        if (!config || typeof config !== 'object' || Array.isArray(config)) throw this.storedConfigurationError('Stored configuration must be an object.');
        const prototype = Object.getPrototypeOf(config), descriptor = Object.getOwnPropertyDescriptor(config, 'links');
        if ((prototype !== null && Object.getPrototypeOf(prototype) !== null) || (descriptor && !Object.prototype.hasOwnProperty.call(descriptor, 'value'))) throw this.storedConfigurationError('Stored shortcut accessors are unsupported.');
        const links = this.validateStoredLinksConfig(descriptor?.value === undefined ? this.defaultConfig.links : descriptor.value);
        return links.some(link => this.validateLinksConfig([link])[0]?.url !== link.url);
    }

    assertSyncURLCompatibility(...configs) {
        if (configs.filter(Boolean).some(config => this.hasLegacyURLSpelling(config))) {
            throw this.compatibilityError('Sync is paused because this copy preserves older URL spelling and layout relationships that older versions may rewrite. Local data and the enabled preference are unchanged. Use a current-version local or Drive backup; previews remain available.', 'stored-url');
        }
    }

    buildManualExportPayload(config, metadata = {}) {
        const sanitized = this.sanitizeConfigForBackup(config);
        const exportDate = metadata.exportDate || new Date().toISOString();
        const storedURLs = this.hasLegacyURLSpelling(sanitized);

        return {
            version: storedURLs ? '2.0' : '1.0',
            ...(storedURLs ? { urlIdentityVersion: 1, type: 'backupSnapshot', app: 'local-itab' } : {}),
            schemaVersion: LayoutIdentity.active(sanitized.layout) ? 2 : 1,
            exportDate,
            createdAt: exportDate,
            exportedBy: 'Local iTab Extension',
            extensionVersion: metadata.extensionVersion || this.getExtensionVersion(),
            itemCounts: this.countBackupItems(sanitized),
            data: sanitized
        };
    }

    buildDriveBackupPayload(config, metadata = {}) {
        const sanitized = this.sanitizeConfigForBackup(config);
        const createdAt = metadata.createdAt || new Date().toISOString();
        const snapshotId = metadata.snapshotId || `snapshot_${Date.now()}`;
        const deviceId = typeof metadata.deviceId === 'string' ? metadata.deviceId : '';
        const deviceName = typeof metadata.deviceName === 'string' ? metadata.deviceName : '';
        const storedURLs = this.hasLegacyURLSpelling(sanitized);

        return {
            version: storedURLs ? '2.0' : '1.0',
            ...(storedURLs ? { urlIdentityVersion: 1 } : {}),
            schemaVersion: LayoutIdentity.active(sanitized.layout) ? 2 : 1,
            type: 'backupSnapshot',
            app: 'local-itab',
            createdAt,
            exportDate: createdAt,
            exportedBy: 'Local iTab Extension',
            extensionVersion: metadata.extensionVersion || this.getExtensionVersion(),
            snapshotId,
            device: {
                id: deviceId,
                name: deviceName
            },
            metadata: {
                ...(storedURLs ? { urlIdentityVersion: 1 } : {}),
                app: 'local-itab',
                type: 'backupSnapshot',
                schemaVersion: LayoutIdentity.active(sanitized.layout) ? 2 : 1,
                deviceId,
                snapshotId,
                reason: typeof metadata.reason === 'string' ? metadata.reason : 'manual'
            },
            itemCounts: this.countBackupItems(sanitized),
            data: sanitized
        };
    }

    // Strict allowlisted configuration boundary for the opt-in complete local
    // archive. Provider settings, authorization, update preferences and private
    // module storage keys never enter this portable payload.
    validateCompleteBackupConfig(value) {
        const keys = Object.keys(this.defaultConfig).filter(key => key !== 'sync');
        const object = entry => entry && typeof entry === 'object' && !Array.isArray(entry);
        if (!object(value) || Object.keys(value).length !== 2 || !Object.hasOwn(value, 'schemaVersion') ||
            !Object.hasOwn(value, 'data') || ![1, 2].includes(value.schemaVersion) || !object(value.data) ||
            Object.keys(value.data).length !== keys.length || !keys.every(key => Object.hasOwn(value.data, key))) {
            throw new Error('Invalid complete backup configuration.');
        }
        const checked = this.validateImportPayload(value);
        delete checked.sync;
        // Card layout fields were added after customization shipped. Older
        // complete archives legitimately omit them. Compare that exact legacy
        // projection, without repairing supplied values or ignoring unknown keys.
        const customization = value.data.appearance?.customization;
        if (customization && checked.appearance?.customization) {
            for (const key of ['cardOrder', 'cardSpans', 'cardLayoutMode']) {
                if (!Object.hasOwn(customization, key)) delete checked.appearance.customization[key];
            }
        }
        if (!this.sameShortcutUndoValue(checked, value.data)) throw new Error('Complete backup configuration is malformed or noncanonical.');
        return LayoutIdentity.copy(value);
    }

    completeBackupConfigFromRaw(raw) {
        raw = this.copyStoredConfiguration(raw);
        if (Object.hasOwn(raw, 'schemaVersion') && ![1, 2].includes(raw.schemaVersion)) throw new Error('Unknown stored configuration schema.');
        this.readLayoutGeneration(raw); this.settingsSnapshot(raw);
        const defaults = this.cloneDefaultConfig(), data = {};
        const object = value => value && typeof value === 'object' && !Array.isArray(value);
        // Older saved settings legitimately omit fields introduced later. Fill
        // only absent known dictionary fields, never repair a supplied value or
        // an array record. Unknown fields survive for strict validation below.
        const fillMissing = (value, schema) => {
            if (!object(value) || !object(schema)) return value;
            const filled = { ...value };
            for (const [key, fallback] of Object.entries(schema)) {
                filled[key] = Object.hasOwn(value, key) ? fillMissing(value[key], fallback) : LayoutIdentity.copy(fallback);
            }
            return filled;
        };
        for (const key of Object.keys(defaults)) {
            if (key !== 'sync') data[key] = Object.hasOwn(raw, key) ? fillMissing(raw[key], defaults[key]) : defaults[key];
        }
        // v1.1.4 persisted this boolean before online wallpapers were removed.
        // Recognize only that exact historical field in the read projection;
        // leave original storage/recovery unchanged and never revive permission.
        // Wrong types and unknown privacy fields still fail strict validation.
        if (object(data.privacy) && typeof data.privacy.onlineWallpapers === 'boolean') {
            delete data.privacy.onlineWallpapers;
        }
        // Older saved shortcut/category records may omit their cosmetic defaults.
        // Fill only absent properties. Supplied invalid values and unknown fields
        // remain present for the strict portable validator below to reject.
        if (Array.isArray(data.links)) data.links = data.links.map(link =>
            object(link) ? { icon: '🌐', category: 'work', ...link } : link);
        if (Array.isArray(data.categories)) data.categories = data.categories.map(category =>
            object(category) ? { icon: '📁', ...category } : category);
        // A single padding number is an explicitly supported legacy format.
        // Expand it without rounding/clamping malformed supplied numbers.
        if (object(data.ui)) {
            const padding = data.ui.dashboardPadding;
            if (Number.isInteger(padding) && padding >= 0 && padding <= 160) {
                data.ui.dashboardPadding = { top: padding, right: padding, bottom: padding, left: padding };
            } else if (object(padding)) {
                data.ui.dashboardPadding = fillMissing(padding, { top: null, right: null, bottom: null, left: null });
            }
        }
        // Missing appearance is a supported legacy configuration, not a draft.
        if (!Object.hasOwn(raw, 'appearance')) data.appearance = this.resolveAppearance(raw);
        const schemaVersion = LayoutIdentity.active(data.layout) ? 2 : 1;
        if (Object.hasOwn(raw, 'schemaVersion') && raw.schemaVersion !== schemaVersion) throw new Error('Stored schema does not match layout identities.');
        return this.validateCompleteBackupConfig({ schemaVersion, data });
    }

    completeBackupConfigWrite(value, raw) {
        const checked = this.validateCompleteBackupConfig(value);
        const written = { ...checked.data,
            [this.layoutGenerationKey]: this.createLayoutGeneration(),
            [this.settingsGenerationKey]: this.createLayoutGeneration()
        };
        if (Object.hasOwn(raw, 'schemaVersion')) written.schemaVersion = checked.schemaVersion;
        // Preserve raw provider preferences exactly, including any future fields.
        // The existing persisted restore block prevents a queued Sync push from
        // propagating a local replacement without the user's separate review.
        if ((!this.workspace || this.workspace.id === 'default') && raw.sync?.enabled) written[this.syncIdentityStateKey] = {
            ...(raw[this.syncIdentityStateKey] || {}),
            blocked: { kind: 'restore', reason: 'Restored data is kept locally. Review compatible cloud data before resuming Sync.' }
        };
        return written;
    }

    prepareRestoredConfig(importData, currentConfig = null) {
        const restored = this.validateImportPayload(importData);
        if (currentConfig && typeof currentConfig === 'object') {
            restored.sync = this.validateSyncConfig(currentConfig.sync || this.defaultConfig.sync);
        }
        return restored;
    }

    // A dialog owns only changed fields, checked against the version it opened.
    // Unrelated tabs can edit other appearance fields without losing either edit.
    async patchDashboardCustomization(patch, baseline) {
        if (!baseline || !Object.hasOwn(baseline, 'generation') ||
            (baseline.generation !== null && (typeof baseline.generation !== 'string' || !baseline.generation))) throw this.appearanceError();
        if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
            Object.keys(patch).some(key => !Object.hasOwn(DASHBOARD_CUSTOMIZATION_DEFAULTS, key))) throw this.appearanceError();
        const requested = this.validateDashboardCustomization(patch);
        const before = this.validateDashboardCustomization(baseline.customization);
        const keys = Object.keys(patch), generation = baseline.generation;
        await this.ensureSyncInitialized();
        let committed;
        try {
            committed = await this.withLocalWriteLock(async () => {
                const raw = await this._local.get(['appearance', 'themePreset', this.settingsGenerationKey]);
                if (this.settingsSnapshot(raw).generation !== generation) throw this.appearanceError();
                if (raw.appearance !== undefined && (!raw.appearance || typeof raw.appearance !== 'object' || Array.isArray(raw.appearance))) throw this.appearanceError();
                const appearance = { ...this.resolveAppearance(raw), ...raw.appearance };
                const latest = this.validateDashboardCustomization(appearance.customization);
                if (keys.some(key => JSON.stringify(latest[key]) !== JSON.stringify(before[key]) && JSON.stringify(latest[key]) !== JSON.stringify(requested[key]))) throw this.appearanceError();
                // Mode and dimensions jointly choose geometry. A stale dialog must
                // not silently undo another tab's switch between template and grid.
                const geometry = ['cardLayoutMode', 'cardSpans', 'cardColumns'];
                if (keys.some(key => geometry.includes(key)) && geometry.some(key =>
                    JSON.stringify(latest[key]) !== JSON.stringify(before[key]) &&
                    (!keys.includes(key) || JSON.stringify(latest[key]) !== JSON.stringify(requested[key])))) throw this.appearanceError();
                if (keys.length) {
                    appearance.customization = { ...latest, ...Object.fromEntries(keys.map(key => [key, requested[key]])) };
                    await this._local.set({ appearance });
                }
                return this.validateAppearanceConfig(appearance);
            }, true);
        } catch (error) {
            if (error.code === 'LINKS_LOCK_UNAVAILABLE') throw this.appearanceError('APPEARANCE_LOCK_UNAVAILABLE');
            if (error.code?.startsWith('SETTINGS_')) throw this.appearanceError();
            throw error;
        }
        if (keys.length) {
            try { if (!this._isApplyingSync && await this.isSyncEnabledLocally()) this.scheduleSyncPush(); }
            catch (error) { if (error.code?.startsWith('WORKSPACE_')) throw error; console.warn('Customization saved locally; Sync scheduling failed:', error); }
        }
        return committed;
    }

    // Strict and small: a failed read must not be mistaken for a fresh preference.
    async getAppearanceForUpdate() {
        const raw = await this._local.get(['appearance', 'themePreset']);
        return this.resolveAppearance(raw);
    }

    // Preview admission is local/read-only: never initialize Sync, migrate a
    // workspace, or select lastUsed. A dashboard must already own its session.
    templatePreviewAppearance(raw) {
        if (Object.hasOwn(raw, 'appearance')) {
            const value = raw.appearance;
            if (!value || typeof value !== 'object' || Array.isArray(value) ||
                (Object.hasOwn(value, 'template') && !DashboardTemplates.ids.includes(value.template)) ||
                (Object.hasOwn(value, 'colorMode') && !['light', 'dark'].includes(value.colorMode))) throw this.appearanceError();
        }
        return this.resolveAppearance(raw);
    }

    async getTemplatePreviewSnapshot() {
        const workspace = this.workspace;
        if (workspace && (!workspace.id || !workspace.generation || workspace.invalidated || workspace._suspended)) throw this.appearanceError();
        return this.withLocalWriteLock(async () => {
            if (this.workspace !== workspace || workspace?.invalidated || workspace?._suspended) throw this.appearanceError();
            const raw = await this._local.get(['appearance', 'themePreset', this.settingsGenerationKey]);
            if (this.workspace !== workspace || workspace?.invalidated || workspace?._suspended) throw this.appearanceError();
            const appearance = this.templatePreviewAppearance(raw);
            const snapshot = { appearance, generation: this.settingsSnapshot(raw).generation };
            const ticket = { workspace, id: workspace?.id, workspaceGeneration: workspace?.generation,
                generation: snapshot.generation, template: appearance.template,
                source: JSON.stringify([Object.hasOwn(raw, 'appearance'), raw.appearance?.template]) };
            (this._templatePreviewTickets ||= new WeakMap()).set(snapshot, ticket);
            return snapshot;
        }, true);
    }

    // A one-use, template-only compare-and-set. No whole-settings rollback is
    // safe after a failed set/readback: the result may already have committed.
    async applyTemplatePreview(template, snapshot, { isCurrent = () => true, onSubmit = () => {} } = {}) {
        const ticket = this._templatePreviewTickets?.get(snapshot);
        if (!ticket || !DashboardTemplates.ids.includes(template)) throw this.appearanceError();
        this._templatePreviewTickets.delete(snapshot);
        let submitted = false;
        const current = () => {
            const workspace = ticket.workspace;
            if (!isCurrent() || this.workspace !== workspace || workspace?.invalidated || workspace?._suspended ||
                workspace?.id !== ticket.id || workspace?.generation !== ticket.workspaceGeneration) throw this.appearanceError();
        };
        let committed;
        try {
            committed = await this.withLocalWriteLock(async () => {
                current();
                const keys = ['appearance', 'themePreset', this.settingsGenerationKey];
                const raw = await this._local.get(keys);
                current();
                const latest = this.templatePreviewAppearance(raw);
                if (this.settingsSnapshot(raw).generation !== ticket.generation || latest.template !== ticket.template ||
                    JSON.stringify([Object.hasOwn(raw, 'appearance'), raw.appearance?.template]) !== ticket.source) throw this.appearanceError();
                // Existing sparse objects retain every own field exactly. A legacy
                // record without appearance needs its effective palette carried
                // forward so creating the template does not reset legacy dark.
                const appearance = Object.hasOwn(raw, 'appearance') ? { ...raw.appearance, template } : { template, colorMode: latest.colorMode };
                if (latest.template !== template) {
                    const beforeSubmit = () => { current(); onSubmit(LayoutIdentity.copy(appearance)); submitted = true; };
                    if (ticket.workspace) await ticket.workspace.set({ appearance }, beforeSubmit);
                    else { beforeSubmit(); await this._local.set({ appearance }); }
                }
                const readback = await this._local.get(keys);
                current();
                const confirmed = this.templatePreviewAppearance(readback);
                if (this.settingsSnapshot(readback).generation !== ticket.generation || confirmed.template !== template ||
                    (submitted && !this.sameShortcutUndoValue(readback.appearance, appearance))) throw this.appearanceError();
                return confirmed;
            }, true);
        } catch (error) {
            // This error explicitly does not mean that no write happened.
            if (submitted) throw this.appearanceError('APPEARANCE_SAVE_UNCONFIRMED');
            if (error.code === 'LINKS_LOCK_UNAVAILABLE') throw this.appearanceError('APPEARANCE_LOCK_UNAVAILABLE');
            throw error;
        }
        // A confirmed local Apply follows the existing opt-in Sync scheduler.
        // Provider failures cannot turn the verified local commit into failure.
        if (submitted) {
            try { if (!this._isApplyingSync && await this.isSyncEnabledLocally()) this.scheduleSyncPush(); }
            catch (error) { console.warn('Template saved locally; Sync scheduling failed:', error); }
        }
        return committed;
    }

    // Independent selectors own only their requested axes. Read, generation
    // check, merge and write share the same lock as Settings and replacements.
    async patchAppearance(patch, baseline) {
        if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline) ||
            !Object.prototype.hasOwnProperty.call(baseline, 'generation') ||
            (baseline.generation !== null && (typeof baseline.generation !== 'string' || !baseline.generation))) {
            throw this.appearanceError('APPEARANCE_BASELINE_UNAVAILABLE');
        }
        const generation = baseline.generation;
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw this.appearanceError();
        const requested = LayoutIdentity.copy(patch), keys = Object.keys(requested);
        if (!keys.length || keys.some(key => !['template', 'colorMode'].includes(key)) ||
            (keys.includes('template') && !DashboardTemplates.ids.includes(requested.template)) ||
            (keys.includes('colorMode') && !['light', 'dark'].includes(requested.colorMode))) throw this.appearanceError();
        await this.ensureSyncInitialized();
        let committed;
        try {
            committed = await this.withLocalWriteLock(async () => {
                const raw = await this._local.get(['appearance', 'themePreset', this.settingsGenerationKey]);
                if (this.settingsSnapshot(raw).generation !== generation) throw this.appearanceError();
                if (raw.appearance !== undefined && (!raw.appearance || typeof raw.appearance !== 'object' || Array.isArray(raw.appearance))) throw this.appearanceError();
                const appearance = { ...this.resolveAppearance(raw), ...raw.appearance, ...requested };
                await this._local.set({ appearance });
                return this.validateAppearanceConfig(appearance);
            }, true);
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            if (error.code === 'LINKS_LOCK_UNAVAILABLE') throw this.appearanceError('APPEARANCE_LOCK_UNAVAILABLE');
            if (error.code?.startsWith('SETTINGS_')) throw this.appearanceError();
            throw error;
        }
        try { if (!this._isApplyingSync && await this.isSyncEnabledLocally()) this.scheduleSyncPush(); }
        catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error; console.warn('Appearance saved locally; Sync scheduling failed:', error); }
        return committed;
    }

    isSyncAvailable() {
        return !!this.chromeApi?.storage?.sync;
    }

    async isSyncEnabledLocally() {
        if (!(await this.isDefaultWorkspace())) return false;
        try {
            const result = await this._local.get(['sync']);
            return result.sync?.enabled === true;
        } catch (_) {
            return false;
        }
    }

    async getLocalProviderState() {
        const result = await this._local.get(['sync']);
        return {
            sync: this.validateSyncConfig(result.sync || this.defaultConfig.sync)
        };
    }

    cancelSyncPush() {
        if (this._syncPushTimer) clearTimeout(this._syncPushTimer);
        this._syncPushTimer = null;
    }

    compatibilityError(reason, kind = 'incompatible') {
        const error = new Error(reason);
        error.code = 'SYNC_IDENTITY_COMPATIBILITY'; error.kind = kind;
        return error;
    }

    async blockSync(error, remote = null) {
        this.cancelSyncPush();
        const blocked = { reason: error.message, kind: error.kind || 'incompatible' };
        this._syncCompatibilityError = blocked;
        try {
            await this.withLocalWriteLock(async () => {
                const raw = await this._local.get(null);
                const guard = raw[this.syncIdentityStateKey] || {};
                const config = this.validateStoredConfigObject(raw); delete config.sync;
                const localFingerprint = guard.blocked?.localFingerprint || error.localFingerprint || await this.fingerprint(config);
                await this._local.set({ [this.syncIdentityStateKey]: { ...guard,
                    blocked: error.kind !== 'stored-url' && ['restore', 'initialization', 'review', 'stored-url'].includes(guard.blocked?.kind) ? guard.blocked : { ...blocked, localFingerprint, ...(remote ? { fingerprint: remote.fingerprint, revision: remote.revision } : {}) }
                } });
            }, true);
        } catch (statusError) { this._syncCompatibilityError = blocked; console.warn('Could not persist Sync compatibility status:', statusError); }
    }

    sameSyncRevision(a, b) {
        return Boolean(a && b && a.fingerprint === b.fingerprint && a.revision === b.revision && a.schema === b.schema);
    }

    async isOwnSyncMeta(meta) {
        if (!meta?.revision || !meta.payloadHash) return false;
        const raw = await this._local.get([this.syncIdentityStateKey]);
        return (raw[this.syncIdentityStateKey]?.ownWrites || []).some(write =>
            write.revision === meta.revision && write.fingerprint === meta.payloadHash && write.schema === meta.configurationSchemaVersion);
    }

    async readSyncSnapshot() {
        try { return await this.readSyncSnapshotOnce(); }
        catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            // A read begun before this profile's explicit off transition may
            // observe its removed chunks. Recognize only that exact revision.
            if (error.code === 'SYNC_IDENTITY_COMPATIBILITY') {
                const latest = await this.getRemoteMeta();
                if (latest?.enabled === false && await this.isOwnSyncMeta(latest)) return { meta: latest, payload: null, schema: 0, fingerprint: latest.payloadHash, revision: latest.revision };
            }
            throw error;
        }
    }

    async readSyncSnapshotOnce() {
        const meta = await this.getRemoteMeta();
        if (!meta?.enabled) return { meta, payload: null, schema: 1, fingerprint: '', revision: meta?.revision || meta?.updatedAt || '' };
        const payload = await this.readRemoteSyncData(meta);
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.links) || 'data' in payload || 'settings' in payload) {
            throw this.compatibilityError('Cloud settings are incomplete or use an unsupported envelope.', 'incomplete');
        }
        const rawIdentity = LayoutIdentity.active(payload.layout) || payload.links.some(link => LayoutIdentity.has(link, 'layoutId'));
        const schema = rawIdentity ? 2 : 1;
        if ((meta.configurationSchemaVersion !== undefined && meta.configurationSchemaVersion !== schema) || (schema === 2 && meta.configurationSchemaVersion !== 2)) {
            throw this.compatibilityError('Cloud layout identity format does not match its metadata. Update other devices before retrying Sync.');
        }
        if (schema === 2 && (typeof meta.revision !== 'string' || !meta.revision || typeof meta.payloadHash !== 'string' || !/^[a-f0-9]{64}$/.test(meta.payloadHash))) {
            throw this.compatibilityError('Cloud identity data is missing its complete revision fingerprint.', 'incomplete');
        }
        let validated;
        try { validated = this.validateImportPayload(schema === 2 ? { version: '1.0', schemaVersion: 2, data: payload } : payload); }
        catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error; throw this.compatibilityError(`Cloud settings were not applied: ${error.message}`); }
        const fingerprint = await this.fingerprint({ schema, payload });
        if (meta.payloadHash && meta.payloadHash !== fingerprint) throw this.compatibilityError('Cloud snapshot is incomplete or changed while reading. Retry after it finishes syncing.', 'incomplete');
        const reread = await this.getRemoteMeta();
        if (JSON.stringify(reread) !== JSON.stringify(meta)) throw this.compatibilityError('Cloud snapshot changed while reading. Retry the complete snapshot.', 'incomplete');
        return { meta, payload, validated, schema, fingerprint, revision: meta.revision || meta.updatedAt || '' };
    }

    checkSyncIdentity(local, remote, guard, { pushing = false, confirmedReplacement = false } = {}) {
        if (confirmedReplacement) return;
        if (['restore', 'initialization', 'review', 'stored-url'].includes(guard.blocked?.kind)) throw this.compatibilityError(guard.blocked.reason, guard.blocked.kind);
        if (pushing && (guard.blocked || this._syncCompatibilityError)) throw this.compatibilityError(guard.blocked?.reason || this._syncCompatibilityError.reason);
        if (!remote.payload) return;
        if (pushing && remote.schema === 2 && this.losesIdentityHistory(this.layoutSnapshot(remote.validated), local)) {
            throw this.compatibilityError('This upload would remove cloud layout identity history. Download and review the compatible cloud copy, or explicitly choose a backed-up replacement.');
        }
        if (LayoutIdentity.active(local.layout)) {
            if (remote.schema !== 2) {
                if (!guard.blocked && this.sameSyncRevision(guard.ack, remote)) return;
                throw this.compatibilityError('An older or identity-unaware cloud copy was blocked. This device’s shortcuts and independent positions are unchanged. Update other devices, then retry or choose a backed-up replacement.');
            }
            if (this.losesIdentityHistory(local, this.layoutSnapshot(remote.validated))) throw this.compatibilityError('Cloud data would remove saved layout identity history. This device is unchanged; choose a backed-up replacement explicitly.');
        }
    }

    async checkSyncIdentityAtRead(local, remote, guard, raw, options) {
        try { this.assertSyncURLCompatibility(raw, remote.payload, remote.validated); this.checkSyncIdentity(local, remote, guard, options); }
        catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            // Bind a newly detected conflict to the same locked local read;
            // later edits cannot be mistaken for the unchanged blocked copy.
            const config = this.validateStoredConfigObject(raw); delete config.sync;
            error.localFingerprint = await this.fingerprint(config);
            throw error;
        }
    }

    async syncInitializationFingerprint(raw) {
        // Preserve absence, device-only/omitted assets, and persistent replacement
        // generations. A normalized Sync payload is not a complete local baseline.
        const keys = [...Object.keys(this.defaultConfig), this.layoutGenerationKey,
            this.settingsGenerationKey, this.syncIdentityStateKey];
        return this.fingerprint(Object.fromEntries(keys.filter(key =>
            Object.prototype.hasOwnProperty.call(raw, key)).map(key => [key, raw[key]])));
    }

    async sameSyncConfiguration(raw, remote) {
        const local = this.validateStoredConfigObject(raw), incoming = this.validateStoredConfigObject(remote.validated);
        delete local.sync; delete incoming.sync;
        return await this.fingerprint(local) === await this.fingerprint(incoming);
    }

    syncReviewError() {
        return this.compatibilityError('Automatic full-copy replacement is temporarily paused to protect saved data. Preview the cloud copy in Settings, then explicitly choose a backed-up replacement.', 'review');
    }

    async persistSyncReview(raw) {
        const error = this.syncReviewError();
        this._syncCompatibilityError = { kind: error.kind, reason: error.message };
        try {
            await this._local.set({ [this.syncIdentityStateKey]: {
                ...(raw[this.syncIdentityStateKey] || {}), blocked: this._syncCompatibilityError
            } });
        } catch (cause) { error.cause = cause; }
        throw error;
    }

    async acceptSyncSnapshot(remote, { confirmedReplacement = false, initializing = false, expectedLocalFingerprint } = {}) {
        return this.withLocalWriteLock(async () => {
            const raw = await this._local.get(null);
            const local = this.layoutSnapshot(raw);
            this.assertSyncURLCompatibility(raw, remote.payload, remote.validated);
            const guard = raw[this.syncIdentityStateKey] || {};
            if (!confirmedReplacement && ['initialization', 'review', 'stored-url'].includes(this._syncCompatibilityError?.kind)) {
                throw this.compatibilityError(this._syncCompatibilityError.reason, this._syncCompatibilityError.kind);
            }
            if (guard.blocked && !confirmedReplacement) {
                if (['restore', 'initialization', 'review', 'stored-url'].includes(guard.blocked.kind)) throw this.compatibilityError(guard.blocked.reason, guard.blocked.kind);
                const config = this.validateStoredConfigObject(raw); delete config.sync;
                if (!guard.blocked.localFingerprint || guard.blocked.localFingerprint !== await this.fingerprint(config)) throw this.compatibilityError('Local settings changed while Sync was blocked. Review the copies and choose a backed-up replacement explicitly.');
            }
            if (!remote.payload) return { applied: false, empty: true };
            const own = (guard.ownWrites || []).some(write => this.sameSyncRevision(write, remote));
            const unchanged = this.sameSyncRevision(guard.ack, remote);
            // Identical known cloud data and this profile's own writes never
            // replay an older full snapshot over a newer local edit.
            if ((own || unchanged) && !confirmedReplacement) {
                const written = { [this.syncIdentityStateKey]: { ...guard, ack: { fingerprint: remote.fingerprint, revision: remote.revision, schema: remote.schema }, blocked: null } };
                await this._local.set(written);
                this._syncCompatibilityError = null;
                return { applied: false, acknowledged: true };
            }
            if (initializing && !confirmedReplacement && (typeof expectedLocalFingerprint !== 'string' ||
                expectedLocalFingerprint !== await this.syncInitializationFingerprint(raw))) {
                const error = this.compatibilityError('Local settings changed while Sync was loading. Your saved data is kept locally. Review the copies and choose a backed-up replacement explicitly.', 'initialization');
                // Persist the sticky refusal before releasing the same lock used
                // for comparison and acceptance. A later pull/ack must not erase it.
                this._syncCompatibilityError = { kind: error.kind, reason: error.message };
                try {
                    await this._local.set({ [this.syncIdentityStateKey]: { ...guard,
                        blocked: this._syncCompatibilityError
                    } });
                } catch (cause) { error.cause = cause; }
                // Initialization's error handler retries persisting this refusal
                // if the storage write failed; it never acknowledges the remote.
                throw error;
            }
            if (!confirmedReplacement && raw.sync?.enabled !== true) return this.persistSyncReview(raw);
            await this.checkSyncIdentityAtRead(local, remote, guard, raw, { confirmedReplacement });
            if (!confirmedReplacement) {
                if (!(await this.sameSyncConfiguration(raw, remote))) return this.persistSyncReview(raw);
                // Equal data needs an acknowledgement only, never a default-filled
                // full write that could erase omitted assets or absence semantics.
                await this._local.set({ [this.syncIdentityStateKey]: { ...guard, ack: {
                    fingerprint: remote.fingerprint, revision: remote.revision, schema: remote.schema
                }, blocked: null } });
                this._syncCompatibilityError = null;
                return { applied: false, acknowledged: true };
            }
            const validated = remote.validated;
            const written = { ...validated,
                sync: this.validateSyncConfig({ ...(raw.sync || this.defaultConfig.sync), enabled: confirmedReplacement ? raw.sync?.enabled === true : true, lastSync: remote.meta.updatedAt || '', lastError: '' }),
                [this.layoutGenerationKey]: this.createLayoutGeneration(),
                [this.settingsGenerationKey]: this.createLayoutGeneration(),
                [this.syncIdentityStateKey]: { ...guard, ack: { fingerprint: remote.fingerprint, revision: remote.revision, schema: remote.schema }, blocked: null }
            };
            // Persist and verify recovery independently before submitting the
            // replacement. A failed or ambiguous commit must leave this copy.
            const recovery = await this.makeRecovery(raw, 'beforeCloudReplacement');
            // Portable exports deliberately fill defaults. Keep a second,
            // device-only exact snapshot so absent fields and original records
            // are recoverable too. Never collect unrelated/auth storage keys.
            const recoveryKeys = [...Object.keys(this.defaultConfig), 'schemaVersion', this.layoutGenerationKey, this.settingsGenerationKey];
            recovery.rawConfiguration = LayoutIdentity.copy(Object.fromEntries(recoveryKeys.filter(key =>
                Object.prototype.hasOwnProperty.call(raw, key)).map(key => [key, raw[key]])));
            recovery.rawConfigurationChecksum = await this.fingerprint(recovery.rawConfiguration);
            await this.persistVerifiedSyncRecovery(recovery, raw[this.restoreRecoveryKey]);
            const expectedWrittenHash = await this.fingerprint(written);
            if (await this._local.set(LayoutIdentity.copy(written)) === false) throw new Error('Cloud replacement was not acknowledged. The verified local recovery copy is retained.');
            const readback = await this._local.get(Object.keys(written));
            if (await this.fingerprint(readback) !== expectedWrittenHash) throw new Error('Cloud replacement could not be verified. The verified local recovery copy is retained.');
            this._syncCompatibilityError = null;
            return { applied: true };
        }, true);
    }

    async ensureSyncInitialized() {
        if (!(await this.isDefaultWorkspace())) { this._syncInitialized = true; return; }
        if (this._syncInitialized) return;
        if (this._syncInitPromise) return this._syncInitPromise;
        this._syncInitPromise = (async () => {
            if (!this.isSyncAvailable()) { this._syncInitialized = true; return; }
            try {
                const expectedLocalFingerprint = await this.withLocalWriteLock(async () => {
                    const raw = await this._local.get(null);
                    if (raw.sync?.enabled === true) this.assertSyncURLCompatibility(raw);
                    return raw.sync?.enabled === true ? this.syncInitializationFingerprint(raw) : null;
                }, true);
                // Chrome's cloud preference is not consent on this device.
                if (expectedLocalFingerprint === null) return;
                const remote = await this.readSyncSnapshot();
                if (remote.meta?.enabled) await this.acceptSyncSnapshot(remote, { initializing: true, expectedLocalFingerprint });
            } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
                if (error.code === 'SYNC_IDENTITY_COMPATIBILITY' || error.code === 'LAYOUT_IDENTITY_INVALID') {
                    await this.blockSync(error);
                } else {
                    // Read failures cannot establish a safe cloud replacement.
                    console.warn('Cloud sync initialization failed:', error);
                    await this.updateLocalSyncState({ lastError: error.message || String(error) });
                }
            } finally { this._syncInitialized = true; }
        })();
        return this._syncInitPromise;
    }

    async getSyncStatus() {
        if (!(await this.isDefaultWorkspace())) return this.forDefaultWorkspace().getSyncStatus(...arguments);
        await this.ensureSyncInitialized();
        let remote = null;
        if (this.isSyncAvailable()) {
            try { remote = await this.getRemoteMeta(); }
            catch (error) {
                if (error.code !== 'SYNC_IDENTITY_COMPATIBILITY') throw error;
                await this.blockSync(error);
            }
        }
        const raw = await this._local.get(['sync', this.syncIdentityStateKey]);
        const localSync = this.validateSyncConfig(raw.sync || this.defaultConfig.sync);
        return { available: this.isSyncAvailable(), enabled: localSync.enabled, local: localSync,
            compatibilityBlocked: raw[this.syncIdentityStateKey]?.blocked || this._syncCompatibilityError,
            remote,
            storage: (await this.getStorageInfo()).sync };
    }

    async setSyncEnabled(enabled) {
        if (!(await this.isDefaultWorkspace())) return this.forDefaultWorkspace().setSyncEnabled(...arguments);
        await this.ensureSyncInitialized();
        if (!enabled) { await this.disableRemoteSync(); return this.getSyncStatus(); }
        const previous = await this.withLocalWriteLock(async () => {
            const raw = await this._local.get(['sync']);
            const current = this.validateSyncConfig(raw.sync || this.defaultConfig.sync);
            await this._local.set({ sync: { ...current, enabled, lastError: '' } });
            return current;
        });
        try { return await this.pushToSync(); }
        catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            await this.updateLocalSyncState({ enabled: error.code === 'SYNC_IDENTITY_COMPATIBILITY' ? previous.enabled : false, lastError: error.message || String(error) });
            throw error;
        }
    }

    async withSyncWriteLock(operation) {
        const locks = this.workspace?.manager.locks || (typeof navigator !== 'undefined' ? navigator.locks : null);
        if (!locks?.request) throw new Error('Safe Chrome Sync writes require Web Locks.');
        return locks.request('local-itab-sync-write', operation);
    }

    async pushToSync() {
        if (!(await this.isDefaultWorkspace())) return this.forDefaultWorkspace().pushToSync(...arguments);
        this.cancelSyncPush();
        if (this._isApplyingSync) return this.getSyncStatus();
        if (!this.isSyncAvailable()) throw new Error('Chrome Sync storage is not available in this browser.');
        await this.ensureSyncInitialized();
        try {
            return await this.withSyncWriteLock(async () => {
                const remote = await this.readSyncSnapshot();
                const ticket = await this.withLocalWriteLock(async () => {
                    const raw = await this._local.get(null);
                    const guard = raw[this.syncIdentityStateKey] || {};
                    const local = this.layoutSnapshot(raw);
                    await this.checkSyncIdentityAtRead(local, remote, guard, raw, { pushing: true });
                    if (raw.sync?.enabled !== true) return this.persistSyncReview(raw);
                    if (remote.payload) {
                        if (!(await this.sameSyncConfiguration(raw, remote))) return this.persistSyncReview(raw);
                        await this._local.set({ [this.syncIdentityStateKey]: { ...guard, ack: {
                            fingerprint: remote.fingerprint, revision: remote.revision, schema: remote.schema
                        }, blocked: null } });
                        return { acknowledged: true };
                    }
                    const { payload, omittedAssets } = this.prepareSyncPayload(this.validateStoredConfigObject(raw));
                    const schema = LayoutIdentity.active(payload.layout) ? 2 : 1;
                    const fingerprint = await this.fingerprint({ schema, payload });
                    const revision = this.createLayoutGeneration(), updatedAt = new Date().toISOString();
                    const json = JSON.stringify(payload), chunks = this.createSyncChunks(json);
                    const meta = { enabled: true, version: 2, configurationSchemaVersion: schema, revision, payloadHash: fingerprint,
                        updatedAt, chunkCount: chunks.length, payloadBytes: this.getUtf8ByteLength(json), omittedAssets };
                    const items = { [this.syncMetaKey]: meta };
                    chunks.forEach((chunk, index) => { items[`${this.syncChunkPrefix}${index}`] = chunk; });
                    if (this.getSyncItemsBytes(items) > this.syncTotalBudget) throw new Error('Cloud sync payload exceeds its storage quota. Keep a manual or Drive backup; no identity data was omitted.');
                    const own = { revision, fingerprint, schema };
                    await this._local.set({ [this.syncIdentityStateKey]: { ...guard, ownWrites: [...(guard.ownWrites || []).slice(-7), own] } });
                    return { items, meta, own, generation: local.generation };
                }, true);
                if (ticket.acknowledged) return this.getSyncStatus();
                const latestRemote = await this.readSyncSnapshot();
                if (JSON.stringify(latestRemote.meta) !== JSON.stringify(remote.meta) || latestRemote.fingerprint !== remote.fingerprint) {
                    await this.withLocalWriteLock(async () => this.persistSyncReview(await this._local.get(null)), true);
                }
                // Recheck shared state after asynchronous snapshot preparation;
                // another page may have blocked Sync while this upload waited.
                let upload;
                await this.withLocalWriteLock(async () => {
                    const latest = await this._local.get([this.syncIdentityStateKey, this.layoutGenerationKey, 'sync', 'links']);
                    this.assertSyncURLCompatibility(latest);
                    if (latest[this.syncIdentityStateKey]?.blocked || this._syncCompatibilityError) throw this.compatibilityError(latest[this.syncIdentityStateKey]?.blocked?.reason || this._syncCompatibilityError.reason);
                    if ((latest[this.layoutGenerationKey] || null) !== ticket.generation) throw new Error('Local data was replaced before upload. Review it and retry.');
                    if (latest.sync?.enabled !== true) throw this.syncReviewError();
                    // Enqueue under the same local lock as persisted blocking.
                    // Provider completion is awaited outside the critical section.
                    upload = this.chromeApi.storage.sync.set(ticket.items);
                    upload.catch(() => {});
                }, true);
                await upload;
                const oldCount = Number.isFinite(remote.meta?.chunkCount) ? remote.meta.chunkCount : 0;
                if (oldCount > ticket.meta.chunkCount) await this.chromeApi.storage.sync.remove(Array.from({ length: oldCount - ticket.meta.chunkCount }, (_, index) => `${this.syncChunkPrefix}${index + ticket.meta.chunkCount}`));
                await this.withLocalWriteLock(async () => {
                    const raw = await this._local.get(['sync', this.syncIdentityStateKey, this.layoutGenerationKey]);
                    const guard = raw[this.syncIdentityStateKey] || {};
                    if ((raw[this.layoutGenerationKey] || null) !== ticket.generation) throw new Error('Local data was replaced during upload. Its Sync state was not changed.');
                    if (guard.blocked) throw this.compatibilityError(guard.blocked.reason);
                    await this._local.set({
                        sync: this.validateSyncConfig({ ...(raw.sync || this.defaultConfig.sync), enabled: true, lastSync: ticket.meta.updatedAt, lastError: '' }),
                        [this.syncIdentityStateKey]: { ...guard, ack: ticket.own }
                    });
                }, true);
                return this.getSyncStatus();
            });
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            if (error.code === 'SYNC_IDENTITY_COMPATIBILITY' || error.code === 'LAYOUT_IDENTITY_INVALID') await this.blockSync(error);
            else await this.updateLocalSyncState({ lastError: error.message || String(error) });
            throw error;
        }
    }

    async previewCloudReplacement() {
        if (!(await this.isDefaultWorkspace())) return this.forDefaultWorkspace().previewCloudReplacement(...arguments);
        const remote = await this.readSyncSnapshot();
        if (!remote.payload) throw new Error('No complete cloud copy is available.');
        return { fingerprint: remote.fingerprint, revision: remote.revision, schema: remote.schema, shortcuts: remote.validated.links.length };
    }

    async pullFromSync(options = {}) {
        if (!(await this.isDefaultWorkspace())) return this.forDefaultWorkspace().pullFromSync(...arguments);
        if (!this.isSyncAvailable()) throw new Error('Chrome Sync storage is not available in this browser.');
        try {
            const remote = await this.readSyncSnapshot();
            if (options.confirmedReplacement && !this.sameSyncRevision(options.expectedRemote, remote)) throw this.compatibilityError('The cloud copy changed after confirmation. Review it again before replacing local data.');
            if (!remote.meta?.enabled) {
                if (remote.meta?.enabled === false && await this.isOwnSyncMeta(remote.meta)) return { applied: false, status: await this.getSyncStatus() };
                await this.withLocalWriteLock(async () => {
                    const raw = await this._local.get(null);
                    this.assertSyncURLCompatibility(raw);
                    if (raw.sync?.enabled && (LayoutIdentity.active(raw.layout) || raw[this.syncIdentityStateKey]?.blocked)) {
                        const error = this.compatibilityError('The cloud copy was removed or disabled. Local data and the enabled preference are preserved. Review Sync settings before replacing either copy.');
                        const config = this.validateStoredConfigObject(raw); delete config.sync;
                        error.localFingerprint = await this.fingerprint(config);
                        throw error;
                    }
                    await this._local.set({ sync: this.validateSyncConfig({ ...(raw.sync || this.defaultConfig.sync), enabled: false }) });
                }, true);
                return { applied: false, status: await this.getSyncStatus() };
            }
            const result = await this.acceptSyncSnapshot(remote, options);
            return { ...result, status: await this.getSyncStatus() };
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            if (error.code === 'SYNC_IDENTITY_COMPATIBILITY' || error.code === 'LAYOUT_IDENTITY_INVALID') await this.blockSync(error);
            throw error;
        }
    }

    async clearSync() {
        if (!(await this.isDefaultWorkspace())) return this.forDefaultWorkspace().clearSync(...arguments);
        if (!this.isSyncAvailable()) {
            throw new Error('Chrome Sync storage is not available in this browser.');
        }

        await this.disableRemoteSync(true);
        return this.getSyncStatus();
    }

    async getRemoteMeta() {
        if (!this.isSyncAvailable()) return null;
        const result = await this.chromeApi.storage.sync.get([this.syncMetaKey]);
        if (!result || typeof result !== 'object' || Array.isArray(result)) throw this.compatibilityError('Cloud metadata could not be read safely.', 'incomplete');
        if (!Object.prototype.hasOwnProperty.call(result, this.syncMetaKey)) return null;
        const meta = result[this.syncMetaKey];
        if (!meta || typeof meta !== 'object' || Array.isArray(meta) || typeof meta.enabled !== 'boolean' || (meta.enabled === false && meta.chunkCount !== 0)) throw this.compatibilityError('Cloud metadata is malformed. Nothing was replaced or removed.', 'incomplete');
        return meta;
    }

    async readRemoteSyncData(meta) {
        const count = meta?.chunkCount;
        if (!Number.isInteger(count) || count <= 0 || count > this.syncMaxChunks) throw this.compatibilityError('Cloud snapshot chunk count is invalid.', 'incomplete');
        const keys = Array.from({ length: count }, (_, index) => `${this.syncChunkPrefix}${index}`);
        const raw = await this.chromeApi.storage.sync.get(keys);
        if (keys.some(key => typeof raw[key] !== 'string' || !raw[key])) throw this.compatibilityError('Cloud snapshot is still incomplete. Nothing was applied.', 'incomplete');
        try { return JSON.parse(keys.map(key => raw[key]).join('')); }
        catch (_) { throw this.compatibilityError('Cloud snapshot could not be read safely. Nothing was applied.', 'incomplete'); }
    }

    async disableRemoteSync(clearChunks = false) {
        if (!(await this.isDefaultWorkspace())) return this.forDefaultWorkspace().disableRemoteSync(...arguments);
        this.cancelSyncPush();
        if (!this.isSyncAvailable()) return;
        await this.withSyncWriteLock(async () => {
            const oldMeta = await this.getRemoteMeta();
            if (oldMeta && (typeof oldMeta.enabled !== 'boolean' || (oldMeta.enabled === false && oldMeta.chunkCount !== 0))) {
                throw this.compatibilityError('Cloud state is incomplete. Nothing was removed.', 'incomplete');
            }
            if (oldMeta?.enabled) {
                // Every readable cloud copy needs verified recovery before
                // removal, including when a prior block could not be persisted.
                const cloud = await this.readSyncSnapshot();
                if (!cloud.payload || !cloud.validated || JSON.stringify(cloud.meta) !== JSON.stringify(oldMeta)) throw this.syncReviewError();
                const payload = this.buildManualExportPayload(cloud.validated);
                await this.withLocalWriteLock(async () => {
                    const prior = (await this._local.get([this.restoreRecoveryKey]))[this.restoreRecoveryKey];
                    const rawConfiguration = LayoutIdentity.copy(cloud.payload);
                    await this.persistVerifiedSyncRecovery({ reason: 'beforeCloudClear', payload, checksum: await this.fingerprint(payload),
                        rawConfiguration, rawConfigurationChecksum: await this.fingerprint(rawConfiguration) }, prior);
                }, true);
                const latest = await this.readSyncSnapshot();
                if (latest.fingerprint !== cloud.fingerprint || JSON.stringify(latest.meta) !== JSON.stringify(cloud.meta)) throw this.syncReviewError();
            }
            const disabledMeta = { enabled: false, version: 2, configurationSchemaVersion: 0, revision: this.createLayoutGeneration(), payloadHash: await this.fingerprint({ enabled: false }), updatedAt: new Date().toISOString(), chunkCount: 0, payloadBytes: 0, omittedAssets: [] };
            await this.withLocalWriteLock(async () => {
                const raw = await this._local.get([this.syncIdentityStateKey]);
                const guard = raw[this.syncIdentityStateKey] || {};
                await this._local.set({ [this.syncIdentityStateKey]: { ...guard, ownWrites: [...(guard.ownWrites || []).slice(-7), { revision: disabledMeta.revision, fingerprint: disabledMeta.payloadHash, schema: 0 }] } });
            }, true);
            const latestMeta = await this.getRemoteMeta();
            if (JSON.stringify(latestMeta) !== JSON.stringify(oldMeta)) throw this.syncReviewError();
            const oldCount = Number.isFinite(oldMeta?.chunkCount) ? oldMeta.chunkCount : 0;
            await this.chromeApi.storage.sync.set({ [this.syncMetaKey]: disabledMeta });
            if (oldCount) await this.chromeApi.storage.sync.remove(Array.from({ length: oldCount }, (_, index) => `${this.syncChunkPrefix}${index}`));
            await this.withLocalWriteLock(async () => {
                const raw = await this._local.get([this.syncIdentityStateKey, 'sync']);
                await this._local.set({ [this.syncIdentityStateKey]: { ...(raw[this.syncIdentityStateKey] || {}), blocked: null, ack: null },
                    sync: this.validateSyncConfig({ ...(raw.sync || this.defaultConfig.sync), enabled: false, lastError: '' }) });
            }, true);
            this._syncCompatibilityError = null;
        });
    }

    getUtf8ByteLength(value) {
        const text = String(value);
        if (typeof TextEncoder !== 'undefined') {
            if (!this._textEncoder) {
                this._textEncoder = new TextEncoder();
            }
            return this._textEncoder.encode(text).length;
        }

        if (typeof Blob !== 'undefined') {
            return new Blob([text]).size;
        }

        return text.length;
    }

    getSyncItemQuotaBytes() {
        const quota = this.isSyncAvailable()
            ? this.chromeApi.storage.sync.QUOTA_BYTES_PER_ITEM
            : null;
        return Number.isFinite(quota) ? quota : 8192;
    }

    getSyncItemBudgetBytes() {
        return Math.max(0, this.getSyncItemQuotaBytes() - 64);
    }

    getSyncItemBytes(key, value) {
        return this.getUtf8ByteLength(key) + this.getUtf8ByteLength(JSON.stringify(value));
    }

    getSyncItemsBytes(items) {
        return Object.entries(items).reduce((total, [key, value]) => {
            return total + this.getSyncItemBytes(key, value);
        }, 0);
    }

    createSyncChunks(payloadJson) {
        const chunks = [];
        let chunk = '';

        for (const char of payloadJson) {
            const key = `${this.syncChunkPrefix}${chunks.length}`;
            const candidate = chunk + char;
            if (this.getSyncItemBytes(key, candidate) <= this.getSyncItemBudgetBytes()) {
                chunk = candidate;
                continue;
            }

            if (!chunk) {
                throw new Error('Cloud sync payload contains an item that is too large for Chrome Sync.');
            }

            chunks.push(chunk);
            if (chunks.length >= this.syncMaxChunks) {
                throw new Error('Cloud sync payload needs too many chunks. Remove some shortcuts or use manual export for large data.');
            }

            chunk = char;
            const nextKey = `${this.syncChunkPrefix}${chunks.length}`;
            if (this.getSyncItemBytes(nextKey, chunk) > this.getSyncItemBudgetBytes()) {
                throw new Error('Cloud sync payload contains an item that is too large for Chrome Sync.');
            }
        }

        chunks.push(chunk);
        return chunks;
    }

    async updateLocalSyncState(partial) {
        try {
            await this.withLocalWriteLock(async () => {
                const current = await this._local.get(['sync']);
                const next = this.validateSyncConfig({
                    ...(current.sync || this.defaultConfig.sync),
                    ...partial
                });
                await this._local.set({ sync: next });
            });
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            console.warn('Failed to update local sync state:', error);
        }
    }

    prepareSyncPayload(config) {
        this.assertSyncURLCompatibility(config);
        const source = this.validateStoredConfigObject(config);
        const payload = {};
        const omittedAssets = [];

        for (const key of Object.keys(this.defaultConfig)) {
            if (key !== 'sync') {
                payload[key] = JSON.parse(JSON.stringify(source[key]));
            }
        }

        if (payload.bg?.type === 'image' && this.isLargeEmbeddedAsset(payload.bg.value)) {
            payload.bg = { type: 'gradient', value: '' };
            omittedAssets.push('backgroundImage');
        }

        if (payload.movie?.poster && this.isLargeEmbeddedAsset(payload.movie.poster)) {
            payload.movie.poster = '';
            omittedAssets.push('moviePoster');
        }

        if (Array.isArray(payload.links)) {
            payload.links = payload.links.map(link => {
                if (this.isLargeEmbeddedAsset(link.icon)) {
                    return { ...link, icon: '🌐' };
                }
                return link;
            });
        }

        return { payload, omittedAssets };
    }

    isLargeEmbeddedAsset(value) {
        return typeof value === 'string' && (value.startsWith('data:') || value.length > 4000);
    }

    async shouldIgnoreRemoteSyncChange(changes = {}) {
        let meta = changes[this.syncMetaKey]?.newValue;
        if (!meta) {
            meta = await this.getRemoteMeta();
            // Chunk-only edits to an active copy still require full validation.
            if (meta?.enabled !== false) return false;
        }
        return this.isOwnSyncMeta(meta);
    }

    scheduleSyncPush(delayMs = 900) {
        if (this.workspace && this.workspace.id !== 'default') return;
        if (!this.isSyncAvailable() || this._isApplyingSync || this._syncCompatibilityError) return;
        if (this._syncPushTimer) {
            clearTimeout(this._syncPushTimer);
        }
        this._syncPushTimer = setTimeout(async () => {
            this._syncPushTimer = null;
            try {
                const shared = await this._local.get([this.syncIdentityStateKey]);
                if (shared[this.syncIdentityStateKey]?.blocked) return;
                if (await this.isSyncEnabledLocally()) {
                    await this.pushToSync();
                }
            } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
                console.warn('Background cloud sync failed:', error);
                if (error.code !== 'SYNC_IDENTITY_COMPATIBILITY') await this.updateLocalSyncState({ lastError: error.message || String(error) });
            }
        }, delayMs);
    }

    /**
     * Validate data according to schema
     * @param {string} key - Storage key
     * @param {*} value - Value to validate
     * @returns {*} - Validated value
     */
    validateData(key, value) {
        return ConfigurationCodec.ConfigurationValidator.prototype.validateData.call(this, key, value, {
            workspace: Boolean(this.workspace), warn: (...args) => console.warn(...args)
        });
    }

    // A tolerant display fallback must not authorize overwriting damaged data.
    validateClockBaseline(value) {
        try {
            if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid clock');
            const has = key => Object.prototype.hasOwnProperty.call(value, key);
            if (['hour12', 'showSeconds'].some(key => has(key) && typeof value[key] !== 'boolean')) throw new Error('Invalid clock format');
            return {
                hour12: has('hour12') ? value.hour12 : this.defaultConfig.clock.hour12,
                showSeconds: has('showSeconds') ? value.showSeconds : this.defaultConfig.clock.showSeconds,
                worldClocks: has('worldClocks') ? ClockPreferences.normalize(value.worldClocks) : []
            };
        } catch (_) {
            const error = new Error('Clock settings could not be safely compared. Your edits are still here; review the stored clock settings before retrying.');
            error.code = 'CLOCK_CONFLICT';
            throw error;
        }
    }

    /**
     * Validate categories configuration
     */
    // CAS must not silently repair/drop records in its authoritative comparison.
    // getAll's display normalization is not evidence that damaged data is absent.
    validateCategoryBaseline(value) {
        const ids = new Set();
        if (!Array.isArray(value) || value.some(category => {
            if (!category || typeof category !== 'object' || Array.isArray(category) ||
                typeof category.id !== 'string' || !category.id || ids.has(category.id) ||
                typeof category.name !== 'string' || !category.name.trim() || category.name !== category.name.trim() ||
                typeof category.icon !== 'string' || !category.icon ||
                Object.keys(category).some(key => !['id', 'name', 'icon'].includes(key))) return true;
            ids.add(category.id);
            return false;
        })) {
            const error = new Error('Categories could not be safely compared. Your edits are still here; review the stored categories before retrying.');
            error.code = 'CATEGORIES_CONFLICT';
            throw error;
        }
        return this.validateCategoriesConfig(value);
    }

    validateCategoriesConfig(value) {
        return ConfigurationCodec.ConfigurationValidator.prototype.validateCategoriesConfig.call(this, value, () => Date.now());
    }

}

// Install shared validation before constructing the ordinary singleton.
ConfigurationCodec.install(StorageManager.prototype);

// Create singleton instance
const storageManager = new StorageManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
} else {
    window.StorageManager = StorageManager;
    window.storageManager = storageManager;
}
