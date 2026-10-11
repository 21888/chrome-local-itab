const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Core = require('../shared/local-prompts-store.js');
const { setup, add, settle } = require('./helpers/prompts-harness.js');
const { createDocument } = require('./helpers/task-dom-model.js');
function load(root = {}) {
    vm.runInNewContext(fs.readFileSync(`${__dirname}/../shared/local-prompts-view.js`, 'utf8'), { window: root });
    return root.LocalItabPromptsView;
}
const { compareBodies } = load();
function verify(a, b) {
    const result = compareBodies(a, b);
    assert.equal(result.groups.filter(g => g.kind !== 'added').map(g => g.text).join(''), a);
    assert.equal(result.groups.filter(g => g.kind !== 'removed').map(g => g.text).join(''), b);
    assert.equal(result.equal, a === b); return result;
}
test('exact line comparison reconstructs empty, equal, CRLF, Unicode, HTML and final newlines', () => {
    for (const [a,b] of [['',''], ['', 'x\n'], ['x',''], ['a\r\nb\n', 'a\nb\n'], ['😀\n<script>x</script>\n', '😀\n<script>y</script>'], ['a\n', 'a'], ['a\rb\r', 'a\rc\r'], ['same\n','same\n']]) verify(a,b);
    const r = verify('a\nb\nc\n', 'a\nx\nc\n');
    assert.equal(r.groups.map(g => g.kind).join(','), 'unchanged,removed,added,unchanged');
});
test('maximum valid bodies use bounded fallback and grouped unchanged lines', () => {
    const r = verify('a\n'.repeat(16000), 'b\n'.repeat(16000));
    assert.equal(r.fallback, true); assert.equal(r.groups.length, 2);
    assert.equal(verify('\n'.repeat(32000), '\n'.repeat(32000)).groups.length, 1);
    verify('a'.repeat(32000), 'b'.repeat(32000));
    verify('edge\n' + 'a\n'.repeat(1000) + 'tail', 'edge\n' + 'b\n'.repeat(1000) + 'tail');
});
test('deterministic varied line edits always reconstruct both exact bodies', () => {
    let seed = 77; const rand = () => (seed = (seed * 16807) % 2147483647);
    const tokens = ['a\n', 'b\r\n', '\n', '😀\r', '<b>\n'];
    for (let i = 0; i < 300; i++) { const text = () => Array.from({length: rand() % 20}, () => tokens[rand() % tokens.length]).join(''); verify(text(), text()); }
});
async function mount() {
    const h = setup(), doc = createDocument({ blurUnavailableFocus: true }), host = doc.createElement('div'); doc.body.append(host);
    const root = { document: doc, LocalItabPrompts: Core };
    const { View } = load(root), view = new View({ host, controller: h.controller });
    await h.controller.start(); await add(h.controller, 'Example', 'Before {{topic}}\r\n<script>literal</script>');
    h.controller.edit(); h.controller.update('body', 'After {{topic}}\n<script>literal</script>'); await h.controller.save(); await settle(h.controller);
    return Object.defineProperty({...h, doc, host, view}, 'writes', { get: () => h.writes });
}
function open(h) { h.view.main.querySelector('.prompt-history').open = true; h.view.main.querySelector('[data-prompt-focus="compare-open"]').dispatch('click'); return h.view.main.querySelector('.prompt-comparison'); }
test('explicit comparison preserves preview values, history selection and storage; Escape closes with focus', async () => {
    const h = await mount(), c = h.controller; c.setVariable('topic','My value');
    const historyButtons = h.view.main.querySelector('.prompt-history-list').children; historyButtons[0].dispatch('click'); const id = h.view.historyId, writes = h.writes;
    const panel = open(h); assert.equal(panel.hidden, false); assert.equal(h.doc.activeElement.dataset.promptFocus, 'compare-from');
    assert.equal(h.view.comparison.from, id); assert.equal(h.view.historyId, id); assert.equal(c.session().values.topic, 'My value');
    assert.equal(panel.querySelector('script'), null);
    const to = panel.querySelector('[data-prompt-focus="compare-to"]'); to.value = id; to.dispatch('change');
    assert.match(panel.querySelector('[role="status"]').textContent, /identical/);
    panel.dispatch('keydown', {key:'Escape', isComposing:true}); assert.ok(h.view.comparison);
    panel.dispatch('keydown', {key:'Escape'}); assert.equal(h.view.comparison, null); assert.equal(h.doc.activeElement.dataset.promptFocus,'compare-open');
    assert.equal(h.writes,writes); assert.equal(h.view.historyId,id); c.dispose();
});
test('rerender preserves pair; removed version, read failure and record navigation clear comparison', async () => {
    const h = await mount(), c = h.controller; open(h); const pair = {...h.view.comparison}; h.view.render();
    assert.deepEqual({...h.view.comparison},pair); assert.equal(h.view.main.querySelector('.prompt-history').open,true);
    const previous = c.record().history; c.record().history = previous.slice(1); h.view.render(); assert.equal(h.view.comparison,null); c.record().history=previous;
    open(h); h.backend.read = async () => {throw new Error('unavailable');}; await c.refresh();
    assert.equal(h.view.comparison,null); assert.equal(h.view.main.querySelector('[data-prompt-focus="compare-open"]').disabled,true);
    c.error=null; open(h); c.create(); assert.equal(h.view.comparison,null); c.dispose();
});
test('record navigation clears comparison without replacing saved history or variable sessions', async () => {
    const h = await mount(), c = h.controller, originalId = c.selected;
    c.setVariable('topic', 'preserved'); const body = c.record().body;
    await add(c, 'Second', 'Other'); const secondId = c.selected;
    c.select(originalId); open(h); const writes = h.writes;
    c.select(secondId); assert.equal(h.view.comparison, null);
    c.select(originalId); assert.equal(c.session().values.topic, 'preserved');
    assert.equal(c.record().body, body); assert.equal(h.writes, writes); c.dispose();
});
test('one-version record comparison and close button are read-only and keyboard reachable', async () => {
    const h = await mount(), c = h.controller; await add(c, 'Single', 'Only {{topic}}'); const writes = h.writes;
    const panel = open(h); assert.equal(h.view.comparison.from, h.view.comparison.to);
    assert.match(panel.querySelector('[role="status"]').textContent, /identical/);
    panel.querySelector('[data-prompt-focus="compare-close"]').dispatch('click');
    assert.equal(panel.hidden, true); assert.equal(h.doc.activeElement.dataset.promptFocus, 'compare-open'); assert.equal(h.writes,writes); c.dispose();
});

test('line-ending summaries make invisible differences explicit without rewriting originals', async () => {
    const result = compareBodies('a\r\nb\rc\n', 'a\nb\nc');
    assert.equal(JSON.stringify(result.beforeEndings), JSON.stringify({crlf:1,lf:1,cr:1,final:true}));
    assert.equal(JSON.stringify(result.afterEndings), JSON.stringify({crlf:0,lf:2,cr:0,final:false}));
    assert.equal(compareBodies('', '').beforeEndings.final, false);
    const h = await mount(), c = h.controller; const panel = open(h);
    const summaries = panel.querySelectorAll('.prompt-compare-endings');
    assert.equal(summaries.length, 2);
    assert.match(summaries[0].textContent, /CRLF 1 · LF 0 · CR 0 · Ends with newline: No/);
    assert.match(summaries[1].textContent, /CRLF 0 · LF 1 · CR 0 · Ends with newline: No/);
    const originals = panel.querySelector('.prompt-compare-originals').querySelectorAll('pre');
    assert.equal(originals[0].textContent, c.record().history[0].body);
    assert.equal(originals[1].textContent, c.record().history[1].body);
    const oldWrites = h.writes; c.edit(); c.update('title', 'Write counter verified'); await c.save(); await settle(c);
    assert.ok(h.writes > oldWrites, 'mount exposes live backend write count'); c.dispose();
});
