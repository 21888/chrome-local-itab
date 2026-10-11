const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const StorageManager = require('../storage.js');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const clone = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const source = file => fs.readFileSync(file, 'utf8');

function fixture() {
    let raw = new StorageManager().cloneDefaultConfig();
    raw.links = [{ title: 'Keep', url: 'https://example.com/', category: 'work' }];
    raw.layout = { autoArrange: false, alignToGrid: false, gridSize: 96, columns: 3, positions: { 'work|https://example.com/': { x: 37, y: 29 } } };
    const writes = [];
    let queue = Promise.resolve();
    Object.defineProperty(global, 'navigator', { configurable: true, value: { locks: { request(name, fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; } } } });
    const listeners = [];
    global.chrome = { storage: { onChanged: { addListener(fn) { listeners.push(fn); } }, local: {
        async get(keys) { return keys ? Object.fromEntries(keys.filter(key => key in raw).map(key => [key, clone(raw[key])])) : clone(raw); },
        async set(patch) { writes.push(clone(patch)); Object.assign(raw, clone(patch)); for (const fn of listeners) fn(Object.fromEntries(Object.entries(patch).map(([key, newValue]) => [key, { newValue }])), 'local'); }
    } } };
    const storage = new StorageManager(); storage._syncInitialized = true;
    return { storage, writes, read: () => clone(raw), replace: patch => Object.assign(raw, clone(patch)) };
}
function page(f) {
    const document = createDocument(), dashboard = document.createElement('main'), host = document.createElement('div');
    dashboard.id = 'dashboard'; document.body.append(dashboard, host);
    const window = { document, storageManager: f.storage, LocalItabWorkspaces: { session: { id: 'space_synthetic' } }, LocalItabWorkspacesView: { settingsUrl: (id, hash) => `options.html?workspace=${id}#${hash}` } };
    const context = vm.createContext({ window, console });
    for (const file of ['shared/dialog-focus.js', 'shared/dashboard-customization.js', 'shared/appearance.js']) vm.runInContext(source(file), context);
    const appearance = window.LocalItabAppearance.mount(host, { storage: f.storage, initial: f.read().appearance, baseline: { generation: null } });
    const api = window.LocalItabCustomization;
    const launch = host.querySelector('.customize-launch');
    return { document, dashboard, host, window, appearance, api, launch,
        control: field => document.querySelector(`[data-customize-field="${field}"]`),
        async open() { launch.focus(); launch.dispatch('click'); await tick(); },
        change(field, value) { const el = this.control(field); el.value = value; el.dispatch('input'); },
        button(text) { return document.querySelectorAll('.customize-actions button').find(el => el.textContent === text); }
    };
}

test('legacy configurations stay unchanged; optional customization roundtrips through backups', () => {
    const s = new StorageManager();
    assert.deepEqual(s.validateAppearanceConfig({}), { template: 'clarity', colorMode: 'light' });
    const config = s.cloneDefaultConfig(); config.appearance.customization = s.validateDashboardCustomization({ backgroundMode: 'gradient', backgroundStart: '#ABCDEF', cardColumns: 4, cardRadius: 0 });
    for (const payload of [config, s.buildManualExportPayload(config), s.buildDriveBackupPayload(config)]) {
        assert.deepEqual(s.validateImportPayload(payload).appearance.customization, config.appearance.customization);
    }
    assert.equal(config.appearance.customization.backgroundStart, '#abcdef');
});

test('backup/customization input rejects unknown fields, CSS injection and invalid ranges', async () => {
    const f = fixture(), s = f.storage;
    for (const bad of [null, [], { injected: true }, { cardColumns: 0 }, { cardColumns: 1.5 }, { cardOpacity: 39 }, { cardRadius: 33 }, { cardPadding: '16' }, { cardGap: NaN }, { backgroundStart: 'url(https://example.com)' }, { backgroundEnd: '#fff' }, { backgroundAngle: 361 }, { backgroundMode: 'image' }]) {
        assert.throws(() => s.validateDashboardCustomization(bad));
        assert.throws(() => s.validateImportPayload({ links: [], appearance: { customization: bad } }), /Invalid backup/);
    }
    for (const baseline of [undefined, {}, { generation: '' }, { generation: 17 }]) await assert.rejects(s.patchDashboardCustomization({ cardColumns: 2 }, baseline));
    assert.equal(f.writes.length, 0);
});

test('unrelated concurrent fields merge and template/palette changes keep overrides and all content', async () => {
    const f = fixture(), before = f.read(), baseline = { generation: null, customization: {} };
    await Promise.all([f.storage.patchDashboardCustomization({ backgroundMode: 'solid', backgroundStart: '#123456' }, baseline), f.storage.patchDashboardCustomization({ cardGap: 27 }, baseline), f.storage.patchAppearance({ template: 'folio', colorMode: 'dark' }, baseline)]);
    const after = f.read(); assert.equal(after.appearance.template, 'folio'); assert.equal(after.appearance.colorMode, 'dark');
    assert.equal(after.appearance.customization.backgroundStart, '#123456'); assert.equal(after.appearance.customization.cardGap, 27);
    assert.deepEqual({ ...after, appearance: before.appearance }, before);
    assert(f.writes.every(patch => Object.keys(patch).join() === 'appearance'));
});

test('same-field conflict and generation replacement cannot overwrite newer settings', async () => {
    const f = fixture(), baseline = { generation: null, customization: {} };
    await f.storage.patchDashboardCustomization({ cardRadius: 5 }, baseline);
    await assert.rejects(f.storage.patchDashboardCustomization({ cardRadius: 20 }, baseline), { code: 'APPEARANCE_CONFLICT' });
    assert.equal(f.read().appearance.customization.cardRadius, 5);
    f.replace({ __localItabSettingsGeneration: 'replacement' });
    await assert.rejects(f.storage.patchDashboardCustomization({ cardGap: 20 }, baseline), { code: 'APPEARANCE_CONFLICT' });
    assert.equal(f.writes.length, 1);
});

test('unavailable lock and failed read/write never commit an optimistic preview', async () => {
    const f = fixture(), baseline = { generation: null, customization: {} };
    Object.defineProperty(global, 'navigator', { configurable: true, value: {} });
    await assert.rejects(f.storage.patchDashboardCustomization({ cardGap: 22 }, baseline), { code: 'APPEARANCE_LOCK_UNAVAILABLE' });
    assert.equal(f.writes.length, 0);
    const g = fixture(); global.chrome.storage.local.get = async () => { throw new Error('read unavailable'); };
    await assert.rejects(g.storage.patchDashboardCustomization({ cardGap: 22 }, baseline)); assert.equal(g.writes.length, 0);
});

test('dialog opening and edits preview without writes; Cancel restores latest external values', async () => {
    const f = fixture(), p = page(f); await p.open();
    assert.equal(Boolean(p.document.querySelector('[role="dialog"]')), true);
    p.change('backgroundMode', 'gradient'); p.change('backgroundStart', '#334455'); p.change('cardColumns', '4');
    assert.equal(p.document.documentElement.dataset.customBackground, 'true');
    assert.equal(p.document.documentElement.style['--custom-card-columns'], '4');
    assert.equal(f.writes.length, 0);
    await f.storage.patchDashboardCustomization({ backgroundMode: 'solid', backgroundStart: '#abcdef', cardGap: 28 }, { generation: null, customization: {} });
    await tick();
    assert.equal(p.document.documentElement.style['--custom-card-columns'], '4', 'external updates do not erase the preview');
    p.button('Cancel').dispatch('click');
    assert.equal(Boolean(p.document.querySelector('[role="dialog"]')), false);
    assert.equal(p.document.documentElement.style['--custom-background'], '#abcdef');
    assert.equal(p.document.documentElement.style['--custom-card-gap'], '28px');
    assert.equal(p.document.documentElement.style['--custom-card-columns'], undefined);
    assert.equal(p.document.activeElement === p.launch, true); assert.equal(p.dashboard.inert, false);
});

test('Save merges only edited fields and reopening restores saved choices', async () => {
    const f = fixture(), p = page(f); await p.open(); p.change('backgroundMode', 'solid'); p.change('backgroundStart', '#112233'); p.change('cardColumns', '2');
    p.button('Save').dispatch('click'); await tick(); await tick();
    assert.equal(Boolean(p.document.querySelector('[role="dialog"]')), false);
    assert.equal(f.read().appearance.customization.cardColumns, 2);
    await p.open(); assert.equal(p.control('backgroundStart').value, '#112233'); assert.equal(p.control('cardColumns').value, '2');
    p.button('Reset preview').dispatch('click'); assert.equal(p.control('cardColumns').value, ''); assert.equal(f.writes.length, 1);
    p.button('Cancel').dispatch('click'); assert.equal(p.document.documentElement.style['--custom-card-columns'], '2');
});

test('same-field conflict retains draft and Cancel restores latest saved surface', async () => {
    const f = fixture(), p = page(f); await p.open(); p.change('cardRadius', '24');
    await f.storage.patchDashboardCustomization({ cardRadius: 5 }, { generation: null, customization: {} }); await tick();
    p.button('Save').dispatch('click'); await tick(); await tick();
    assert.equal(p.control('cardRadius').value, '24'); assert.match(p.document.querySelector('.customize-status').textContent, /changed/);
    assert.equal(f.read().appearance.customization.cardRadius, 5);
    p.button('Cancel').dispatch('click'); assert.equal(p.document.documentElement.style['--custom-card-radius'], '5px');
});

test('pending save blocks repeat Save, reset, Cancel and Escape until outcome', async () => {
    const f = fixture(), p = page(f), gate = deferred(), original = f.storage.patchDashboardCustomization.bind(f.storage); let calls = 0;
    f.storage.patchDashboardCustomization = async (...args) => { calls++; await gate.promise; return original(...args); };
    await p.open(); p.change('cardPadding', '30'); const save = p.button('Save'); save.dispatch('click'); save.dispatch('click');
    p.button('Cancel').dispatch('click'); p.document.querySelector('.customize-overlay').dispatch('keydown', { key: 'Escape' });
    assert.equal(calls, 1); assert.equal(Boolean(p.document.querySelector('[role="dialog"]')), true);
    gate.resolve(); await tick(); await tick(); assert.equal(Boolean(p.document.querySelector('[role="dialog"]')), false);
    assert.equal(f.read().appearance.customization.cardPadding, 30);
});

test('IME Escape preserves draft; normal Escape closes without writes; link keeps workspace identity', async () => {
    const f = fixture(), p = page(f); await p.open(); const input = p.control('cardGap'); input.focus(); input.dispatch('compositionstart');
    input.dispatch('keydown', { key: 'Escape' }); assert.equal(Boolean(p.document.querySelector('[role="dialog"]')), true);
    assert.equal(p.document.querySelector('.customize-panel a').href, 'options.html?workspace=space_synthetic#layout-settings');
    input.dispatch('compositionend'); input.dispatch('keydown', { key: 'Escape' });
    assert.equal(Boolean(p.document.querySelector('[role="dialog"]')), false); assert.equal(f.writes.length, 0);
});

test('invalid intermediate numeric drafts disable Save without silently replacing their input', async () => {
    const f = fixture(), p = page(f); await p.open(); p.change('cardColumns', '9'); assert.equal(p.button('Save').disabled, true);
    p.change('cardGap', '12'); assert.equal(p.control('cardColumns').value, '9'); assert.equal(p.button('Save').disabled, true);
    p.change('cardColumns', '3'); assert.equal(p.button('Save').disabled, false);
    p.button('Cancel').dispatch('click'); assert.equal(f.writes.length, 0);
});

test('new controls are localized, packaged, responsive and never alter Free shortcut positions', () => {
    const js = source('shared/dashboard-customization.js');
    const keys = [...js.matchAll(/(?:tr\('([^']+)'|\['[^']+', '(customize[^']+)')/g)].map(match => match[1] || match[2]);
    for (const locale of ['en', 'zh_CN']) { const messages = JSON.parse(source(`_locales/${locale}/messages.json`)); for (const key of keys) assert(messages[key], `${locale}: ${key}`); }
    for (const html of ['newtab.html', 'options.html']) { assert(source(html).includes('dashboard-customization.css')); assert(source(html).includes('shared/dashboard-customization.js')); }
    assert(source('tools/package_extension.py').includes('"shared/dashboard-customization.js"'));
    const css = source('dashboard-customization.css'); assert.match(css, /max-width: 620px/); assert.match(css, /max-width: 1000px/); assert.equal(css.includes('.shortcut-item'), false);
});

// Equal-specificity Today/Column desktop rules must precede explicit user overrides.
test('custom card columns override later gallery sidebar layouts on both entry pages', () => {
    for (const html of ['newtab.html', 'options.html']) {
        const links = [...source(html).matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map(match => match[1]);
        assert(links.indexOf('dashboard-customization.css') > links.indexOf('dashboard-template-gallery.css'), html);
        if (links.includes('dashboard-templates.css')) assert(links.indexOf('dashboard-customization.css') > links.indexOf('dashboard-templates.css'), html);
    }
    assert.match(source('dashboard-customization.css'), /\[data-custom-card-columns="true"\] \.dashboard-main \{ display: flex; flex-direction: column;/);
    assert.match(source('dashboard-template-gallery.css'), /data-dashboard-template="today".*\.dashboard-main\.has-info-cards/);
    assert.match(source('dashboard-template-gallery.css'), /data-dashboard-template="column".*\.dashboard-main\.has-info-cards/);
});

test('modeled badInput with an empty numeric value keeps Save blocked until an intentional valid edit', async () => {
    const f = fixture(), p = page(f); await p.open();
    const control = p.control('cardColumns');
    control.value = ''; control.validity = { badInput: true }; control.dispatch('input');
    assert.equal(p.button('Save').disabled, true);
    assert.equal(control.getAttribute('aria-invalid'), 'true');
    p.change('cardGap', '12');
    assert.equal(p.button('Save').disabled, true);
    assert.equal(f.writes.length, 0);
    control.validity = { badInput: false }; control.value = ''; control.dispatch('input');
    assert.equal(p.button('Save').disabled, false);
    assert.equal(control.getAttribute('aria-invalid'), 'false');
    p.button('Cancel').dispatch('click'); assert.equal(f.writes.length, 0);
});

const hexField = (p, field) => p.document.querySelector(`[data-customize-hex="${field}"]`);
const enterHex = (p, field, value) => { const input = hexField(p, field); input.value = value; input.dispatch('input'); return input; };

test('exact hex fields accept typing/paste, synchronize pickers and save only valid normalized colors', async () => {
    const f = fixture(), p = page(f); await p.open();
    assert.equal(hexField(p, 'backgroundStart').disabled, true);
    p.change('backgroundMode', 'solid');
    assert.equal(hexField(p, 'backgroundStart').disabled, false);
    assert.equal(hexField(p, 'backgroundEnd').disabled, true);
    const text = enterHex(p, 'backgroundStart', '#A1B2C3');
    assert.equal(text.value, '#a1b2c3'); assert.equal(p.control('backgroundStart').value, '#a1b2c3');
    assert.equal(p.document.documentElement.style['--custom-background'], '#a1b2c3');
    assert.equal(f.writes.length, 0);
    p.change('backgroundMode', 'gradient'); enterHex(p, 'backgroundEnd', '#102030');
    assert.equal(p.document.documentElement.style['--custom-background'], 'linear-gradient(135deg, #a1b2c3, #102030)');
    p.button('Save').dispatch('click'); await tick(); await tick();
    assert.equal(f.read().appearance.customization.backgroundStart, '#a1b2c3');
    assert.equal(f.read().appearance.customization.backgroundEnd, '#102030');
    await p.open(); assert.equal(hexField(p, 'backgroundStart').value, '#a1b2c3');
    p.button('Cancel').dispatch('click');
});

test('invalid and incomplete hex drafts retain visible input, errors and saved-state protection', async () => {
    const f = fixture(), p = page(f); await p.open(); p.change('backgroundMode', 'gradient');
    enterHex(p, 'backgroundStart', '#123456');
    const preview = p.document.documentElement.style['--custom-background'];
    for (const bad of ['', '#', '#abc', '123456', '#gg1122', '#12345678', ' #123456', '#123456\n', 'url(https://example.com)']) {
        const text = enterHex(p, 'backgroundStart', bad);
        assert.equal(text.value, bad); assert.equal(text.getAttribute('aria-invalid'), 'true');
        assert.equal(p.button('Save').disabled, true);
        assert.match(p.document.querySelector('.customize-status').textContent, /6 hexadecimal/);
        assert.equal(p.document.documentElement.style['--custom-background'], preview);
        p.button('Save').dispatch('click'); await tick(); assert.equal(f.writes.length, 0);
    }
    p.change('cardGap', '20'); enterHex(p, 'backgroundEnd', '#abcdef');
    assert.equal(hexField(p, 'backgroundStart').value, 'url(https://example.com)');
    assert.equal(p.button('Save').disabled, true);
    assert.match(p.document.getElementById(hexField(p, 'backgroundStart').getAttribute('aria-describedby')).textContent, /#336699/);
    enterHex(p, 'backgroundStart', '#223344'); assert.equal(p.button('Save').disabled, false);
    assert.equal(hexField(p, 'backgroundStart').getAttribute('aria-invalid'), 'false');
    assert.equal(p.document.querySelector('.customize-color-error').textContent, '');
    p.button('Cancel').dispatch('click'); assert.equal(f.writes.length, 0);
});

test('picker correction and Reset clear invalid hex drafts while Cancel discards preview', async () => {
    const f = fixture(), p = page(f); await p.open(); p.change('backgroundMode', 'gradient');
    enterHex(p, 'backgroundStart', '#bad'); p.change('backgroundStart', '#445566');
    assert.equal(hexField(p, 'backgroundStart').value, '#445566'); assert.equal(p.button('Save').disabled, false);
    enterHex(p, 'backgroundStart', '#'); enterHex(p, 'backgroundEnd', 'oops');
    p.button('Reset preview').dispatch('click');
    for (const key of ['backgroundStart', 'backgroundEnd']) {
        assert.equal(hexField(p, key).getAttribute('aria-invalid'), 'false');
        assert.equal(hexField(p, key).value, p.control(key).value);
        assert.equal(hexField(p, key).disabled, true);
    }
    assert.equal(p.button('Save').disabled, false); assert.equal(p.document.querySelector('.customize-status').textContent, '');
    p.button('Cancel').dispatch('click'); assert.equal(f.writes.length, 0);
    assert.equal(p.document.documentElement.dataset.customBackground, 'false');
});

test('hex fields obey pending-save lock and recover focus on failed save', async () => {
    const f = fixture(), p = page(f), gate = deferred();
    f.storage.patchDashboardCustomization = async () => { await gate.promise; throw new Error('synthetic write failure'); };
    await p.open(); p.change('backgroundMode', 'solid'); const text = enterHex(p, 'backgroundStart', '#223344'); text.focus();
    p.button('Save').dispatch('click');
    assert.equal(text.disabled, true); assert.equal(p.document.activeElement === p.document.querySelector('.customize-panel'), true);
    enterHex(p, 'backgroundStart', '#'); p.button('Reset preview').dispatch('click');
    gate.resolve(); await tick(); await tick();
    assert.equal(text.disabled, false); assert.equal(text.value, '#223344');
    assert.equal(p.document.activeElement === text, true); assert.equal(p.button('Save').disabled, false);
    assert.match(p.document.querySelector('.customize-status').textContent, /Could not save/);
    text.dispatch('keydown', { key: 'Escape' }); assert.equal(Boolean(p.document.querySelector('[role="dialog"]')), false);
    assert.equal(f.writes.length, 0);
});

test('switching background mode discards only invalid inactive color and angle text', async () => {
    for (const mode of ['solid', 'template']) {
        const f = fixture(), p = page(f); await p.open(); p.change('backgroundMode', 'gradient');
        enterHex(p, 'backgroundStart', '#112233'); enterHex(p, 'backgroundEnd', '#445566'); p.change('backgroundAngle', '90');
        enterHex(p, 'backgroundEnd', '#'); p.change('backgroundAngle', '999');
        assert.equal(p.button('Save').disabled, true);
        p.change('backgroundMode', mode);
        assert.equal(p.button('Save').disabled, false, `${mode} must not trap an inactive invalid draft`);
        assert.equal(hexField(p, 'backgroundEnd').value, '#445566'); assert.equal(p.control('backgroundAngle').value, '90');
        assert.equal(hexField(p, 'backgroundEnd').getAttribute('aria-invalid'), 'false');
        assert.equal(p.control('backgroundAngle').getAttribute('aria-invalid'), 'false');
        assert.equal(p.document.querySelector('.customize-status').textContent, '');
        p.button('Save').dispatch('click'); await tick(); await tick();
        assert.equal(f.read().appearance.customization.backgroundMode, mode);
        assert.equal(f.read().appearance.customization.backgroundEnd, '#445566');
        assert.equal(f.read().appearance.customization.backgroundAngle, 90);
    }
});

test('mode transitions retain active errors and clear first-color error only when it becomes inactive', async () => {
    const f = fixture(), p = page(f); await p.open(); p.change('backgroundMode', 'gradient');
    enterHex(p, 'backgroundStart', '#112233'); enterHex(p, 'backgroundStart', '#');
    enterHex(p, 'backgroundEnd', 'bad'); p.change('cardGap', '99');
    p.change('backgroundMode', 'solid');
    assert.equal(hexField(p, 'backgroundStart').value, '#');
    assert.equal(hexField(p, 'backgroundStart').getAttribute('aria-invalid'), 'true');
    assert.equal(p.control('cardGap').value, '99'); assert.equal(p.button('Save').disabled, true);
    p.change('backgroundMode', 'template');
    assert.equal(hexField(p, 'backgroundStart').value, '#112233');
    assert.equal(hexField(p, 'backgroundStart').getAttribute('aria-invalid'), 'false');
    assert.equal(p.control('cardGap').getAttribute('aria-invalid'), 'true');
    assert.equal(p.button('Save').disabled, true);
    p.change('cardGap', '20'); assert.equal(p.button('Save').disabled, false);
    p.change('backgroundMode', 'gradient'); assert.equal(hexField(p, 'backgroundStart').value, '#112233');
    p.button('Cancel').dispatch('click'); assert.equal(f.writes.length, 0);
});
