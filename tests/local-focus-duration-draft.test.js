const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const { harness } = require('./focus-timer-helpers');
function model() {
    const h = harness(), document = createDocument(), events = new Map(), timers = new Map();
    const create = document.createElement; let sequence = 0, reloads = 0, confirms = 0, decision = false;
    document.createElement = tag => {
        const node = create(tag); let disabled = false;
        Object.defineProperty(node, 'disabled', { get: () => disabled, set(value) {
            disabled = Boolean(value); if (disabled && document.activeElement === node) document.activeElement = document.body;
        } });
        return node;
    };
    document.body.prepend = (...nodes) => document.body.append(...nodes);
    const api = { ...require('../shared/local-focus-store'), ...require('../shared/local-focus-controller') };
    const window = { LocalItabFocus: api, location: { reload() { reloads++; } }, confirm() { confirms++; return decision; },
        addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
        setTimeout(fn) { timers.set(++sequence, fn); return sequence; }, clearTimeout(id) { timers.delete(id); } };
    const context = vm.createContext({ window, document });
    for (const file of ['local-focus-view', 'local-content-lifecycle']) vm.runInContext(fs.readFileSync(`shared/${file}.js`, 'utf8'), context);
    const host = document.createElement('article'); document.body.append(host); const c = h.controller();
    const view = window.localFocusView = new api.View(host, { controller: c });
    return { h, document, window, context, api, c, view, host, events, timers,
        get reloads() { return reloads; }, get confirms() { return confirms; }, allow(value) { decision = value; },
        type(value) { view.minutes.focus(); view.minutes.value = value; view.minutes.dispatch('input'); },
        async ready() { await h.flush(); await c.action('visibility', true); await h.flush(); },
        guarded(expected, reason) {
            const event = { prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
            for (const listener of events.get('beforeunload') || []) listener(event);
            assert.equal(event.prevented, expected, reason); assert.equal(event.returnValue, expected ? '' : undefined, reason);
        } };
}

test('duration draft: typing and clearing are protected, returning to saved value is clean without writes', async () => {
    const m = model(); await m.ready(); const writes = m.h.writes;
    assert.equal(m.view.hasUncommittedWork(), false); m.guarded(false);
    for (const value of ['30', '', '0', '181', '1.5']) {
        m.type(value); assert.equal(m.view.hasUncommittedWork(), true, value); m.guarded(true, value);
        assert.equal(m.c.snapshot().durations.focus, 25); assert.equal(m.h.writes, writes);
    }
    m.type('25'); assert.equal(m.view.hasUncommittedWork(), false); m.guarded(false);
    assert.equal(m.h.writes, writes); m.view.destroy();
});

test('duration draft: unfocused refresh and visibility renders keep typed minutes without starting a timer', async () => {
    const m = model(); await m.ready(); m.type('30'); m.document.body.focus();
    await m.c.refresh(); assert.equal(m.view.minutes.value, '30');
    m.document.hidden = true; m.document.listeners.get('visibilitychange')();
    m.document.hidden = false; m.document.listeners.get('visibilitychange')(); await m.h.flush();
    assert.equal(m.view.minutes.value, '30'); assert.equal(m.c.snapshot().session.status, 'ready');
    assert.equal(m.c.snapshot().durations.focus, 25); assert.equal(m.view.hasUncommittedWork(), true); m.view.destroy();
});

test('duration draft: automatic reload defers and explicit cancel retains the draft', async () => {
    const m = model(); await m.ready(); m.type('30');
    assert.equal(m.window.LocalItabContentLifecycle.reload(), false); assert.equal(m.reloads, 0);
    const button = m.document.getElementById('local-content-reload-notice').querySelector('button');
    button.dispatch('click'); assert.equal(m.confirms, 1); assert.equal(m.reloads, 0); assert.equal(m.view.minutes.value, '30');
    m.allow(true); button.dispatch('click'); assert.equal(m.confirms, 2); assert.equal(m.reloads, 1); m.view.destroy();
});

test('duration draft: native change commits once, stays guarded while pending, and never starts', async () => {
    const m = model(); await m.ready(); m.type('30'); const gate = deferred(), backend = m.c.store.backend, write = backend.write;
    backend.write = async value => { await gate.promise; return write(value); };
    m.view.minutes.dispatch('change'); assert(m.c.pending); assert(m.view.minutes.disabled); assert.equal(m.view.minutes.value, '30');
    m.guarded(true); assert.equal(m.window.LocalItabContentLifecycle.reload(), false);
    const reload = m.document.getElementById('local-content-reload-notice').querySelector('button');
    m.allow(true); reload.dispatch('click'); assert.equal(m.confirms, 0, 'pending writes cannot be discarded'); assert.equal(m.reloads, 0);
    m.view.minutes.dispatch('change'); gate.resolve(); await m.h.flush();
    assert.equal(m.h.writes, 2, 'visibility plus one duration write'); assert.equal(m.c.snapshot().durations.focus, 30);
    assert.equal(m.c.snapshot().session.status, 'ready'); assert.equal(m.view.remaining.textContent, '30:00');
    assert.equal(m.view.hasUncommittedWork(), false); m.guarded(false); assert.equal(m.window.LocalItabContentLifecycle.reload(), true); m.view.destroy();
});

test('duration draft: invalid committed change restores saved minutes and existing validation feedback', async () => {
    const m = model(); await m.ready(); const writes = m.h.writes;
    for (const value of ['', '0', '181', '1.5', 'invalid']) {
        m.type(value); m.guarded(true); m.document.body.focus(); m.view.minutes.dispatch('change');
        assert.equal(m.view.minutes.value, '25'); assert.equal(m.view.feedback.textContent, 'Enter whole minutes from 1 to 180.');
        assert.equal(m.view.hasUncommittedWork(), false); m.guarded(false); assert.equal(m.h.writes, writes);
    }
    m.type('180'); m.view.minutes.dispatch('change'); await m.h.flush(); assert.equal(m.c.snapshot().durations.focus, 180);
    assert.equal(m.view.hasUncommittedWork(), false); m.view.destroy();
});

test('duration draft: failed duration save and read-latest retry retain raw input without replaying a write', async () => {
    const m = model(); await m.ready(); m.type('30'); m.h.failWrite(true); m.view.minutes.dispatch('change'); await m.h.flush();
    assert.equal(m.c.snapshot().durations.focus, 25); assert.equal(m.view.minutes.value, '30'); assert.equal(m.c.error.code, 'WRITE');
    assert.equal(m.view.retry.hidden, false); m.guarded(true); assert.equal(m.view.hasUncommittedWork(), true);
    const writes = m.h.writes; m.h.failWrite(false); m.view.retry.dispatch('click'); await m.h.flush();
    assert.equal(m.h.writes, writes); assert.equal(m.c.error, null); assert.equal(m.view.minutes.value, '30'); m.guarded(true);
    m.type('30'); m.view.minutes.dispatch('change'); await m.h.flush();
    assert.equal(m.c.snapshot().durations.focus, 30); assert.equal(m.h.writes, writes + 1); m.guarded(false); m.view.destroy();
});

test('duration draft: failed refresh preserves empty or invalid typing until deliberate change', async () => {
    for (const value of ['', '181']) {
        const m = model(); await m.ready(); m.type(value); m.document.body.focus(); m.h.failRead(true);
        await assert.rejects(m.c.refresh()); assert.equal(m.view.minutes.value, value); m.guarded(true);
        m.h.failRead(false); m.view.retry.dispatch('click'); await m.h.flush();
        assert.equal(m.view.minutes.value, value); assert.equal(m.c.snapshot().durations.focus, 25); m.guarded(true); m.view.destroy();
    }
});

test('duration draft: uncertain write that was actually saved is clean but still exposes the existing error', async () => {
    const m = model(); await m.ready(); m.c.unsubscribe(); m.type('30'); m.h.failAfterWrite(true); m.view.minutes.dispatch('change'); await m.h.flush();
    assert.equal(m.c.snapshot().durations.focus, 30); assert.equal(m.view.minutes.value, '30'); assert(m.c.error);
    assert.equal(m.view.hasUncommittedWork(), false); m.guarded(false);
    m.h.failAfterWrite(false); m.view.retry.dispatch('click'); await m.h.flush(); assert.equal(m.c.error, null); m.view.destroy();
});

test('duration draft: external duration updates preserve a different draft, matching saved updates release it', async () => {
    const m = model(); await m.ready(); m.type('30'); m.document.body.focus(); const other = m.h.controller(); await other.refresh();
    await other.action('duration', 45); await m.h.flush();
    assert.equal(m.c.snapshot().durations.focus, 45); assert.equal(m.view.minutes.value, '30'); assert.equal(m.view.remaining.textContent, '45:00'); m.guarded(true);
    await other.action('duration', 30); await m.h.flush();
    assert.equal(m.view.minutes.value, '30'); assert.equal(m.view.hasUncommittedWork(), false); m.guarded(false); other.destroy(); m.view.destroy();
});

test('duration draft: external running state owns the visible timer and retains unsaved minutes for later', async () => {
    const m = model(); await m.ready(); m.type('30'); const other = m.h.controller(); await other.refresh(); await other.action('start'); await m.h.flush();
    const running = m.h.state, writes = m.h.writes;
    assert.equal(m.view.minutes.value, '25'); assert.equal(m.view.minutes.disabled, true); assert.equal(m.view.start.textContent, 'Pause');
    assert.equal(m.view.feedback.textContent, 'Your unsaved minutes are kept on this page. Finish editing when that interval is ready.'); m.guarded(true);
    m.view.minutes.dispatch('change'); m.view.minutes.dispatch('input'); await m.c.refresh(); await m.h.flush();
    assert.deepEqual(m.h.state, running); assert.equal(m.h.writes, writes, 'no draft command affects the remote run');
    await other.action('pause'); await m.h.flush(); assert.equal(m.view.minutes.value, '25'); m.guarded(true);
    await other.action('reset'); await m.h.flush(); assert.equal(m.view.minutes.value, '30'); assert.equal(m.c.snapshot().durations.focus, 25);
    m.view.minutes.dispatch('change'); await m.h.flush(); assert.equal(m.c.snapshot().durations.focus, 25, 'stale pre-run change cannot apply after reset');
    m.type('30'); m.view.minutes.dispatch('change'); await m.h.flush(); assert.equal(m.c.snapshot().durations.focus, 30); m.guarded(false);
    other.destroy(); m.view.destroy();
});

test('duration draft: external phase changes cannot silently commit the other interval’s draft', async () => {
    const m = model(); await m.ready(); m.type('30'); const other = m.h.controller(); await other.refresh(); await other.action('phase', 'break'); await m.h.flush();
    const writes = m.h.writes; assert.equal(m.view.phase.value, 'break'); assert.equal(m.view.minutes.value, '5');
    m.view.minutes.dispatch('change'); await m.h.flush(); assert.equal(m.h.writes, writes); assert.equal(m.c.snapshot().durations.break, 5); m.guarded(true);
    m.type('10'); m.document.body.focus(); await m.c.refresh(); assert.equal(m.view.minutes.value, '10');
    await other.action('phase', 'focus'); await m.h.flush(); assert.equal(m.view.minutes.value, '30');
    m.view.minutes.dispatch('change'); await m.h.flush(); assert.equal(m.c.snapshot().durations.focus, 25);
    m.type('25'); assert.equal(m.view.hasUncommittedWork(), true, 'other phase still has unsaved minutes');
    await other.action('phase', 'break'); await m.h.flush(); assert.equal(m.view.minutes.value, '10');
    m.type('5'); assert.equal(m.view.hasUncommittedWork(), false); m.guarded(false); other.destroy(); m.view.destroy();
});

test('duration draft: hide/show settings preserve typed minutes and clean running sessions never block departure', async () => {
    const m = model(); await m.ready(); m.type('30'); const settingsHost = m.document.createElement('div'); m.document.body.append(settingsHost);
    const settings = m.window.localFocusSettingsView = m.api.mountSettings(settingsHost, { controller: m.h.controller() }); await m.h.flush();
    const checkbox = settingsHost.querySelector('input'); checkbox.checked = false; checkbox.dispatch('change'); await m.h.flush();
    assert.equal(m.host.hidden, true); m.guarded(true); assert.equal(m.window.LocalItabContentLifecycle.reload(), false);
    checkbox.checked = true; checkbox.dispatch('change'); await m.h.flush(); assert.equal(m.host.hidden, false); assert.equal(m.view.minutes.value, '30');
    m.type('25'); await m.c.action('start'); await m.h.flush(); m.guarded(false); assert.equal(m.window.LocalItabContentLifecycle.reload(), true);
    assert.equal(m.c.snapshot().session.status, 'running'); settings.destroy(); m.view.destroy();
});

test('duration draft: settings writes retain pending departure protection without a dashboard view', async () => {
    const m = model(); await m.ready(); m.view.destroy(); delete m.window.localFocusView;
    const host = m.document.createElement('div'); m.document.body.append(host);
    const settings = m.window.localFocusSettingsView = m.api.mountSettings(host, { controller: m.h.controller() }); await m.h.flush();
    const gate = deferred(), backend = settings.controller.store.backend, write = backend.write;
    backend.write = async value => { await gate.promise; return write(value); };
    const checkbox = host.querySelector('input'); checkbox.checked = false; checkbox.dispatch('change'); m.guarded(true);
    assert.equal(m.window.LocalItabContentLifecycle.reload(), false); gate.resolve(); await m.h.flush(); m.guarded(false);
    assert.equal(m.window.LocalItabContentLifecycle.reload(), true); settings.destroy();
});

test('duration draft: destroy releases drafts and ignores late events, but an in-flight write stays protected', async () => {
    const m = model(); await m.ready(); m.type('30'); m.view.destroy(); m.guarded(false);
    const writes = m.h.writes; m.view.minutes.dispatch('input'); m.view.minutes.dispatch('change'); await m.h.flush();
    assert.equal(m.h.writes, writes); assert.equal(m.view.hasUncommittedWork(), false);
    const n = model(); await n.ready(); n.type('30'); const gate = deferred(), backend = n.c.store.backend, write = backend.write;
    backend.write = async value => { await gate.promise; return write(value); };
    n.view.minutes.dispatch('change'); n.view.destroy(); n.guarded(true); gate.resolve(); await n.h.flush();
    n.guarded(false); assert.equal(n.c.pending, null); assert.equal(n.timers.size, 0);
});

test('duration draft: stale committed change preserves the draft and existing conflict retry behavior', async () => {
    const m = model(); await m.ready(); m.type('30'); m.c.unsubscribe();
    const other = m.h.controller(); await other.refresh(); await other.action('duration', 45); await m.h.flush();
    const writes = m.h.writes; m.view.minutes.dispatch('change'); await m.h.flush();
    assert.equal(m.c.error.code, 'CONFLICT'); assert.equal(m.c.snapshot().durations.focus, 45);
    assert.equal(m.view.minutes.value, '30'); assert.equal(m.h.writes, writes); m.guarded(true);
    m.view.retry.dispatch('click'); await m.h.flush(); assert.equal(m.view.minutes.value, '30'); assert.equal(m.h.writes, writes);
    m.type('30'); m.view.minutes.dispatch('change'); await m.h.flush(); assert.equal(m.c.snapshot().durations.focus, 30);
    assert.equal(m.view.hasUncommittedWork(), false); other.destroy(); m.view.destroy();
});

test('duration draft: real configuration notification defers immediate and delayed settings reloads', async () => {
    for (const page of ['newtab.js', 'options.js']) {
        const m = model(); await m.ready(); const listeners = [], callbacks = []; let pulls = 0;
        const storageManager = { syncMetaKey: 'sync-meta', syncChunkPrefix: 'sync-chunk-', syncIdentityStateKey: 'sync-guard',
            shouldIgnoreRemoteSyncChange: async () => false, pullFromSync: async () => { pulls++; return { applied: true }; },
            getSyncCompatibilityStatus: async () => null };
        Object.assign(m.context, { storageManager, console, chrome: { storage: { onChanged: { addListener(fn) { listeners.push(fn); } } } },
            setTimeout(fn) { callbacks.push(fn); }, clearTimeout() {} });
        m.window.storageManager = storageManager;
        vm.runInContext(fs.readFileSync(page, 'utf8'), m.context); m.context.showMessage = () => {};
        m.context.setupCloudSyncChangeListener(); await m.h.flush(); assert.equal(listeners.length, 1);
        await listeners[0]({ __localItabFocusV1: { newValue: m.h.state } }, 'local');
        assert.equal(pulls, 0); assert.equal(m.reloads, 0); assert.equal(callbacks.length, 0);
        if (page === 'newtab.js') m.type('30');
        await listeners[0]({ 'sync-meta': { newValue: {} } }, 'sync'); assert.equal(pulls, 1);
        if (page === 'options.js') { assert.equal(callbacks.length, 1); m.type('30'); callbacks.shift()(); }
        assert.equal(m.reloads, 0); assert(m.document.getElementById('local-content-reload-notice'));
        assert.equal(m.view.minutes.value, '30'); assert.equal(m.c.snapshot().durations.focus, 25); m.view.destroy();
    }
});

test('duration draft: restored or failed minutes cannot silently Start using a different saved duration', async () => {
    for (const recovery of ['remote', 'failure']) {
        const m = model(); await m.ready(); m.type('30');
        if (recovery === 'remote') {
            const other = m.h.controller(); await other.refresh(); await other.action('start'); await m.h.flush();
            await other.action('reset'); await m.h.flush(); other.destroy();
        } else {
            m.h.failWrite(true); m.view.minutes.dispatch('change'); await m.h.flush(); m.h.failWrite(false);
            m.view.retry.dispatch('click'); await m.h.flush();
        }
        assert.equal(m.view.minutes.value, '30'); assert.equal(m.view.start.disabled, true); assert.equal(m.view.saveMinutes.hidden, false);
        const writes = m.h.writes; m.view.start.dispatch('click'); await m.h.flush();
        assert.equal(m.h.writes, writes); assert.equal(m.c.snapshot().session.status, 'ready');
        m.view.saveMinutes.dispatch('click'); await m.h.flush();
        assert.equal(m.c.snapshot().durations.focus, 30); assert.equal(m.c.snapshot().session.status, 'ready');
        assert.equal(m.view.saveMinutes.hidden, true); assert.equal(m.view.start.disabled, false); m.guarded(false);
        m.view.start.dispatch('click'); await m.h.flush();
        assert.equal(m.c.snapshot().session.status, 'running'); assert.equal(m.c.snapshot().session.remainingMs, 30 * 60000); m.view.destroy();
    }
});

test('duration draft: Save minutes normalizes valid input and invalid input restores the saved duration', async () => {
    const m = model(); await m.ready(); assert.equal(m.view.saveMinutes.tagName, 'BUTTON'); assert.equal(m.view.saveMinutes.type, 'button');
    for (const value of ['030', '30.0', '3e1']) {
        m.type(value); assert.equal(m.view.start.disabled, true); m.view.saveMinutes.dispatch('click'); await m.h.flush();
        assert.equal(m.view.minutes.value, '30'); assert.equal(m.c.snapshot().durations.focus, 30);
        assert.equal(m.view.start.disabled, false); assert.equal(m.view.hasUncommittedWork(), false); m.guarded(false);
    }
    const writes = m.h.writes;
    for (const value of ['', '0', '181', '1.5']) {
        m.type(value); assert.equal(m.view.start.disabled, true); m.view.saveMinutes.dispatch('click'); await m.h.flush();
        assert.equal(m.view.minutes.value, '30'); assert.equal(m.view.start.disabled, false);
        assert.equal(m.view.feedback.textContent, 'Enter whole minutes from 1 to 180.'); m.guarded(false); assert.equal(m.h.writes, writes);
    }
    m.type('35'); m.type('30'); assert.equal(m.view.start.disabled, false); assert.equal(m.view.saveMinutes.hidden, true); m.view.destroy();
});

test('duration draft: Save minutes suppresses held activation, pending duplicates and stale phase clicks', async () => {
    const m = model(); await m.ready(); m.type('30');
    for (const key of ['Enter', ' ']) assert.equal(m.view.saveMinutes.dispatch('keydown', { key, repeat: true }).prevented, true);
    assert.equal(m.view.saveMinutes.dispatch('keydown', { key: 'Enter', repeat: false }).prevented, false);
    const gate = deferred(), backend = m.c.store.backend, write = backend.write;
    backend.write = async value => { await gate.promise; return write(value); };
    m.view.saveMinutes.dispatch('click'); m.view.saveMinutes.dispatch('click'); m.view.minutes.dispatch('change');
    assert(m.view.saveMinutes.disabled); assert(m.view.start.disabled); m.guarded(true); gate.resolve(); await m.h.flush();
    assert.equal(m.h.writes, 2, 'visibility plus one duration write'); m.guarded(false);
    m.type('45'); const other = m.h.controller(); await other.refresh(); await other.action('phase', 'break'); await m.h.flush();
    const writes = m.h.writes; assert.equal(m.view.saveMinutes.hidden, true);
    m.view.saveMinutes.dispatch('click'); await m.h.flush(); assert.equal(m.h.writes, writes, 'a hidden stale save action cannot commit the new phase');
    assert.equal(m.c.snapshot().durations.break, 5); other.destroy(); m.view.destroy();
});

test('duration draft: explicit keyboard Save restores Start only after confirmed success; blur autosave does not', async () => {
    for (const value of ['30', '030']) {
        const m = model(); await m.ready(); m.type(value); m.view.saveMinutes.focus();
        assert.equal(m.document.activeElement, m.view.saveMinutes); m.view.saveMinutes.dispatch('click');
        assert.equal(m.document.activeElement, m.document.body, 'pending native-disabled save loses focus');
        await m.h.flush(); assert.equal(m.document.activeElement, m.view.start); assert.equal(m.view.start.disabled, false);
        assert.equal(m.c.snapshot().session.status, 'ready'); m.view.destroy();
    }
    const m = model(); await m.ready(); m.type('30'); m.view.minutes.dispatch('change'); await m.h.flush();
    assert.notEqual(m.document.activeElement, m.view.start, 'ordinary input blur save never claims primary focus'); m.view.destroy();
});

test('duration draft: explicit Save cannot reclaim newer focus, remote revisions, errors or destroyed ownership', async () => {
    for (const change of ['focus', 'focus-away-back', 'pointer', 'tab', 'blur', 'hidden', 'detached', 'destroy', 'error', 'remote']) {
        const m = model(); await m.ready(); m.type('030'); const outside = m.document.createElement('button'); m.document.body.append(outside);
        const docEvents = new Map();
        m.document.addEventListener = (type, fn) => { if (!docEvents.has(type)) docEvents.set(type, new Set()); docEvents.get(type).add(fn); };
        m.document.removeEventListener = (type, fn) => docEvents.get(type)?.delete(fn);
        const gate = deferred(), backend = m.c.store.backend, write = backend.write;
        backend.write = async value => { await gate.promise; return write(value); };
        if (change === 'error') m.h.failWrite(true);
        if (change === 'remote') {
            const action = m.c.action.bind(m.c);
            m.c.action = (...args) => action(...args).then(saved => { m.c.accept({ ...saved, revision: saved.revision + 1 }); return saved; });
        }
        m.view.saveMinutes.focus(); m.view.saveMinutes.dispatch('click');
        const dispatch = (type, event) => { for (const fn of docEvents.get(type) || []) fn(event); };
        if (change === 'focus') outside.focus();
        if (change === 'focus-away-back') { outside.focus(); dispatch('focusin', { target: outside }); m.document.body.focus(); }
        if (change === 'pointer') dispatch('pointerdown', { target: m.document.body });
        if (change === 'tab') dispatch('keydown', { key: 'Tab', repeat: false });
        if (change === 'blur') for (const fn of m.events.get('blur') || []) fn({});
        if (change === 'hidden') m.document.hidden = true;
        if (change === 'detached') m.host.remove();
        if (change === 'destroy') m.view.destroy();
        gate.resolve(); await m.h.flush(); assert.notEqual(m.document.activeElement, m.view.start, change);
        for (const type of ['pointerdown', 'keydown', 'focusin']) assert.equal(docEvents.get(type)?.size || 0, 0, 'pending focus listeners are released');
        m.view.destroy();
    }
});

test('duration draft: a confirmed noncanonical value after an uncertain write does not strand Start', async () => {
    for (const value of ['030', '30.0', '3e1']) {
        const m = model(); await m.ready(); m.c.unsubscribe(); m.type(value); m.h.failAfterWrite(true);
        m.view.saveMinutes.dispatch('click'); await m.h.flush(); assert.equal(m.c.snapshot().durations.focus, 30); assert(m.c.error);
        const writes = m.h.writes; m.h.failAfterWrite(false); m.view.retry.dispatch('click'); await m.h.flush();
        assert.equal(m.c.error, null); assert.equal(m.view.minutes.value, '30'); assert.equal(m.view.hasUncommittedWork(), false);
        assert.equal(m.view.saveMinutes.hidden, true); assert.equal(m.view.start.disabled, false); assert.equal(m.h.writes, writes);
        m.guarded(false); m.view.destroy();
    }
});
