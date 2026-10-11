/* Local connection metadata only. Never stores keys, prompts, responses or permissions. */
(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports ? require('./ai-model-client') : root.LocalItabAIModel);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabAIModelPresets = api;
})(typeof window === 'undefined' ? globalThis : window, function (modelClient) {
    'use strict';
    const KEY = '__localItabAIModelPresetsV1', LOCK = 'local-itab-ai-model-presets-v1';
    const LIMITS = Object.freeze({ records: 30, name: 80 });
    const fail = code => Object.assign(new Error(code), { code });
    function exact(value, keys) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('PRESET');
        const proto = Object.getPrototypeOf(value), descriptors = Object.getOwnPropertyDescriptors(value);
        if ((proto !== null && Object.getPrototypeOf(proto) !== null) || Reflect.ownKeys(descriptors).length !== keys.length || keys.some(key => !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value'))) throw fail('PRESET');
    }
    function preset(value) {
        exact(value, ['name', 'url', 'model']);
        if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > LIMITS.name || /[\p{Cc}\p{Bidi_Control}]/u.test(value.name)) throw fail('PRESET');
        if (typeof value.model !== 'string' || /[\p{Bidi_Control}]/u.test(value.model)) throw fail('MODEL');
        const reviewed = modelClient.review({ url: value.url, model: value.model, prompt: 'Validate connection metadata' });
        return Object.freeze({ name: value.name.trim(), url: reviewed.url, model: reviewed.model });
    }
    function validate(value) {
        if (value === undefined) return { version: 1, records: [] };
        exact(value, ['version', 'records']);
        if (value.version !== 1 || !Array.isArray(value.records) || value.records.length > LIMITS.records) throw fail('PRESET');
        const descriptors = Object.getOwnPropertyDescriptors(value.records);
        if (Reflect.ownKeys(descriptors).length !== value.records.length + 1 || Array.from({ length: value.records.length }, (_, i) => descriptors[i]).some(item => !item?.enumerable || !Object.hasOwn(item, 'value'))) throw fail('PRESET');
        const records = value.records.map(preset), names = new Set(records.map(record => record.name));
        if (names.size !== records.length) throw fail('PRESET');
        return { version: 1, records };
    }
    function createStore({ chromeApi = globalThis.chrome, locks = globalThis.navigator?.locks } = {}) {
        async function read() { return validate((await chromeApi.storage.local.get([KEY]))[KEY]); }
        async function mutate(value, previous, removing) {
            const next = removing ? null : preset(value), prior = previous ? preset(previous) : null;
            if (removing && !prior) throw fail('PRESET');
            if (!locks?.request) throw fail('UNAVAILABLE');
            return locks.request(LOCK, async () => {
                const state = await read();
                const index = prior ? state.records.findIndex(record => record.name === prior.name) : -1;
                if (prior && (index < 0 || JSON.stringify(state.records[index]) !== JSON.stringify(prior))) throw fail('CONFLICT');
                if (next && state.records.some((record, i) => i !== index && record.name === next.name)) throw fail('DUPLICATE');
                if (removing) state.records.splice(index, 1);
                else if (prior) state.records[index] = next;
                else state.records.push(next);
                const checked = validate(state);
                await chromeApi.storage.local.set({ [KEY]: checked });
                return checked;
            });
        }
        return { read, save: (value, previous = null) => mutate(value, previous, false), remove: previous => mutate(null, previous, true) };
    }
    return { KEY, LOCK, LIMITS, preset, validate, createStore };
});
