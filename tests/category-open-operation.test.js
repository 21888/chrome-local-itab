const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

// Execute the actual page function and URL normalizer with deterministic timers.
// This verifies opening attempts, not Chromium popup permission or successful tabs.
function mount(links = makeLinks(), categories = [{ id: 'work', name: 'Work' }]) {
    const pending = new Map(), scheduled = [], cleared = [], opens = [], messages = [], notices = [], logs = [];
    let nextId = 0, scheduleCount = 0, failAt = Infinity, confirms = 0;
    let decision = () => true, opener = () => ({ closed: false });
    const window = {
        shortcutsComponentInstance: { links, categories },
        open(...args) { opens.push(args); return opener(...args); }
    };
    const context = vm.createContext({
        window, document: { addEventListener() {} }, URL,
        console: Object.fromEntries(['log', 'warn', 'error'].map(method => [method, (...args) => logs.push(args)])),
        confirm(message) { confirms++; messages.push(message); return decision(message); },
        setTimeout(callback, delay) {
            if (++scheduleCount === failAt) throw new Error('timer scheduling failed');
            assert.equal(delay, 120);
            const id = ++nextId;
            pending.set(id, callback); scheduled.push({ id, callback });
            return id;
        },
        clearTimeout(id) { cleared.push(id); pending.delete(id); }
    });
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8'), context);
    context.showErrorMessage = message => notices.push(message);
    const step = () => {
        const [id, callback] = pending.entries().next().value;
        pending.delete(id); callback();
    };
    return { window, context, pending, scheduled, cleared, opens, messages, notices, logs,
        run: category => context.openAllInCategory(category),
        step, drain() { while (pending.size) step(); },
        decide(fn) { decision = fn; }, openWith(fn) { opener = fn; },
        failOn(n) { failAt = n; }, get confirms() { return confirms; },
        get scheduleCount() { return scheduleCount; } };
}
function makeLinks(count = 12, category = 'work') {
    return Array.from({ length: count }, (_, i) => ({ url: `https://example.test/${category}/${i}`, category }));
}

test('one page-owned batch suppresses same and different categories while retaining five slots and later retry', async () => {
    const links = [...makeLinks(), ...makeLinks(3, 'personal')], h = mount(links);
    const first = h.run('work');
    assert.equal(h.pending.size, 5);
    const overlaps = [h.run('work'), h.run('personal'), h.run('all')];
    assert.equal(h.confirms, 1); assert.equal(h.pending.size, 5);
    await Promise.all(overlaps);
    h.step(); assert.equal(h.pending.size, 5);
    await h.run('personal'); assert.equal(h.confirms, 1);
    while (h.pending.size) { assert(h.pending.size <= 5); h.step(); }
    await first;
    assert.deepEqual(h.opens, links.slice(0, 12).map(link => [link.url, '_blank']));
    const second = h.run('personal'); h.drain(); await second;
    assert.equal(h.confirms, 2); assert.equal(h.opens.length, 15);
});

test('ownership begins before confirm, including canceled and accepted reentrant confirmations', async () => {
    for (const accepted of [false, true]) {
        const h = mount(); let reentrant;
        let entered = false;
        h.decide(() => {
            if (!entered) { entered = true; reentrant = h.run('all'); }
            return accepted;
        });
        const first = h.run('work');
        await reentrant;
        assert.equal(h.confirms, 1); assert.equal(h.pending.size, accepted ? 5 : 0);
        h.drain(); await first;
        assert.equal(h.opens.length, accepted ? 12 : 0);
        h.decide(() => true);
        const retry = h.run('work'); h.drain(); await retry;
        assert.equal(h.confirms, 2); assert.equal(h.opens.length, accepted ? 24 : 12);
    }
});

test('missing, empty, filtered-empty and invalid links release ownership; URL safety is unchanged', async () => {
    for (const links of [[], [{ url: '' }, { url: 'javascript:alert(1)' }, { url: 'file:///tmp/a' }, null]]) {
        const h = mount(links);
        await h.run('all');
        assert.equal(h.pending.size, 0);
        h.window.shortcutsComponentInstance.links = [{ url: 'example.test', category: 'work' }];
        const retry = h.run('work'); h.drain(); await retry;
        assert.deepEqual(h.opens, [['https://example.test/', '_blank']]);
    }
    const h = mount(makeLinks(2, 'personal'));
    await h.run('work'); assert.equal(h.confirms, 0);
    delete h.window.shortcutsComponentInstance;
    await h.run('all');
    h.window.shortcutsComponentInstance = { links: makeLinks(1) };
    const retry = h.run('work'); h.drain(); await retry;
    assert.equal(h.opens.length, 1);
});

test('confirmation/data exceptions release ownership and thrown openers do not strand a batch', async () => {
    const h = mount();
    h.decide(() => { throw new Error('confirmation failed'); });
    await assert.rejects(h.run('all'), /confirmation failed/);
    h.decide(() => true);
    Object.defineProperty(h.window.shortcutsComponentInstance, 'links', { configurable: true, get() { throw new Error('data unavailable'); } });
    await assert.rejects(h.run('work'), /data unavailable/);
    Object.defineProperty(h.window.shortcutsComponentInstance, 'links', { configurable: true, writable: true, value: [] });
    h.window.shortcutsComponentInstance.links = makeLinks();
    h.openWith(() => { throw new Error('opener failed'); });
    const first = h.run('work'); h.drain(); await first;
    assert.equal(h.opens.length, 12);
    h.openWith(() => null);
    const retry = h.run('work'); h.drain(); await retry;
    assert.equal(h.opens.length, 24);
});

test('initial and refill scheduling failures cancel old callbacks before a later batch', async () => {
    for (const failure of [3, 6]) {
        const h = mount(); h.failOn(failure);
        const first = h.run('work');
        const rejection = assert.rejects(first, /timer scheduling failed/);
        if (failure === 6) h.step();
        const stale = h.scheduled.map(timer => timer.callback);
        // Even before rejection cleanup runs, invalidated callbacks cannot open.
        const attempts = h.opens.length;
        stale.forEach(callback => callback());
        assert.equal(h.opens.length, attempts);
        await rejection;
        assert.equal(h.pending.size, 0); assert(h.cleared.length > 0);
        h.failOn(Infinity);
        const retry = h.run('personal'); await retry; // empty selection also releases
        const second = h.run('work');
        stale.forEach(callback => callback());
        await h.run('all'); assert.equal(h.confirms, 2, 'stale callbacks cannot release a new owner');
        h.drain(); await second;
        assert.equal(h.opens.length, attempts + 12);
    }
});


test('confirmation counts only normalized HTTP(S) destinations and names the selected category', async () => {
    const links = [
        { url: ' https://example.test/valid ', category: 'work' },
        { url: 'example.test/default' },
        { url: 'http://example.test/plain', category: 'work' },
        { url: 'javascript:alert(1)', category: 'work' },
        { url: 'file:///private/site', category: 'work' },
        { url: 'mailto:private@example.test', category: 'work' },
        { url: 'https://', category: 'work' },
        { url: '', category: 'work' }, {}, null,
        { url: 'https://example.test/excluded', category: 'personal' }
    ];
    const h = mount(links, [{ id: 'work', name: 'Research & tools' }]);
    const pending = h.run('work');
    assert.deepEqual(h.messages, ['Open 3 new tabs for “Research & tools”?']);
    h.drain(); await pending;
    assert.deepEqual(h.opens, ['https://example.test/valid', 'https://example.test/default', 'http://example.test/plain'].map(url => [url, '_blank']));
    assert.deepEqual(h.notices, []); assert.deepEqual(h.logs, []);
});

test('confirmed destinations and category label remain fixed if saved arrays change during confirmation', async () => {
    const links = makeLinks(2), categories = [{ id: 'work', name: 'Original label' }];
    const h = mount(links, categories);
    h.decide(message => {
        assert.equal(message, 'Open 2 new tabs for “Original label”?');
        links[0].url = 'https://example.test/edited';
        links[1].category = 'personal';
        links.splice(0, 2, ...makeLinks(20));
        categories[0].name = 'Changed label';
        h.window.shortcutsComponentInstance.links = makeLinks(30);
        return true;
    });
    const pending = h.run('work'); h.drain(); await pending;
    assert.deepEqual(h.opens, makeLinks(2).map(link => [link.url, '_blank']));
    assert.equal(h.scheduleCount, 2); assert.equal(h.confirms, 1);
});

test('cancel does not schedule, open or show result feedback and a later deliberate request works', async () => {
    const h = mount(makeLinks(1)); h.decide(() => false);
    await h.run('work');
    assert.deepEqual(h.messages, ['Open 1 new tab for “Work”?']);
    assert.equal(h.scheduleCount, 0); assert.deepEqual(h.opens, []); assert.deepEqual(h.notices, []);
    h.decide(() => true);
    const retry = h.run('work'); h.drain(); await retry;
    assert.equal(h.opens.length, 1); assert.equal(h.confirms, 2);
});

test('empty, invalid and missing URL lists explain the problem without asking to open zero tabs', async () => {
    for (const links of [[], null, {}, [{ url: 'data:text/plain,private' }, { url: '   ' }, {}, null], makeLinks(1, 'personal')]) {
        const h = mount(links);
        await h.run('work');
        assert.equal(h.confirms, 0); assert.equal(h.scheduleCount, 0); assert.deepEqual(h.opens, []);
        assert.deepEqual(h.notices, ['No valid web addresses in “Work”. Check the saved addresses before trying again.']);
        assert.deepEqual(h.logs, []);
        h.window.shortcutsComponentInstance.links = makeLinks(1);
        const retry = h.run('work'); h.drain(); await retry;
        assert.equal(h.opens.length, 1);
    }
});

test('All and absent category labels have readable fallbacks without exposing opaque IDs', async () => {
    for (const categories of [undefined, null, [], {}, [null], [{ id: 'work', name: '  ' }], [{ id: 'work', name: {} }]]) {
        const h = mount(makeLinks(1), []); h.window.shortcutsComponentInstance.categories = categories;
        h.decide(() => false); await h.run('work');
        assert.equal(h.messages[0], 'Open 1 new tab for “this category”?');
    }
    for (const category of ['all', undefined, '']) {
        const h = mount(makeLinks(1)); h.decide(() => false); await h.run(category);
        assert.equal(h.messages[0], 'Open 1 new tab for “All shortcuts”?');
    }
});

test('English and Chinese catalogs interpolate exact counts and labels with graceful translation fallback', async () => {
    for (const locale of ['en', 'zh_CN']) {
        const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        const h = mount(makeLinks(2), [{ id: 'work', name: '工作 & Research' }]);
        const keys = [];
        h.window.i18n = { t(key, substitutions = []) {
            keys.push(key);
            return (catalog[key]?.message || key).replace(/\$(\d+)/g, (_, n) => substitutions[Number(n) - 1]);
        } };
        h.openWith(() => null);
        const pending = h.run('work'); h.drain(); await pending;
        assert.deepEqual(keys, ['categoryOpenConfirmMany', 'categoryOpenUnknown']);
        assert.ok(h.messages[0].includes('2')); assert.ok(h.messages[0].includes('工作 & Research'));
        assert.ok(!h.messages[0].includes('$')); assert.ok(!h.notices[0].includes('$'));
        assert.equal(h.notices[0], locale === 'en'
            ? 'Opening could not be confirmed for 2 of 2 tabs. Check your tabs and pop-up settings, then open missing sites individually.'
            : '2 个标签页中有 2 个无法确认是否已打开。请检查现有标签页和弹出式窗口设置，再逐个打开缺少的网站。');
        const expectedKeys = ['categoryOpenUnnamed', 'categoryOpenNoUrls', 'categoryOpenConfirmOne', 'categoryOpenConfirmMany', 'categoryOpenMixed', 'categoryOpenFailed', 'categoryOpenUnknown'];
        for (const key of expectedKeys) assert.equal(typeof catalog[key]?.message, 'string', `${locale} has ${key}`);
    }
    for (const t of [key => key, () => '', () => null, () => 42, () => { throw new Error('translation unavailable'); }]) {
        const h = mount(makeLinks(1)); h.window.i18n = { t }; h.decide(() => false);
        await h.run('work'); assert.equal(h.messages[0], 'Open 1 new tab for “Work”?');
    }
});

test('null, closed and unreadable handles are unconfirmed; thrown opening gets distinct actionable feedback', async () => {
    for (const mode of ['open', 'null', 'undefined', 'closed', 'missing-closed', 'getter', 'throw']) {
        const h = mount(makeLinks(2));
        h.openWith(() => {
            if (mode === 'throw') throw new Error('private URL https://example.test/secret');
            if (mode === 'null') return null;
            if (mode === 'undefined') return undefined;
            if (mode === 'missing-closed') return {};
            if (mode === 'getter') return { get closed() { throw new Error('private URL https://example.test/secret'); } };
            return { closed: mode === 'closed' };
        });
        const pending = h.run('work'); h.drain(); await pending;
        assert.equal(h.opens.length, 2); assert.equal(h.scheduleCount, 2); assert.equal(h.pending.size, 0);
        if (mode === 'open') assert.deepEqual(h.notices, []);
        else {
            assert.equal(h.notices.length, 1);
            assert.match(h.notices[0], mode === 'throw' ? /^Could not open 2 of 2 tabs/ : /^Opening could not be confirmed for 2 of 2 tabs/);
            assert.match(h.notices[0], /Check your tabs and pop-up settings, then open missing sites individually/);
            assert.doesNotMatch(h.notices[0], /loaded|blocked|secret|https:/i);
        }
        assert.deepEqual(h.logs, []);
        // Completion never queues a retry, but ownership is released for a deliberate action.
        const retry = h.run('work'); h.drain(); await retry;
        assert.equal(h.opens.length, 4); assert.equal(h.confirms, 2);
    }
});

test('mixed outcomes are counted once after the complete batch without exposing URLs or exception text', async () => {
    const h = mount(makeLinks(12)); let calls = 0;
    h.openWith(() => {
        calls++;
        if (calls % 3 === 0) throw new Error('https://private.example.test/token?private=1');
        return calls % 3 === 1 ? { closed: false } : null;
    });
    const pending = h.run('work');
    while (h.pending.size) {
        assert(h.pending.size <= 5);
        assert.deepEqual(h.notices, [], 'feedback waits for the whole batch');
        h.step();
    }
    await pending;
    assert.deepEqual(h.notices, ['Of 12 requested tabs, 4 could not open and 4 could not be confirmed. Check your tabs and pop-up settings, then open missing sites individually.']);
    assert.equal(h.opens.length, 12); assert.equal(h.scheduleCount, 12); assert.deepEqual(h.logs, []);
    assert.doesNotMatch(JSON.stringify(h.notices), /https:|private|loaded|blocked/i);
});

test('category labels stay plain text in confirmation and in the actual existing notification', async () => {
    const label = '<img src=x onerror=alert(1)> & $2';
    const h = mount(makeLinks(1), [{ id: 'work', name: label }]);
    h.decide(() => false); await h.run('work');
    assert.equal(h.messages[0], `Open 1 new tab for “${label}”?`);
    const elements = [], timers = [];
    h.context.document = {
        addEventListener() {},
        createElement(tag) {
            assert.equal(tag, 'div');
            const element = { style: {}, set innerHTML(_) { throw new Error('HTML must not be used'); } };
            elements.push(element); return element;
        },
        body: { appendChild(element) { element.parentNode = this; }, removeChild(element) { element.parentNode = null; } }
    };
    h.context.setTimeout = (callback, delay) => { assert.equal(delay, 5000); timers.push(callback); };
    const source = fs.readFileSync('newtab.js', 'utf8');
    vm.runInContext(source.slice(source.indexOf('function showErrorMessage('), source.indexOf('// 分类导航功能')), h.context);
    h.window.shortcutsComponentInstance.links = [];
    await h.run('work');
    assert.equal(h.confirms, 1);
    assert.equal(elements[0].textContent, `No valid web addresses in “${label}”. Check the saved addresses before trying again.`);
    assert.equal(elements.length, 1); assert.equal(timers.length, 1);
    timers[0](); assert.equal(elements[0].parentNode, null);
});
