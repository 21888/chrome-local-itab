/* Read-only recovery inspection. No managers, migrations, providers or writers. */
(function (root, factory) {
    const api = factory(() => typeof module === 'object' && module.exports && typeof require === 'function' ? require('./recovery-file.js') : root.LocalItabRecoveryFile);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabRecovery = api;
})(typeof window === 'undefined' ? globalThis : window, function (getRecoveryFile) {
    'use strict';
    const KEYS = Object.freeze({ registry: '__localItabWorkspaceRegistryV1', activation: '__localItabWorkspaceActivationV1',
        prior: '__localItabWorkspaceRecoveryV1', migration: '__localItabWorkspacePreMigrationV1', restore: '__localItabRestoreRecovery', identity: '__localItabIdentityRecovery' });
    const PREFIX = '__localItabWorkspaceV1:';
    const CONFIG_KEYS = Object.freeze(['schemaVersion', 'clock', 'search', 'bg', 'themePreset', 'appearance', 'show', 'categories', 'links', 'weather', 'hot', 'movie', 'quote', 'layout', 'ui']);
    const BASE_KEYS = Object.freeze([...Object.values(KEYS), ...CONFIG_KEYS]);
    const LIMITS = Object.freeze({ bytes: 32 * 1024 * 1024, nodes: 300000, depth: 80, chain: 32, entries: 512, workspaces: 100, links: 20000 });
    const own = (value, key) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const token = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
    const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
    const forbidden = key => ['__proto__', 'prototype', 'constructor'].includes(key);
    const issue = code => Object.assign(new Error('Recovery inspection unavailable.'), { code });
    const check = (ok, code = 'INVALID') => { if (!ok) throw issue(code); };
    const put = (target, key, value) => Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
    function freeze(value) {
        if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
        return value;
    }
    // Keep investigation's historical projection behavior, but remember whether
    // copying discarded a hidden/symbol own property. The stricter recovery
    // path must not mistake that omission for a complete original inventory.
    const copySafety = new WeakMap();
    function boundedCopy(value, budget = { bytes: 0, nodes: 0 }, { strict = false } = {}) {
        let nodes = 0, bytes = 0; const ancestors = new Set();
        const charge = count => { bytes += count; check(bytes + budget.bytes <= LIMITS.bytes, 'SIZE_LIMIT'); };
        const textBytes = value => new TextEncoder().encode(value).length;
        function visit(item, depth) {
            check(++nodes + budget.nodes <= LIMITS.nodes && depth <= LIMITS.depth, 'SIZE_LIMIT'); charge(2);
            if (typeof item === 'string') { check(item.length <= LIMITS.bytes, 'SIZE_LIMIT'); charge(textBytes(item) + 2); return item; }
            if (item === null || typeof item === 'boolean') { charge(5); return item; }
            if (typeof item === 'number') { check(Number.isFinite(item)); charge(32); return item; }
            check(item && typeof item === 'object' && !ancestors.has(item));
            const proto = Object.getPrototypeOf(item), array = Array.isArray(item);
            check(array || proto === null || Object.getPrototypeOf(proto) === null);
            const keys = Object.keys(item); check(keys.length <= LIMITS.nodes, 'SIZE_LIMIT');
            const ownSafe = Reflect.ownKeys(item).every(key => (array && key === 'length') ||
                (typeof key === 'string' && Object.getOwnPropertyDescriptor(item, key)?.enumerable)) &&
                (!array || proto === null || (Array.isArray(proto) && Object.getPrototypeOf(Object.getPrototypeOf(proto)) === null));
            if (strict) check(ownSafe);
            if (array) check(item.length <= LIMITS.nodes && keys.length === item.length, 'SIZE_LIMIT');
            const result = array ? [] : {}; let deepSafe = ownSafe; ancestors.add(item);
            for (const key of keys) {
                const descriptor = Object.getOwnPropertyDescriptor(item, key);
                check(descriptor && own(descriptor, 'value'));
                if (array) check(/^(0|[1-9][0-9]*)$/.test(key) && Number(key) < item.length);
                charge(textBytes(key) + 3);
                const copied = visit(descriptor.value, depth + 1);
                if (copied && typeof copied === 'object' && copySafety.get(copied)?.deep === false) deepSafe = false;
                put(result, key, copied);
            }
            ancestors.delete(item); copySafety.set(result, { own: ownSafe, deep: deepSafe }); return result;
        }
        const result = visit(value, 0); budget.bytes += bytes; budget.nodes += nodes; return result;
    }
    function canonical(value) {
        if (Array.isArray(value)) return value.map(canonical);
        if (object(value)) { const result = {}; for (const key of Object.keys(value).sort()) put(result, key, canonical(value[key])); return result; }
        return value;
    }
    async function hash(value, crypto) {
        check(crypto?.subtle, 'UNAVAILABLE');
        const text = JSON.stringify(canonical(value)), bytes = new TextEncoder().encode(text);
        check(bytes.length <= LIMITS.bytes, 'SIZE_LIMIT');
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    function credentialURL(value) {
        if (typeof value !== 'string') return false;
        // Broken historical URLs are still recoverable text. Parsing failure
        // must not turn an authority containing credentials into exportable text.
        const text = value.trim(), authority = text.replace(/^[a-z][a-z0-9+.-]*:[\\/]*/i, '').replace(/^[\\/]+/, '').split(/[\\/?#]/)[0];
        if (authority.includes('@')) return true;
        try { if (decodeURIComponent(authority).includes('@')) return true; } catch (_) {}
        const sensitive = /^(?:token|auth|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|authorization|password|secret|signature|x-amz-(?:credential|signature|security-token))$/i;
        for (const part of text.split(/[?#&]/).slice(1)) {
            let key = part.split('=')[0]; try { key = decodeURIComponent(key.replace(/\+/g, ' ')); } catch (_) {}
            if (sensitive.test(key)) return true;
        }
        try {
            const parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
            return Boolean(parsed.username || parsed.password) || [...parsed.searchParams.keys()].some(key => sensitive.test(key));
        } catch (_) { return false; }
    }
    const credentialPositionKey = key => credentialURL(key.slice(key.indexOf('|') + 1)) || key.split('|').some(credentialURL);
    const string = 'string', number = 'number', bool = 'boolean';
    const nullable = schema => ({ union: [schema, 'null'] });
    const fields = value => ({ fields: value });
    const array = (item, limit = LIMITS.links) => ({ array: item, limit });
    const map = (item, validKey) => ({ map: item, validKey });
    const position = fields({ x: number, y: number });
    const viewKey = key => !forbidden(key) && typeof key === 'string' && key.length > 0 && key.length <= 100;
    const legacyPosition = key => {
        const index = key.indexOf('|');
        return index > 0 && viewKey(key.slice(0, index)) && key.length <= 17000 && !credentialPositionKey(key);
    };
    const idKey = key => /^l_[a-f0-9]{32}$/.test(key);
    const color = string;
    const configSchema = fields({ schemaVersion: number,
        clock: fields({ hour12: bool, showSeconds: bool, worldClocks: array(fields({ timeZone: string, label: string }), 100) }),
        search: fields({ engine: string, custom: 'url' }), bg: fields({ type: string, value: 'url' }), themePreset: string,
        appearance: fields({ template: string, colorMode: string, customization: fields({ backgroundMode: string, backgroundStart: color, backgroundEnd: color,
            backgroundAngle: number, cardPadding: nullable(number), cardGap: nullable(number), cardRadius: nullable(number), cardOpacity: nullable(number),
            cardColumns: nullable(number), cardLayoutMode: nullable(string), cardOrder: nullable(array(string, 100)),
            cardSpans: nullable(map(number, key => ['local-tasks-card', 'local-focus-card', 'local-scratchpad-card', 'local-countdown-card', 'world-clocks-card', 'weather-container', 'hot-container', 'movie-container'].includes(key))) }) }),
        show: fields({ clock: bool, search: bool, shortcuts: bool, weather: bool, hot: bool, movie: bool }),
        categories: array(fields({ id: string, name: string, icon: 'url' }), 2000),
        links: array(fields({ title: string, url: 'url', icon: 'url', category: string, layoutId: string })),
        weather: fields({ city: string, temp: number, cond: string, aqiLabel: string, aqi: number, low: number, high: number }),
        hot: fields({ tab: string, baidu: array(fields({ t: string, s: number })), weibo: array(fields({ t: string, s: number })), zhihu: array(fields({ t: string, s: number })) }),
        movie: fields({ title: string, note: string, poster: 'url' }), quote: string,
        layout: fields({ autoArrange: bool, alignToGrid: bool, gridSize: number, columns: number, identityVersion: number,
            positions: map(position, legacyPosition), positionsById: map(map(position, viewKey), idKey) }),
        ui: fields({ dashboardHidden: bool, dashboardPadding: nullable({ union: [number, fields({ top: nullable(number), right: nullable(number), bottom: nullable(number), left: nullable(number) })] }),
            showShortcutTitles: bool, finderShortcutEnabled: bool, shortcutsStyle: fields({ gapX: nullable(number), gapY: nullable(number), iconSize: nullable(number), titleSize: nullable(number), titleColor: color }) })
    });
    const OMIT = Symbol('omit');
    function project(input) {
        const omissions = new Set();
        function walk(value, schema) {
            if (typeof schema === 'string') {
                if (schema === 'null' && value === null) return null;
                if (schema === 'url') {
                    if (typeof value !== 'string') return OMIT;
                    if (credentialURL(value)) { omissions.add('CREDENTIAL_URL_OMITTED'); return OMIT; }
                    return value;
                }
                return typeof value === schema && (schema !== 'number' || Number.isFinite(value)) ? value : OMIT;
            }
            if (schema.union) { for (const choice of schema.union) { const result = walk(value, choice); if (result !== OMIT) return result; } return OMIT; }
            if (schema.array) {
                if (!Array.isArray(value)) return OMIT;
                if (value.length > schema.limit) { omissions.add('SIZE_LIMIT'); return OMIT; }
                return value.map(item => { const result = walk(item, schema.array); if (result !== OMIT) return result; omissions.add('INVALID_FIELDS_OMITTED'); return null; });
            }
            if (!object(value)) return OMIT;
            const result = {};
            for (const key of Object.keys(value)) {
                if (schema.fields && !own(schema.fields, key)) {
                    omissions.add(/auth|token|secret|password|credential|sync|provider|^__/i.test(key) ? 'PRIVATE_FIELDS_OMITTED' : 'UNKNOWN_FIELDS_OMITTED'); continue;
                }
                if (schema.map && (!schema.validKey(key) || forbidden(key))) { omissions.add(credentialPositionKey(key) ? 'CREDENTIAL_URL_OMITTED' : 'INVALID_FIELDS_OMITTED'); continue; }
                const projected = walk(value[key], schema.map || schema.fields[key]);
                if (projected === OMIT) omissions.add('INVALID_FIELDS_OMITTED'); else put(result, key, projected);
            }
            return result;
        }
        if (!object(input)) return { configuration: {}, omissions: ['INVALID_SOURCE'], siteCount: null, exportable: false };
        const configuration = walk(input, configSchema);
        if (own(input, 'schemaVersion') && ![1, 2].includes(input.schemaVersion)) omissions.add('UNKNOWN_VERSION');
        return { configuration, omissions: [...omissions], siteCount: Array.isArray(input.links) ? input.links.length : null, exportable: Object.keys(configuration).length > 0 };
    }
    function registryShapeValid(registry) {
        if (!object(registry) || registry.schemaVersion !== 1 || registry.defaultId !== 'default' || !token(registry.migrationId) || !token(registry.lastUsedId) || !Number.isSafeInteger(registry.revision) || registry.revision < 0) return false;
        if (Object.keys(registry).sort().join() !== ['schemaVersion', 'revision', 'defaultId', 'lastUsedId', 'migrationId', 'workspaces'].sort().join()) return false;
        if (!Array.isArray(registry.workspaces) || !registry.workspaces.length || registry.workspaces.length > LIMITS.workspaces) return false;
        const ids = new Set(), orders = new Set();
        for (const entry of registry.workspaces) {
            if (!object(entry) || Object.keys(entry).sort().join() !== ['id', 'generation', 'name', 'order', 'createdAt', 'updatedAt', 'deletedAt'].sort().join() || !token(entry.id) || !token(entry.generation) || ids.has(entry.id) || !Number.isSafeInteger(entry.order) || entry.order < 0 || orders.has(entry.order) || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 160 || !date(entry.createdAt) || !date(entry.updatedAt) || (entry.deletedAt !== null && !date(entry.deletedAt))) return false;
            ids.add(entry.id); orders.add(entry.order);
        }
        return ['default', registry.lastUsedId].every(id => registry.workspaces.some(entry => entry.id === id && entry.deletedAt === null));
    }
    function registryValid(registry, activation) {
        return registryShapeValid(registry) && object(activation) &&
            Object.keys(activation).sort().join() === ['schemaVersion', 'migrationId', 'defaultId'].sort().join() &&
            activation.schemaVersion === 1 && activation.migrationId === registry.migrationId && activation.defaultId === registry.defaultId;
    }
    function priorSnapshotValid(value) {
        const exact = (item, keys) => object(item) && Object.keys(item).sort().join() === [...keys].sort().join();
        if (!exact(value, ['schemaVersion', 'createdAt', 'snapshot']) || value.schemaVersion !== 1 || !date(value.createdAt) ||
            copySafety.get(value)?.deep === false || !exact(value.snapshot, ['registry', 'bundles']) || !registryShapeValid(value.snapshot.registry)) return false;
        const { registry, bundles } = value.snapshot;
        if (!Array.isArray(bundles) || bundles.length !== registry.workspaces.length) return false;
        const identities = new Map(), generations = new Set(), seen = new Set();
        for (const entry of registry.workspaces) {
            if (entry.name !== entry.name.trim() || Array.from(entry.name).length > 80 || /[\u0000-\u001f\u007f]/.test(entry.name) ||
                forbidden(entry.id) || forbidden(entry.generation) || generations.has(entry.generation)) return false;
            identities.set(entry.id, entry.generation); generations.add(entry.generation);
        }
        for (const bundle of bundles) {
            if (!exact(bundle, ['id', 'generation', 'values']) || !object(bundle.values) ||
                !identities.has(bundle.id) || identities.get(bundle.id) !== bundle.generation || seen.has(bundle.id)) return false;
            seen.add(bundle.id);
        }
        return true;
    }
    function createInspector({ local, crypto = globalThis.crypto, now = () => new Date().toISOString() } = {}) {
        const reports = new WeakMap();
        let activeReport = null, activeReview = null, inspectEpoch = 0, reviewEpoch = 0;
        function retireRecovery(review) {
            // A stale capability cannot retire somebody else's newer review.
            if (arguments.length && activeReview?.review !== review) return;
            reviewEpoch++; activeReview = null;
        }

        async function read(keys, retain = true) {
            const data = {}, faults = {}, hashes = {}, budget = { bytes: 0, nodes: 0 };
            // One explicit key at a time bounds backend response size across a
            // large registry. The second pass keeps hashes, not a second raw copy.
            for (const key of keys) {
                let result; try { result = await local.get([key]); } catch (_) { throw issue('READ_FAILED'); }
                check(object(result), 'READ_FAILED');
                if (!own(result, key)) continue;
                try {
                    const descriptor = Object.getOwnPropertyDescriptor(result, key); check(descriptor && own(descriptor, 'value'));
                    const value = boundedCopy(descriptor.value, budget);
                    hashes[key] = await hash(value, crypto);
                    if (retain) put(data, key, value);
                } catch (error) { faults[key] = error.code === 'SIZE_LIMIT' ? 'SIZE_LIMIT' : 'INVALID_SOURCE'; }
            }
            return { data, faults, fingerprint: await hash({ hashes, faults }, crypto) };
        }
        async function inspect() {
            const epoch = ++inspectEpoch; activeReport = null; retireRecovery();
            check(local && typeof local.get === 'function', 'READ_FAILED');
            const initial = await read([KEYS.registry, KEYS.activation]), entries = [], warnings = new Set(Object.values(initial.faults)), candidates = [];
            const registry = initial.data[KEYS.registry];
            if (object(registry) && Array.isArray(registry.workspaces)) {
                if (registry.workspaces.length > LIMITS.workspaces) warnings.add('SIZE_LIMIT');
                for (const entry of registry.workspaces.slice(0, LIMITS.workspaces)) {
                    if (object(entry) && token(entry.id) && token(entry.generation)) candidates.push(entry); else warnings.add('REGISTRY_INVALID');
                }
            }
            // Current records retain priority under the shared budget. The one fixed
            // historical snapshot is last; never enumerate orphan storage keys.
            const keys = [...new Set([...BASE_KEYS.filter(key => key !== KEYS.prior), ...candidates.map(entry => `${PREFIX}${entry.id}:${entry.generation}`), KEYS.prior])];
            const first = await read(keys), second = await read(keys, false);
            check(first.fingerprint === second.fingerprint, 'CHANGED');
            for (const key of [KEYS.registry, KEYS.activation]) check(JSON.stringify(initial.data[key]) === JSON.stringify(first.data[key]) && initial.faults[key] === first.faults[key], 'CHANGED');
            Object.values(first.faults).forEach(code => warnings.add(code));
            check(epoch === inspectEpoch, 'RECOVERY_STALE');
            const raw = freeze(first.data), checkedRegistry = registryValid(raw[KEYS.registry], raw[KEYS.activation]);
            if (own(raw, KEYS.registry) || own(raw, KEYS.activation)) { if (!checkedRegistry) warnings.add('REGISTRY_INVALID'); }
            const inspectedAt = now(); check(date(inspectedAt)); const downloads = new Map();
            function add(value, source, recordedAt = null, timeKind = 'unknown', integrity = 'unverified', extra = [], recovery = null) {
                if (entries.length >= LIMITS.entries) { warnings.add('CHAIN_LIMIT'); return; }
                const projected = project(value), rowWarnings = new Set([...projected.omissions, ...extra]);
                if (!recordedAt) rowWarnings.add('RECORD_TIME_UNKNOWN');
                if (integrity === 'unverified') rowWarnings.add('CHECKSUM_MISSING');
                if (integrity === 'failed') rowWarnings.add('CHECKSUM_FAILED');
                if (!['verified', 'historical'].includes(source.identityStatus)) rowWarnings.add('UNVERIFIED_SOURCE');
                const id = `copy_${entries.length + 1}`;
                const entry = freeze({ id, source: { ...source }, recordedAt, timeKind, siteCount: projected.siteCount, integrity, warnings: [...rowWarnings], exportable: projected.exportable });
                const download = freeze({ type: 'local-itab-readonly-recovery', formatVersion: 1, inspectedAt, source: entry.source,
                    recordedAt, timeKind, integrity, configurationProjection: projected.configuration, omissions: [...rowWarnings] });
                entries.push(entry); downloads.set(id, { download, recovery, preview: freeze({ links: Array.isArray(projected.configuration.links) ? projected.configuration.links : null, omissions: [...rowWarnings] }) });
            }
            async function integrity(value, checksum) {
                if (checksum === undefined) return 'unverified';
                if (typeof checksum !== 'string' || !/^[a-f0-9]{64}$/.test(checksum)) return 'failed';
                try { return await hash(value, crypto) === checksum ? 'verified' : 'failed'; } catch (_) { return 'failed'; }
            }
            async function recoveries(value, source, fallbackKind = 'recovery') {
                let node = value; const seen = new Set();
                for (let depth = 0; node !== undefined && depth < LIMITS.chain; depth++) {
                    if (!object(node) || seen.has(node)) { warnings.add('INVALID_SOURCE'); return; } seen.add(node);
                    const kind = ['beforeCloudReplacement', 'beforeCloudClear'].includes(node.reason) ? node.reason : fallbackKind;
                    const timestamp = date(node.payload?.createdAt) ? node.payload.createdAt : date(node.payload?.exportDate) ? node.payload.exportDate : null;
                    const origin = { ...source, kind, depth };
                    // References point into the one immutable bounded snapshot.
                    // Do not copy each node's previous chain or use the privacy
                    // projection as the source of an importable configuration.
                    const selection = (representation, valueKey, checksumKey) => freeze({
                        safe: copySafety.get(node)?.own !== false && copySafety.get(node[valueKey])?.deep !== false,
                        input: { representation, value: node[valueKey],
                            ...(own(node, checksumKey) ? { checksum: node[checksumKey] } : {}),
                            ...(own(node, 'reason') ? { reason: node.reason } : {}), containerKeys: Object.keys(node) }
                    });
                    const portableData = object(node.payload?.data) ? node.payload.data : object(node.payload?.settings) ? node.payload.settings : node.payload;
                    const differing = own(node, 'rawConfiguration') && own(node, 'payload') &&
                        (Array.isArray(node.rawConfiguration?.links) ? node.rawConfiguration.links.length : null) !==
                        (Array.isArray(portableData?.links) ? portableData.links.length : null) ? ['CONTENT_DIFFERS'] : [];
                    if (own(node, 'rawConfiguration')) add(node.rawConfiguration, { ...origin, representation: 'raw' }, timestamp, timestamp ? 'backup' : 'unknown', await integrity(node.rawConfiguration, node.rawConfigurationChecksum), differing, selection('raw', 'rawConfiguration', 'rawConfigurationChecksum'));
                    if (own(node, 'payload')) {
                        const payload = node.payload, value = object(payload?.data) ? { ...payload.data, ...(own(payload, 'schemaVersion') && !own(payload.data, 'schemaVersion') ? { schemaVersion: payload.schemaVersion } : {}) } : object(payload?.settings) ? payload.settings : payload;
                        const formatWarnings = [...differing];
                        if (object(payload) && ((own(payload, 'type') && payload.type !== 'backupSnapshot') || (own(payload, 'app') && payload.app !== 'local-itab') || own(payload, 'format'))) formatWarnings.push('UNKNOWN_FORMAT');
                        const storedURLFormat = object(payload) && payload.version === '2.0' && payload.urlIdentityVersion === 1 && payload.type === 'backupSnapshot' && payload.app === 'local-itab' && [1, 2].includes(payload.schemaVersion) && object(payload.data) && !own(payload, 'settings') &&
                            (!own(payload, 'metadata') || (object(payload.metadata) && payload.metadata.urlIdentityVersion === 1 && payload.metadata.app === payload.app && payload.metadata.type === payload.type && payload.metadata.schemaVersion === payload.schemaVersion));
                        if (object(payload) && ((payload.version === '2.0' || own(payload, 'urlIdentityVersion') || own(payload.metadata, 'urlIdentityVersion')) && !storedURLFormat)) formatWarnings.push('UNKNOWN_FORMAT');
                        if (object(payload) && ((own(payload, 'version') && payload.version !== '1.0' && !storedURLFormat) || (own(payload, 'schemaVersion') && ![1, 2].includes(payload.schemaVersion)))) formatWarnings.push('UNKNOWN_VERSION');
                        add(value, { ...origin, representation: 'portable' }, timestamp, timestamp ? 'backup' : 'unknown', await integrity(payload, node.checksum), formatWarnings, selection('portable', 'payload', 'checksum'));
                    }
                    if (!own(node, 'rawConfiguration') && !own(node, 'payload')) add(null, { ...origin, representation: 'configuration' }, null, 'unknown', 'unverified', ['INVALID_SOURCE']);
                    if (!own(node, 'previousRecovery')) return;
                    node = node.previousRecovery;
                }
                if (node !== undefined) warnings.add('CHAIN_LIMIT');
            }
            async function sources(values, source, recordedAt = null, timeKind = 'unknown') {
                add(values, { ...source, depth: 0, representation: 'configuration' }, recordedAt, timeKind);
                if (object(values)) for (const [key, kind] of [[KEYS.restore, 'recovery'], [KEYS.identity, 'identityRecovery']]) if (own(values, key)) await recoveries(values[key], source, kind);
            }
            if (own(raw, KEYS.migration)) {
                const snapshot = raw[KEYS.migration], valid = object(snapshot) && snapshot.schemaVersion === 1 && token(snapshot.id) && date(snapshot.createdAt) && object(snapshot.values);
                await sources(object(snapshot) ? snapshot.values : null, { kind: 'preMigration', identityStatus: valid && checkedRegistry && snapshot.id === raw[KEYS.registry].migrationId ? 'verified' : 'unverified' }, date(snapshot?.createdAt) ? snapshot.createdAt : null, date(snapshot?.createdAt) ? 'migration' : 'unknown');
            } else if (own(first.faults, KEYS.migration)) add(null, { kind: 'preMigration', identityStatus: 'unverified', depth: 0, representation: 'configuration' }, null, 'unknown', 'unverified', [first.faults[KEYS.migration]]);
            if (CONFIG_KEYS.some(key => own(raw, key)) || own(raw, KEYS.restore) || own(raw, KEYS.identity)) {
                const legacy = Object.fromEntries([...CONFIG_KEYS, KEYS.restore, KEYS.identity].filter(key => own(raw, key)).map(key => [key, raw[key]]));
                await sources(legacy, { kind: 'legacy', identityStatus: 'unverified' });
            }
            const used = new Set();
            for (const entry of candidates) {
                const key = `${PREFIX}${entry.id}:${entry.generation}`; if (used.has(key)) { warnings.add('REGISTRY_INVALID'); continue; } used.add(key);
                const bundle = raw[key], valid = checkedRegistry && object(bundle) && bundle.schemaVersion === 1 && bundle.id === entry.id && bundle.generation === entry.generation && object(bundle.values) && Object.keys(bundle).length === 4;
                const source = { kind: 'workspace', workspaceId: entry.id, identityStatus: valid ? 'verified' : 'unverified', deleted: date(entry.deletedAt),
                    ...(typeof entry.name === 'string' && entry.name.length <= 160 ? { workspaceName: entry.name } : {}) };
                if (!object(bundle) || !object(bundle.values)) { warnings.add('BUNDLE_MISSING'); add(null, { ...source, depth: 0, representation: 'configuration' }, null, 'unknown', 'unverified', ['BUNDLE_MISSING']); }
                else await sources(bundle.values, source);
            }
            if (own(raw, KEYS.prior)) {
                const prior = raw[KEYS.prior];
                if (!priorSnapshotValid(prior)) warnings.add('HISTORICAL_INVALID');
                else {
                    const previous = prior.snapshot, bundles = new Map(previous.bundles.map(bundle => [bundle.id, bundle]));
                    for (const entry of previous.registry.workspaces) {
                        const current = checkedRegistry ? raw[KEYS.registry].workspaces.find(item => item.id === entry.id) : null;
                        const source = { kind: 'historicalWorkspace', identityStatus: 'historical', historical: true,
                            workspaceId: entry.id, workspaceName: entry.name, workspaceGeneration: entry.generation,
                            snapshotAt: prior.createdAt, deleted: entry.deletedAt !== null,
                            currentRelation: !checkedRegistry ? 'unknown' : !current ? 'absent' : current.generation === entry.generation ? 'sameGeneration' : 'differentGeneration' };
                        // The outer snapshot has no historical checksum. Only
                        // independently checksummed nested nodes can qualify.
                        await sources(bundles.get(entry.id).values, source, prior.createdAt, 'snapshot');
                    }
                }
            }
            check(epoch === inspectEpoch, 'RECOVERY_STALE');
            const report = freeze({ inspectedAt, entries, warnings: [...warnings] }); reports.set(report, downloads); activeReport = report; return report;
        }
        function selected(report, id) { const item = reports.get(report)?.get(id); check(item, 'INVALID'); return item; }
        async function reviewRecovery(report, id) {
            retireRecovery();
            const inspection = inspectEpoch, review = reviewEpoch;
            const current = () => inspection === inspectEpoch && review === reviewEpoch && activeReport === report;
            check(current(), 'RECOVERY_STALE');
            const item = reports.get(report)?.get(id); check(item, 'RECOVERY_STALE');
            check(item.recovery, 'RECOVERY_INTEGRITY');
            check(item.recovery.safe, 'RECOVERY_FIELDS');
            let result, api;
            try {
                api = getRecoveryFile(); check(api && typeof api.create === 'function', 'RECOVERY_UNAVAILABLE');
                const gate = api.create({ copy: boundedCopy, hash: value => hash(value, crypto), maxBytes: LIMITS.bytes });
                result = await gate.build(item.recovery.input, now());
            }
            catch (failure) {
                check(current(), 'RECOVERY_STALE');
                throw issue(api?.CODES?.includes(failure?.code) ? failure.code : 'RECOVERY_UNAVAILABLE');
            }
            check(current(), 'RECOVERY_STALE');
            const capability = freeze(result.review);
            activeReview = { report, id, selection: item.recovery, review: capability, text: result.text };
            return capability;
        }
        function exportRecovery(report, id, review) {
            const item = activeReport === report && reports.get(report)?.get(id);
            check(activeReview && activeReview.report === report && activeReview.id === id && activeReview.review === review &&
                item && activeReview.selection === item.recovery, 'RECOVERY_STALE');
            return activeReview.text;
        }
        return Object.freeze({ inspect, reviewRecovery, exportRecovery, retireRecovery,
            preview: (report, id) => selected(report, id).preview,
            exportEntry(report, id) { const item = selected(report, id); check(report.entries.find(entry => entry.id === id)?.exportable, 'INVALID'); const text = JSON.stringify(item.download, null, 2); check(new TextEncoder().encode(text).length <= LIMITS.bytes, 'SIZE_LIMIT'); return text; }
        });
    }
    return Object.freeze({ createInspector, boundedCopy, CONFIG_KEYS, BASE_KEYS, KEYS, LIMITS });
});
