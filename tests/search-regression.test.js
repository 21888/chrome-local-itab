const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function loadSearchHelper() {
    const context = { window: {}, URL, encodeURIComponent, console };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('shared/search-template.js', 'utf8'), context);
    return context.window.LocalItabSearch;
}

function createDefaultConfig() {
    return {
        themePreset: 'aurora-glass',
        clock: { hour12: false, showSeconds: true },
        bg: { type: 'gradient', value: '' },
        show: { clock: true, search: true, shortcuts: true, weather: false, hot: false, movie: false },
        categories: [],
        search: { engine: 'google', custom: '' },
        weather: {
            city: 'Local',
            temp: 22,
            cond: 'Sunny',
            aqiLabel: 'Good',
            aqi: 50,
            low: 18,
            high: 26
        },
        hot: { tab: 'baidu', baidu: [], weibo: [], zhihu: [] },
        movie: { title: 'Sample Movie', note: 'A great movie to watch', poster: '' },
        quote: 'Welcome to your personalized new tab page!',
        links: [],
        layout: { autoArrange: true, alignToGrid: true, gridSize: 96, columns: 6, positions: {} },
        ui: {},
        sync: { enabled: false }
    };
}

function createOptionsContext(permissionGrants = {}, storedConfig = createDefaultConfig(), requestGrants = permissionGrants) {
    const fields = new Map();
    const defaultConfig = createDefaultConfig();
    let savedPrivacy = null;
    let savedBackground = null;
    const document = {
        addEventListener() {},
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
        getElementById(id) {
            return fields.get(id) || null;
        },
        createElement() {
            return {
                className: '',
                textContent: '',
                style: {},
                classList: { add() {}, remove() {}, toggle() {} },
                setAttribute() {},
                appendChild() {},
                remove() {},
                addEventListener() {}
            };
        },
        body: { appendChild() {}, removeChild() {} }
    };
    const context = {
        window: { LocalItabSearch: loadSearchHelper() },
        document,
        storageManager: {
            defaultConfig,
            async getAll() {
                return { ...storedConfig };
            },
            async set(key, value) {
                if (key === 'privacy') savedPrivacy = value;
                if (key === 'bg') savedBackground = value;
                return true;
            }
        },
        chrome: {
            runtime: { openOptionsPage() {} },
            tabs: null,
            permissions: {
                contains(permission, callback) {
                    callback(permissionGrants[permission.origins[0]] === true);
                },
                request(permission, callback) {
                    const granted = requestGrants[permission.origins[0]] === true;
                    if (typeof callback === 'function') callback(granted);
                    return Promise.resolve(granted);
                }
            }
        },
        localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        setTimeout() {},
        clearTimeout() {},
        confirm() {
            return true;
        },
        Blob,
        URL,
        FileReader: function FileReader() {},
        console
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('shared/search-template.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('options.js', 'utf8'), context);
    return {
        context,
        fields,
        getSavedPrivacy: () => savedPrivacy,
        getSavedBackground: () => savedBackground
    };
}

function createNewtabPrivacyContext(permissionGrants = {}) {
    const context = {
        window: { localItabPrivacy: {}, addEventListener() {} },
        document: {
            addEventListener() {},
            documentElement: { dataset: {}, style: { setProperty() {}, removeProperty() {} } },
            body: { dataset: {}, style: {}, classList: { add() {}, remove() {}, toggle() {} } },
            getElementById() { return null; },
            querySelectorAll() { return []; },
            querySelector() { return null; },
            createElement() { return { style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, setAttribute() {} }; },
            head: { appendChild() {} }
        },
        chrome: {
            permissions: {
                contains(permission, callback) {
                    callback(permissionGrants[permission.origins[0]] === true);
                }
            },
            runtime: { openOptionsPage() {}, getURL(path) { return path; } },
            storage: { onChanged: { addListener() {} } },
            i18n: { getMessage(key) { return key; } }
        },
        localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
        setTimeout() {},
        setInterval() {},
        clearTimeout() {},
        fetch() { return Promise.resolve({ ok: false }); },
        URL,
        encodeURIComponent,
        console
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('shared/search-template.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8'), context);
    return context;
}

async function collectSearchSettings(engine, custom) {
    const { context, fields } = createOptionsContext();
    fields.set('search-engine', { value: engine });
    fields.set('search-custom', { value: custom });
    return context.collectFormData();
}

(async function run() {
    const helper = loadSearchHelper();
    assert.strictEqual(
        helper.buildSearchUrl('example.com/search?q=%s&mirror=%s', 'hello world'),
        'https://example.com/search?q=hello%20world&mirror=hello%20world'
    );

    const builtInWithStaleInvalidCustom = await collectSearchSettings('google', 'javascript:alert(1)');
    assert.strictEqual(builtInWithStaleInvalidCustom.search.engine, 'google');
    assert.strictEqual(builtInWithStaleInvalidCustom.search.custom, '');

    await assert.rejects(
        () => collectSearchSettings('custom', 'javascript:alert(1)'),
        /Enter a valid HTTP or HTTPS search URL/
    );

    const customSearch = await collectSearchSettings('custom', 'example.com/search?q=%s');
    assert.strictEqual(customSearch.search.engine, 'custom');
    assert.strictEqual(customSearch.search.custom, 'https://example.com/search?q=%s');

    const deniedNewtab = createNewtabPrivacyContext();
    const deniedPrivacy = await deniedNewtab.getEffectivePrivacyConfig({
        onlineFavicons: true
    });
    assert.strictEqual(deniedPrivacy.onlineFavicons, false);

    const faviconAllowedNewtab = createNewtabPrivacyContext({ 'https://www.google.com/*': true });
    const faviconAllowedPrivacy = await faviconAllowedNewtab.getEffectivePrivacyConfig({
        onlineFavicons: true
    });
    assert.strictEqual(faviconAllowedPrivacy.onlineFavicons, true);

    const importedOnlineConfig = {
        ...createDefaultConfig(),
        privacy: { onlineFavicons: true }
    };
    const optionsPrivacy = createOptionsContext({}, importedOnlineConfig);
    const reconciled = await optionsPrivacy.context.reconcilePrivacyPermissions(importedOnlineConfig);
    assert.strictEqual(reconciled.privacy.onlineFavicons, true);
    assert.strictEqual(reconciled.effectivePrivacy.onlineFavicons, false);
    assert.strictEqual(optionsPrivacy.getSavedPrivacy(), null);

    const noPermissionApi = createOptionsContext();
    noPermissionApi.context.chrome.permissions = null;
    assert.strictEqual(await noPermissionApi.context.requestOptionalOrigin('https://www.google.com/*'), false);


    console.log('search regression tests ok');
})();
