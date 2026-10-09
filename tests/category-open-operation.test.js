const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');

// Execute the actual page function and URL normalizer with deterministic timers.
// This verifies opening attempts, not Chromium popup permission or successful tabs.
function mount(links = makeLinks()) {
    const pending = new Map(), scheduled = [], cleared = [], opens = [];
    let nextId = 0, scheduleCount = 0, failAt = Infinity, confirms = 0;
    let decision = () => true, opener = () => null;
    const window = {
        shortcutsComponentInstance: { links },
        open(...args) { opens.push(args); return opener(...args); }
    };
    const context = vm.createContext({
        window, document: { addEventListener() {} }, URL, console,
        confirm() { confirms++; return decision(); },
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
    const step = () => {
        const [id, callback] = pending.entries().next().value;
        pending.delete(id); callback();
    };
    return { window, pending, scheduled, cleared, opens,
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
    h.window.shortcutsComponentInstance.links = [null];
    await assert.rejects(h.run('work'), /category/);
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
