/* Shared configuration validation. No storage, workspace bootstrap or provider APIs. */
(function (root, factory) {
    const commonJS = typeof module === 'object' && module.exports;
    const api = factory(
        commonJS ? require('./layout-identity.js') : root.LocalItabIdentity,
        commonJS ? require('./dashboard-template-registry.js') : root.LocalItabTemplates,
        commonJS ? require('./world-clocks.js') : root.WorldClocks,
        () => commonJS ? require('./stored-shortcut-url.js') : root.LocalItabStoredURL
    );
    if (commonJS) module.exports = api;
    else root.LocalItabConfigurationCodec = api;
})(typeof window === 'undefined' ? globalThis : window, function (LayoutIdentity, DashboardTemplates, ClockPreferences, getStoredURL) {
    'use strict';

// Keep legacy empty-quote validation stable; only newly generated defaults localize.
const LEGACY_WELCOME_QUOTE = 'Welcome to your personalized new tab page!';

// Optional workspace appearance overrides. Absent fields keep template defaults.
const DASHBOARD_CARD_IDS = Object.freeze(['local-tasks-card', 'local-focus-card', 'local-scratchpad-card', 'local-countdown-card', 'world-clocks-card', 'weather-container', 'hot-container', 'movie-container']);
const DASHBOARD_CUSTOMIZATION_DEFAULTS = Object.freeze({
    backgroundMode: 'template', backgroundStart: '#edf2ef', backgroundEnd: '#d5e4dc', backgroundAngle: 135,
    cardPadding: null, cardGap: null, cardRadius: null, cardOpacity: null, cardColumns: null, cardOrder: null, cardSpans: null, cardLayoutMode: null
});

// Localization belongs to the caller. Generating defaults never reads browser APIs.
function createDefaultConfig({ getMessage } = {}) {
    function getDefaultWelcomeQuote() {
        try {
            const message = getMessage?.('defaultWelcomeQuote');
            if (typeof message === 'string' && message.trim()) return message;
        } catch (_) {}
        return LEGACY_WELCOME_QUOTE;
    }

    // Only generated defaults are localized; saved category names are user content.
    function getDefaultCategoryName(key, fallback) {
        try {
            const message = getMessage?.(key);
            if (typeof message === 'string' && message.trim() && message !== key) return message;
        } catch (_) {}
        return fallback;
    }

    return {
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
}

// Keep context separate from configuration and from the StorageManager instance.
// Pure consumers can freeze time and choose the existing workspace fail-closed mode.
const validationContexts = new WeakMap();
class ConfigurationValidator {
    constructor({ getMessage, now = () => Date.now(), workspace = false, warn = () => {} } = {}) {
        this.layoutGenerationKey = '__localItabLayoutGeneration';
        this.settingsGenerationKey = '__localItabSettingsGeneration';
        this.defaultConfig = createDefaultConfig({ getMessage });
        validationContexts.set(this, { now, workspace, warn });
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

    validateImportPayload(importData) {
        const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
        const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
        const invalid = detail => { throw new Error(`Invalid backup: ${detail}. No settings have been changed.`); };
        if (!isObject(importData)) invalid('settings data must be an object');
        try { importData = this.copyStoredValue(importData); } catch (_) { invalid('backup must be bounded plain JSON'); }
        const storedURLFormat = importData.version === '2.0';
        if (has(importData, 'version') && !['1.0', '2.0'].includes(importData.version)) invalid('unsupported backup version');
        if (storedURLFormat !== has(importData, 'urlIdentityVersion') || (storedURLFormat && importData.urlIdentityVersion !== 1)) invalid('unsupported stored URL identity format');
        if (storedURLFormat) {
            const allowed = ['version', 'urlIdentityVersion', 'schemaVersion', 'type', 'app', 'exportDate', 'createdAt', 'exportedBy', 'extensionVersion', 'itemCounts', 'data', 'snapshotId', 'device', 'metadata'];
            if (Object.keys(importData).some(key => !allowed.includes(key)) || !has(importData, 'data') || ![1, 2].includes(importData.schemaVersion) || importData.type !== 'backupSnapshot' || importData.app !== 'local-itab') invalid('incomplete stored URL identity envelope');
            if (has(importData, 'metadata')) {
                const meta = importData.metadata, allowedMeta = ['urlIdentityVersion', 'app', 'type', 'schemaVersion', 'deviceId', 'snapshotId', 'reason'];
                if (!isObject(meta) || Object.keys(meta).some(key => !allowedMeta.includes(key)) || meta.urlIdentityVersion !== 1 || meta.app !== importData.app || meta.type !== importData.type || meta.schemaVersion !== importData.schemaVersion || ['deviceId', 'snapshotId', 'reason'].some(key => has(meta, key) && typeof meta[key] !== 'string')) invalid('stored URL metadata does not match the envelope');
            }
        } else if (isObject(importData.metadata) && has(importData.metadata, 'urlIdentityVersion')) invalid('stored URL metadata needs its intact envelope');
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
        if (settings.appearance && has(settings.appearance, 'customization')) {
            try { this.validateDashboardCustomization(settings.appearance.customization); }
            catch (_) { invalid('invalid dashboard customization'); }
        }
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
            links = this.validateStoredLinksConfig(settings.links);
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

        const validated = this.validateStoredConfigObject(categories ? { ...settings, categories } : settings);
        if (worldClocks !== undefined) validated.clock.worldClocks = worldClocks;
        if (settings.bg?.type === 'image' && settings.bg.value && !validated.bg.value) invalid('background image data is corrupt or unsupported');
        if (settings.movie?.poster && !validated.movie.poster) invalid('movie poster data is corrupt or unsupported');
        if (settings.search?.custom?.trim() && !validated.search.custom) invalid('custom search URL is invalid');
        validated.sync = this.getDisabledSyncConfig();
        if (storedURLFormat && !this.sameShortcutUndoValue(validated, settings)) invalid('stored URL configuration is malformed or would require rewriting');
        return validated;
    }

    storedConfigurationError(message) {
        const error = new Error(message); error.code = 'STORED_CONFIG_INVALID'; return error;
    }

    validateStoredData(key, value) {
        return key === 'links' ? this.validateStoredLinksConfig(value) : this.validateData(key, value);
    }

    copyStoredValue(value, depth = 0, ancestors = new Set(), budget = { nodes: 0, chars: 0 }) {
        // Match the existing workspace JSON-copy capacity contract. The stricter
        // bookmark and complete-file budgets belong only to those boundaries;
        // they must not make an already supported large configuration unopenable.
        const check = ok => { if (!ok) throw this.storedConfigurationError('Stored configuration is not supported plain JSON or exceeds its existing safety limits.'); };
        check(++budget.nodes <= 500000 && depth <= 40);
        if (typeof value === 'string') { budget.chars += value.length; check(budget.chars <= 128 * 1024 * 1024); return value; }
        if (value === null || typeof value === 'boolean') return value;
        if (typeof value === 'number') { check(Number.isFinite(value)); return value; }
        check(value && typeof value === 'object' && !ancestors.has(value));
        const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
        check(array || prototype === null || Object.getPrototypeOf(prototype) === null);
        const keys = Object.keys(value); check(keys.length <= 250000);
        ancestors.add(value); const result = array ? [] : {};
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(value, key); check(descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value'));
            Object.defineProperty(result, key, { value: this.copyStoredValue(descriptor.value, depth + 1, ancestors, budget), enumerable: true, writable: true, configurable: true });
        }
        if (array) check(result.length === value.length && Object.keys(result).length === value.length);
        ancestors.delete(value); return result;
    }

    copyStoredConfiguration(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw this.storedConfigurationError('Stored configuration must be an object.');
        const prototype = Object.getPrototypeOf(data);
        if (prototype !== null && Object.getPrototypeOf(prototype) !== null) throw this.storedConfigurationError('Stored configuration must be plain JSON.');
        // Select configuration only before copying: unrelated personal/provider
        // records are neither exported nor allowed to consume this copy budget.
        const selected = {}, keys = [...Object.keys(this.defaultConfig), 'schemaVersion', this.layoutGenerationKey, this.settingsGenerationKey];
        for (const key of keys) {
            const descriptor = Object.getOwnPropertyDescriptor(data, key);
            if (!descriptor) continue;
            if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) throw this.storedConfigurationError('Stored configuration accessors are unsupported.');
            Object.defineProperty(selected, key, { value: descriptor.value, enumerable: true, configurable: true });
        }
        return this.copyStoredValue(selected);
    }

    validateStoredConfigObject(data) {
        return this.validateConfigObject(this.copyStoredConfiguration(data), { storedURLs: true });
    }

    validateConfigObject(data, { storedURLs = false } = {}) {
        const validated = this.cloneDefaultConfig();
        if (!data || typeof data !== 'object') {
            return validated;
        }

        if (LayoutIdentity.active(data.layout) || (Array.isArray(data.links) && data.links.some(link => LayoutIdentity.has(link, 'layoutId')))) LayoutIdentity.validateBundle(data);
        for (const key of Object.keys(this.defaultConfig)) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                validated[key] = storedURLs ? this.validateStoredData(key, data[key]) : this.validateData(key, data[key]);
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
            colorMode: ['light', 'dark'].includes(source.colorMode) ? source.colorMode : 'light',
            ...(source.customization !== undefined ? { customization: this.validateDashboardCustomization(source.customization) } : {})
        };
    }

    validateDashboardCustomization(value = {}) {
        if (!value || typeof value !== 'object' || Array.isArray(value) ||
            Object.keys(value).some(key => !Object.hasOwn(DASHBOARD_CUSTOMIZATION_DEFAULTS, key))) throw this.appearanceError();
        const result = { ...DASHBOARD_CUSTOMIZATION_DEFAULTS, ...value };
        if (!['template', 'solid', 'gradient'].includes(result.backgroundMode) ||
            ![result.backgroundStart, result.backgroundEnd].every(color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) throw this.appearanceError();
        for (const [key, min, max, nullable] of [
            ['backgroundAngle', 0, 360, false], ['cardPadding', 8, 32, true], ['cardGap', 0, 40, true],
            ['cardRadius', 0, 32, true], ['cardOpacity', 40, 100, true], ['cardColumns', 1, 4, true]
        ]) {
            if (nullable && result[key] === null) continue;
            if (!Number.isInteger(result[key]) || result[key] < min || result[key] > max) throw this.appearanceError();
        }
        if (![null, 'template', 'grid'].includes(result.cardLayoutMode)) throw this.appearanceError();
        if (result.cardOrder !== null && (!Array.isArray(result.cardOrder) || result.cardOrder.length !== DASHBOARD_CARD_IDS.length ||
            new Set(result.cardOrder).size !== DASHBOARD_CARD_IDS.length || [...result.cardOrder].some(id => !DASHBOARD_CARD_IDS.includes(id)))) throw this.appearanceError();
        if (result.cardSpans !== null && (typeof result.cardSpans !== 'object' || Array.isArray(result.cardSpans) ||
            Object.keys(result.cardSpans).some(id => !DASHBOARD_CARD_IDS.includes(id) || !Number.isInteger(result.cardSpans[id]) || result.cardSpans[id] < 1 || result.cardSpans[id] > 4))) throw this.appearanceError();
        // Fresh canonical structures prevent caller mutation and make field-level CAS deterministic.
        result.cardOrder = result.cardOrder === null ? null : [...result.cardOrder];
        result.cardSpans = result.cardSpans === null ? null : Object.fromEntries(DASHBOARD_CARD_IDS.filter(id => Object.hasOwn(result.cardSpans, id)).map(id => [id, result.cardSpans[id]]));
        result.backgroundStart = result.backgroundStart.toLowerCase();
        result.backgroundEnd = result.backgroundEnd.toLowerCase();
        return result;
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

    appearanceError(code = 'APPEARANCE_CONFLICT') {
        const error = new Error('Saved preferences changed or could not be safely compared. Keep any draft and open a new tab before retrying.');
        error.code = code; return error;
    }

    /**
     * Validate data according to schema
     * @param {string} key - Storage key
     * @param {*} value - Value to validate
     * @returns {*} - Validated value
     */
    validateData(key, value, context = validationContexts.get(this)) {
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
            if (context.workspace) { const failure = new Error('Workspace settings are invalid.'); failure.code = 'WORKSPACE_CORRUPT'; throw failure; }
            context.warn(`Validation failed for ${key}, using default:`, error);
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

    validateCategoriesConfig(value, now = validationContexts.get(this).now) {
        if (!Array.isArray(value)) {
            throw new Error('Categories must be an array');
        }

        return value.map(cat => {
            if (typeof cat !== 'object' || cat === null) {
                throw new Error('Each category must be an object');
            }

            return {
                id: typeof cat.id === 'string' && cat.id ? cat.id : `cat_${now()}`,
                name: typeof cat.name === 'string' ? cat.name.trim() : '',
                icon: typeof cat.icon === 'string' && cat.icon ? cat.icon : '\ud83d\udcc1'
            };
        }).filter(cat => cat.name);
    }

    /**
     * Validate links configuration
     */
    validateStoredLinksConfig(value) {
        // Bound and detach JSON records before examining their URLs. In
        // particular, accessors/toJSON cannot participate in legacy admission.
        return this.validateLinksConfig(this.copyStoredValue(value), { storedURLs: true });
    }

    validateLinksConfig(value, { storedURLs = false } = {}) {
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
            if (storedURLs) {
                const original = link.url;
                if (typeof original !== 'string' || original !== rawUrl || !url) throw this.storedConfigurationError('Stored shortcut URL is invalid.');
                if (original !== url) {
                    const destination = getStoredURL()?.destinationForSavedURL(original);
                    if (!destination || destination !== url || Object.keys(link).some(key => !['layoutId', 'title', 'url', 'icon', 'category'].includes(key))) {
                        throw this.storedConfigurationError('Unsupported legacy shortcut URL record.');
                    }
                }
                // Identity is the original string; destination normalization is
                // for navigation/matching only, never a saved-state projection.
                url = original;
            }

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

// Preserve class-method property descriptors. Storage owns only the two adapters
// that provide its live workspace mode, warning sink and clock on every call.
function install(targetPrototype) {
    const descriptors = Object.getOwnPropertyDescriptors(ConfigurationValidator.prototype);
    for (const key of ['constructor', 'validateData', 'validateCategoriesConfig']) delete descriptors[key];
    Object.defineProperties(targetPrototype, descriptors);
}

return Object.freeze({ ConfigurationValidator, create: options => new ConfigurationValidator(options),
    createDefaultConfig, install, DASHBOARD_CUSTOMIZATION_DEFAULTS });
});
