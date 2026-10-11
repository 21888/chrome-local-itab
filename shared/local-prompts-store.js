/* Device-local plain text only. No providers, page reads, clipboard, or network. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabPrompts = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const KEY = '__localItabPersonalPromptsV1', LOCK = 'local-itab-personal-prompts-v1';
    const FORMAT = 'local-itab-prompts';
    const LIMITS = Object.freeze({ records: 200, title: 200, body: 32000, tags: 20, tag: 64,
        category: 100, tool: 200, versions: 20, recovery: 8, bytes: 2 * 1024 * 1024,
        query: 500, variables: 100, variable: 64, value: 32000, preview: 256000, previewBytes: 1024 * 1024 });
    const EDITABLE = ['title', 'body', 'tags', 'category', 'tool', 'favorite'];
    const RECORD_KEYS = ['id', 'type', 'version', 'revision', ...EDITABLE, 'createdAt', 'updatedAt', 'deletedAt', 'currentVersionId', 'history'];
    // Public inputs are plain data, never executable serialization hooks. Reject
    // own accessors, hidden/symbol keys, sparse arrays, cycles and prototypes
    // before reading property values or calling JSON.stringify.
    function clone(value) {
        const ancestors = new Set(); let nodes = 0, characters = 0;
        function walk(item, depth) {
            check(++nodes <= 250000 && depth <= 32, 'SIZE_LIMIT');
            if (item === null || typeof item === 'boolean') return item;
            if (typeof item === 'string') { characters += item.length; check(characters <= 4 * LIMITS.bytes, 'SIZE_LIMIT'); return item; }
            if (typeof item === 'number') { check(Number.isFinite(item)); return item; }
            check(item && typeof item === 'object' && !ancestors.has(item));
            const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
            check(array ? Array.isArray(prototype) : prototype === null || Object.getPrototypeOf(prototype) === null);
            const descriptors = Object.getOwnPropertyDescriptors(item), keys = Reflect.ownKeys(descriptors);
            check(keys.length <= 250000, 'SIZE_LIMIT');
            const length = array ? descriptors.length?.value : 0;
            if (array) check(Number.isSafeInteger(length) && length >= 0 && length <= 250000, 'SIZE_LIMIT');
            const result = array ? new Array(length) : {}; let count = 0; ancestors.add(item);
            for (const key of keys) {
                check(typeof key === 'string'); if (array && key === 'length') continue;
                const descriptor = descriptors[key]; check(descriptor.enumerable && Object.hasOwn(descriptor, 'value'));
                if (array) check(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < length);
                characters += key.length; check(characters <= 4 * LIMITS.bytes, 'SIZE_LIMIT'); count++;
                Object.defineProperty(result, key, { value: walk(descriptor.value, depth + 1), enumerable: true, writable: true, configurable: true });
            }
            if (array) check(count === length); ancestors.delete(item); return result;
        }
        return walk(value, 0);
    }
    async function commandDigest(command) {
        const stable = item => Array.isArray(item) ? item.map(stable) : item && typeof item === 'object'
            ? Object.fromEntries(Object.keys(item).sort().map(key => [key, stable(item[key])])) : item;
        check(globalThis.crypto?.subtle, 'UNAVAILABLE');
        const result = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(stable(command))));
        return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    const size = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
    const token = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
    const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
        Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
    const unicode = value => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
    const faults = new WeakSet();
    function fault(code) { const error = new Error(`Local prompts: ${code}`); error.code = code; faults.add(error); return error; }
    function check(ok, code = 'INVALID') { if (!ok) throw fault(code); }
    function dictionary(value) {
        check(value && typeof value === 'object' && !Array.isArray(value));
        check(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
    }
    function object(value, keys) {
        dictionary(value); check(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
    }
    function same(a, b) {
        if (a === b) return true;
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
    }
    function freeze(value) {
        if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
        return value;
    }
    function text(value, limit, required = false, multiline = false) {
        check(typeof value === 'string' && unicode(value), 'TEXT');
        check(!required || value.trim().length > 0, 'TEXT');
        check(Array.from(value).length <= limit, 'TEXT_LIMIT');
        check(!(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value), 'TEXT');
        return value;
    }
    function editable(value) {
        text(value.title, LIMITS.title, true); text(value.body, LIMITS.body, true, true);
        text(value.category, LIMITS.category); text(value.tool, LIMITS.tool);
        check(typeof value.favorite === 'boolean');
        check(Array.isArray(value.tags) && value.tags.length <= LIMITS.tags, 'TAGS');
        const seen = new Set();
        for (const tag of value.tags) {
            text(tag, LIMITS.tag, true); check(!seen.has(tag.toLowerCase()), 'TAGS'); seen.add(tag.toLowerCase());
        }
        return value;
    }
    function fields(value) { return Object.fromEntries(EDITABLE.map(key => [key, clone(value[key])])); }
    function validateRecord(record) {
        record = clone(record);
        object(record, RECORD_KEYS);
        check(token(record.id) && token(record.version) && record.type === 'prompt');
        check(Number.isSafeInteger(record.revision) && record.revision >= 1);
        editable(record);
        check(date(record.createdAt) && date(record.updatedAt) && record.updatedAt >= record.createdAt);
        check(record.deletedAt === null || (date(record.deletedAt) && record.deletedAt >= record.createdAt && record.deletedAt <= record.updatedAt));
        check(Array.isArray(record.history) && record.history.length >= 1 && record.history.length <= LIMITS.versions, 'HISTORY_LIMIT');
        const seen = new Set(); let previous = record.createdAt;
        for (const entry of record.history) {
            object(entry, ['id', 'body', 'createdAt']);
            check(token(entry.id) && !seen.has(entry.id)); seen.add(entry.id);
            text(entry.body, LIMITS.body, true, true);
            check(date(entry.createdAt) && entry.createdAt >= previous && entry.createdAt <= record.updatedAt); previous = entry.createdAt;
        }
        check(record.history[0].createdAt === record.createdAt);
        const latest = record.history.at(-1);
        check(record.currentVersionId === latest.id && record.body === latest.body);
        return record;
    }
    function validateContent(value) {
        value = clone(value);
        object(value, ['records']); check(Array.isArray(value.records) && value.records.length <= LIMITS.records, 'CAPACITY');
        const ids = new Set(), versions = new Set();
        for (const record of value.records) {
            validateRecord(record); check(!ids.has(record.id)); ids.add(record.id);
            for (const entry of record.history) { check(!versions.has(entry.id)); versions.add(entry.id); }
        }
        return value;
    }
    // A body-version identity is immutable, even across archive/recovery copies.
    // This lets result collections keep exact prompt-version references later.
    function checkIdentities(contents) {
        const records = new Map(), versions = new Map();
        for (const content of contents) for (const record of content.records) {
            check(!records.has(record.id) || records.get(record.id) === record.createdAt, 'IDENTITY_CONFLICT');
            records.set(record.id, record.createdAt);
            for (const entry of record.history) {
                const identity = { recordId: record.id, ...entry }, previous = versions.get(entry.id);
                check(!previous || same(previous, identity), 'IDENTITY_CONFLICT'); versions.set(entry.id, identity);
            }
        }
    }
    function validateRecovery(recovery) {
        check(Array.isArray(recovery) && recovery.length <= LIMITS.recovery, 'RECOVERY_LIMIT');
        const seen = new Set();
        for (const item of recovery) {
            object(item, ['id', 'createdAt', 'content']); check(token(item.id) && !seen.has(item.id) && date(item.createdAt));
            seen.add(item.id); validateContent(item.content);
        }
    }
    function initial() { return { schemaVersion: 1, revision: 0, enabled: false, records: [], recovery: [], receipts: [] }; }
    const content = state => { state = clone(state); return clone({ records: state.records }); };
    function validate(value) {
        value = clone(value);
        object(value, ['schemaVersion', 'revision', 'enabled', 'records', 'recovery', 'receipts']);
        check(value.schemaVersion === 1, 'VERSION');
        check(Number.isSafeInteger(value.revision) && value.revision >= 0 && typeof value.enabled === 'boolean');
        validateContent({ records: value.records }); validateRecovery(value.recovery);
        checkIdentities([{ records: value.records }, ...value.recovery.map(item => item.content)]);
        check(Array.isArray(value.receipts) && value.receipts.length <= 128);
        for (const receipt of value.receipts) { object(receipt, ['id', 'digest']); check(token(receipt.id) && typeof receipt.digest === 'string' && /^[a-f0-9]{64}$/.test(receipt.digest)); }
        check(new Set(value.receipts.map(receipt => receipt.id)).size === value.receipts.length);
        check(size(value) <= LIMITS.bytes - 16384, 'SIZE_LIMIT');
        return value;
    }
    function parseBackup(source) {
        check(typeof source === 'string' && size(source) <= LIMITS.bytes, 'SIZE_LIMIT');
        let file; try { file = JSON.parse(source); } catch (_) { throw fault('INVALID'); }
        object(file, ['format', 'schemaVersion', 'exportedAt', 'content', 'recovery']);
        check(file.format === FORMAT && file.schemaVersion === 1, 'VERSION'); check(date(file.exportedAt));
        validateContent(file.content); validateRecovery(file.recovery);
        checkIdentities([file.content, ...file.recovery.map(item => item.content)]);
        return clone(file);
    }
    function counts(state) {
        state = clone(state);
        return { active: state.records.filter(record => record.deletedAt === null).length,
            removed: state.records.filter(record => record.deletedAt !== null).length,
            versions: state.records.reduce((count, record) => count + record.history.length, 0), recovery: state.recovery?.length || 0 };
    }
    function createDraft(record) {
        if (record === undefined) return { title: '', body: '', tags: [], category: '', tool: '', favorite: false };
        validateRecord(record); return { id: record.id, version: record.version, ...fields(record) };
    }
    function scanTemplate(body) {
        text(body, LIMITS.body, false, true);
        const pieces = [], variables = [], names = new Set();
        let start = 0;
        while (start < body.length) {
            const opening = body.indexOf('{{', start);
            if (opening < 0) break;
            const escaped = opening > start && body[opening - 1] === '\\';
            const prefixEnd = escaped ? opening - 1 : opening;
            pieces.push({ text: body.slice(start, prefixEnd) });
            let depth = 1, cursor = opening + 2, nested = false;
            while (cursor < body.length && depth) {
                if (body.startsWith('{{', cursor)) { depth++; nested = true; cursor += 2; }
                else if (body.startsWith('}}', cursor)) { depth--; cursor += 2; }
                else cursor++;
            }
            // An unmatched or nested group is entirely literal. In particular,
            // an inner {{name}} is never evaluated as a nested expression.
            if (depth) { pieces.push({ text: body.slice(prefixEnd) }); start = body.length; break; }
            const raw = body.slice(opening, cursor), name = raw.slice(2, -2).trim();
            const simple = !nested && body[opening - 1] !== '{' && body[cursor] !== '}' &&
                !/[\r\n]/.test(raw) && /^[\p{L}_][\p{L}\p{N}_-]*$/u.test(name) && Array.from(name).length <= LIMITS.variable;
            if (simple && !escaped) {
                pieces.push({ variable: name, text: raw });
                if (!names.has(name)) { names.add(name); variables.push(name); }
            } else pieces.push({ text: (escaped && !simple ? '\\' : '') + raw });
            start = cursor;
        }
        pieces.push({ text: body.slice(start) }); check(variables.length <= LIMITS.variables, 'VARIABLE_LIMIT');
        return { pieces, variables };
    }
    function previewTemplate(body, values = {}, options = {}) {
        values = clone(values); options = clone(options);
        dictionary(options); check(Object.keys(options).every(key => key === 'literal'));
        check(options.literal === undefined || typeof options.literal === 'boolean'); dictionary(values);
        const parsed = options.literal ? { pieces: [{ text: text(body, LIMITS.body, false, true) }], variables: [] } : scanTemplate(body);
        const allowed = new Set(parsed.variables);
        check(Object.keys(values).every(key => allowed.has(key)), 'VARIABLE');
        for (const value of Object.values(values)) text(value, LIMITS.value, false, true);
        const missing = parsed.variables.filter(name => !Object.hasOwn(values, name));
        const parts = []; let characters = 0, bytes = 0;
        for (const piece of parsed.pieces) {
            const part = piece.variable && Object.hasOwn(values, piece.variable) ? values[piece.variable] : piece.text;
            characters += Array.from(part).length; bytes += size(part);
            check(characters <= LIMITS.preview && bytes <= LIMITS.previewBytes, 'PREVIEW_LIMIT'); parts.push(part);
        }
        return { text: parts.join(''), variables: parsed.variables, missing, complete: missing.length === 0 };
    }
    function renderTemplate(body, values = {}, options = {}) {
        const preview = previewTemplate(body, values, options); check(preview.complete, 'MISSING_VALUES'); return preview.text;
    }
    function search(state, query = '', options = {}) {
        state = validate(state); options = clone(options); text(query, LIMITS.query, false, true); dictionary(options);
        check(Object.keys(options).every(key => ['favorite', 'category', 'removed', 'ids'].includes(key)));
        check(options.favorite === undefined || typeof options.favorite === 'boolean');
        check(options.removed === undefined || typeof options.removed === 'boolean');
        if (options.category !== undefined) text(options.category, LIMITS.category);
        if (options.ids !== undefined) check(Array.isArray(options.ids) && options.ids.length <= LIMITS.records && options.ids.every(token));
        const ids = options.ids === undefined ? null : new Set(options.ids), terms = query.toLowerCase().trim().split(/\s+/u).filter(Boolean);
        const results = [];
        for (const record of state.records) {
            if ((record.deletedAt !== null) !== (options.removed === true) || (ids && !ids.has(record.id)) ||
                (options.favorite !== undefined && record.favorite !== options.favorite) ||
                (options.category !== undefined && record.category !== options.category)) continue;
            const searchable = { title: record.title, body: record.body, tags: record.tags.join('\n'), category: record.category, tool: record.tool };
            const normalized = Object.fromEntries(Object.entries(searchable).map(([key, value]) => [key, value.toLowerCase()]));
            if (!terms.every(term => Object.values(normalized).some(value => value.includes(term)))) continue;
            const matchedFields = Object.keys(normalized).filter(key => terms.some(term => normalized[key].includes(term)));
            const field = matchedFields.includes('body') ? 'body' : matchedFields[0] || 'body';
            const original = searchable[field], lower = normalized[field];
            const first = terms.map(term => lower.indexOf(term)).filter(index => index >= 0);
            // Snippet slicing uses code points so it never cuts a surrogate pair.
            const position = first.length ? Array.from(original.slice(0, Math.min(...first))).length : 0;
            const points = Array.from(original), start = Math.max(0, position - 40), end = Math.min(points.length, start + 180);
            results.push({ record: clone(record), matchedFields,
                snippet: `${start ? '…' : ''}${points.slice(start, end).join('')}${end < points.length ? '…' : ''}` });
        }
        return results.sort((a, b) => Number(b.record.favorite) - Number(a.record.favorite) ||
            b.record.updatedAt.localeCompare(a.record.updatedAt) || a.record.id.localeCompare(b.record.id));
    }
    function getVersion(state, recordId, versionId) {
        state = validate(state); check(token(recordId) && token(versionId));
        for (const group of [{ records: state.records }, ...state.recovery.map(item => item.content)]) {
            const record = group.records.find(item => item.id === recordId), version = record?.history.find(item => item.id === versionId);
            if (version) return clone({ recordId, ...version });
        }
        return null;
    }
    function createChromeBackend(chromeApi = globalThis.chrome, locks = globalThis.navigator?.locks) {
        check(chromeApi?.storage?.local && locks?.request, 'UNAVAILABLE');
        return {
            lock: action => locks.request(LOCK, { mode: 'exclusive' }, async () => {
                // Default standalone writers share this lock with workspace-backed
                // complete restore. Never acquire the workspace lock from here.
                const key = '__localItabCombinedRestoreV1';
                let result; try { result = await chromeApi.storage.local.get([key]); dictionary(result); } catch (_) { throw fault('READ'); }
                const marker = result[key];
                check(marker === undefined || (marker?.schemaVersion === 1 && ['verified', 'recovered'].includes(marker.status)), 'RESTORE_PENDING');
                return action();
            }),
            read: async () => { const result = await chromeApi.storage.local.get([KEY]); dictionary(result); return result[KEY]; },
            write: state => chromeApi.storage.local.set({ [KEY]: state }),
            subscribe(listener) {
                const changed = (changes, area) => { if (area === 'local' && Object.hasOwn(changes, KEY)) listener(); };
                chromeApi.storage.onChanged.addListener(changed); return () => chromeApi.storage.onChanged.removeListener(changed);
            }
        };
    }
    function randomId() { check(globalThis.crypto?.randomUUID, 'UNAVAILABLE'); return globalThis.crypto.randomUUID(); }
    class Store {
        constructor(backend = createChromeBackend(), options = {}) {
            this.backend = backend; this.id = options.id || randomId; this.now = options.now || (() => new Date().toISOString());
            this.reviews = new Map();
        }
        nextId() { const value = this.id(); check(token(value)); return value; }
        timestamp() { const value = this.now(); check(date(value)); return value; }
        async readRaw() {
            let raw; try { raw = await this.backend.read(); } catch (_) { throw fault('READ'); }
            return raw === undefined ? initial() : clone(validate(raw));
        }
        async locked(action) {
            let entered = false;
            try { return await this.backend.lock(() => { entered = true; return action(); }); }
            catch (error) { if (faults.has(error)) throw error; throw fault(entered ? 'VERIFY' : 'LOCK'); }
        }
        read() { return this.locked(() => this.readRaw()); }
        subscribe(listener) { return this.backend.subscribe(listener); }
        request(kind, values = {}) {
            values = clone(values); dictionary(values); check(typeof kind === 'string');
            // Commands own a frozen copy. Form edits/preview values cannot change a
            // queued save, a retry, or an already reviewed replacement.
            return freeze({ ...clone(values), kind, operationId: this.nextId() });
        }
        finish(next, operationId, digest = '0'.repeat(64)) {
            next.revision++; next.receipts = [...next.receipts, { id: operationId, digest }].slice(-128); return validate(next);
        }
        renewRecords(records, current) {
            const revisions = new Map();
            for (const record of [...current.records, ...current.recovery.flatMap(item => item.content.records)])
                revisions.set(record.id, Math.max(revisions.get(record.id) || 0, record.revision));
            return clone(records).map(record => ({ ...record, version: this.nextId(),
                revision: Math.max(record.revision, revisions.get(record.id) || 0) + 1 }));
        }
        replacement(current, file, snapshotId, now) {
            const next = clone(current); const incoming = file.recovery;
            checkIdentities([{ records: current.records }, ...current.recovery.map(item => item.content), file.content, ...incoming.map(item => item.content)]);
            for (const item of incoming) {
                const existing = next.recovery.find(value => value.id === item.id);
                check(!existing || same(existing, item), 'CONFLICT'); if (!existing) next.recovery.push(clone(item));
            }
            if (current.records.length || current.recovery.length) {
                check(next.recovery.length < LIMITS.recovery, 'RECOVERY_LIMIT');
                check(!next.recovery.some(item => item.id === snapshotId), 'CONFLICT');
                next.recovery.push({ id: snapshotId, createdAt: now, content: content(current) });
            }
            next.records = this.renewRecords(file.content.records, current);
            return next;
        }
        async mutate(command) {
            command = clone(command); dictionary(command); check(token(command.operationId));
            // Freeze direct callers too, before waiting for another page's lock.
            const digest = await commandDigest(command);
            return this.locked(async () => {
                const current = await this.readRaw();
                if (current.receipts.some(receipt => receipt.id === command.operationId)) {
                    const latest = current.receipts.at(-1);
                    check(latest.id === command.operationId && latest.digest === digest, 'CONFLICT'); return current;
                }
                let next = clone(current); const now = this.timestamp();
                const find = () => {
                    const record = next.records.find(item => item.id === command.id);
                    check(record && record.version === command.version, 'CONFLICT'); return record;
                };
                const touch = record => {
                    record.version = this.nextId(); record.revision++; record.updatedAt = now > record.updatedAt ? now : record.updatedAt;
                };
                const appendVersion = (record, body) => {
                    check(record.history.length < LIMITS.versions, 'HISTORY_LIMIT');
                    const versionId = this.nextId();
                    check(![...next.records, ...next.recovery.flatMap(item => item.content.records)].some(item => item.history.some(entry => entry.id === versionId)), 'CONFLICT');
                    record.history.push({ id: versionId, body, createdAt: now > record.updatedAt ? now : record.updatedAt });
                    record.currentVersionId = versionId; record.body = body;
                };
                switch (command.kind) {
                case 'enable':
                    object(command, ['operationId', 'kind', 'enabled', 'revision']);
                    check(current.revision === command.revision, 'CONFLICT'); check(typeof command.enabled === 'boolean');
                    if (next.enabled === command.enabled) return current; next.enabled = command.enabled; break;
                case 'add': {
                    check(Object.keys(command).every(key => ['operationId', 'kind', ...EDITABLE].includes(key)));
                    const value = editable({ tags: [], category: '', tool: '', favorite: false, ...command });
                    check(next.records.length < LIMITS.records, 'CAPACITY');
                    check(![...next.records, ...next.recovery.flatMap(item => item.content.records)].some(item => item.id === command.operationId), 'CONFLICT');
                    const bodyId = this.nextId();
                    check(![...next.records, ...next.recovery.flatMap(item => item.content.records)].some(item => item.history.some(entry => entry.id === bodyId)), 'CONFLICT');
                    next.records.push({ id: command.operationId, type: 'prompt', version: this.nextId(), revision: 1, ...fields(value),
                        createdAt: now, updatedAt: now, deletedAt: null, currentVersionId: bodyId, history: [{ id: bodyId, body: value.body, createdAt: now }] }); break;
                }
                case 'edit': {
                    check(Object.keys(command).every(key => ['operationId', 'kind', 'id', 'version', ...EDITABLE].includes(key)));
                    const record = find(); check(record.deletedAt === null, 'CONFLICT');
                    const values = fields(record); for (const key of EDITABLE) if (Object.hasOwn(command, key)) values[key] = command[key];
                    editable(values); if (same(fields(record), values)) return current;
                    if (record.body !== values.body) appendVersion(record, values.body);
                    Object.assign(record, values); touch(record); break;
                }
                case 'remove': case 'restore': {
                    object(command, ['operationId', 'kind', 'id', 'version']); const record = find();
                    check((record.deletedAt === null) === (command.kind === 'remove'), 'CONFLICT');
                    touch(record); record.deletedAt = command.kind === 'remove' ? record.updatedAt : null; break;
                }
                case 'restoreVersion': {
                    object(command, ['operationId', 'kind', 'id', 'version', 'versionId']); const record = find();
                    check(record.deletedAt === null, 'CONFLICT'); const entry = record.history.find(item => item.id === command.versionId);
                    check(entry, 'CONFLICT'); if (entry.id === record.currentVersionId) return current;
                    appendVersion(record, entry.body); touch(record); break;
                }
                case 'replace': {
                    object(command, ['operationId', 'kind', 'reviewId', 'source', 'revision', 'incoming', 'current', 'conflicts']);
                    const plan = this.reviews.get(command.reviewId);
                    check(plan && same(plan.public, { reviewId: command.reviewId, source: command.source, revision: command.revision,
                        incoming: command.incoming, current: command.current, conflicts: command.conflicts }), 'REVIEW_REQUIRED');
                    check(current.revision === plan.public.revision, 'CONFLICT');
                    next = clone(plan.next); break;
                }
                case 'recover': {
                    object(command, ['operationId', 'kind', 'id', 'revision']); check(current.revision === command.revision, 'CONFLICT');
                    const snapshot = next.recovery.find(item => item.id === command.id); check(snapshot, 'CONFLICT');
                    next.recovery = next.recovery.filter(item => item.id !== command.id);
                    const snapshotId = this.nextId(); check(!next.recovery.some(item => item.id === snapshotId), 'CONFLICT');
                    next.recovery.push({ id: snapshotId, createdAt: now, content: content(current) });
                    next.records = this.renewRecords(snapshot.content.records, current); break;
                }
                default: throw fault('INVALID');
                }
                this.finish(next, command.operationId, digest);
                try { if (await this.backend.write(next) === false) throw fault('WRITE'); } catch (_) { throw fault('WRITE'); }
                const verified = await this.readRaw(); check(same(verified, next), 'VERIFY'); return verified;
            });
        }
        async export() {
            const state = await this.read(); return JSON.stringify({ format: FORMAT, schemaVersion: 1, exportedAt: this.timestamp(), content: content(state), recovery: state.recovery });
        }
        async review(source) {
            const file = parseBackup(source);
            return this.locked(async () => {
                const current = await this.readRaw(), reviewId = this.nextId();
                const next = this.replacement(current, file, this.nextId(), this.timestamp());
                // Verify projected storage capacity before asking the user to accept.
                this.finish(clone(next), reviewId);
                const local = new Map(current.records.map(record => [record.id, record]));
                const plan = freeze({ reviewId, source, revision: current.revision, incoming: counts({ ...file.content, recovery: file.recovery }), current: counts(current),
                    conflicts: file.content.records.filter(record => local.has(record.id)).map(record => ({ id: record.id,
                        changed: !same(record, local.get(record.id)), localVersionId: local.get(record.id).currentVersionId, incomingVersionId: record.currentVersionId })) });
                this.reviews.set(reviewId, { public: plan, next });
                // Expiring read-only previews never discards saved user data.
                if (this.reviews.size > 16) this.reviews.delete(this.reviews.keys().next().value);
                return plan;
            });
        }
    }
    return { KEY, LOCK, FORMAT, LIMITS, Store, createChromeBackend, initial, validate, validateRecord, validateContent,
        parseBackup, counts, content, createDraft, search, previewTemplate, renderTemplate, getVersion, fault };
});
