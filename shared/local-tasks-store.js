/* Device-local personal content. Never call StorageManager or a provider here. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabTasks = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const KEY = '__localItabPersonalTasksV1';
    const LOCK = 'local-itab-personal-tasks-v1';
    const FORMAT = 'local-itab-tasks';
    const LIMITS = Object.freeze({ records: 500, text: 1000, recovery: 8, bytes: 2 * 1024 * 1024 });
    const clone = value => JSON.parse(JSON.stringify(value));
    // Chrome storage preserves values, not JavaScript object insertion order.
    // Arrays remain ordered; dictionaries are compared by their own keys.
    const same = (a, b) => {
        if (a === b) return true;
        if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
        const keys = Object.keys(a);
        return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
    };
    const size = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
    const id = () => {
        if (!globalThis.crypto?.randomUUID) throw fault('UNAVAILABLE');
        return globalThis.crypto.randomUUID();
    };
    function fault(code) { const error = new Error(`Local tasks: ${code}`); error.code = code; return error; }
    function check(value, code = 'INVALID') { if (!value) throw fault(code); }
    function object(value, keys) {
        check(value && typeof value === 'object' && !Array.isArray(value));
        check(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
    }
    const token = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
    const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
    function text(value) {
        check(typeof value === 'string' && value.trim().length > 0, 'TEXT');
        check(Array.from(value).length <= LIMITS.text, 'TEXT_LIMIT');
        check(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), 'TEXT');
        return value;
    }
    function batchTexts(values) {
        check(Array.isArray(values) && values.length > 0, 'TEXT');
        check(values.length <= LIMITS.records, 'CAPACITY');
        for (const value of values) text(value);
        return values;
    }
    function parseBatch(source) {
        check(typeof source === 'string', 'TEXT');
        check(size(source) <= LIMITS.bytes, 'SIZE_LIMIT');
        // Newlines are the only separators. Keep every nonblank line verbatim,
        // including prefixes, whitespace, duplicate text and Unicode separators.
        return batchTexts(source.split(/\r\n|\n|\r/).filter(line => line.trim().length > 0));
    }
    function validateContent(value) {
        object(value, ['records', 'pinnedId']);
        check(Array.isArray(value.records) && value.records.length <= LIMITS.records, 'CAPACITY');
        const seen = new Set();
        for (const task of value.records) {
            object(task, ['id', 'version', 'text', 'state', 'removedFrom', 'createdAt', 'updatedAt']);
            check(token(task.id) && token(task.version) && !seen.has(task.id));
            seen.add(task.id); text(task.text);
            check(['active', 'done', 'removed'].includes(task.state));
            check(task.state === 'removed' ? ['active', 'done'].includes(task.removedFrom) : task.removedFrom === null);
            check(date(task.createdAt) && date(task.updatedAt));
        }
        check(value.pinnedId === null || value.records.some(task => task.id === value.pinnedId && task.state === 'active'));
        return value;
    }
    function validateRecovery(recovery) {
        check(Array.isArray(recovery) && recovery.length <= LIMITS.recovery, 'RECOVERY_LIMIT');
        const seen = new Set();
        for (const item of recovery) {
            object(item, ['id', 'createdAt', 'content']);
            check(token(item.id) && !seen.has(item.id) && date(item.createdAt));
            seen.add(item.id); validateContent(item.content);
        }
    }
    function initial() { return { schemaVersion: 1, revision: 0, enabled: false, records: [], pinnedId: null, recovery: [], receipts: [] }; }
    function validate(value) {
        object(value, ['schemaVersion', 'revision', 'enabled', 'records', 'pinnedId', 'recovery', 'receipts']);
        check(value.schemaVersion === 1, 'VERSION');
        check(Number.isSafeInteger(value.revision) && value.revision >= 0 && typeof value.enabled === 'boolean');
        validateContent({ records: value.records, pinnedId: value.pinnedId }); validateRecovery(value.recovery);
        check(Array.isArray(value.receipts) && value.receipts.length <= 128 && value.receipts.every(token));
        check(new Set(value.receipts).size === value.receipts.length);
        check(size(value) <= LIMITS.bytes - 4096, 'SIZE_LIMIT');
        return value;
    }
    const content = state => clone({ records: state.records, pinnedId: state.pinnedId });
    function parseBackup(source) {
        check(typeof source === 'string' && size(source) <= LIMITS.bytes, 'SIZE_LIMIT');
        let file;
        try { file = JSON.parse(source); } catch (_) { throw fault('INVALID'); }
        object(file, ['format', 'schemaVersion', 'exportedAt', 'content', 'recovery']);
        check(file.format === FORMAT && file.schemaVersion === 1, 'VERSION');
        check(date(file.exportedAt)); validateContent(file.content); validateRecovery(file.recovery);
        return clone(file);
    }
    function counts(state) {
        return { active: state.records.filter(t => t.state === 'active').length,
            done: state.records.filter(t => t.state === 'done').length,
            removed: state.records.filter(t => t.state === 'removed').length, recovery: state.recovery?.length || 0 };
    }
    function appendBatch(next, command) {
        const texts = batchTexts(command.texts);
        check(next.records.length + texts.length <= LIMITS.records, 'CAPACITY');
        check(Array.isArray(command.identities) && command.identities.length === texts.length);
        check(date(command.createdAt));
        // A replaced list can still hold this operation's tasks in recovery after
        // its receipt ages out. Never replay those identities as a fresh append.
        const seen = new Set([...next.records, ...next.recovery.flatMap(item => item.content.records)].map(task => task.id));
        const records = texts.map((value, index) => {
            const identity = command.identities[index];
            object(identity, ['id', 'version']);
            check(token(identity.id) && token(identity.version));
            check(!seen.has(identity.id), 'CONFLICT'); seen.add(identity.id);
            return { id: identity.id, version: identity.version, text: value,
                state: 'active', removedFrom: null, createdAt: command.createdAt, updatedAt: command.createdAt };
        });
        next.records.push(...records);
    }
    function batchTargets(values, withResults = false) {
        check(Array.isArray(values) && values.length > 0 && values.length <= LIMITS.records);
        const seen = new Set();
        return values.map(value => {
            object(value, withResults ? ['id', 'version', 'nextVersion'] : ['id', 'version']);
            check(token(value.id) && token(value.version) && !seen.has(value.id)); seen.add(value.id);
            if (withResults) check(token(value.nextVersion) && value.nextVersion !== value.version);
            return { ...value };
        });
    }
    // Restoration has its own strict target contract. Do not broaden the old
    // completion/reopening targets: revision-free completion Undo stays unchanged.
    function restorationTargets(values, withResults = false) {
        check(Array.isArray(values) && values.length > 0 && values.length <= LIMITS.records);
        const seen = new Set();
        return values.map(value => {
            object(value, withResults ? ['id', 'version', 'removedFrom', 'nextVersion'] : ['id', 'version', 'removedFrom']);
            check(token(value.id) && token(value.version) && !seen.has(value.id)); seen.add(value.id);
            check(value.removedFrom === 'active' || value.removedFrom === 'done');
            if (withResults) check(token(value.nextVersion) && value.nextVersion !== value.version);
            return { ...value };
        });
    }
    function restoreBatch(next, command) {
        check(Number.isSafeInteger(command.revision) && command.revision >= 0);
        check(next.revision === command.revision, 'CONFLICT');
        const targets = restorationTargets(command.targets, true); check(date(command.updatedAt));
        const records = targets.map(target => {
            const task = next.records.find(record => record.id === target.id);
            check(task && task.version === target.version && task.state === 'removed' && task.removedFrom === target.removedFrom, 'CONFLICT');
            return task;
        });
        records.forEach((task, index) => {
            task.state = targets[index].removedFrom; task.removedFrom = null;
            task.version = targets[index].nextVersion; task.updatedAt = command.updatedAt;
        });
        return records;
    }
    function transitionBatch(next, command) {
        const completing = command.kind === 'completeBatch';
        // Reviewed reopening fences the complete list; page-local completion Undo
        // omits revision so unrelated edits and newer pins remain compatible.
        if (completing || Object.hasOwn(command, 'revision')) {
            check(Number.isSafeInteger(command.revision) && command.revision >= 0);
            check(next.revision === command.revision, 'CONFLICT');
        }
        const targets = batchTargets(command.targets, true); check(date(command.updatedAt));
        // Validate every member before changing the private snapshot. No loop of
        // single-record saves, replacement, partial completion or partial Undo.
        const records = targets.map(target => {
            const task = next.records.find(record => record.id === target.id);
            check(task && task.version === target.version && task.state === (completing ? 'active' : 'done'), 'CONFLICT');
            return task;
        });
        records.forEach((task, index) => {
            task.state = completing ? 'done' : 'active'; task.version = targets[index].nextVersion; task.updatedAt = command.updatedAt;
            if (completing && next.pinnedId === task.id) next.pinnedId = null;
        });
        return records;
    }
    function finish(next, operationId) {
        next.revision += 1;
        next.receipts = [...next.receipts, operationId].slice(-128);
        return validate(next);
    }
    function createChromeBackend(chromeApi = globalThis.chrome, locks = globalThis.navigator?.locks, workspace = globalThis.LocalItabWorkspaces?.session) {
        if (workspace) return workspace.createBackend(KEY);
        check(chromeApi?.storage?.local && locks?.request, 'UNAVAILABLE');
        return {
            lock: action => locks.request(LOCK, { mode: 'exclusive' }, action),
            read: async () => {
                const result = await chromeApi.storage.local.get([KEY]);
                check(result && typeof result === 'object' && !Array.isArray(result), 'READ');
                return result[KEY];
            },
            write: state => chromeApi.storage.local.set({ [KEY]: state }),
            subscribe: listener => {
                const changed = (changes, area) => { if (area === 'local' && Object.hasOwn(changes, KEY)) listener(); };
                chromeApi.storage.onChanged.addListener(changed);
                return () => chromeApi.storage.onChanged.removeListener(changed);
            }
        };
    }
    class Store {
        constructor(backend = createChromeBackend(), options = {}) {
            this.backend = backend; this.id = options.id || id;
            this.now = options.now || (() => new Date().toISOString());
        }
        async readRaw(backend = this.backend) {
            let raw;
            try { raw = await backend.read(); } catch (error) { if (error.code?.startsWith('WORKSPACE_')) throw error; throw fault('READ'); }
            return raw === undefined ? initial() : clone(validate(raw));
        }
        read() {
            const backend = this.backend;
            return backend.lock(() => this.readRaw(backend));
        }
        subscribe(listener) { return this.backend.subscribe(listener); }
        request(kind, values = {}) {
            const operationId = this.id();
            if (kind === 'restoreBatch') {
                check(Number.isSafeInteger(values.revision) && values.revision >= 0);
                const targets = Object.freeze(restorationTargets(values.targets).map(target => Object.freeze({ ...target, nextVersion: this.id() })));
                return Object.freeze({ kind, operationId, revision: values.revision, targets, updatedAt: this.now() });
            }
            if (kind === 'completeBatch' || kind === 'reopenBatch') {
                const reviewed = kind === 'completeBatch' || Object.hasOwn(values, 'revision');
                if (reviewed) check(Number.isSafeInteger(values.revision) && values.revision >= 0);
                const targets = Object.freeze(batchTargets(values.targets).map(target => Object.freeze({ ...target, nextVersion: this.id() })));
                return Object.freeze({ kind, operationId, targets, updatedAt: this.now(), ...(reviewed ? { revision: values.revision } : {}) });
            }
            if (kind !== 'addBatch') return { ...values, kind, operationId };
            // Capture identities before the lock and retain this exact command for
            // retries. Mutating the editor's array cannot change a reviewed batch.
            const texts = Object.freeze(batchTexts(values.texts).slice());
            const identities = Object.freeze(texts.map(() => Object.freeze({ id: this.id(), version: this.id() })));
            return Object.freeze({ ...values, texts, identities, createdAt: this.now(), kind, operationId });
        }
        async verifyBatch(command) {
            const backend = this.backend;
            // Receipts contain only operation IDs, not historical command digests.
            // Confirm only that this entire original batch is present unchanged now.
            check(command?.kind === 'addBatch' && token(command.operationId));
            const snapshot = clone(command), expected = initial();
            appendBatch(expected, snapshot); validate(expected);
            return backend.lock(async () => {
                const current = await this.readRaw(backend);
                const matches = current.receipts.includes(snapshot.operationId) &&
                    expected.records.every(record => same(record, current.records.find(task => task.id === record.id)));
                return { matches };
            });
        }
        async mutate(command, guard = null) {
            // One invocation owns one backend before it queues for that lock.
            // Already-started work may finish there; replacing the public field
            // cannot redirect its read, write or verification to another source.
            const backend = this.backend;
            check(command && token(command.operationId), 'INVALID');
            return backend.lock(async () => {
                const current = await this.readRaw(backend);
                if (current.receipts.includes(command.operationId)) {
                    // An acknowledged older operation is not proof its result still exists.
                    // After any later mutation, keep the editor/draft and require review.
                    check(current.receipts.at(-1) === command.operationId, 'CONFLICT');
                    if (command.kind === 'restoreBatch') {
                        check(Number.isSafeInteger(command.revision) && command.revision >= 0);
                        const targets = restorationTargets(command.targets, true); check(date(command.updatedAt));
                        check(targets.every(target => current.records.some(task => task.id === target.id && task.version === target.nextVersion &&
                            task.state === target.removedFrom && task.removedFrom === null && task.updatedAt === command.updatedAt)), 'CONFLICT');
                    }
                    if (command.kind === 'completeBatch' || command.kind === 'reopenBatch') {
                        const targets = batchTargets(command.targets, true), state = command.kind === 'completeBatch' ? 'done' : 'active';
                        // IDs in a receipt do not prove all members were persisted.
                        // Retried batch results must still match every fixed result.
                        check(targets.every(target => current.records.some(task => task.id === target.id && task.version === target.nextVersion &&
                            task.state === state && task.updatedAt === command.updatedAt)), 'CONFLICT');
                    }
                    return current;
                }
                // Optional reviewed-command precondition, synchronous and inside the existing write fence.
                // Receipt retries above acknowledge the original write without replaying it.
                if (guard !== null) {
                    check(typeof guard === 'function', 'INVALID');
                    const result = guard(clone(current));
                    check(result === undefined || result === true, 'CONFLICT');
                }
                const next = clone(current);
                const now = this.now();
                const find = () => {
                    const task = next.records.find(t => t.id === command.id);
                    check(task && task.version === command.version, 'CONFLICT');
                    return task;
                };
                const touch = task => { task.version = this.id(); task.updatedAt = now; };
                const unpin = task => { if (next.pinnedId === task.id) next.pinnedId = null; };
                switch (command.kind) {
                case 'enable':
                    check(typeof command.enabled === 'boolean'); next.enabled = command.enabled; break;
                case 'add': {
                    text(command.text); check(next.records.length < LIMITS.records, 'CAPACITY');
                    check(!next.records.some(t => t.id === command.operationId), 'CONFLICT');
                    next.records.push({ id: command.operationId, version: this.id(), text: command.text,
                        state: 'active', removedFrom: null, createdAt: now, updatedAt: now }); break;
                }
                case 'addBatch': appendBatch(next, command); break;
                case 'restoreBatch': restoreBatch(next, command); break;
                case 'completeBatch': case 'reopenBatch': transitionBatch(next, command); break;
                case 'edit': {
                    const task = find(); check(task.state !== 'removed', 'CONFLICT'); text(command.text);
                    task.text = command.text; touch(task); break;
                }
                case 'completePinned': case 'complete': case 'reopen': {
                    const completing = command.kind !== 'reopen';
                    const task = find(); check(task.state === (completing ? 'active' : 'done'), 'CONFLICT');
                    // Pin changes do not touch task versions. The Next up action must
                    // check both identities in this same lock; ordinary rows are unchanged.
                    if (command.kind === 'completePinned') check(command.expectedPin === task.id && current.pinnedId === command.expectedPin, 'CONFLICT');
                    task.state = completing ? 'done' : 'active'; unpin(task); touch(task); break;
                }
                case 'pin': {
                    const task = find(); check(task.state === 'active' && current.pinnedId === command.expectedPin, 'CONFLICT');
                    next.pinnedId = current.pinnedId === task.id ? null : task.id; break;
                }
                case 'move': {
                    const task = find(); check(task.state === 'active');
                    const active = next.records.filter(t => t.state === 'active').map(t => t.id);
                    check(JSON.stringify(active) === JSON.stringify(command.order), 'CONFLICT');
                    check(command.direction === -1 || command.direction === 1);
                    const index = active.indexOf(task.id), neighbor = active[index + command.direction];
                    check(neighbor, 'CONFLICT');
                    const a = next.records.findIndex(t => t.id === task.id), b = next.records.findIndex(t => t.id === neighbor);
                    [next.records[a], next.records[b]] = [next.records[b], next.records[a]]; break;
                }
                case 'moveFirst': {
                    const task = find(); check(task.state === 'active', 'CONFLICT');
                    const slots = next.records.flatMap((record, index) => record.state === 'active' ? [index] : []);
                    const active = slots.map(index => next.records[index].id);
                    check(JSON.stringify(active) === JSON.stringify(command.order), 'CONFLICT');
                    const index = active.indexOf(task.id); check(index > 0, 'CONFLICT');
                    // Equivalent to successive upward swaps, in one write. Inactive
                    // slots and every record's content/version/timestamps stay intact.
                    for (let i = index; i > 0; i--) next.records[slots[i]] = next.records[slots[i - 1]];
                    next.records[slots[0]] = task; break;
                }
                case 'moveLast': {
                    const task = find(); check(task.state === 'active', 'CONFLICT');
                    const slots = next.records.flatMap((record, index) => record.state === 'active' ? [index] : []);
                    const active = slots.map(index => next.records[index].id);
                    check(JSON.stringify(active) === JSON.stringify(command.order), 'CONFLICT');
                    const index = active.indexOf(task.id); check(index >= 0 && index < active.length - 1, 'CONFLICT');
                    // Rotate only the following active slots, once. Inactive slots,
                    // record identities/content and the independent pin stay intact.
                    for (let i = index; i < slots.length - 1; i++) next.records[slots[i]] = next.records[slots[i + 1]];
                    next.records[slots.at(-1)] = task; break;
                }
                case 'remove': {
                    const task = find(); check(task.state !== 'removed', 'CONFLICT');
                    task.removedFrom = task.state; task.state = 'removed'; unpin(task); touch(task); break;
                }
                case 'restore': {
                    const task = find(); check(task.state === 'removed', 'CONFLICT');
                    task.state = task.removedFrom; task.removedFrom = null; touch(task); break;
                }
                case 'replace': case 'recover': {
                    check(current.revision === command.revision, 'CONFLICT');
                    let target, incoming = [];
                    if (command.kind === 'replace') {
                        const file = parseBackup(command.source); target = file.content; incoming = file.recovery;
                    } else {
                        const snapshot = next.recovery.find(item => item.id === command.id);
                        check(snapshot, 'CONFLICT'); target = snapshot.content;
                        next.recovery = next.recovery.filter(item => item.id !== command.id);
                    }
                    for (const backup of incoming) {
                        const existing = next.recovery.find(item => item.id === backup.id);
                        check(!existing || same(existing, backup), 'CONFLICT');
                        if (!existing) next.recovery.push(clone(backup));
                    }
                    // A full archive may enter an empty destination without adding a
                    // redundant empty snapshot. Never omit existing history or a list
                    // containing even one completed/removed task; recover is unchanged.
                    const omitEmptySnapshot = command.kind === 'replace' &&
                        current.records.length === 0 && current.pinnedId === null &&
                        current.recovery.length === 0 && next.recovery.length === LIMITS.recovery;
                    if (!omitEmptySnapshot) {
                        check(next.recovery.length < LIMITS.recovery, 'RECOVERY_LIMIT');
                        next.recovery.push({ id: this.id(), createdAt: now, content: content(current) });
                    }
                    next.records = clone(target.records).map(task => ({ ...task, version: this.id() }));
                    next.pinnedId = target.pinnedId; break;
                }
                default: throw fault('INVALID');
                }
                finish(next, command.operationId);
                try { if (await backend.write(next) === false) throw fault('WRITE'); }
                catch (_) { throw fault('WRITE'); }
                // Never advertise Saved merely because the write promise resolved.
                const verified = await this.readRaw(backend);
                check(same(verified, next), 'VERIFY');
                return verified;
            });
        }
        async export() {
            const state = await this.read();
            return JSON.stringify({ format: FORMAT, schemaVersion: 1, exportedAt: this.now(), content: content(state), recovery: state.recovery });
        }
        async review(source) {
            const file = parseBackup(source); const current = await this.read();
            // Build no replacement until explicit confirmation. Snapshot is a checked precondition.
            return { source, revision: current.revision, incoming: counts({ ...file.content, recovery: file.recovery }), current: counts(current) };
        }
        async reviewRestoration(selected) {
            const backend = this.backend;
            // Capture the exact identities and destinations synchronously before
            // waiting for storage. No selection mutation can substitute a target.
            const targets = restorationTargets(selected);
            return backend.lock(async () => {
                const current = await this.readRaw(backend), next = clone(current);
                const command = this.request('restoreBatch', { targets, revision: current.revision });
                const records = Object.freeze(targets.map(target => {
                    const task = current.records.find(record => record.id === target.id && record.version === target.version &&
                        record.state === 'removed' && record.removedFrom === target.removedFrom);
                    check(task, 'CONFLICT'); return Object.freeze({ ...task });
                }));
                restoreBatch(next, command); finish(next, command.operationId);
                return Object.freeze({ records, count: records.length, revision: current.revision, clearsPin: false, command });
            });
        }
        reviewCompletion(selected) { return this.reviewTransition('completeBatch', selected); }
        reviewReopening(selected) { return this.reviewTransition('reopenBatch', selected); }
        async reviewTransition(kind, selected) {
            const backend = this.backend;
            check(kind === 'completeBatch' || kind === 'reopenBatch');
            const completing = kind === 'completeBatch';
            // Capture identities before waiting for the lock. Selection controls
            // cannot rewrite this read-only review or its eventual command.
            const targets = batchTargets(selected);
            return backend.lock(async () => {
                const current = await this.readRaw(backend), next = clone(current);
                const command = this.request(kind, { targets, revision: current.revision });
                const records = Object.freeze(targets.map(target => {
                    const task = current.records.find(record => record.id === target.id && record.version === target.version && record.state === (completing ? 'active' : 'done'));
                    check(task, 'CONFLICT'); return Object.freeze({ ...task });
                }));
                transitionBatch(next, command); finish(next, command.operationId);
                return Object.freeze({ records, count: records.length, revision: current.revision,
                    clearsPin: completing && records.some(task => task.id === current.pinnedId), command });
            });
        }
        async reviewBatch(source) {
            const backend = this.backend;
            const texts = parseBatch(source), command = this.request('addBatch', { texts });
            return backend.lock(async () => {
                const current = await this.readRaw(backend), next = clone(current);
                appendBatch(next, command);
                finish(next, command.operationId);
                // Revision describes the preview only: an append can safely merge
                // with newer changes if the complete batch still fits at commit.
                return { texts, count: texts.length, currentTotal: current.records.length,
                    remaining: LIMITS.records - current.records.length, revision: current.revision, command };
            });
        }
    }
    return { KEY, LOCK, FORMAT, LIMITS, initial, Store, createChromeBackend, parseBackup, parseBatch, validate, counts, fault };
});
