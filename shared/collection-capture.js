/* Explicit context-menu selections only. Pure validation; no page or storage reads. */
(function (root, factory) {
    const core = typeof module === 'object' && module.exports ? require('./local-ai-collections-store.js') : root.LocalItabAICollections;
    const api = factory(core);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabCollectionCapture = api;
})(typeof window === 'undefined' ? globalThis : window, function (Core) {
    'use strict';
    const TOKEN_PATTERN = /^[a-f0-9]{32}$/;
    const LIMITS = Object.freeze({ pending: 8, tombstones: 32, bytes: 512 * 1024, ttlMs: 10 * 60 * 1000 });
    const ERRORS = Object.freeze(['editable', 'incognito', 'invalid', 'oversize', 'unsupported', 'unavailable', 'full', 'expired']);
    const faults = new WeakSet();
    function fault(code) { const error = new Error(`Collection capture: ${ERRORS.includes(code) ? code : 'invalid'}`); error.code = ERRORS.includes(code) ? code : 'invalid'; faults.add(error); return error; }
    function errorCode(error) { return faults.has(error) ? error.code : 'unavailable'; }
    const parseToken = value => typeof value === 'string' && TOKEN_PATTERN.test(value) ? value : null;
    function own(value, key) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw fault('invalid');
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (!descriptor) return undefined;
        if (!Object.hasOwn(descriptor, 'value')) throw fault('invalid');
        return descriptor.value;
    }
    function validateBody(body) {
        if (typeof body !== 'string') throw fault('invalid');
        if (body.length > Core.LIMITS.body * 2) throw fault('oversize');
        const draft = Core.createDraft(); draft.body = body;
        // This public pure path invokes the collection store's own required,
        // multiline Unicode body validator, so the two boundaries cannot drift.
        try { Core.findDuplicates(Core.initial(), { body: draft.body, sourceUrl: draft.sourceUrl }); }
        catch (error) { throw fault(error?.code === 'TEXT_LIMIT' ? 'oversize' : 'invalid'); }
        return body;
    }
    function candidate(source) {
        if (typeof source !== 'string' || source === '' || source.length > Core.LIMITS.url * 2) return '';
        try {
            // Validate the ORIGINAL string first. Stripping credentials, query or
            // fragment before this boundary could conceal forbidden characters.
            const metadata = Core.sourceMetadata(source);
            const parsed = new URL(metadata.href); parsed.search = ''; parsed.hash = '';
            Core.sourceMetadata(parsed.href); return parsed.href;
        } catch (_) { return ''; }
    }
    function validateSelection(info, tab) {
        if (own(info, 'editable') === true) throw fault('editable');
        if (own(tab, 'incognito') === true) throw fault('incognito');
        const page = own(info, 'pageUrl');
        if (typeof page !== 'string' || !/^https?:\/\//i.test(page)) throw fault('unsupported');
        const body = validateBody(own(info, 'selectionText'));
        // A supplied frame URL owns attribution even when unsafe or empty.
        // Never substitute tab.url or the top page for a rejected frame URL.
        const frame = own(info, 'frameUrl');
        const source = Object.hasOwn(info, 'frameUrl') ? frame : page;
        return { body, sourceCandidate: candidate(source) };
    }
    function validatePayload(payload) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw fault('invalid');
        const prototype = Object.getPrototypeOf(payload);
        if (prototype !== null && prototype !== Object.prototype) throw fault('invalid');
        const keys = Reflect.ownKeys(payload);
        if (keys.length !== 2 || !keys.includes('body') || !keys.includes('sourceCandidate')) throw fault('invalid');
        const body = validateBody(own(payload, 'body')), sourceCandidate = own(payload, 'sourceCandidate');
        if (typeof sourceCandidate !== 'string' || (sourceCandidate !== '' && candidate(sourceCandidate) !== sourceCandidate)) throw fault('invalid');
        return { body, sourceCandidate };
    }
    return { TOKEN_PATTERN, LIMITS, ERRORS, parseToken, validateSelection, validatePayload, fault, errorCode };
});
