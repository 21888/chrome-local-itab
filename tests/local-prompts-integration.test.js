const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
test('dedicated library is discoverable in newtab without settings or additional permissions', () => {
    const html = read('newtab.html'); assert.match(html, /class="prompt-library-entry" href="prompts.html" target="_blank" rel="noopener"/);
    assert.match(html, /prompt-library-entry.css/); assert.match(html, /data-i18n="promptsEntry"/);
    const manifest = JSON.parse(read('manifest.json')); assert.deepEqual(manifest.permissions, ['storage', 'unlimitedStorage', 'identity']);
    const bootstrap = read('prompts.js'); assert.match(bootstrap, /createPromptBackend\(root.LocalItabPrompts\)/); assert.doesNotMatch(bootstrap, /manager\.ready\(|storageManager|createChromeBackend\(/);
});
test('script dependencies and runtime files cover self-contained page', () => {
    const html = read('prompts.html'), pack = read('tools/package_extension.py');
    for (const name of ['prompts.html', 'prompts.js', 'prompts.css', 'prompt-library-entry.css', 'shared/local-prompts-store.js', 'shared/local-prompts-controller.js', 'shared/local-prompts-view.js']) assert.ok(pack.includes(`"${name}"`), name);
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(match => match[1]);
    for (const file of scripts) assert.ok(fs.existsSync(path.join(__dirname, '..', file)), file);
    assert.ok(scripts.indexOf('shared/local-prompts-store.js') < scripts.indexOf('shared/local-prompts-controller.js'));
    assert.ok(scripts.indexOf('shared/workspaces.js') < scripts.indexOf('prompts.js'));
    const options = read('options.html'); assert.ok(options.indexOf('src="shared/local-prompts-store.js"') < options.indexOf('src="shared/complete-backup.js"'));
});
test('every library literal label has Chinese and English messages', () => {
    const source = read('shared/local-prompts-view.js'), en = JSON.parse(read('_locales/en/messages.json')), zh = JSON.parse(read('_locales/zh_CN/messages.json'));
    const names = new Set([...source.matchAll(/(?:this\.t|this\.button)\('([^']+)'/g)].map(match => `prompts${match[1]}`));
    for (const name of ['PageTitle', 'Skip', 'All', 'Favorites', 'Trash', 'Unfavorite', 'Entry']) names.add(`prompts${name}`);
    for (const name of names) { assert.ok(en[name]?.message, `${name} en`); assert.ok(zh[name]?.message, `${name} zh_CN`); }
    assert.deepEqual(Object.keys(en).filter(key => key.startsWith('prompts')).sort(), Object.keys(zh).filter(key => key.startsWith('prompts')).sort());
});
test('CSS provides real narrow layout, theme tokens and visible focus', () => {
    const css = read('prompts.css'); assert.match(css, /max-width: 560px/); assert.match(css, /\.prompt-layout \{ display: block/); assert.match(css, /focus-visible/); assert.match(css, /var\(--template-text\)/); assert.match(css, /var\(--template-surface\)/); assert.match(css, /overflow-wrap: anywhere/);
});
