'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createDocument, deferred} = require('./helpers/task-dom-model');
const {fixture, withGlobals, storageFor, seed, boot, values, Workspaces, clone} = require('./helpers/complete-import-receipt-fixture');

// Actual DOM-ready, button/change handlers, i18n, toast shell, production
// StorageManager/workspaces and reload guards. Only synthetic RAM, model DOM,
// timers, Web Locks and stub permission APIs; never native Chrome or a grant.
const source = fs.readFileSync('options.js', 'utf8');
const html = fs.readFileSync('options.html', 'utf8');
const catalogs = Object.fromEntries(['en', 'zh_CN'].map(locale => [locale,
    JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'))]));
const literal = 'Exact $& $1 $$ $` $\'\n<img src=x onerror=alert(1)> 中文';
const words = {
    en: {settingsLoadFailed: 'Failed to load settings. Please try refreshing the page.',
        settingsFaviconPermissionDenied: 'Online favicon permission was not granted.',
        settingsResetting: 'Resetting settings...', settingsResetFailed: 'Settings could not be reset. Please try again.',
        settingsResetErrorPrefix: 'Error resetting settings:'},
    zh_CN: {settingsLoadFailed: '加载设置失败，请尝试刷新页面。',
        settingsFaviconPermissionDenied: '未获得在线网站图标权限。',
        settingsResetting: '正在重置设置...', settingsResetFailed: '无法重置设置，请重试。',
        settingsResetErrorPrefix: '重置设置时出错：'}
};
const word = (locale, key) => (words[locale] || words.en)[key];
const last = p => p.messages().at(-1);
function personal() {
    return Object.fromEntries(['tasks', 'focus', 'scratchpad', 'countdown'].map(name => {
        const store = require('../shared/local-' + name + '-store.js'); const value = store.initial(); value.enabled = true;
        if (name === 'scratchpad') value.content = 'Synthetic saved note ' + literal;
        if (name === 'countdown') { value.title = 'Synthetic date'; value.targetDate = '2027-01-01'; }
        if (name === 'focus') value.session = {id: 'synthetic_focus_session', phase: 'focus', status: 'running', remainingMs: 1500000, startedAt: 1800000000000, deadline: 1800001500000};
        return [store.KEY, value];
    }));
}
function initial() {
    const raw = seed(); raw.quote = 'Saved synthetic quote';
    raw.links = [{title: 'Synthetic site', url: 'https://example.com/', category: 'work', icon: '★'}];
    Object.assign(raw, personal());
    raw.__localItabImportClosureV1 = {synthetic: 'protected local import evidence'};
    return raw;
}
async function page(f, {locale = 'en', api = 'normal', missingKey, storage = storageFor(f), initError} = {}) {
    const document = createDocument(), events = new Map(), timers = new Map(); let timerId = 0;
    const state = {confirms: [], allowReset: true, reloads: 0, errors: [], trace: [], permissionCalls: [],
        permission: false, request: null, contains: null, mounts: 0};
    document.body.prepend = (...nodes) => document.body.append(...nodes);
    const field = id => document.getElementById(id);
    for (const [tag, id] of [['input', 'quote-text'], ['input', 'hour12-format'], ['input', 'show-seconds'],
        ['input', 'bg-type'], ['input', 'bg-color'], ['input', 'bg-color-text'], ['input', 'world-clock-zone'],
        ['input', 'world-clock-label'], ['ul', 'category-manage-list'], ['button', 'add-category'], ['div', 'toast-container']]) {
        const node = document.createElement(tag); node.id = id; document.body.append(node);
    }
    for (const id of ['save-settings', 'reset-settings', 'privacy-online-favicons']) {
        const match = html.match(new RegExp(`<([a-z]+)\\b([^>]*\\bid="${id}"[^>]*)>`));
        assert(match, `actual Settings entry ${id}`); const node = document.createElement(match[1]);
        for (const [, key, value] of match[2].matchAll(/([\w-]+)="([^"]*)"/g)) {
            node.setAttribute(key, value); if (['id', 'type', 'class'].includes(key)) node[key === 'class' ? 'className' : key] = value;
        }
        document.body.append(node);
    }
    const label = document.createElement('label'); label.className = 'setting-label';
    const checkbox = field('privacy-online-favicons'); checkbox.remove(); label.append(checkbox);
    const desc = document.createElement('span'); desc.className = 'setting-desc'; desc.textContent = 'Synthetic base hint'; label.append(desc); document.body.append(label);
    const append = field('toast-container').appendChild.bind(field('toast-container'));
    field('toast-container').appendChild = node => { state.trace.push('message:' + [...node._classes].find(value => value.startsWith('message-')).slice(8)); append(node); };
    f.chrome.i18n = {getMessage(key) {
        if (api === 'throw') throw new Error('Synthetic catalog unavailable');
        if (api === 'missing' || key === missingKey) return '';
        if (api === 'key') return key;
        return (catalogs[locale] || catalogs.en)[key]?.message || '';
    }, getUILanguage: () => locale === 'zh_CN' ? 'en-US' : 'zh-CN'};
    if (api === 'absent') delete f.chrome.i18n;
    f.chrome.permissions = {
        async request(request) {
            state.permissionCalls.push(['request', clone(request)]); state.trace.push('request');
            const granted = state.request ? await state.request() : state.permission;
            state.trace.push('permission-result:' + granted); return granted;
        },
        contains(request, callback) {
            state.permissionCalls.push(['contains', clone(request)]); state.trace.push('contains');
            if (state.contains) return state.contains(callback);
            callback(state.permission); return Promise.resolve(state.permission);
        }
    };
    f.chrome.storage.sync.getBytesInUse = async () => 0;
    const originalSet = f.chrome.storage.local.set;
    f.chrome.storage.local.set = async data => { state.trace.push('storage:set'); return originalSet(data); };
    const context = vm.createContext({document, storageManager: storage, chrome: f.chrome, URL,
        navigator: global.navigator, crypto: global.crypto,
        console: {log() {}, warn() {}, error(...args) { state.errors.push(args); }},
        confirm(text) { state.confirms.push(text); return state.allowReset; },
        setTimeout(fn, delay) { timers.set(++timerId, {fn, delay}); return timerId; }, clearTimeout(id) { timers.delete(id); },
        addEventListener(type, fn) { events.set(type, fn); }, location: {reload() { state.reloads++; }},
        LocalItabWorkspacesView: {async mountPage() { state.mounts++; }}
    });
    context.window = context;
    if (api !== 'no-helper') vm.runInContext(fs.readFileSync('i18n.js', 'utf8'), context);
    vm.runInContext(source, context);
    if (initError) f.hooks.get = () => { throw initError; };
    const before = clone(f.raw), writes = f.writes.length;
    await document.listeners.get('DOMContentLoaded')(); f.hooks.get = null;
    vm.runInContext(fs.readFileSync('shared/local-content-lifecycle.js', 'utf8'), context);
    const messages = () => field('toast-container').children.map(node => ({text: node.textContent,
        type: [...node._classes].find(value => value.startsWith('message-')).slice(8), role: node.getAttribute('role')}));
    if (!initError) {
        assert.deepEqual(messages(), [], 'initialization: ' + state.errors.map(String));
        assert(vm.runInContext('settingsBaseline && settingsFormBaseline', context));
    }
    assert.deepEqual(f.raw, before); assert.equal(f.writes.length, writes, 'opening Settings never writes');
    const fire = async (id, type) => {
        const node = field(id), handlers = node.listeners.get(type); assert(handlers?.length, `actual handler ${id}/${type}`);
        for (const handler of handlers) await handler({target: node});
    };
    return {f, state, context, document, storage, field, messages, fire, timers,
        reset: () => fire('reset-settings', 'click'), save: () => fire('save-settings', 'click'),
        change: () => fire('privacy-online-favicons', 'change'),
        beforeunload() { const event = {prevented: false, preventDefault() { this.prevented = true; }}; events.get('beforeunload')(event); return event; }};
}
function check(name, options, fn) {
    test(name, {timeout: 8000}, async () => {
        const f = fixture(initial());
        await withGlobals(f, async () => { const p = await page(f, options); await fn(p); assert.deepEqual(f.providers, []); });
    });
}
const error = (text, code = 'WORKSPACE_TEST_FAILURE') => Object.assign(new Error(text), {code});
const protectedDraft = p => { assert(p.context.LocalItabContentLifecycle.hasUncommittedWork()); assert(p.beforeunload().prevented); assert.equal(p.context.LocalItabContentLifecycle.reload(), false); assert.equal(p.state.reloads, 0); };
const origins = {origins: ['https://www.google.com/*']};

for (const [locale, api] of [['en', 'normal'], ['zh_CN', 'normal'], ['fr-FR', 'normal'],
    ...['missing', 'throw', 'absent', 'key', 'no-helper'].map(api => ['zh_CN', api])]) {
    const language = api === 'normal' ? locale : 'en';
    check(`${locale}/${api}: DOM-ready failure reports a readable alert and binds no actions`, {locale, api, initError: error(literal)}, async p => {
        assert.deepEqual(p.messages(), [{text: word(language, 'settingsLoadFailed'), type: 'error', role: 'alert'}]);
        assert.equal(p.state.mounts, 1); assert.equal(p.state.errors.length, 2);
        assert.equal(p.state.errors[0][1].message, literal); assert.equal(p.state.errors[1][1].message, literal);
        for (const [id, type] of [['save-settings', 'click'], ['reset-settings', 'click'], ['privacy-online-favicons', 'change']])
            assert.equal(p.field(id).listeners.get(type), undefined);
        assert.equal(vm.runInContext('settingsFormBaseline', p.context), null);
        assert.equal(p.f.writes.length, 0); assert.equal(p.state.reloads, 0); assert.deepEqual(p.state.permissionCalls, []);
    });
    check(`${locale}/${api}: denied favicon change rolls back then saves other edits in the same order`, {locale, api}, async p => {
        const before = clone(p.f.raw), checkbox = p.field('privacy-online-favicons');
        p.field('quote-text').value = 'Synthetic edited quote'; checkbox.checked = true; checkbox.dataset.permissionMissing = 'true';
        p.state.trace = []; await p.change();
        assert.deepEqual(p.state.trace, ['request', 'permission-result:false', 'message:error', 'message:info', 'storage:set', 'message:success']);
        assert.deepEqual(p.state.permissionCalls, [['request', origins]]);
        assert.deepEqual(p.messages()[0], {text: word(language, 'settingsFaviconPermissionDenied'), type: 'error', role: 'alert'});
        assert.equal(checkbox.checked, false); assert.equal(checkbox.dataset.permissionMissing, 'false'); assert.equal(checkbox.title, '');
        assert.equal(p.f.raw.privacy.onlineFavicons, false); assert.equal(p.f.raw.quote, 'Synthetic edited quote');
        for (const key of ['links', ...Workspaces.PERSONAL_KEYS, '__localItabImportClosureV1']) assert.deepEqual(p.f.raw[key], before[key]);
        assert.equal(p.f.writes.length, 1); assert.equal(p.context.settingsHasUncommittedWork(), false);
    });
    check(`${locale}/${api}: failed clear localizes status and refusal without clearing the draft`, {locale, api}, async p => {
        const before = clone(p.f.raw); p.field('quote-text').value = 'Unsaved synthetic draft';
        p.f.hooks.set = () => { throw new Error('Synthetic ordinary storage write failure'); }; await p.reset(); p.f.hooks.set = null;
        assert.deepEqual(p.messages(), [{text: word(language, 'settingsResetting'), type: 'info', role: 'status'},
            {text: word(language, 'settingsResetErrorPrefix') + ' ' + word(language, 'settingsResetFailed'), type: 'error', role: 'alert'}]);
        assert.equal(p.state.confirms.length, 1); assert.deepEqual(p.f.raw, before); assert.equal(p.f.writes.length, 1, 'one attempted fence, no committed write');
        assert.equal(p.field('quote-text').value, 'Unsaved synthetic draft'); protectedDraft(p);
    });
    check(`${locale}/${api}: thrown reset details remain exact text, never substitutions or markup`, {locale, api}, async p => {
        const before = clone(p.f.raw); p.f.hooks.get = () => { throw error(literal); }; await p.reset(); p.f.hooks.get = null;
        assert.deepEqual(last(p), {text: word(language, 'settingsResetErrorPrefix') + ' ' + literal, type: 'error', role: 'alert'});
        assert.equal(p.document.querySelectorAll('img').length, 0); assert.equal(p.f.writes.length, 0); assert.deepEqual(p.f.raw, before);
        assert.equal(p.state.reloads, 0); assert.equal(p.state.errors.at(-1)[0], 'Error resetting settings:');
    });
}
for (const locale of ['en', 'zh_CN']) {
    check(`${locale}: cancelled reset preserves confirmation wording and performs zero writes`, {locale}, async p => {
        const before = clone(p.f.raw); p.field('quote-text').value = 'Kept draft'; p.state.allowReset = false;
        await p.reset(); assert.deepEqual(p.state.confirms, [catalogs[locale].spacesResetConfirm.message]);
        assert.deepEqual(p.messages(), []); assert.deepEqual(p.f.raw, before); assert.equal(p.f.writes.length, 0); protectedDraft(p);
    });
    check(`${locale}: pending permission blocks general Save; denied resolution still saves the owned draft`, {locale}, async p => {
        const entered = deferred(), result = deferred(), before = clone(p.f.raw);
        p.state.request = () => { entered.resolve(); return result.promise; };
        p.field('privacy-online-favicons').checked = true; p.field('quote-text').value = 'Draft while pending';
        const pending = p.change(); await entered.promise; await p.save();
        assert.equal(last(p).text, catalogs[locale].settingsPermissionRequired.message);
        assert.equal(p.f.writes.length, 0); assert.deepEqual(p.f.raw, before); protectedDraft(p);
        result.resolve(false); await pending;
        assert.equal(p.f.raw.quote, 'Draft while pending'); assert.equal(p.f.raw.privacy.onlineFavicons, false);
        assert.equal(p.messages().filter(item => item.text === word(locale, 'settingsFaviconPermissionDenied')).length, 1);
        assert.deepEqual(p.state.permissionCalls, [['request', origins]]);
    });
    check(`${locale}: a newer off-change owns checkbox and save; an old denied result is silent`, {locale}, async p => {
        const entered = deferred(), result = deferred(); p.state.request = () => { entered.resolve(); return result.promise; };
        const checkbox = p.field('privacy-online-favicons'); checkbox.checked = true;
        const pending = p.change(); await entered.promise; checkbox.checked = false; p.field('quote-text').value = 'Newer change';
        await p.change(); const before = clone(p.f.raw), messages = clone(p.messages()), writes = p.f.writes.length;
        result.resolve(false); await pending;
        assert.deepEqual(p.messages(), messages); assert.deepEqual(p.f.raw, before); assert.equal(p.f.writes.length, writes);
        assert.equal(checkbox.checked, false); assert.deepEqual(p.state.permissionCalls, [['request', origins]]);
    });
    check(`${locale}: reset failure fences a late permission result without canceling draft protection`, {locale}, async p => {
        const entered = deferred(), result = deferred(); p.state.request = () => { entered.resolve(); return result.promise; };
        p.field('privacy-online-favicons').checked = true; p.field('quote-text').value = 'Retained draft';
        const pending = p.change(); await entered.promise;
        p.f.hooks.set = () => { throw new Error('Synthetic write failure'); }; await p.reset(); p.f.hooks.set = null;
        const before = clone(p.f.raw), messages = clone(p.messages()), writes = p.f.writes.length;
        result.resolve(false); await pending;
        assert.deepEqual(p.messages(), messages); assert.deepEqual(p.f.raw, before); assert.equal(p.f.writes.length, writes);
        assert.equal(p.field('privacy-online-favicons').checked, true); assert.equal(p.field('quote-text').value, 'Retained draft'); protectedDraft(p);
    });
    check(`${locale}: synthetic granted request still checks contains before saving`, {locale}, async p => {
        p.state.permission = true; p.field('privacy-online-favicons').checked = true; p.state.trace = []; await p.change();
        assert.deepEqual(p.state.permissionCalls, [['request', origins], ['contains', origins]]);
        assert.deepEqual(p.state.trace, ['request', 'permission-result:true', 'message:info', 'contains', 'storage:set', 'message:success']);
        assert.equal(p.f.raw.privacy.onlineFavicons, true); assert.equal(p.field('privacy-online-favicons').checked, true);
        assert(!p.messages().some(item => item.type === 'error'));
    });
}

for (const locale of ['en', 'zh_CN']) for (const id of ['default', 'second']) for (const draft of [false, true]) {
    test(`${locale}/${id}/${draft ? 'draft' : 'clean'}: reset stays workspace-scoped and protects personal, shared and import evidence`, {timeout: 8000}, async () => {
        const f = fixture(initial());
        await withGlobals(f, async () => {
            const {manager, session: original} = await boot(f);
            const second = await manager.create('Synthetic sibling'); const session = id === 'default' ? original : manager.capture(second.id); await session.ready();
            const sibling = id === 'default' ? manager.capture(second.id) : original; await sibling.ready();
            await session.local.set({quote: 'Reset synthetic workspace', clock: {hour12: true, showSeconds: false, worldClocks: [{timeZone: 'UTC', label: 'Synthetic clock'}]},
                ...personal()});
            f.raw.privacy = {onlineFavicons: false}; f.raw.sync = {...f.raw.sync, lastSync: 'Synthetic retained provider marker'};
            const storage = storageFor(f, session), p = await page(f, {locale, storage});
            const beforeSibling = clone(values(f, sibling.id)), savedPersonal = await session.local.get(Workspaces.PERSONAL_KEYS);
            const globals = Object.fromEntries([...Workspaces.GLOBAL_KEYS, '__localItabImportClosureV1'].map(key => [key, clone(f.raw[key])]));
            const writes = f.writes.length; p.field('world-clock-zone').value = 'Europe/Paris'; p.field('world-clock-label').value = 'Discard reset config draft';
            p.field('quote-text').value = 'Discard reset quote';
            if (draft) p.context.localScratchpadSettingsView = {hasUncommittedWork: () => true, controller: {pending: false}};
            await p.reset();
            assert.deepEqual(p.state.confirms, [catalogs[locale].spacesResetConfirm.message]);
            assert.deepEqual(p.messages(), [{text: word(locale, 'settingsResetting'), type: 'info', role: 'status'}]);
            assert.equal((await storage.getAll()).quote, storage.defaultConfig.quote); assert.equal(p.field('world-clock-zone').value, '');
            assert.equal(p.field('world-clock-label').value, ''); assert.equal(p.field('hour12-format').checked, storage.defaultConfig.clock.hour12);
            assert.equal(p.field('show-seconds').checked, storage.defaultConfig.clock.showSeconds);
            assert.equal(p.context.settingsHasUncommittedWork(), false);
            assert.deepEqual(values(f, sibling.id), beforeSibling); assert.deepEqual(await session.local.get(Workspaces.PERSONAL_KEYS), savedPersonal);
            for (const [key, value] of Object.entries(globals)) assert.deepEqual(f.raw[key], value, key);
            assert(f.writes.length > writes); assert.deepEqual(f.providers, []); assert.equal(p.state.reloads, draft ? 0 : 1);
            if (draft) { protectedDraft(p); assert.equal(p.field('local-content-reload-notice').getAttribute('role'), 'status'); }
        });
    });
}

test('both catalogs define exactly the five readable messages without raw-detail placeholders', () => {
    for (const locale of ['en', 'zh_CN']) for (const [key, value] of Object.entries(words[locale])) {
        assert.equal(catalogs[locale][key]?.message, value); assert.equal(catalogs[locale][key].placeholders, undefined);
    }
    assert(source.includes("console.error('Error resetting settings:', error);"));
    assert(source.includes("showMessage(`${t('settingsResetErrorPrefix', 'Error resetting settings:')} ${error.message}`, 'error')"));
});

for (const missingKey of Object.keys(words.en)) {
    const initError = missingKey === 'settingsLoadFailed' ? error('Synthetic failed read') : undefined;
    check(`one absent ${missingKey} uses English without discarding other Chinese messages`, {locale: 'zh_CN', missingKey, initError}, async p => {
        if (initError) assert.equal(last(p).text, words.en.settingsLoadFailed);
        else if (missingKey === 'settingsFaviconPermissionDenied') {
            p.field('privacy-online-favicons').checked = true; await p.change();
            assert.equal(p.messages()[0].text, words.en[missingKey]); assert.equal(last(p).text, catalogs.zh_CN.settingsSaved.message);
        } else {
            p.f.hooks.set = () => { throw new Error('Synthetic write failure'); }; await p.reset(); p.f.hooks.set = null;
            const expected = key => (key === missingKey ? words.en : words.zh_CN)[key];
            assert.equal(p.messages()[0].text, expected('settingsResetting'));
            assert.equal(last(p).text, expected('settingsResetErrorPrefix') + ' ' + expected('settingsResetFailed'));
        }
    });
}
for (const locale of ['en', 'zh_CN']) {
    check(`${locale}: ordinary initialization read failure retains the baseline guard and cannot claim a successful Save`, {locale, initError: new Error('Synthetic ordinary read failure')}, async p => {
        assert.deepEqual(p.messages(), []); assert.equal(vm.runInContext('settingsBaseline', p.context), null);
        const before = clone(p.f.raw); p.field('quote-text').value = 'Draft after unavailable read'; await p.save();
        assert.equal(last(p).text, catalogs[locale].settingsBaselineUnavailable.message);
        assert(!p.messages().some(item => item.type === 'success')); assert.equal(p.f.writes.length, 0); assert.deepEqual(p.f.raw, before);
    });
    check(`${locale}: rejected stub permission request follows the same rollback and subsequent save`, {locale}, async p => {
        p.state.request = () => { throw new Error('Synthetic request failure'); };
        p.field('privacy-online-favicons').checked = true; p.field('quote-text').value = 'Kept ordinary edit'; await p.change();
        assert.equal(p.messages()[0].text, word(locale, 'settingsFaviconPermissionDenied'));
        assert.equal(p.field('privacy-online-favicons').checked, false); assert.equal(p.f.raw.privacy.onlineFavicons, false);
        assert.equal(p.f.raw.quote, 'Kept ordinary edit'); assert.deepEqual(p.state.permissionCalls, [['request', origins]]);
    });
    check(`${locale}: a stub grant cannot bypass the existing contains check before Save`, {locale}, async p => {
        p.state.request = async () => true; p.state.permission = false;
        p.field('privacy-online-favicons').checked = true; p.field('quote-text').value = 'Guarded draft';
        const before = clone(p.f.raw); await p.change();
        assert.deepEqual(p.state.permissionCalls, [['request', origins], ['contains', origins]]);
        assert.equal(last(p).text, catalogs[locale].settingsPermissionRequired.message); assert.equal(p.f.writes.length, 0);
        assert.deepEqual(p.f.raw, before); assert.equal(p.field('privacy-online-favicons').checked, true); protectedDraft(p);
    });
    check(`${locale}: acknowledged fence followed by write failure keeps old content and the existing ambiguous-failure meaning`, {locale}, async p => {
        const before = clone(p.f.raw); p.field('quote-text').value = 'Unsaved retained draft';
        p.f.hooks.set = (written, raw, apply) => { apply(written); throw new Error('Synthetic acknowledgment lost'); };
        await p.reset(); p.f.hooks.set = null;
        assert.equal(last(p).text, word(locale, 'settingsResetErrorPrefix') + ' ' + word(locale, 'settingsResetFailed'));
        assert.equal(p.f.writes.length, 1); assert(p.f.raw[p.storage.settingsGenerationKey]); assert(p.f.raw[p.storage.layoutGenerationKey]);
        for (const [key, value] of Object.entries(before)) assert.deepEqual(p.f.raw[key], value, key);
        assert(!p.messages().some(item => item.type === 'success')); protectedDraft(p);
    });
    test(`${locale}: initial stored opt-in checks contains without requesting and keeps the missing-permission warning`, {timeout: 8000}, async () => {
        const f = fixture(initial()); f.raw.privacy.onlineFavicons = true;
        await withGlobals(f, async () => {
            const before = clone(f.raw), p = await page(f, {locale});
            assert.deepEqual(p.state.permissionCalls, [['contains', origins]]);
            assert.equal(p.field('privacy-online-favicons').checked, true);
            assert.equal(p.field('privacy-online-favicons').dataset.permissionMissing, 'true');
            assert.equal(p.field('privacy-online-favicons').title, catalogs[locale].onlineFaviconsPermissionMissing.message);
            assert.deepEqual(f.raw, before); assert.equal(f.writes.length, 0); assert.deepEqual(f.providers, []);
        });
    });
}
