const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const {createDocument, deferred} = require('./helpers/task-dom-model');

// Actual DOMContentLoaded, i18n catalogs, row/Add handlers, save queue and
// StorageManager over RAM Chrome storage and serialized Web Locks. DOM/events,
// prompt/confirm, timers and Sync scheduling are models, not native Chrome QA.
const html = fs.readFileSync('options.html', 'utf8');
const catalogs = Object.fromEntries(['en', 'zh_CN'].map(locale =>
    [locale, JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'))]));
const clone = value => JSON.parse(JSON.stringify(value));
const groups = ['baidu', 'weibo', 'zhihu'];
const rawTitle = 'Saved $& $1 $$ $` $\'\n<b>原文</b>';
const newTitle = 'Edited $& $1 $$ $` $\'\n<img src=x onerror=alert(1)> 中文';
const words = {
    en: {added: 'Topic added.', title: 'Edit topic title:', score: 'Edit topic score:', updated: 'Topic updated.',
        confirm: 'Are you sure you want to delete this topic?', deleted: 'Topic deleted.'},
    zh_CN: {added: '热榜条目已添加。', title: '编辑热榜标题：', score: '编辑热榜分数：', updated: '热榜条目已更新。',
        confirm: '确定要删除这条热榜条目吗？', deleted: '热榜条目已删除。'}
};
const keys = {settingsTopicAdded: 'added', settingsTopicEditTitle: 'title', settingsTopicEditScore: 'score',
    settingsTopicUpdated: 'updated', settingsTopicDeleteConfirm: 'confirm', settingsTopicDeleted: 'deleted'};
const bounded = (name, fn) => test(name, {timeout: 8000}, fn);
const last = p => p.messages().at(-1);

async function page({locale = 'en', api = 'normal', missingKey, sync = false} = {}) {
    const document = createDocument(), queues = new Map(), timers = new Map(), events = new Map();
    const state = {stored: {}, writes: [], prompts: [], answers: [], confirms: [], allowDelete: true, error: null,
        gate: null, trace: [], errors: [], reloads: 0};
    let timerId = 0;
    document.body.prepend = (...nodes) => document.body.append(...nodes);
    const field = id => document.getElementById(id);
    for (const id of ['quote-text', 'hour12-format', 'show-seconds', 'bg-type', 'bg-color', 'bg-color-text',
        'movie-title', 'movie-note', 'hot-topics-tab', 'show-clock', 'show-search', 'show-shortcuts', 'show-weather', 'show-hot', 'show-movie']) {
        const node = document.createElement('input'); node.id = id; document.body.append(node);
    }
    for (const [id, tag] of [['toast-container', 'div'], ['category-manage-list', 'ul'], ['add-category', 'button']]) {
        const node = document.createElement(tag); node.id = id; document.body.append(node);
    }
    // Materialize the real three manual-list HTML sections, retaining actual
    // IDs, classes, field types, localization attributes and Add buttons.
    for (const group of groups) {
        const fragment = html.match(new RegExp(`<div class="topic-list" id="${group}-topics"[\\s\\S]*?<\\/button>\\s*<\\/div>`))?.[0];
        assert(fragment, `${group}: actual manual topic section`);
        const stack = [document.body];
        for (const token of fragment.matchAll(/<\/(\w+)\s*>|<(\w+)\b([^>]*)>|([^<]+)/g)) {
            if (token[1]) { stack.pop(); continue; }
            if (token[2]) {
                const node = document.createElement(token[2]);
                for (const [, name, value] of token[3].matchAll(/([\w-]+)="([^"]*)"/g)) {
                    node.setAttribute(name, value);
                    if (['id', 'type', 'class'].includes(name)) node[name === 'class' ? 'className' : name] = value;
                    if (name.startsWith('data-')) node.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
                }
                stack.at(-1).append(node);
                if (token[2] !== 'input') stack.push(node);
            } else if (token[4].trim()) stack.at(-1).textContent = token[4];
        }
    }
    const chrome = {storage: {local: {
        async get(keys) { return clone(keys === null ? state.stored : Object.fromEntries(keys.filter(key => key in state.stored).map(key => [key, state.stored[key]]))); },
        async set(values) {
            if (state.gate) { const gate = state.gate; state.gate = null; gate.entered.resolve(); await gate.resume.promise; }
            if (state.error && !state.error.afterCommit) throw state.error;
            state.writes.push(clone(values)); Object.assign(state.stored, clone(values)); state.trace.push('local-write');
            if (state.error) throw state.error;
        },
        async getBytesInUse() { return JSON.stringify(state.stored).length; }
    }}, i18n: {
        getMessage(key) {
            if (api === 'throw') throw new Error('Synthetic catalog unavailable');
            if (api === 'missing' || key === missingKey) return '';
            if (api === 'key') return key;
            return (catalogs[locale] || catalogs.en)[key]?.message || '';
        }, getUILanguage: () => locale === 'zh_CN' ? 'en-US' : 'zh-CN'
    }};
    if (api === 'absent') delete chrome.i18n;
    if (sync) chrome.storage.sync = {async getBytesInUse() { return 0; }};
    const context = vm.createContext({document, chrome, URL, crypto: require('node:crypto').webcrypto,
        console: {log() {}, warn() {}, error(...values) { state.errors.push(values.map(value => value?.stack || String(value)).join(' ')); }},
        navigator: {locks: {request(name, operation) { const result = (queues.get(name) || Promise.resolve()).then(operation); queues.set(name, result.catch(() => {})); return result; }}},
        prompt(text, value) { state.prompts.push([text, value]); assert(state.answers.length, 'unexpected prompt'); return state.answers.shift(); },
        confirm(text) { state.confirms.push(text); return state.allowDelete; },
        setTimeout(fn, delay) { timers.set(++timerId, {fn, delay}); if (delay === 900) state.trace.push('sync-scheduled'); return timerId; },
        clearTimeout(id) { timers.delete(id); }, addEventListener(type, fn) { events.set(type, fn); },
        location: {reload() { state.reloads++; }}
    });
    context.window = context;
    for (const path of ['shared/layout-identity.js', 'shared/world-clocks.js', 'shared/stored-shortcut-url.js',
        'shared/dashboard-template-registry.js', 'shared/configuration-codec.js', 'storage.js']) vm.runInContext(fs.readFileSync(path, 'utf8'), context);
    Object.assign(state.stored, clone(context.storageManager.cloneDefaultConfig()), {
        hot: {tab: 'weibo', ...Object.fromEntries(groups.map((group, index) => [group, [{t: rawTitle + group, s: 100 + index}]]))},
        quote: 'Saved quotation 中文', categories: [{id: 'synthetic', name: 'Saved category 中文', icon: '★'}],
        links: [{title: 'Synthetic', url: 'https://example.com', category: 'synthetic', icon: '🌐'}],
        __localItabPersonalTasksV1: {synthetic: 'private sentinel'}, __localItabRestoreRecovery: {synthetic: 'recovery sentinel'}
    });
    state.stored.sync.enabled = sync; context.storageManager._syncInitialized = true;
    if (api !== 'no-helper') vm.runInContext(fs.readFileSync('i18n.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('options.js', 'utf8'), context);
    await document.listeners.get('DOMContentLoaded')();
    vm.runInContext(fs.readFileSync('shared/local-content-lifecycle.js', 'utf8'), context);
    const messages = () => field('toast-container').children.map(node => ({text: node.textContent,
        type: [...node._classes].find(value => value.startsWith('message-')).slice(8), role: node.getAttribute('role')}));
    const settle = async () => { await vm.runInContext('settingsSaveQueue', context); await Promise.resolve(); };
    const section = group => field(`${group}-topics`);
    const title = group => section(group).querySelector('.topic-title-input');
    const score = group => section(group).querySelector('.topic-score-input');
    const row = (group, index = 0) => field(`${group}-list`).children[index];
    assert.deepEqual(messages(), [], 'actual initialization: ' + state.errors.join('\n'));
    assert(vm.runInContext('settingsBaseline && settingsFormBaseline', context));
    assert.equal(state.writes.length, 0, 'opening Settings does not translate or rewrite saved data');
    assert.equal(context.settingsHasUncommittedWork(), false, 'initial actual form is clean: ' + vm.runInContext('JSON.stringify({dirty:settingsDirtyPaths(collectFormData(false)), background:backgroundFormSnapshot() !== backgroundFormBaseline, bookmark:bookmarkCategoryFormClean()})', context));
    return {state, context, document, field, messages, settle, section, title, score, row,
        topics: group => clone(context.collectHotTopicsFromList(group)),
        add(group, value = newTitle, number = '23.7tail') { title(group).value = value; score(group).value = number; section(group).querySelector('.add-topic-btn').dispatch('click'); return settle(); },
        edit(group, answers = [newTitle, '23.7tail'], index = 0) { state.answers.push(...answers); row(group, index).querySelector('.edit-topic-btn').dispatch('click'); return settle(); },
        remove(group, index = 0) { row(group, index).querySelector('.delete-topic-btn').dispatch('click'); return settle(); },
        pause() { state.gate = {entered: deferred(), resume: deferred()}; return state.gate; },
        beforeunload() { const event = {prevented: false, preventDefault() { this.prevented = true; }}; events.get('beforeunload')(event); return event; }};
}

function untouched(p, before, group) {
    const actual = clone(p.state.stored); actual.hot[group] = before.hot[group]; assert.deepEqual(actual, before);
    for (const write of p.state.writes) assert.deepEqual(Object.keys(write), ['hot'], 'topic helper only writes hot configuration');
}
function protectedDraft(p) {
    assert(p.context.settingsHasUncommittedWork()); assert(p.context.LocalItabContentLifecycle.hasUncommittedWork());
    assert(p.beforeunload().prevented); assert.equal(p.context.LocalItabContentLifecycle.reload(), false); assert.equal(p.state.reloads, 0);
}
async function successFlow(p, group, expected) {
    const before = clone(p.state.stored), original = before.hot[group][0];
    assert.equal(p.section(group).querySelector('.topic-list-header').textContent, {baidu: 'Baidu', weibo: 'Weibo', zhihu: 'Zhihu'}[group]);
    assert.equal(p.row(group).querySelector('.topic-title').textContent, original.t);
    await p.add(group, '  ' + newTitle + '  ');
    assert.deepEqual(last(p), {text: expected.added, type: 'success', role: 'status'});
    assert.deepEqual(p.state.stored.hot[group], [original, {t: newTitle, s: 23}]);
    assert.equal(p.title(group).value, ''); assert.equal(p.score(group).value, '');
    await p.edit(group, ['  ' + newTitle + '  ', '-7.9suffix']);
    assert.deepEqual(p.state.prompts, [[expected.title, original.t], [expected.score, original.s]], 'raw title and numeric defaults stay separate from localized messages');
    assert.deepEqual(last(p), {text: expected.updated, type: 'success', role: 'status'});
    assert.deepEqual(p.state.stored.hot[group], [{t: newTitle, s: -7}, {t: newTitle, s: 23}]);
    assert.equal(p.document.querySelectorAll('b, img').length, 0, 'titles remain literal text');
    await p.remove(group);
    assert.deepEqual(p.state.confirms, [expected.confirm]); assert.deepEqual(last(p), {text: expected.deleted, type: 'success', role: 'status'});
    assert.deepEqual(p.state.stored.hot[group], [{t: newTitle, s: 23}]); assert.equal(p.state.writes.length, 3);
    untouched(p, before, group); assert.equal(p.context.settingsHasUncommittedWork(), false);
}

for (const locale of ['en', 'zh_CN', 'fr-FR']) for (const group of groups) {
    bounded(`${locale}/${group}: actual Add/Edit/Delete localizes messages, retains literal titles and numeric defaults`, async () => {
        await successFlow(await page({locale}), group, words[locale] || words.en);
    });
}
for (const api of ['missing', 'throw', 'absent', 'key', 'no-helper']) bounded(`${api}: all six messages fall back to readable English`, async () => {
    await successFlow(await page({locale: 'zh_CN', api}), 'baidu', words.en);
});
for (const [key, word] of Object.entries(keys)) bounded(`missing ${key}: other Chinese messages stay translated`, async () => {
    await successFlow(await page({locale: 'zh_CN', missingKey: key}), 'weibo', {...words.zh_CN, [word]: words.en[word]});
});

for (const locale of ['en', 'zh_CN']) {
    bounded(`${locale}: cancelled/blank title and declined Delete neither write nor replace rows`, async () => {
        const p = await page({locale}), before = clone(p.state.stored), originalRow = p.row('baidu');
        for (const title of [null, '', ' \t\n ']) {
            await p.edit('baidu', [title]); assert.equal(p.state.prompts.at(-1)[0], words[locale].title);
            assert.equal(p.row('baidu'), originalRow); assert.deepEqual(p.state.stored, before);
        }
        assert.equal(p.state.prompts.length, 3, 'no score prompt after title cancellation/blank');
        p.state.allowDelete = false; await p.remove('baidu'); assert.deepEqual(p.state.confirms, [words[locale].confirm]);
        await p.add('baidu', ' \t ', '12'); assert.equal(last(p).text, catalogs[locale].topicTitleRequired.message);
        assert.equal(p.title('baidu').value, ' \t '); assert.equal(p.score('baidu').value, '12');
        assert.equal(p.state.writes.length, 0); assert.equal(p.row('baidu'), originalRow); assert.deepEqual(p.state.stored, before);
        assert(!p.messages().some(message => message.type === 'success')); protectedDraft(p);
    });
    bounded(`${locale}: cancelling/invalid score retains its number but still accepts title; parseInt semantics stay intact`, async () => {
        for (const [answer, expected] of [[null, 100], ['', 100], ['n/a', 100], ['0', 0], ['  -12.8tail', -12], ['0x10', 16]]) {
            const p = await page({locale}); await p.edit('baidu', [newTitle, answer]);
            assert.deepEqual(p.state.prompts, [[words[locale].title, rawTitle + 'baidu'], [words[locale].score, 100]]);
            assert.deepEqual(p.state.stored.hot.baidu, [{t: newTitle, s: expected}]);
            assert.equal(last(p).text, words[locale].updated); assert.equal(p.state.writes.length, 1);
        }
    });
    bounded(`${locale}: Add retains existing parseInt and zero fallback semantics`, async () => {
        const p = await page({locale});
        for (const [answer, expected] of [['', 0], ['n/a', 0], ['0', 0], ['  -12.8tail', -12], ['0x10', 16]]) {
            await p.add('zhihu', newTitle, answer);
            assert.deepEqual(p.state.stored.hot.zhihu.at(-1), {t: newTitle, s: expected});
            assert.equal(last(p).text, words[locale].added);
        }
    });
    for (const operation of ['add', 'edit', 'remove']) for (const failure of ['false', 'reject', 'conflict']) {
        bounded(`${locale}/${operation}: real ${failure} preserves accepted draft and errors without success or Sync`, async () => {
            const p = await page({locale, sync: true}), detail = 'Exact $& $1 $$ $` $\'\n<img src=x> failure 中文';
            if (failure === 'false') p.state.error = new Error(detail);
            if (failure === 'reject') p.state.error = Object.assign(new Error(detail), {code: 'WORKSPACE_TEST_FAILURE'});
            if (failure === 'conflict') p.state.stored.hot.baidu = [{t: 'Another tab original', s: 99}];
            const before = clone(p.state.stored), baseline = vm.runInContext('JSON.stringify(settingsBaseline)', p.context);
            p.field('quote-text').value = 'Unrelated unsaved quote';
            await p[operation]('baidu');
            assert.deepEqual(last(p), {text: failure === 'false' ? catalogs[locale].failedToSave.message : failure === 'conflict' ? catalogs[locale].settingsSaveConflict.message : detail,
                type: 'error', role: 'alert'});
            const original = {t: rawTitle + 'baidu', s: 100};
            assert.deepEqual(p.topics('baidu'), operation === 'remove' ? [] : operation === 'edit' ? [{t: newTitle, s: 23}] : [original, {t: newTitle, s: 23}]);
            assert.deepEqual(p.state.stored, before); assert.equal(p.state.writes.length, 0);
            assert.equal(vm.runInContext('JSON.stringify(settingsBaseline)', p.context), baseline, 'failure never advances the CAS baseline');
            assert(!p.messages().some(message => message.type === 'success')); assert(!p.state.trace.includes('sync-scheduled'));
            assert.equal(p.document.querySelectorAll('img').length, 0); assert.equal(p.field('quote-text').value, 'Unrelated unsaved quote'); protectedDraft(p);
        });
    }
    bounded(`${locale}: detached Edit/Delete handlers cannot prompt or mutate replacement rows`, async () => {
        const p = await page({locale});
        for (const group of groups) {
            const old = p.row(group), edit = old.querySelector('.edit-topic-btn'), remove = old.querySelector('.delete-topic-btn');
            await p.add(group); const before = clone(p.state.stored), count = p.state.writes.length, messages = clone(p.messages());
            edit.dispatch('click'); remove.dispatch('click'); await p.settle();
            assert.equal(old.isConnected, false); assert.deepEqual(p.state.prompts, []); assert.deepEqual(p.state.confirms, []);
            assert.equal(p.state.writes.length, count); assert.deepEqual(p.state.stored, before); assert.deepEqual(p.messages(), messages);
        }
    });
    for (const failure of [false, true]) bounded(`${locale}: older ${failure ? 'failed' : 'successful'} save cannot clear newer inputs or unrelated drafts`, async () => {
        const p = await page({locale}), gate = p.pause(), pending = p.add('baidu', 'First accepted', '1');
        await gate.entered.promise; assert.deepEqual(p.messages(), []); protectedDraft(p);
        p.title('baidu').value = '  Newer unsubmitted $& 中文  '; p.score('baidu').value = '99';
        p.title('weibo').value = 'Other tab draft'; p.field('quote-text').value = 'New quote draft';
        if (failure) p.state.error = new Error('Synthetic storage unavailable');
        gate.resume.resolve(); await pending;
        assert.equal(last(p).text, failure ? catalogs[locale].failedToSave.message : words[locale].added);
        assert.equal(p.title('baidu').value, '  Newer unsubmitted $& 中文  '); assert.equal(p.score('baidu').value, '99');
        assert.equal(p.title('weibo').value, 'Other tab draft'); assert.equal(p.field('quote-text').value, 'New quote draft');
        assert.equal(p.state.writes.length, Number(!failure)); protectedDraft(p);
    });
    bounded(`${locale}: repeated accepted Adds queue their snapshots and schedule Sync only after each local commit`, async () => {
        const p = await page({locale, sync: true}), before = clone(p.state.stored), gate = p.pause();
        const first = p.add('baidu', 'First', '1'); await gate.entered.promise;
        const second = p.add('baidu', 'Second', '2'); assert.deepEqual(p.messages(), []); assert.deepEqual(p.state.trace, []); protectedDraft(p);
        gate.resume.resolve(); await Promise.all([first, second]);
        assert.deepEqual(p.state.stored.hot.baidu, [...before.hot.baidu, {t: 'First', s: 1}, {t: 'Second', s: 2}]);
        assert.deepEqual(p.messages().map(message => message.text), [words[locale].added, words[locale].added]);
        assert.deepEqual(p.state.trace, ['local-write', 'sync-scheduled', 'local-write', 'sync-scheduled']);
        untouched(p, before, 'baidu'); assert.equal(p.context.settingsHasUncommittedWork(), false);
    });
    bounded(`${locale}: uncertain post-write rejection keeps raw detail without claiming success`, async () => {
        const p = await page({locale}), detail = 'Written but unacknowledged $&\n<b>原文</b>';
        p.state.error = Object.assign(new Error(detail), {code: 'WORKSPACE_TEST_FAILURE', afterCommit: true});
        await p.edit('zhihu'); assert.equal(p.state.writes.length, 1); assert.equal(p.state.stored.hot.zhihu[0].t, newTitle);
        assert.deepEqual(last(p), {text: detail, type: 'error', role: 'alert'}); protectedDraft(p);
    });
}

bounded('both catalogs contain exactly the scoped wording without substitutions', () => {
    for (const [key, word] of Object.entries(keys)) for (const locale of ['en', 'zh_CN']) {
        assert.equal(catalogs[locale][key]?.message, words[locale][word], `${locale}/${key}`);
        assert.equal(catalogs[locale][key].placeholders, undefined, 'user content never enters translation substitution');
    }
});
