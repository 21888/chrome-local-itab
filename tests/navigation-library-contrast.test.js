const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'navigation-library.css'), 'utf8');
function block(selector) {
    const start = css.indexOf(selector + ' {');
    assert(start >= 0, selector);
    return css.slice(start + selector.length + 2, css.indexOf('}', start));
}
function palette(selector) {
    return Object.fromEntries([...block(selector).matchAll(/--nl-([a-z]+):\s*(#[\da-f]{3}(?:[\da-f]{3})?);/g)]
        .map(([, name, color]) => [name, color]));
}
function luminance(hex) {
    const expanded = hex.length === 4 ? hex.slice(1).split('').map(c => c + c).join('') : hex.slice(1);
    const channels = expanded.match(/../g).map(c => parseInt(c, 16) / 255)
        .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return channels.reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
    assert(a && b, 'Both colors must be explicitly defined');
    const [low, high] = [luminance(a), luminance(b)].sort((a, b) => a - b);
    return (high + 0.05) / (low + 0.05);
}
const light = palette('.navigation-library-panel');
const dark = { ...light, ...palette('[data-color-mode="dark"] .navigation-library-panel') };
// These tests cover authored opaque theme pairs, not all browser paint, UA controls,
// disabled opacity, decorative marks, or the opener's external theme surface.
for (const [mode, colors] of [['light', light], ['dark', dark]]) {
    for (const surface of ['bg', 'card', 'selected']) {
        for (const text of ['muted', 'ink', 'accent']) {
            test(`${mode} navigation ${text} text on ${surface} reaches 4.5:1`, () => {
                const ratio = contrast(colors[text], colors[surface]);
                assert(ratio >= 4.5, `${colors[text]} on ${colors[surface]}: ${ratio.toFixed(4)}:1`);
            });
        }
        test(`${mode} navigation focus against ${surface} reaches 3:1`, () => {
            const ratio = contrast(colors.focus, colors[surface]);
            assert(ratio >= 3, `${colors.focus} on ${colors[surface]}: ${ratio.toFixed(4)}:1`);
        });
    }
    test(`${mode} enabled add-button hover text reaches 4.5:1`, () => {
        assert(contrast(colors.bg, colors.accent) >= 4.5);
    });
}
test('selected cards and complete metadata retain the tested opaque surfaces and text bindings', () => {
    assert(block('.navigation-library-panel').includes('background: var(--nl-bg);'));
    assert(block('.navigation-library-card').includes('background: var(--nl-card);'));
    assert(block('.navigation-library-card:has(.navigation-library-pick input:checked)').includes('background: var(--nl-selected);'));
    for (const selector of ['.navigation-library-description', '.navigation-library-details', '.navigation-library-domain', '.navigation-library-pick']) {
        assert(block(selector).includes('color: var(--nl-muted);'), selector);
    }
    assert(!/\bcolor\s*:/.test(block('.navigation-library-metadata dd')), 'Full metadata inherits details color');
    assert(block('.navigation-library-metadata dt, .navigation-library-detail-label').includes('color: var(--nl-ink);'));
    assert(block('.navigation-library-search').includes('background: var(--nl-card);'));
    assert(block('.navigation-library-search input').includes('background: transparent;'));
    assert(block('.navigation-library-search input::placeholder').includes('color: var(--nl-muted);'));
    assert(block('.navigation-library-new-category-panel input').includes('background: var(--nl-bg);'));
    assert(block('.navigation-library-new-category-panel input').includes('color: var(--nl-ink);'));
});
test('focus has a theme-local color, while opener fallback and disabled treatment remain unchanged', () => {
    const focus = block('.navigation-library-panel :focus-visible, .navigation-library-opener:focus-visible');
    assert(focus.includes('outline: 3px solid var(--nl-focus, #6f8bff);'));
    assert(focus.includes('outline-offset: 3px;'));
    assert.equal(dark.focus, '#6f8bff');
    assert.equal(dark.muted, '#a9b4c7');
    assert(block('.navigation-library-panel button:disabled:not(.is-added)').includes('opacity: .55;'));
});
