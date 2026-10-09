/* Pure, bounded Netscape HTML serialization. No I/O or configuration writes. */
(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports
        ? require('./bookmark-import.js') : root.LocalItabBookmarkImport);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabBookmarkExport = api;
})(typeof window === 'undefined' ? globalThis : window, function (importer) {
    'use strict';
    // Collection/byte budgets match the bookmark storage boundary; string budgets
    // match the importer. Reject excess rather than silently truncating data.
    const LIMITS = Object.freeze({ links: 20000, categories: 2000, bytes: 32 * 1024 * 1024,
        text: 256, id: 256, url: 4096 });
    const fail = () => { throw new Error('Bookmark export contains unsupported data or exceeds its limits.'); };
    function checked(value, limit) {
        if (typeof value !== 'string' || value.length > limit * 2) fail();
        let count = 0;
        for (const character of value) {
            const code = character.codePointAt(0);
            if (++count > limit || (code >= 0xd800 && code <= 0xdfff)
                || (code < 32 && ![9, 10, 13].includes(code)) || (code >= 127 && code <= 159)) fail();
        }
        return value;
    }
    function escape(value) {
        return value.replace(/[&<>"'\t\r\n]/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;',
            '"': '&quot;', "'": '&#39;', '\t': '&#9;', '\r': '&#13;', '\n': '&#10;'})[character]);
    }
    function serialize(config) {
        if (!config || !Array.isArray(config.links) || !Array.isArray(config.categories)
            || config.links.length > LIMITS.links || config.categories.length > LIMITS.categories) fail();
        const folders = [], byId = new Map(), loose = [];
        for (const category of config.categories) {
            if (!category || typeof category !== 'object') fail();
            const id = checked(category.id, LIMITS.id), name = checked(category.name, LIMITS.text);
            if (!id || byId.has(id)) fail();
            const folder = {name, links: []};
            byId.set(id, folder); folders.push(folder);
        }
        for (const link of config.links) {
            if (!link || typeof link !== 'object') fail();
            const title = checked(link.title, LIMITS.text), url = checked(link.url, LIMITS.url);
            const category = checked(link.category, LIMITS.id);
            if (url.length > LIMITS.url || !importer.canonicalURL(url)) fail();
            (byId.get(category)?.links || loose).push({title, url});
        }
        const chunks = []; let bytes = 0;
        function append(text) {
            for (const character of text) {
                const code = character.codePointAt(0);
                bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
            }
            if (bytes > LIMITS.bytes) fail();
            chunks.push(text);
        }
        function bookmarks(links, indent) {
            for (const link of links) append(`${indent}<DT><A HREF="${escape(link.url)}">${escape(link.title)}</A>\n`);
        }
        append('<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n<TITLE>Local iTab bookmarks</TITLE>\n<H1>Local iTab bookmarks</H1>\n<DL><p>\n');
        for (const folder of folders) {
            append(`    <DT><H3>${escape(folder.name)}</H3>\n    <DL><p>\n`);
            bookmarks(folder.links, '        ');
            append('    </DL><p>\n');
        }
        bookmarks(loose, '    ');
        append('</DL><p>\n');
        return chunks.join('');
    }
    return Object.freeze({LIMITS, serialize});
});
