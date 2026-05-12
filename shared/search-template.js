(function initSearchTemplate(global) {
    'use strict';

    function withHttpProtocol(value) {
        const trimmed = String(value || '').trim();
        if (!trimmed) return '';
        return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    }

    function normalizeHttpUrl(rawUrl) {
        const withProtocol = withHttpProtocol(rawUrl);
        if (!withProtocol) return '';
        const parsed = new URL(withProtocol);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error('Only HTTP and HTTPS URLs are supported');
        }
        return parsed.toString();
    }

    function normalizeSearchTemplate(rawTemplate) {
        return normalizeHttpUrl(rawTemplate);
    }

    function buildSearchUrl(template, query) {
        const encoded = encodeURIComponent(String(query || '').trim());
        if (!encoded) return '';
        const normalizedTemplate = normalizeSearchTemplate(template);
        return normalizedTemplate.includes('%s')
            ? normalizedTemplate.split('%s').join(encoded)
            : `${normalizedTemplate}${normalizedTemplate.includes('?') ? '&' : '?'}q=${encoded}`;
    }

    global.LocalItabSearch = {
        normalizeHttpUrl,
        normalizeSearchTemplate,
        buildSearchUrl
    };
})(window);
