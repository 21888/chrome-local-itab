/* Immutable local import-closure evidence. Pure codec: no writers or managers. */
(function (root, factory) {
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabImportClosure = api;
})(typeof window === 'undefined' ? globalThis : window, function (root) {
    'use strict';
    const KEY = '__localItabImportClosureV1';
    const ACTION = 'abandon-unverified-keep-current';
    const LIMITS = Object.freeze({ bytes: 8 * 1024 * 1024, depth: 64, nodes: 200000 });
    const TARGET_KEYS = Object.freeze(['clock', 'search', 'bg', 'themePreset', 'appearance', 'show', 'categories', 'links', 'weather', 'hot', 'movie', 'quote', 'layout', 'ui', 'privacy', 'schemaVersion', '__localItabLayoutGeneration', '__localItabSettingsGeneration']);
    const validated = new WeakSet();
    const own = (value, key) => Boolean(value && Object.hasOwn(value, key));
    const error = code => Object.assign(new Error(`Local import closure: ${code}`), { code: `IMPORT_CLOSURE_${code}` });
    const check = (value, code = 'INVALID') => { if (!value) throw error(code); };
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    function plainPrototype(proto) {
        if (proto === null) return true;
        if (Object.getPrototypeOf(proto) !== null) return false;
        const constructor = Object.getOwnPropertyDescriptor(proto, 'constructor');
        return Boolean(constructor && own(constructor, 'value') && typeof constructor.value === 'function' &&
            Object.getOwnPropertyDescriptor(constructor.value, 'prototype')?.value === proto &&
            Function.prototype.toString.call(constructor.value) === 'function Object() { [native code] }');
    }
    const isPlainObject = value => object(value) && plainPrototype(Object.getPrototypeOf(value));
    const exact = (value, keys) => object(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
    const token = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
    const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
    const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
    const forbidden = key => ['__proto__', 'prototype', 'constructor'].includes(key);
    const put = (object, key, value) => Object.defineProperty(object, key, { value, writable: true, enumerable: true, configurable: true });
    function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
    // Do not use JSON round trips or Object.keys-only projection on input: they
    // erase evidence, invoke getters, or ignore symbol/nonenumerable properties.
    function copy(input, limits = LIMITS) {
        const seen = new Set(); let nodes = 0, bytes = 0;
        const charge = value => { bytes += new TextEncoder().encode(value).length; check(bytes <= limits.bytes, 'SIZE_LIMIT'); };
        function visit(value, depth) {
            check(++nodes <= limits.nodes && depth <= limits.depth, 'SIZE_LIMIT');
            if (value === null || typeof value === 'boolean') { charge(String(value)); return value; }
            if (typeof value === 'string') { check(value.length <= limits.bytes, 'SIZE_LIMIT'); charge(JSON.stringify(value)); return value; }
            if (typeof value === 'number') { check(Number.isFinite(value) && !Object.is(value, -0)); charge(String(value)); return value; }
            check(value && typeof value === 'object' && !seen.has(value));
            const array = Array.isArray(value), proto = Object.getPrototypeOf(value);
            check(array ? proto === null || (Array.isArray(proto) && Object.getPrototypeOf(Object.getPrototypeOf(proto)) === null) : plainPrototype(proto));
            const keys = Reflect.ownKeys(value); check(keys.length <= limits.nodes, 'SIZE_LIMIT');
            if (array) check(value.length <= limits.nodes && keys.length === value.length + 1);
            const output = array ? [] : {}; seen.add(value); charge(array ? '[]' : '{}');
            for (const key of keys) {
                if (array && key === 'length') continue;
                check(typeof key === 'string' && !forbidden(key));
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                check(descriptor && descriptor.enumerable && own(descriptor, 'value'));
                if (array) check(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < value.length);
                charge((array ? '' : JSON.stringify(key) + ':') + ',');
                put(output, key, visit(descriptor.value, depth + 1));
            }
            seen.delete(value); return output;
        }
        return visit(input, 0);
    }
    function stable(value) {
        if (Array.isArray(value)) return value.map(stable);
        if (!object(value)) return value;
        const result = {}; for (const key of Object.keys(value).sort()) put(result, key, stable(value[key])); return result;
    }
    const canonical = value => JSON.stringify(stable(copy(value)));
    const same = (left, right) => canonical(left) === canonical(right);
    async function digest(value, { crypto = root.crypto } = {}) {
        check(typeof crypto?.subtle?.digest === 'function', 'CRYPTO_UNAVAILABLE');
        const bytes = new TextEncoder().encode(canonical(value));
        const result = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    function receipt(value) {
        check(exact(value, ['version', 'status', 'request', 'target', 'recovery']) && value.version === 1 && value.status === 'pending' && ['request', 'target', 'recovery'].every(key => hash(value[key])), 'RECEIPT_INVALID');
        return value;
    }
    function inventory(raw) {
        check(isPlainObject(raw));
        const result = {}; for (const key of TARGET_KEYS) if (own(raw, key)) {
            const descriptor = Object.getOwnPropertyDescriptor(raw, key); check(descriptor && descriptor.enumerable && own(descriptor, 'value'));
            put(result, key, descriptor.value);
        }
        return copy(result);
    }
    async function validate(value, options = {}) {
        const envelope = copy(value);
        check(object(envelope));
        if (own(envelope, 'schemaVersion') && envelope.schemaVersion !== 1) throw error('UNSUPPORTED');
        check(exact(envelope, ['schemaVersion', 'id', 'body']));
        check(envelope.schemaVersion === 1);
        check(hash(envelope.id));
        const body = envelope.body;
        check(exact(body, ['action', 'reviewedAt', 'decidedAt', 'owner', 'receipt', 'current', 'recovery', 'receiptDigest', 'currentDigest', 'recoveryDigest']));
        check(body.action === ACTION && date(body.reviewedAt) && date(body.decidedAt) && body.decidedAt >= body.reviewedAt);
        check(exact(body.owner, ['migrationId', 'workspaceId', 'generation', 'label']) && ['migrationId', 'workspaceId', 'generation'].every(key => token(body.owner[key])) && typeof body.owner.label === 'string' && body.owner.label.trim() === body.owner.label && body.owner.label.length > 0 && Array.from(body.owner.label).length <= 80 && !/[\u0000-\u001f\u007f]/.test(body.owner.label));
        receipt(body.receipt);
        check(object(body.current) && Object.keys(body.current).every(key => TARGET_KEYS.includes(key)) && object(body.recovery));
        check(['receiptDigest', 'currentDigest', 'recoveryDigest'].every(key => hash(body[key])));
        check(await digest(body.receipt, options) === body.receiptDigest && await digest(body.current, options) === body.currentDigest && await digest(body.recovery, options) === body.recoveryDigest, 'CHECKSUM');
        check(body.recoveryDigest === body.receipt.recovery && body.currentDigest !== body.receipt.target, 'SOURCE_INVALID');
        check(await digest(body, options) === envelope.id, 'CHECKSUM');
        freeze(envelope); validated.add(envelope); return envelope;
    }
    async function inspect(value, { present = true, ...options } = {}) {
        if (!present) return Object.freeze({ status: 'empty' });
        try { return Object.freeze({ status: 'valid', envelope: await validate(value, options) }); }
        catch (failure) { return Object.freeze({ status: failure.code === 'IMPORT_CLOSURE_UNSUPPORTED' ? 'unsupported' : 'invalid', code: failure.code || 'IMPORT_CLOSURE_INVALID' }); }
    }
    function matches(envelope, { migrationId, workspaceId, receipt: original }) {
        if (!validated.has(envelope)) return false;
        try { return envelope.body.owner.migrationId === migrationId && envelope.body.owner.workspaceId === workspaceId && same(envelope.body.receipt, original); } catch (_) { return false; }
    }
    return Object.freeze({ KEY, ACTION, LIMITS, TARGET_KEYS, isPlainObject, copy, canonical, same, freeze, digest, inventory, receipt, validate, inspect, matches,
        inspectEnvelope: validate, matchesClosure: matches, error });
});
