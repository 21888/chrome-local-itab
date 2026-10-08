(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.LocalItabFinder = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const PAGE_SIZE = 50;
    // Keep variation selectors/Chinese marks intact; fold canonical Latin accents.
    const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const fingerprint = link => JSON.stringify([link?.title || '', link?.url || '', link?.category || 'work']);
    function safeUrl(value) {
        try {
            const raw = String(value || '').trim();
            if (!raw) return null;
            const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
            return ['http:', 'https:'].includes(url.protocol) ? url : null;
        } catch (_) { return null; }
    }
    class Controller {
        constructor({ getSnapshot, readSnapshot = getSnapshot, activate, reserve }) {
            this.getSnapshot = getSnapshot;
            this.readSnapshot = readSnapshot;
            this.reserve = reserve || (() => ({ open: activate, close() {} }));
            this.pending = null;
            this.query = '';
            this.page = 0;
        }
        search(query = this.query, page = 0) {
            this.cancelPending();
            this.query = String(query);
            const snapshot = this.getSnapshot() || {};
            const links = Array.isArray(snapshot.links) ? snapshot.links : [];
            const categories = new Map((snapshot.categories || []).map(item => [item.id, item.name]));
            const needle = fold(this.query.trim());
            const matches = [];
            const baseline = JSON.stringify(links);
            links.forEach((link, index) => {
                const category = categories.get(link.category || 'work') || link.category || 'work';
                if (!needle || ![link.title, link.url, category].some(value => fold(value).includes(needle))) return;
                const url = safeUrl(link.url);
                matches.push({ title: link.title || link.url || '', url: link.url || '', domain: url?.hostname || '', category,
                    safe: Boolean(url), token: { id: link.layoutId || null, reference: link, fingerprint: fingerprint(link), baseline, index } });
            });
            this.page = Math.min(Math.max(0, Math.floor(page) || 0), Math.max(0, Math.ceil(matches.length / PAGE_SIZE) - 1));
            return { query: this.query, total: matches.length, saved: links.length, page: this.page,
                start: this.page * PAGE_SIZE, rows: matches.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE),
                hasPrevious: this.page > 0, hasNext: (this.page + 1) * PAGE_SIZE < matches.length };
        }
        resolve(token, links, fresh = false) {
            let candidates;
            if (token?.id) candidates = links.filter(link => link.layoutId === token.id);
            else if (fresh) {
                // No persistent identity exists for legacy unique records. Fresh reads clone
                // objects, so require the complete displayed sequence to remain unchanged.
                if (!token || JSON.stringify(links) !== token.baseline) return null;
                candidates = [links[token.index]].filter(Boolean);
                // Legacy duplicate URLs need PM-07 identities; identical replacements cannot
                // be distinguished safely by a fresh cloned snapshot alone.
                if (candidates.length && links.filter(link => link.url === candidates[0].url).length !== 1) return null;
            } else candidates = links.filter(link => link === token?.reference);
            return candidates.length === 1 && fingerprint(candidates[0]) === token.fingerprint && safeUrl(candidates[0].url) ? candidates[0] : null;
        }
        async activate(token) {
            if (this.pending) return 'busy';
            if (!this.resolve(token, this.getSnapshot()?.links || [])) return 'stale';
            // Reserve under the original trusted click, before awaiting the local read.
            let lease;
            try { lease = this.reserve(); } catch (_) { return 'blocked'; }
            if (!lease) return 'blocked';
            const request = { lease };
            this.pending = request;
            try {
                const snapshot = await this.readSnapshot();
                if (this.pending !== request) return 'cancelled';
                const record = this.resolve(token, snapshot?.links || [], true);
                if (!record) { lease.close(); return 'stale'; }
                if (lease.open(record) === false) { lease.close(); return 'blocked'; }
                return 'opened';
            } catch (_) {
                lease.close();
                return this.pending === request ? 'error' : 'cancelled';
            } finally {
                if (this.pending === request) this.pending = null;
            }
        }
        cancelPending() {
            if (!this.pending) return;
            const request = this.pending; this.pending = null; request.lease.close();
        }
        clear() { this.cancelPending(); this.query = ''; this.page = 0; }

    }
    return { Controller, fold, safeUrl, PAGE_SIZE };
});
