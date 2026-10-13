'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const registry = require('../shared/dashboard-template-registry');
const sheets = [...read('newtab.html').matchAll(/<link\b[^>]*href="([^"]+\.css)"/g)].map(match => match[1]);
// Source-level template cascade contract, not a browser layout simulation.
// Preserve media nesting so desktop does not accidentally pass on a mobile rule.
function parseRules(css, media = []) {
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [];
    let cursor = 0;
    while (cursor < css.length) {
        const open = css.indexOf('{', cursor);
        if (open < 0) break;
        const selector = css.slice(cursor, open).trim();
        let end = open + 1, depth = 1;
        for (; depth && end < css.length; end++) {
            if (css[end] === '{') depth++;
            if (css[end] === '}') depth--;
        }
        assert.equal(depth, 0, 'balanced stylesheet');
        const body = css.slice(open + 1, end - 1);
        if (selector.startsWith('@media')) rules.push(...parseRules(body, [...media, selector]));
        else if (!selector.startsWith('@')) rules.push({ selector, body, media });
        cursor = end;
    }
    return rules;
}
const rules = sheets.flatMap(file => parseRules(read(file)));
function applicable(media, width) {
    return media.every(query => [...query.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)]
        .every(([, bound, value]) => bound === 'max' ? width <= Number(value) : width >= Number(value)));
}
function templateStyle(template, suffix, width) {
    const result = {};
    for (const rule of rules) {
        if (!rule.selector.endsWith(suffix) || !applicable(rule.media, width)) continue;
        const prefix = rule.selector.slice(0, -suffix.length);
        if (prefix !== ':root[data-dashboard-template]' &&
            prefix !== `:root[data-dashboard-template="${template}"]` &&
            !(prefix.startsWith(':root:is(') && prefix.includes(`[data-dashboard-template="${template}"]`))) continue;
        for (const declaration of rule.body.split(';')) {
            const colon = declaration.indexOf(':');
            if (colon >= 0) result[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
        }
    }
    return result;
}
test('Dock overrides the shared column axis on desktop as well as mobile', () => {
    assert(sheets.indexOf('dashboard-templates.css') < sheets.indexOf('dashboard-template-gallery.css'));
    const dock = rules.filter(rule => rule.selector === ':root[data-dashboard-template="dock"] #dashboard > .category-nav' && !rule.media.length);
    assert.equal(dock.length, 1);
    assert.match(dock[0].body, /(?:^|;)flex-direction:row;/);
    for (const width of [320, 375, 640, 760, 761, 1024, 1188, 1440]) {
        const nav = templateStyle('dock', ' #dashboard > .category-nav', width);
        assert.equal(nav.display, 'flex');
        assert.equal(nav['flex-direction'], 'row', `Dock row axis at ${width}px`);
        assert.equal(nav['flex-wrap'], 'wrap');
        assert.equal(nav['min-width'], '0');
        assert.equal(nav.overflow, 'visible', 'do not hide labels or focus outlines');
        assert(!['hidden', 'clip'].includes(nav['overflow-x']));
        const list = templateStyle('dock', ' #dashboard #category-list', width);
        assert.equal(list['flex-direction'], 'row');
        assert.equal(list['flex-wrap'], 'wrap');
        assert.equal(list.flex, '1 1 100%', 'the list occupies the next row, never a new column');
        assert.equal(list.width, '100%');
        assert.equal(list['min-width'], '0');
        assert.equal(list.overflow, 'visible');
    }
});
test('shared sidebar templates retain their desktop column axis', () => {
    assert.equal(registry.ids.length, 21);
    for (const template of ['clarity', 'graphite', 'folio', 'studio', 'console', 'ledger', 'terrace', 'column', 'bookmark', 'mosaic']) {
        assert.equal(templateStyle(template, ' #dashboard > .category-nav', 1188)['flex-direction'], 'column', template);
    }
    // This fix is scoped to the Dock navigation. Grid/free-layout selectors
    // and the shared template rule keep their existing behavior.
    const shared = rules.find(rule => rule.selector === ':root[data-dashboard-template] #dashboard > .category-nav' && !rule.media.length);
    assert.match(shared.body, /flex-direction:\s*column;/);
    const dock = rules.find(rule => rule.selector === ':root[data-dashboard-template="dock"] #dashboard > .category-nav' && !rule.media.length);
    assert.doesNotMatch(dock.body, /overflow|position|height|grid-template-columns/);
});
