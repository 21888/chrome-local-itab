const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
test('world clock editor uses the shared padded header and an inset control body', () => {
    const html = fs.readFileSync(path.join(root, 'options.html'), 'utf8');
    const section = html.match(/<section[^>]+id="world-clock-settings"[\s\S]*?<\/section>/)[0];
    assert.match(section, /class="section-header">\s*<h2 id="world-clock-heading"/);
    assert.match(section, /id="world-clock-help"[\s\S]*?<\/p>\s*<\/div>\s*<div class="world-clock-body">/);
    assert.match(section, /id="world-clock-save"[\s\S]*?<\/button>\s*<\/div>\s*<\/section>/);
    for (const id of ['world-clock-list', 'world-clock-zone', 'world-clock-label', 'world-clock-add', 'world-clock-error', 'world-clock-save']) {
        assert.equal(section.split(`id="${id}"`).length, 2);
    }
    const css = fs.readFileSync(path.join(root, 'options.css'), 'utf8');
    assert.match(css, /\.world-clock-body\s*\{\s*padding:\s*var\(--spacing-xl\);\s*\}/);
});
