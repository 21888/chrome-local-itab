const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const storeApi = require('../shared/local-scratchpad-store');

// The local selection model checks ownership, offsets and effects only. Native
// Chrome selection painting, scrolling and platform IME need separate QA.
function model(text = '') {
    const document = createDocument(), listeners = new Set(), effects = [];
    const controller = {
        loaded: true, closed: false, state: { enabled: true, content: text }, draft: text,
        generation: 0, pending: false, composing: false, readError: false, error: null, conflict: false,
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        emit() { for (const fn of listeners) fn(); }, init() {},
        hasUncommittedWork() { return this.draft !== this.state.content || this.conflict || this.pending; },
        setDraft(value) { effects.push('setDraft'); this.draft = value; this.generation++; this.emit(); },
        setComposing(value) { this.composing = value; this.emit(); },
        retry() { effects.push('retry'); }, save() { effects.push('save'); },
        useSaved() { effects.push('useSaved'); }, replaceWithDraft() { effects.push('replace'); },
        destroy() { this.closed = true; }
    };
    const api = { ...storeApi }, window = { LocalItabScratchpad: api, addEventListener() {}, removeEventListener() {} };
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-scratchpad-view'), 'utf8'), { window, document });
    const host = document.createElement('article'); document.body.append(host);
    const view = new api.View(host, { controller }), textarea = view.textarea;
    textarea.selectionStart = textarea.selectionEnd = 0;
    textarea.setSelectionRange = (start, end) => { effects.push(['selection', start, end]); textarea.selectionStart = start; textarea.selectionEnd = end; };
    textarea.addEventListener('input', () => effects.push('input'));
    const focus = textarea.focus.bind(textarea);
    textarea.focus = () => { effects.push('focus'); focus(); };
    return { window, document, host, controller, view, effects,
        query(value) { view.findInput.value = value; view.findInput.dispatch('input'); },
        open() { view.findButton.dispatch('click'); },
        range() { return [textarea.selectionStart, textarea.selectionEnd]; }
    };
}

test('Scratchpad find: explicit controls start collapsed without changing the editor', () => {
    const m = model('one two one');
    assert(m.view.findButton, 'an explicit Find text entry is required');
    assert(m.view.findPanel.hidden); assert.deepEqual(m.effects, []);
    m.open(); assert(!m.view.findPanel.hidden);
    assert.equal(m.view.findButton.getAttribute('aria-expanded'), 'true');
    assert.equal(m.document.activeElement, m.view.findInput);
    assert(m.view.findPrevious.disabled); assert(m.view.findNext.disabled);
    assert.equal(m.view.findStatus.getAttribute('role'), 'status');
    m.query('one'); assert.equal(m.document.activeElement, m.view.findInput);
    assert.deepEqual(m.effects, []);
    m.view.findNext.dispatch('click'); assert.deepEqual(m.range(), [0, 3]);
    assert.equal(m.view.findStatus.textContent, 'Match 1 of 2.');
    assert.equal(m.document.activeElement, m.view.textarea);
    assert.deepEqual(m.effects, ['focus', ['selection', 0, 3]]);
    assert.equal(m.controller.draft, 'one two one'); m.view.destroy();
});

test('Scratchpad find: literal queries preserve whitespace, case, Unicode and UTF-16 offsets', () => {
    const m = model('Aa aA  a.*[x] 😀 e\u0301 é 中\n末'); m.open();
    for (const [query, expected] of [
        ['Aa', [0, 2]], ['aA', [3, 5]], ['  ', [5, 7]], ['a.*[x]', [7, 13]],
        ['😀', [14, 16]], ['e\u0301', [17, 19]], ['é', [20, 21]], ['末', [24, 25]]
    ]) {
        m.query(query); m.view.findNext.dispatch('click'); assert.deepEqual(m.range(), expected, JSON.stringify(query));
        assert.equal(m.view.findStatus.textContent, 'Match 1 of 1.');
    }
    const selected = m.range(); m.query('E\u0301'); m.effects.length = 0;
    m.view.findNext.dispatch('click'); assert.deepEqual(m.range(), selected); assert.match(m.view.findStatus.textContent, /No matching/); assert.deepEqual(m.effects, []);
    m.query('\uD83D'); m.view.findNext.dispatch('click'); assert.match(m.view.findStatus.textContent, /complete Unicode/);
    assert.deepEqual(m.range(), selected); assert.deepEqual(m.effects, []);
    m.query(''); assert(m.view.findNext.disabled); assert(m.view.findPrevious.disabled);
    m.view.findNext.dispatch('click'); assert.deepEqual(m.effects, []); m.view.destroy();
});

test('Scratchpad find: both directions allow overlaps and wrap explicitly including offset zero', () => {
    const m = model('ababa'); m.open(); m.query('aba');
    for (const [control, expected, feedback] of [
        ['findPrevious', [2, 5], 'Match 2 of 2.'], ['findPrevious', [0, 3], 'Match 1 of 2.'],
        ['findPrevious', [2, 5], 'Wrapped to the end. Match 2 of 2.'], ['findNext', [0, 3], 'Wrapped to the beginning. Match 1 of 2.'],
        ['findNext', [2, 5], 'Match 2 of 2.'], ['findNext', [0, 3], 'Wrapped to the beginning. Match 1 of 2.']
    ]) { m.view[control].dispatch('click'); assert.deepEqual(m.range(), expected); assert.equal(m.view.findStatus.textContent, feedback); }
    m.query('ababa'); m.view.findNext.dispatch('click'); m.view.findPrevious.dispatch('click');
    assert.deepEqual(m.range(), [0, 5]); assert.equal(m.view.findStatus.textContent, 'Wrapped to the end. Match 1 of 1.');
    m.view.destroy();
});

test('Scratchpad find: current DOM draft changes invalidate results without writing or moving focus', () => {
    const m = model('a\r\nb a\r\nb'); m.open();
    // Model the browser's line-ending normalization without changing the saved
    // draft: Find must not invoke View.render() and write CRLF back to the DOM.
    m.view.textarea.value = 'a\nb a\nb'; m.query('b'); m.view.findPrevious.dispatch('click');
    assert.deepEqual(m.range(), [6, 7]); assert.equal(m.controller.draft, 'a\r\nb a\r\nb');
    m.view.textarea.value = 'b and b'; m.effects.length = 0; m.view.findNext.dispatch('click');
    assert.deepEqual(m.range(), [0, 1]); assert.equal(m.view.textarea.value, 'b and b');
    m.query('and'); assert.equal(m.view.findStatus.textContent, ''); assert.equal(m.document.activeElement, m.view.textarea);
    m.view.findNext.dispatch('click'); assert.deepEqual(m.range(), [2, 5]);
    m.effects.length = 0; m.controller.draft = 'and later and'; m.controller.emit();
    assert.equal(m.view.findStatus.textContent, ''); assert.deepEqual(m.effects, []); assert.deepEqual(m.range(), [2, 5]);
    m.view.findPrevious.dispatch('click'); assert.deepEqual(m.range(), [10, 13]);
    m.query('absent'); m.view.findNext.dispatch('click'); assert.match(m.view.findStatus.textContent, /No matching/);
    m.effects.length = 0; m.controller.draft = 'absent now'; m.controller.emit();
    assert.equal(m.view.findStatus.textContent, ''); assert.deepEqual(m.effects, []);
    m.view.findNext.dispatch('click'); assert.deepEqual(m.range(), [0, 6]); m.view.destroy();
});

test('Scratchpad find: pending, failed, conflicted and over-limit drafts search only the editor without I/O', () => {
    const m = model('saved preview only'); m.open();
    for (const state of [
        { pending: true }, { error: { code: 'WRITE' } }, { conflict: true },
        { readError: true, error: { code: 'READ' } }, { error: { code: 'TEXT_LIMIT' } }
    ]) {
        Object.assign(m.controller, { pending: false, error: null, conflict: false, readError: false }, state);
        m.controller.draft = state.error?.code === 'TEXT_LIMIT' ? 'x'.repeat(33000) + 'needle' : 'unsaved needle'; m.controller.emit();
        const before = { draft: m.controller.draft, state: m.controller.state, generation: m.controller.generation, status: m.view.status.textContent };
        m.view.importPreview.textContent = 'import preview only'; m.view.importPanel.hidden = false;
        m.query('needle'); m.effects.length = 0; m.view.findNext.dispatch('click');
        const offset = m.view.textarea.value.indexOf('needle'); assert.deepEqual(m.range(), [offset, offset + 6]);
        assert.deepEqual(m.effects, ['focus', ['selection', offset, offset + 6]]);
        assert.equal(m.controller.draft, before.draft); assert.equal(m.controller.state, before.state); assert.equal(m.controller.generation, before.generation);
        assert.equal(m.view.status.textContent, before.status); assert.equal(m.view.importPreview.textContent, 'import preview only');
        for (const query of ['saved preview only', 'import preview only']) {
            m.query(query); m.effects.length = 0; m.view.findNext.dispatch('click');
            assert.match(m.view.findStatus.textContent, /No matching/); assert.deepEqual(m.effects, []); assert.deepEqual(m.range(), [offset, offset + 6]);
        }
    }
    // Recovery remains an explicit, separate action after pure Find.
    m.view.retry.dispatch('click'); assert.deepEqual(m.effects, ['retry']); m.view.destroy();
});

test('Scratchpad find: IME and keyboard routing stay local and recover after hidden completion or blur', () => {
    const m = model('same same'); m.open(); m.query('same');
    m.view.findInput.dispatch('compositionstart'); m.view.findNext.dispatch('click');
    assert(!m.view.findInput.dispatch('keydown', { key: 'Enter', isComposing: true }).prevented); assert.deepEqual(m.effects, []);
    m.document.hidden = true; m.view.findInput.dispatch('compositionend'); m.document.hidden = false;
    assert(!m.view.findNext.disabled); m.view.findNext.dispatch('click'); assert.deepEqual(m.range(), [0, 4]);
    const enter = m.view.findInput.dispatch('keydown', { key: 'Enter' }); assert(enter.prevented); assert.deepEqual(m.range(), [5, 9]);
    m.effects.length = 0;
    for (const event of [{ key: 'Enter', isComposing: true }, { key: 'Enter', keyCode: 229 }, { key: 'f', ctrlKey: true }, { key: 'f', metaKey: true }]) {
        assert(!m.view.findInput.dispatch('keydown', event).prevented);
    }
    assert(!m.view.textarea.dispatch('keydown', { key: 'Enter' }).prevented); assert.deepEqual(m.effects, []);
    m.view.textarea.dispatch('compositionstart'); m.view.findNext.dispatch('click'); assert.deepEqual(m.effects, []);
    m.view.textarea.dispatch('compositionend'); m.effects.length = 0;
    m.view.findInput.focus(); m.view.findInput.dispatch('compositionstart'); m.document.hidden = true;
    m.view.findInput.dispatch('focusout'); m.document.hidden = false;
    assert(!m.view.findNext.disabled); m.view.findNext.dispatch('click'); assert.deepEqual(m.range(), [0, 4]);
    assert.deepEqual(m.effects, ['focus', ['selection', 0, 4]]); m.view.destroy();
});

test('Scratchpad find: hidden, inert, detached, unloaded and destroyed controls refuse stale navigation', () => {
    for (const block of ['document', 'host', 'ancestor', 'inert', 'aria-hidden', 'css', 'visibility hidden', 'visibility collapse', 'detached', 'textarea detached', 'button detached', 'unloaded', 'closed', 'destroyed']) {
        const m = model('one one'); m.open(); m.query('one');
        const wrapper = m.document.createElement('div'); m.host.remove(); m.document.body.append(wrapper); wrapper.append(m.host);
        if (block === 'document') m.document.hidden = true;
        if (block === 'host') m.host.hidden = true;
        if (block === 'ancestor') wrapper.hidden = true;
        if (block === 'inert') wrapper.inert = true;
        if (block === 'aria-hidden') wrapper.setAttribute('aria-hidden', 'true');
        if (block === 'css') wrapper.style.display = 'none';
        if (block.startsWith('visibility ')) m.window.getComputedStyle = () => ({ visibility: block.slice(11) });
        if (block === 'detached') m.host.remove();
        if (block === 'textarea detached') m.view.textarea.remove();
        if (block === 'button detached') m.view.findNext.remove();
        if (block === 'unloaded') m.controller.loaded = false;
        if (block === 'closed') m.controller.closed = true;
        if (block === 'destroyed') m.view.destroy();
        m.effects.length = 0; m.view.findNext.dispatch('click'); assert.deepEqual(m.effects, [], block); assert.deepEqual(m.range(), [0, 0], block);
        if (['host', 'ancestor', 'inert', 'aria-hidden', 'css', 'visibility hidden', 'visibility collapse', 'detached', 'textarea detached', 'closed', 'destroyed'].includes(block)) {
            assert.equal(m.view.findInput.value, '', block); assert.equal(m.view.findStatus.textContent, '', block); assert(m.view.findPanel.hidden, block);
        }
        if (block.startsWith('visibility ')) { m.view.findButton.dispatch('click'); assert(m.view.findPanel.hidden, block); assert.deepEqual(m.effects, [], block); }
        m.view.destroy();
    }
});

test('Scratchpad find: explicit close restores focus only from its panel; hiding and destroy never steal it', () => {
    const m = model('one'); m.open(); m.query('one'); m.view.findClose.focus(); m.view.findClose.dispatch('click');
    assert(m.view.findPanel.hidden); assert.equal(m.view.findInput.value, ''); assert.equal(m.document.activeElement, m.view.findButton);
    m.open(); m.query('one'); m.view.findNext.dispatch('click'); m.effects.length = 0;
    m.view.findClose.dispatch('click'); assert.equal(m.document.activeElement, m.view.textarea); assert.deepEqual(m.effects, []);
    m.open(); m.query('one'); const outside = m.document.createElement('button'); m.document.body.append(outside); outside.focus();
    m.controller.state.enabled = false; m.controller.emit();
    assert.equal(m.view.findInput.value, ''); assert(m.view.findPanel.hidden); assert.equal(m.document.activeElement, outside);
    m.controller.state.enabled = true; m.controller.emit(); m.open(); m.query('one');
    assert(m.view.findInput.dispatch('keydown', { key: 'Escape' }).prevented); assert.equal(m.document.activeElement, m.view.findButton);
    m.open(); m.query('one'); outside.focus(); m.view.destroy();
    assert.equal(m.view.findInput.value, ''); assert.equal(m.view.findStatus.textContent, ''); assert.equal(m.document.activeElement, outside);
});

test('Scratchpad find: failed focus, selection or synchronous staleness never claims a selected match', () => {
    for (const failure of ['focus throws', 'focus ignored', 'selection throws', 'selection ignored', 'changed text', 'changed query', 'hidden', 'destroyed']) {
        const m = model('one'); m.open(); m.query('one'); const status = m.view.status.textContent;
        if (failure === 'focus throws') m.view.textarea.focus = () => { throw new Error('focus'); };
        if (failure === 'focus ignored') m.view.textarea.focus = () => {};
        if (failure === 'selection throws') m.view.textarea.setSelectionRange = () => { throw new Error('selection'); };
        if (failure === 'selection ignored') m.view.textarea.setSelectionRange = () => {};
        if (['changed text', 'changed query', 'hidden', 'destroyed'].includes(failure)) {
            const focus = m.view.textarea.focus;
            m.view.textarea.focus = () => {
                focus();
                if (failure === 'changed text') m.view.textarea.value = 'new';
                if (failure === 'changed query') m.view.findInput.value = 'new';
                if (failure === 'hidden') m.host.hidden = true;
                if (failure === 'destroyed') m.view.destroy();
            };
        }
        m.view.findNext.dispatch('click'); assert.deepEqual(m.range(), [0, 0], failure);
        if (['hidden', 'destroyed'].includes(failure)) assert.equal(m.view.findStatus.textContent, '', failure);
        else assert.match(m.view.findStatus.textContent, /Could not select/, failure);
        assert.equal(m.view.status.textContent, status, failure);
        assert(!m.effects.some(effect => typeof effect === 'string' && effect !== 'focus'), failure); m.view.destroy();
    }
});

test('Scratchpad find: held Enter from query selection cannot repeat into an edited or saved newline', () => {
    const m = model('one one'); m.open(); m.query('one');
    const enter = m.view.findInput.dispatch('keydown', { key: 'Enter', repeat: false });
    assert(enter.prevented); assert.equal(m.document.activeElement, m.view.textarea);
    assert.deepEqual(m.range(), [0, 3]); m.effects.length = 0;
    // Simulate the native default only when keydown was not prevented. This is
    // event-flow coverage, not a claim of a physical keyboard reproduction.
    const repeated = m.document.activeElement.dispatch('keydown', { key: 'Enter', repeat: true });
    if (!repeated.prevented) { m.view.textarea.value += '\n'; m.view.textarea.dispatch('input'); }
    assert(repeated.prevented, 'held Find Enter must not become an editor newline');
    assert.equal(m.controller.draft, 'one one'); assert.deepEqual(m.effects, []);
    m.view.textarea.dispatch('keyup', { key: 'Enter' });
    assert(!m.view.textarea.dispatch('keydown', { key: 'Enter', repeat: false }).prevented);
    assert(!m.view.textarea.dispatch('keydown', { key: 'Enter', repeat: true }).prevented);
    m.view.destroy();
});

test('Scratchpad find: held Enter on navigation buttons performs one selection and preserves native Space', () => {
    for (const [source, expected] of [['findPrevious', [4, 7]], ['findNext', [0, 3]]]) {
        const m = model('one one'); m.open(); m.query('one'); m.view[source].focus();
        const key = m.view[source].dispatch('keydown', { key: 'Enter', repeat: false });
        if (!key.prevented) m.view[source].dispatch('click'); // Native default activation model.
        assert(key.prevented); assert.deepEqual(m.range(), expected);
        assert.deepEqual(m.effects, ['focus', ['selection', ...expected]]);
        m.effects.length = 0;
        assert(m.view[source].dispatch('keydown', { key: 'Enter', repeat: true }).prevented);
        assert(m.document.activeElement.dispatch('keydown', { key: 'Enter', repeat: true }).prevented);
        assert.deepEqual(m.effects, []);
        const space = m.view[source].dispatch('keydown', { key: ' ', repeat: false });
        assert(!space.prevented); m.view[source].dispatch('keyup', { key: ' ' });
        m.view[source].dispatch('click'); assert.equal(m.effects.length, 2);
        assert(!m.view.textarea.dispatch('keydown', { key: 'Enter', repeat: true }).prevented);
        m.view.destroy();
    }
});

test('Scratchpad find: held Enter ownership clears on fresh input, IME, hiding and lifecycle exits', () => {
    for (const reset of ['keyup', 'new Enter', 'other key', 'pointerdown', 'blur', 'compositionstart', 'query IME', 'isComposing', 'keyCode229', 'close', 'destroy', 'hidden']) {
        const m = model('one'); m.open(); m.query('one');
        m.view.findInput.dispatch('keydown', { key: 'Enter' }); m.effects.length = 0;
        if (reset === 'keyup') m.view.textarea.dispatch('keyup', { key: 'Enter' });
        if (reset === 'new Enter') assert(!m.view.textarea.dispatch('keydown', { key: 'Enter', repeat: false }).prevented);
        if (reset === 'other key') m.view.textarea.dispatch('keydown', { key: 'a', repeat: false });
        if (reset === 'pointerdown') m.host.dispatch('pointerdown');
        if (reset === 'blur') m.view.textarea.dispatch('blur');
        if (reset === 'compositionstart') m.view.textarea.dispatch('compositionstart');
        if (reset === 'query IME') m.view.findInput.dispatch('compositionstart');
        if (reset === 'isComposing') assert(!m.view.textarea.dispatch('keydown', { key: 'Enter', repeat: true, isComposing: true }).prevented);
        if (reset === 'keyCode229') assert(!m.view.textarea.dispatch('keydown', { key: 'Enter', repeat: true, keyCode: 229 }).prevented);
        if (reset === 'close') m.view.findClose.dispatch('click');
        if (reset === 'destroy') m.view.destroy();
        if (reset === 'hidden') m.document.hidden = true;
        assert(!m.view.textarea.dispatch('keydown', { key: 'Enter', repeat: true }).prevented, reset);
        m.document.hidden = false; m.controller.composing = false; m.view.findInput.dispatch('focusout');
        assert(!m.view.textarea.dispatch('keydown', { key: 'Enter', repeat: true }).prevented, reset + ' remains released');
        assert.equal(m.controller.draft, 'one', reset); assert.deepEqual(m.effects, [], reset); m.view.destroy();
    }
});

test('Scratchpad find: held Enter token is never created by rejected or unsuccessful navigation', () => {
    for (const failure of ['repeat', 'isComposing', 'keyCode229', 'hidden', 'query IME', 'editor IME', 'no match', 'invalid query', 'selection failure']) {
        const m = model('one'); m.open(); m.query('one');
        const key = { key: 'Enter', repeat: false };
        if (failure === 'repeat') key.repeat = true;
        if (failure === 'isComposing') key.isComposing = true;
        if (failure === 'keyCode229') key.keyCode = 229;
        if (failure === 'hidden') m.document.hidden = true;
        if (failure === 'query IME') m.view.findInput.dispatch('compositionstart');
        if (failure === 'editor IME') m.view.textarea.dispatch('compositionstart');
        if (failure === 'no match') m.query('absent');
        if (failure === 'invalid query') m.query('\uD800');
        if (failure === 'selection failure') m.view.textarea.setSelectionRange = () => { throw new Error('synthetic selection failure'); };
        m.effects.length = 0; const event = m.view.findInput.dispatch('keydown', key);
        if (['isComposing', 'keyCode229', 'hidden', 'query IME', 'editor IME'].includes(failure)) assert(!event.prevented, failure);
        else assert(event.prevented, failure);
        assert.deepEqual(m.range(), [0, 0], failure);
        m.document.hidden = false; m.controller.composing = false; m.view.findInput.dispatch('focusout');
        assert(!m.view.textarea.dispatch('keydown', { key: 'Enter', repeat: true }).prevented, failure);
        assert.equal(m.controller.draft, 'one', failure); assert(m.effects.every(effect => effect === 'focus'), failure);
        m.view.destroy();
    }
});

test('Scratchpad find: destroy removes its card key listeners before remounting the same host', () => {
    const m = model('one'), types = ['keyup', 'pointerdown', 'keydown'];
    for (const type of types) assert.equal(m.host.listeners.get(type).length, 1, type);
    m.view.destroy();
    for (const type of types) assert.equal(m.host.listeners.get(type).length, 0, type + ' after destroy');
    const oldToken = {}; m.view.findHeldEnter = oldToken;
    const controller = { ...m.controller, closed: false };
    const next = new m.window.LocalItabScratchpad.View(m.host, { controller });
    for (const type of types) {
        assert.equal(m.host.listeners.get(type).length, 1, type + ' after remount');
        next.findHeldEnter = {}; m.host.dispatch(type, { key: 'a', repeat: false });
        assert.equal(next.findHeldEnter, null); assert.equal(m.view.findHeldEnter, oldToken);
    }
    next.destroy();
    for (const type of types) assert.equal(m.host.listeners.get(type).length, 0, type + ' after second destroy');
});


test('Scratchpad match position: repeated overlaps count every start in both directions', () => {
    const m = model('aaaa'); m.open(); m.query('aa');
    for (const [control, start, feedback] of [
        ['findNext', 0, 'Match 1 of 3.'], ['findNext', 1, 'Match 2 of 3.'],
        ['findNext', 2, 'Match 3 of 3.'], ['findNext', 0, 'Wrapped to the beginning. Match 1 of 3.'],
        ['findPrevious', 2, 'Wrapped to the end. Match 3 of 3.'], ['findPrevious', 1, 'Match 2 of 3.']
    ]) {
        m.view[control].dispatch('click'); assert.deepEqual(m.range(), [start, start + 2]);
        assert.equal(m.view.findStatus.textContent, feedback);
        assert.equal(m.view.findResult.current, start + 1); assert.equal(m.view.findResult.total, 3);
    }
    m.query('aa'); m.view.findPrevious.dispatch('click');
    assert.equal(m.view.findStatus.textContent, 'Match 3 of 3.');
    m.query('aaaa'); const enter = m.view.findInput.dispatch('keydown', { key: 'Enter' });
    assert(enter.prevented); assert.equal(m.view.findStatus.textContent, 'Match 1 of 1.');
    m.view.findNext.dispatch('click'); assert.equal(m.view.findStatus.textContent, 'Wrapped to the beginning. Match 1 of 1.');
    assert.equal(m.controller.draft, 'aaaa'); assert(m.effects.every(effect => effect === 'focus' || Array.isArray(effect)));
    m.view.destroy();
});

test('Scratchpad match position: literal Unicode, spaces and markup use the selected UTF-16 starts', () => {
    for (const [text, query, starts] of [
        ['😀😀😀', '😀😀', [0, 2]], ['e\u0301 é e\u0301', 'e\u0301', [0, 5]],
        ['    ', '  ', [0, 1, 2]], ['Aa aA Aa', 'Aa', [0, 6]],
        ['<b>.*[x] <b>.*[x]', '<b>.*[x]', [0, 9]]
    ]) {
        const m = model(text); m.open(); m.query(query);
        for (let i = 0; i < starts.length; i++) {
            m.view.findNext.dispatch('click'); assert.deepEqual(m.range(), [starts[i], starts[i] + query.length]);
            assert.equal(m.view.findStatus.textContent, `Match ${i + 1} of ${starts.length}.`);
        }
        assert.equal(m.view.findStatus.children.length, 0); assert.equal(m.controller.draft, text); m.view.destroy();
    }
});

test('Scratchpad match position: query input never scans; rejected queries clear the old numbers', () => {
    const m = model('needle needle'); m.open();
    const strings = m.view.findText.constructor('return String.prototype')(), indexOf = strings.indexOf;
    let scans = 0;
    strings.indexOf = function (...args) { scans++; return indexOf.apply(this, args); };
    try {
        m.query('needle'); assert.equal(scans, 0); assert.equal(m.view.findStatus.textContent, '');
        m.view.findNext.dispatch('click'); assert(scans > 0); assert.equal(m.view.findStatus.textContent, 'Match 1 of 2.');
        const selected = m.range(); scans = 0; m.effects.length = 0;
        m.query('absent'); assert.equal(scans, 0); assert.equal(m.view.findStatus.textContent, '');
        m.view.findNext.dispatch('click'); assert.equal(m.view.findStatus.textContent, 'No matching text in this editor.');
        assert.equal(m.view.findResult.total, undefined); scans = 0;
        m.query('\uD800'); m.view.findNext.dispatch('click');
        assert.equal(scans, 0); assert.equal(m.view.findStatus.textContent, 'Enter complete Unicode characters to find text.');
        assert.equal(m.view.findResult.current, undefined);
        m.query(''); m.view.findNext.dispatch('click');
        assert.equal(scans, 0); assert.equal(m.view.findStatus.textContent, ''); assert.equal(m.view.findResult, null);
        assert.deepEqual(m.range(), selected); assert.deepEqual(m.effects, []);
    } finally { strings.indexOf = indexOf; m.view.destroy(); }
});

test('Scratchpad match position: two matches beyond the save limit use the entire DOM draft without rendering or writes', () => {
    const m = model('saved note'); m.open();
    m.controller.error = { code: 'TEXT_LIMIT' }; m.controller.draft = 'x'.repeat(32001) + 'needle\r\nneedle'; m.controller.emit();
    const dom = 'x'.repeat(32001) + 'needle\nneedle'; m.view.textarea.value = dom;
    const before = { draft: m.controller.draft, state: m.controller.state, generation: m.controller.generation, status: m.view.status.textContent };
    m.view.importPanel.hidden = false; m.view.importPreview.textContent = 'needle in import preview';
    m.view.savedPreview.value = 'needle in saved conflict preview'; m.view.savedPreview.hidden = false;
    m.view.render = () => { throw new Error('Find must not rerender the editor'); };
    m.query('needle'); m.effects.length = 0;
    m.view.findNext.dispatch('click'); assert.deepEqual(m.range(), [32001, 32007]); assert.equal(m.view.findStatus.textContent, 'Match 1 of 2.');
    m.view.findNext.dispatch('click'); assert.deepEqual(m.range(), [32008, 32014]); assert.equal(m.view.findStatus.textContent, 'Match 2 of 2.');
    assert.deepEqual(m.effects, ['focus', ['selection', 32001, 32007], 'focus', ['selection', 32008, 32014]]);
    assert.equal(m.view.textarea.value, dom); assert.equal(m.controller.draft, before.draft);
    assert.equal(m.controller.state, before.state); assert.equal(m.controller.generation, before.generation);
    assert.equal(m.view.status.textContent, before.status); assert.match(before.status, /too long/);
    assert.equal(m.view.importPreview.textContent, 'needle in import preview'); assert(!m.view.importPanel.hidden);
    assert.equal(m.view.savedPreview.value, 'needle in saved conflict preview'); m.view.destroy();
});

test('Scratchpad match position: editor input and controller updates discard counts before a fresh navigation', () => {
    const m = model('one one'); m.open(); m.query('one'); m.view.findNext.dispatch('click');
    m.view.textarea.value = 'one'; m.view.textarea.dispatch('input');
    assert.equal(m.view.findStatus.textContent, ''); assert.equal(m.view.findResult, null);
    assert.deepEqual(m.effects.slice(-2), ['setDraft', 'input']);
    m.effects.length = 0; m.view.findPrevious.dispatch('click'); assert.equal(m.view.findStatus.textContent, 'Match 1 of 1.');
    m.controller.draft = 'one one one'; m.controller.emit();
    assert.equal(m.view.findStatus.textContent, ''); assert.equal(m.view.findResult, null);
    m.view.findPrevious.dispatch('click'); assert.equal(m.view.findStatus.textContent, 'Match 3 of 3.');
    m.effects.length = 0; m.controller.closed = true; m.view.findNext.dispatch('click');
    assert.equal(m.view.findStatus.textContent, ''); assert.equal(m.view.findResult, null); assert(m.view.findPanel.hidden);
    assert.deepEqual(m.effects, []); m.view.destroy();
});

test('Scratchpad match position: no old or new counts survive synchronous focus or selection invalidation', () => {
    for (const phase of ['focus', 'selection']) {
        for (const change of ['text', 'query', 'hidden', 'closed', 'throws', 'ignored']) {
            const m = model('one one'); m.open(); m.query('one'); m.view.findNext.dispatch('click');
            assert.equal(m.view.findStatus.textContent, 'Match 1 of 2.'); m.view.findInput.focus();
            const original = phase === 'focus' ? m.view.textarea.focus : m.view.textarea.setSelectionRange;
            m.view.textarea[phase === 'focus' ? 'focus' : 'setSelectionRange'] = (...args) => {
                assert.equal(m.view.findStatus.textContent, ''); assert.equal(m.view.findResult.total, undefined);
                if (change === 'throws') throw new Error('synthetic ' + phase + ' failure');
                if (change === 'ignored') return;
                original(...args);
                if (change === 'text') m.view.textarea.value = 'changed';
                if (change === 'query') m.view.findInput.value = 'changed';
                if (change === 'hidden') m.host.hidden = true;
                if (change === 'closed') m.controller.closed = true;
            };
            m.view.findNext.dispatch('click');
            assert.equal(m.view.findResult?.total, undefined); assert.equal(m.view.findResult?.current, undefined);
            assert.equal(m.view.findStatus.textContent, ['hidden', 'closed'].includes(change) ? '' : 'Could not select the matching text. Try again.');
            assert.equal(m.controller.draft, 'one one'); m.view.destroy();
        }
    }
});

test('Scratchpad match position: hidden page clears counts and held Enter without navigating or stealing focus; destroy unbinds before remount', async () => {
    const m = model('one one'); m.open(); m.query('one');
    m.view.findInput.dispatch('keydown', { key: 'Enter' }); assert.equal(m.view.findStatus.textContent, 'Match 1 of 2.');
    const focused = m.document.activeElement; m.effects.length = 0;
    m.document.hidden = true; await m.document.listeners.get('visibilitychange')({});
    assert.equal(m.view.findStatus.textContent, ''); assert.equal(m.view.findResult, null); assert.equal(m.view.findHeldEnter, null);
    assert.equal(m.view.findInput.value, 'one'); assert.equal(m.document.activeElement, focused); assert.deepEqual(m.effects, []);
    m.document.hidden = false; await m.document.listeners.get('visibilitychange')({});
    assert.equal(m.view.findStatus.textContent, ''); assert.deepEqual(m.effects, []);
    m.view.findNext.dispatch('click'); assert.equal(m.view.findStatus.textContent, 'Match 1 of 2.');
    m.view.destroy(); assert(!m.document.listeners.has('visibilitychange')); assert.equal(m.view.findStatus.textContent, '');
    const controller = { ...m.controller, closed: false }, next = new m.window.LocalItabScratchpad.View(m.host, { controller });
    next.textarea.setSelectionRange = (start, end) => { next.textarea.selectionStart = start; next.textarea.selectionEnd = end; };
    next.findButton.dispatch('click'); next.findInput.value = 'one'; next.findInput.dispatch('input'); next.findPrevious.dispatch('click');
    assert.equal(next.findStatus.textContent, 'Match 2 of 2.');
    m.view.findStatus.textContent = 'retired view'; const oldToken = {}; m.view.findHeldEnter = oldToken;
    m.document.hidden = true; await m.document.listeners.get('visibilitychange')({});
    assert.equal(next.findStatus.textContent, ''); assert.equal(m.view.findStatus.textContent, 'retired view'); assert.equal(m.view.findHeldEnter, oldToken);
    next.destroy(); assert(!m.document.listeners.has('visibilitychange'));
});

test('Scratchpad match position: English, Chinese and fallback templates fill the existing polite atomic status', () => {
    for (const language of ['en', 'zh_CN', 'fallback']) {
        const m = model('one one');
        const catalog = language === 'fallback' ? {} : JSON.parse(fs.readFileSync(require.resolve(`../_locales/${language}/messages.json`), 'utf8'));
        m.window.i18n = { t: key => catalog[key]?.message || key };
        const expected = language === 'zh_CN' ? [
            '第2处/共2处。', '已回到开头。第1处/共2处。', '已回到末尾。第2处/共2处。'
        ] : ['Match 2 of 2.', 'Wrapped to the beginning. Match 1 of 2.', 'Wrapped to the end. Match 2 of 2.'];
        m.open(); m.query('one');
        for (const [index, control] of ['findPrevious', 'findNext', 'findPrevious'].entries()) {
            m.view[control].dispatch('click'); assert.equal(m.view.findStatus.textContent, expected[index]);
            assert.equal(m.view.findStatus.children.length, 0); assert(!/[{}]/.test(m.view.findStatus.textContent));
        }
        assert.equal(m.view.findStatus.getAttribute('role'), 'status');
        assert.equal(m.view.findStatus.getAttribute('aria-live'), 'polite'); assert.equal(m.view.findStatus.getAttribute('aria-atomic'), 'true');
        m.view.destroy();
    }
});
