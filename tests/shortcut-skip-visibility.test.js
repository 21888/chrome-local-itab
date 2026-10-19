const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const source = fs.readFileSync('newtab.js', 'utf8');
const visibility = source.slice(source.indexOf('function applyModuleVisibility(showConfig) {'), source.indexOf('// A system clipboard write cannot be cancelled'));
const css = fs.readFileSync('newtab.css', 'utf8');

function fixture() {
    const document = createDocument();
    const skip = document.createElement('a'); skip.className = 'skip-link'; skip.setAttribute('href', '#shortcuts-container');
    const other = document.createElement('a'); other.setAttribute('href', 'recovery.html');
    const target = document.createElement('section'); target.id = 'shortcuts-container';
    const draft = document.createElement('input'); draft.value = '  original shortcut draft  ';
    const search = document.createElement('input'); search.value = '  original search draft  ';
    target.append(draft); document.body.append(skip, other, target, search); search.focus();
    const calls = []; const forbidden = name => () => { calls.push(name); throw Error(name); };
    const context = { document, window: {}, chrome: { storage: { local: {get: forbidden('get'), set: forbidden('set'), clear: forbidden('clear')} } }, fetch: forbidden('fetch'), setTimeout: forbidden('timer') };
    vm.runInNewContext(visibility, context);
    return { document, skip, other, target, draft, search, calls, apply: value => context.applyModuleVisibility({clock: false, search: true, shortcuts: value, weather: false, hot: false, movie: false}) };
}

test('skip-link CSS follows only its exact module-hidden target without changing layout or focus rules', () => {
    const rule = css.match(/body:has\(#shortcuts-container\.module-hidden\) > \.skip-link\[href="#shortcuts-container"\]\s*\{([^}]+)\}/);
    assert(rule, 'disabled shortcuts must not expose a keyboard link to an absent target');
    assert.equal(rule[1].trim(), 'display: none;');
    assert.match(css, /\.module-hidden\s*\{\s*display: none !important;\s*\}/);
    assert.match(css, /\.skip-link:focus\s*\{[^}]*transform: translateY\(0\);/);
});

for (const visible of [false, true]) test(`actual module visibility supplies the CSS condition for saved shortcuts=${visible} without I/O or DOM replacement`, () => {
    const f = fixture(); f.apply(visible);
    assert.equal(f.target.classList.contains('module-hidden'), !visible);
    assert.equal(f.document.getElementById('shortcuts-container'), f.target);
    assert.equal(f.target.children[0], f.draft); assert.equal(f.draft.value, '  original shortcut draft  ');
    assert.equal(f.skip.getAttribute('href'), '#shortcuts-container'); assert.equal(f.skip.parentElement, f.document.body);
    assert.equal(f.other.getAttribute('href'), 'recovery.html'); assert.equal(f.search.value, '  original search draft  ');
    assert.equal(f.document.activeElement, f.search); assert.deepEqual(f.calls, []);
});

test('existing visibility round trips remove the CSS condition without mutating the original anchor', () => {
    const f = fixture();
    for (const visible of [true, false, true, false]) {
        f.apply(visible); assert.equal(f.target.classList.contains('module-hidden'), !visible);
        assert.equal(f.document.body.children[0], f.skip); assert.equal(f.skip.getAttribute('href'), '#shortcuts-container');
        assert.equal(f.document.activeElement, f.search); assert.deepEqual(f.calls, []);
    }
    // This exercises class state only; full shortcut initialization is checked by
    // loading a fresh synthetic renderer with the enabled saved preference.
});
