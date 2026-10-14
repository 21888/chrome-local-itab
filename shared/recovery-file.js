/* Strict, read-only recovery-file admission. The ordinary importer remains the
 * configuration validator; this layer adds complete inventories and no-repair
 * evidence before exposing a configuration-only file. No storage/provider APIs. */
(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports ? require('./configuration-codec.js') : root.LocalItabConfigurationCodec);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabRecoveryFile = api;
})(typeof window === 'undefined' ? globalThis : window, function (Codec) {
    'use strict';
    const own = (value, key) => Boolean(value && Object.prototype.hasOwnProperty.call(value, key));
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const CODES = Object.freeze(['RECOVERY_UNAVAILABLE', 'RECOVERY_INTEGRITY', 'RECOVERY_FORMAT', 'RECOVERY_FIELDS', 'RECOVERY_CREDENTIAL', 'RECOVERY_REWRITE', 'RECOVERY_STALE', 'SIZE_LIMIT']);
    const error = code => Object.assign(new Error('This retained copy cannot be exported as an importable configuration.'), { code });
    const check = (ok, code = 'RECOVERY_FIELDS') => { if (!ok) throw error(code); };
    const EXCLUSIONS = Object.freeze(['SYNC_PREFERENCES', 'RUNTIME_GENERATIONS', 'RECOVERY_METADATA', 'PERSONAL_MODULES_NOT_SELECTED', 'OTHER_WORKSPACES_NOT_SELECTED']);
    const REASONS = Object.freeze(['beforeRestore', 'beforeIdentity', 'beforeCloudReplacement', 'beforeCloudClear']);
    const CONTAINER_KEYS = Object.freeze(['reason', 'payload', 'checksum', 'rawConfiguration', 'rawConfigurationChecksum', 'providerState', 'previousRecovery']);
    const GENERATIONS = Object.freeze(['__localItabLayoutGeneration', '__localItabSettingsGeneration']);
    const date = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
    // Object.is preserves scalar identity that JSON can otherwise erase (notably
    // -0). Objects are already bounded plain JSON before this comparison runs.
    function same(left, right) {
        if (Object.is(left, right)) return true;
        if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
        const keys = Object.keys(left);
        return keys.length === Object.keys(right).length && keys.every(key => own(right, key) && same(left[key], right[key]));
    }
    function exactKeys(value, allowed, required = allowed) {
        check(object(value) && Object.keys(value).every(key => allowed.includes(key)) && required.every(key => own(value, key)));
    }
    function credentialURL(value) {
        if (typeof value !== 'string') return false;
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
    function credentialKey(value) {
        // Every URL-like segment is checked: a safe first URL cannot conceal a
        // second authority/query in a historical view|URL key. Other map keys
        // are opaque data, including prototype spellings and auth_notes.
        return value.split('|').some(credentialURL);
    }
    const record = (fields, optional = []) => ({ fields, required: Object.keys(fields).filter(key => !optional.includes(key)) });
    const list = item => ({ list: item });
    const map = item => ({ map: item });
    const nullable = value => ({ nullable: value });
    const point = record({ x: 'number', y: 'number' });
    const customization = record({ backgroundMode: 'string', backgroundStart: 'string', backgroundEnd: 'string', backgroundAngle: 'number',
        cardPadding: nullable('number'), cardGap: nullable('number'), cardRadius: nullable('number'), cardOpacity: nullable('number'),
        cardColumns: nullable('number'), cardLayoutMode: nullable('string'), cardOrder: nullable(list('string')), cardSpans: nullable(map('number')) });
    const schema = record({
        clock: record({ hour12: 'boolean', showSeconds: 'boolean', worldClocks: list(record({ timeZone: 'string', label: 'string' })) }),
        search: record({ engine: 'string', custom: 'url' }), bg: record({ type: 'string', value: 'url' }), themePreset: 'string',
        appearance: record({ template: 'string', colorMode: 'string', customization }, ['customization']),
        show: record({ clock: 'boolean', search: 'boolean', shortcuts: 'boolean', weather: 'boolean', hot: 'boolean', movie: 'boolean' }),
        privacy: record({ onlineFavicons: 'boolean' }),
        categories: list(record({ id: 'string', name: 'string', icon: 'url' })),
        links: list(record({ title: 'string', url: 'url', icon: 'url', category: 'string', layoutId: 'string' }, ['layoutId'])),
        weather: record({ city: 'string', temp: 'number', cond: 'string', aqiLabel: 'string', aqi: 'number', low: 'number', high: 'number' }),
        hot: record({ tab: 'string', baidu: list(record({ t: 'string', s: 'number' })), weibo: list(record({ t: 'string', s: 'number' })), zhihu: list(record({ t: 'string', s: 'number' })) }),
        movie: record({ title: 'string', note: 'string', poster: 'url' }), quote: 'string',
        layout: record({ autoArrange: 'boolean', alignToGrid: 'boolean', gridSize: 'number', columns: 'number', positions: map(point), identityVersion: 'number', positionsById: map(map(point)) }, ['identityVersion', 'positionsById']),
        ui: record({ dashboardHidden: 'boolean', dashboardPadding: { union: ['null', 'number', record({ top: nullable('number'), right: nullable('number'), bottom: nullable('number'), left: nullable('number') })] },
            showShortcutTitles: 'boolean', finderShortcutEnabled: 'boolean', shortcutsStyle: record({ gapX: nullable('number'), gapY: nullable('number'), iconSize: nullable('number'), titleSize: nullable('number'), titleColor: 'string' }) })
    });
    const CONFIG_KEYS = Object.freeze(Object.keys(schema.fields));
    function inventory(value, shape) {
        if (typeof shape === 'string') {
            if (shape === 'null') { check(value === null); return; }
            check(typeof value === (shape === 'url' ? 'string' : shape) && (shape !== 'number' || Number.isFinite(value)));
            if (shape === 'url') check(!credentialURL(value), 'RECOVERY_CREDENTIAL');
        } else if (shape.nullable) { if (value !== null) inventory(value, shape.nullable); }
        else if (shape.union) {
            const candidate = shape.union.find(item => item === 'null' ? value === null : typeof item === 'string' ? typeof value === item : object(value));
            check(candidate); inventory(value, candidate);
        } else if (shape.list) { check(Array.isArray(value)); value.forEach(item => inventory(item, shape.list)); }
        else if (shape.map) {
            check(object(value)); for (const key of Object.keys(value)) { check(!credentialKey(key), 'RECOVERY_CREDENTIAL'); inventory(value[key], shape.map); }
        } else {
            exactKeys(value, Object.keys(shape.fields), shape.required);
            for (const key of Object.keys(value)) inventory(value[key], shape.fields[key]);
        }
    }
    function syncInventory(value) {
        const fields = { enabled: 'boolean', lastSync: 'string', lastError: 'string', includeLargeAssets: 'boolean' };
        exactKeys(value, Object.keys(fields), []);
        for (const key of Object.keys(value)) check(typeof value[key] === fields[key]);
    }
    function portableInventory(value) {
        exactKeys(value, ['version', 'urlIdentityVersion', 'schemaVersion', 'type', 'app', 'exportDate', 'createdAt', 'exportedBy', 'extensionVersion', 'itemCounts', 'data'], ['version', 'schemaVersion', 'createdAt', 'data']);
        check(['1.0', '2.0'].includes(value.version) && [1, 2].includes(value.schemaVersion) &&
            own(value, 'urlIdentityVersion') === (value.version === '2.0') && (value.version !== '2.0' || value.urlIdentityVersion === 1), 'RECOVERY_FORMAT');
        check((!own(value, 'type') || value.type === 'backupSnapshot') && (!own(value, 'app') || value.app === 'local-itab') &&
            (value.version !== '2.0' || (value.type === 'backupSnapshot' && value.app === 'local-itab')), 'RECOVERY_FORMAT');
        check(date(value.createdAt) && (!own(value, 'exportDate') || date(value.exportDate)), 'RECOVERY_FORMAT');
        for (const key of ['exportedBy', 'extensionVersion']) if (own(value, key)) check(typeof value[key] === 'string');
        if (own(value, 'itemCounts')) {
            const fields = { shortcuts: 'number', categories: 'number', hotTopics: 'number', dataUrlIcons: 'number', hasBackgroundImage: 'boolean', hasMoviePoster: 'boolean', localImagesIncluded: 'boolean' };
            exactKeys(value.itemCounts, Object.keys(fields));
            for (const key of Object.keys(fields)) check(typeof value.itemCounts[key] === fields[key] && (fields[key] !== 'number' || (Number.isSafeInteger(value.itemCounts[key]) && value.itemCounts[key] >= 0)));
        }
    }
    function create({ copy, hash, maxBytes } = {}) {
        check(Codec && typeof Codec.create === 'function' && typeof copy === 'function' && typeof hash === 'function' && Number.isSafeInteger(maxBytes) && maxBytes > 0, 'RECOVERY_UNAVAILABLE');
        const validator = Codec.create({ now: () => { throw error('RECOVERY_REWRITE'); }, workspace: true });
        check(same([...CONFIG_KEYS].sort(), Object.keys(validator.defaultConfig).filter(key => key !== 'sync').sort()), 'RECOVERY_UNAVAILABLE');
        async function build(input, generatedAt) {
            // The inspector supplies only the exact selected representation and
            // the shallow container inventory, never a reconstruction/projection
            // or a copy of the entire previousRecovery chain for each source.
            let selected;
            try { selected = copy(input, undefined, { strict: true }); } catch (failure) { throw error(failure?.code === 'SIZE_LIMIT' ? 'SIZE_LIMIT' : 'RECOVERY_FIELDS'); }
            exactKeys(selected, ['representation', 'value', 'checksum', 'reason', 'containerKeys'], ['representation', 'value', 'reason', 'containerKeys']);
            check(['raw', 'portable'].includes(selected.representation) && REASONS.includes(selected.reason) && date(generatedAt), 'RECOVERY_FORMAT');
            check(Array.isArray(selected.containerKeys) && selected.containerKeys.every(key => typeof key === 'string' && CONTAINER_KEYS.includes(key)) && selected.containerKeys.includes('reason'));
            check(typeof selected.checksum === 'string' && /^[a-f0-9]{64}$/.test(selected.checksum), 'RECOVERY_INTEGRITY');
            let actual; try { actual = await hash(selected.value); } catch (failure) { throw error(failure?.code === 'SIZE_LIMIT' ? 'SIZE_LIMIT' : 'RECOVERY_UNAVAILABLE'); }
            check(actual === selected.checksum, 'RECOVERY_INTEGRITY');
            const value = selected.value;
            let source, schemaVersion, recordedAt = null;
            if (selected.representation === 'raw') {
                exactKeys(value, [...CONFIG_KEYS, 'schemaVersion', 'sync', ...GENERATIONS], CONFIG_KEYS);
                if (own(value, 'sync')) syncInventory(value.sync);
                for (const key of GENERATIONS) if (own(value, key)) check(typeof value[key] === 'string' && value[key].length > 0, 'RECOVERY_FORMAT');
                source = Object.fromEntries(CONFIG_KEYS.map(key => [key, value[key]]));
                schemaVersion = own(source.layout, 'identityVersion') || own(source.layout, 'positionsById') || (Array.isArray(source.links) && source.links.some(link => own(link, 'layoutId'))) ? 2 : 1;
                check(!own(value, 'schemaVersion') || value.schemaVersion === schemaVersion, 'RECOVERY_FORMAT');
            } else {
                portableInventory(value);
                exactKeys(value.data, [...CONFIG_KEYS, 'sync']);
                syncInventory(value.data.sync);
                check(same(value.data.sync, validator.getDisabledSyncConfig()), 'RECOVERY_FIELDS');
                source = Object.fromEntries(CONFIG_KEYS.map(key => [key, value.data[key]]));
                schemaVersion = value.schemaVersion; recordedAt = value.createdAt;
            }
            inventory(source, schema);
            const data = { ...source, sync: validator.getDisabledSyncConfig() };
            const payload = { version: '2.0', urlIdentityVersion: 1, type: 'backupSnapshot', app: 'local-itab', schemaVersion,
                createdAt: generatedAt, exportDate: generatedAt, data };
            // Admission cannot depend on normalizers, generated IDs or defaults.
            // The strict v2 importer is the same contract as ordinary Settings.
            try {
                if (selected.representation === 'portable') check(same(validator.validateImportPayload(value), value.data), 'RECOVERY_REWRITE');
                check(same(validator.validateImportPayload(payload), data), 'RECOVERY_REWRITE');
            } catch (_) { throw error('RECOVERY_REWRITE'); }
            const text = JSON.stringify(payload, null, 2);
            check(new TextEncoder().encode(text).length <= maxBytes, 'SIZE_LIMIT');
            // Prove the bytes that will actually be downloaded, not merely the
            // pre-serialization object. Negative zero is refused, never silently
            // changed to zero; no repair/default filling may create eligibility.
            try { check(same(validator.validateImportPayload(JSON.parse(text)), data), 'RECOVERY_REWRITE'); }
            catch (_) { throw error('RECOVERY_REWRITE'); }
            const positionCount = Object.keys(source.layout.positions).length + Object.values(source.layout.positionsById || {}).reduce((sum, views) => sum + Object.keys(views).length, 0);
            const review = { scope: 'configuration-only', siteCount: source.links.length, categoryCount: source.categories.length,
                duplicateCount: source.links.length - new Set(source.links.map(link => link.url)).size, positionCount, schemaVersion,
                recordedAt, timeVerified: recordedAt !== null, generatedAt, links: source.links.map(({ title, url }) => ({ title, url })), exclusions: [...EXCLUSIONS] };
            return { text, review };
        }
        return Object.freeze({ build });
    }
    return Object.freeze({ create, CODES, EXCLUSIONS });
});
