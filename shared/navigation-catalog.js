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
    return Object.freeze({ categories, pricing, canonicalURL, localized, validate, filter, savedURLs });
});
