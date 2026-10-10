const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const api = require('../shared/update-checker');
const {deferred} = require('./helpers/task-dom-model');
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const release = (version = '1.1.11', extras = {}) => ({tag_name: `v${version}`, draft: false, prerelease: false, ...extras});
const response = (data = release(), options = {}) => new Response(JSON.stringify(data), {status: 200, ...options});
function fixture({state, fetch, timeout = 1000} = {}) {
    let saved = clone(state), queue = Promise.resolve(), now = 10 * api.DAY, count = 0;
    const listeners = new Set(), writes = [], requests = [];
    const backend = {
        lock(fn) { const result = queue.then(fn); queue = result.catch(() => {}); return result; },
        async read() { return clone(saved); },
        async write(value) { saved = clone(value); writes.push(clone(value)); for (const listener of listeners) listener(); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
    const make = options => new api.Checker({backend, now: () => now, id: () => `request-${++count}`, currentVersion: '1.1.10', timeout,
        fetch: async (...args) => { requests.push(args); return (fetch || (() => response()))(...args); }, ...options});
    const checker = make();
    return {checker, make, backend, requests, writes, state: () => clone(saved), set: value => backend.lock(() => backend.write(value)),
        advance: delta => { now += delta; }, now: () => now};
}
test('Chrome numeric versions compare every component and reject malformed/unsafe strings', () => {
    assert.equal(api.compareVersions('1.1.10', '1.1.9'), 1);
    assert.equal(api.compareVersions('1.1', '1.1.0.0'), 0);
    assert.equal(api.compareVersions('1.1.10.2', '1.1.10.11'), -1);
    for (const value of ['1.01.1', '1.1.65536', '1.2.3.4.5', '1.1.11-beta', 'v1.1.11', '<script>', '1.1.11/../../evil', ' 1.1.11', 1.2]) assert.equal(api.versionParts(value), null);
});
test('release adapter reads only validated numeric tag; ignores remote names, instructions and URLs', () => {
    const data = release('1.1.11', {name: '<img onerror=alert(1)>', body: 'run code', html_url: 'javascript:alert(1)', assets: [{browser_download_url: 'https://evil.example'}]});
    assert.deepEqual(api.parseRelease(data), {tag: 'v1.1.11', version: '1.1.11'});
    assert.equal(api.releaseUrl(api.parseRelease(data)), `${api.REPOSITORY}/releases/tag/v1.1.11`);
    for (const data of [null, {}, release('1.1.11', {draft: true}), release('1.1.11', {prerelease: true}), release('1.1.11', {draft: undefined}), release('../evil')]) assert.throws(() => api.parseRelease(data));
    assert.equal(api.releaseUrl({tag: 'v1.1.11', version: '1.1.12'}), null);
});
test('fresh install stays manual and makes zero automatic requests or writes', async () => {
    const h = fixture(); assert.equal((await h.checker.read()).automatic, false);
    assert.equal((await h.checker.check({automatic: true})).status, 'skipped');
    assert.equal(h.requests.length, 0); assert.equal(h.writes.length, 0);
    assert.equal(await h.checker.claimNotice(), null);
    assert.equal(api.normalize({schemaVersion: 2, automatic: true}).automatic, false);
});
test('explicit manual check sends no configuration, tokens, current version or referrer and saves only metadata', async () => {
    const h = fixture(); assert.equal((await h.checker.check()).status, 'available');
    const [url, options] = h.requests[0];
    assert.equal(url, 'https://api.github.com/repos/21888/chrome-local-itab/releases/latest');
    assert.equal(options.method, 'GET'); assert.equal(options.credentials, 'omit'); assert.equal(options.mode, 'cors');
    assert.equal(options.redirect, 'error'); assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.cache, 'no-store');
    assert.deepEqual(options.headers, {Accept: 'application/vnd.github+json'}); assert.equal(options.body, undefined);
    assert.equal(h.state().automatic, false); assert.equal(h.state().lastSuccess, h.now());
    assert.equal(await h.checker.claimNotice(), null);
});
test('automatic checks are opted in, once per 24h across tabs; manual checks can find a later release', async () => {
    let version = '1.1.11'; const h = fixture({fetch: () => response(release(version))}), other = h.make();
    await h.checker.setAutomatic(true);
    const results = await Promise.all([h.checker.check({automatic: true}), other.check({automatic: true})]);
    assert.equal(results.filter(item => item.status === 'available').length, 1); assert.equal(h.requests.length, 1);
    await h.checker.check({automatic: true}); assert.equal(h.requests.length, 1);
    assert.equal((await h.checker.claimNotice()).version, '1.1.11'); assert.equal(await other.claimNotice(), null);
    version = '1.1.12'; h.advance(1000); await other.check(); assert.equal(h.requests.length, 2);
    assert.equal(await other.claimNotice(), null, 'new commit is not another automatic notice');
    h.advance(api.DAY); await other.check({automatic: true});
    assert.equal(h.requests.length, 3); assert.equal((await other.claimNotice()).version, '1.1.12');
    h.advance(api.DAY); await other.check({automatic: true}); assert.equal(await other.claimNotice(), null, 'same version never nags again');
});
test('ignore is version-specific and never prevents explicit manual checks', async () => {
    let version = '1.1.11'; const h = fixture({fetch: () => response(release(version))});
    await h.checker.setAutomatic(true); await h.checker.check(); await h.checker.ignore(version);
    assert.equal(await h.checker.claimNotice(), null); await h.checker.check(); assert.equal(h.requests.length, 2);
    version = '1.1.12'; h.advance(api.DAY); await h.checker.check();
    assert.equal((await h.checker.claimNotice()).version, version);
});
test('opt-out while an automatic response is pending aborts and cannot re-enable or save late data', async () => {
    const pending = deferred(), entered = deferred(); const h = fixture({fetch: () => { entered.resolve(); return pending.promise; }}), other = h.make();
    await h.checker.setAutomatic(true); const task = h.checker.check({automatic: true}); await entered.promise;
    await other.setAutomatic(false); pending.resolve(response()); await task;
    assert.equal(h.state().automatic, false); assert.equal(h.state().latest, null); assert.equal(h.state().lastSuccess, 0);
    assert.equal(h.requests[0][1].signal.aborted, true);
});
test('reset and a newer request supersede an old response without restoring removed preferences', async () => {
    const pending = deferred(), entered = deferred(); let n = 0;
    const h = fixture({fetch: () => { if (++n === 1) { entered.resolve(); return pending.promise; } return response(release('1.1.12')); }}), other = h.make();
    const task = h.checker.check(); await entered.promise; await h.set(undefined);
    await other.check(); pending.resolve(response(release('1.1.11'))); await task;
    assert.equal(h.state().latest.version, '1.1.12'); assert.equal(h.state().automatic, false);
});
test('ignore concurrent with a successful request is retained by field-scoped completion', async () => {
    const pending = deferred(), entered = deferred(); const h = fixture({fetch: () => { entered.resolve(); return pending.promise; }}), other = h.make();
    const task = h.checker.check(); await entered.promise; await other.ignore('1.1.11'); pending.resolve(response()); await task;
    assert.equal(h.state().ignoredVersion, '1.1.11'); assert.equal(h.state().latest.version, '1.1.11');
});
test('repeated checks share the active request across pages', async () => {
    const pending = deferred(), entered = deferred(); const h = fixture({fetch: () => { entered.resolve(); return pending.promise; }});
    const task = h.checker.check(); await entered.promise;
    assert.equal((await h.checker.check()).status, 'busy'); assert.equal((await h.make().check()).status, 'busy');
    assert.equal(h.requests.length, 1); pending.resolve(response()); await task;
});
test('timeout remains bounded even if a fetch implementation ignores abort; late result cannot change state', async () => {
    const pending = deferred(); const h = fixture({fetch: () => pending.promise, timeout: 10});
    assert.equal((await h.checker.check()).status, 'timeout'); assert.equal(h.state().latest, null);
    pending.resolve(response()); await new Promise(resolve => setTimeout(resolve, 10)); assert.equal(h.state().latest, null);
});
test('offline, not found, server and malformed responses are explicit and retain the last successful cache', async () => {
    for (const [status, fetch] of [['offline', () => Promise.reject(new TypeError('Failed to fetch'))], ['noRelease', () => response({}, {status: 404})],
        ['unavailable', () => response({}, {status: 503})], ['invalid', () => new Response('not json')], ['invalid', () => response(release('1.1.11-beta'))]]) {
        const previous = {...api.initial(), latest: {tag: 'v1.1.11', version: '1.1.11'}, lastSuccess: 42};
        const h = fixture({state: previous, fetch}); assert.equal((await h.checker.check()).status, status);
        assert.deepEqual(h.state().latest, previous.latest); assert.equal(h.state().lastSuccess, 42);
    }
});
test('rate limits are honored by both manual and automatic checks without retry loops', async () => {
    const h = fixture({fetch: () => response({}, {status: 429, headers: {'retry-after': '120'}})});
    assert.equal((await h.checker.check()).status, 'rateLimit'); assert.equal(h.state().retryAt, h.now() + 120000);
    await h.checker.setAutomatic(true); assert.equal((await h.checker.check()).status, 'rateLimit'); await h.checker.check({automatic: true});
    assert.equal(h.requests.length, 1); h.advance(120001); await h.checker.check(); assert.equal(h.requests.length, 2);
});
test('older GitHub metadata never overwrites a newer result or falsely marks a successful fresh check', async () => {
    const previous = {...api.initial(), latest: {tag: 'v1.1.12', version: '1.1.12'}, lastSuccess: 42};
    const h = fixture({state: previous}); assert.equal((await h.checker.check()).status, 'stale');
    assert.equal(h.state().latest.version, '1.1.12'); assert.equal(h.state().lastSuccess, 42); assert.equal(await h.checker.claimNotice(), null);
});
test('already current/newer installs never get an update notice', async () => {
    const h = fixture({fetch: () => response(release('1.1.9'))}); await h.checker.setAutomatic(true);
    assert.equal((await h.checker.check()).status, 'current'); assert.equal(await h.checker.claimNotice(), null);
});
test('oversized body is rejected, including streaming responses with no content-length', async () => {
    for (const responseFactory of [() => new Response('x', {headers: {'content-length': String(api.MAX_BYTES + 1)}}), () => new Response('x'.repeat(api.MAX_BYTES + 1))]) {
        const h = fixture({fetch: responseFactory}); assert.equal((await h.checker.check()).status, 'invalid'); assert.equal(h.state().latest, null);
    }
});
test('storage read/write rejection cannot start a network request', async () => {
    for (const stage of ['read', 'write']) {
        const h = fixture(); h.backend[stage] = async () => { throw Error('storage denied'); };
        await assert.rejects(h.checker.check()); assert.equal(h.requests.length, 0);
    }
});
test('installation detection does not require or infer broad management permissions', async () => {
    const chrome = (installType, update_url) => ({management: {getSelf: async () => ({installType})}, runtime: {getManifest: () => ({update_url})}});
    assert.equal(await api.installation(chrome('development')), 'unpacked');
    assert.equal(await api.installation(chrome('admin')), 'managed');
    assert.equal(await api.installation(chrome('normal')), 'unknown');
    assert.equal(await api.installation(chrome('normal', 'https://clients2.google.com/service/update2/crx')), 'store');
    assert.equal(await api.installation(chrome('normal', 'https://evil.example/update')), 'unknown');
    assert.equal(await api.installation({}), 'unknown');
});
test('manifest gains only exact GitHub CSP connection, no new permission or execution endpoint', () => {
    const manifest = JSON.parse(fs.readFileSync('manifest.json'));
    assert.deepEqual(manifest.permissions, ['storage', 'unlimitedStorage', 'identity']);
    assert.deepEqual(manifest.host_permissions, ['https://www.googleapis.com/*']);
    assert.deepEqual(manifest.optional_host_permissions, ['https://www.google.com/*']);
    assert.equal(manifest.content_security_policy.extension_pages.split(';').find(item => item.includes('script-src')).trim(), "script-src 'self'");
    assert(manifest.content_security_policy.extension_pages.includes('https://api.github.com'));
    const source = fs.readFileSync('shared/update-checker.js', 'utf8') + fs.readFileSync('shared/update-view.js', 'utf8');
    assert(!/runtime\.reload|requestUpdateCheck|\.innerHTML|eval\(|downloads\.|tabs\.reload/.test(source));
});
test('device update state stays out of every configuration backup and sync payload', async () => {
    const StorageManager = require('../storage'); const manager = new StorageManager();
    const state = {...manager.cloneDefaultConfig(), [api.KEY]: {...api.initial(), automatic: true, ignoredVersion: '1.1.11'}};
    for (const payload of [manager.validateConfigObject(state), manager.sanitizeConfigForBackup(state), manager.buildManualExportPayload(state), manager.buildDriveBackupPayload(state), manager.prepareSyncPayload(state), await manager.makeRecovery(state, 'beforeRestore')]) assert(!JSON.stringify(payload).includes(api.KEY));
});
