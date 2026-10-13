const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const registry = require('../shared/dashboard-template-registry.js');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const originals = ['clarity', 'graphite', 'folio'];
const css = read('dashboard-templates.css');
const gallery = read('dashboard-template-gallery.css');

// Static contracts for these specific rules, not a complete cascade resolver
// or a browser geometry/visibility simulation.
function scopedRule(source, child = false) {
    const suffix = child ? '\\s*>\\s*\\*' : '';
    const pattern = new RegExp('(:root:is\\([^{}]+\\) #dashboard \\.shortcuts-header' + suffix + ')\\s*\\{([^}]+)\\}', 'g');
    return [...source.matchAll(pattern)].map(([, selector, body]) => ({
        ids: [...selector.matchAll(/\[data-dashboard-template="([a-z]+)"\]/g)].map(match => match[1]),
        body
    }));
}
function verifyOriginals(source) {
    for (const child of [false, true]) {
        const rules = scopedRule(source, child);
        assert.equal(rules.length, 1);
        assert.deepEqual(rules[0].ids, originals, 'the fix must stay scoped to the original three templates');
        const body = rules[0].body;
        const properties = child
            ? ['flex: 0 1 auto', 'min-width: 0', 'max-width: 100%', 'overflow-wrap: anywhere']
            : ['flex-direction: row', 'flex-wrap: wrap'];
        // Resolve duplicate declarations inside this one rule in source order.
        const declarations = Object.fromEntries(body.split(';').filter(value => value.includes(':'))
            .map(value => value.split(':').map(part => part.trim())));
        for (const property of properties) {
            const [name, value] = property.split(':').map(part => part.trim());
            assert.equal(declarations[name], value, property);
        }
        assert.doesNotMatch(body, /(?:display:\s*none|visibility:\s*hidden|overflow(?:-x|-y)?:\s*(?:hidden|clip)|height:|position:|order:|white-space:\s*nowrap)/);
    }
}

test('original three toolbars explicitly override the old column with row and wrap', () => {
    verifyOriginals(css);
    assert.match(read('newtab.css'), /\.shortcuts-header\s*\{[^}]*flex-direction:\s*column;/);
    const html = read('newtab.html');
    assert(html.indexOf('href="newtab.css"') < html.indexOf('href="dashboard-templates.css"'));
    assert(html.indexOf('href="dashboard-templates.css"') < html.indexOf('href="dashboard-template-gallery.css"'));
    // These rules are outside media queries: narrow viewports wrap rather than
    // reverting to the low-specificity column rule in newtab.css.
    const start = css.indexOf(scopedRule(css)[0].body);
    const preceding = css.slice(0, start).replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal((preceding.match(/\{/g) || []).length - (preceding.match(/\}/g) || []).length, 1);
});

test('all 21 templates keep explicit row/wrap and shrinkable children without changing gallery inheritance', () => {
    for (const child of [false, true]) {
        const original = scopedRule(css, child)[0];
        const other = scopedRule(gallery, child);
        assert.equal(other.length, 1);
        assert.deepEqual([...other[0].ids].sort(), registry.ids.filter(id => !originals.includes(id)).sort());
        for (const id of registry.ids) {
            assert.equal([original, ...other].filter(rule => rule.ids.includes(id)).length, 1, id);
        }
        for (const declaration of child
            ? [/flex:\s*0 1 auto;/, /min-width:\s*0;/, /max-width:\s*100%;/, /overflow-wrap:\s*anywhere;/]
            : [/flex-direction:\s*row;/, /flex-wrap:\s*wrap;/]) {
            assert.match(other[0].body, declaration);
        }
    }
});

test('regression guard rejects column, nowrap, missing size safeguards, hidden actions and expanded scope', () => {
    const scope = ':root:is([data-dashboard-template="clarity"], [data-dashboard-template="graphite"], [data-dashboard-template="folio"])';
    const mutations = [
        css.replace('  flex-direction: row;\n  flex-wrap: wrap;', '  flex-direction: column;\n  flex-wrap: wrap;'),
        css.replace('  flex-direction: row;\n  flex-wrap: wrap;', '  flex-direction: row;\n  flex-wrap: nowrap;'),
        css.replace('  flex: 0 1 auto;\n  min-width: 0;\n  max-width: 100%;\n  overflow-wrap: anywhere;', '  flex: 0 1 auto;'),
        css.replace(scope + ' #dashboard .shortcuts-header {', scope + ' #dashboard .shortcuts-header {\n  display: none;'),
        css.replace('  flex-direction: row;\n  flex-wrap: wrap;', '  flex-direction: row;\n  flex-wrap: wrap;\n  flex-direction: column;'),
        css.replace(scope, ':root[data-dashboard-template]')
    ];
    for (const mutant of mutations) {
        assert.notEqual(mutant, css);
        assert.throws(() => verifyOriginals(mutant));
    }
});
