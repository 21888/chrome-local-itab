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
const tick = () => new Promise(resolve => setImmediate(resolve));
function controlledReader() {
    const reads = []; let cancelled = 0;
    // Unlike ReadableStream, this transport deliberately ignores cancellation.
    const reader = {
        read: () => new Promise(resolve => reads.push(resolve)),
        cancel() { cancelled++; return new Promise(() => {}); }
    };
    return {
        response: { ok: true, headers: { get: name => name === 'content-type' ? 'text/event-stream' : null }, body: { getReader: () => reader } },
        reads, get cancelled() { return cancelled; }
    };
}
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
test('stream accepts empty optional tool and refusal metadata without treating it as a tool response', async () => {
    for (const metadata of [
        { tool_calls: null, function_call: null, refusal: null },
        { tool_calls: [], function_call: {}, refusal: '' }
    ]) {
        const event = delta => `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`;
        const updates = [];
        const result = await run(event({ role: 'assistant', ...metadata }) +
            event({ content: 'Synthetic ordinary answer', ...metadata }) + chunk(null, 'stop') + 'data: [DONE]\n\n',
        { onText: value => updates.push(value) });
        assert.equal(result.text, 'Synthetic ordinary answer');
        assert.deepEqual(updates, ['Synthetic ordinary answer']);
    }
});
test('empty optional metadata never bypasses streaming completion requirements', async () => {
    const event = finish => `data: ${JSON.stringify({ choices: [{ index: 0,
        delta: { content: 'Synthetic partial', tool_calls: [], function_call: {}, refusal: '' },
        ...(finish === undefined ? {} : { finish_reason: finish }) }] })}\n\n`;
    for (const finish of [undefined, null, '', false, 0, 'length', 'content_filter', 'tool_calls', 'function_call']) {
        await assert.rejects(run(event(finish) + 'data: [DONE]\n\n'), { code: 'INCOMPLETE' });
    }
    await assert.rejects(run(event('stop')), { code: 'INCOMPLETE' });
});
test('stream still rejects nonempty and malformed tool or refusal payloads before publishing mixed text', async () => {
    for (const field of ['tool_calls', 'function_call', 'refusal']) {
        for (const value of [[{ name: 'synthetic' }], { name: 'synthetic' }, 'synthetic', false, 0]) {
            const updates = [];
            const body = `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: 'Must not publish', [field]: value }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`;
            await assert.rejects(run(body, { onText: text => updates.push(text) }), { code: 'INCOMPLETE' });
            assert.deepEqual(updates, []);
        }
    }
});
test('malformed, provider errors, truncated and non-stop finishes never return a complete result', async () => {
    const cases = [
        ['data: {broken}\n\n', 'FORMAT'], ['event: error\ndata: secret\n\n', 'PROVIDER'], ['data: {"error":{"message":"secret"}}\n\n', 'PROVIDER'],
        [chunk('partial'), 'INCOMPLETE'], [chunk('partial') + chunk(null, 'stop'), 'INCOMPLETE'], [chunk('partial') + 'data: [DONE]\n\n', 'INCOMPLETE'],
        [complete(''), 'EMPTY'], [chunk('partial', 'length') + 'data: [DONE]\n\n', 'INCOMPLETE'], [chunk('partial', 'content_filter'), 'INCOMPLETE'],
        ['data: {"choices":[{"index":1,"delta":{"content":"wrong"}}]}\n\n', 'FORMAT'], ['data: {"choices":[{"index":0,"delta":{"tool_calls":[]}}]}\n\n', 'INCOMPLETE'],
        [chunk('one', 'stop') + chunk('extra') + 'data: [DONE]\n\n', 'FORMAT'],
        [chunk('one', 'stop') + 'data: {broken}\n\ndata: [DONE]\n\n', 'FORMAT'],
        [chunk('one', 'stop') + 'data: {"error":{"message":"secret"}}\n\ndata: [DONE]\n\n', 'PROVIDER'],
        [chunk('one', 'stop') + 'event: error\n\ndata: [DONE]\n\n', 'PROVIDER'], ['data: {"choices":[{"index":0,"delta":{"content":12}}]}\n\n', 'FORMAT'],
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
test('wire budget accepts exactly 512000 UTF-8 bytes and rejects one extra byte across reads', async () => {
    assert.equal(api.LIMITS.wireBytes, 512000);
    const answer = complete('ok 👋');
    // Small independent comment events keep the event and output limits irrelevant.
    const heartbeat = ':' + 'é'.repeat(510) + 'x\n\n';
    assert.equal(encode(heartbeat).byteLength, 1024);
    for (const excess of [0, 1]) {
        const padding = 512000 + excess - encode(answer).byteLength;
        const remainder = padding % 1024;
        assert.ok(remainder >= 3);
        const body = heartbeat.repeat(Math.floor(padding / 1024)) + ':' + 'x'.repeat(remainder - 3) + '\n\n' + answer;
        const bytes = encode(body);
        assert.equal(bytes.byteLength, 512000 + excess);
        assert.ok(body.length < 512000); // A character counter would miss the extra wire byte.
        const parts = [];
        for (let offset = 0; offset < bytes.length; offset += 4093) parts.push(bytes.slice(offset, offset + 4093));
        const pending = run('', { fetcher: async () => response(parts) });
        if (excess) await assert.rejects(pending, { code: 'LIMIT', message: 'LIMIT' });
        else assert.equal((await pending).text, 'ok 👋');
    }
});
test('declared wire budget accepts Content-Length 512000 and rejects 512001 before reading', async () => {
    for (const length of [512000, 512001]) {
        let readerCalls = 0;
        const body = response([complete('ok')]);
        const pending = run('', { fetcher: async () => ({
            ok: true,
            headers: new Headers({ 'content-type': 'text/event-stream', 'content-length': String(length) }),
            body: { getReader() { readerCalls++; return body.body.getReader(); } }
        }) });
        if (length > 512000) {
            await assert.rejects(pending, { code: 'LIMIT', message: 'LIMIT' });
            assert.equal(readerCalls, 0);
        } else {
            assert.equal((await pending).text, 'ok');
            assert.equal(readerCalls, 1);
        }
    }
});
test('output budget accepts 32000 UTF-16 units of emoji text and rejects the next unit', async () => {
    assert.equal(api.LIMITS.response, 32000);
    const first = '👋'.repeat(8000), second = '👋'.repeat(7999) + 'ab';
    const expected = first + second;
    assert.equal(expected.length, 32000);
    assert.equal(Array.from(expected).length, 16001);
    for (const extra of ['', 'c']) {
        const updates = [];
        const body = chunk(first) + chunk(second) + (extra ? chunk(extra) : '') + chunk(null, 'stop') + 'data: [DONE]\n\n';
        assert.ok(encode(body).byteLength < api.LIMITS.wireBytes);
        const pending = run(body, { onText: text => updates.push(text.length) });
        if (extra) await assert.rejects(pending, { code: 'LIMIT', message: 'LIMIT' });
        else assert.equal((await pending).text, expected);
        assert.deepEqual(updates, [16000, 32000]); // Never publish the rejected unit as partial text.
    }
});
for (const newline of ['\n', '\r\n']) test(`event budget implementation counts 65536 decoded code points including the terminal blank line (${newline === '\n' ? 'LF' : 'normalized CRLF'})`, async () => {
    assert.equal(api.LIMITS.eventChars, 65536);
    // Characterization of the current defensive counter, not an SSE protocol requirement:
    // include comment/field syntax and both terminal newlines; CRLF counts as one newline.
    // Decoded code points (including emoji) count once, unlike the UTF-16 output budget.
    const prefix = ': ' + '👋'.repeat(1000);
    const suffix = '\nid: synthetic\nretry: 123\nevent: message\n' + chunk('ok');
    for (const excess of [0, 1]) {
        const event = prefix + 'x'.repeat(65536 + excess - Array.from(prefix + suffix).length) + suffix;
        assert.equal(Array.from(event).length, 65536 + excess);
        assert.ok(event.length > 65536);
        const body = (event + chunk(null, 'stop') + 'data: [DONE]\n\n').replace(/\n/g, newline);
        assert.ok(encode(body).byteLength < api.LIMITS.wireBytes);
        const parts = [];
        // Separate every line ending's LF from its preceding bytes, including CR in CRLF.
        // Long lines also cross reads and may split an emoji's UTF-8 sequence.
        for (const line of body.split('\n').slice(0, -1)) {
            const bytes = encode(line);
            for (let offset = 0; offset < bytes.length; offset += 4093) parts.push(bytes.slice(offset, offset + 4093));
            parts.push(encode('\n'));
        }
        let updates = 0;
        const pending = run('', { fetcher: async () => response(parts), onText: () => updates++ });
        if (excess) {
            await assert.rejects(pending, { code: 'LIMIT', message: 'LIMIT' });
            assert.equal(updates, 0); // The over-budget event is never dispatched.
        } else {
            assert.equal((await pending).text, 'ok');
            assert.equal(updates, 1);
        }
    }
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

test('stop keeps an open body pending until a later DONE event', async t => {
    const transport = controlledReader(), aborter = new AbortController(); let settled = false;
    t.after(() => aborter.abort());
    const pending = api.run(input, { stream: true, signal: aborter.signal, fetcher: async () => transport.response }).finally(() => { settled = true; });
    await tick(); assert.equal(transport.reads.length, 1);
    transport.reads[0]({ value: encode(chunk('answer', 'stop')), done: false });
    await tick(); assert.equal(settled, false); assert.equal(transport.cancelled, 0); assert.equal(transport.reads.length, 2);
    transport.reads[1]({ value: encode('data: [DONE]\n\n'), done: false });
    assert.equal((await pending).text, 'answer'); assert.equal(transport.cancelled, 1);
});
for (const stop of ['abort', 'timeout']) test(`${stop} after stop ignores late DONE when the reader never acknowledges cancellation`, async () => {
    let timeout;
    const sandbox = { module: { exports: {} }, URL, AbortController, TextDecoder, Uint8Array, setTimeout: (callback, ms) => { assert.equal(ms, 60000); timeout = callback; return 1; }, clearTimeout() {} };
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/ai-model-client'), 'utf8'), sandbox);
    const transport = controlledReader(), aborter = new AbortController(), updates = []; let calls = 0;
    const pending = sandbox.module.exports.run(input, { stream: true, signal: aborter.signal, onText: text => updates.push(text), fetcher: async () => { calls++; return transport.response; } });
    await tick(); assert.equal(transport.reads.length, 1);
    transport.reads[0]({ value: encode(chunk('partial', 'stop')), done: false });
    await tick(); assert.deepEqual(updates, ['partial']); assert.equal(transport.reads.length, 2);
    if (stop === 'abort') aborter.abort(); else timeout();
    await assert.rejects(pending, { code: stop === 'abort' ? 'CANCELLED' : 'TIMEOUT' });
    assert.equal(transport.cancelled, 1);
    transport.reads[1]({ value: encode('data: [DONE]\n\n' + complete('late')), done: false });
    await tick(); assert.deepEqual(updates, ['partial']); assert.equal(transport.reads.length, 2); assert.equal(calls, 1); assert.equal(transport.cancelled, 1);
});
