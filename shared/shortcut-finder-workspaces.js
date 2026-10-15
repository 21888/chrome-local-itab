/* Explicit, device-local All-workspaces Finder. No initialization or writes. */
(function (root, factory) {
    const node = typeof module === 'object' && module.exports;
    const api = factory(node ? require('./workspaces.js') : root.LocalItabWorkspaces,
        node ? require('./stored-shortcut-url.js') : root.LocalItabStoredURL,
        node ? require('./local-prompts-store.js') : root.LocalItabPrompts,
        node ? require('./local-ai-collections-store.js') : root.LocalItabAICollections);
    if (node) module.exports = api;
    else root.LocalItabFinderWorkspaces = api;
})(typeof window === 'undefined' ? globalThis : window, function (W, URLs, prompts, collections) {
    'use strict';
    const META_KEYS = Object.freeze([W.REGISTRY_KEY, W.ACTIVATION_KEY, W.RESTORE_TRANSACTION_KEY]);
    const LEGACY_KEYS = Object.freeze([W.SNAPSHOT_KEY, W.LEGACY_CONFLICT_KEY, ...W.SCOPED_KEYS]);
    const CONTROL_KEYS = Object.freeze([...META_KEYS, ...LEGACY_KEYS]);
    const LOCKS = Object.freeze([W.LOCK, 'local-itab-personal-tasks-v1', 'local-itab-focus-v1', 'local-itab-local-write']);
    const LIMITS = Object.freeze({ rawBytes: 64 * 1024 * 1024, nodes: 500000, depth: 40,
        links: 20000, categories: 10000, projectedBytes: 8 * 1024 * 1024 });
    const own = (value, key) => Object.hasOwn(value, key);
    const faults = new WeakSet();
    const fail = code => { const error = new Error(`Finder workspaces: ${code}`); error.code = `FINDER_${code}`; faults.add(error); throw error; };
    const check = (condition, code = 'UNAVAILABLE') => { if (!condition) fail(code); };
    const object = value => { check(value && typeof value === 'object' && !Array.isArray(value)); return value; };
    const exact = (value, keys) => { object(value); check(Object.keys(value).length === keys.length && keys.every(key => own(value, key))); };
    const token = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
    const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
    const string = (value, max = 8192) => { check(typeof value === 'string' && value.length <= max); return value; };
    const newBudget = () => ({ bytes: 0, nodes: 0 });
    // Count JSON UTF-8 bytes without serializing an untrusted value or allocating
    // a second image-sized string. Escape/lone-surrogate costs are included.
    function stringBytes(value) {
        let bytes = 2;
        for (let i = 0; i < value.length; i++) {
            const c = value.charCodeAt(i);
            if (c === 34 || c === 92 || [8, 9, 10, 12, 13].includes(c)) bytes += 2;
            else if (c < 32) bytes += 6;
            else if (c < 128) bytes++;
            else if (c < 2048) bytes += 2;
            else if (c >= 0xd800 && c <= 0xdbff && value.charCodeAt(i + 1) >= 0xdc00 && value.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
            else bytes += c >= 0xd800 && c <= 0xdfff ? 6 : 3;
        }
        return bytes;
    }
    function plainPrototype(proto, array) {
        if (proto === null) return !array;
        const ctor = Object.getOwnPropertyDescriptor(proto, 'constructor');
        if (!ctor || !own(ctor, 'value') || typeof ctor.value !== 'function' ||
            Object.getOwnPropertyDescriptor(ctor.value, 'prototype')?.value !== proto) return false;
        return Function.prototype.toString.call(ctor.value) === (array ? 'function Array() { [native code] }' : 'function Object() { [native code] }');
    }
    function rawValue(value, budget = newBudget(), depth = 0, ancestors = new Set()) {
        check(++budget.nodes <= LIMITS.nodes && depth <= LIMITS.depth, 'LIMIT');
        if (typeof value === 'string') budget.bytes += stringBytes(value);
        else if (value === null) budget.bytes += 4;
        else if (typeof value === 'boolean') budget.bytes += value ? 4 : 5;
        else if (typeof value === 'number') { check(Number.isFinite(value)); budget.bytes += String(value).length; }
        else {
            check(value && typeof value === 'object' && !ancestors.has(value));
            const array = Array.isArray(value);
            check(plainPrototype(Object.getPrototypeOf(value), array));
            const keys = Reflect.ownKeys(value);
            check(keys.length <= LIMITS.nodes, 'LIMIT');
            if (array) {
                const length = Object.getOwnPropertyDescriptor(value, 'length');
                check(length && own(length, 'value') && Number.isSafeInteger(length.value) && length.value >= 0 && keys.length === length.value + 1);
            }
            ancestors.add(value); budget.bytes += 2;
            let count = 0;
            for (const key of keys) {
                if (array && key === 'length') continue;
                check(typeof key === 'string' && !['__proto__', 'prototype', 'constructor'].includes(key));
                const descriptor = Object.getOwnPropertyDescriptor(value, key);
                check(descriptor && descriptor.enumerable && own(descriptor, 'value'));
                if (array) check(/^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length);
                else budget.bytes += stringBytes(key) + 1;
                if (count++) budget.bytes++;
                check(budget.bytes <= LIMITS.rawBytes, 'LIMIT');
                rawValue(descriptor.value, budget, depth + 1, ancestors);
            }
            ancestors.delete(value);
        }
        check(budget.bytes <= LIMITS.rawBytes, 'LIMIT');
        return value;
    }
    function registry(value) { return W.validateRegistry(object(value)); }
    function metadata(raw, identity) {
        const current = registry(raw[W.REGISTRY_KEY]);
        exact(raw[W.ACTIVATION_KEY], ['schemaVersion', 'migrationId', 'defaultId']);
        check(W.same(raw[W.ACTIVATION_KEY], { schemaVersion: 1, migrationId: current.migrationId, defaultId: current.defaultId }));
        const entry = current.workspaces.find(item => item.id === identity.id);
        check(entry && entry.deletedAt === null && entry.generation === identity.generation, 'STALE');
        if (own(raw, W.RESTORE_TRANSACTION_KEY)) {
            const journal = raw[W.RESTORE_TRANSACTION_KEY];
            exact(journal, ['schemaVersion', 'id', 'createdAt', 'status', 'prior', 'next', 'recoveryKey', 'recoveryChecksum', 'priorWorkspaceDigest']);
            check(journal.schemaVersion === 1 && token(journal.id) && date(journal.createdAt) && ['verified', 'recovered'].includes(journal.status));
            check(journal.recoveryKey === '__localItabCompleteRecoveryV2' && /^[a-f0-9]{64}$/.test(journal.recoveryChecksum) && /^[a-f0-9]{64}$/.test(journal.priorWorkspaceDigest));
            const keys = Object.keys(object(journal.prior)).sort();
            check(keys.length >= 2 && keys.includes(W.REGISTRY_KEY) && keys.every(key => [W.REGISTRY_KEY, W.PROMPTS_KEY, W.COLLECTIONS_KEY].includes(key)) && W.same(keys, Object.keys(object(journal.next)).sort()));
            for (const authority of [journal.prior, journal.next]) {
                const historical = registry(authority[W.REGISTRY_KEY]);
                check(historical.migrationId === current.migrationId);
                if (own(authority, W.PROMPTS_KEY)) { check(typeof prompts?.validate === 'function'); prompts.validate(authority[W.PROMPTS_KEY]); }
                if (own(authority, W.COLLECTIONS_KEY)) { check(typeof collections?.validate === 'function'); collections.validate(authority[W.COLLECTIONS_KEY]); }
            }
        }
        return current;
    }
    function legacyHeaders(raw, current) {
        const snapshot = raw[W.SNAPSHOT_KEY];
        exact(snapshot, ['schemaVersion', 'id', 'createdAt', 'values']);
        check(snapshot.schemaVersion === 1 && snapshot.id === current.migrationId && date(snapshot.createdAt));
        object(snapshot.values); // Original migration inventory may contain unknown/provider fields.
        if (own(raw, W.LEGACY_CONFLICT_KEY)) {
            const marker = raw[W.LEGACY_CONFLICT_KEY];
            exact(marker, ['schemaVersion', 'id', 'detectedAt', 'keys', 'resolvedAt', 'baseline', 'recoveryKey']);
            check(marker.schemaVersion === 1 && token(marker.id) && date(marker.detectedAt) && date(marker.resolvedAt));
            check(Array.isArray(marker.keys) && marker.keys.length > 0 && marker.keys.every(key => W.SCOPED_KEYS.includes(key)) && new Set(marker.keys).size === marker.keys.length);
            check(typeof marker.recoveryKey === 'string' && marker.recoveryKey.startsWith(W.LEGACY_RECOVERY_PREFIX) && token(marker.recoveryKey.slice(W.LEGACY_RECOVERY_PREFIX.length)));
            check(Object.keys(object(marker.baseline)).every(key => W.SCOPED_KEYS.includes(key)));
        }
    }
    function credentialAddress(raw) {
        const variants = [raw];
        try { variants.push(decodeURIComponent(raw)); } catch (_) {}
        for (const value of variants) {
            // Detection only: never repair or persist these spellings. URL also
            // recognizes credential authorities disguised with controls or \\.
            for (const candidate of [value, `https://${value}`]) {
                try { const parsed = new URL(candidate); if (parsed.username || parsed.password) return true; } catch (_) {}
            }
            const visible = value.replace(/[\u0000-\u0020\u007f]/g, '').replace(/\\/g, '/');
            const scheme = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.exec(visible);
            const authority = visible.slice(scheme ? scheme[0].length : 0).split(/[/?#]/, 1)[0];
            if (authority.includes('@')) return true;
        }
        return false;
    }
    function project(raw, entry, budget) {
        const bundle = raw[W.bundleKey(entry)];
        exact(bundle, ['schemaVersion', 'id', 'generation', 'values']);
        check(bundle.schemaVersion === 1 && bundle.id === entry.id && bundle.generation === entry.generation);
        const values = object(bundle.values);
        check(Object.keys(values).every(key => W.SCOPED_KEYS.includes(key)));
        if (own(values, 'schemaVersion')) check([1, 2].includes(values.schemaVersion));
        // Manager.create legitimately stores {}. Absence means no saved rows,
        // never a default preset; explicit null or malformed arrays still fail.
        const links = own(values, 'links') ? values.links : [];
        const categories = own(values, 'categories') ? values.categories : [];
        check(Array.isArray(links) && Array.isArray(categories));
        check((budget.links += links.length) <= LIMITS.links && (budget.categories += categories.length) <= LIMITS.categories, 'LIMIT');
        const ids = new Set(), categoryIds = new Set();
        const result = { id: entry.id, generation: entry.generation, name: entry.name,
            links: links.map(link => {
                object(link); const row = {};
                for (const key of ['title', 'url', 'category', 'layoutId']) if (own(link, key)) row[key] = string(link[key], key === 'layoutId' ? 100 : 8192);
                check(own(row, 'url') && row.url.length > 0 && !credentialAddress(row.url));
                if (own(row, 'layoutId')) { check(/^l_[a-f0-9]{32}$/.test(row.layoutId) && !ids.has(row.layoutId)); ids.add(row.layoutId); }
                return Object.freeze(row);
            }),
            categories: categories.map(category => {
                object(category); const id = string(category.id), name = string(category.name);
                check(id.length > 0 && !categoryIds.has(id)); categoryIds.add(id);
                return Object.freeze({ id, name });
            }),
            fences: { links: own(values, 'links'), categories: own(values, 'categories') }
        };
        for (const key of ['__localItabLayoutGeneration', '__localItabSettingsGeneration']) {
            if (own(values, key)) { check(string(values[key], 100).length > 0); result.fences[key] = values[key]; }
        }
        const size = newBudget(); rawValue(result, size); budget.bytes += size.bytes;
        check(budget.bytes <= LIMITS.projectedBytes, 'LIMIT');
        Object.freeze(result.fences); Object.freeze(result.links); Object.freeze(result.categories);
        return Object.freeze(result);
    }
    function createReader({ local, locks, changes, getSession, isVisible = () => true, isActivationVisible = isVisible, onInvalidate = () => {} }) {
        let epoch = 0, operation = 0, listening = false, stopped = false;
        let bundleKeys = new Set(), tickets = new WeakMap(), snapshots = new WeakMap();
        const fixed = new Set([...CONTROL_KEYS, W.STAGE_KEY]);
        function identity() {
            const session = getSession();
            // Inspect an already admitted normal session only. No ready/list/capture,
            // manager state or private admission bit is consulted as proof.
            check(session instanceof W.Session && !session.invalidated && !session._existingOnly && token(session.id) && token(session.generation));
            return { owner: session, id: session.id, generation: session.generation };
        }
        function current(start, owner, active = () => true, activation = false) {
            check(!stopped && start === operation && active() && (activation ? isActivationVisible() : isVisible()), 'CANCELLED');
            const now = identity();
            check(now.owner === owner.owner && now.id === owner.id && now.generation === owner.generation, 'STALE');
        }
        function invalidate() { if (stopped) return; epoch++; operation++; tickets = new WeakMap(); snapshots = new WeakMap(); onInvalidate(); }
        const changed = (value, area) => {
            if (area === 'local' && Object.keys(value).some(key => fixed.has(key) || bundleKeys.has(key))) invalidate();
        };
        function startListening() {
            check(!stopped && local && typeof local.get === 'function' && typeof local.getBytesInUse === 'function' && typeof locks?.request === 'function' && typeof changes?.addListener === 'function' && typeof changes?.removeListener === 'function');
            if (!listening) { changes.addListener(changed); listening = true; }
        }
        const lock = action => LOCKS.reduceRight((next, name) => () => locks.request(name, { mode: 'exclusive' }, next), action)();
        async function acquire(start, owner, active, finish) {
            const valid = () => current(start, owner, active, Boolean(finish));
            valid(); const sourceEpoch = epoch;
            const preflight = async keys => {
                const bytes = await local.getBytesInUse(keys); valid();
                check(Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= LIMITS.rawBytes, 'LIMIT');
            };
            const read = async (keys, budget) => {
                const raw = await local.get(keys); valid();
                rawValue(raw, budget); object(raw);
                check(Object.keys(raw).every(key => keys.includes(key)));
                return raw;
            };
            await preflight(META_KEYS);
            const bootstrap = await read(META_KEYS, newBudget()); valid();
            const admitted = metadata(bootstrap, owner);
            if (finish) check(admitted.migrationId === finish.ticket.migrationId, 'STALE');
            const entries = admitted.workspaces.filter(entry => entry.deletedAt === null);
            bundleKeys = new Set(entries.map(W.bundleKey));
            await preflight([...CONTROL_KEYS, ...bundleKeys]); valid();
            const legacy = async evidence => {
                legacyHeaders(evidence, admitted);
                const facade = Object.freeze({
                    get: requested => {
                        check(W.same(requested, LEGACY_KEYS)); valid();
                        return Object.fromEntries(LEGACY_KEYS.filter(key => own(evidence, key)).map(key => [key, evidence[key]]));
                    },
                    signalLegacyConflict() { fail('UNAVAILABLE'); }
                });
                // Reuse the exact production comparison without constructing a
                // Manager or notifying live workspace listeners (which can ready()).
                await W.Manager.prototype.checkLegacySource.call(facade, { readOnly: true }); valid();
            };
            const firstBudget = newBudget();
            const before = await read(CONTROL_KEYS, firstBudget); valid();
            metadata(before, owner);
            check(META_KEYS.every(key => own(before, key) === own(bootstrap, key) && W.same(before[key], bootstrap[key])), 'STALE');
            await legacy(before); valid();
            const projectedBudget = { links: 0, categories: 0, bytes: 0 }, spaces = [];
            for (const entry of entries) {
                const raw = await read([W.bundleKey(entry)], firstBudget); valid();
                spaces.push(project(raw, entry, projectedBudget));
            }
            const target = finish ? entries.find(item => item.id === finish.ticket.workspaceId && item.generation === finish.ticket.generation) : null;
            if (finish) check(target, 'STALE');
            // Include the selected bundle in the final native control read. A
            // separate control await must not hide a silent target URL edit.
            const finalKeys = target ? [...CONTROL_KEYS, W.bundleKey(target)] : CONTROL_KEYS;
            const after = await read(finalKeys, newBudget()); valid();
            metadata(after, owner);
            await legacy(after); valid();
            check(CONTROL_KEYS.every(key => own(before, key) === own(after, key) && W.same(before[key], after[key])) && sourceEpoch === epoch, 'STALE');
            if (target) {
                const repeated = project(after, target, { links: 0, categories: 0, bytes: 0 });
                check(W.same(repeated, spaces.find(space => space.id === target.id)), 'STALE');
            }
            // No await after the last metadata/legacy/identity/epoch fence. The
            // known host callback navigates synchronously inside all four locks.
            if (finish) {
                const record = resolve(finish.ticket, spaces);
                const destination = URLs.destinationForSavedURL(record.url);
                check(destination, 'UNSAFE'); valid();
                check(sourceEpoch === epoch && tickets.has(finish.token), 'STALE');
                return finish.open(Object.freeze({ url: destination })) === true ? 'opened' : 'blocked';
            }
            return { spaces, owner, sourceEpoch, migrationId: admitted.migrationId };
        }
        function resolve(ticket, spaces) {
            const space = spaces.find(item => item.id === ticket.workspaceId && item.generation === ticket.generation);
            check(space && W.same(space.fences, ticket.fences), 'STALE');
            let candidates;
            if (ticket.record.layoutId) candidates = space.links.filter(link => link.layoutId === ticket.record.layoutId);
            else {
                check(W.same(space.links, ticket.sequence), 'STALE');
                candidates = [space.links[ticket.index]].filter(Boolean);
                check(candidates.length === 1 && space.links.filter(link => link.url === candidates[0].url).length === 1, 'STALE');
            }
            check(candidates.length === 1 && W.same(candidates[0], ticket.record), 'STALE');
            // Category/name changes also retire the label the user chose.
            check(space.name === ticket.workspaceName && W.same(space.categories, ticket.categories), 'STALE');
            return candidates[0];
        }
        function display(acquired) {
            const links = [], categories = [];
            tickets = new WeakMap(); snapshots = new WeakMap();
            for (const space of acquired.spaces) {
                const categoryNames = new Map(space.categories.map(item => [item.id, item.name]));
                for (const link of space.links) { const id = link.category || 'work'; if (!categoryNames.has(id)) categoryNames.set(id, id); }
                check(categories.length + categoryNames.size <= LIMITS.categories, 'LIMIT');
                for (const [id, name] of categoryNames) categories.push(Object.freeze({ id: JSON.stringify([space.id, id]), name, label: `${space.name} · ${name}` }));
                space.links.forEach((record, index) => {
                    const opaque = Object.freeze({});
                    tickets.set(opaque, { owner: acquired.owner, migrationId: acquired.migrationId, epoch: acquired.sourceEpoch, workspaceId: space.id, generation: space.generation,
                        workspaceName: space.name, record, index, sequence: record.layoutId ? null : space.links, fences: space.fences, categories: space.categories });
                    links.push(Object.freeze({ title: record.title || '', url: record.url, category: JSON.stringify([space.id, record.category || 'work']),
                        layoutId: record.layoutId || null, workspaceName: space.name, finderToken: opaque }));
                });
            }
            const snapshot = Object.freeze({ scope: 'all', links: Object.freeze(links), categories: Object.freeze(categories), workspaces: acquired.spaces.length });
            const size = newBudget(); rawValue(snapshot, size); check(size.bytes <= LIMITS.projectedBytes, 'LIMIT');
            snapshots.set(snapshot, { epoch: acquired.sourceEpoch, owner: acquired.owner }); return snapshot;
        }
        return Object.freeze({
            async scan(active = () => true) {
                try {
                    const owner = identity(); startListening(); const start = ++operation;
                    const acquired = await lock(() => acquire(start, owner, active));
                    current(start, owner, active); check(acquired.sourceEpoch === epoch, 'STALE');
                    return display(acquired);
                } catch (_) { fail('UNAVAILABLE'); } // Never leak raw storage/validator errors.
            },
            async activate(opaque, open, active = () => true) {
                const ticket = tickets.get(opaque);
                if (!ticket || ticket.epoch !== epoch || typeof open !== 'function') return 'stale';
                try {
                    const owner = identity(); check(owner.owner === ticket.owner.owner && owner.id === ticket.owner.id && owner.generation === ticket.owner.generation, 'STALE');
                    const start = ++operation;
                    return await lock(() => acquire(start, owner, active, { token: opaque, ticket, open }));
                } catch (error) { return faults.has(error) && error.code === 'FINDER_CANCELLED' ? 'cancelled' : 'stale'; }
            },
            isCurrent(snapshot) {
                try {
                    const proof = snapshots.get(snapshot), now = identity();
                    return Boolean(proof && proof.epoch === epoch && !stopped && isVisible() && now.owner === proof.owner.owner && now.id === proof.owner.id && now.generation === proof.owner.generation);
                } catch (_) { return false; }
            },
            invalidate,
            stop() { if (listening) changes.removeListener(changed); listening = false; stopped = true; epoch++; operation++; tickets = new WeakMap(); snapshots = new WeakMap(); bundleKeys.clear(); }
        });
    }
    return Object.freeze({ createReader, CONTROL_KEYS, META_KEYS, LEGACY_KEYS, LOCKS, LIMITS });
});
