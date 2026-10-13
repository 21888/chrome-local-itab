'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.resolve(__dirname, '../dashboard-templates.css'), 'utf8');
const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector.trim(), body }));
const folio = ':root[data-dashboard-template="folio"] #dashboard .category-item';
const body = selector => {
    const matches = rules.filter(rule => rule.selector === selector);
    assert(matches.length > 0, selector);
    return matches.map(rule => rule.body).join('\n');
};
// Source contracts only: actual text/outline painting is checked in native Chrome.
test('Folio category content reserves stable inline space for its inset focus ring', () => {
    const base = body(folio);
    assert.match(base, /padding:\s*10px 0;/, 'keep block padding and height');
    assert.match(base, /padding-inline:\s*6px;/, 'keep counts away from both inset edges');
    assert(base.indexOf('padding-inline:') > base.indexOf('padding:'), 'longhand wins the cascade');
    assert.match(base, /min-height:\s*43px;/);
    assert.match(base, /flex:\s*0 0 auto;/);
    assert.match(base, /gap:\s*7px;/);
    assert.match(base, /border:\s*0;/);
    assert.match(base, /border-bottom:\s*2px solid transparent;/);
    for (const rule of rules.filter(rule => rule.selector.includes(folio) && rule.selector !== folio)) {
        if (rule.selector === folio) continue;
        assert.doesNotMatch(rule.body, /(?:padding|width|height|gap|transform)\s*:/, 'focus/active must not move content');
    }
});
test('shared category focus, label ellipsis and visible counts are preserved', () => {
    const focus = body(':root[data-dashboard-template] #dashboard #category-list .category-item:focus-visible');
    assert.match(focus, /outline:\s*3px solid var\(--template-focus\);/);
    assert.match(focus, /outline-offset:\s*-3px;/);
    const name = body(':root[data-dashboard-template] #dashboard .category-name');
    assert.match(name, /min-width:\s*0;/);
    assert.match(name, /text-overflow:\s*ellipsis;/);
    assert.match(name, /white-space:\s*nowrap;/);
    assert.match(body(':root[data-dashboard-template="folio"] #dashboard .category-count'), /margin-inline-start:\s*2px;/);
    for (const rule of rules.filter(rule => rule.selector.includes('category-count'))) {
        assert.doesNotMatch(rule.body, /display:\s*none|visibility:\s*hidden|opacity:\s*0(?:;|\s)|font-size:\s*0(?:px)?;/);
    }
});
