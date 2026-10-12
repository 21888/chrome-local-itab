const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const api = require('../shared/ai-model-client');
const input = api.review({ url: 'https://synthetic.test/v1/chat/completions', model: 'synthetic-model', prompt: 'Synthetic prompt' });
const encode = text => new TextEncoder().encode(text);
const chunk = (content, finish = null) => `data: ${JSON.stringify({ choices: [{ index: 0, delta: content === null ? {} : { content }, finish_reason: finish }] })}\n\n`;
const complete = text => chunk(text) + chunk(null, 'stop') + 'data: [DONE]\n\n';
function response(parts, headers = {}) {
    return new Response(new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(typeof part === 'string' ? encode(part) : part); controller.close(); } }), { headers: { 'content-type': 'text/event-stream; charset=utf-8', ...headers } });
}
const run = (body, options = {}) => api.run(input, { stream: true, fetcher: async () => response([body]), ...options });
test('fragmented UTF-8, CRLF and multiple SSE events produce one protected reviewed request', async () => {
    let calls = 0; const updates = [];
    const bytes = encode((': heartbeat\r\n\r\n' + complete('你好 👋 <script>literal</script>')).replace(/(?<!\r)\n/g, '\r\n'));
    const result = await run('', { key: 'synthetic-key', onText: text => updates.push(text), fetcher: async (url, options) => {
        calls++; assert.equal(url, input.url); assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error'); assert.equal(options.referrerPolicy, 'no-referrer'); assert.equal(options.cache, 'no-store');
        assert.deepEqual(JSON.parse(options.body), { model: input.model, messages: [{ role: 'user', content: input.prompt }], stream: true });
        return response(Array.from(bytes, byte => new Uint8Array([byte])));
    } });
    assert.equal(calls, 1); assert.equal(result.text, '你好 👋 <script>literal</script>'); assert.equal(updates.at(-1), result.text); assert.equal(Object.keys(result).join(','), 'text,model,origin');
});
test('multiline data, comments, role-only and usage-only events are supported', async () => {
    const prefix = ': comment\n\ndata: {"choices":\ndata: [{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n';
    assert.equal((await run(prefix + chunk('one') + chunk(' two') + chunk(null, 'stop') + 'data: {"choices":[],"usage":{"total_tokens":3}}\n\ndata: [DONE]\n\n')).text, 'one two');
});
test('malformed, provider errors, truncated and non-stop finishes never return a complete result', async () => {
    const cases = [
        ['data: {broken}\n\n', 'FORMAT'], ['event: error\ndata: secret\n\n', 'PROVIDER'], ['data: {"error":{"message":"secret"}}\n\n', 'PROVIDER'],
        [chunk('partial'), 'INCOMPLETE'], [chunk('partial') + chunk(null, 'stop'), 'INCOMPLETE'], [chunk('partial') + 'data: [DONE]\n\n', 'INCOMPLETE'],
        [complete(''), 'EMPTY'], [chunk('partial', 'length') + 'data: [DONE]\n\n', 'INCOMPLETE'], [chunk('partial', 'content_filter'), 'INCOMPLETE'],
        ['data: {"choices":[{"index":1,"delta":{"content":"wrong"}}]}\n\n', 'FORMAT'], ['data: {"choices":[{"index":0,"delta":{"tool_calls":[]}}]}\n\n', 'INCOMPLETE'],
        [chunk('one', 'stop') + chunk('extra') + 'data: [DONE]\n\n', 'FORMAT'], ['data: {"choices":[{"index":0,"delta":{"content":12}}]}\n\n', 'FORMAT'],
        [encode('data: '), 'INCOMPLETE'], [new Uint8Array([0xff]), 'FORMAT'], [new Uint8Array([0xe4]), 'FORMAT']
    ];
    for (const [body, code] of cases) await assert.rejects(run(body), { code, message: code });
});
test('wire, event, output and declared-byte budgets apply without exposing partial text in errors', async () => {
    for (const body of ['x'.repeat(api.LIMITS.wireBytes + 1), ':' + 'x'.repeat(api.LIMITS.eventChars), chunk('a'.repeat(api.LIMITS.response)) + chunk('b')]) await assert.rejects(run(body), { code: 'LIMIT' });
    await assert.rejects(run('', { fetcher: async () => response([complete('ok')], { 'content-length': api.LIMITS.wireBytes + 1 }) }), { code: 'LIMIT' });
    await assert.rejects(run('', { fetcher: async () => response([complete('ok')], { 'content-type': 'application/json' }) }), { code: 'FORMAT' });
    // Many individually small events still count toward the total wire budget.
    await assert.rejects(run(': heartbeat\n\n'.repeat(40000)), { code: 'LIMIT' });
});
test('abort releases stalled reads, cancels the reader and ignores late content without retry', async () => {
    const aborter = new AbortController(); let calls = 0, cancelled = 0, updates = 0, controller;
    const pending = run('', { signal: aborter.signal, onText: () => updates++, fetcher: async () => {
        calls++; return new Response(new ReadableStream({ start(value) { controller = value; value.enqueue(encode(chunk('partial'))); }, cancel() { cancelled++; } }), { headers: { 'content-type': 'text/event-stream' } });
    } });
    await new Promise(resolve => setImmediate(resolve)); assert.equal(updates, 1); aborter.abort();
    await assert.rejects(pending, { code: 'CANCELLED' }); assert.equal(calls, 1); assert.equal(cancelled, 1);
    assert.throws(() => controller.enqueue(encode(complete('late')))); assert.equal(updates, 1);
    await assert.rejects(run(complete('never'), { signal: aborter.signal, fetcher: () => { calls++; } }), { code: 'CANCELLED' }); assert.equal(calls, 1);
});
test('abort during synchronous delta delivery suppresses later events from the same chunk', async () => {
    const aborter = new AbortController(); let updates = 0;
    await assert.rejects(run(chunk('first') + complete('late'), { signal: aborter.signal, onText: () => { updates++; aborter.abort(); } }), { code: 'CANCELLED' }); assert.equal(updates, 1);
});
test('60-second deadline covers stalled headers and body even when a synthetic fetch ignores abort', async () => {
    let timeout; const sandbox = { module: { exports: {} }, URL, AbortController, TextDecoder, Uint8Array, setTimeout: (callback, ms) => { assert.equal(ms, 60000); timeout = callback; return 1; }, clearTimeout() {} };
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/ai-model-client'), 'utf8'), sandbox);
    for (const fetcher of [() => new Promise(() => {}), async () => new Response(new ReadableStream({}), { headers: { 'content-type': 'text/event-stream' } })]) {
        const pending = sandbox.module.exports.run(input, { stream: true, fetcher });
        await new Promise(resolve => setImmediate(resolve)); timeout(); await assert.rejects(pending, { code: 'TIMEOUT' });
    }
});
test('reader failures remain opaque and DONE cancels an otherwise open body', async () => {
    await assert.rejects(run('', { fetcher: async () => new Response(new ReadableStream({ start(c) { c.error(Error('private raw failure')); } }), { headers: { 'content-type': 'text/event-stream' } }) }), { code: 'NETWORK', message: 'NETWORK' });
    let cancelled = 0;
    const result = await run('', { fetcher: async () => new Response(new ReadableStream({ start(c) { c.enqueue(encode(complete('done'))); }, cancel() { cancelled++; return new Promise(() => {}); } }), { headers: { 'content-type': 'text/event-stream' } }) });
    assert.equal(result.text, 'done'); assert.equal(cancelled, 1);
});
test('wire budget accumulates across reads; event budget accumulates across fragmented lines', async () => {
    await assert.rejects(run('', { fetcher: async () => response(Array.from({ length: 520 }, () => ':' + 'a'.repeat(997) + '\n\n')) }), { code: 'LIMIT' });
    await assert.rejects(run('', { fetcher: async () => response(Array.from({ length: 70 }, () => 'x'.repeat(1000))) }), { code: 'LIMIT' });
    assert.equal((await run(complete('CR only').replace(/\n/g, '\r'))).text, 'CR only');
});
test('partial text received before provider error remains only a callback, never a returned answer', async () => {
    let partial = '';
    await assert.rejects(run(chunk('partial') + 'data: {"error":{"message":"secret"}}\n\n', { onText: text => { partial = text; } }), { code: 'PROVIDER', message: 'PROVIDER' });
    assert.equal(partial, 'partial');
});
