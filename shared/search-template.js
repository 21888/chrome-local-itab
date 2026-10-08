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
        if (normalizedTemplate.includes('%s')) {
            return normalizedTemplate.split('%s').join(encoded);
        }
        // Query parameters belong before the fragment. URLSearchParams also
        // replaces a stale q value instead of leaving duplicate query keys.
        const url = new URL(normalizedTemplate);
        url.searchParams.set('q', String(query || '').trim());
        return url.toString();
    }

    global.LocalItabSearch = {
        normalizeHttpUrl,
        normalizeSearchTemplate,
        buildSearchUrl
    };
})(window);
