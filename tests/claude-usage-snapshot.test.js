const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../shared/claude-usage-snapshot');
const fixture = require('./fixtures/claude-usage/public-window-sample.json');
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
const orgs = [{ id: A, name: 'Synthetic team' }, { id: B, name: 'Synthetic team' }];
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
async function page(data, kind = 'usage', selected = A, options = {}) {
    const saved = { location: global.location, window: global.window, fetch: global.fetch };
    const win = {}; win.top = win;
    global.window = options.child ? { top: {} } : win;
    global.location = { origin: options.origin || 'https://claude.ai' };
    const calls = [];
    global.fetch = async (path, settings) => { calls.push({ path, settings }); if (options.error) throw new Error('secret error detail'); return options.response || json(data, options.status, options.headers); };
    try { return { value: await api.readInPage(kind, selected), calls }; }
    finally { Object.assign(global, saved); }
}
test('public attributed response fixture maps 4/29 with six decimal timestamps and no raw data', async () => {
    const { value, calls } = await page({ ...fixture, token: 'must not cross', identity: 'private' });
    assert.deepEqual(value.windows, { five_hour: { usedPercent: 4, resetAt: fixture.five_hour.resets_at }, seven_day: { usedPercent: 29, resetAt: fixture.seven_day.resets_at } });
    assert.deepEqual(Object.keys(value).sort(), ['fetchedAt', 'unavailable', 'windows']);
    assert.equal(calls[0].path, `/api/organizations/${A}/usage`);
    const settings = calls[0].settings;
    assert.equal(settings.credentials, 'same-origin'); assert.equal(settings.mode, 'same-origin'); assert.equal(settings.redirect, 'error'); assert.equal(settings.cache, 'no-store'); assert.equal(settings.method, 'GET'); assert.deepEqual(settings.headers, { Accept: 'application/json' });
});
for (const value of [-1, 101, '4', true, null, {}, []]) test(`invalid utilization ${JSON.stringify(value)}`, async () => {
    assert.equal((await page({ five_hour: { utilization: value }, seven_day: null })).value.error, 'schema_changed');
});
for (const value of ['2026-02-30T10:00:00Z', '2026-07-18T16:09:59', '2026-07-18T24:09:59Z', '2026-07-18T16:09:59+24:00', 'tomorrow', 123, '2026-07-18T16:09:59.1234567Z']) test(`invalid reset ${value}`, async () => {
    assert.equal((await page({ five_hour: { utilization: 0, resets_at: value }, seven_day: null })).value.error, 'schema_changed');
});
test('null means absent; zero stays zero; missing reset unknown; all null distinct from malformed', async () => {
    const value = (await page({ five_hour: { utilization: 0 }, seven_day: null })).value;
    assert.deepEqual(value.windows, { five_hour: { usedPercent: 0, resetAt: null }, seven_day: null });
    assert.equal((await page({ five_hour: null, seven_day: null })).value.unavailable, true);
    for (const data of [{}, [], null, { five_hour: null }, { five_hour: {}, seven_day: null }]) assert.equal((await page(data)).value.error, 'schema_changed');
});
for (const [status, error] of [[401, 'login_required'], [403, 'access_denied'], [429, 'rate_limited'], [500, 'temporary_error'], [302, 'http_error']]) test(`status ${status} classified`, async () => {
    assert.deepEqual((await page({}, 'usage', A, { status })).value, { error });
});
test('challenge and HTML are not treated as login, network details are suppressed', async () => {
    assert.equal((await page({}, 'usage', A, { status: 403, headers: { 'cf-mitigated': 'challenge' } })).value.error, 'challenge');
    assert.equal((await page({}, 'usage', A, { headers: { 'content-type': 'text/html' } })).value.error, 'non_json');
    assert.deepEqual((await page({}, 'usage', A, { error: true })).value, { error: 'network_or_redirect' });
});
test('bounded streaming and declared response size', async () => {
    for (const options of [{ headers: { 'content-length': '65537' } }, { response: json({ noise: 'a'.repeat(65537) }) }]) assert.equal((await page({}, 'usage', A, options)).value.error, 'too_large');
});
test('organization whitelist, canonical UUID, bounded names, duplicates fail closed', async () => {
    const value = (await page([{ uuid: A, name: '<script>synthetic</script>', secret: 'excluded' }], 'organizations')).value;
    assert.deepEqual(value, { organizations: [{ id: A, name: '<script>synthetic</script>' }] });
    for (const data of [{}, [{ uuid: '../usage' }], [{ id: A }], [{ uuid: A }, { uuid: A }], [{ uuid: A, name: {} }]]) assert.equal((await page(data, 'organizations')).value.error, 'schema_changed');
});
test('origin, top-frame, arbitrary kind and path injection rejected before fetch', async () => {
    for (const [kind, id, opts] of [['usage', '../other', {}], ['arbitrary', A, {}], ['usage', A, { origin: 'https://claude.ai.evil.test' }], ['usage', A, { child: true }]]) { const result = await page({}, kind, id, opts); assert.equal(result.calls.length, 0); assert.ok(result.value.error); }
});
function event() { const set = new Set(); return { addListener: f => set.add(f), removeListener: f => set.delete(f), fire: (...a) => [...set].forEach(f => f(...a)), count: () => set.size }; }
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
function mock() {
    const calls = [], states = []; let response = async args => args.args[0] === 'organizations' ? { organizations: orgs } : { windows: { five_hour: { usedPercent: 4, resetAt: null }, seven_day: null }, fetchedAt: '2026-10-13T10:00:00Z' };
    const chrome = { permissions: { request: async p => { calls.push(['permission', p]); return true; }, contains: async () => true, onRemoved: event() }, tabs: { query: async () => [{ id: 7, url: 'https://claude.ai/chat/anything', title: 'private title' }, { id: 8, url: 'https://claude.ai.evil.test/' }], get: async () => ({ id: 7, url: 'https://claude.ai/' }), onUpdated: event(), onRemoved: event() }, scripting: { executeScript: async args => { calls.push(['script', args]); return [{ frameId: 0, documentId: 'doc-1', result: await response(args) }]; } } };
    const controller = api.createController(chrome, state => states.push(state));
    return { chrome, controller, calls, states, respond: f => { response = f; } };
}
async function ready(m) { await m.controller.enable(); await m.controller.selectTab(7); }
test('default off; exact optional grants; selected existing top-level tab; explicit nonfirst org', async () => {
    const m = mock(); assert.equal(m.calls.length, 0); assert.equal(m.controller.getState().phase, 'disabled');
    await m.controller.enable(); assert.deepEqual(m.calls[0], ['permission', { permissions: ['scripting'], origins: ['https://claude.ai/*'] }]); assert.deepEqual(m.controller.getState().tabs, [{ id: 7 }]);
    await m.controller.selectTab(8); assert.equal(m.calls.length, 1);
    await m.controller.selectTab(7); assert.equal(m.controller.getState().phase, 'organizations');
    assert.equal(m.calls.filter(c => c[0] === 'script').length, 1);
    await m.controller.selectOrganization('../other'); assert.equal(m.controller.getState().phase, 'organizations');
    await m.controller.selectOrganization(B);
    const scripts = m.calls.filter(c => c[0] === 'script').map(c => c[1]);
    assert.deepEqual(scripts.map(s => s.args), [['organizations', null], ['organizations', null], ['usage', B]]);
    assert.deepEqual(scripts[0].target, { tabId: 7, frameIds: [0] }); assert.deepEqual(scripts[1].target, { tabId: 7, documentIds: ['doc-1'] }); assert.deepEqual(scripts[2].target, scripts[1].target); assert.ok(scripts.every(s => s.world === 'MAIN'));
    assert.equal(m.controller.getState().phase, 'snapshot'); assert.ok(!JSON.stringify(m.controller.getState()).includes(B));
});
test('single org never auto-selects; reentry never duplicates usage', async () => {
    const m = mock(); m.respond(async () => ({ organizations: [orgs[0]] })); await ready(m); assert.equal(m.controller.getState().phase, 'organizations'); assert.equal(m.calls.filter(c => c[0] === 'script').length, 1);
    const gate = deferred(); m.respond(() => gate.promise); const pending = m.controller.selectOrganization(A); await m.controller.selectOrganization(A); m.controller.close(); gate.resolve({ organizations: [orgs[0]] }); await pending; assert.equal(m.controller.getState().phase, 'disabled');
});
for (const interrupt of ['close', 'navigation', 'remove', 'permission', 'restart']) test(`late org response discarded on ${interrupt}`, async () => {
    const m = mock(); await m.controller.enable(); const gate = deferred(); m.respond(() => gate.promise); const pending = m.controller.selectTab(7); await new Promise(r => setImmediate(r));
    if (interrupt === 'close') m.controller.close();
    if (interrupt === 'navigation') m.chrome.tabs.onUpdated.fire(7, { status: 'loading' });
    if (interrupt === 'remove') m.chrome.tabs.onRemoved.fire(7);
    if (interrupt === 'permission') m.chrome.permissions.onRemoved.fire({ permissions: ['scripting'] });
    if (interrupt === 'restart') await m.controller.enable();
    gate.resolve({ organizations: orgs }); await pending; assert.notEqual(m.controller.getState().phase, 'organizations'); assert.ok(!JSON.stringify(m.controller.getState()).includes(A));
});
test('cancel during second org check prevents subsequent usage request', async () => {
    const m = mock(); await ready(m); const gate = deferred(); m.respond(() => gate.promise); const pending = m.controller.selectOrganization(B); await new Promise(r => setImmediate(r)); m.controller.close(); gate.resolve({ organizations: orgs }); await pending;
    assert.equal(m.calls.filter(c => c[0] === 'script').length, 2); assert.equal(m.controller.getState().phase, 'disabled');
});
test('org disappearance or rename fails without another organization fallback', async () => {
    for (const replacement of [[orgs[0]], [{ ...orgs[0], name: 'changed' }, orgs[1]]]) { const m = mock(); await ready(m); m.respond(async () => ({ organizations: replacement })); await m.controller.selectOrganization(B); assert.equal(m.controller.getState().error, 'organizations_changed'); assert.equal(m.calls.filter(c => c[0] === 'script').length, 2); }
});
test('wrong document result fails closed', async () => {
    const m = mock(); await ready(m); m.chrome.scripting.executeScript = async () => [{ frameId: 0, documentId: 'doc-new', result: { organizations: orgs } }]; await m.controller.selectOrganization(B); assert.equal(m.controller.getState().error, 'document_changed');
});
test('permission refusal/cancelled grant never queries tabs or injects', async () => {
    const m = mock(); m.chrome.permissions.request = async () => false; await m.controller.enable(); assert.equal(m.controller.getState().error, 'permission_denied'); assert.equal(m.calls.length, 0);
    const gate = deferred(); m.chrome.permissions.request = () => gate.promise; const pending = m.controller.enable(); m.controller.close(); gate.resolve(true); await pending; assert.equal(m.controller.getState().phase, 'disabled'); assert.equal(m.calls.length, 0);
});
test('revocation clears snapshot and disposes listeners', async () => {
    const m = mock(); await ready(m); await m.controller.selectOrganization(A); m.chrome.permissions.onRemoved.fire({ origins: ['https://claude.ai/*'] }); assert.deepEqual(m.controller.getState(), { phase: 'disabled' }); m.controller.dispose(); assert.equal(m.chrome.tabs.onUpdated.count(), 0); assert.equal(m.chrome.tabs.onRemoved.count(), 0); assert.equal(m.chrome.permissions.onRemoved.count(), 0);
});
test('same org list cannot establish account continuity: no account claim or identity cached', async () => {
    const m = mock(); await ready(m); await m.controller.selectOrganization(B); assert.deepEqual(Object.keys(m.controller.getState()).sort(), ['fetchedAt', 'name', 'phase', 'tabId', 'unavailable', 'windows']);
});
test('manifest required permissions unchanged and scripting optional; production entry not wired', () => {
    const fs = require('node:fs'); const manifest = require('../manifest.json'); assert.deepEqual(manifest.permissions, ['storage', 'unlimitedStorage', 'identity', 'contextMenus']); assert.deepEqual(manifest.optional_permissions, ['scripting']); assert.ok(!fs.readFileSync('newtab.html', 'utf8').includes('claude-usage'));
});
for (const invalid of ['01/02/2027', '2026-10-13T12:00:00', '2026-02-30T00:00:00Z']) test(`extension boundary rejects MAIN reset ${invalid}`, async () => {
    const m = mock(); await ready(m);
    m.respond(async args => args.args[0] === 'organizations' ? { organizations: orgs } : { windows: { five_hour: { usedPercent: 4, resetAt: invalid }, seven_day: null }, fetchedAt: '2026-10-13T10:00:00Z' });
    await m.controller.selectOrganization(A); assert.equal(m.controller.getState().error, 'schema_changed');
});
test('extension timestamp is locally collected, never accepts MAIN supplied time', async () => {
    const m = mock(); await ready(m);
    m.respond(async args => args.args[0] === 'organizations' ? { organizations: orgs } : { windows: { five_hour: { usedPercent: 4, resetAt: '2026-07-18T16:09:59.774291+00:00' }, seven_day: null }, fetchedAt: 'arbitrary MAIN timestamp' });
    const before = Date.now(); await m.controller.selectOrganization(A); const state = m.controller.getState(); assert.equal(state.phase, 'snapshot'); assert.ok(Date.parse(state.fetchedAt) >= before && Date.parse(state.fetchedAt) <= Date.now());
});
test('recheck rejects oversized/invalid organization fields before comparison or usage', async () => {
    for (const organizations of [[{ id: A, name: 'x'.repeat(121) }], [{ id: '../path', name: 'Synthetic' }], Array(101).fill(orgs[0]), [{ id: A, name: 12 }]]) {
        const m = mock(); await ready(m); m.respond(async () => ({ organizations })); await m.controller.selectOrganization(B); assert.equal(m.controller.getState().error, 'schema_changed'); assert.equal(m.calls.filter(c => c[0] === 'script').length, 2);
    }
});
test('extension errors never retain arbitrary thrown text', async () => {
    const m = mock(); await ready(m); m.chrome.scripting.executeScript = async () => { throw new Error('synthetic-private-account-value'); }; await m.controller.selectOrganization(A); assert.deepEqual(m.controller.getState(), { phase: 'error', error: 'read_failed' });
});
