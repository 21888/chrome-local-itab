const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const storeApi = require('../shared/local-scratchpad-store');

// Geometry is deliberately supplied by this bounded model. Real Chrome
// wrapping, selection painting and scrolling are verified separately.
function model() {
    const document = createDocument(), effects = [], listeners = new Set();
    const text = 'one\n' + 'wrapped text '.repeat(40) + 'one';
    const controller = {
        loaded: true, closed: false, state: { enabled: true, content: text }, draft: text,
        generation: 0, pending: false, composing: false, readError: false, error: null, conflict: false,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }, init() {},
        hasUncommittedWork() { return false; }, setDraft() { effects.push('setDraft'); },
        setComposing() {}, retry() { effects.push('retry'); }, save() { effects.push('save'); },
        useSaved() { effects.push('useSaved'); }, replaceWithDraft() { effects.push('replace'); },
        destroy() { this.closed = true; }
    };
    const window = { LocalItabScratchpad: { ...storeApi }, addEventListener() {}, removeEventListener() {},
        getComputedStyle() { return { paddingTop: '10px', paddingBottom: '10px', paddingLeft: '10px', paddingRight: '10px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word', lineHeight: '20px' }; } };
    const host = document.createElement('article'); document.body.append(host);
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-scratchpad-view'), 'utf8'), { window, document });
    const view = new window.LocalItabScratchpad.View(host, { controller }), editor = view.textarea;
    const h = { document, window, controller, host, view, editor, effects, text, rectHook: null };
    editor.selectionStart = editor.selectionEnd = 0; editor.clientWidth = 300; editor.clientHeight = 180; editor.scrollHeight = 500; editor.scrollTop = 320;
    editor.setSelectionRange = (start, end) => { effects.push(['selection', start, end]); editor.selectionStart = start; editor.selectionEnd = end; };
    editor.scrollIntoView = options => effects.push(['reveal', { ...options }]);
    document.createTextNode = value => { const n = document.createElement('#text'); n.textContent = value; return n; };
    document.createRange = () => {
        let start, end, node;
        return {
            setStart(n, offset) { node = n; start = offset; }, setEnd(n, offset) { assert.equal(n, node); end = offset; },
            getClientRects() {
                assert.equal(node.textContent, text); assert.equal(end - start, view.findInput.value.length);
                h.rectHook?.();
                const top = start === 0 ? 10 : 430; return h.boxes || [{ top, bottom: top + 20, height: 20 }];
            }
        };
    };
    view.findButton.dispatch('click'); view.findInput.value = 'one'; view.findInput.dispatch('input');
    return h;
}

test('Scratchpad Find reveals first and last measured matches without editing or saving', () => {
    const h = model(), children = h.document.body.children.length;
    h.view.findNext.dispatch('click');
    assert.equal(h.editor.scrollTop, 0, 'the first match must not remain below a stale scroll offset');
    assert.equal(h.view.findStatus.textContent, 'Match 1 of 2.');
    assert.equal(h.document.activeElement, h.editor);
    assert.deepEqual([h.editor.selectionStart, h.editor.selectionEnd], [0, 3]);
    h.view.findPrevious.dispatch('click');
    assert.equal(h.editor.scrollTop, 280, 'reveal the final line inside the editor viewport');
    assert.equal(h.view.findStatus.textContent, 'Wrapped to the end. Match 2 of 2.');
    assert.equal(h.document.body.children.length, children, 'measurement nodes never accumulate');
    assert.equal(h.editor.value, h.text); assert.equal(h.controller.draft, h.text);
    assert(h.effects.every(x => Array.isArray(x)), 'no draft/save/retry side effects');
    assert.equal(h.effects.filter(x => x[0] === 'reveal').length, 2);
    h.view.destroy();
});

test('Scratchpad Find abandons geometry after query or focus changes and always removes its mirror', () => {
    for (const change of ['query', 'focus', 'throw']) {
        const h = model(), children = h.document.body.children.length;
        const outside = h.document.createElement('button'); h.document.body.append(outside);
        h.rectHook = () => {
            if (change === 'query') h.view.findInput.value = 'newer';
            if (change === 'focus') outside.focus();
            if (change === 'throw') throw Error('synthetic layout failure');
        };
        h.view.findNext.dispatch('click');
        assert.equal(h.editor.scrollTop, 320, change);
        assert.equal(h.document.body.children.length, children + 1, change);
        assert.equal(h.effects.filter(x => x[0] === 'reveal').length, 0, change);
        assert.equal(h.editor.value, h.text); assert.equal(h.controller.draft, h.text);
        assert(!h.view.findStatus.textContent.includes('Match 1'), change);
        if (change === 'focus') assert.equal(h.document.activeElement, outside);
        h.view.destroy();
    }
});

test('Scratchpad Find reveals the beginning of a match taller than the editor', () => {
    const h = model();
    h.view.findInput.value = h.text.slice(4); h.view.findInput.dispatch('input');
    h.boxes = [{ top: 50, bottom: 70, height: 20 }, { top: 410, bottom: 430, height: 20 }];
    h.view.findNext.dispatch('click');
    assert.equal(h.editor.scrollTop, 40, 'show the beginning rather than clamping to the tail');
    assert.deepEqual([h.editor.selectionStart, h.editor.selectionEnd], [4, h.text.length]);
    assert.equal(h.view.findStatus.textContent, 'Match 1 of 1.');
    assert.equal(h.editor.value, h.text); assert.equal(h.controller.draft, h.text);
    h.view.destroy();
});

