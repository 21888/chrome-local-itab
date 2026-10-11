/* Manually saved AI excerpts. No providers, page reads, clipboard or network. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabAICollections = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const KEY = '__localItabAICollectionsV1', LOCK = 'local-itab-ai-collections-v1';
    const FORMAT = 'local-itab-ai-collections';
    const TYPES = Object.freeze(['answer', 'code', 'plan', 'other']);
    const LIMITS = Object.freeze({ records: 200, title: 200, body: 32000, notes: 16000, tags: 20, tag: 64,
        tool: 200, url: 2048, versions: 20, recovery: 8, bytes: 2 * 1024 * 1024, query: 500 });
    const EDITABLE = ['title', 'body', 'type', 'tags', 'tool', 'sourceUrl', 'notes', 'promptRef'];
    const RECORD_KEYS = ['id', 'version', 'revision', ...EDITABLE, 'createdAt', 'updatedAt', 'deletedAt', 'currentVersionId', 'history'];
    const REVISION_KEYS = ['reviewId', 'id', 'version', 'body', 'previousVersionId', 'restoredFromVersionId'];
    const REPLACE_KEYS = ['reviewId', 'source', 'revision', 'incoming', 'current', 'conflicts', 'promptReferences'];
    const clone = value => JSON.parse(JSON.stringify(value)); // Internal, already validated JSON only.
    const bytes = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
    const token = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
    const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
        Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
    const unicode = value => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value);
    const faults = new WeakSet();
    function fault(code) { const error = new Error(`Local AI collections: ${code}`); error.code = code; faults.add(error); return error; }
    function check(ok, code = 'INVALID') { if (!ok) throw fault(code); }
    // Copy plain own data without invoking getters, toJSON, or inherited fields.
    // All public object inputs cross this bounded boundary before inspection.
    function snapshot(input) {
        let nodes = 0, size = 0; const ancestors = new Set();
        const visit = (value, depth) => {
            check(++nodes <= 60000 && depth <= 12, 'INPUT_LIMIT');
            if (value === null || typeof value === 'boolean') return value;
            if (typeof value === 'number') { check(Number.isFinite(value)); return value; }
            if (typeof value === 'string') {
                check(value.length <= LIMITS.bytes + 65536, 'INPUT_LIMIT');
                size += bytes(value); check(size <= LIMITS.bytes + 65536, 'INPUT_LIMIT'); return value;
            }
            check(value && typeof value === 'object' && !ancestors.has(value));
            const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
            check(array ? prototype === Array.prototype : prototype === Object.prototype || prototype === null);
            const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
            check(keys.length <= 10000, 'INPUT_LIMIT');
            for (const key of keys) {
                check(typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key));
                const descriptor = descriptors[key];
                check(Object.hasOwn(descriptor, 'value') && (descriptor.enumerable || (array && key === 'length')));
            }
            ancestors.add(value); let result;
            if (array) {
                const length = descriptors.length.value;
                check(length <= 10000 && keys.length === length + 1, 'INPUT_LIMIT'); result = [];
                for (let index = 0; index < length; index++) {
                    check(Object.hasOwn(descriptors, String(index))); result.push(visit(descriptors[index].value, depth + 1));
                }
            } else {
                result = {};
                for (const key of keys) { check(key.length <= 100, 'INPUT_LIMIT'); result[key] = visit(descriptors[key].value, depth + 1); }
            }
            ancestors.delete(value); return result;
        };
        try { return visit(input, 0); } catch (error) {
            if (faults.has(error)) throw error;
            throw fault('INVALID');
        }
    }
    function dictionary(value) { check(value && typeof value === 'object' && !Array.isArray(value)); }
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
        check(value.length <= limit * 2 && Array.from(value).length <= limit, 'TEXT_LIMIT');
        check(!(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value), 'TEXT');
        return value;
    }
    function sourceMetadata(sourceUrl) {
        text(sourceUrl, LIMITS.url);
        if (sourceUrl === '') return { provided: false, attribution: 'not-provided', href: null, host: null, hostname: null, protocol: null };
        check(/^https?:\/\//i.test(sourceUrl) && !/[\s\\\p{Bidi_Control}]/u.test(sourceUrl), 'SOURCE_URL');
        let parsed; try { parsed = new URL(sourceUrl); } catch (_) { throw fault('SOURCE_URL'); }
        const authority = sourceUrl.slice(sourceUrl.indexOf('://') + 3).split(/[/?#]/u)[0];
        check(['http:', 'https:'].includes(parsed.protocol) && authority && parsed.hostname && !parsed.username && !parsed.password && !authority.includes('@'), 'SOURCE_URL');
        return { provided: true, attribution: 'user-provided', href: parsed.href, host: parsed.host, hostname: parsed.hostname, protocol: parsed.protocol };
    }
    function reference(value) {
        if (value === null) return;
        object(value, ['promptId', 'bodyVersionId']); check(token(value.promptId) && token(value.bodyVersionId), 'PROMPT_REFERENCE');
    }
    function editable(value) {
        text(value.title, LIMITS.title, true); text(value.body, LIMITS.body, true, true);
        text(value.tool, LIMITS.tool); text(value.notes, LIMITS.notes, false, true); sourceMetadata(value.sourceUrl); reference(value.promptRef);
        check(TYPES.includes(value.type), 'TYPE');
        check(Array.isArray(value.tags) && value.tags.length <= LIMITS.tags, 'TAGS');
        const seen = new Set();
        for (const tag of value.tags) {
            text(tag, LIMITS.tag, true); check(!seen.has(tag.toLowerCase()), 'TAGS'); seen.add(tag.toLowerCase());
        }
        return value;
    }
    function fields(value) { return Object.fromEntries(EDITABLE.map(key => [key, clone(value[key])])); }
    function recordSchema(record) {
        object(record, RECORD_KEYS); check(token(record.id) && token(record.version));
        check(Number.isSafeInteger(record.revision) && record.revision >= 1); editable(record);
        check(date(record.createdAt) && date(record.updatedAt) && record.updatedAt >= record.createdAt);
        check(record.deletedAt === null || (date(record.deletedAt) && record.deletedAt >= record.createdAt && record.deletedAt <= record.updatedAt));
        check(Array.isArray(record.history) && record.history.length >= 1 && record.history.length <= LIMITS.versions, 'HISTORY_LIMIT');
        const seen = new Set(); let previous = record.createdAt;
        for (const entry of record.history) {
            object(entry, ['id', 'body', 'createdAt']); check(token(entry.id) && !seen.has(entry.id)); seen.add(entry.id);
            text(entry.body, LIMITS.body, true, true);
            check(date(entry.createdAt) && entry.createdAt >= previous && entry.createdAt <= record.updatedAt); previous = entry.createdAt;
        }
        check(record.history[0].createdAt === record.createdAt);
        const latest = record.history.at(-1); check(record.currentVersionId === latest.id && record.body === latest.body);
        return record;
    }
    function contentSchema(value) {
        object(value, ['records']); check(Array.isArray(value.records) && value.records.length <= LIMITS.records, 'CAPACITY');
        const ids = new Set(), versions = new Set();
        for (const record of value.records) {
            recordSchema(record); check(!ids.has(record.id)); ids.add(record.id);
            for (const entry of record.history) { check(!versions.has(entry.id)); versions.add(entry.id); }
        }
        return value;
    }
    function checkIdentities(contents) {
        const records = new Map(), versions = new Map();
        for (const group of contents) for (const record of group.records) {
            check(!records.has(record.id) || records.get(record.id) === record.createdAt, 'IDENTITY_CONFLICT'); records.set(record.id, record.createdAt);
            for (const entry of record.history) {
                const identity = { recordId: record.id, ...entry }, previous = versions.get(entry.id);
                check(!previous || same(previous, identity), 'IDENTITY_CONFLICT'); versions.set(entry.id, identity);
            }
        }
    }
    function recoverySchema(recovery) {
        check(Array.isArray(recovery) && recovery.length <= LIMITS.recovery, 'RECOVERY_LIMIT'); const seen = new Set();
        for (const item of recovery) {
            object(item, ['id', 'createdAt', 'content']); check(token(item.id) && !seen.has(item.id) && date(item.createdAt));
            seen.add(item.id); contentSchema(item.content);
        }
    }
    function initial() { return { schemaVersion: 1, revision: 0, enabled: false, records: [], recovery: [], receipts: [] }; }
    const storedContent = state => clone({ records: state.records });
    function stateSchema(value) {
        object(value, ['schemaVersion', 'revision', 'enabled', 'records', 'recovery', 'receipts']); check(value.schemaVersion === 1, 'VERSION');
        check(Number.isSafeInteger(value.revision) && value.revision >= 0 && typeof value.enabled === 'boolean');
        contentSchema({ records: value.records }); recoverySchema(value.recovery);
        checkIdentities([{ records: value.records }, ...value.recovery.map(item => item.content)]);
        check(Array.isArray(value.receipts) && value.receipts.length <= 1);
        for (const receipt of value.receipts) {
            object(receipt, ['id', 'digest', 'stateDigest']); check(token(receipt.id) &&
                [receipt.digest, receipt.stateDigest].every(value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)));
        }
        check(bytes(value) <= LIMITS.bytes - 16384, 'SIZE_LIMIT'); return value;
    }
    const validate = value => stateSchema(snapshot(value));
    const validateRecord = value => recordSchema(snapshot(value));
    const validateContent = value => contentSchema(snapshot(value));
    const content = value => storedContent(validate(value));
    function rejectDuplicateKeys(source) {
        let cursor = 0, nodes = 0;
        const space = () => { while (/\s/u.test(source[cursor] || '') && cursor < source.length) cursor++; };
        const stringEnd = () => {
            const start = cursor++;
            while (cursor < source.length) {
                const character = source[cursor++];
                if (character === '"') return source.slice(start, cursor);
                if (character === '\\') cursor++;
            }
            throw fault('INVALID');
        };
        const value = depth => {
            check(++nodes <= 60000 && depth <= 12, 'INPUT_LIMIT'); space();
            if (source[cursor] === '"') { stringEnd(); return; }
            if (source[cursor] === '{') {
                cursor++; space(); const keys = new Set(); if (source[cursor] === '}') { cursor++; return; }
                while (cursor < source.length) {
                    const key = JSON.parse(stringEnd()); check(!keys.has(key), 'DUPLICATE_KEY'); keys.add(key);
                    space(); cursor++; value(depth + 1); space(); if (source[cursor++] === '}') return; space();
                }
            } else if (source[cursor] === '[') {
                cursor++; space(); if (source[cursor] === ']') { cursor++; return; }
                while (cursor < source.length) { value(depth + 1); space(); if (source[cursor++] === ']') return; }
            } else {
                while (cursor < source.length && !/[\s,}\]]/u.test(source[cursor])) cursor++;
                return;
            }
        };
        value(0);
    }
    function parseBackup(source) {
        check(typeof source === 'string' && source.length <= LIMITS.bytes && bytes(source) <= LIMITS.bytes, 'SIZE_LIMIT');
        let file; try { file = JSON.parse(source); } catch (_) { throw fault('INVALID'); }
        rejectDuplicateKeys(source); file = snapshot(file); object(file, ['format', 'schemaVersion', 'exportedAt', 'content', 'recovery']);
        check(file.format === FORMAT && file.schemaVersion === 1, 'VERSION'); check(date(file.exportedAt));
        contentSchema(file.content); recoverySchema(file.recovery); checkIdentities([file.content, ...file.recovery.map(item => item.content)]);
        return file;
    }
    function countContent(state) {
        return { active: state.records.filter(record => record.deletedAt === null).length,
            removed: state.records.filter(record => record.deletedAt !== null).length,
            versions: state.records.reduce((sum, record) => sum + record.history.length, 0), recovery: state.recovery.length };
    }
    const counts = state => countContent(validate(state));
    function createDraft(record) {
        if (record === undefined) return { title: '', body: '', type: 'answer', tags: [], tool: '', sourceUrl: '', notes: '', promptRef: null };
        record = validateRecord(record); return { id: record.id, version: record.version, ...fields(record) };
    }
    function search(state, query = '', options = {}) {
        state = validate(state); text(query, LIMITS.query, false, true); options = snapshot(options); dictionary(options);
        check(Object.keys(options).every(key => ['removed', 'type', 'ids'].includes(key)));
        check(options.removed === undefined || typeof options.removed === 'boolean'); check(options.type === undefined || TYPES.includes(options.type));
        if (options.ids !== undefined) check(Array.isArray(options.ids) && options.ids.length <= LIMITS.records && options.ids.every(token));
        const ids = options.ids === undefined ? null : new Set(options.ids), terms = query.toLowerCase().trim().split(/\s+/u).filter(Boolean), results = [];
        for (const record of state.records) {
            if ((record.deletedAt !== null) !== (options.removed === true) || (ids && !ids.has(record.id)) || (options.type !== undefined && options.type !== record.type)) continue;
            const searchable = { title: record.title, body: record.body, tags: record.tags.join('\n') };
            const normalized = Object.fromEntries(Object.entries(searchable).map(([key, value]) => [key, value.toLowerCase()]));
            if (!terms.every(term => Object.values(normalized).some(value => value.includes(term)))) continue;
            const matchedFields = Object.keys(normalized).filter(key => terms.some(term => normalized[key].includes(term)));
            const field = matchedFields.includes('body') ? 'body' : matchedFields[0] || 'body', original = searchable[field];
            const first = terms.map(term => normalized[field].indexOf(term)).filter(index => index >= 0);
            const position = first.length ? Array.from(original.slice(0, Math.min(...first))).length : 0;
            const points = Array.from(original), start = Math.max(0, position - 40), end = Math.min(points.length, start + 180);
            results.push({ record: clone(record), matchedFields, snippet: `${start ? '…' : ''}${points.slice(start, end).join('')}${end < points.length ? '…' : ''}` });
        }
        return results.sort((a, b) => b.record.updatedAt.localeCompare(a.record.updatedAt) || a.record.id.localeCompare(b.record.id));
    }
    function findDuplicates(state, input) {
        state = validate(state); input = snapshot(input); object(input, ['body', 'sourceUrl']); text(input.body, LIMITS.body, true, true);
        const source = sourceMetadata(input.sourceUrl);
        return state.records.filter(record => record.body === input.body && sourceMetadata(record.sourceUrl).href === source.href)
            .map(record => ({ id: record.id, title: record.title, deletedAt: record.deletedAt,
                reason: source.provided ? 'same-source-and-body' : 'same-body-no-source' }));
    }
    function getVersion(state, recordId, versionId) {
        state = validate(state); check(token(recordId) && token(versionId));
        for (const group of [{ records: state.records }, ...state.recovery.map(item => item.content)]) {
            const record = group.records.find(item => item.id === recordId), version = record?.history.find(item => item.id === versionId);
            if (version) return clone({ recordId, ...version });
        }
        return null;
    }
    function resolvePromptReference(record, getPromptVersion) {
        record = validateRecord(record); const ref = record.promptRef;
        if (ref === null) return { status: 'unlinked', reference: null, version: null };
        check(getPromptVersion === undefined || typeof getPromptVersion === 'function');
        const result = getPromptVersion ? getPromptVersion(ref.promptId, ref.bodyVersionId) : null;
        if (result === null || result === undefined) return { status: 'unresolved', reference: ref, version: null };
        const version = snapshot(result); object(version, ['recordId', 'id', 'body', 'createdAt']);
        check(version.recordId === ref.promptId && version.id === ref.bodyVersionId && date(version.createdAt), 'PROMPT_REFERENCE');
        text(version.body, LIMITS.body, true, true); return { status: 'resolved', reference: ref, version };
    }
    function createChromeBackend(chromeApi = globalThis.chrome, locks = globalThis.navigator?.locks) {
        check(chromeApi?.storage?.local && locks?.request, 'UNAVAILABLE');
        return {
            lock: action => locks.request(LOCK, { mode: 'exclusive' }, async () => {
                const marker = (await chromeApi.storage.local.get(['__localItabCombinedRestoreV1'])).__localItabCombinedRestoreV1;
                check(marker === undefined || (marker?.schemaVersion === 1 && ['verified', 'recovered'].includes(marker.status)), 'RESTORE_PENDING');
                return action();
            }),
            read: async () => { const result = snapshot(await chromeApi.storage.local.get([KEY])); dictionary(result); return result[KEY]; },
            write: state => chromeApi.storage.local.set({ [KEY]: state }),
            subscribe(listener) {
                const changed = (changes, area) => { if (area === 'local' && (Object.hasOwn(changes, KEY) || Object.hasOwn(changes, '__localItabCombinedRestoreV1'))) listener(); };
                chromeApi.storage.onChanged.addListener(changed); return () => chromeApi.storage.onChanged.removeListener(changed);
            }
        };
    }
    function randomId() { check(globalThis.crypto?.randomUUID, 'UNAVAILABLE'); return globalThis.crypto.randomUUID(); }
    function canonical(value) {
        if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
        if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
        return JSON.stringify(value);
    }
    async function digest(value) {
        check(globalThis.crypto?.subtle, 'UNAVAILABLE');
        const hash = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
        return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    class Store {
        constructor(backend = createChromeBackend(), options = {}) {
            this.backend = backend; this.id = options.id || randomId; this.now = options.now || (() => new Date().toISOString()); this.reviews = new Map();
        }
        nextId() { const value = this.id(); check(token(value)); return value; }
        timestamp() { const value = this.now(); check(date(value)); return value; }
        async readRaw() {
            let raw; try { raw = await this.backend.read(); } catch (_) { throw fault('READ'); }
            return raw === undefined ? initial() : validate(raw);
        }
        async locked(action) {
            let entered = false;
            try { return await this.backend.lock(() => { entered = true; return action(); }); }
            catch (error) { if (faults.has(error)) throw error; throw fault(entered ? 'VERIFY' : 'LOCK'); }
        }
        read() { return this.locked(() => this.readRaw()); }
        subscribe(listener) { return this.backend.subscribe(listener); }
        request(kind, values = {}) {
            values = snapshot(values); dictionary(values); check(typeof kind === 'string');
            check(!Object.hasOwn(values, 'kind') && !Object.hasOwn(values, 'operationId'));
            return freeze({ ...values, kind, operationId: this.nextId() });
        }
        finish(next, operationId, hash) {
            next.revision++; next.receipts = [{ id: operationId, digest: hash, stateDigest: '0'.repeat(64) }]; return stateSchema(next);
        }
        remember(plan, privateValue) {
            check(!this.reviews.has(plan.reviewId), 'CONFLICT'); this.reviews.set(plan.reviewId, { public: plan, ...privateValue });
            if (this.reviews.size > 16) this.reviews.delete(this.reviews.keys().next().value); return plan;
        }
        renewRecords(records, current) {
            const revisions = new Map();
            for (const record of [...current.records, ...current.recovery.flatMap(item => item.content.records)])
                revisions.set(record.id, Math.max(revisions.get(record.id) || 0, record.revision));
            return clone(records).map(record => {
                const version = this.nextId(); check(version !== record.version && !current.records.some(item => item.version === version), 'CONFLICT');
                return { ...record, version, revision: Math.max(record.revision, revisions.get(record.id) || 0) + 1 };
            });
        }
        replacement(current, file, snapshotId, now) {
            const next = clone(current);
            checkIdentities([{ records: current.records }, ...current.recovery.map(item => item.content), file.content, ...file.recovery.map(item => item.content)]);
            for (const item of file.recovery) {
                const existing = next.recovery.find(value => value.id === item.id);
                check(!existing || same(existing, item), 'CONFLICT'); if (!existing) next.recovery.push(clone(item));
            }
            if (current.records.length) {
                check(next.recovery.length < LIMITS.recovery, 'RECOVERY_LIMIT'); check(!next.recovery.some(item => item.id === snapshotId), 'CONFLICT');
                next.recovery.push({ id: snapshotId, createdAt: now, content: storedContent(current) });
            }
            next.records = this.renewRecords(file.content.records, current); return next;
        }
        async mutate(command, validatePrompt = null) {
            command = snapshot(command); dictionary(command); check(token(command.operationId));
            const hash = await digest(command);
            return this.locked(async () => {
                const current = await this.readRaw(), receipt = current.receipts[0];
                if (receipt?.id === command.operationId) {
                    check(receipt.digest === hash && receipt.stateDigest === await digest({ ...current, receipts: [] }), 'CONFLICT'); return current;
                }
                // Ephemeral handoff guard, inside the existing workspace/collection fence.
                // Receipt reconciliation above must remain possible after a later archive.
                if (validatePrompt) {
                    check(typeof validatePrompt === 'function' && typeof this.backend.readPromptState === 'function', 'PROMPT_UNAVAILABLE');
                    let prompts; try { prompts = await this.backend.readPromptState(); } catch (_) { throw fault('READ'); }
                    check(validatePrompt(prompts, command.promptRef) === true, 'PROMPT_UNAVAILABLE');
                }
                let next = clone(current); const now = this.timestamp();
                const find = () => {
                    const record = next.records.find(item => item.id === command.id);
                    check(record && record.version === command.version, 'CONFLICT'); return record;
                };
                const touch = record => {
                    const version = this.nextId(); check(!next.records.some(item => item.version === version), 'CONFLICT');
                    record.version = version; record.revision++; record.updatedAt = now > record.updatedAt ? now : record.updatedAt;
                };
                const appendVersion = (record, body) => {
                    check(record.history.length < LIMITS.versions, 'HISTORY_LIMIT'); const versionId = this.nextId();
                    check(![...next.records, ...next.recovery.flatMap(item => item.content.records)].some(item => item.history.some(entry => entry.id === versionId)), 'CONFLICT');
                    record.history.push({ id: versionId, body, createdAt: now > record.updatedAt ? now : record.updatedAt }); record.currentVersionId = versionId; record.body = body;
                };
                switch (command.kind) {
                case 'enable':
                    object(command, ['operationId', 'kind', 'enabled', 'revision']); check(current.revision === command.revision, 'CONFLICT'); check(typeof command.enabled === 'boolean');
                    if (next.enabled === command.enabled) return current; next.enabled = command.enabled; break;
                case 'add': {
                    check(Object.keys(command).every(key => ['operationId', 'kind', ...EDITABLE].includes(key)));
                    const value = editable({ type: 'answer', tags: [], tool: '', sourceUrl: '', notes: '', promptRef: null, ...command });
                    check(next.records.length < LIMITS.records, 'CAPACITY');
                    check(![...next.records, ...next.recovery.flatMap(item => item.content.records)].some(item => item.id === command.operationId), 'CONFLICT');
                    const bodyId = this.nextId(), version = this.nextId();
                    check(![...next.records, ...next.recovery.flatMap(item => item.content.records)].some(item => item.history.some(entry => entry.id === bodyId)), 'CONFLICT');
                    check(!next.records.some(item => item.version === version), 'CONFLICT');
                    next.records.push({ id: command.operationId, version, revision: 1, ...fields(value), createdAt: now, updatedAt: now,
                        deletedAt: null, currentVersionId: bodyId, history: [{ id: bodyId, body: value.body, createdAt: now }] }); break;
                }
                case 'edit': {
                    check(Object.keys(command).every(key => ['operationId', 'kind', 'id', 'version', ...EDITABLE].includes(key)));
                    const record = find(); check(record.deletedAt === null, 'CONFLICT'); const values = fields(record);
                    for (const key of EDITABLE) if (Object.hasOwn(command, key)) values[key] = command[key];
                    editable(values); check(record.body === values.body, 'REVIEW_REQUIRED'); if (same(fields(record), values)) return current;
                    Object.assign(record, values); touch(record); break;
                }
                case 'revise': {
                    object(command, ['operationId', 'kind', ...REVISION_KEYS]);
                    const plan = this.reviews.get(command.reviewId), supplied = Object.fromEntries(REVISION_KEYS.map(key => [key, command[key]]));
                    check(plan?.kind === 'revise' && same(plan.public, supplied), 'REVIEW_REQUIRED');
                    const record = find(); check(record.deletedAt === null && record.currentVersionId === command.previousVersionId, 'CONFLICT');
                    if (record.body === command.body) return current; appendVersion(record, command.body); touch(record); break;
                }
                case 'remove': case 'restore': {
                    object(command, ['operationId', 'kind', 'id', 'version']); const record = find();
                    check((record.deletedAt === null) === (command.kind === 'remove'), 'CONFLICT'); touch(record); record.deletedAt = command.kind === 'remove' ? record.updatedAt : null; break;
                }
                case 'replace': {
                    object(command, ['operationId', 'kind', ...REPLACE_KEYS]);
                    const plan = this.reviews.get(command.reviewId), supplied = Object.fromEntries(REPLACE_KEYS.map(key => [key, command[key]]));
                    check(plan?.kind === 'replace' && same(plan.public, supplied), 'REVIEW_REQUIRED'); check(current.revision === plan.public.revision, 'CONFLICT');
                    next = clone(plan.next); break;
                }
                case 'recover': {
                    object(command, ['operationId', 'kind', 'id', 'revision']); check(current.revision === command.revision, 'CONFLICT');
                    const saved = next.recovery.find(item => item.id === command.id); check(saved, 'CONFLICT');
                    next.recovery = next.recovery.filter(item => item.id !== command.id); const snapshotId = this.nextId();
                    check(!next.recovery.some(item => item.id === snapshotId), 'CONFLICT');
                    next.recovery.push({ id: snapshotId, createdAt: now, content: storedContent(current) });
                    next.records = this.renewRecords(saved.content.records, current); break;
                }
                default: throw fault('INVALID');
                }
                this.finish(next, command.operationId, hash);
                next.receipts[0].stateDigest = await digest({ ...next, receipts: [] });
                try { if (await this.backend.write(next) === false) throw fault('WRITE'); } catch (_) { throw fault('WRITE'); }
                const verified = await this.readRaw(); check(same(verified, next), 'VERIFY'); return verified;
            });
        }
        async export(options = {}) {
            options = snapshot(options); dictionary(options); check(Object.keys(options).every(key => key === 'omitSourceUrls'));
            check(options.omitSourceUrls === undefined || typeof options.omitSourceUrls === 'boolean');
            const state = await this.read(), file = { format: FORMAT, schemaVersion: 1, exportedAt: this.timestamp(), content: storedContent(state), recovery: state.recovery };
            if (options.omitSourceUrls) for (const group of [file.content, ...file.recovery.map(item => item.content)]) for (const record of group.records) record.sourceUrl = '';
            return JSON.stringify(file);
        }
        async review(source) {
            const file = parseBackup(source);
            return this.locked(async () => {
                const current = await this.readRaw(), reviewId = this.nextId(), next = this.replacement(current, file, this.nextId(), this.timestamp());
                this.finish(clone(next), reviewId, '0'.repeat(64));
                const local = new Map(current.records.map(record => [record.id, record]));
                const plan = freeze({ reviewId, source, revision: current.revision, incoming: countContent({ ...file.content, recovery: file.recovery }), current: countContent(current),
                    conflicts: file.content.records.filter(record => local.has(record.id)).map(record => ({ id: record.id, changed: !same(record, local.get(record.id)),
                        localVersionId: local.get(record.id).currentVersionId, incomingVersionId: record.currentVersionId })),
                    promptReferences: [{ location: 'live', recoveryId: null, content: file.content },
                        ...file.recovery.map(item => ({ location: 'recovery', recoveryId: item.id, content: item.content }))]
                        .flatMap(group => group.content.records.filter(record => record.promptRef !== null).map(record => ({ location: group.location,
                            recoveryId: group.recoveryId, recordId: record.id, ...record.promptRef, status: 'unresolved' }))) });
                return this.remember(plan, { kind: 'replace', next });
            });
        }
        async reviewRevision(input) { return this.reviewBody(input, false); }
        async reviewVersionRestore(input) { return this.reviewBody(input, true); }
        async reviewBody(input, restore) {
            input = snapshot(input); object(input, ['id', 'version', restore ? 'versionId' : 'body']);
            check(token(input.id) && token(input.version)); if (!restore) text(input.body, LIMITS.body, true, true);
            return this.locked(async () => {
                const state = await this.readRaw(), record = state.records.find(item => item.id === input.id);
                check(record && record.version === input.version && record.deletedAt === null, 'CONFLICT');
                const previous = restore ? record.history.find(item => item.id === input.versionId) : null; if (restore) check(previous, 'CONFLICT');
                const body = restore ? previous.body : input.body;
                if (body !== record.body) {
                    check(record.history.length < LIMITS.versions, 'HISTORY_LIMIT');
                    const projected = clone(state), item = projected.records.find(value => value.id === record.id);
                    item.body = body; item.history.push({ id: 'x'.repeat(100), body, createdAt: record.updatedAt }); item.currentVersionId = 'x'.repeat(100);
                    check(bytes(projected) + 1024 <= LIMITS.bytes - 16384, 'SIZE_LIMIT');
                }
                const plan = freeze({ reviewId: this.nextId(), id: record.id, version: record.version, body,
                    previousVersionId: record.currentVersionId, restoredFromVersionId: restore ? previous.id : null });
                return this.remember(plan, { kind: 'revise' });
            });
        }
    }
    return { KEY, LOCK, FORMAT, TYPES, LIMITS, Store, createChromeBackend, initial, validate, validateRecord, validateContent,
        parseBackup, counts, content, createDraft, search, sourceMetadata, findDuplicates, getVersion, resolvePromptReference, fault };
});
