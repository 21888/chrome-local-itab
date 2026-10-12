const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../shared/ai-model-client');
const input = () => api.review({ url: 'https://synthetic.test/v1/chat/completions', model: 'fixture-model', prompt: 'Synthetic prompt only' });
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const result = text => json({ choices: [{ message: { content: text }, finish_reason: 'stop' }] });
test('full endpoint review is immutable, bounded and exact-origin scoped', () => {
    const r = input(); assert.ok(Object.isFrozen(r)); assert.equal(r.permission, 'https://synthetic.test:443/*');
    assert.equal(api.endpoint('https://synthetic.test:8443/chat/completions').permission, 'https://synthetic.test:8443/*');
    for (const url of ['https://*/v1/chat/completions', 'https://*.example.com/v1/chat/completions', 'https://%2A.example.com/v1/chat/completions', 'http://synthetic.test/v1/chat/completions', 'https://name:pass@synthetic.test/chat/completions', 'https://synthetic.test/chat/completions?token=a', 'https://synthetic.test/chat/completions#x', 'https://synthetic.test/v1/models', 'https://synthetic.test\\evil/chat/completions']) assert.throws(() => api.endpoint(url), { code: 'ENDPOINT' });
    assert.throws(() => api.review({ ...r, model: '' }), { code: 'MODEL' });
    assert.throws(() => api.review({ ...r, prompt: 'a'.repeat(api.LIMITS.prompt + 1) }), { code: 'PROMPT' });
});
test('only reviewed input is sent once with protected fetch settings and no key in result', async () => {
    let calls = 0; const r = input();
    const answer = await api.run(r, { key: 'synthetic-fixture', fetcher: async (url, options) => {
        calls++; assert.equal(url, r.url); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.cache, 'no-store');
        assert.equal(options.headers.Authorization, 'Bearer synthetic-fixture'); assert.deepEqual(JSON.parse(options.body), { model: r.model, messages: [{ role: 'user', content: r.prompt }], stream: false });
        return result('<script>literal result</script>');
    } });
    assert.equal(calls, 1); assert.equal(answer.text, '<script>literal result</script>'); assert.doesNotMatch(JSON.stringify(answer), /synthetic-fixture/);
});
test('unauthenticated endpoints omit Authorization entirely', async () => {
    await api.run(input(), { fetcher: async (_, options) => { assert.ok(!Object.hasOwn(options.headers, 'Authorization')); return result('Synthetic response'); } });
});
test('provider and network errors cannot leak private bodies or raw error details', async () => {
    for (const status of [401, 403, 429, 500]) {
        await assert.rejects(api.run(input(), { fetcher: async () => new Response('secret echoed body', { status }) }), error => !error.message.includes('secret') && ['AUTH', 'RATE_LIMIT', 'PROVIDER'].includes(error.code));
    }
    await assert.rejects(api.run(input(), { fetcher: async () => { throw new Error('secret raw error'); } }), { code: 'NETWORK', message: 'NETWORK' });
});
test('bounded JSON rejects oversized, malformed, empty and incomplete output', async () => {
    const cases = [
        [() => new Response('x', { headers: { 'Content-Type': 'text/html' } }), 'FORMAT'],
        [() => new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': api.LIMITS.wireBytes + 1 } }), 'LIMIT'],
        [() => new Response('a'.repeat(api.LIMITS.wireBytes + 1), { headers: { 'Content-Type': 'application/json' } }), 'LIMIT'],
        [() => new Response('{', { headers: { 'Content-Type': 'application/json' } }), 'FORMAT'],
        [() => result(''), 'EMPTY'], [() => result('x'.repeat(api.LIMITS.response + 1)), 'LIMIT'],
        [() => json({ choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] }), 'INCOMPLETE']
    ];
    for (const [response, code] of cases) await assert.rejects(api.run(input(), { fetcher: async () => response() }), { code });
});
test('cancel before start sends nothing, cancel during read discards late output', async () => {
    const before = new AbortController(); before.abort(); let calls = 0;
    await assert.rejects(api.run(input(), { signal: before.signal, fetcher: () => { calls++; } }), { code: 'CANCELLED' }); assert.equal(calls, 0);
    const during = new AbortController();
    await assert.rejects(api.run(input(), { signal: during.signal, fetcher: async () => { during.abort(); return result('late output'); } }), { code: 'CANCELLED' });
});
test('non-stream answers require explicit stop, never missing or false-like completion markers', async () => {
    for (const finish of [undefined, null, '', false, 0, 'length', 'content_filter', 'tool_calls', 'function_call']) {
        const choice = { message: { content: 'synthetic incomplete answer' } };
        if (finish !== undefined) choice.finish_reason = finish;
        await assert.rejects(api.run(input(), { fetcher: async () => json({ choices: [choice] }) }), { code: 'INCOMPLETE' });
    }
});
test('non-stream stop cannot hide nonempty tool, function or refusal metadata', async () => {
    for (const extra of [
        { tool_calls: [{ id: 'synthetic', type: 'function', function: { name: 'synthetic', arguments: '{}' } }] },
        { function_call: { name: 'synthetic', arguments: '{}' } },
        { refusal: 'Synthetic refusal' }
    ]) {
        await assert.rejects(api.run(input(), { fetcher: async () => json({ choices: [{
            finish_reason: 'stop', message: { content: 'synthetic mixed answer', ...extra }
        }] }) }), { code: 'INCOMPLETE' });
    }
});
test('non-stream stop keeps ordinary optional null and empty metadata compatible', async () => {
    for (const extra of [
        { tool_calls: null, function_call: null, refusal: null },
        { tool_calls: [], function_call: {}, refusal: '' },
        {}
    ]) {
        const answer = await api.run(input(), { fetcher: async () => json({ choices: [{
            finish_reason: 'stop', message: { content: 'synthetic complete answer', ...extra }
        }] }) });
        assert.equal(answer.text, 'synthetic complete answer');
    }
});
