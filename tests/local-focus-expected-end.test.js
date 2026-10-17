'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const { harness } = require('./focus-timer-helpers');

function model({ locale, intl = Intl, h = harness() } = {}) {
    const document = createDocument({ blurUnavailableFocus: true });
    const api = { ...require('../shared/local-focus-store'), ...require('../shared/local-focus-controller') };
    if (!h.state) h.state = { ...api.initial(), enabled: true };
    const c = h.controller(), timers = new Map(), events = new Map(); let timerId = 0, reads = 0;
    const read = c.store.backend.read; c.store.backend.read = async () => { reads++; return read(); };
    const window = { LocalItabFocus: api,
        setTimeout(fn, delay) { assert.equal(delay, 250); timers.set(++timerId, fn); return timerId; },
        clearTimeout(id) { timers.delete(id); },
        addEventListener(type, fn) { const set = events.get(type) || new Set(); set.add(fn); events.set(type, set); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); } };
    if (locale) {
        const messages = JSON.parse(fs.readFileSync(require.resolve(`../_locales/${locale}/messages.json`), 'utf8'));
        window.i18n = { t: key => messages[key]?.message || key };
        document.documentElement.lang = messages.documentLanguage.message;
    }
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-focus-view'), 'utf8'), { window, document, Intl: intl });
    const host = document.createElement('article'); document.body.append(host);
    const view = new api.View(host, { controller: c });
    return { h, c, api, window, document, host, view, timers, events, get reads() { return reads; } };
}

test('expected end: entry shows the confirmed running deadline in a plain local-time row', async () => {
    const m = model(); await m.h.flush();
    try {
        await m.c.action('start');
        assert(m.view.expectedEnd, 'expected-end presentation must exist');
        assert.equal(m.view.expectedEndGroup.hidden, false);
        assert.match(m.view.expectedEnd.textContent, /^Expected end \(device local time\): /);
        assert.equal(m.view.expectedEndHelp.textContent, 'Estimated using the device clock; recalculated after a pause. No background alert.');
    } finally { m.view.destroy(); }
});

const formatOptions = { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'longOffset' };
function shown(m, deadline = m.c.snapshot().session.deadline, { locale = 'en', zone, label = 'Expected end (device local time)' } = {}) {
    assert.equal(m.view.expectedEndGroup.hidden, false);
    const value = new Intl.DateTimeFormat(locale, { ...formatOptions, ...(zone ? { timeZone: zone } : {}) }).format(new Date(deadline));
    assert.equal(m.view.expectedEnd.textContent, `${label}: ${value}`);
    return m.view.expectedEnd.textContent;
}
function cleared(m) {
    assert.equal(m.view.expectedEndGroup.hidden, true);
    assert.equal(m.view.expectedEnd.textContent, ''); assert.equal(m.view.expectedEndHelp.textContent, '');
}

// Real Intl formatting with a controlled device-default zone. Production must
// omit timeZone, and a newly constructed formatter observes the current zone.
function deviceIntl(initialZone = 'UTC') {
    let zone = initialZone, failure = null;
    const calls = [];
    return { calls, setZone(value) { zone = value; }, fail(value) { failure = value; }, intl: {
        DateTimeFormat: function (locale, options) {
            assert.equal(options.timeZone, undefined, 'the feature uses the device zone, never a saved or fixed zone');
            calls.push({ locale, options: { ...options }, zone });
            if (failure === 'construct') throw Error('synthetic Intl construction failure');
            const formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: zone });
            return { format(value) {
                if (failure === 'format') throw Error('synthetic Intl format failure');
                calls.at(-1).deadline = value.getTime(); return formatter.format(value);
            } };
        }
    } };
}

test('expected end: pause clears, confirmed resume uses its new deadline, and terminal phases stay clear', async () => {
    const m = model(); cleared(m); await m.h.flush();
    try {
        cleared(m); await m.c.action('duration', 1); await m.c.action('start');
        const first = m.c.snapshot().session.deadline; shown(m, first);
        m.h.advance(12345); await m.c.action('pause'); cleared(m); assert.equal(m.c.snapshot().session.deadline, null);
        m.h.advance(60000); m.view.render(); cleared(m);
        const resume = m.c.action('resume'); assert(m.c.pending); cleared(m); await resume;
        const resumed = m.c.snapshot().session.deadline; assert.equal(resumed, first + 60000); shown(m, resumed);
        m.h.advance(47654); m.c.tick(); shown(m, resumed); assert.equal(m.view.remaining.textContent, '0:01');
        m.h.advance(1); m.c.tick(); await m.h.flush(); cleared(m); assert.equal(m.c.snapshot().session.status, 'completed');
        await m.c.action('phase', 'break'); cleared(m); assert.equal(m.c.snapshot().session.status, 'ready');
        await m.c.action('start'); shown(m); assert.equal(m.c.snapshot().session.phase, 'break');
        await m.c.action('reset'); cleared(m);
    } finally { m.view.destroy(); }
});

test('expected end: all pending timer changes clear the old result until confirmed', async () => {
    const m = model(); await m.h.flush();
    try {
        const backend = m.c.store.backend, write = backend.write;
        for (const [kind, value] of [['duration', 2], ['start'], ['pause'], ['resume'], ['visibility', false], ['visibility', true], ['reset'], ['phase', 'break'], ['start']]) {
            const gate = deferred(); backend.write = async state => { await gate.promise; return write(state); };
            const pending = m.c.action(kind, value); assert(m.c.pending); cleared(m);
            gate.resolve(); await pending; backend.write = write;
            const state = m.c.snapshot();
            if (state.enabled && state.session.status === 'running') shown(m); else cleared(m);
        }
    } finally { m.view.destroy(); }
});

test('expected end: read/write and saved-but-unacknowledged failures hide the result until a clean refresh', async () => {
    const m = model(); await m.h.flush();
    try {
        await m.c.action('start'); shown(m);
        m.h.failRead(true); await assert.rejects(m.c.refresh()); cleared(m);
        assert.match(m.view.feedback.textContent, /Could not confirm/);
        m.h.failRead(false); await m.c.refresh(); shown(m);
        m.h.failWrite(true); await assert.rejects(m.c.action('pause')); cleared(m);
        assert.equal(m.c.snapshot().session.status, 'running');
        m.h.failWrite(false); await m.c.refresh(); shown(m);
        await m.c.action('pause'); m.c.unsubscribe(); m.h.failAfterWrite(true);
        await assert.rejects(m.c.action('resume')); assert.equal(m.c.snapshot().session.status, 'running'); cleared(m);
        m.h.failAfterWrite(false); await m.c.refresh(); shown(m);
    } finally { m.view.destroy(); }
});

test('expected end: clock uncertainty hides the date without replacing existing reset guidance', async () => {
    const m = model(); await m.h.flush();
    try {
        await m.c.action('start'); shown(m);
        m.h.mono(3000); m.c.tick(); cleared(m); await m.h.flush();
        assert.equal(m.c.snapshot().session.status, 'uncertain'); assert.match(m.view.status.textContent, /clocks disagree/);
        cleared(m); await m.c.action('reset'); cleared(m);
    } finally { m.view.destroy(); }
});

test('expected end: uses the countdown snapshot once and formats its deadline rather than recalculating', async () => {
    const device = deviceIntl(), m = model({ intl: device.intl }); await m.h.flush();
    const snapshot = m.c.snapshot.bind(m.c);
    try {
        await m.c.action('start'); m.h.advance(123456); const valid = snapshot(), reads = m.reads, writes = m.h.writes;
        let calls = 0; m.c.snapshot = () => { calls++; return calls === 1 ? valid : { ...valid, session: { ...valid.session, deadline: valid.session.deadline + 86400000 } }; };
        m.view.render(); assert.equal(calls, 1); shown(m, valid.session.deadline, { zone: 'UTC' });
        assert.equal(m.view.remaining.textContent, m.api.formatRemaining(valid.session.remainingMs));
        assert.equal(device.calls.at(-1).deadline, valid.session.deadline);
        assert.equal(m.reads, reads); assert.equal(m.h.writes, writes);
        m.c.snapshot = snapshot; const text = shown(m, valid.session.deadline, { zone: 'UTC' });
        m.h.wall(500); m.view.render(); assert.equal(m.view.expectedEnd.textContent, text, 'sub-tolerance device-clock drift does not invent another deadline');
    } finally { m.c.snapshot = snapshot; m.view.destroy(); }
});

test('expected end: retained minutes drafts never determine the running date', async () => {
    const m = model(); await m.h.flush();
    try {
        m.view.minutes.value = '180'; m.view.minutes.dispatch('input'); cleared(m);
        assert.equal(m.view.start.disabled, true);
        const other = m.h.controller(); await other.refresh(); await other.action('start'); await m.h.flush();
        const deadline = m.c.snapshot().session.deadline;
        assert.equal(m.c.snapshot().durations.focus, 25); assert.equal(m.view.durationDrafts.get('focus'), '180'); shown(m, deadline);
        m.view.minutes.value = '1'; m.view.minutes.dispatch('input'); m.view.minutes.dispatch('change'); await m.h.flush();
        shown(m, deadline); assert.equal(m.c.snapshot().durations.focus, 25); other.destroy();
    } finally { m.view.destroy(); }
});

test('expected end: full local date and UTC offset handle midnight, year rollover and both DST boundaries', async () => {
    const device = deviceIntl('America/New_York'), m = model({ intl: device.intl }); await m.h.flush();
    const snapshot = m.c.snapshot.bind(m.c);
    try {
        await m.c.action('start'); const valid = snapshot();
        for (const [zone, instant, datePart, offset] of [
            ['Asia/Shanghai', '2026-12-31T16:10:05Z', 'Jan 1, 2027', 'GMT+08:00'],
            ['America/New_York', '2026-03-08T07:10:05Z', 'Mar 8, 2026', 'GMT-04:00'],
            ['America/New_York', '2026-11-01T06:10:05Z', 'Nov 1, 2026', 'GMT-05:00'],
            ['Asia/Kathmandu', '2026-10-17T18:20:05Z', 'Oct 18, 2026', 'GMT+05:45']
        ]) {
            device.setZone(zone); const deadline = Date.parse(instant);
            const state = { ...valid, session: { ...valid.session, startedAt: deadline - 1500000, deadline } };
            m.c.snapshot = () => state; m.view.render();
            const text = shown(m, deadline, { zone }); assert(text.includes(datePart)); assert(text.includes(offset));
            assert.deepEqual(device.calls.at(-1).options, formatOptions);
        }
    } finally { m.c.snapshot = snapshot; m.view.destroy(); }
});

test('expected end: a changed device time zone is reflected on the existing render tick', async () => {
    const device = deviceIntl('America/New_York'), m = model({ intl: device.intl }); await m.h.flush();
    try {
        await m.c.action('start'); const deadline = m.c.snapshot().session.deadline;
        const oldText = shown(m, deadline, { zone: 'America/New_York' });
        device.setZone('Asia/Shanghai'); const [id, tick] = [...m.timers][0]; m.timers.delete(id); m.h.advance(250); tick();
        const nextText = shown(m, deadline, { zone: 'Asia/Shanghai' }); assert.notEqual(nextText, oldText);
        assert.equal(m.timers.size, 1);
    } finally { m.view.destroy(); }
});

test('expected end: Chinese, English and missing-catalog fallbacks use the document language', async () => {
    for (const [locale, language, label, help] of [
        ['zh_CN', 'zh-CN', '预计结束（设备本地时间）', '按设备时钟估计，暂停后重新计算；无后台提醒'],
        ['en', 'en', 'Expected end (device local time)', 'Estimated using the device clock; recalculated after a pause. No background alert.'],
        [undefined, 'en', 'Expected end (device local time)', 'Estimated using the device clock; recalculated after a pause. No background alert.']
    ]) {
        const device = deviceIntl(), m = model({ locale, intl: device.intl }); await m.h.flush();
        try {
            await m.c.action('start'); shown(m, m.c.snapshot().session.deadline, { locale: language, zone: 'UTC', label });
            assert.equal(m.view.expectedEndHelp.textContent, help); assert.equal(device.calls.at(-1).locale, language);
        } finally { m.view.destroy(); }
    }
});

test('expected end: invalid or missing running presentation values clear old text rather than coercing', async () => {
    const m = model(); await m.h.flush(); const snapshot = m.c.snapshot.bind(m.c);
    try {
        await m.c.action('start'); const valid = snapshot();
        const invalid = [
            state => { state.session.deadline = null; }, state => { state.session.deadline = '1700001500000'; },
            state => { state.session.deadline = NaN; }, state => { state.session.deadline = Infinity; },
            state => { state.session.deadline = Number.MAX_SAFE_INTEGER + 1; }, state => { state.session.deadline = 1.5; },
            state => { state.session.startedAt = -1; }, state => { state.session.startedAt = null; },
            state => { state.session.startedAt = state.session.deadline; }, state => { state.session.startedAt = state.session.deadline + 1; },
            state => { state.session.startedAt = state.session.deadline - 1500001; },
            state => { state.session.deadline = 8640000000000001; state.session.startedAt = state.session.deadline - 1500000; },
            state => { state.session.remainingMs = NaN; }, state => { state.session.remainingMs = Infinity; },
            state => { state.session.remainingMs = -1; }, state => { state.session.remainingMs = 0; },
            state => { state.session.remainingMs = 1500001; }, state => { state.session.remainingMs = '1000'; },
            state => { state.enabled = 'true'; }, state => { state.session.id = 123; }, state => { state.session.id = 'invalid'; },
            state => { state.session.id = null; }, state => { state.session.phase = 'other'; }, state => { state.session.status = 'other'; },
            state => { state.durations.focus = 0; }, state => { state.durations.focus = 181; },
            state => { state.durations.focus = 1.5; }, state => { state.durations.focus = '25'; },
            state => { state.session.status = 'ready'; }, state => { state.session.status = 'paused'; },
            state => { state.session.status = 'completed'; }, state => { state.session.status = 'uncertain'; }
        ];
        for (const mutate of invalid) {
            m.c.snapshot = () => structuredClone(valid); m.view.render(); shown(m, valid.session.deadline);
            const state = structuredClone(valid); mutate(state); m.c.snapshot = () => state; m.view.render(); cleared(m);
        }
        m.c.snapshot = () => null; m.view.render(); cleared(m);
    } finally { m.c.snapshot = snapshot; m.view.destroy(); }
});

test('expected end: Intl construction, formatting and locale failures cannot break the timer', async () => {
    const device = deviceIntl(), m = model({ intl: device.intl }); await m.h.flush();
    try {
        await m.c.action('start'); shown(m, m.c.snapshot().session.deadline, { zone: 'UTC' });
        for (const failure of ['construct', 'format']) {
            device.fail(failure); m.h.advance(1000); assert.doesNotThrow(() => m.c.tick()); cleared(m);
            assert.equal(m.timers.size, 1); assert.equal(m.view.status.textContent, 'Running'); assert.equal(m.view.start.disabled, false);
            assert.equal(m.view.remaining.textContent, m.api.formatRemaining(m.c.snapshot().session.remainingMs));
            device.fail(null); m.view.render(); shown(m, m.c.snapshot().session.deadline, { zone: 'UTC' });
        }
        m.document.documentElement.lang = 'not_a_locale'; m.view.render(); cleared(m); assert.equal(m.timers.size, 1);
        m.document.documentElement.lang = 'en'; m.view.render(); shown(m, m.c.snapshot().session.deadline, { zone: 'UTC' });
    } finally { m.view.destroy(); }
});

test('expected end: hidden page/card, hidden ancestors, departure and detached hosts clear stale text', async () => {
    const m = model(); await m.h.flush();
    try {
        await m.c.action('start'); shown(m); const deadline = m.c.snapshot().session.deadline;
        m.document.hidden = true; await m.document.listeners.get('visibilitychange')(); cleared(m); assert.equal(m.timers.size, 0);
        m.h.advance(10000); m.document.hidden = false; await m.document.listeners.get('visibilitychange')(); await m.h.flush(); shown(m, deadline);
        await m.c.action('visibility', false); cleared(m); assert.equal(m.host.hidden, true); assert.equal(m.timers.size, 0);
        await m.c.action('visibility', true); shown(m, deadline);
        const ancestor = m.document.createElement('section'); m.document.body.append(ancestor); m.host.remove(); ancestor.append(m.host);
        ancestor.hidden = true; m.view.render(); cleared(m); ancestor.hidden = false; m.view.render(); shown(m, deadline);
        m.window.dashboardHiddenState = true; m.view.render(); cleared(m); m.window.dashboardHiddenState = false;
        m.document.body.classList.add('dashboard-hidden'); m.view.render(); cleared(m); m.document.body.classList.remove('dashboard-hidden');
        m.window.LocalItabContentLifecycle = { departing: true }; m.view.render(); cleared(m);
        m.window.LocalItabContentLifecycle.departing = false; m.view.render(); shown(m, deadline);
        m.host.remove(); m.view.render(); cleared(m); m.document.body.append(m.host); m.view.render(); shown(m, deadline);
    } finally { m.view.destroy(); }
});

test('expected end: retired and same-ID replaced workspaces clear text and cannot adopt a replacement', async () => {
    for (const change of ['invalidated', 'same-id-replacement', 'generation']) {
        const m = model(); await m.h.flush();
        try {
            const session = { id: 'synthetic-space', generation: 'generation-one' };
            m.view.workspaceSession = session; m.view.workspaceIdentity = { id: session.id, generation: session.generation };
            m.window.LocalItabWorkspaces = { session };
            await m.c.action('start'); shown(m);
            if (change === 'invalidated') session.invalidated = true;
            if (change === 'same-id-replacement') m.window.LocalItabWorkspaces.session = { ...session };
            if (change === 'generation') session.generation = 'generation-two';
            m.view.workspaceChanged(); cleared(m); assert.equal(m.timers.size, 0); assert.equal(m.view.status.textContent, 'Timer unavailable in this tab');
            session.invalidated = false; session.generation = 'generation-one'; m.window.LocalItabWorkspaces.session = session;
            m.view.render(); cleared(m); assert.equal(m.view.start.disabled, true);
        } finally { m.view.destroy(); }
    }
});

test('expected end: plain stable nodes add no focus target, live output, listeners, I/O or second ticker', async () => {
    const m = model(); await m.h.flush();
    try {
        const nodes = [m.view.expectedEndGroup, m.view.expectedEnd, m.view.expectedEndHelp];
        for (const node of nodes) {
            assert.equal(node.tabIndex, -1); assert.equal(node.listeners.size, 0);
            assert.equal(node.getAttribute('role'), undefined); assert.equal(node.getAttribute('aria-live'), undefined);
        }
        assert.equal(m.host.children.indexOf(nodes[0]), m.host.children.indexOf(m.view.progressGroup) + 1);
        const documentListeners = [...m.document.listeners.keys()], windowListeners = [...m.events].map(([name, set]) => [name, set.size]);
        const outside = m.document.createElement('button'); m.document.body.append(outside); outside.focus();
        await m.c.action('start'); const reads = m.reads, writes = m.h.writes, deadline = m.c.snapshot().session.deadline, status = m.view.status.textContent;
        let statusWrites = 0; Object.defineProperty(m.view.status, 'textContent', { get: () => status, set() { statusWrites++; }, configurable: true });
        for (let n = 0; n < 4; n++) {
            assert.equal(m.timers.size, 1); const [id, tick] = [...m.timers][0]; m.timers.delete(id); m.h.advance(250); tick(); shown(m, deadline);
        }
        assert.equal(m.view.expectedEndGroup, nodes[0]); assert.equal(m.view.expectedEnd, nodes[1]); assert.equal(m.view.expectedEndHelp, nodes[2]);
        assert.equal(m.document.activeElement, outside); assert.equal(statusWrites, 0); assert.equal(m.reads, reads); assert.equal(m.h.writes, writes);
        assert.deepEqual([...m.document.listeners.keys()], documentListeners); assert.deepEqual([...m.events].map(([name, set]) => [name, set.size]), windowListeners);
        const callback = [...m.timers.values()][0], listener = [...m.c.listeners][0];
        m.view.destroy(); cleared(m); callback(); listener(); m.view.render(); cleared(m); assert.equal(m.timers.size, 0);
    } finally { m.view.destroy(); }
});

test('expected end: destroying during a pending start cannot revive the date on late settlement', async () => {
    const m = model(); await m.h.flush();
    const gate = deferred(), backend = m.c.store.backend, write = backend.write;
    backend.write = async state => { await gate.promise; return write(state); };
    const pending = m.c.action('start'); cleared(m); assert(m.c.pending);
    m.view.destroy(); cleared(m); gate.resolve(); await pending; await m.h.flush();
    cleared(m); assert.equal(m.timers.size, 0); assert.equal(m.c.listeners.size, 0);
});


test('expected end: reopening uses the stored deadline and retains the existing offline clock limits', async () => {
    const first = model(); await first.h.flush(); let reopened;
    try {
        await first.c.action('start'); const deadline = first.c.snapshot().session.deadline, writes = first.h.writes;
        first.view.destroy(); first.h.advance(20000);
        reopened = model({ h: first.h }); await first.h.flush(); shown(reopened, deadline);
        assert.equal(reopened.view.remaining.textContent, '24:40'); assert.equal(first.h.writes, writes);
        reopened.view.destroy(); first.h.wall(5000);
        reopened = model({ h: first.h }); await first.h.flush(); shown(reopened, deadline);
        assert.equal(reopened.view.remaining.textContent, '24:35', 'reopening still estimates with the device clock; it does not gain a new clock witness');
        assert.equal(first.h.writes, writes);
    } finally { first.view.destroy(); reopened?.view.destroy(); }
});

test('expected end: a missing Intl implementation or missing catalog entries fails safely', async () => {
    const m = model({ intl: {} }); await m.h.flush();
    try {
        await m.c.action('start'); cleared(m); assert.equal(m.view.remaining.textContent, '25:00'); assert.equal(m.timers.size, 1);
        await m.c.action('pause'); cleared(m); assert.equal(m.view.start.textContent, 'Resume');
    } finally { m.view.destroy(); }
    const fallback = model(); await fallback.h.flush();
    try {
        fallback.window.i18n = { t: key => key }; await fallback.c.action('start'); shown(fallback);
        assert.equal(fallback.view.expectedEndHelp.textContent, 'Estimated using the device clock; recalculated after a pause. No background alert.');
    } finally { fallback.view.destroy(); }
});

test('expected end: CSS-hidden hosts clear the date on an existing render', async () => {
    const m = model(); await m.h.flush();
    try {
        await m.c.action('start'); shown(m);
        m.host.style.display = 'none'; m.view.render(); cleared(m);
        m.host.style.display = ''; m.view.render(); shown(m);
        const ancestor = m.document.createElement('section'); m.document.body.append(ancestor); m.host.remove(); ancestor.append(m.host);
        ancestor.style.display = 'none'; m.view.render(); cleared(m);
        ancestor.style.display = ''; m.view.render(); shown(m);
        // Computed-style contract stub only; this fixture is not a CSS engine.
        m.window.getComputedStyle = node => {
            for (let current = node; current; current = current.parentElement) {
                if (current.style.visibility) return { visibility: current.style.visibility };
            }
            return { visibility: 'visible' };
        };
        for (const target of [m.host, ancestor]) for (const value of ['hidden', 'collapse']) {
            target.style.visibility = value; m.view.render(); cleared(m);
            target.style.visibility = ''; m.view.render(); shown(m);
        }
        m.window.getComputedStyle = () => { throw Error('synthetic computed-style failure'); };
        assert.doesNotThrow(() => m.view.render()); cleared(m); assert.equal(m.timers.size, 1);
        delete m.window.getComputedStyle; m.view.render(); shown(m);
        const rects = m.host.getClientRects;
        m.host.getClientRects = () => { throw Error('synthetic layout failure'); };
        assert.doesNotThrow(() => m.view.render()); cleared(m); assert.equal(m.timers.size, 1);
        m.host.getClientRects = rects; m.view.render(); shown(m);
        await m.c.action('visibility', false); cleared(m);
        await m.c.action('visibility', true); shown(m);
    } finally { m.view.destroy(); }
});


test('expected end: both phases format saved deadlines at the one and 180 minute limits', async () => {
    const m = model(); await m.h.flush();
    try {
        for (const phase of ['focus', 'break']) for (const minutes of [1, 180]) {
            await m.c.action('phase', phase); await m.c.action('duration', minutes); cleared(m);
            await m.c.action('start'); const state = m.c.snapshot(); shown(m, state.session.deadline);
            assert.equal(state.session.deadline - state.session.startedAt, minutes * 60000);
            await m.c.action('reset'); cleared(m);
        }
    } finally { m.view.destroy(); }
});
