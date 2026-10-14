'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { ROOT, BASELINE_COMMIT, BASELINE_SHA256, BASELINE_DEPENDENCIES, baselineBytes, baselineDependency, EPOCH, inspect, failure, createRealm } = require('./helpers/configuration-codec-oracle');

const clone = value => structuredClone(value);
const id1 = `l_${'1'.repeat(32)}`, id2 = `l_${'2'.repeat(32)}`;
const site = (url = 'https://example.com/', extra = {}) => ({ title: 'Synthetic saved site', url, icon: 'S', category: 'work', ...extra });
const ordinary = createRealm('oracle');
const defaults = () => clone(ordinary.instance.defaultConfig);
// CAS baselines remain Storage responsibilities; the extracted pure closure
// contains display/import validators, not mutation authorization helpers.
const storageBaselineMethods = new Set(['validateClockBaseline', 'validateCategoryBaseline']);

function identity(raw = false) {
    const config = defaults(), url = raw ? 'example.com' : 'https://example.com/';
    config.links = [site(url, { layoutId: id1 }), site(url, { layoutId: id2 })];
    config.layout = { ...config.layout, identityVersion: 1,
        positions: { [`all|${url}`]: { x: 11.25, y: -7.5 }, [`hidden|${url}`]: { x: 300, y: 96 } },
        positionsById: { [id1]: { all: { x: 11.25, y: -7.5 } }, [id2]: { work: { x: 300, y: 96 } } } };
    return config;
}

function rich() {
    const config = defaults();
    config.links = [site('https://example.com/', { icon: 'data:image/png;base64,QUJD' })];
    config.clock.worldClocks = [{ timeZone: 'Asia/Shanghai', label: ' Shanghai ' }, { timeZone: 'US/Eastern', label: 'East' }];
    config.bg = { type: 'image', value: 'data:image/png;base64,QUJD' };
    config.movie = { title: 'Synthetic film', note: 'Saved note', poster: 'data:image/jpeg;base64,QUJD' };
    config.hot = { tab: 'zhihu', baidu: [{ t: 'One', s: 1 }], weibo: [], zhihu: [{ t: 'Two', s: 2 }] };
    config.ui.dashboardPadding = { top: 10, right: null, bottom: 12, left: 16 };
    config.ui.shortcutsStyle = { gapX: 0, gapY: 80, iconSize: 96, titleSize: 24, titleColor: '#ABC' };
    config.sync = { enabled: true, lastSync: 'synthetic-local', lastError: 'e'.repeat(260), includeLargeAssets: true, future: 'local-only' };
    config.quote = '  Synthetic saved quote  ';
    return config;
}

function rawURLs() {
    const config = defaults();
    config.links = ['https://example.com', 'https://example.com/', 'example.com', 'https://EXAMPLE.com/path', 'http://example.com:80/'].map(url => site(url));
    config.layout.positions = Object.fromEntries(config.links.map((link, index) => [`hidden|${link.url}`, { x: index * 97 + 0.25, y: -index * 9.5 }]));
    return config;
}

function pair(options) {
    return { oracle: createRealm('oracle', options), storage: createRealm('candidate', options), pure: createRealm('pure', options) };
}

function invoke(realm, method, args) {
    const before = inspect(args, new Map(), true), beforeDefaults = inspect(realm.instance.defaultConfig, new Map(), true);
    realm.warnings.length = 0;
    let outcome;
    try { outcome = { value: inspect(realm.instance[method](...args)) }; }
    catch (error) { outcome = { error: failure(error) }; }
    assert.deepEqual(inspect(args, new Map(), true), before, `${method} must not mutate its input`);
    assert.deepEqual(inspect(realm.instance.defaultConfig, new Map(), true), beforeDefaults, `${method} must not mutate defaults`);
    return { ...outcome, warnings: inspect(realm.warnings) };
}

function parity(realms, method, makeArgs, label = method, { pure = true } = {}) {
    const expected = invoke(realms.oracle, method, makeArgs());
    assert.deepEqual(invoke(realms.storage, method, makeArgs()), expected, `Storage parity: ${label}`);
    if (pure) {
        assert.equal(typeof realms.pure.instance[method], 'function', `Missing pure method: ${method}`);
        assert.deepEqual(invoke(realms.pure, method, makeArgs()), expected, `Pure parity: ${label}`);
    }
    return expected;
}

test('cold oracle is pinned exact formal139 source and cannot import the candidate codec', () => {
    assert.equal(BASELINE_COMMIT, '008b97ab064d323baa4b26d8e6f72f57da2feca3');
    assert.equal(BASELINE_SHA256, 'bc51d96953fa58ea790cc1e77cfc910d779017198039f5f73968cc2475c31060');
    assert.equal(baselineBytes().length, 196909);
    assert(!baselineBytes().includes(Buffer.from('configuration-codec')));
    assert(!ordinary.modules.includes('shared/configuration-codec.js'));
    assert(ordinary.modules.includes('storage.js'));
});

test('all four cold-oracle pure dependencies have independently pinned exact formal139 bytes', () => {
    assert.deepEqual(Object.keys(BASELINE_DEPENDENCIES), [
        'shared/layout-identity.js', 'shared/dashboard-template-registry.js',
        'shared/world-clocks.js', 'shared/stored-shortcut-url.js'
    ]);
    for (const [filename, bytes] of [
        ['shared/layout-identity.js', 7282], ['shared/dashboard-template-registry.js', 13284],
        ['shared/world-clocks.js', 5464], ['shared/stored-shortcut-url.js', 2131]
    ]) {
        // baselineDependency verifies its own SHA256 before returning source;
        // candidate loading never goes through this historical fixture reader.
        assert.equal(Buffer.byteLength(baselineDependency(filename)), bytes, filename);
    }
});

test('pure CommonJS load/create/validation has zero browser/bootstrap/API effects; Storage retains existing listeners', () => {
    const realms = pair();
    for (const realm of [realms.oracle, realms.storage]) {
        assert.equal(realm.events.filter(event => event === 'listener.add').length, 2,
            'Original Storage module singleton and explicit instance each retain their listener');
        assert.equal(realm.events.filter(event => event.startsWith('locale:')).length, 12);
    }
    assert.deepEqual(realms.pure.events, []);
    assert(!realms.pure.modules.includes('storage.js'));
    for (const realm of Object.values(realms)) realm.events.length = 0;
    parity(realms, 'validateImportPayload', () => [{ links: [site('example.com')] }]);
    for (const realm of Object.values(realms)) assert.deepEqual(realm.events, []);
});

test('pure browser UMD runs with only pure dependencies, no Storage bootstrap or browser APIs', () => {
    const context = vm.createContext({ URL });
    vm.runInContext('window = globalThis;', context);
    for (const filename of ['layout-identity', 'dashboard-template-registry', 'world-clocks', 'stored-shortcut-url', 'configuration-codec']) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, `shared/${filename}.js`), 'utf8'), context, { filename });
    }
    const outcome = vm.runInContext(`(() => {
        const checked = LocalItabConfigurationCodec.create().validateImportPayload({ links: [] });
        return { links: checked.links.length, quote: checked.quote, storage: typeof StorageManager, singleton: typeof storageManager };
    })()`, context);
    assert.deepEqual(clone(outcome), { links: 0, quote: 'Welcome to your personalized new tab page!', storage: 'undefined', singleton: 'undefined' });
});

test('localized defaults, legacy empty quote, saved category content and detached copies remain exact', () => {
    const locales = [
        () => '', key => key,
        key => ({ defaultWelcomeQuote: '欢迎来到测试新标签页', defaultCategoryWork: '工作', defaultCategorySocial: '社交', defaultCategoryEntertainment: '娱乐', defaultCategoryTools: '工具', defaultCategoryLearning: '学习' })[key] || '',
        key => key === 'defaultWelcomeQuote' ? '  Synthetic localized quote  ' : ' ',
        () => { throw new Error('Synthetic locale unavailable'); }, () => 42
    ];
    for (const [index, getMessage] of locales.entries()) {
        const realms = pair({ getMessage });
        assert.deepEqual(inspect(realms.storage.instance.defaultConfig), inspect(realms.oracle.instance.defaultConfig));
        assert.deepEqual(inspect(realms.pure.api.createDefaultConfig({ getMessage })), inspect(realms.oracle.instance.defaultConfig));
        parity(realms, 'cloneDefaultConfig', () => [], `clone locale ${index}`);
        for (const key of [...Object.keys(defaults()), 'unknown']) parity(realms, 'getDefaultValue', () => [key], `${key} locale ${index}`);
        parity(realms, 'validateQuoteConfig', () => ['  '], `legacy blank quote locale ${index}`);
        parity(realms, 'validateImportPayload', () => [{ links: [], categories: [{ id: 'work', name: 'Saved user category', icon: 'S' }] }]);
        for (const realm of Object.values(realms)) {
            const first = realm.instance.cloneDefaultConfig(); first.categories[0].name = 'Changed returned copy';
            assert.notEqual(realm.instance.cloneDefaultConfig().categories[0].name, first.categories[0].name);
        }
    }
});

test('every field validator preserves formal139 ordinary fallback and workspace refusal behavior', () => {
    const values = [undefined, null, false, 0, NaN, Infinity, '', 'saved', [], {}, { unknown: true }];
    for (const workspace of [false, true]) {
        const realms = pair({ workspace });
        for (const key of [...Object.keys(defaults()), 'unknown']) {
            for (const [index, value] of values.entries()) {
                parity(realms, 'validateData', () => [key, clone(value)], `${key}/${index}/workspace=${workspace}`);
                parity(realms, 'validateStoredData', () => [key, clone(value)], `stored ${key}/${index}/workspace=${workspace}`);
            }
        }
        for (const method of ['validateClockConfig', 'validateClockBaseline', 'validateSearchConfig', 'validateBackgroundConfig',
            'validateShowConfig', 'validatePrivacyConfig', 'validateThemePreset', 'validateCategoryBaseline',
            'validateCategoriesConfig', 'validateLinksConfig', 'validateStoredLinksConfig', 'validateWeatherConfig',
            'validateHotConfig', 'validateMovieConfig', 'validateQuoteConfig', 'validateLayoutConfig', 'validateUiConfig',
            'validateSyncConfig', 'validateAppearanceConfig', 'validateDashboardCustomization']) {
            for (const [index, value] of values.entries()) parity(realms, method, () => [clone(value)], `${method}/${index}/workspace=${workspace}`, { pure: !storageBaselineMethods.has(method) });
        }
    }
});

test('legacy canonicalization, nullable/clamped UI, appearances, clocks and generated category IDs stay unchanged', () => {
    const realms = pair();
    const cases = [
        ['validateCategoriesConfig', [{ name: ' One ' }, { id: '', name: 'Two' }, { id: 'saved', name: 'Saved', icon: '' }]],
        ['validateCategoryBaseline', [{ id: 'same', name: 'One', icon: '1' }, { id: 'same', name: 'Two', icon: '2' }]],
        ['validateLinksConfig', [site(' example.com '), site('https://example.com', { title: '  Trim me  ' })]],
        ['validateClockBaseline', { worldClocks: [{ timeZone: 'US/Eastern', label: ' East ' }] }],
        ['validateClockBaseline', { worldClocks: [{ timeZone: 'America/New_York' }, { timeZone: 'US/Eastern' }] }],
        ['validateClockConfig', { worldClocks: [{ timeZone: 'Invalid/Synthetic' }] }],
        ['validateUiConfig', { dashboardPadding: 161, shortcutsStyle: { gapX: -1, gapY: 81, iconSize: 23, titleSize: 25, titleColor: '#ABC' } }],
        ['validateUiConfig', { dashboardPadding: { top: 10.5, right: -1, bottom: Infinity, left: '5' }, shortcutsStyle: [] }],
        ['validateLayoutConfig', { gridSize: 1, columns: 100.4, positions: { 'all|example.com': { x: 1.25, y: -7 } } }],
        ['validateSyncConfig', { enabled: true, lastSync: 'local', lastError: 'e'.repeat(250), includeLargeAssets: true, unknown: 1 }],
        ['validateDashboardCustomization', { backgroundMode: 'gradient', backgroundStart: '#ABCDEF', backgroundEnd: '#012345', cardSpans: { 'weather-container': 2 } }],
        ['validateDashboardCustomization', { cardOrder: ['local-tasks-card', 'local-focus-card', 'local-scratchpad-card', 'local-countdown-card', 'world-clocks-card', 'weather-container', 'hot-container', 'movie-container'], cardLayoutMode: 'grid' }],
        ['validateDashboardCustomization', { cardSpans: { unknown: 1 } }],
        ['validateDashboardCustomization', { cardColumns: 1.5 }],
        ['resolveAppearance', {}], ['resolveAppearance', { themePreset: 'warm-studio' }],
        ['resolveAppearance', { themePreset: 'ink-paper' }], ['resolveAppearance', { appearance: null, themePreset: 'signal-pop' }]
    ];
    for (const [method, value] of cases) parity(realms, method, () => [clone(value)], `${method}: ${JSON.stringify(value)}`, { pure: !storageBaselineMethods.has(method) });
    assert.equal(realms.pure.instance.validateCategoriesConfig([{ name: 'Generated' }])[0].id, `cat_${EPOCH}`);
});

function configurationVectors() {
    return [null, [], 'settings', {}, { links: [] }, defaults(), rich(), rawURLs(), identity(), identity(true),
        { links: [site()], themePreset: 'warm-studio' },
        { links: [{ title: 'Old cosmetic omissions', url: 'example.com' }], categories: [{ id: 'work', name: 'Work' }] },
        { links: [site('example.com')], ui: { dashboardPadding: 8 }, privacy: { onlineWallpapers: true } },
        { links: [], unknown: { shouldNotEnterConfig: true }, __syntheticAuth: { ignored: true } },
        { links: [], quote: false }, { links: [], categories: null }, { links: [], clock: { worldClocks: 'bad' } },
        { links: [], ui: { shortcutsStyle: { gapX: 'wide' } } },
        { links: [site('example.com', { unknown: true })] },
        { links: [site()], schemaVersion: 99 }, { links: [], __localItabLayoutGeneration: 1 },
        { links: [], __localItabSettingsGeneration: '' },
        { links: [], appearance: { customization: { unknown: true } } }];
}

test('whole configuration normalization and stored-copy boundaries preserve defaults, raw URLs and malformed refusals', () => {
    for (const workspace of [false, true]) {
        const realms = pair({ workspace });
        for (const [index, value] of configurationVectors().entries()) {
            for (const method of ['validateConfigObject', 'validateStoredConfigObject', 'copyStoredConfiguration']) {
                parity(realms, method, () => [clone(value)], `${method}/${index}/workspace=${workspace}`);
            }
        }
    }
});

test('legacy, v1/v2 and schema1/schema2 imports preserve all accepted envelopes and exact malformed errors', () => {
    const realms = pair();
    const configs = [defaults(), rich(), rawURLs(), identity(), identity(true)];
    const vectors = [null, [], 'settings', {}, { unrelated: true }, { links: [] }, { settings: { links: [] } },
        { version: '1.0', data: { links: [] } }, { data: { links: [] } },
        { links: [], categories: [{ name: ' Legacy ' }, { id: '', name: 'Empty ID' }, { id: 'cat_import_1', name: 'Reserved' }] },
        { links: [site('example.com', { category: 'cat_import_2' })], categories: [{ name: 'Must avoid orphan' }] },
        { links: [], categories: [{ id: 'same', name: 'One' }, { id: 'same', name: 'Two' }] },
        { links: [], categories: [{ id: '__proto__', name: '<synthetic>', icon: '<svg>' }] },
        { links: [], bg: { type: 'image', value: 'corrupt' } }, { links: [], movie: { poster: 'corrupt' } },
        { links: [], search: { custom: 'javascript:alert(1)' } },
        { links: [], hot: { baidu: [null] } }, { links: [], hot: { zhihu: [{ t: 'Topic', s: 'many' }] } },
        { links: [], layout: { positions: { bad: { x: '0', y: 0 } } } },
        { links: [], clock: { worldClocks: [{ timeZone: 'Invalid/Zone' }] } },
        { links: [], appearance: { template: 'future', colorMode: 'light' } },
        { links: [], themePreset: 'unknown' }, { links: [], show: { clock: 'false' } },
        { version: '99.0', data: { links: [] } }, { version: '1.0', data: null },
        { data: { links: [] }, settings: { links: [] } }, { app: 'foreign', links: [] },
        { type: 'foreign', links: [] }, { schemaVersion: '1', data: { links: [] } },
        { schemaVersion: 999, data: { links: [] } }, { metadata: { urlIdentityVersion: 1 }, data: { links: [] } }];
    for (const config of configs) {
        vectors.push(config, { settings: config }, { version: '1.0', schemaVersion: 1, data: config },
            ordinary.instance.buildManualExportPayload(config), ordinary.instance.buildDriveBackupPayload(config));
    }
    for (const key of Object.keys(defaults())) for (const bad of [null, [], 'malformed', false]) vectors.push({ links: [], [key]: bad });
    for (const [index, value] of vectors.entries()) parity(realms, 'validateImportPayload', () => [clone(value)], `import vector ${index}`);
});

test('versioned raw-URL envelopes and nested metadata retain strict intact-marker requirements', () => {
    const realms = pair();
    for (const build of ['buildManualExportPayload', 'buildDriveBackupPayload']) for (const config of [rawURLs(), identity(true)]) {
        const good = ordinary.instance[build](config);
        const mutations = [
            p => { delete p.version; }, p => { p.version = '1.0'; }, p => { delete p.urlIdentityVersion; },
            p => { p.urlIdentityVersion = '1'; }, p => { p.urlIdentityVersion = 2; },
            p => { delete p.data; }, p => { p.settings = p.data; }, p => { p.schemaVersion = 3; },
            p => { p.schemaVersion = p.schemaVersion === 1 ? 2 : 1; }, p => { delete p.type; }, p => { p.app = 'other'; },
            p => { p.unknown = true; }, p => { p.data.unknown = true; }, p => { p.data.links[0].unknown = true; },
            p => { p.data.quote = '  Would trim  '; }, p => { delete p.data.ui; },
            p => { p.metadata = null; }, p => { p.metadata = { urlIdentityVersion: 1, app: p.app, type: p.type, schemaVersion: p.schemaVersion, deviceId: 1 }; },
            p => { p.metadata = { urlIdentityVersion: 1, app: p.app, type: p.type, schemaVersion: p.schemaVersion, unknown: true }; },
            p => { p.metadata = { app: p.app, type: p.type, schemaVersion: p.schemaVersion }; }
        ];
        parity(realms, 'validateImportPayload', () => [clone(good)], `${build} accepted`);
        for (const [index, mutate] of mutations.entries()) {
            const value = clone(good); mutate(value);
            const result = parity(realms, 'validateImportPayload', () => [clone(value)], `${build} marker mutation ${index}`);
            assert(result.error, `${build} marker mutation ${index} must refuse`);
        }
    }
});

test('raw URL spelling, duplicate identities and legacy/id-based layout keys are unchanged', () => {
    const realms = pair();
    const urls = ['example.com', 'https://example.com', 'https://example.com/', 'https://EXAMPLE.com/path',
        'http://example.com:80/', 'https://example.com/%2f?q=x#f', 'https://synthetic:password@example.com/',
        'https://example.com/%ZZ', 'https://EXAMPLE.com/%ZZ', 'https://synthetic:password@EXAMPLE.com',
        'HTTPS://example.com', 'example.com:8080', '//example.com', 'ftp://example.com', 'javascript:alert(1)',
        ' https://example.com/ ', 'https://example.com/\n', 'https://example.com/\\unsafe', 'https://example.com/\u202e', 'https://example.com/\ud800'];
    for (const url of urls) {
        parity(realms, 'validateLinksConfig', () => [[site(url)]], `new URL ${JSON.stringify(url)}`);
        parity(realms, 'validateStoredLinksConfig', () => [[site(url)]], `stored URL ${JSON.stringify(url)}`);
        parity(realms, 'validateImportPayload', () => [{ links: [site(url)], layout: { positions: { [`all|${url}`]: { x: 11.25, y: -7.5 } } } }], `import URL ${JSON.stringify(url)}`);
    }
    for (const mutate of [
        c => {}, c => { c.links[1].layoutId = id1; }, c => { delete c.links[1].layoutId; },
        c => { c.links[0].layoutId = 'invalid'; }, c => { delete c.layout.positionsById[id1]; },
        c => { c.layout.positionsById[id1].all.x = NaN; }, c => { c.layout.identityVersion = 2; },
        c => { delete c.layout.identityVersion; }, c => { delete c.layout.positionsById; },
        c => { c.layout.positions['odd|view|example.com'] = { x: 0.125, y: -9.75 }; }
    ]) {
        const config = identity(true); mutate(config);
        parity(realms, 'validateStoredConfigObject', () => [clone(config)], `identity ${mutate.toString()}`);
        parity(realms, 'validateImportPayload', () => [{ version: '1.0', schemaVersion: 2, data: clone(config) }], `schema2 ${mutate.toString()}`);
    }
});

test('Storage complete-backup projection and exact noncanonical/missing/unknown-field refusals retain parity', () => {
    for (const workspace of [false, true]) {
        const realms = pair({ workspace });
        for (const [index, config] of configurationVectors().entries()) {
            for (const method of ['completeBackupConfigFromRaw', 'validateWorkspaceConfig']) {
                parity(realms, method, () => [clone(config)], `${method}/${index}/workspace=${workspace}`, { pure: false });
            }
        }
        const supported = [{}, defaults(), rawURLs(), identity(), identity(true),
            { links: [{ title: 'Legacy', url: 'example.com' }], categories: [{ id: 'work', name: 'Work' }],
                privacy: { onlineWallpapers: false }, ui: { dashboardPadding: 12 } }];
        for (const [index, raw] of supported.entries()) {
            const complete = ordinary.instance.completeBackupConfigFromRaw(raw);
            const cases = [complete, null, {}, { ...complete, unknown: true }, { ...complete, schemaVersion: 99 }];
            for (const key of Object.keys(complete.data)) {
                const missing = clone(complete); delete missing.data[key]; cases.push(missing);
            }
            for (const mutate of [
                p => { p.data.sync = {}; }, p => { p.data.unknown = true; },
                p => { p.data.quote = '  Would be trimmed  '; }, p => { p.data.privacy.onlineWallpapers = true; },
                p => { p.data.layout.columns = 99; }, p => { p.data.ui.dashboardPadding = 8; },
                p => { p.data.appearance.customization = { backgroundMode: 'template' }; }
            ]) { const next = clone(complete); mutate(next); cases.push(next); }
            for (const [caseIndex, value] of cases.entries()) parity(realms, 'validateCompleteBackupConfig', () => [clone(value)], `complete ${index}/${caseIndex}/workspace=${workspace}`, { pure: false });
        }
    }
});

test('Manual/Drive exports and restore/Sync preparation continue to delegate without changing their contracts', () => {
    const realms = pair();
    const metadata = { exportDate: '2026-01-02T03:04:05.000Z', createdAt: '2026-01-03T03:04:05.000Z',
        extensionVersion: 'synthetic-version', snapshotId: 'synthetic-snapshot', deviceId: 'synthetic-device', deviceName: 'Synthetic device', reason: 'manual' };
    for (const [index, config] of configurationVectors().entries()) {
        for (const method of ['sanitizeConfigForBackup', 'countBackupItems', 'hasLegacyURLSpelling', 'prepareSyncPayload']) {
            parity(realms, method, () => [clone(config)], `${method}/${index}`, { pure: false });
        }
        for (const method of ['buildManualExportPayload', 'buildDriveBackupPayload']) {
            parity(realms, method, () => [clone(config)], `${method}/${index}/default metadata`, { pure: false });
            parity(realms, method, () => [clone(config), clone(metadata)], `${method}/${index}/explicit metadata`, { pure: false });
        }
        for (const current of [null, {}, { sync: { enabled: true, lastSync: 'local', lastError: '', includeLargeAssets: true, future: 'preserve externally' } }]) {
            parity(realms, 'prepareRestoredConfig', () => [clone(config), clone(current)], `restore/${index}/${JSON.stringify(current)}`, { pure: false });
        }
    }
    const result = parity(realms, 'prepareSyncPayload', () => [rawURLs()], 'raw URL Sync refusal', { pure: false });
    assert.equal(result.error.code, 'SYNC_IDENTITY_COMPATIBILITY'); assert.equal(result.error.kind, 'stored-url');
});

test('safe copying rejects getters/toJSON/cycles/non-JSON without execution and ignores unrelated raw records', () => {
    const realms = pair();
    let calls = 0;
    const factories = [
        () => Object.defineProperty({ links: [] }, 'quote', { enumerable: true, get() { calls++; return 'never'; } }),
        () => ({ links: [Object.defineProperty(site(), 'url', { enumerable: true, get() { calls++; return 'https://example.com/'; } })] }),
        () => ({ links: [], quote: { toJSON() { calls++; return 'never'; } } }),
        () => { const value = { links: [] }; value.quote = value; return value; },
        () => ({ links: [], quote: undefined }), () => ({ links: [], quote: Symbol('synthetic') }),
        () => ({ links: [], quote: 1n }), () => ({ links: [], quote: new Date(EPOCH) }),
        () => ({ links: Array(2) }), () => ({ links: [null, undefined] }),
        () => Object.assign(Object.create(null), { links: [] }),
        () => Object.assign(Object.create({ inherited: true }), { links: [] }),
        () => Object.defineProperty({ links: [] }, '__syntheticAuth', { enumerable: true, get() { calls++; throw new Error('Unrelated data must not be read'); } })
    ];
    for (const [index, factory] of factories.entries()) {
        for (const method of ['copyStoredValue', 'copyStoredConfiguration', 'validateStoredConfigObject', 'validateImportPayload']) {
            parity(realms, method, () => [factory()], `${method}/security ${index}`);
            assert.equal(calls, 0, 'No accessor, inherited content or toJSON code may run');
        }
    }
    const unsafeKeys = JSON.parse('{"links":[],"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}');
    parity(realms, 'copyStoredValue', () => [clone(unsafeKeys)]);
    parity(realms, 'validateImportPayload', () => [clone(unsafeKeys)]);
    assert.equal({}.polluted, undefined);
});

test('existing bounded-copy capacities and rejection codes are preserved without allocating excessive payloads', () => {
    const realms = pair();
    for (const [value, depth, nodes, chars] of [
        ['x', 0, 0, 128 * 1024 * 1024 - 1], ['xx', 0, 0, 128 * 1024 * 1024 - 1],
        [null, 40, 499999, 0], [null, 41, 0, 0], [null, 0, 500000, 0],
        [NaN, 0, 0, 0], [Infinity, 0, 0, 0]
    ]) {
        // The supplied accounting object is intentionally mutated by the public
        // copying helper. Compare that documented budget mutation separately.
        const run = realm => {
            const budget = { nodes, chars }; let outcome;
            try { outcome = { value: inspect(realm.instance.copyStoredValue(value, depth, new Set(), budget)) }; }
            catch (error) { outcome = { error: failure(error) }; }
            return { ...outcome, budget };
        };
        const expected = run(realms.oracle);
        assert.deepEqual(run(realms.storage), expected); assert.deepEqual(run(realms.pure), expected);
    }
    for (const size of [250000, 250001]) {
        const value = Array(size).fill(null);
        const run = realm => {
            try { return { length: realm.instance.copyStoredValue(value).length }; }
            catch (error) { return { error: failure(error) }; }
        };
        const expected = run(realms.oracle);
        assert.deepEqual(run(realms.storage), expected); assert.deepEqual(run(realms.pure), expected);
        assert.equal(value.length, size); assert.equal(value[0], null); assert.equal(value.at(-1), null);
    }
    const largeQuote = 'x'.repeat(12 * 1024 * 1024);
    for (const method of ['validateStoredConfigObject', 'validateImportPayload']) {
        for (const realm of Object.values(realms)) {
            const input = { links: [], quote: largeQuote }, result = realm.instance[method](input);
            assert.equal(result.quote, largeQuote); assert.equal(input.quote, largeQuote);
        }
    }
});

test('Storage ordinary get/getAll and workspace corruption boundaries retain exact outcomes without fallback writes', async () => {
    for (const workspace of [false, true]) for (const [index, source] of [
        {}, { links: [], quote: false }, { links: [site('example.com')] },
        { links: [site('//unsupported.example')] }, { links: [site('example.com', { unknown: true })] },
        { links: [], clock: { worldClocks: 'bad' } }, { links: [], layout: { columns: 99 } }
    ].entries()) {
        const realms = pair({ workspace });
        const run = async (realm, method, args) => {
            Object.assign(realm.raw, clone(source));
            realm.events.length = 0; realm.warnings.length = 0;
            const before = inspect(realm.raw, new Map(), true); let result;
            try { result = { value: inspect(await realm.instance[method](...args)) }; }
            catch (error) { result = { error: failure(error) }; }
            assert.deepEqual(inspect(realm.raw, new Map(), true), before);
            assert(!realm.events.includes('local.set'), 'Read-only validation must not enter a new default-writing fallback');
            return { ...result, events: realm.events.slice(), warnings: inspect(realm.warnings) };
        };
        for (const [method, args] of [['get', ['links']], ['get', ['quote']], ['getAll', []]]) {
            const expected = await run(realms.oracle, method, args);
            assert.deepEqual(await run(realms.storage, method, args), expected, `${method}/${index}/workspace=${workspace}`);
        }
    }
});
