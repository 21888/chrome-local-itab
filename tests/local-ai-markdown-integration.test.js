const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = file => fs.readFileSync(file, 'utf8');
test('saved-item Markdown dependency is explicitly packaged and loaded before both detail views', () => {
    const runtime = 'shared/local-ai-markdown.js';
    const pack = read('tools/package_extension.py');
    assert.equal(pack.split(`"${runtime}"`).length - 1, 1);
    for (const [page, view] of [['prompts', 'local-prompts'], ['collections', 'local-ai-collections']]) {
        const scripts = [...read(`${page}.html`).matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
        assert.equal(scripts.filter(script => script === runtime).length, 1);
        assert.ok(scripts.indexOf(runtime) < scripts.indexOf(`shared/${view}-view.js`));
    }
    const manifest = JSON.parse(read('manifest.json'));
    assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
    assert.deepEqual(manifest.permissions, ['storage', 'unlimitedStorage', 'identity', 'contextMenus']);
});
test('all Markdown controls have English and Chinese labels and no execution/network sink', () => {
    for (const lang of ['en', 'zh_CN']) {
        const catalog = JSON.parse(read(`_locales/${lang}/messages.json`));
        for (const prefix of ['prompts', 'collections']) for (const suffix of ['Export', 'Review', 'Warning', 'Version', 'BodyVersion', 'Download', 'Requested', 'Failed', 'Source']) assert.ok(catalog[`${prefix}Markdown${suffix}`]?.message);
    }
    assert.doesNotMatch(read('shared/local-ai-markdown.js'), /fetch\(|XMLHttpRequest|innerHTML|eval\(/);
});
