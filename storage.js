/**
 * Storage Manager for Local iTab Extension
 * Handles all local storage operations with error handling and validation
 */

const LayoutIdentity = typeof module !== 'undefined' && module.exports ? require('./shared/layout-identity.js') : window.LocalItabIdentity;
const DashboardTemplates = typeof module !== 'undefined' && module.exports ? require('./shared/dashboard-template-registry.js') : window.LocalItabTemplates;
const ClockPreferences = typeof module !== 'undefined' && module.exports ? require('./shared/world-clocks.js') : window.WorldClocks;
// Resolve lazily so non-import consumers need not load the bookmark parser.
const getBookmarkImportPlanner = () => typeof module !== 'undefined' && module.exports ? require('./shared/bookmark-import.js') : window.LocalItabBookmarkImport;
const BOOKMARK_IMPORT_STORAGE_LIMITS = Object.freeze({ links: 20000, categories: 2000, bytes: 32 * 1024 * 1024, nodes: 250000, depth: 32 });

// Personal content is owned by dedicated local stores, never configuration.
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
// Keep legacy empty-quote validation stable; only newly generated defaults localize.
const LEGACY_WELCOME_QUOTE = 'Welcome to your personalized new tab page!';
function getDefaultWelcomeQuote() {
    try {
        const message = typeof chrome !== 'undefined' && chrome.i18n?.getMessage?.('defaultWelcomeQuote');
        if (typeof message === 'string' && message.trim()) return message;
    } catch (_) {}
    return LEGACY_WELCOME_QUOTE;
}

// Only generated defaults are localized; saved category names are user content.
function getDefaultCategoryName(key, fallback) {
    try {
        const message = typeof chrome !== 'undefined' && chrome.i18n?.getMessage?.(key);
        if (typeof message === 'string' && message.trim() && message !== key) return message;
    } catch (_) {}
    return fallback;
}

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
        this.defaultConfig = {
            clock: { 
                hour12: false, 
                showSeconds: true,
                worldClocks: []
            },
            search: { 
                engine: 'google', 
                custom: '' 
            },
            bg: {
                type: 'gradient',
                value: ''
            },
            themePreset: 'aurora-glass',
            appearance: { template: 'clarity', colorMode: 'light' },
            show: {
                clock: true,
                search: true,
                shortcuts: true,
                weather: false,
                hot: false,
                movie: false
            },
            privacy: {
                onlineFavicons: false
            },
            categories: [
                { id: 'work', name: getDefaultCategoryName('defaultCategoryWork', 'Work'), icon: '\ud83d\udcbc' },
                { id: 'social', name: getDefaultCategoryName('defaultCategorySocial', 'Social'), icon: '\ud83d\udc65' },
                { id: 'entertainment', name: getDefaultCategoryName('defaultCategoryEntertainment', 'Entertainment'), icon: '\ud83c\udfae' },
                { id: 'tools', name: getDefaultCategoryName('defaultCategoryTools', 'Tools'), icon: '\ud83d\udd27' },
                { id: 'learning', name: getDefaultCategoryName('defaultCategoryLearning', 'Learning'), icon: '\ud83d\udcda' }
            ],
            links: [],
            weather: {
                city: 'Local',
                temp: 22,
                cond: 'Sunny',
                aqiLabel: 'Good',
                aqi: 50,
                low: 18,
                high: 26
            },
            hot: {
                tab: 'baidu',
                baidu: [],
                weibo: [],
                zhihu: []
            },
            movie: {
                title: 'Sample Movie',
                note: 'A great movie to watch',
                poster: ''
            },
            quote: getDefaultWelcomeQuote(),
            layout: {
                autoArrange: true,
                alignToGrid: true,
                gridSize: 96,
                columns: 6,
                positions: {}
            },
            ui: {
                dashboardHidden: false,
                dashboardPadding: null,
                showShortcutTitles: true,
                finderShortcutEnabled: true,
                shortcutsStyle: {
                    gapX: null,
                    gapY: null,
                    iconSize: null,
                    titleSize: null,
                    titleColor: ''
                }
            },
            sync: {
                enabled: false,
                lastSync: '',
                lastError: '',
                includeLargeAssets: false
            }
        };
        if (this.workspace) this.workspace.manager.configureValidation((values, globals) => this.validateWorkspaceValues(values, globals));
    }

    get chromeApi() { return this.workspace?.manager.chrome || (typeof chrome !== 'undefined' ? chrome : null); }

    get local() { return this.workspace?.local || this.chromeApi.storage.local; }

    // Writers in this class are enclosed by withLocalWriteLock. Keeping the
    // already-locked facade separate avoids reentrant locks without relying on
    // a shared boolean that would accidentally admit unrelated async callers.
    get _local() { return this.workspace?.lockedLocal || this.chromeApi.storage.local; }

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
        const projected = LayoutIdentity.copy(values);
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
                    const validatedValue = this.validateData(key, result[key]);
                    return validatedValue;
                } catch (validationError) {
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
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            console.error(`Storage get error for key "${key}":`, error);
            
            // Handle specific storage errors
            if (typeof errorHandler !== 'undefined') {
                errorHandler.handleStorageError(error, `retrieve ${key}`);
            }
            
            return defaultValue !== null ? defaultValue : this.getDefaultValue(key);
        }
    }

    assertConfigurationKeys(keys) {
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
            const latest = this.layoutSnapshot(raw);
            if (guardedCategories && JSON.stringify(this.validateCategoryBaseline(raw.categories === undefined ? this.defaultConfig.categories : raw.categories)) !==
                JSON.stringify(this.validateCategoryBaseline(options.expectedCategories))) {
                const error = new Error('Categories changed in another tab. Your category edits are still here. Review the latest categories in a new Settings tab before retrying.');
                error.code = 'CATEGORIES_CONFLICT';
                throw error;
            }
            if (guarded) {
                const expectedLinks = this.validateLinksConfig(options.expectedLinks);
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
            if (allocated) { written.links = candidate.links; written.layout = candidate.layout; }
            if (allocated && !protectedBefore && !raw[this.identityRecoveryKey]) written[this.identityRecoveryKey] = await this.makeRecovery(raw, 'beforeIdentity');
            if (options.confirmedRestore) {
                written[this.settingsGenerationKey] = this.createLayoutGeneration();
                // Provider preferences belong to this device at commit time, not
                // to the imported file or an earlier preview read.
                if (!this.workspace || this.workspace.id === 'default') written.sync = this.validateSyncConfig(raw.sync || this.defaultConfig.sync);
                else delete written.sync;
                written[this.restoreRecoveryKey] = await this.makeRecovery(raw, 'beforeRestore');
                if ((!this.workspace || this.workspace.id === 'default') && raw.sync?.enabled) written[this.syncIdentityStateKey] = {
                    ...(raw[this.syncIdentityStateKey] || {}),
                    blocked: { kind: 'restore', reason: 'Restored data is kept locally. Review compatible cloud data before resuming Sync.' }
                };
            }
            if (invalidatesLayout) written[this.layoutGenerationKey] = this.createLayoutGeneration();
            await this._local.set(written);
            return this.layoutSnapshot({ ...raw, ...written });
        }, guardedSettings || guarded || guardedCategories || guardedClock || LayoutIdentity.active(values.layout));
    }

    shortcutUndoError(code, message) {
        const error = new Error(message); error.code = code; return error;
    }

    sameShortcutUndoValue(left, right) {
        if (left === right) return true;
        if (!left || !right || typeof left !== 'object' || typeof right !== 'object' ||
            Array.isArray(left) !== Array.isArray(right)) return false;
        if (Array.isArray(left) && left.length !== right.length) return false;
        const keys = Object.keys(left);
        return keys.length === Object.keys(right).length && keys.every(key =>
            Object.prototype.hasOwnProperty.call(right, key) && this.sameShortcutUndoValue(left[key], right[key]));
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
                if (!this.sameShortcutUndoValue(this.validateLinksConfig(expected), this.validateLinksConfig(latest.links)) ||
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
        const payload = this.buildManualExportPayload(this.validateConfigObject(raw));
        return { reason, payload, providerState: this.validateSyncConfig(raw.sync || this.defaultConfig.sync), checksum: await this.fingerprint(payload) };
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
            const validatedValue = this.validateData(key, value);
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

    layoutSnapshot(raw) {
        const rawLinks = raw.links === undefined ? this.defaultConfig.links : raw.links;
        const links = this.validateLinksConfig(rawLinks);
        LayoutIdentity.validateBundle({ links, layout: raw.layout || this.defaultConfig.layout });
        if (links.length !== rawLinks.length) throw new Error('Stored shortcuts are invalid.');
        return JSON.parse(JSON.stringify({
            layout: this.validateStoredLayout(raw.layout),
            generation: this.readLayoutGeneration(raw), links
        }));
    }

    async getLayoutSnapshotForUpdate({ underLock = false } = {}) {
        const read = async () => this.layoutSnapshot(await this._local.get(['layout', 'links', this.layoutGenerationKey]));
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
                typeof link.url !== 'string' || !planner.canonicalURL(link.url) ||
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
        const expectedLinks = this.validateLinksConfig(expected.links);
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
                    if (!LayoutIdentity.active(latest.layout)) {
                        const raw = await this._local.get(null);
                        if (!raw[this.identityRecoveryKey]) written[this.identityRecoveryKey] = await this.makeRecovery(raw, 'beforeIdentity');
                    }
                }
                onWrite(copy(candidate));
                await this._local.set(written);
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
            return this.validateConfigObject(raw);
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
            const config = this.validateConfigObject(result);
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
            if (error.code === 'LAYOUT_IDENTITY_INVALID') throw error;
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
                validatedData[key] = this.validateData(key, value);
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
            if (error.code?.startsWith('SETTINGS_') || error.code === 'CATEGORIES_CONFLICT' || error.code === 'LINKS_LOCK_UNAVAILABLE' || error.code === 'CLOCK_CONFLICT' || error.code === 'CLOCK_LOCK_UNAVAILABLE') throw error;
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
                await this._local.remove(Object.keys(stored).filter(key => key !== this.layoutGenerationKey && key !== this.settingsGenerationKey && !LOCAL_PERSONAL_CONTENT_KEYS.includes(key) && (!this.workspace || !['privacy', 'sync', this.syncIdentityStateKey].includes(key))));
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

    /**
     * Get default value for a key from schema
     * @param {string} key - Storage key
     * @returns {*} - Default value
     */
    getDefaultValue(key) {
        return this.defaultConfig.hasOwnProperty(key)
            ? JSON.parse(JSON.stringify(this.defaultConfig[key]))
            : null;
    }

    cloneDefaultConfig() {
        return JSON.parse(JSON.stringify(this.defaultConfig));
    }

    getDisabledSyncConfig() {
        return this.validateSyncConfig({
            enabled: false,
            lastSync: '',
            lastError: '',
            includeLargeAssets: false
        });
    }

    sanitizeConfigForBackup(config) {
        const sanitized = this.validateConfigObject(config);
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
        const source = this.validateConfigObject(config);
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

    buildManualExportPayload(config, metadata = {}) {
        const sanitized = this.sanitizeConfigForBackup(config);
        const exportDate = metadata.exportDate || new Date().toISOString();

        return {
            version: '1.0',
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

        return {
            version: '1.0',
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

    validateImportPayload(importData) {
        const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
        const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
        const invalid = detail => { throw new Error(`Invalid backup: ${detail}. No settings have been changed.`); };
        if (!isObject(importData)) invalid('settings data must be an object');
        if (has(importData, 'version') && importData.version !== '1.0') invalid('unsupported backup version');
        if (has(importData, 'type') && importData.type !== 'backupSnapshot') invalid('unrecognized backup type');
        if (has(importData, 'app') && importData.app !== 'local-itab') invalid('backup belongs to another app');
        if (has(importData, 'schemaVersion') && ![1, 2].includes(importData.schemaVersion)) {
            invalid('unsupported schema version; use a backup exported by this version of Local iTab');
        }

        let settings = importData;
        if (has(importData, 'data') || has(importData, 'settings')) {
            if (has(importData, 'data') && has(importData, 'settings')) invalid('ambiguous settings envelope');
            settings = has(importData, 'data') ? importData.data : importData.settings;
        }
        if (!isObject(settings)) invalid('settings data must be an object');
        const hasIdentity = LayoutIdentity.active(settings.layout) || (Array.isArray(settings.links) && settings.links.some(link => Object.prototype.hasOwnProperty.call(link || {}, 'layoutId')));
        if (hasIdentity && importData.schemaVersion !== 2) invalid('identity-bearing data needs an intact schema-2 export');
        if (importData.schemaVersion === 2 && !hasIdentity) invalid('schema-2 identity format is missing');
        // A full replacement must explicitly include shortcuts, including [] for
        // a genuinely empty backup. Missing/corrupt data must never become defaults.
        if (!has(settings, 'links') || !Array.isArray(settings.links)) invalid('a shortcuts array is required');
        const checkTypes = (value, schema, path) => {
            if (schema === null) {
                if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) invalid(`invalid ${path}`);
            } else if (Array.isArray(schema)) {
                if (!Array.isArray(value)) invalid(`invalid ${path}`);
            } else if (isObject(schema)) {
                if (!isObject(value)) invalid(`invalid ${path}`);
                for (const [key, expected] of Object.entries(schema)) {
                    if (!has(value, key)) continue; // Older backups may omit newer settings.
                    if (`${path}.${key}` === 'settings.ui.dashboardPadding' && isObject(value[key])) {
                        checkTypes(value[key], { top: null, right: null, bottom: null, left: null }, `${path}.${key}`);
                    } else {
                        checkTypes(value[key], expected, `${path}.${key}`);
                    }
                }
            } else if (typeof value !== typeof schema || (typeof value === 'number' && !Number.isFinite(value))) {
                invalid(`invalid ${path}`);
            }
        };
        checkTypes(settings, this.defaultConfig, 'settings');
        // Import/restore/Sync preflight is strict. Runtime recovery must never
        // turn a malformed supplied list into an apparently valid empty backup.
        let worldClocks;
        if (settings.clock && has(settings.clock, 'worldClocks')) {
            try { worldClocks = ClockPreferences.normalize(settings.clock.worldClocks); }
            catch (_) { invalid('invalid world clocks'); }
        }
        for (const link of settings.links) {
            checkTypes(link, { title: '', url: '', icon: '', category: '' }, 'shortcut');
        }
        for (const category of settings.categories || []) {
            checkTypes(category, { id: '', name: '', icon: '' }, 'category');
        }
        for (const position of Object.values(settings.layout?.positions || {})) {
            if (!isObject(position) || !Number.isFinite(position.x) || !Number.isFinite(position.y)) invalid('invalid shortcut position');
        }
        const checkChoice = (value, choices, name) => {
            if (value !== undefined && !choices.includes(value)) invalid(`unsupported ${name}`);
        };
        checkChoice(settings.themePreset, ['aurora-glass', 'ink-paper', 'warm-studio', 'signal-pop'], 'theme');
        checkChoice(settings.appearance?.template, DashboardTemplates.ids, 'dashboard template');
        checkChoice(settings.appearance?.colorMode, ['light', 'dark'], 'color mode');
        checkChoice(settings.bg?.type, ['gradient', 'color', 'image', 'api'], 'background type');
        checkChoice(settings.search?.engine, ['google', 'bing', 'duck', 'custom'], 'search engine');
        checkChoice(settings.hot?.tab, ['baidu', 'weibo', 'zhihu'], 'topic source');

        // Imports must produce category identities that ordinary guarded saves can
        // compare. Reserve every explicit ID before assigning legacy missing IDs;
        // never attach an orphan shortcut to a newly invented category by accident.
        const explicitCategoryIds = new Set();
        const usedCategoryIds = new Set(['all', ...this.defaultConfig.categories.map(category => category.id),
            ...settings.links.map(link => link.category || 'work')]);
        for (const category of settings.categories || []) {
            if (!category.id) continue;
            if (explicitCategoryIds.has(category.id)) invalid('duplicate category IDs');
            explicitCategoryIds.add(category.id);
            usedCategoryIds.add(category.id);
        }
        let nextCategoryId = 1;
        const importCategories = settings.categories?.map(category => {
            if (category.id) return category;
            let id;
            do { id = `cat_import_${nextCategoryId++}`; } while (usedCategoryIds.has(id));
            usedCategoryIds.add(id);
            return { ...category, id };
        });
        let links;
        let categories;
        try {
            links = this.validateLinksConfig(settings.links);
            if (has(settings, 'categories')) categories = this.validateCategoriesConfig(importCategories);
        } catch (_) {
            invalid('a shortcut or category is malformed');
        }
        if (links.length !== settings.links.length) invalid('a shortcut has a missing title or invalid HTTP/HTTPS URL');
        if (categories && categories.length !== settings.categories.length) invalid('a category has a missing name');
        if (settings.hot) {
            for (const source of ['baidu', 'weibo', 'zhihu']) {
                if (!has(settings.hot, source)) continue;
                const topics = settings.hot[source];
                if (!Array.isArray(topics) || topics.some(topic => !isObject(topic) || typeof topic.t !== 'string' || !topic.t ||
                    (has(topic, 's') && (typeof topic.s !== 'number' || !Number.isFinite(topic.s))))) {
                    invalid(`invalid ${source} topics`);
                }
            }
        }

        const validated = this.validateConfigObject(categories ? { ...settings, categories } : settings);
        if (worldClocks !== undefined) validated.clock.worldClocks = worldClocks;
        if (settings.bg?.type === 'image' && settings.bg.value && !validated.bg.value) invalid('background image data is corrupt or unsupported');
        if (settings.movie?.poster && !validated.movie.poster) invalid('movie poster data is corrupt or unsupported');
        if (settings.search?.custom?.trim() && !validated.search.custom) invalid('custom search URL is invalid');
        validated.sync = this.getDisabledSyncConfig();
        return validated;
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
        if (!this.sameShortcutUndoValue(checked, value.data)) throw new Error('Complete backup configuration is malformed or noncanonical.');
        return LayoutIdentity.copy(value);
    }

    completeBackupConfigFromRaw(raw) {
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

    validateConfigObject(data) {
        const validated = this.cloneDefaultConfig();
        if (!data || typeof data !== 'object') {
            return validated;
        }

        if (LayoutIdentity.active(data.layout) || (Array.isArray(data.links) && data.links.some(link => LayoutIdentity.has(link, 'layoutId')))) LayoutIdentity.validateBundle(data);
        for (const key of Object.keys(this.defaultConfig)) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                validated[key] = this.validateData(key, data[key]);
            }
        }

        LayoutIdentity.validateBundle(validated);
        // Resolve from raw data, before defaults can masquerade as a saved legacy choice.
        validated.appearance = this.resolveAppearance(data);
        return validated;
    }

    validateAppearanceConfig(value) {
        const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        return {
            template: DashboardTemplates.ids.includes(source.template) ? source.template : 'clarity',
            colorMode: ['light', 'dark'].includes(source.colorMode) ? source.colorMode : 'light'
        };
    }

    resolveAppearance(raw = {}) {
        if (Object.prototype.hasOwnProperty.call(raw, 'appearance')) {
            return this.validateAppearanceConfig(raw.appearance);
        }
        return {
            template: 'clarity',
            colorMode: ['aurora-glass', 'warm-studio', 'signal-pop'].includes(raw.themePreset) ? 'dark' : 'light'
        };
    }

    // Strict and small: a failed read must not be mistaken for a fresh preference.
    async getAppearanceForUpdate() {
        const raw = await this._local.get(['appearance', 'themePreset']);
        return this.resolveAppearance(raw);
    }

    appearanceError(code = 'APPEARANCE_CONFLICT') {
        const error = new Error('Saved preferences changed or could not be safely compared. Keep any draft and open a new tab before retrying.');
        error.code = code; return error;
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
                const config = this.validateConfigObject(raw); delete config.sync;
                const localFingerprint = guard.blocked?.localFingerprint || error.localFingerprint || await this.fingerprint(config);
                await this._local.set({ [this.syncIdentityStateKey]: { ...guard,
                    blocked: guard.blocked?.kind === 'restore' ? guard.blocked : { ...blocked, localFingerprint, ...(remote ? { fingerprint: remote.fingerprint, revision: remote.revision } : {}) }
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
        if (guard.blocked?.kind === 'restore') throw this.compatibilityError(guard.blocked.reason, 'restore');
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
        try { this.checkSyncIdentity(local, remote, guard, options); }
        catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            // Bind a newly detected conflict to the same locked local read;
            // later edits cannot be mistaken for the unchanged blocked copy.
            const config = this.validateConfigObject(raw); delete config.sync;
            error.localFingerprint = await this.fingerprint(config);
            throw error;
        }
    }

    async acceptSyncSnapshot(remote, { confirmedReplacement = false, initializing = false } = {}) {
        return this.withLocalWriteLock(async () => {
            const raw = await this._local.get(null);
            const local = this.layoutSnapshot(raw);
            const guard = raw[this.syncIdentityStateKey] || {};
            if (guard.blocked && !confirmedReplacement) {
                if (guard.blocked.kind === 'restore') throw this.compatibilityError(guard.blocked.reason, 'restore');
                const config = this.validateConfigObject(raw); delete config.sync;
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
            await this.checkSyncIdentityAtRead(local, remote, guard, raw, { confirmedReplacement });
            // A pre-feature lastSync timestamp alone is not an identity-safe ack.
            // Only exact complete payload equality can establish its fingerprint
            // without replaying already-known legacy data.
            if (initializing && raw.sync?.lastSync === remote.meta.updatedAt && !confirmedReplacement) {
                const localPayload = this.prepareSyncPayload(this.validateConfigObject(raw)).payload;
                const fingerprint = await this.fingerprint({ schema: LayoutIdentity.active(raw.layout) ? 2 : 1, payload: localPayload });
                if (fingerprint === remote.fingerprint) {
                    await this._local.set({ [this.syncIdentityStateKey]: { ...guard, ack: { fingerprint, revision: remote.revision, schema: remote.schema }, blocked: null } });
                    this._syncCompatibilityError = null;
                }
                return { applied: false, acknowledged: fingerprint === remote.fingerprint };
            }
            const validated = remote.validated;
            const written = { ...validated,
                sync: this.validateSyncConfig({ ...(raw.sync || this.defaultConfig.sync), enabled: confirmedReplacement ? raw.sync?.enabled === true : true, lastSync: remote.meta.updatedAt || '', lastError: '' }),
                [this.layoutGenerationKey]: this.createLayoutGeneration(),
                [this.settingsGenerationKey]: this.createLayoutGeneration(),
                [this.syncIdentityStateKey]: { ...guard, ack: { fingerprint: remote.fingerprint, revision: remote.revision, schema: remote.schema }, blocked: null }
            };
            if (confirmedReplacement) written[this.restoreRecoveryKey] = await this.makeRecovery(raw, 'beforeCloudReplacement');
            await this._local.set(written);
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
                const remote = await this.readSyncSnapshot();
                if (remote.meta?.enabled) await this.acceptSyncSnapshot(remote, { initializing: true });
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
        const raw = await this._local.get(['sync', this.syncIdentityStateKey]);
        const localSync = this.validateSyncConfig(raw.sync || this.defaultConfig.sync);
        return { available: this.isSyncAvailable(), enabled: localSync.enabled, local: localSync,
            compatibilityBlocked: raw[this.syncIdentityStateKey]?.blocked || this._syncCompatibilityError,
            remote: this.isSyncAvailable() ? await this.getRemoteMeta() : null,
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
                    const { payload, omittedAssets } = this.prepareSyncPayload(this.validateConfigObject(raw));
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
                // Recheck shared state after asynchronous snapshot preparation;
                // another page may have blocked Sync while this upload waited.
                let upload;
                await this.withLocalWriteLock(async () => {
                    const latest = await this._local.get([this.syncIdentityStateKey, this.layoutGenerationKey]);
                    if (latest[this.syncIdentityStateKey]?.blocked || this._syncCompatibilityError) throw this.compatibilityError(latest[this.syncIdentityStateKey]?.blocked?.reason || this._syncCompatibilityError.reason);
                    if ((latest[this.layoutGenerationKey] || null) !== ticket.generation) throw new Error('Local data was replaced before upload. Review it and retry.');
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
                    if (raw.sync?.enabled && (LayoutIdentity.active(raw.layout) || raw[this.syncIdentityStateKey]?.blocked)) {
                        const error = this.compatibilityError('The cloud copy was removed or disabled. Local data and the enabled preference are preserved. Review Sync settings before replacing either copy.');
                        const config = this.validateConfigObject(raw); delete config.sync;
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
        const meta = result[this.syncMetaKey];
        return meta && typeof meta === 'object' ? meta : null;
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
            const raw = await this._local.get([this.syncIdentityStateKey]);
            if (raw[this.syncIdentityStateKey]?.blocked && oldMeta?.enabled) {
                // The UI explicitly confirmed off/clear. Retain the divergent
                // readable cloud copy before removing its chunks.
                const cloud = await this.readSyncSnapshot();
                const payload = this.buildManualExportPayload(cloud.validated);
                await this.local.set({ [this.restoreRecoveryKey]: { reason: 'beforeCloudClear', payload, checksum: await this.fingerprint(payload) } });
            }
            const disabledMeta = { enabled: false, version: 2, configurationSchemaVersion: 0, revision: this.createLayoutGeneration(), payloadHash: await this.fingerprint({ enabled: false }), updatedAt: new Date().toISOString(), chunkCount: 0, payloadBytes: 0, omittedAssets: [] };
            await this.withLocalWriteLock(async () => {
                const raw = await this._local.get([this.syncIdentityStateKey]);
                const guard = raw[this.syncIdentityStateKey] || {};
                await this._local.set({ [this.syncIdentityStateKey]: { ...guard, ownWrites: [...(guard.ownWrites || []).slice(-7), { revision: disabledMeta.revision, fingerprint: disabledMeta.payloadHash, schema: 0 }] } });
            }, true);
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
        const source = this.validateConfigObject(config);
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
        if (!this.defaultConfig.hasOwnProperty(key)) {
            throw new Error(`Invalid storage key: ${key}`);
        }

        try {
            switch (key) {
                case 'clock':
                    return this.validateClockConfig(value);
                case 'search':
                    return this.validateSearchConfig(value);
                case 'bg':
                    return this.validateBackgroundConfig(value);
                case 'show':
                    return this.validateShowConfig(value);
                case 'privacy':
                    return this.validatePrivacyConfig(value);
                case 'themePreset':
                    return this.validateThemePreset(value);
                case 'appearance':
                    return this.validateAppearanceConfig(value);
                case 'categories':
                    return this.validateCategoriesConfig(value);
                case 'links':
                    return this.validateLinksConfig(value);
                case 'weather':
                    return this.validateWeatherConfig(value);
                case 'hot':
                    return this.validateHotConfig(value);
                case 'movie':
                    return this.validateMovieConfig(value);
                case 'quote':
                    return this.validateQuoteConfig(value);
                case 'layout':
                    return this.validateLayoutConfig(value);
                case 'ui':
                    return this.validateUiConfig(value);
                case 'sync':
                    return this.validateSyncConfig(value);
                default:
                    return value;
            }
        } catch (error) {
            if (error.code?.startsWith('WORKSPACE_')) throw error;
            if (error.code === 'LAYOUT_IDENTITY_INVALID') throw error;
            if (this.workspace) { const failure = new Error('Workspace settings are invalid.'); failure.code = 'WORKSPACE_CORRUPT'; throw failure; }
            console.warn(`Validation failed for ${key}, using default:`, error);
            return this.getDefaultValue(key);
        }
    }

    /**
     * Validate clock configuration
     */
    validateClockConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Clock config must be an object');
        }
        
        return {
            hour12: typeof value.hour12 === 'boolean' ? value.hour12 : this.defaultConfig.clock.hour12,
            showSeconds: typeof value.showSeconds === 'boolean' ? value.showSeconds : this.defaultConfig.clock.showSeconds,
            worldClocks: ClockPreferences.safe(value.worldClocks)
        };
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
     * Validate search configuration
     */
    validateSearchConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Search config must be an object');
        }
        
        const validEngines = ['google', 'bing', 'duck', 'custom'];
        const engine = validEngines.includes(value.engine) ? value.engine : this.defaultConfig.search.engine;
        let custom = typeof value.custom === 'string' ? value.custom.trim() : this.defaultConfig.search.custom;
        if (custom) {
            try {
                const parsed = new URL(custom);
                if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') custom = '';
            } catch (_) {
                custom = '';
            }
        }

        return { engine, custom };
    }

    /**
     * Validate background configuration
     */
    validateBackgroundConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Background config must be an object');
        }
        
        const validTypes = ['gradient', 'color', 'image', 'api'];
        const type = validTypes.includes(value.type) ? value.type : this.defaultConfig.bg.type;
        let bgValue = typeof value.value === 'string' ? value.value : this.defaultConfig.bg.value;
        if (type === 'image' && bgValue && !/^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(bgValue)) {
            bgValue = '';
        }

        return { type, value: bgValue };
    }

    /**
     * Validate show configuration
     */
    validateShowConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Show config must be an object');
        }
        
        return {
            clock: typeof value.clock === 'boolean' ? value.clock : this.defaultConfig.show.clock,
            search: typeof value.search === 'boolean' ? value.search : this.defaultConfig.show.search,
            shortcuts: typeof value.shortcuts === 'boolean' ? value.shortcuts : this.defaultConfig.show.shortcuts,
            weather: typeof value.weather === 'boolean' ? value.weather : this.defaultConfig.show.weather,
            hot: typeof value.hot === 'boolean' ? value.hot : this.defaultConfig.show.hot,
            movie: typeof value.movie === 'boolean' ? value.movie : this.defaultConfig.show.movie
        };
    }

    validatePrivacyConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Privacy config must be an object');
        }

        return {
            onlineFavicons: typeof value.onlineFavicons === 'boolean'
                ? value.onlineFavicons
                : this.defaultConfig.privacy.onlineFavicons
        };
    }

    /**
     * Validate theme preset
     */
    validateThemePreset(value) {
        const validThemes = ['aurora-glass', 'ink-paper', 'warm-studio', 'signal-pop'];
        if (typeof value !== 'string') {
            return this.defaultConfig.themePreset;
        }
        return validThemes.includes(value) ? value : this.defaultConfig.themePreset;
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
        if (!Array.isArray(value)) {
            throw new Error('Categories must be an array');
        }

        return value.map(cat => {
            if (typeof cat !== 'object' || cat === null) {
                throw new Error('Each category must be an object');
            }

            return {
                id: typeof cat.id === 'string' && cat.id ? cat.id : `cat_${Date.now()}`,
                name: typeof cat.name === 'string' ? cat.name.trim() : '',
                icon: typeof cat.icon === 'string' && cat.icon ? cat.icon : '\ud83d\udcc1'
            };
        }).filter(cat => cat.name);
    }

    /**
     * Validate links configuration
     */
    validateLinksConfig(value) {
        if (!Array.isArray(value)) {
            throw new Error('Links must be an array');
        }

        LayoutIdentity.validateIds(value);
        return value.map(link => {
            if (typeof link !== 'object' || link === null) {
                throw new Error('Each link must be an object');
            }
            
            const rawUrl = typeof link.url === 'string' ? link.url.trim() : '';
            let url = '';
            try {
                const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
                const parsed = new URL(withProtocol);
                if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                    url = parsed.toString();
                }
            } catch (_) {}

            return {
                ...(Object.prototype.hasOwnProperty.call(link, 'layoutId') ? { layoutId: link.layoutId } : {}),
                title: typeof link.title === 'string' ? link.title.trim() : '',
                url,
                icon: typeof link.icon === 'string' ? link.icon : '🌐',
                category: typeof link.category === 'string' && link.category
                    ? link.category
                    : 'work'
            };
        }).filter(link => link.title && link.url);
    }

    /**
     * Validate weather configuration
     */
    validateWeatherConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Weather config must be an object');
        }
        
        return {
            city: typeof value.city === 'string' ? value.city : this.defaultConfig.weather.city,
            temp: typeof value.temp === 'number' ? value.temp : this.defaultConfig.weather.temp,
            cond: typeof value.cond === 'string' ? value.cond : this.defaultConfig.weather.cond,
            aqiLabel: typeof value.aqiLabel === 'string' ? value.aqiLabel : this.defaultConfig.weather.aqiLabel,
            aqi: typeof value.aqi === 'number' ? value.aqi : this.defaultConfig.weather.aqi,
            low: typeof value.low === 'number' ? value.low : this.defaultConfig.weather.low,
            high: typeof value.high === 'number' ? value.high : this.defaultConfig.weather.high
        };
    }

    /**
     * Validate hot topics configuration
     */
    validateHotConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Hot topics config must be an object');
        }
        
        const validTabs = ['baidu', 'weibo', 'zhihu'];
        const tab = validTabs.includes(value.tab) ? value.tab : this.defaultConfig.hot.tab;
        
        const validateTopicArray = (arr) => {
            if (!Array.isArray(arr)) return [];
            return arr.map(item => ({
                t: typeof item.t === 'string' ? item.t : '',
                s: typeof item.s === 'number' ? item.s : 0
            })).filter(item => item.t);
        };
        
        return {
            tab,
            baidu: validateTopicArray(value.baidu),
            weibo: validateTopicArray(value.weibo),
            zhihu: validateTopicArray(value.zhihu)
        };
    }

    /**
     * Validate movie configuration
     */
    validateMovieConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('Movie config must be an object');
        }
        const poster = typeof value.poster === 'string' && /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(value.poster)
            ? value.poster
            : this.defaultConfig.movie.poster;

        return {
            title: typeof value.title === 'string' ? value.title : this.defaultConfig.movie.title,
            note: typeof value.note === 'string' ? value.note : this.defaultConfig.movie.note,
            poster
        };
    }

    /**
     * Validate quote configuration
     */
    validateQuoteConfig(value) {
        if (typeof value !== 'string') {
            throw new Error('Quote must be a string');
        }
        
        return value.trim() || LEGACY_WELCOME_QUOTE;
    }

    /**
     * Validate layout configuration
     */
    validateLayoutConfig(value) {
        LayoutIdentity.validateLayout(value);
        if (typeof value !== 'object' || value === null) {
            throw new Error('Layout config must be an object');
        }

        const autoArrange = typeof value.autoArrange === 'boolean' ? value.autoArrange : this.defaultConfig.layout.autoArrange;
        const alignToGrid = typeof value.alignToGrid === 'boolean' ? value.alignToGrid : this.defaultConfig.layout.alignToGrid;
        let gridSize = typeof value.gridSize === 'number' ? value.gridSize : this.defaultConfig.layout.gridSize;
        if (!Number.isFinite(gridSize) || gridSize < 48) gridSize = 48;
        if (gridSize > 240) gridSize = 240;

        let columns = typeof value.columns === 'number' ? value.columns : this.defaultConfig.layout.columns;
        if (!Number.isFinite(columns)) columns = this.defaultConfig.layout.columns;
        columns = Math.round(columns);
        if (columns < 1) columns = 1;
        if (columns > 10) columns = 10;

        const positions = (value.positions && typeof value.positions === 'object') ? value.positions : {};

        return { autoArrange, alignToGrid, gridSize, columns, positions, ...(LayoutIdentity.active(value) ? { identityVersion: 1, positionsById: LayoutIdentity.copy(value.positionsById) } : {}) };
    }

    validateUiConfig(value) {
        if (typeof value !== 'object' || value === null) {
            throw new Error('UI config must be an object');
        }

        const defaults = this.defaultConfig.ui;
        const clampPadding = (val) => {
            if (typeof val !== 'number' || !Number.isFinite(val)) return null;
            let num = Math.round(val);
            if (num < 0) num = 0;
            if (num > 160) num = 160;
            return num;
        };
        const clampStyleNumber = (val, min, max) => {
            if (typeof val !== 'number' || !Number.isFinite(val)) return null;
            let num = Math.round(val);
            if (num < min) num = min;
            if (num > max) num = max;
            return num;
        };
        const isValidHexColor = (val) => {
            return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(val);
        };

        let dashboardPadding = defaults.dashboardPadding;
        const rawPadding = value.dashboardPadding;
        if (typeof rawPadding === 'number' && Number.isFinite(rawPadding)) {
            const clamped = clampPadding(rawPadding);
            if (clamped !== null) {
                dashboardPadding = { top: clamped, right: clamped, bottom: clamped, left: clamped };
            }
        } else if (rawPadding && typeof rawPadding === 'object') {
            const top = clampPadding(rawPadding.top);
            const right = clampPadding(rawPadding.right);
            const bottom = clampPadding(rawPadding.bottom);
            const left = clampPadding(rawPadding.left);
            if ([top, right, bottom, left].some(val => val !== null)) {
                dashboardPadding = { top, right, bottom, left };
            }
        }

        const styleDefaults = defaults.shortcutsStyle || {
            gapX: null,
            gapY: null,
            iconSize: null,
            titleSize: null,
            titleColor: ''
        };
        let shortcutsStyle = { ...styleDefaults };
        const rawStyle = value.shortcutsStyle;
        if (rawStyle && typeof rawStyle === 'object') {
            shortcutsStyle = {
                gapX: clampStyleNumber(rawStyle.gapX, 0, 80),
                gapY: clampStyleNumber(rawStyle.gapY, 0, 80),
                iconSize: clampStyleNumber(rawStyle.iconSize, 24, 96),
                titleSize: clampStyleNumber(rawStyle.titleSize, 10, 24),
                titleColor: ''
            };
            const color = typeof rawStyle.titleColor === 'string' ? rawStyle.titleColor.trim() : '';
            if (color === '' || isValidHexColor(color)) {
                shortcutsStyle.titleColor = color;
            } else {
                shortcutsStyle.titleColor = styleDefaults.titleColor;
            }
        }

        return {
            dashboardHidden: typeof value.dashboardHidden === 'boolean'
                ? value.dashboardHidden
                : defaults.dashboardHidden,
            dashboardPadding,
            showShortcutTitles: typeof value.showShortcutTitles === 'boolean'
                ? value.showShortcutTitles
                : defaults.showShortcutTitles,
            finderShortcutEnabled: typeof value.finderShortcutEnabled === 'boolean'
                ? value.finderShortcutEnabled
                : defaults.finderShortcutEnabled,
            shortcutsStyle
        };
    }

    validateSyncConfig(value) {
        const defaults = this.defaultConfig.sync;
        if (typeof value !== 'object' || value === null) {
            return { ...defaults };
        }

        const lastError = typeof value.lastError === 'string'
            ? value.lastError.slice(0, 240)
            : defaults.lastError;

        return {
            enabled: typeof value.enabled === 'boolean' ? value.enabled : defaults.enabled,
            lastSync: typeof value.lastSync === 'string' ? value.lastSync : defaults.lastSync,
            lastError,
            includeLargeAssets: false
        };
    }
}

// Create singleton instance
const storageManager = new StorageManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageManager;
} else {
    window.StorageManager = StorageManager;
    window.storageManager = storageManager;
}
