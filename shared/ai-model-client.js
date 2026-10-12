/* Explicit, one-shot OpenAI-compatible requests. No storage, logging or retries. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabAIModel = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const LIMITS = Object.freeze({ prompt: 32000, response: 32000, wireBytes: 512000, eventChars: 65536, timeoutMs: 60000, model: 120, key: 4096 });
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
    // SSE is decoded incrementally: UTF-8 code points and CRLF may span reads.
    async function readStream(reader, wait, signal, onText) {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        let bytes = 0, line = '', data = [], eventSize = 0, eventType = '', skipLF = false;
        let text = '', stopped = false, complete = false;
        function dispatch() {
            if (eventType === 'error') throw fail('PROVIDER');
            if (!data.length) { eventSize = 0; eventType = ''; return; }
            const payload = data.join('\n'); data = []; eventSize = 0; eventType = '';
            if (payload === '[DONE]') {
                if (!stopped) throw fail('INCOMPLETE');
                if (!text.trim()) throw fail('EMPTY');
                complete = true; return;
            }
            let chunk; try { chunk = JSON.parse(payload); } catch (_) { throw fail('FORMAT'); }
            if (chunk?.error) throw fail('PROVIDER');
            if (!Array.isArray(chunk?.choices)) throw fail('FORMAT');
            // A usage-only final chunk has no choices. No tools or additional choices run.
            if (!chunk.choices.length) return;
            if (chunk.choices.length !== 1 || chunk.choices[0]?.index !== 0 || stopped) throw fail('FORMAT');
            const choice = chunk.choices[0], delta = choice.delta;
            if (!delta || typeof delta !== 'object' || Array.isArray(delta)) throw fail('FORMAT');
            if (delta.tool_calls || delta.function_call || delta.refusal) throw fail('INCOMPLETE');
            if (delta.content != null && typeof delta.content !== 'string') throw fail('FORMAT');
            if (choice.finish_reason != null && choice.finish_reason !== 'stop') throw fail('INCOMPLETE');
            if (delta.content) {
                if (text.length + delta.content.length > LIMITS.response) throw fail('LIMIT');
                text += delta.content;
                if (signal.aborted) throw fail('CANCELLED');
                onText(text);
            }
            if (choice.finish_reason === 'stop') stopped = true;
        }
        function endLine() {
            if (!line) dispatch();
            else if (!line.startsWith(':')) {
                const colon = line.indexOf(':'), name = colon < 0 ? line : line.slice(0, colon);
                let value = colon < 0 ? '' : line.slice(colon + 1); if (value.startsWith(' ')) value = value.slice(1);
                if (name === 'data') data.push(value);
                if (name === 'event') eventType = value;
            }
            line = '';
        }
        while (!complete) {
            const { value, done } = await wait(reader.read());
            if (signal.aborted) throw fail('CANCELLED');
            if (done) {
                try { decoder.decode(); } catch (_) { throw fail('FORMAT'); }
                throw fail('INCOMPLETE'); // EOF is never a successful protocol terminator.
            }
            bytes += value.byteLength; if (bytes > LIMITS.wireBytes) throw fail('LIMIT');
            let decoded; try { decoded = decoder.decode(value, { stream: true }); } catch (_) { throw fail('FORMAT'); }
            for (const char of decoded) {
                if (signal.aborted) throw fail('CANCELLED');
                if (skipLF) { skipLF = false; if (char === '\n') continue; }
                if (++eventSize > LIMITS.eventChars) throw fail('LIMIT');
                if (char === '\r' || char === '\n') { endLine(); skipLF = char === '\r'; }
                else line += char;
                if (complete) break;
            }
        }
        return text;
    }
    async function run(reviewed, { key = '', signal, fetcher = globalThis.fetch, onStart = () => {}, stream = false, onText = () => {} } = {}) {
        const input = review(reviewed);
        if (typeof key !== 'string' || key.length > LIMITS.key || /[\r\n\p{Cc}]/u.test(key)) throw fail('KEY');
        if (signal?.aborted) throw fail('CANCELLED');
        const controller = new AbortController(); let timedOut = false, reader;
        const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
        const wait = promise => new Promise((resolve, reject) => {
            const cancelled = () => { controller.signal.removeEventListener('abort', cancelled); reject(fail('CANCELLED')); };
            controller.signal.addEventListener('abort', cancelled, { once: true });
            Promise.resolve(promise).then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', cancelled));
            if (controller.signal.aborted) cancelled();
        });
        const timer = setTimeout(() => { timedOut = true; controller.abort(); }, LIMITS.timeoutMs);
        try {
            onStart();
            const response = await wait(fetcher(input.url, {
                method: 'POST', credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'no-referrer', signal: controller.signal,
                headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
                body: JSON.stringify({ model: input.model, messages: [{ role: 'user', content: input.prompt }], stream: stream === true })
            }));
            key = ''; // Retain no credential in results, diagnostics, history or storage.
            if (controller.signal.aborted) throw fail('CANCELLED');
            if (!response.ok) throw fail(response.status === 401 || response.status === 403 ? 'AUTH' : response.status === 429 ? 'RATE_LIMIT' : 'PROVIDER');
            if (!(stream === true ? /^text\/event-stream(?:\s*;|$)/i : /application\/json/i).test(response.headers.get('content-type') || '')) throw fail('FORMAT');
            if (Number(response.headers.get('content-length')) > LIMITS.wireBytes) throw fail('LIMIT');
            if (!response.body?.getReader) throw fail('FORMAT');
            reader = response.body.getReader();
            if (stream === true) {
                const text = await readStream(reader, wait, controller.signal, onText);
                if (controller.signal.aborted) throw fail('CANCELLED');
                return Object.freeze({ text, model: input.model, origin: input.origin });
            }
            const chunks = []; let bytes = 0;
            while (true) {
                const { value, done } = await wait(reader.read());
                if (controller.signal.aborted) throw fail('CANCELLED');
                if (done) break;
                bytes += value.byteLength; if (bytes > LIMITS.wireBytes) throw fail('LIMIT'); chunks.push(value);
            }
            const joined = new Uint8Array(bytes); let offset = 0;
            for (const part of chunks) { joined.set(part, offset); offset += part.byteLength; }
            let data; try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)); } catch (_) { throw fail('FORMAT'); }
            const choice = data?.choices?.[0], message = choice?.message, text = message?.content;
            if (typeof text !== 'string' || !text.trim()) throw fail('EMPTY');
            if (text.length > LIMITS.response) throw fail('LIMIT');
            // A complete JSON body alone does not establish a completed answer.
            // Optional empty metadata is harmless; never save a mixed tool/refusal result.
            const hasPayload = value => value != null && value !== '' &&
                (typeof value !== 'object' || Object.keys(value).length > 0);
            if (choice.finish_reason !== 'stop' ||
                [message.tool_calls, message.function_call, message.refusal].some(hasPayload)) throw fail('INCOMPLETE');
            return Object.freeze({ text, model: input.model, origin: input.origin });
        } catch (error) {
            // Never display provider bodies, URLs, echoed prompts or raw network errors.
            if (timedOut) throw fail('TIMEOUT');
            if (controller.signal.aborted || signal?.aborted) throw fail('CANCELLED');
            if (['AUTH', 'RATE_LIMIT', 'PROVIDER', 'FORMAT', 'LIMIT', 'EMPTY', 'INCOMPLETE'].includes(error?.code)) throw fail(error.code);
            throw fail('NETWORK');
        } finally {
            key = ''; clearTimeout(timer); signal?.removeEventListener('abort', abort); controller.abort();
            if (reader) { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch (_) { /* No raw error reporting. */ } }
        }
    }
    return { LIMITS, endpoint, review, run };
});
