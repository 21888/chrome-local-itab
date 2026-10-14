'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { destinationForSavedURL: destination } = require('../shared/stored-shortcut-url.js');

for (const [raw, expected] of [
    ['https://example.com', 'https://example.com/'],
    ['https://example.com/', 'https://example.com/'],
    ['example.com', 'https://example.com/'],
    ['Example.COM/path?q=1#section', 'https://example.com/path?q=1#section'],
    ['http://Example.COM:80/path', 'http://example.com/path'],
    ['https://example.com:8443/path', 'https://example.com:8443/path'],
    ['https://[::1]/path', 'https://[::1]/path'],
    ['例子.测试/中文', 'https://xn--fsqu00a.xn--0zwm56d/%E4%B8%AD%E6%96%87'],
    ['example.com/a%20b?next=%2F#%23', 'https://example.com/a%20b?next=%2F#%23'],
    ['example.com/😀', 'https://example.com/%F0%9F%98%80']
]) test(`saved destination derives without mutating the spelling: ${raw}`, () => {
    const saved = { url: raw }, before = JSON.stringify(saved);
    assert.equal(destination(saved.url), expected);
    assert.equal(JSON.stringify(saved), before);
});

const unsupported = [undefined, null, 5, {}, '', ' example.com', 'example.com ', '\texample.com',
    'HTTPS://example.com', 'Http://example.com', 'javascript:alert(1)', 'data:text/html,synthetic', 'ftp://example.com',
    'example.com:443/path', '1example.com:443/path', '//example.com', '/example.com', '?example.com', '#example.com',
    'http:example.com', 'http:/example.com', 'http:///example.com', 'https:////example.com',
    'https://', 'https://?x=1', 'https://#x', 'https://user@example.com', 'https://user:pass@example.com',
    'https://@example.com', 'https://:pass@example.com', '@example.com', 'user@example.com',
    'https://example.com\\path', 'example.com\\path', 'https:\\example.com', 'https://exa mple.com',
    'https://example.com/%', 'https://example.com/%A', 'https://example.com/%ZZ', 'example.com/%2x',
    'https://example.com/\ud800', 'https://example.com/\udc00', 'https://example.com:65536/'];
for (const raw of unsupported) test(`unsupported saved destination is rejected: ${JSON.stringify(raw)}`, () => {
    assert.equal(destination(raw), null);
});
for (const character of ['\u0000', '\u001f', '\u007f', '\u0085', '\u009f', '\u00a0', '\u2003', '\u2028', '\u2029', '\ufeff', '\ufffd',
    '\u061c', '\u200e', '\u200f', '\u202a', '\u202b', '\u202c', '\u202d', '\u202e', '\u2066', '\u2067', '\u2068', '\u2069']) {
    test(`invisible or replacement character is not a saved exception: ${character.codePointAt(0).toString(16)}`, () => {
        for (const raw of [`example.com/a${character}b`, `https://example.com/a${character}b`, `exa${character}mple.com`]) assert.equal(destination(raw), null);
    });
}

test('helper browser global is frozen, pure, and available before every storage/consumer entrypoint', () => {
    const sandbox = { URL };
    for (const name of ['document', 'fetch', 'XMLHttpRequest', 'WebSocket', 'Image', 'chrome', 'localStorage', 'navigator', 'require', 'setTimeout']) {
        Object.defineProperty(sandbox, name, { get() { throw Error(`Unexpected I/O: ${name}`); } });
    }
    vm.runInNewContext(fs.readFileSync('shared/stored-shortcut-url.js', 'utf8'), sandbox);
    assert(Object.isFrozen(sandbox.LocalItabStoredURL));
    assert.equal(sandbox.LocalItabStoredURL.destinationForSavedURL('example.com'), 'https://example.com/');
    for (const file of ['newtab.html', 'options.html', 'collections.html']) {
        const html = fs.readFileSync(file, 'utf8'), first = html.indexOf('src="shared/stored-shortcut-url.js"');
        assert(first >= 0, file);
        for (const dependency of ['storage.js', 'shared/workspaces.js', 'shared/bookmark-import.js', 'shared/bookmark-export.js', 'shared/navigation-catalog.js', 'shared/shortcut-finder.js']) {
            const next = html.indexOf(`src="${dependency}"`);
            if (next >= 0) assert(first < next, `${file}: ${dependency}`);
        }
    }
});
