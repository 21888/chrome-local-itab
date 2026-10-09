const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require(require('node:path').resolve(__dirname, require('node:fs').existsSync(require('node:path').resolve(__dirname, '../storage.js')) ? 'helpers/task-dom-model' : '../../chrome-local-itab/tests/helpers/task-dom-model'));
const { harness } = require('./focus-timer-helpers');
function model(h = harness()) {
    const document = createDocument(), timers = new Map(); let timer = 0;
    // Native Chromium blurs a focused control as soon as disabled is set.
    const create = document.createElement;
    document.createElement = tag => {
        const node = create(tag); let disabled = false;
        Object.defineProperty(node, 'disabled', { get: () => disabled, set(value) {
            disabled = Boolean(value); if (disabled && document.activeElement === node) document.activeElement = document.body;
        } });
        return node;
    };
    const events = new Map();
    document.addEventListener = (type, fn) => { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); document.listeners.set(type, event => { for (const listener of [...events.get(type)]) listener(event || {}); }); };
    document.removeEventListener = (type, fn) => events.get(type)?.delete(fn);
    const api = { ...require('../shared/local-focus-store'), ...require('../shared/local-focus-controller') };
    const window = { LocalItabFocus: api, setTimeout(fn) { timers.set(++timer, fn); return timer; }, clearTimeout(id) { timers.delete(id); } };
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-focus-view'), 'utf8'), { window, document });
    const host = document.createElement('article'); document.body.append(host); const c = h.controller(), visibility = [];
    const view = new api.View(host, { controller: c, onVisibility: value => visibility.push(value) });
    return { h, document, timers, c, host, view, api, visibility };
}
test('DOM model: optional card never enables itself; local visibility and hidden throttling', async () => {
    const m = model(); await m.h.flush(); assert(m.host.hidden); assert.equal(m.h.writes, 0);
    await m.c.action('visibility', true); assert(!m.host.hidden); m.view.start.dispatch('click'); await m.h.flush();
    assert.equal(m.timers.size, 1); m.document.hidden = true; m.document.listeners.get('visibilitychange')(); assert.equal(m.timers.size, 0);
    m.h.advance(20000); m.document.hidden = false; m.document.listeners.get('visibilitychange')(); await m.h.flush();
    assert.equal(m.view.remaining.textContent, '24:40'); assert.equal(m.timers.size, 1); m.view.destroy(); assert.equal(m.timers.size, 0);
});
test('DOM model: one stable primary control preserves focus across user transitions, no per-second live output', async () => {
    const m = model(); await m.h.flush(); await m.c.action('visibility', true); m.view.start.focus();
    for (const expected of ['Pause', 'Resume', 'Pause']) { m.view.start.dispatch('click'); await m.h.flush(); assert.equal(m.view.start.textContent, expected); assert.equal(m.document.activeElement, m.view.start); }
    assert.equal(m.view.remaining.getAttribute('aria-live'), 'off'); assert.equal(m.view.status.getAttribute('aria-live'), 'polite');
    const previousStatus = m.view.status.textContent; m.h.advance(1000); m.c.tick(); assert.equal(m.view.status.textContent, previousStatus);
    const outside = m.document.createElement('button'); m.document.body.append(outside); outside.focus(); m.h.advance(1500000); m.c.tick(); await m.h.flush(); assert.equal(m.document.activeElement, outside, 'completion does not steal focus');
    assert.equal(m.view.start.textContent, 'Choose break'); m.view.start.dispatch('click'); await m.h.flush(); assert.equal(m.c.snapshot().session.status, 'ready'); m.view.destroy();
});
test('DOM model: initial read failure exposes retry, never writes visibility', async () => {
    const h = harness(); h.failRead(true); const m = model(h); await h.flush(); assert(!m.host.hidden); assert(!m.view.retry.hidden); assert.equal(h.writes, 0);
    h.failRead(false); m.view.retry.dispatch('click'); await h.flush(); assert(m.host.hidden); assert.equal(h.writes, 0); m.view.destroy();
});
test('DOM model: settings failure restores checkbox and keeps session intact', async () => {
    const m = model(); await m.h.flush(); const host = m.document.createElement('div'); m.document.body.append(host);
    const settings = m.api.mountSettings(host, { controller: m.h.controller() }); await m.h.flush(); const input = host.querySelector('input');
    m.h.failWrite(true); input.checked = true; input.dispatch('change'); await m.h.flush(); assert.equal(input.checked, false); assert.equal(settings.controller.state.enabled, false);
    m.h.failWrite(false); input.checked = true; input.dispatch('change'); await m.h.flush(); assert(!m.host.hidden); settings.destroy(); m.view.destroy();
});
test('DOM model: loading/read-failure controls cannot mutate or throw', async () => {
    const h = harness(); h.failRead(true); const m = model(h); await h.flush();
    for (const control of [m.view.start, m.view.reset, m.view.phase, m.view.minutes]) assert.equal(control.disabled, true);
    assert.doesNotThrow(() => m.view.start.dispatch('click')); assert.equal(h.writes, 0);
    h.failRead(false); await m.c.refresh(); assert.equal(m.view.start.disabled, false); m.view.destroy();
});
test('DOM model: held native Enter cannot toggle successive primary states', async () => {
    const m = model(); await m.h.flush(); await m.c.action('visibility', true);
    function nativeEnter(repeat) { const event = m.view.start.dispatch('keydown', { key: 'Enter', repeat }); if (!event.prevented) m.view.start.dispatch('click'); return event; }
    nativeEnter(false); await m.h.flush(); assert.equal(m.c.snapshot().session.status, 'running');
    for (let i = 0; i < 4; i++) { assert.equal(nativeEnter(true).prevented, true); await m.h.flush(); assert.equal(m.c.snapshot().session.status, 'running'); }
    assert.equal(m.view.start.dispatch('keydown', { key: ' ', repeat: true }).prevented, true);
    nativeEnter(false); await m.h.flush(); assert.equal(m.c.snapshot().session.status, 'paused'); m.view.destroy();
});

test('DOM model: pending primary write never reclaims newer focus, navigation or closed ownership', async () => {
    for (const change of ['focus', 'focus-away-back', 'pointer', 'tab', 'hidden', 'detached', 'new-action', 'destroy', 'error']) {
        const m = model(); await m.h.flush(); await m.c.action('visibility', true);
        const outside = m.document.createElement('button'); m.document.body.append(outside);
        m.view.start.focus();
        if (change === 'error') m.h.failWrite(true);
        m.view.start.dispatch('click');
        assert.equal(m.document.activeElement, m.document.body, 'pending disabled button loses native focus');
        if (change === 'focus') outside.focus();
        if (change === 'focus-away-back') { outside.focus(); m.document.listeners.get('focusin')({ target: outside }); m.document.body.focus(); }
        if (change === 'detached') m.host.remove();
        if (change === 'new-action') m.view.run('reset');
        if (change === 'pointer') m.document.listeners.get('pointerdown')({ target: m.document.body });
        if (change === 'tab') m.document.listeners.get('keydown')({ key: 'Tab', repeat: false });
        if (change === 'hidden') m.document.hidden = true;
        if (change === 'destroy') m.view.destroy();
        await m.h.flush();
        assert.notEqual(m.document.activeElement, m.view.start, change + ' must not restore focus');
        m.view.destroy();
    }
});

test('DOM model: concise timer disclosure and collapsed native details retain complete help without writes', async () => {
    const m = model(); await m.h.flush(); await m.c.action('visibility', true);
    const details = m.host.querySelector('details'), summary = details.querySelector('summary');
    assert.equal(details.open, false); assert.equal(summary.textContent, 'How timing works');
    assert.equal(summary.tabIndex, 0, 'native summary is keyboard accessible');
    const help = details.querySelector('p');
    for (const text of ['Closing or hiding', 'device clock', 'Clock changes', 'exports and cloud backups', 'Removing the extension']) assert(help.textContent.includes(text));
    assert(m.host.children.some(node => node.textContent === 'One timer shared on this device. No sound or background alert.'));
    const writes = m.h.writes; details.open = true; details.dispatch('toggle');
    assert(help.getClientRects().length); m.view.start.focus(); m.view.start.dispatch('click'); await m.h.flush();
    assert.equal(details.open, true, 'state renders preserve disclosure choice');
    assert.equal(m.document.activeElement, m.view.start); assert.equal(m.h.writes, writes + 1, 'only explicit Start persists, disclosure does not');
    details.open = false; details.dispatch('toggle'); await m.h.flush(); assert.equal(m.h.writes, writes + 1);
    m.view.destroy();
});
