(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.LocalItabNavigationCatalog = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const categories = [
        ['ai', 'AI', 'AI 工具', '✦'], ['development', 'Development', '开发', '</>'],
        ['design', 'Design', '设计', '◈'], ['office', 'Productivity', '办公', '▤'],
        ['learning', 'Learning', '学习', 'Aa'], ['search', 'Search', '搜索', '⌕'],
        ['news', 'News', '资讯', '▧'], ['media', 'Video & music', '影音', '▶'],
        ['social', 'Social', '社交', '◎'], ['shopping', 'Shopping', '电商', '▱'],
        ['travel', 'Travel', '出行', '↗'], ['lifestyle', 'Everyday life', '生活', '⌂'],
        ['finance', 'Finance', '财经', '↗'], ['careers', 'Careers', '求职', '▣'],
        ['marketing', 'Marketing', '营销', '◉'], ['utilities', 'Utilities', '实用工具', '⚙'],
        ['games', 'Games', '游戏', '✚'], ['public-services', 'Public services', '公共服务', '▥']
    ].map(([id, en, zh, icon]) => Object.freeze({ id, en, zh, icon: icon.length === 1 ? `${icon}\uFE0E` : icon }));
    const pricing = ['free', 'freemium', 'paid', 'not_applicable', 'unknown'];
    function canonicalURL(raw) {
        if (typeof raw !== 'string' || !/^https?:\/\//i.test(raw)) return null;
        if (/[\s\u0000-\u001f\u007f-\u009f\\\ufffd]/u.test(raw)) return null;
        const end = raw.indexOf('://') + 3;
        if (!raw[end] || raw[end] === '/' || raw[end] === '?' || raw[end] === '#') return null;
        for (let i = 0; i < raw.length; i++) {
            if (raw[i] === '%' && !/^[0-9a-fA-F]{2}$/.test(raw.slice(i + 1, i + 3))) return null;
        }
        try {
            const url = new URL(raw);
            if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
            // Reject even empty userinfo (https://@host), which URL otherwise erases.
            let authorityEnd = raw.length;
            for (const delimiter of ['/', '?', '#']) {
                const at = raw.indexOf(delimiter, end);
                if (at !== -1) authorityEnd = Math.min(authorityEnd, at);
            }
            if (raw.slice(end, authorityEnd).includes('@')) return null;
            return url.href;
        } catch (_) { return null; }
    }
    const localized = (value, language = 'en') => typeof value === 'string' ? value : value?.[language] || value?.en || '';
    function validate(entries) {
        const ids = new Set(), urls = new Set(), allowed = new Set(categories.map(item => item.id));
        if (!Array.isArray(entries) || !entries.length) throw new Error('Catalog must contain sites.');
        for (const site of entries) {
            const url = canonicalURL(site.url);
            if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(site.id) || ids.has(site.id) || !site.name || !url || !url.startsWith('https:') || urls.has(url) ||
                !Array.isArray(site.categories) || !site.categories.length || site.categories.some(id => !allowed.has(id)) ||
                !Array.isArray(site.tags) || site.tags.some(tag => typeof tag !== 'string' || !tag) ||
                (site.searchAliases !== undefined && (!Array.isArray(site.searchAliases) || site.searchAliases.length > 8 ||
                    site.searchAliases.some(alias => typeof alias !== 'string' || !alias.trim() || alias.length > 80 || /[\u0000-\u001f\u007f-\u009f]/u.test(alias)))) ||
                !pricing.includes(site.pricing) || !/^(?:[A-Z]{2}|unknown)$/.test(site.country) || !site.company ||
                !site.description?.en || !site.description?.zh || !site.pricingNote?.en || !site.pricingNote?.zh ||
                !Array.isArray(site.sources) || !site.sources.length || site.sources.some(source => !canonicalURL(source)?.startsWith('https:')) ||
                !/^\d{4}-\d{2}-\d{2}$/.test(site.verifiedOn)) throw new Error(`Invalid catalog entry: ${site.id}`);
            ids.add(site.id); urls.add(url);
        }
        return true;
    }
    const searchText = value => value.normalize('NFKC').toLowerCase();
    const compactName = value => value.replace(/[\s-]+/gu, '');
    function filter(entries, criteria = {}, language = 'en', label = value => value) {
        const terms = searchText(typeof criteria.query === 'string' ? criteria.query : '').trim().split(/\s+/).filter(Boolean);
        const compactTerms = terms.map(compactName);
        return entries.filter(site => {
            if (criteria.category && !site.categories.includes(criteria.category)) return false;
            if (criteria.tag && !site.tags.includes(criteria.tag)) return false;
            if (criteria.country && site.country !== criteria.country) return false;
            if (criteria.company && site.company !== criteria.company) return false;
            if (criteria.pricing && site.pricing !== criteria.pricing) return false;
            const names = [site.name, ...(site.searchAliases || [])];
            const compactNames = names.map(name => compactName(searchText(name)));
            const haystack = searchText([...names, site.url, site.company, site.country, localized(site.description, language), ...Object.values(site.description || {}),
                ...site.tags, ...site.tags.map(label), ...site.categories.flatMap(id => { const c = categories.find(c => c.id === id); return [c.en, c.zh]; })].join(' '));
            // Compact only individual brand names, never descriptions or joined fields.
            // Keep every query term required, and never let a separator become an empty match.
            return terms.every((term, index) => haystack.includes(term) ||
                (compactTerms[index] && compactNames.some(name => name.includes(compactTerms[index]))));
        });
    }
    const savedURLs = links => new Set((links || []).map(link => canonicalURL(link.url)).filter(Boolean));
    // One read-only label per personal category identity, across the complete
    // snapshot. Never use a website's subset or its order to name a destination.
    function personalCategoryLabels(personalCategories = []) {
        const entries = personalCategories.map(({ id, name }) => ({ id, name, level: 0 }));
        const groups = key => {
            const values = new Map();
            for (const entry of entries) {
                const value = key(entry);
                if (!values.has(value)) values.set(value, []);
                values.get(value).push(entry);
            }
            return [...values.values()].filter(group => group.length > 1);
        };
        for (const group of groups(entry => entry.name.trim().normalize('NFC').toLowerCase())) {
            for (const entry of group) entry.level = 1;
        }
        const label = entry => entry.level === 0 ? entry.name : entry.level === 1 ? `${entry.name} (${entry.id})` : JSON.stringify([entry.name, entry.id]);
        // Each entry can advance at most twice, so even collision chains end
        // within 2N passes (and usually one). No suffix-growing identity scheme.
        for (;;) {
            let changed = false;
            for (const group of groups(label)) {
                // A literal name may imitate a generated label. Decorate that
                // name too, without changing the original twin's stable label.
                const plain = group.filter(entry => entry.level === 0);
                for (const entry of plain.length ? plain : group) {
                    // Unusual legacy IDs can themselves contain parentheses.
                    // A full name/ID tuple is unambiguous even in that case.
                    if (entry.level < 2) { entry.level++; changed = true; }
                }
            }
            if (!changed) break;
        }
        return new Map(entries.map(entry => [entry.id, label(entry)]));
    }
    // Read-only index of the current workspace snapshot. Match the dashboard's
    // legacy missing-category semantics and deduplicate by identity, never name.
    function savedLocations(links = [], personalCategories = []) {
        const categoriesById = new Map(personalCategories.map(category => [category.id, category.name]));
        const locations = new Map();
        for (const link of links) {
            const url = canonicalURL(link.url);
            if (!url) continue;
            const id = link.category || 'work';
            if (!locations.has(url)) locations.set(url, new Map());
            locations.get(url).set(id, { id, name: categoriesById.get(id) || null });
        }
        return new Map(Array.from(locations, ([url, values]) => [url, Array.from(values.values())]));
    }
    return Object.freeze({ categories, pricing, canonicalURL, localized, validate, filter, savedURLs, savedLocations, personalCategoryLabels });
});
