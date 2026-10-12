'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const css = read('update-checker.css');
const narrow = css.slice(css.indexOf('@media (max-width: 960px)'));
function rules(selector) {
    const start = narrow.indexOf(`${selector} {`);
    assert(start >= 0, `missing narrow selector: ${selector}`);
    return narrow.slice(start + selector.length + 2, narrow.indexOf('}', start));
}

test('Privacy narrow layout removes automatic track and flex-item minimums together', () => {
    assert.match(narrow, /^@media \(max-width: 960px\)/);
    assert.match(rules('#tab-privacy'), /min-width: 0;/);
    assert.match(rules('#tab-privacy'), /max-width: 100%;/);
    assert.match(rules('#tab-privacy .settings-grid'), /grid-template-columns: minmax\(0, 1fr\);/);
    assert.match(narrow, /#tab-privacy \.setting-group,\s*#tab-privacy \.setting-info\s*\{\s*min-width: 0;/);
});

test('long addresses and action labels wrap without truncating or shrinking type', () => {
    assert.match(rules('#tab-privacy'), /overflow-wrap: anywhere;/);
    assert.match(rules('#version-update-settings .update-actions > *'), /min-width: 0; max-width: 100%;/);
    assert.match(rules('#version-update-settings .update-actions .btn'), /white-space: normal; overflow-wrap: anywhere;/);
    assert.doesNotMatch(narrow, /overflow(?:-x)?:\s*(?:hidden|clip)|text-overflow|line-clamp|font-size|display:\s*none/);
});

test('narrow overrides remain scoped to Privacy and preserve both cards and backup controls', () => {
    const selectors = [...narrow.matchAll(/([^{}]+)\{/g)].map(match => match[1].trim()).slice(1);
    for (const selector of selectors) {
        for (const item of selector.split(',')) assert.match(item.trim(), /^#(?:tab-privacy|version-update-settings)(?:\s|$)/);
    }
    const html = read('options.html');
    const privacy = html.slice(html.indexOf('id="tab-privacy"'), html.indexOf('id="tab-content"'));
    for (const id of ['version-update-settings', 'privacy-settings', 'update-backup-shortcuts', 'update-automatic', 'privacy-online-favicons']) {
        assert(privacy.includes(`id="${id}"`));
    }
    for (const target of ['data-settings', 'countdown-settings']) assert(privacy.includes(`data-update-backup-target="${target}"`));
    assert(privacy.includes('https://www.google.com/s2/favicons'));
    assert(privacy.includes('chrome://extensions'));
    assert(html.indexOf('update-checker.css') > html.indexOf('options.css'));
});
