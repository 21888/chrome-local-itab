(function(root, factory) {
    const identity = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = identity;
    else root.LocalItabIdentity = identity;
})(typeof window === 'undefined' ? globalThis : window, function() {
    'use strict';
    const idPattern = /^l_[a-f0-9]{32}$/;
    const has = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const copy = value => JSON.parse(JSON.stringify(value));
    const invalid = message => { const error = new Error(message); error.code = 'LAYOUT_IDENTITY_INVALID'; throw error; };
    const active = layout => has(layout, 'identityVersion') || has(layout, 'positionsById');
    const key = (id, view) => JSON.stringify([view, id]);
    function parseKey(value) {
        let parsed;
        try { parsed = JSON.parse(value); } catch (_) { invalid('Invalid identity position key.'); }
        if (!Array.isArray(parsed) || parsed.length !== 2 || typeof parsed[0] !== 'string' || !parsed[0] || !idPattern.test(parsed[1])) invalid('Invalid identity position key.');
        return { view: parsed[0], id: parsed[1] };
    }
    function validateIds(links) {
        if (!Array.isArray(links)) invalid('Shortcut identities require an array.');
        const used = new Set();
        for (const link of links) {
            if (!object(link)) invalid('Invalid shortcut record.');
            if (!has(link, 'layoutId')) continue;
            if (typeof link.layoutId !== 'string' || !idPattern.test(link.layoutId) || used.has(link.layoutId)) invalid('Shortcut layout IDs must be valid and unique.');
            used.add(link.layoutId);
        }
    }
    function validateLayout(layout) {
        if (!active(layout)) return;
        if (layout.identityVersion !== 1 || !object(layout.positionsById)) invalid('Unsupported or incomplete layout identity format.');
        for (const [id, views] of Object.entries(layout.positionsById)) {
            if (!idPattern.test(id) || !object(views)) invalid('Invalid identity position map.');
            for (const [view, position] of Object.entries(views)) {
                if (!view || !object(position) || !Number.isFinite(position.x) || !Number.isFinite(position.y)) invalid('Invalid identity coordinate.');
            }
        }
    }
    function validateBundle(config) {
        const layout = config?.layout || {};
        if (active(layout) && !Array.isArray(config?.links)) invalid('Identity-bearing data is missing its shortcut array.');
        const links = config?.links || [];
        validateIds(links); validateLayout(layout);
        const identified = links.filter(link => has(link, 'layoutId'));
        if (identified.length && !active(layout)) invalid('Shortcut identities require their matching layout map.');
        for (const link of identified) if (!has(layout.positionsById, link.layoutId)) invalid('An identified shortcut is missing its position map.');
        const groups = new Map();
        for (const link of links) {
            if (!groups.has(link.url)) groups.set(link.url, []);
            groups.get(link.url).push(link);
        }
        for (const group of groups.values()) {
            if (group.length > 1 && (active(layout) || group.some(link => link.layoutId)) && group.some(link => !link.layoutId)) invalid('A colliding shortcut group has incomplete identities.');
        }
        return active(layout);
    }
    function needs(links) {
        const groups = new Map();
        for (const link of links) { if (!groups.has(link.url)) groups.set(link.url, []); groups.get(link.url).push(link); }
        return [...groups.values()].some(group => group.length > 1 && group.some(link => !link.layoutId));
    }
    function allocate(links, layout, previousLinks, operation, createId) {
        links = copy(links); layout = copy(layout);
        validateIds(links); validateLayout(layout);
        const groups = new Map();
        for (let index = 0; index < links.length; index++) {
            const link = links[index];
            if (!groups.has(link.url)) groups.set(link.url, []);
            groups.get(link.url).push(index);
        }
        const sourceIndices = previousLinks.map((_, index) => index);
        if (operation?.type === 'add') sourceIndices.splice(operation.index, 0, null);
        if (operation?.type === 'delete') sourceIndices.splice(operation.index, 1);
        if (operation?.type === 'reorder') sourceIndices.splice(operation.to, 0, sourceIndices.splice(operation.from, 1)[0]);
        if (sourceIndices.length !== links.length) invalid('Shortcut operation no longer matches its baseline.');
        const reserved = new Set([...links.map(link => link.layoutId).filter(Boolean), ...Object.keys(layout.positionsById || {})]);
        let changed = false;
        for (const indices of groups.values()) {
            if (indices.length < 2) continue;
            for (const index of indices) {
                const link = links[index];
                if (link.layoutId) continue;
                let id;
                for (let attempt = 0; attempt < 32; attempt++) { id = createId(); if (idPattern.test(id) && !reserved.has(id)) break; id = null; }
                if (!id) invalid('Could not allocate a unique layout identity.');
                reserved.add(id); link.layoutId = id; changed = true;
                layout.identityVersion = 1;
                layout.positionsById ||= {};
                // A new Add has no historic position. Existing/editing records
                // retain every exact old view+URL association, including hidden views.
                const sourceIndex = sourceIndices[index];
                const oldLink = sourceIndex === null ? null : previousLinks[sourceIndex];
                const views = [];
                if (oldLink) {
                    const suffix = `|${oldLink.url}`;
                    for (const [legacyKey, value] of Object.entries(layout.positions || {})) {
                        if (legacyKey.endsWith(suffix) && legacyKey.length > suffix.length) views.push([legacyKey.slice(0, -suffix.length), copy(value)]);
                    }
                }
                layout.positionsById[id] = Object.fromEntries(views);
            }
        }
        validateBundle({ links, layout });
        return { links, layout, changed };
    }
    function mergePositions(layout, deltas) {
        validateLayout(layout);
        if (Object.keys(deltas).length && !active(layout)) invalid('Identity positions require an identified layout.');
        const map = { ...(layout.positionsById || {}) };
        for (const [encoded, position] of Object.entries(deltas)) {
            const { id, view } = parseKey(encoded);
            if (!has(map, id) || !object(position) || !Number.isFinite(position.x) || !Number.isFinite(position.y)) invalid('Invalid identity position update.');
            map[id] = { ...map[id], [view]: copy(position) };
        }
        return { ...layout, ...(active(layout) ? { positionsById: map } : {}) };
    }
    return { active, has, copy, invalid, idPattern, key, parseKey, validateIds, validateLayout, validateBundle, needs, allocate, mergePositions };
});
