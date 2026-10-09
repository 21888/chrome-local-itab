/* Inert Netscape bookmark text parser. No DOM, I/O, storage or remote icon lookup. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabBookmarkImport = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const LIMITS = Object.freeze({ inputBytes: 10 * 1024 * 1024, bookmarks: 10000,
        additions: 2000, newCategories: 200, depth: 16, title: 256, path: 256,
        url: 4096, folders: 10000, skipExamples: 50 });
    const fail = code => { const error = new Error(`Bookmark import: ${code}`); error.code = code; throw error; };
    const space = c => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
    function bounded(value, max, code) {
        let count = 0;
        for (const _ of value) if (++count > max) fail(code);
        return value;
    }
    function checkInput(text) {
        if (typeof text !== 'string') fail('INPUT_TYPE');
        // Check UTF-16 length before scanning; UTF-8 cannot be shorter for valid text.
        if (text.length > LIMITS.inputBytes) fail('INPUT_LIMIT');
        let bytes = 0;
        for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i);
            if (c >= 0xd800 && c <= 0xdbff) {
                const next = text.charCodeAt(++i);
                if (!(next >= 0xdc00 && next <= 0xdfff)) fail('INVALID_UNICODE');
                bytes += 4;
            } else {
                if (c >= 0xdc00 && c <= 0xdfff) fail('INVALID_UNICODE');
                bytes += c < 0x80 ? 1 : c < 0x800 ? 2 : 3;
            }
            if (bytes > LIMITS.inputBytes) fail('INPUT_LIMIT');
        }
        return bytes;
    }
    // Only fixed, short HTML names and numeric references; never expand DTD entities.
    function entities(text) {
        return text.replace(/&(#(?:[xX][0-9a-fA-F]{1,8}|[0-9]{1,10})|amp|lt|gt|quot|apos|nbsp);/g, (whole, key) => {
            if (key[0] !== '#') return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' })[key];
            const hex = key[1] === 'x' || key[1] === 'X';
            const n = Number.parseInt(key.slice(hex ? 2 : 1), hex ? 16 : 10);
            return n === 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff) ? '\ufffd' : String.fromCodePoint(n);
        });
    }
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
    function skipCollector() {
        return { total: 0, reasons: Object.create(null), examples: [] };
    }
    function skip(summary, reason, index) {
        summary.total++;
        summary.reasons[reason] = (summary.reasons[reason] || 0) + 1;
        if (summary.examples.length < LIMITS.skipExamples) summary.examples.push({ reason, bookmarkIndex: index });
    }
    function readTag(text, start) {
        let i = start + 1, quote = '';
        for (; i < text.length; i++) {
            const c = text[i];
            if (quote) { if (c === quote) quote = ''; }
            else if (c === '"' || c === "'") quote = c;
            else if (c === '>') break;
            else if (c === '<') fail('MALFORMED_TAG');
        }
        if (i === text.length) fail('UNTERMINATED_TAG');
        const body = text.slice(start + 1, i);
        if (body[0] === '!') return { declaration: body, end: i + 1 };
        let j = 0, closing = false;
        if (body[j] === '/') { closing = true; j++; }
        const nameStart = j;
        while (j < body.length && /[a-zA-Z0-9:-]/.test(body[j])) j++;
        if (j === nameStart) fail('MALFORMED_TAG');
        const name = body.slice(nameStart, j).toLowerCase();
        if (j < body.length && !space(body[j]) && body[j] !== '/') fail('MALFORMED_TAG');
        let href, duplicateHref = false, selfClosing = false;
        while (j < body.length) {
            while (space(body[j])) j++;
            if (j === body.length) break;
            if (body[j] === '/' && j === body.length - 1) { selfClosing = true; j++; break; }
            if (closing) fail('MALFORMED_TAG');
            const a = j;
            while (j < body.length && !space(body[j]) && !['=', '/', '"', "'", '<', '>'].includes(body[j])) j++;
            if (a === j) fail('MALFORMED_ATTRIBUTE');
            const attr = body.slice(a, j).toLowerCase();
            while (space(body[j])) j++;
            let value = '';
            if (body[j] === '=') {
                j++; while (space(body[j])) j++;
                if (j === body.length) fail('MALFORMED_ATTRIBUTE');
                if (body[j] === '"' || body[j] === "'") {
                    const q = body[j++], begin = j;
                    while (j < body.length && body[j] !== q) j++;
                    if (j === body.length) fail('MALFORMED_ATTRIBUTE');
                    if (attr === 'href' && name === 'a') value = body.slice(begin, j);
                    j++;
                    if (j < body.length && !space(body[j]) && body[j] !== '/') fail('MALFORMED_ATTRIBUTE');
                } else {
                    const begin = j;
                    while (j < body.length && !space(body[j])) {
                        if (['"', "'", '<', '>', '`'].includes(body[j])) fail('MALFORMED_ATTRIBUTE');
                        j++;
                    }
                    if (attr === 'href' && name === 'a') value = body.slice(begin, j);
                }
            }
            if (attr === 'href' && name === 'a') {
                if (href !== undefined) duplicateHref = true;
                else href = value;
            }
        }
        return { name, closing, href, duplicateHref, selfClosing, end: i + 1 };
    }
    function parse(text) {
        const inputBytes = checkInput(text);
        const folders = [{ nodeId: 'root', parentId: null, title: '', path: '' }];
        const records = [], skipped = skipCollector(), stack = [];
        let marker = false, rootSeen = false, rootClosed = false, pending = null, capture = null, encountered = 0;
        function finishCapture() {
            const current = capture; capture = null;
            const title = bounded(entities(current.parts.join('')).replace(/\s+/gu, ' ').trim(), LIMITS.title, 'TITLE_LIMIT');
            if (current.kind === 'h3') {
                if (!title || /[\u0000-\u001f\u007f-\u009f\ufffd]/u.test(title)) fail('INVALID_FOLDER_TITLE');
                if (pending) fail('FOLDER_WITHOUT_LIST');
                pending = { title };
            } else {
                const raw = entities(current.href || '');
                if (raw.length > LIMITS.url) fail('URL_LIMIT');
                const url = canonicalURL(raw);
                if (url && url.length > LIMITS.url) fail('URL_LIMIT');
                if (!title || /[\u0000-\u001f\u007f-\u009f\ufffd]/u.test(title)) { skip(skipped, 'invalid_title', current.index); return; }
                if (current.duplicateHref) { skip(skipped, 'duplicate_href_attribute', current.index); return; }
                if (!url) { skip(skipped, 'invalid_url', current.index); return; }
                records.push({ title, url, folderId: stack[stack.length - 1].nodeId, bookmarkIndex: current.index });
            }
        }
        for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length;) {
            if (text[i] !== '<') {
                const next = text.indexOf('<', i), end = next === -1 ? text.length : next;
                if (!marker && text.slice(i, end).trim()) fail('MISSING_MARKER');
                if (capture) capture.parts.push(text.slice(i, end));
                i = end; continue;
            }
            if (text.startsWith('<!--', i)) {
                const end = text.indexOf('-->', i + 4);
                if (end === -1) fail('UNTERMINATED_COMMENT');
                i = end + 3; continue;
            }
            const tag = readTag(text, i); i = tag.end;
            if (tag.declaration !== undefined) {
                if (!marker && /^!doctype\s+netscape-bookmark-file-1\s*$/i.test(tag.declaration)) { marker = true; continue; }
                fail('UNSUPPORTED_DECLARATION');
            }
            if (!marker) fail('MISSING_MARKER');
            if (['template', 'noscript', 'object'].includes(tag.name)) fail('UNSUPPORTED_CONTAINER');
            if (['script', 'style', 'iframe', 'textarea', 'xmp'].includes(tag.name)) {
                if (tag.closing) fail('UNEXPECTED_RAW_CLOSE');
                let end = i;
                for (;;) {
                    // Search the original source. Only a fixed-size ASCII tag name is
                    // case-folded; no whole-input copy, Unicode offset drift or regex.
                    end = text.indexOf('</', end);
                    if (end === -1) fail('UNTERMINATED_RAW_TEXT');
                    const candidate = text.slice(end + 2, end + 2 + tag.name.length).toLowerCase();
                    const boundary = text[end + tag.name.length + 2];
                    if (candidate === tag.name && (boundary === '>' || space(boundary))) break;
                    end += 2;
                }
                const close = readTag(text, end);
                i = close.end; continue;
            }
            if (!['a', 'h3', 'dl'].includes(tag.name)) continue;
            if (tag.selfClosing) fail('SELF_CLOSING_STRUCTURE');
            if (tag.name === 'a' || tag.name === 'h3') {
                if (tag.closing) {
                    if (!capture || capture.kind !== tag.name) fail('UNBALANCED_TITLE');
                    finishCapture();
                } else {
                    if (capture || !stack.length || pending) fail('INVALID_STRUCTURE');
                    if (tag.name === 'a' && ++encountered > LIMITS.bookmarks) fail('BOOKMARK_LIMIT');
                    if (tag.href !== undefined && tag.href.length > LIMITS.url) fail('URL_LIMIT');
                    capture = { kind: tag.name, href: tag.href, duplicateHref: tag.duplicateHref, parts: [], index: encountered };
                }
            } else if (tag.closing) {
                if (capture || pending || !stack.length) fail('UNBALANCED_LIST');
                stack.pop(); if (!stack.length) rootClosed = true;
            } else {
                if (capture || rootClosed) fail('INVALID_STRUCTURE');
                if (!rootSeen) { rootSeen = true; stack.push(folders[0]); }
                else {
                    if (!pending || !stack.length) fail('LIST_WITHOUT_FOLDER');
                    if (stack.length > LIMITS.depth) fail('DEPTH_LIMIT');
                    if (folders.length > LIMITS.folders) fail('FOLDER_LIMIT');
                    const parent = stack[stack.length - 1];
                    const path = bounded(parent.path ? `${parent.path} / ${pending.title}` : pending.title, LIMITS.path, 'PATH_LIMIT');
                    const folder = { nodeId: `f${folders.length}`, parentId: parent.nodeId, title: pending.title, path };
                    folders.push(folder); stack.push(folder); pending = null;
                }
            }
        }
        if (!marker) fail('MISSING_MARKER');
        if (!rootSeen || stack.length || capture || pending) fail('INCOMPLETE_STRUCTURE');
        return { inputBytes, encountered, folders, records, skipped };
    }
    function planImport(text, existing, options = {}) {
        if (!existing || !Array.isArray(existing.links) || !Array.isArray(existing.categories)) fail('INVALID_EXISTING');
        if (typeof options.createCategoryId !== 'function') fail('ID_FACTORY_REQUIRED');
        const rootLabel = options.rootLabel === undefined ? 'Imported bookmarks' : options.rootLabel;
        if (typeof rootLabel !== 'string' || !rootLabel.trim() || /[\u0000-\u001f\u007f-\u009f]/u.test(rootLabel)) fail('INVALID_ROOT_LABEL');
        bounded(rootLabel, LIMITS.path, 'PATH_LIMIT');
        const parsed = parse(text), seen = new Set(), usedIds = new Set(['all']), usedNames = new Set();
        for (const link of existing.links) {
            const url = canonicalURL(link && link.url); if (url) seen.add(url);
            if (link && typeof link.category === 'string') usedIds.add(link.category);
        }
        const categoryIds = new Set();
        for (const cat of existing.categories) {
            if (!cat || typeof cat.id !== 'string' || !cat.id || categoryIds.has(cat.id) || typeof cat.name !== 'string') fail('INVALID_EXISTING');
            categoryIds.add(cat.id); usedIds.add(cat.id); usedNames.add(cat.name);
        }
        const accepted = [], skipped = parsed.skipped;
        for (const record of parsed.records) {
            if (seen.has(record.url)) { skip(skipped, 'duplicate_url', record.bookmarkIndex); continue; }
            seen.add(record.url); accepted.push(record);
            if (accepted.length > LIMITS.additions) fail('ADDITION_LIMIT');
        }
        const needed = new Set(accepted.map(record => record.folderId));
        if (needed.size > LIMITS.newCategories) fail('CATEGORY_LIMIT');
        const categories = [], mapping = new Map();
        for (const folder of parsed.folders) {
            if (!needed.has(folder.nodeId)) continue;
            const base = folder.nodeId === 'root' ? rootLabel : folder.path;
            let name = base, suffix = 2;
            while (usedNames.has(name)) name = `${base} (${suffix++})`;
            bounded(name, LIMITS.path, 'PATH_LIMIT');
            const id = options.createCategoryId({ index: categories.length, sourceNodeId: folder.nodeId });
            if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(id) || usedIds.has(id)) fail('ID_COLLISION_OR_INVALID');
            usedNames.add(name); usedIds.add(id);
            categories.push({ id, name, icon: '📁' });
            mapping.set(folder.nodeId, { sourceNodeId: folder.nodeId, sourcePath: folder.path,
                sourceTitle: folder.title, parentNodeId: folder.parentId, categoryId: id, categoryName: name });
        }
        const links = accepted.map(record => ({ title: record.title, url: record.url,
            category: mapping.get(record.folderId).categoryId, icon: '🔗' }));
        return { additions: { links, categories }, preview: { inputBytes: parsed.inputBytes,
            encounteredBookmarks: parsed.encountered, validBookmarks: parsed.records.length,
            addedBookmarks: links.length, newCategories: categories.length,
            skippedBookmarks: skipped.total, skippedReasons: skipped.reasons,
            skipExamples: skipped.examples, omittedSkipExamples: skipped.total - skipped.examples.length,
            folderMapping: [...mapping.values()] } };
    }
    return Object.freeze({ LIMITS, parse, planImport, canonicalURL });
});
