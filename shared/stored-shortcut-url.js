/* Read-only destinations for stored shortcut identities. Never rewrite saved URLs. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabStoredURL = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    function destinationForSavedURL(raw) {
        if (typeof raw !== 'string' || !raw || raw.trim() !== raw) return null;
        // URL repairs backslashes/control characters and erases some authority
        // syntax. Reject those spellings before parsing; include bidi controls
        // and lone surrogates so invisible or replacement text cannot be admitted.
        if (/[\s\u0000-\u001f\u007f-\u009f\\\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufffd\ud800-\udfff]/u.test(raw)) return null;
        const explicit = /^https?:\/\//.test(raw);
        if (!explicit && (/^[a-z][a-z0-9+.-]*:/i.test(raw) || /^[/?#]/.test(raw))) return null;
        const start = explicit ? raw.indexOf('://') + 3 : 0;
        let end = raw.length;
        for (const delimiter of ['/', '?', '#']) {
            const at = raw.indexOf(delimiter, start);
            if (at !== -1) end = Math.min(end, at);
        }
        const authority = raw.slice(start, end);
        // The initial schemeless exception excludes host:port spellings. Their
        // interpretation differs from current launch helpers' scheme detection.
        if (!authority || authority.includes('@') || (!explicit && authority.includes(':'))) return null;
        for (let index = 0; index < raw.length; index++) {
            if (raw[index] === '%' && !/^[0-9a-fA-F]{2}$/.test(raw.slice(index + 1, index + 3))) return null;
        }
        try {
            const destination = new URL(explicit ? raw : `https://${raw}`);
            if (!['http:', 'https:'].includes(destination.protocol) || !destination.hostname || destination.username || destination.password) return null;
            return destination.href;
        } catch (_) { return null; }
    }
    return Object.freeze({ destinationForSavedURL });
});
