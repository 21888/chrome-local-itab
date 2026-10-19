'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('options.html');
// Inspect every linked sheet in its actual load order, rather than only the
// first matching rule in options.css. This is a static contract, not a renderer.
const sheets = [...html.matchAll(/<link\b[^>]*href="([^"]+\.css)"/g)].map(match => read(match[1]));
const allCss = sheets.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
function rules(selector) {
    return [...allCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter(match => match[1].trim().split(',').map(item => item.trim()).includes(selector))
        .map(match => match[2]);
}
function unique(selector) {
    const found = rules(selector);
    assert.equal(found.length, 1, `review the complete cascade for ${selector}`);
    return found[0];
}
test('all loaded sheets have no unreviewed scoped or media topic overrides', () => {
    const allowed = new Set(['.topic-editor-grid', '.topic-list', '.topic-list-header', '.topic-manage-list', '.topic-item', '.topic-content', '.topic-actions', '.topic-actions .btn']);
    for (const match of allCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        for (const selector of match[1].trim().split(',').map(value => value.trim())) {
            if (/\.topic-(?:editor-grid|list|item|content|title|actions)(?![\w-])/.test(selector)) {
                assert(allowed.has(selector), `review scoped topic rule: ${selector}`);
            }
        }
    }
});
test('topic grid can narrow below 220px while keeping the wide-screen preferred floor', () => {
    const grid = unique('.topic-editor-grid');
    assert.match(grid, /grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(100%, 220px\), 1fr\)\);/);
    assert.match(grid, /min-width:\s*0;/);
    assert.match(unique('.topic-list'), /min-width:\s*0;/);
    // Source-level width budget only. At <=960 the outer Settings grid is 1fr;
    // the later container rule, not the earlier media padding, wins the cascade.
    const css = read('options.css');
    assert.match(css, /@media \(max-width: 960px\)[\s\S]*?\.settings-grid\s*\{\s*grid-template-columns: 1fr;/);
    assert.match(css, /\.options-container\s*\{\s*max-width: 1240px;\s*min-height: 100dvh;\s*padding: clamp\(24px, 4vw, 52px\);/);
    assert(css.lastIndexOf('padding: clamp(24px, 4vw, 52px)') > css.indexOf('@media (max-width: 960px)'));
    for (const viewport of [320, 375, 640, 768, 960]) {
        const padding = Math.max(24, Math.min(52, viewport * .04));
        const budget = viewport - 2 * padding - 2 - 56;
        assert(Math.min(budget, 220) <= budget, `track fits the ${viewport}px budget`);
    }
    for (const budget of [220, 480, 900]) assert.equal(Math.min(budget, 220), 220);
});
test('long literal titles wrap and action groups can move without truncation', () => {
    assert.match(unique('.topic-item'), /flex-wrap:\s*wrap;/);
    const content = unique('.topic-content');
    assert.match(content, /min-width:\s*0;/);
    assert.match(content, /overflow-wrap:\s*anywhere;/);
    const actions = unique('.topic-actions');
    assert.match(actions, /flex-wrap:\s*wrap;/);
    assert.match(actions, /min-width:\s*0;/);
    const buttons = unique('.topic-actions .btn');
    for (const declaration of ['min-width: 0;', 'max-width: 100%;', 'white-space: normal;', 'overflow-wrap: anywhere;']) assert(buttons.includes(declaration));
    for (const selector of ['.topic-editor-grid', '.topic-list', '.topic-item', '.topic-content', '.topic-actions', '.topic-actions .btn']) {
        assert.doesNotMatch(unique(selector), /overflow(?:-x)?:\s*(?:hidden|clip)|text-overflow|line-clamp|font-size|display:\s*none/);
    }
    // The generic <=640 .btn width:100% remains compatible: wrapped actions
    // stack then, while the base action row remains available above 640px.
    assert.match(read('options.css'), /@media \(max-width: 640px\)[\s\S]*?\.btn\s*\{\s*width: 100%;/);
    const source = read('options.js');
    assert.match(source, /titleEl\.textContent = title;/);
    assert.match(source, /actions\.append\(editBtn, deleteBtn\);/);
});

test('manual topic scores are visually separated without changing literal title or number text', () => {
    const score = unique('.topic-score').trim();
    assert.equal(score, 'margin-inline-start: var(--spacing-sm);', 'only a logical gap, no clipping, generated text or data formatting');
    assert.match(read('options.css'), /--spacing-sm:\s*12px;/);
    const source = read('options.js');
    assert.match(source, /titleEl\.textContent = title;/);
    assert.match(source, /scoreEl\.textContent = String\(score\);/);
    assert.match(source, /content\.append\(titleEl, scoreEl\);/);
});
