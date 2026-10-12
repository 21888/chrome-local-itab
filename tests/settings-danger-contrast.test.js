'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const sheets = [...read('options.html').matchAll(/<link\b[^>]*href="([^"]+\.css)"/g)].map(match => read(match[1]));
const css = sheets.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
function declarations(selector) {
    return Object.fromEntries(rules.filter(rule => rule[1].trim().split(',').map(s => s.trim()).includes(selector))
        .flatMap(rule => [...rule[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()])));
}
function color(value) {
    if (/^#[\da-f]{6}$/i.test(value)) return [...value.slice(1).match(/../g).map(c => parseInt(c, 16)), 1];
    const rgba = value.match(/^rgba\(([^)]+)\)$/);
    assert(rgba, `supported source color: ${value}`);
    return rgba[1].split(',').map(Number);
}
function over(front, back) { return front.slice(0, 3).map((c, i) => c * front[3] + back[i] * (1 - front[3])).concat(1); }
function luminance(c) { return c.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0); }
function contrast(a, b) { const [hi, lo] = [luminance(a), luminance(b)].sort((a, b) => b - a); return (hi + .05) / (lo + .05); }
const generic = declarations('.btn-danger');
const light = declarations(':root[data-color-mode="light"]')['--danger-button-text'];
const fallback = declarations(':root:not([data-color-mode])[data-theme="ink-paper"]')['--danger-button-text'];
test('final generic danger ink follows light mode, without overriding specialized buttons', () => {
    assert.equal(generic.color, 'var(--danger-button-text, #ffd1c8)');
    assert.equal(light, '#87372b'); assert.equal(fallback, light);
    const tokenRules = rules.filter(rule => /--danger-button-text\s*:/.test(rule[2]));
    assert.equal(tokenRules.length, 1);
    assert.equal(tokenRules[0][1].trim(), ':root[data-color-mode="light"],\n:root:not([data-color-mode])[data-theme="ink-paper"]');
    assert.equal(declarations('.complete-backup .complete-backup-apply.btn-danger').color, 'var(--backup-action-text)');
    // Explicit dark ink-paper must keep dark ink; only the no-mode fallback is light.
    assert.equal(declarations(':root[data-color-mode="dark"]')['--danger-button-text'], undefined);
});
for (const template of ['clarity', 'graphite', 'folio']) {
    for (const mode of ['light', 'dark']) test(`${template} ${mode} topic Delete alpha-composited text contrast meets AA`, () => {
        const tokens = { ...declarations(`:root[data-dashboard-template][data-color-mode="${mode}"]`), ...declarations(`:root[data-dashboard-template="${template}"][data-color-mode="${mode}"]`) };
        let background = color(tokens['--template-surface']);
        for (const selector of ['.topic-list', '.topic-item', '.btn-danger']) background = over(color(declarations(selector).background), background);
        const foreground = over(color(mode === 'light' ? light : '#ffd1c8'), background);
        const ratio = contrast(foreground, background);
        assert(ratio >= 4.5, `${ratio.toFixed(2)}:1`);
        if (mode === 'light') assert(contrast(color('#ffd1c8'), background) < 1.5, 'fixture reproduces the original pale-ink regression');
        console.log(`${template} ${mode}: ${ratio.toFixed(2)}:1, composite rgb(${background.slice(0, 3).map(Math.round).join(', ')})`);
    });
}
test('legacy ink-paper translucent layers also retain AA contrast', () => {
    const ink = declarations(':root[data-theme="ink-paper"]');
    // Check both black and white backdrops, bounding the translucent surface
    // even if the user's background differs from the default page gradient.
    for (const backdrop of ['#000000', '#ffffff']) {
        let background = over(color(ink['--glass-bg']), color(backdrop));
        for (const selector of ['.topic-list', '.topic-item', '.btn-danger']) background = over(color(declarations(selector).background), background);
        const ratio = contrast(color(fallback), background);
        assert(ratio >= 4.5, `${backdrop}: ${ratio.toFixed(2)}:1`);
        console.log(`legacy ink-paper over ${backdrop}: ${ratio.toFixed(2)}:1`);
    }
});
test('generic hover and keyboard-focus rules do not replace the verified color pair', () => {
    for (const selector of ['.btn:hover', '.btn:focus-visible', '.btn-danger:hover', '.btn-danger:focus-visible', 'button:focus-visible']) {
        const rule = declarations(selector);
        for (const property of ['color', 'background', 'background-color', 'opacity']) assert.equal(rule[property], undefined, `${selector}: review ${property}`);
    }
});
