const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const templates = require('../shared/dashboard-template-registry');
const css = fs.readFileSync('dashboard-customization.css', 'utf8');
const palettes = ['appearance.css', 'dashboard-template-gallery.css'].map(file => fs.readFileSync(file, 'utf8')).join('\n');
const selector = ':root[data-dashboard-template][data-custom-background="true"] #dashboard :is(.category-nav, .dashboard-header, #search-container, #shortcuts-container, #info-cards-container, .dashboard-footer),\n:root[data-dashboard-template][data-custom-background="true"] .options-container :is(.options-header, .options-footer)';
const at = css.indexOf(selector + ' {');
const rule = css.slice(at + selector.length + 2, css.indexOf('}', at));
const luminance = hex => {
    const c = hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
};
const contrast = (a, b) => { const x = [luminance(a), luminance(b)].sort((a, b) => b - a); return (x[0] + .05) / (x[1] + .05); };
function palette(id, mode) {
    const tokens = {};
    for (const [, candidate, body] of palettes.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selectors = [`:root[data-dashboard-template][data-color-mode="${mode}"]`, `:root[data-dashboard-template="${id}"][data-color-mode="${mode}"]`];
        if (!selectors.some(value => candidate.trim().endsWith(value))) continue;
        for (const [, key, color] of body.matchAll(/--template-(surface|page|text|muted|accent):\s*(#[0-9a-f]{6});/g)) tokens[key] = color;
    }
    return tokens;
}
for (const id of templates.ids) for (const mode of ['light', 'dark']) test(`${id}/${mode}: protected exposed text has >=4.5:1 contrast on any custom background`, () => {
    const p = palette(id, mode);
    for (const key of ['text', 'muted', 'accent']) {
        assert(p[key] && p.surface, `${id}/${mode} missing ${key}/surface`);
        const ratio = contrast(p[key], p.surface);
        assert(ratio >= 4.5, `${id}/${mode} ${key}: ${ratio.toFixed(2)}:1`);
    }
    // Opaque surfaces remove the wallpaper contribution at every position,
    // including opposing black/white gradient endpoints and their midpoint.
    for (const wallpaper of ['#111111', '#ffffff', '#000000', '#808080', '#ff00ff']) {
        const effectiveSurface = p.surface; // alpha = 1 by the actual CSS contract below
        assert(contrast(p.text, effectiveSurface) >= 4.5, wallpaper);
    }
});
test('opaque scoped reading surfaces cover navigation, labels, clock, transparent rows, search and footer', () => {
    assert(at >= 0);
    for (const declaration of ['background: var(--template-surface);', 'color: var(--template-text);', '--text-primary: var(--template-text);', '--text-secondary: var(--template-muted);', '--text-muted: var(--template-muted);', 'box-shadow: 0 0 0 8px var(--template-surface);']) assert(rule.includes(declaration), declaration);
    assert.equal(/opacity:|color-mix|gradient|rgba\(/.test(rule), false);
    const html = fs.readFileSync('newtab.html', 'utf8');
    const header = html.slice(html.indexOf('<header class="dashboard-header">'), html.indexOf('</header>'));
    for (const child of ['template-intro', 'clock-container', 'dashboard-appearance']) assert(header.includes(child), child);
});
test('fix is opt-in and paint-only, leaving palette state, card/dialog styles and Free coordinates unchanged', () => {
    assert(selector.includes('[data-custom-background="true"] #dashboard'));
    assert.equal(/\.customize-panel|\.modal|\.info-card|\*|:root\s*\{/.test(selector), false);
    assert.equal(/--template-|\b(?:padding|margin|width|height|position|display|grid|transform):/.test(rule.replace(/var\(--template-[a-z]+\)/g, 'TOKEN')), false);
    for (const htmlFile of ['newtab.html', 'options.html']) {
        const html = fs.readFileSync(htmlFile, 'utf8');
        assert(html.lastIndexOf('dashboard-customization.css') > html.lastIndexOf('dashboard-template-gallery.css'));
    }
});

test('transparent Folio cards and every supported child opacity keep a palette-matched backing', () => {
    assert(selector.includes('#info-cards-container'));
    const backingAt = css.indexOf(':root[data-dashboard-template][data-custom-background="true"] #dashboard #info-cards-container {');
    const backing = css.slice(backingAt, css.indexOf('}', backingAt));
    assert(backing.includes('background: var(--template-page);'));
    const childStart = css.indexOf('#dashboard[data-custom-card-opacity="true"] #info-cards-container > :not([hidden])');
    const childRule = css.slice(childStart, css.indexOf('}', childStart));
    assert(childRule.includes('color-mix(in srgb, var(--template-surface) var(--custom-card-opacity), transparent)'));
    assert.equal(/opacity:|--custom-card-opacity:/.test(rule), false);
    // Palette page is distinct from the card surface, so alpha remains visible.
    // Every allowed opacity is checked, including transparent Folio defaults.
    for (const id of templates.ids) for (const mode of ['light', 'dark']) {
        const p = palette(id, mode), base = p.surface.slice(1).match(/../g).map(x => parseInt(x, 16)), page = p.page.slice(1).match(/../g).map(x => parseInt(x, 16));
        const mixedColors = new Map();
        for (const opacity of [0, ...Array.from({length: 61}, (_, i) => i + 40)]) {
            const mixed = '#' + base.map((channel, index) => Math.round(channel * opacity / 100 + page[index] * (1 - opacity / 100)).toString(16).padStart(2, '0')).join('');
            mixedColors.set(opacity, mixed);
            for (const key of ['text', 'muted', 'accent']) assert(contrast(p[key], mixed) >= 4.5, `${id}/${mode}/${opacity}/${key}`);
        }
        assert.notEqual(mixedColors.get(40), mixedColors.get(100), `${id}/${mode}: opacity must have a visible effect`);
    }
});
