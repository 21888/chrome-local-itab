'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const { harness } = require('./focus-timer-helpers');

function model() {
    const h = harness(), document = createDocument({ blurUnavailableFocus: true });
    // Model the native progress IDL/attribute defaults for clear-value checks.
    const create = document.createElement;
    document.createElement = tag => {
        const node = create(tag);
        if (tag === 'progress') for (const [key, fallback] of [['value', 0], ['max', 1]]) {
            delete node[key]; Object.defineProperty(node, key, { get: () => node.getAttribute(key) === undefined ? fallback : Number(node.getAttribute(key)), set: value => node.setAttribute(key, String(value)) });
        }
        return node;
    };
    const api = { ...require('../shared/local-focus-store'), ...require('../shared/local-focus-controller') };
    h.state = { ...api.initial(), enabled: true };
    const c = h.controller(), timers = new Map(), events = new Map(); let timerId = 0, reads = 0;
    const read = c.store.backend.read; c.store.backend.read = async () => { reads++; return read(); };
    const window = { LocalItabFocus: api,
        setTimeout(fn, delay) { assert.equal(delay, 250); timers.set(++timerId, fn); return timerId; },
        clearTimeout(id) { timers.delete(id); },
        addEventListener(type, fn) { const set = events.get(type) || new Set(); set.add(fn); events.set(type, set); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); } };
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-focus-view'), 'utf8'), { window, document });
    const host = document.createElement('article'); document.body.append(host);
    const view = new api.View(host, { controller: c });
    return { h, c, api, window, document, host, view, timers, events, get reads() { return reads; } };
}

test('stage progress: creates one stable native progress below remaining time', async () => {
    const m = model(); await m.h.flush();
    try {
        const progress = m.host.querySelector('progress'); assert(progress, 'native stage progress must exist');
        const attributeProbe = m.document.createElement('div'); attributeProbe.setAttribute('data-probe', 'present');
        attributeProbe.removeAttribute('data-probe'); assert.equal(attributeProbe.getAttribute('data-probe'), undefined);
        assert.equal(progress.getAttribute('aria-label'), 'This interval’s progress');
        assert.equal(progress.max, 1500); assert.equal(progress.value, 0);
        assert.equal(progress.getAttribute('aria-valuetext'), 'Elapsed 0:00 / This interval 25:00');
    } finally { m.view.destroy(); }
});

function shown(m, elapsed, total) {
    const progress = m.host.querySelector('progress'), group = m.host.querySelector('.focus-progress-group');
    assert.equal(group.hidden, false); assert.equal(progress.value, elapsed); assert.equal(progress.max, total);
    const text = `Elapsed ${m.api.formatRemaining(elapsed * 1000)} / This interval ${m.api.formatRemaining(total * 1000)}`;
    assert.equal(m.host.querySelector('.focus-progress-text').textContent, text);
    assert.equal(progress.getAttribute('aria-valuetext'), text);
    return progress;
}
function cleared(m) {
    const progress = m.host.querySelector('progress');
    assert.equal(m.host.querySelector('.focus-progress-group').hidden, true);
    for (const attribute of ['value', 'max', 'aria-label', 'aria-valuetext']) assert.equal(progress.getAttribute(attribute), undefined, attribute);
    assert.equal(progress.value, 0); assert.equal(progress.max, 1);
    assert.equal(progress.textContent, ''); assert.equal(m.host.querySelector('.focus-progress-text').textContent, '');
}

test('stage progress: default and saved custom focus/break durations include both allowed limits', async () => {
    const m = model(); await m.h.flush();
    try {
        shown(m, 0, 1500); await m.c.action('phase', 'break'); shown(m, 0, 300);
        for (const [phase, minutes] of [['focus', 1], ['focus', 180], ['break', 1], ['break', 180], ['focus', 42], ['break', 7]]) {
            await m.c.action('phase', phase); await m.c.action('duration', minutes); shown(m, 0, minutes * 60);
        }
    } finally { m.view.destroy(); }
});

test('stage progress: countdown and elapsed seconds complement at 1001, 1000, 999, 1 and 0 ms', async () => {
    const m = model(); await m.h.flush();
    try {
        await m.c.action('duration', 1); await m.c.action('start'); let previous = 60000;
        for (const remaining of [1001, 1000, 999, 1, 0]) {
            m.h.advance(previous - remaining); previous = remaining; m.c.tick(); await m.h.flush();
            const elapsed = 60 - Math.ceil(remaining / 1000); shown(m, elapsed, 60);
            assert.equal(m.view.remaining.textContent, m.api.formatRemaining(remaining));
            assert.equal(elapsed + Math.ceil(remaining / 1000), 60);
            if (remaining > 0) assert(m.view.progress.value < m.view.progress.max, 'a partial final second is not full');
        }
        assert.equal(m.c.snapshot().session.status, 'completed'); m.h.advance(30000); m.view.render(); shown(m, 60, 60);
        await m.c.action('phase', 'break'); shown(m, 0, 300); assert.equal(m.c.snapshot().session.status, 'ready');
        await m.c.action('start'); m.h.advance(12000); m.c.tick(); shown(m, 12, 300);
        await m.c.action('reset'); shown(m, 0, 300);
    } finally { m.view.destroy(); }
});

test('stage progress: pause freezes elapsed and resume keeps the original saved interval total', async () => {
    const m = model(); await m.h.flush();
    try {
        await m.c.action('start'); const startedAt = m.c.snapshot().session.startedAt;
        m.h.advance(123456); await m.c.action('pause'); shown(m, 123, 1500);
        m.h.advance(60000); m.c.tick(); m.view.render(); shown(m, 123, 1500); assert.equal(m.timers.size, 0);
        await m.c.action('resume'); assert.notEqual(m.c.snapshot().session.startedAt, startedAt); shown(m, 123, 1500);
        m.h.advance(1000); m.c.tick(); shown(m, 124, 1500);
    } finally { m.view.destroy(); }
});

test('stage progress: unsaved draft and pending duration use only confirmed saved state', async () => {
    const m = model(); await m.h.flush();
    try {
        m.view.minutes.value = '30'; m.view.minutes.dispatch('input'); shown(m, 0, 1500);
        const other = m.h.controller(); await other.refresh(); await other.action('duration', 40); await m.h.flush();
        assert.equal(m.view.minutes.value, '30'); shown(m, 0, 2400); other.destroy();
        const gate = deferred(), backend = m.c.store.backend, write = backend.write;
        backend.write = async value => { await gate.promise; return write(value); };
        m.view.saveMinutes.dispatch('click'); assert(m.c.pending); shown(m, 0, 2400);
        gate.resolve(); await m.h.flush(); shown(m, 0, 1800); assert.equal(m.c.snapshot().session.status, 'ready');
    } finally { m.view.destroy(); }
});

test('stage progress: pending pause and next-phase intent never replace the current snapshot', async () => {
    const m = model(); await m.h.flush();
    try {
        await m.c.action('duration', 1); await m.c.action('start'); m.h.advance(10000); m.c.tick();
        const backend = m.c.store.backend, write = backend.write; let gate = deferred();
        backend.write = async value => { await gate.promise; return write(value); };
        const paused = m.c.action('pause'); shown(m, 10, 60); assert.equal(m.c.snapshot().session.status, 'running');
        gate.resolve(); await paused; shown(m, 10, 60);
        backend.write = write; await m.c.action('resume'); m.h.advance(50000); m.c.tick(); await m.h.flush(); shown(m, 60, 60);
        gate = deferred(); backend.write = async value => { await gate.promise; return write(value); };
        m.view.start.dispatch('click'); assert(m.c.pending); shown(m, 60, 60);
        gate.resolve(); await m.h.flush(); shown(m, 0, 300);
    } finally { m.view.destroy(); }
});

test('stage progress: read/write errors and uncertain saved writes clear values until confirmed refresh', async () => {
    const m = model(); cleared(m); await m.h.flush();
    try {
        shown(m, 0, 1500); m.h.failRead(true); await assert.rejects(m.c.refresh()); cleared(m);
        assert.equal(m.view.feedback.textContent, 'Could not confirm the timer change. Read the latest state before trying again.');
        m.h.failRead(false); await m.c.refresh(); shown(m, 0, 1500);
        m.h.failWrite(true); await assert.rejects(m.c.action('duration', 30)); cleared(m);
        m.h.failWrite(false); await m.c.refresh(); shown(m, 0, 1500);
        m.c.unsubscribe(); m.h.failAfterWrite(true); await assert.rejects(m.c.action('duration', 30));
        assert.equal(m.c.snapshot().durations.focus, 30); cleared(m);
        m.h.failAfterWrite(false); await m.c.refresh(); shown(m, 0, 1800);
    } finally { m.view.destroy(); }
});

test('stage progress: clock disagreement hides the group and preserves the reset guidance', async () => {
    const m = model(); await m.h.flush();
    try {
        await m.c.action('start'); m.h.mono(3000); m.c.tick(); await m.h.flush(); cleared(m);
        assert.equal(m.c.snapshot().session.status, 'uncertain'); assert.match(m.view.status.textContent, /clocks disagree/);
        await m.c.action('reset'); shown(m, 0, 1500);
    } finally { m.view.destroy(); }
});

test('stage progress: invalid presentation values fail closed instead of clamping or coercing', async () => {
    const m = model(); await m.h.flush(); const snapshot = m.c.snapshot.bind(m.c), valid = snapshot();
    try {
        const invalid = [
            state => { state.session.remainingMs = NaN; }, state => { state.session.remainingMs = Infinity; },
            state => { state.session.remainingMs = -1; }, state => { state.session.remainingMs = 1500001; },
            state => { state.session.remainingMs = '1000'; }, state => { state.durations.focus = 0; },
            state => { state.durations.focus = 181; }, state => { state.durations.focus = 1.5; },
            state => { state.durations.focus = '25'; }, state => { state.durations.focus = NaN; },
            state => { state.session.phase = 'other'; }, state => { state.session.status = 'other'; },
            state => { state.session.remainingMs = 1000; },
            state => { state.session.status = 'completed'; state.session.remainingMs = 1; }
        ];
        for (const mutate of invalid) {
            m.c.snapshot = () => structuredClone(valid); m.view.render(); shown(m, 0, 1500);
            const state = structuredClone(valid); mutate(state); m.c.snapshot = () => state;
            m.view.render(); cleared(m);
        }
        m.c.snapshot = () => null; m.view.render(); cleared(m);
    } finally { m.c.snapshot = snapshot; m.view.destroy(); }
});

test('stage progress: one render shares its snapshot with the countdown, without another read', async () => {
    const m = model(); await m.h.flush(); const snapshot = m.c.snapshot.bind(m.c);
    try {
        const state = snapshot(); state.session.status = 'paused'; state.session.remainingMs = 1376544;
        let calls = 0; m.c.snapshot = () => { calls++; return calls === 1 ? state : { ...state, durations: { focus: 180, break: 5 } }; };
        m.view.render(); assert.equal(calls, 1); shown(m, 123, 1500); assert.equal(m.view.remaining.textContent, '22:57');
    } finally { m.c.snapshot = snapshot; m.view.destroy(); }
});

test('stage progress: existing ticker, focus and coarse status stay stable; hidden views have no extra work', async () => {
    const m = model(); await m.h.flush();
    try {
        const progress = shown(m, 0, 1500), group = progress.parentElement;
        assert.equal(m.host.children.indexOf(group), m.host.children.indexOf(m.view.remaining) + 1);
        assert.equal(group.tabIndex, -1); assert.equal(progress.tabIndex, -1);
        assert.equal(progress.listeners.size, 0); assert.equal(group.listeners.size, 0);
        assert.equal(progress.getAttribute('aria-live'), undefined); assert.equal(group.getAttribute('aria-live'), undefined);
        assert.equal(m.view.remaining.getAttribute('aria-live'), 'off');
        const outside = m.document.createElement('button'); m.document.body.append(outside); outside.focus();
        await m.c.action('start'); const reads = m.reads, writes = m.h.writes, status = m.view.status.textContent;
        let statusWrites = 0; Object.defineProperty(m.view.status, 'textContent', { get: () => status, set() { statusWrites++; }, configurable: true });
        for (let index = 0; index < 4; index++) {
            assert.equal(m.timers.size, 1); const [id, tick] = [...m.timers][0]; m.timers.delete(id);
            m.h.advance(250); tick(); assert.equal(m.host.querySelector('progress'), progress);
        }
        shown(m, 1, 1500); assert.equal(m.reads, reads); assert.equal(m.h.writes, writes);
        assert.equal(m.document.activeElement, outside); assert.equal(statusWrites, 0);
        m.document.hidden = true; await m.document.listeners.get('visibilitychange')(); assert.equal(m.timers.size, 0);
        const hiddenReads = m.reads; m.h.advance(10000); assert.equal(m.reads, hiddenReads); assert.equal(m.h.writes, writes);
        m.document.hidden = false; await m.document.listeners.get('visibilitychange')(); await m.h.flush(); shown(m, 11, 1500); assert.equal(m.timers.size, 1);
        await m.c.action('visibility', false); assert.equal(m.host.hidden, true); assert.equal(m.timers.size, 0);
        m.h.advance(10000); await m.c.action('visibility', true); shown(m, 21, 1500); assert.equal(m.timers.size, 1);
        const callback = [...m.timers.values()][0], listener = [...m.c.listeners][0]; m.view.destroy(); cleared(m);
        m.h.advance(1000); callback(); listener(); m.view.render(); cleared(m); assert.equal(m.timers.size, 0);
    } finally { m.view.destroy(); }
});


test('stage progress: destroy clears a pending view and late write settlement cannot revive it', async () => {
    const m = model(); await m.h.flush();
    const gate = deferred(), backend = m.c.store.backend, write = backend.write;
    backend.write = async value => { await gate.promise; return write(value); };
    const pending = m.c.action('start'); shown(m, 0, 1500); assert(m.c.pending);
    m.view.destroy(); cleared(m); gate.resolve(); await pending; await m.h.flush();
    cleared(m); assert.equal(m.timers.size, 0); assert.equal(m.c.listeners.size, 0);
});
