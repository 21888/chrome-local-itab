/* Pure, bounded Netscape HTML serialization. No I/O or configuration writes. */
(function (root, factory) {
    const api = factory(typeof module === 'object' && module.exports
        ? require('./bookmark-import.js') : root.LocalItabBookmarkImport,
        typeof module === 'object' && module.exports
            ? require('./stored-shortcut-url.js') : root.LocalItabStoredURL);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabBookmarkExport = api;
})(typeof window === 'undefined' ? globalThis : window, function (importer, storedURL) {
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
            const title = checked(link.title, LIMITS.text), raw = checked(link.url, LIMITS.url);
            const destination = importer.canonicalURL(raw) || storedURL.destinationForSavedURL(raw);
            if (!destination) fail();
            const url = checked(destination, LIMITS.url);
            const category = checked(link.category, LIMITS.id);
            // URL encoding can expand valid Unicode input. Bound the derived HREF
            // too; append() separately enforces the complete escaped byte budget.
            if (raw.length > LIMITS.url || url.length > LIMITS.url) fail();
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
    // Copy only export fields, before filtering. Neither a caller mutation nor
    // an unrelated Settings edit may silently change the reviewed download.
    function snapshot(config) {
        if (!config || !Array.isArray(config.links) || !Array.isArray(config.categories)
            || config.links.length > LIMITS.links || config.categories.length > LIMITS.categories) fail();
        const categories = config.categories.map(category => {
            if (!category || typeof category !== 'object') fail();
            return Object.freeze({id: checked(category.id, LIMITS.id), name: checked(category.name, LIMITS.text)});
        });
        const links = config.links.map(link => {
            if (!link || typeof link !== 'object') fail();
            return Object.freeze({title: checked(link.title, LIMITS.text), url: checked(link.url, LIMITS.url),
                category: checked(link.category, LIMITS.id)});
        });
        return Object.freeze({categories: Object.freeze(categories), links: Object.freeze(links)});
    }
    function prepare(config, scope = {kind: 'all'}) {
        const saved = snapshot(config);
        // Preserve every existing validation, including the full HTML byte
        // budget. A small selected folder cannot hide invalid/excess source data.
        const allHTML = serialize(saved);
        if (!scope || !['all', 'category'].includes(scope.kind)) fail();
        let selected = saved, selection = {kind: 'all'};
        if (scope.kind === 'category') {
            const category = saved.categories.find(item => item.id === scope.id);
            if (!category) fail();
            selection = {kind: 'category', id: category.id};
            selected = {categories: [category], links: saved.links.filter(link => link.category === category.id)};
        }
        return Object.freeze({snapshot: saved, scope: Object.freeze(selection),
            html: scope.kind === 'all' ? allHTML : serialize(selected),
            siteCount: selected.links.length, folderCount: selected.categories.length});
    }
    function matches(prepared, config) {
        return JSON.stringify(prepared.snapshot) === JSON.stringify(snapshot(config));
    }
    return Object.freeze({LIMITS, serialize, prepare, matches});
});
