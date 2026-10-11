/* Read-only, current saved text. Never searches drafts, history or recovery copies. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabAISearch = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const types = ['prompt', 'collection'];
    const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(value);
    const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
    function href(type, id) {
        if (!types.includes(type) || !validId(id)) return null;
        return `${type === 'prompt' ? 'prompts' : 'collections'}.html?record=${encodeURIComponent(id)}`;
    }
    function target(search) {
        const params = new URLSearchParams(search);
        if (!params.has('record')) return null;
        const ids = params.getAll('record');
        return ids.length === 1 && validId(ids[0]) ? { id: ids[0] } : { error: 'invalid' };
    }
    function resolveTarget(state, request) {
        if (!request || request.error || !validId(request.id)) return { error: 'invalid' };
        const record = state?.records.find(item => item.id === request.id);
        if (!record) return { error: 'missing' };
        if (record.deletedAt) return { error: 'archived' };
        return { id: record.id };
    }
    function snippet(value, needle) {
        const found = needle ? value.toLowerCase().indexOf(needle) : 0;
        const points = Array.from(value);
        // Folded offsets may expand (for example İ → i + combining dot).
        // Map back to original code points, retaining exact literal text.
        let index = 0, offset = 0;
        while (index < points.length && offset < found) offset += points[index++].toLowerCase().length;
        const start = Math.max(0, index - 45), end = Math.min(points.length, start + 180);
        return `${start ? '…' : ''}${points.slice(start, end).join('')}${end < points.length ? '…' : ''}`;
    }
    function search(snapshots, query = '', filter = 'all') {
        if (typeof query !== 'string' || query.length > 500 || !['all', ...types].includes(filter)) return [];
        const needle = query.trim().toLowerCase(), rows = [];
        for (const type of types) {
            if (filter !== 'all' && filter !== type) continue;
            for (const record of snapshots[type]?.records || []) {
                if (record.deletedAt || !href(type, record.id)) continue;
                const fields = [['body', record.body], ['title', record.title], ['tags', record.tags.join(', ')]];
                if (type === 'collection' && typeof record.notes === 'string') fields.push(['notes', record.notes]);
                const match = needle ? fields.find(([, value]) => value.toLowerCase().includes(needle)) : fields[0];
                if (!match) continue;
                rows.push({ type, id: record.id, title: record.title, field: match[0], snippet: snippet(match[1], needle), href: href(type, record.id) });
            }
        }
        return rows.sort((a, b) => compare(a.title.toLowerCase(), b.title.toLowerCase()) || compare(a.type, b.type) || compare(a.id, b.id));
    }
    class Controller {
        constructor({ stores, onChange = () => {} }) {
            this.stores = stores; this.onChange = onChange; this.generation = 0; this.disposed = false;
            this.snapshots = {}; this.errors = {}; this.loading = false; this.unsubscribers = []; this.subscriptionErrors = {};
        }
        start() {
            for (const type of types) {
                try { this.unsubscribers.push(this.stores[type].subscribe(() => { void this.refresh(); })); }
                catch (_) { this.subscriptionErrors[type] = true; }
            }
            return this.refresh();
        }
        async refresh() {
            if (this.disposed) return;
            const generation = ++this.generation;
            // A restore may span both stores. Invalidate both immediately, before any await.
            this.snapshots = {}; this.errors = {}; this.loading = true; this.onChange();
            const results = await Promise.allSettled(types.map(type => Promise.resolve().then(() => { if (this.subscriptionErrors[type]) throw new Error('Unavailable subscription'); return this.stores[type].read(); })));
            if (this.disposed || generation !== this.generation) return;
            results.forEach((result, index) => {
                const type = types[index];
                if (result.status === 'fulfilled') this.snapshots[type] = result.value;
                else this.errors[type] = true; // Never surface private exception messages.
            });
            this.loading = false; this.onChange();
        }
        results(query, filter) { return search(this.snapshots, query, filter).map(row => ({ ...row, generation: this.generation })); }
        current(row) { return !this.disposed && !this.loading && row.generation === this.generation && Boolean(this.snapshots[row.type]?.records.some(record => record.id === row.id && !record.deletedAt)); }
        dispose() { this.disposed = true; this.generation++; this.snapshots = {}; this.unsubscribers.forEach(unsubscribe => unsubscribe?.()); this.unsubscribers = []; }
    }
    // Installed only at page boot, before the first read. Never changes an existing editor.
    function prepareTarget(controller, searchText) {
        const request = target(searchText);
        if (!request) return;
        controller.selected = ''; // Prevent the normal first-record default, including on read failure.
        controller.navigationError = request.error || null;
        const accept = controller.accept;
        let pending = !request.error;
        controller.accept = function (state) {
            // A delayed first read must not override newer navigation or a draft.
            const resolve = pending && this.selected === '' && !this.hasUncommittedWork();
            pending = false;
            accept.call(this, state);
            if (!resolve) return;
            const result = resolveTarget(this.state, request);
            this.selected = result.id || '';
            this.navigationError = result.error || null;
        };
        const select = controller.select;
        controller.select = function (id) {
            const changed = select.call(this, id);
            if (changed && this.navigationError) { this.navigationError = null; this.notify(); }
            return changed;
        };
    }
    return { search, href, target, resolveTarget, prepareTarget, Controller };
});
