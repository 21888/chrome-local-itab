(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.LocalItabOrganizer = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const copy = value => JSON.parse(JSON.stringify(value));
    function plan(snapshot, indices, destination) {
        if (!snapshot.categories.some(category => category.id === destination)) throw new Error('Choose an existing destination.');
        const selected = [...new Set(indices)].sort((a, b) => a - b);
        if (!selected.length || selected.some(index => !Number.isInteger(index) || !snapshot.links[index] || snapshot.links[index].category === destination)) throw new Error('Choose sites outside the destination.');
        return copy({ baseline: snapshot.state, indices: selected, destination });
    }
    function groups(snapshot) {
        const names = new Map(snapshot.categories.map(category => [category.id, category.name]));
        const groups = new Map();
        snapshot.links.forEach((link, index) => {
            const id = link.category || 'work';
            if (!groups.has(id)) groups.set(id, { id, name: names.get(id) || id, orphaned: !names.has(id), rows: [] });
            groups.get(id).rows.push({ index, link });
        });
        return [...groups.values()];
    }
    return { plan, groups };
});
