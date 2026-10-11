/* Explicit, one-shot OpenAI-compatible requests. No storage, logging or retries. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabAIModel = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const LIMITS = Object.freeze({ prompt: 32000, response: 32000, wireBytes: 512000, timeoutMs: 60000, model: 120, key: 4096 });
    const fail = code => Object.assign(new Error(code), { code });
    function endpoint(value) {
        if (typeof value !== 'string' || value.length > 2048 || /[\s\\\p{Bidi_Control}]/u.test(value)) throw fail('ENDPOINT');
        let url; try { url = new URL(value); } catch (_) { throw fail('ENDPOINT'); }
        if (url.protocol !== 'https:' || !url.hostname || url.hostname.includes('*') || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/chat/completions')) throw fail('ENDPOINT');
        return Object.freeze({ url: url.href, origin: url.origin, permission: `https://${url.hostname}:${url.port || '443'}/*` });
    }
    function review({ url, model, prompt }) {
        const target = endpoint(url);
        if (typeof model !== 'string' || !model.trim() || model.length > LIMITS.model || /[\r\n\p{Cc}]/u.test(model)) throw fail('MODEL');
        if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > LIMITS.prompt) throw fail('PROMPT');
        return Object.freeze({ ...target, model: model.trim(), prompt });
    }
    async function run(reviewed, { key = '', signal, fetcher = globalThis.fetch, onStart = () => {} } = {}) {
        const input = review(reviewed);
        if (typeof key !== 'string' || key.length > LIMITS.key || /[\r\n\p{Cc}]/u.test(key)) throw fail('KEY');
        if (signal?.aborted) throw fail('CANCELLED');
        const controller = new AbortController(); let timedOut = false, reader;
        const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, LIMITS.timeoutMs);
        try {
            onStart();
            const response = await fetcher(input.url, {
                method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
                headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
                body: JSON.stringify({ model: input.model, messages: [{ role: 'user', content: input.prompt }], stream: false })
            });
            key = ''; // Retain no credential in results, diagnostics, history or storage.
            if (controller.signal.aborted) throw fail('CANCELLED');
            if (!response.ok) throw fail(response.status === 401 || response.status === 403 ? 'AUTH' : response.status === 429 ? 'RATE_LIMIT' : 'PROVIDER');
            if (!/application\/json/i.test(response.headers.get('content-type') || '')) throw fail('FORMAT');
            if (Number(response.headers.get('content-length')) > LIMITS.wireBytes) throw fail('LIMIT');
            if (!response.body?.getReader) throw fail('FORMAT');
            reader = response.body.getReader(); const chunks = []; let bytes = 0;
            while (true) {
                const { value, done } = await reader.read();
                if (controller.signal.aborted) throw fail('CANCELLED');
                if (done) break;
                bytes += value.byteLength; if (bytes > LIMITS.wireBytes) throw fail('LIMIT'); chunks.push(value);
            }
            const joined = new Uint8Array(bytes); let offset = 0;
            for (const part of chunks) { joined.set(part, offset); offset += part.byteLength; }
            let data; try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)); } catch (_) { throw fail('FORMAT'); }
            const text = data?.choices?.[0]?.message?.content;
            if (typeof text !== 'string' || !text.trim()) throw fail('EMPTY');
            if (text.length > LIMITS.response) throw fail('LIMIT');
            if (data.choices[0].finish_reason && data.choices[0].finish_reason !== 'stop') throw fail('INCOMPLETE');
            return Object.freeze({ text, model: input.model, origin: input.origin });
        } catch (error) {
            // Never display provider bodies, URLs, echoed prompts or raw network errors.
            if (timedOut) throw fail('TIMEOUT');
            if (controller.signal.aborted || signal?.aborted) throw fail('CANCELLED');
            if (['AUTH', 'RATE_LIMIT', 'PROVIDER', 'FORMAT', 'LIMIT', 'EMPTY', 'INCOMPLETE'].includes(error?.code)) throw fail(error.code);
            throw fail('NETWORK');
        } finally {
            clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort();
            if (reader) { try { await reader.cancel(); } catch (_) { /* No raw error reporting. */ } }
        }
    }
    return { LIMITS, endpoint, review, run };
});
