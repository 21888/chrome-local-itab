const test = require('node:test');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const { Controller, fold, PAGE_SIZE } = require('../shared/shortcut-finder');
const id = n => `l_${n.toString(16).padStart(32, '0')}`;
function fixture(links, categories = []) {
    let snapshot = { links, categories }; const opened = [];
    const controller = new Controller({ getSnapshot: () => snapshot, activate: link => opened.push(link) });
    return { controller, opened, replace: next => { snapshot = next; }, snapshot: () => snapshot };
}
test('literal title/address/category, Unicode, accents, case, duplicates and source ordering', () => {
    const links = [{ title: 'Café 中文😀 [literal]', url: 'https://example.com/a?q=hello', category: 'work', layoutId: id(1) },
        { title: 'Café 中文😀 [literal]', url: 'https://example.com/a?q=hello', category: 'learn', layoutId: id(2) }];
    const { controller } = fixture(links, [{ id: 'work', name: 'Équipe' }, { id: 'learn', name: '阅读' }]);
    for (const query of ['CAFÉ', 'cafe', 'CAFE\u0301', '中文', '😀', '[literal]', 'EXAMPLE.COM', '/a?q=hello']) assert.equal(controller.search(query).total, 2, query);
    assert.equal(controller.search('equipe').rows[0].category, 'Équipe');
    assert.equal(controller.search('阅读').rows[0].token.id, id(2));
    assert.deepEqual(controller.search('cafe').rows.map(row => row.token.id), [id(1), id(2)]);
    assert.equal(controller.search('.*').total, 0); assert.equal(controller.search('').total, 0);
    assert.equal(controller.search('  ').saved, 2); assert.equal(fold('한글😀'), '한글😀');
});
test('stable ID resolves reordered duplicate occurrence; edits/deletes/ambiguous IDs refuse', async () => {
    const a = { title: 'same', url: 'https://a.test', layoutId: id(1) };
    const b = { ...a, layoutId: id(2) }; const f = fixture([a, b]);
    const token = f.controller.search('same').rows[1].token;
    f.replace({ links: [{ ...b }, { ...a }] }); assert.equal(await f.controller.activate(token), 'opened'); assert.equal(f.opened[0].layoutId, id(2));
    f.replace({ links: [{ ...b, url: 'https://other.test' }, a] }); assert.equal(await f.controller.activate(token), 'stale');
    f.replace({ links: [a] }); assert.equal(await f.controller.activate(token), 'stale');
    f.replace({ links: [b, { ...b }] }); assert.equal(await f.controller.activate(token), 'stale');
    assert.equal(f.opened.length, 1);
});
test('legacy cached identity is a strict reference; fresh activation requires unique URL and exact snapshot', async () => {
    const a = { title: 'A', url: 'https://same.test' }, b = { ...a }; const f = fixture([a, b]);
    const token = f.controller.search('same').rows[1].token;
    assert.equal(await f.controller.activate(token), 'stale');
    f.replace({ links: [b, a] }); assert.equal(await f.controller.activate(token), 'stale');
    f.replace({ links: [a] }); assert.equal(await f.controller.activate(token), 'stale');
    f.replace({ links: [{ ...b }] }); assert.equal(await f.controller.activate(token), 'stale');
    f.replace({ links: [b, b] }); assert.equal(await f.controller.activate(token), 'stale');
});
test('unsafe destinations visible but never opened; safe bare domains follow existing normalizer', async () => {
    const f = fixture(['javascript:alert(1)', 'data:text/plain,x', 'file:///tmp/x', 'https://[bad', 'example.com'].map(url => ({ title: 'site', url })));
    const rows = f.controller.search('site').rows;
    assert.deepEqual(rows.map(row => row.safe), [false, false, false, false, true]);
    for (const row of rows) await f.controller.activate(row.token); assert.equal(f.opened.length, 1);
});
test('paging bounded, all results reachable; query is transient and inputs remain byte-identical', () => {
    const links = Array.from({ length: 127 }, (_, i) => ({ title: `saved ${i}`, url: `https://s${i}.test`, category: 'work' }));
    const f = fixture(links); const before = JSON.stringify(f.snapshot());
    assert.equal(f.controller.search('saved').rows.length, PAGE_SIZE);
    assert.equal(f.controller.search('saved', 1).start, 50);
    assert.equal(f.controller.search('saved', 99).rows.length, 27);
    assert.equal(f.controller.search('saved', -1).page, 0);
    f.controller.search('saved 126'); f.controller.clear(); assert.equal(f.controller.query, '');
    assert.equal(JSON.stringify(f.snapshot()), before); assert.equal(f.opened.length, 0);
    assert.equal(fixture([]).controller.search('nothing').saved, 0);
});
test('synthetic timing report: 10,000 records, 20 queries, no network or writes', t => {
    const links = Array.from({ length: 10000 }, (_, i) => ({ title: `Café 中文 ${i}`, url: `https://host${i}.test/path`, category: `c${i % 5}` }));
    const f = fixture(links); const start = performance.now();
    for (let i = 0; i < 20; i++) assert.equal(f.controller.search('cafe').total, 10000);
    t.diagnostic(`Measured 20 full 10,000-record queries: ${(performance.now() - start).toFixed(1)} ms total; max rendered page ${PAGE_SIZE}. Node model, not browser paint.`);
    assert.equal(f.opened.length, 0);
});
test('fresh native-read contract refuses committed delete/edit before cached notification', async () => {
    for (const fresh of [[], [{ title: 'Site', url: 'https://changed.test', layoutId: id(1) }]]) {
        const cached = [{ title: 'Site', url: 'https://old.test', layoutId: id(1) }];
        let closed = 0, opened = 0;
        const controller = new Controller({ getSnapshot: () => ({ links: cached }), readSnapshot: async () => ({ links: fresh }), reserve: () => ({ close() { closed++; }, open() { opened++; } }) });
        assert.equal(await controller.activate(controller.search('site').rows[0].token), 'stale');
        assert.equal(opened, 0); assert.equal(closed, 1); assert.equal(controller.pending, null);
    }
});
test('legacy unique fresh clone opens only with identical full ordered records; reorder and icon change refuse', async () => {
    const links = [{ title: 'same', url: 'https://one.test', icon: 'one' }, { title: 'same', url: 'https://two.test', icon: 'two' }];
    let fresh = structuredClone(links), opened;
    const c = new Controller({ getSnapshot: () => ({ links }), readSnapshot: async () => ({ links: fresh }), activate: link => { opened = link; } });
    const token = c.search('same').rows[1].token;
    assert.equal(await c.activate(token), 'opened'); assert.equal(opened.url, 'https://two.test');
    fresh.reverse(); assert.equal(await c.activate(token), 'stale');
    fresh = structuredClone(links); fresh[0].icon = 'changed'; assert.equal(await c.activate(token), 'stale');
    fresh = structuredClone(links); fresh.push({ ...fresh[1] }); assert.equal(await c.activate(token), 'stale');
});
test('pending activation ownership: one reservation, cancellation, failures and late completions', async () => {
    const links = [{ title: 'one', url: 'https://one.test', layoutId: id(1) }];
    let resolve, reject, closed = 0, opened = 0, reserved = 0;
    const c = new Controller({ getSnapshot: () => ({ links }), readSnapshot: () => new Promise((a,b) => { resolve = a; reject = b; }), reserve() { reserved++; return { close() { closed++; }, open() { opened++; } }; } });
    const token = c.search('one').rows[0].token;
    const first = c.activate(token); assert.ok(c.pending); assert.equal(await c.activate(token), 'busy'); assert.equal(reserved, 1);
    c.search('new query'); assert.equal(closed, 1); resolve({ links }); assert.equal(await first, 'cancelled'); assert.equal(opened, 0);
    c.search('one'); const second = c.activate(token); c.clear(); resolve({ links }); assert.equal(await second, 'cancelled'); assert.equal(closed, 2);
    c.search('one'); const third = c.activate(token); reject(new Error('read failed')); assert.equal(await third, 'error'); assert.equal(closed, 3);
    const blocked = new Controller({ getSnapshot: () => ({ links }), readSnapshot: () => { throw new Error('must not read'); }, reserve: () => null });
    assert.equal(await blocked.activate(blocked.search('one').rows[0].token), 'blocked');
});
