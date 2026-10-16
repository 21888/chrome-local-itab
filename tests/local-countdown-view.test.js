const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const storeApi = require('../shared/local-countdown-store');
const { Controller } = require('../shared/local-countdown-controller');
const configured = (extra = {}) => ({ ...storeApi.initial(), enabled: true, title: 'Launch', targetDate: '2026-10-11', revision: 1, ...extra });
function model({ raw: initial, failRead: initiallyFail = false, settings = false, translate } = {}) {
    // Model disabled/hidden focus loss explicitly; this is not native-browser acceptance.
    const document = createDocument({ blurUnavailableFocus: true }), events = new Map(), blobs = [], timers = new Map(), confirms = [], observers = [];
    let raw = initial, failRead = initiallyFail, failWrite = false, tail = Promise.resolve(), hold, writes = 0, timerId = 0, approve = true;
    let currentDate = new Date(2026, 9, 9, 12);
    const listeners = new Set(), backend = {
        lock(fn) { const p = tail.then(fn); tail = p.catch(() => {}); return p; },
        async read() { if (failRead) throw Error(); return structuredClone(raw); },
        async write(value) { if (hold) await hold; if (failWrite) throw Error(); raw = structuredClone(value); writes++; listeners.forEach(fn => fn()); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
    const api = { ...storeApi, Controller };
    const window = {
        LocalItabCountdown: api, Blob, TextDecoder, i18n: translate ? { t: translate } : undefined,
        URL: { createObjectURL(blob) { blobs.push(blob); return 'blob:test'; }, revokeObjectURL() {} },
        chrome: { runtime: { getURL(path) { return `chrome-extension://test/${path}`; } } },
        confirm(message) { confirms.push(message); return approve; },
        getComputedStyle(node) { for (let current = node; current; current = current.parentElement) if (current.style.visibility) return { visibility: current.style.visibility }; return { visibility: 'visible' }; },
        setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimeout(id) { timers.delete(id); },
        addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
        MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe() {} disconnect() { this.disconnected = true; } }
    };
    const create = document.createElement; document.createElement = tag => { const node = create(tag); node.click = () => node.dispatch('click'); return node; };
    vm.runInNewContext(fs.readFileSync(require.resolve('../shared/local-countdown-view'), 'utf8'), { window, document });
    const parent = document.createElement('div'), host = document.createElement(settings ? 'div' : 'article'); document.body.append(parent); parent.append(host);
    const controller = new Controller(new api.Store(backend));
    const visibility = [], view = settings ? api.mountSettings(host, { controller }) : api.mount(host, { controller, now: () => currentDate, onVisibility: visible => visibility.push(visible) });
    // Mirror countdown-status:empty and require explicit programmatic focusability
    // for this paragraph. The generic helper does not model stylesheet layout or
    // distinguish a paragraph's default tabIndex -1 from an explicit tabindex.
    const statusRects = view.status.getClientRects.bind(view.status), statusFocus = view.status.focus.bind(view.status);
    view.status.getClientRects = () => view.status.textContent ? statusRects() : [];
    view.status.focus = () => { if (Object.hasOwn(view.status, '_tabIndex')) statusFocus(); };
    return {
        window, document, host, parent, controller, view, api, events, blobs, backend, timers, confirms, observers, visibility,
        get raw() { return raw; }, get writes() { return writes; },
        readFail: v => failRead = v, writeFail: v => failWrite = v, hold: p => hold = p, approve: v => approve = v, now: date => currentDate = date,
        flush: () => new Promise(r => setTimeout(r, 20)),
        fire: type => { for (const fn of events.get(type) || []) fn(); },
        tick() { const entry = [...timers].find(([, timer]) => timer.delay === 60000); assert(entry); timers.delete(entry[0]); entry[1].fn(); },
        tickCount: () => [...timers.values()].filter(timer => timer.delay === 60000).length,
        input(field, value) { view[field].value = value; view[field].dispatch('input'); }
    };
}

test('DOM model: default Countdown is hidden and idle without any storage write', async () => {
    const m = model(); assert(m.host.hidden); await m.flush();
    assert(m.controller.loaded); assert(m.host.hidden); assert.equal(m.writes, 0); assert.equal(m.tickCount(), 0);
    assert.deepEqual(m.visibility, [false]); m.view.destroy();
});

test('DOM model: native labelled settings fields use explicit Save/Cancel and no browser date coercion', async () => {
    const m = model({ settings: true }); assert(m.view.title.disabled); await m.flush();
    assert.equal(m.view.title.tagName, 'TEXTAREA'); assert.equal(m.view.date.type, 'text'); assert.equal(m.view.enabled.type, 'checkbox');
    assert.equal(m.view.title.getAttribute('aria-label'), 'Milestone title (up to 80 characters)'); assert.match(m.view.date.getAttribute('aria-label'), /YYYY-MM-DD/);
    assert.equal(m.view.date.getAttribute('maxlength'), undefined); assert.equal(m.view.title.getAttribute('maxlength'), undefined);
    m.input('title', 'Release'); m.input('date', '2026-12-31'); m.view.enabled.checked = true; m.view.enabled.dispatch('change');
    assert.equal(m.writes, 0); assert(!m.view.saveButton.disabled); m.view.saveButton.dispatch('click'); await m.flush();
    assert.equal(m.raw.title, 'Release'); assert.equal(m.raw.targetDate, '2026-12-31'); assert.equal(m.raw.enabled, true);
    assert.equal(m.view.status.textContent, 'Saved on this device'); assert(m.view.saveButton.disabled);
    assert.equal(m.view.saveButton.type, 'button'); assert.equal(m.view.cancelButton.type, 'button'); m.view.destroy();
});

test('DOM model: calendar-day labels change without live announcements or replacing native focus', async () => {
    const m = model({ raw: configured({ title: '<img src=x onerror=alert(1)>' }) }); await m.flush();
    assert(!m.host.hidden); assert.equal(m.view.remaining.textContent, '2 days left'); assert.equal(m.view.title.textContent, '<img src=x onerror=alert(1)>');
    assert.equal(m.view.title.children.length, 0); assert.equal(m.view.remaining.getAttribute('aria-live'), 'off');
    assert.equal(m.view.status.textContent, ''); m.view.hideButton.focus();
    for (const [day, expected] of [[10, '1 day left'], [11, 'Today'], [12, '1 day ago'], [13, '2 days ago']]) {
        m.now(new Date(2026, 9, day, 23, 58)); m.tick(); assert.equal(m.view.remaining.textContent, expected);
        assert.equal(m.view.status.textContent, ''); assert.equal(m.document.activeElement, m.view.hideButton); assert.equal(m.tickCount(), 1);
    }
    m.view.destroy();
});

test('DOM model: day plural uses translated substitutions and singular/today translations', async () => {
    const m = model({ raw: configured(), translate: (key, values) => key === 'countdownDaysLeft' ? `Restan ${values[0]} días` : key === 'countdownToday' ? 'Hoy' : key });
    await m.flush(); assert.equal(m.view.remaining.textContent, 'Restan 2 días'); m.now(new Date(2026, 9, 11)); m.fire('focus'); assert.equal(m.view.remaining.textContent, 'Hoy'); m.view.destroy();
});

test('DOM model: one bounded timer stops while hidden/pagehidden, refreshes on resume/focus and is cleaned up', async () => {
    const m = model({ raw: configured() }); await m.flush(); assert.equal(m.tickCount(), 1);
    m.view.render(); m.view.render(); assert.equal(m.tickCount(), 1);
    m.document.hidden = true; m.document.listeners.get('visibilitychange')(); assert.equal(m.tickCount(), 0);
    m.now(new Date(2026, 9, 11)); m.document.hidden = false; m.document.listeners.get('visibilitychange')(); assert.equal(m.tickCount(), 1); assert.equal(m.view.remaining.textContent, 'Today');
    m.parent.hidden = true; m.observers[0].fn(); assert.equal(m.tickCount(), 0);
    m.parent.hidden = false; m.observers[0].fn(); assert.equal(m.tickCount(), 1);
    m.fire('pagehide'); assert.equal(m.tickCount(), 0); m.fire('focus'); assert.equal(m.tickCount(), 0);
    m.fire('pageshow'); assert.equal(m.tickCount(), 1);
    m.view.destroy(); assert.equal(m.tickCount(), 0); assert(m.observers[0].disconnected); assert.equal(m.events.get('focus').size, 0);
    assert(!m.document.listeners.has('visibilitychange')); m.view.render(); assert.equal(m.tickCount(), 0);
});

test('DOM model: dashboard Hide preserves data, exports saved plaintext and Edit targets its Settings section', async () => {
    const m = model({ raw: configured() }); await m.flush();
    assert.equal(m.view.edit.tagName, 'A'); assert.equal(m.view.edit.href, 'chrome-extension://test/options.html#countdown-settings'); assert.equal(m.view.edit.rel, 'noopener');
    m.view.exportButton.dispatch('click'); assert.equal(await m.blobs[0].text(), 'Launch\n2026-10-11\n'); assert.equal(m.blobs[0].type, 'text/plain;charset=utf-8');
    m.view.hideButton.dispatch('click'); await m.flush(); assert(m.host.hidden); assert.equal(m.raw.enabled, false);
    assert.equal(m.raw.title, 'Launch'); assert.equal(m.raw.targetDate, '2026-10-11'); assert.equal(m.tickCount(), 0); m.view.destroy();
});

test('DOM model: newer Settings input remains enabled and focused during Save and survives its completion', async () => {
    const m = model({ raw: configured(), settings: true }); await m.flush(); m.input('title', 'First');
    let release; m.hold(new Promise(done => release = done)); m.view.saveButton.dispatch('click'); await m.flush(); assert(m.controller.pending);
    assert(!m.view.title.disabled); assert(!m.view.date.disabled); assert(!m.view.enabled.disabled); assert(m.view.saveButton.disabled);
    m.view.title.focus(); m.input('title', 'Newer'); release(); m.hold(null); await m.flush();
    assert.equal(m.raw.title, 'First'); assert.equal(m.view.title.value, 'Newer'); assert.equal(m.controller.draft.title, 'Newer');
    assert.equal(m.document.activeElement, m.view.title); assert.match(m.view.status.textContent, /Unsaved/);
    m.view.saveButton.dispatch('click'); await m.flush(); assert.equal(m.raw.title, 'Newer'); m.view.destroy();
});

test('DOM model: strict invalid-date feedback preserves failed draft, allows export and accepts correction', async () => {
    const m = model({ raw: configured(), settings: true }); await m.flush(); m.input('date', '2026-02-30');
    m.view.saveButton.dispatch('click'); await m.flush(); assert.equal(m.view.date.value, '2026-02-30'); assert.equal(m.raw.targetDate, '2026-10-11');
    assert.match(m.view.status.textContent, /real date/); assert(m.view.retry.hidden); assert(!m.view.date.disabled);
    m.view.exportButton.dispatch('click'); assert.equal(await m.blobs[0].text(), 'Launch\n2026-02-30\n');
    m.input('date', '2028-02-29'); m.view.saveButton.dispatch('click'); await m.flush(); assert.equal(m.raw.targetDate, '2028-02-29'); m.view.destroy();
});

test('DOM model: failed initial read stays distinct from empty state; Retry loads without writes', async () => {
    const m = model({ settings: true, failRead: true }); await m.flush();
    assert(m.view.title.disabled); assert(!m.view.retry.hidden); assert.match(m.view.status.textContent, /Could not load/); assert.equal(m.writes, 0);
    m.readFail(false); m.view.retry.dispatch('click'); await m.flush(); assert(!m.view.title.disabled); assert(m.view.retry.hidden); assert.equal(m.writes, 0); m.view.destroy();
});

test('DOM model: failed save keeps draft exportable and Retry confirms it', async () => {
    const m = model({ settings: true, raw: configured() }); await m.flush(); m.writeFail(true); m.input('title', 'Draft recovery');
    m.view.saveButton.dispatch('click'); await m.flush(); assert(!m.view.retry.hidden); assert(m.view.hasUncommittedWork()); assert.equal(m.view.title.value, 'Draft recovery');
    m.view.exportButton.dispatch('click'); assert.equal(await m.blobs[0].text(), 'Draft recovery\n2026-10-11\n');
    m.writeFail(false); m.view.retry.dispatch('click'); await m.flush(); assert.equal(m.raw.title, 'Draft recovery'); assert(!m.view.hasUncommittedWork()); m.view.destroy();
});

test('DOM model: conflict shows saved preview; Load saved and Replace require deliberate confirmation', async () => {
    const m = model({ settings: true, raw: configured() }); await m.flush(); m.input('title', 'My draft');
    await new m.api.Store(m.backend).mutate({ kind: 'save', value: { enabled: true, title: 'Other page', targetDate: '2027-01-01' }, revision: m.raw.revision }); await m.flush();
    assert(m.controller.conflict); assert(!m.view.savedPreview.hidden); assert.match(m.view.savedPreview.textContent, /Other page/); assert.equal(m.view.title.value, 'My draft');
    m.approve(false); m.view.useSaved.dispatch('click'); await m.flush(); assert.equal(m.view.title.value, 'My draft'); assert.match(m.confirms.at(-1), /Discard/);
    m.view.replace.dispatch('click'); await m.flush(); assert.equal(m.raw.title, 'Other page'); assert.match(m.confirms.at(-1), /Replace/);
    m.approve(true); m.view.replace.dispatch('click'); await m.flush(); assert.equal(m.raw.title, 'My draft'); assert.equal(m.raw.targetDate, '2026-10-11'); assert(m.view.savedPreview.hidden);
    m.input('title', 'Discard me'); m.view.cancelButton.dispatch('click'); await m.flush(); assert.equal(m.view.title.value, 'My draft'); assert(!m.view.hasUncommittedWork()); m.view.destroy();
});

test('DOM model: composition prevents Save and preserves the current DOM draft for export', async () => {
    const m = model({ settings: true, raw: configured() }); await m.flush(); m.view.title.dispatch('compositionstart');
    m.view.title.value = '里程碑 🎉'; m.view.title.dispatch('input'); assert(m.view.saveButton.disabled);
    m.view.title.value = '里程碑 完成 🎉'; m.view.exportButton.dispatch('click'); assert.equal(await m.blobs[0].text(), '里程碑 完成 🎉\n2026-10-11\n');
    m.view.title.dispatch('compositionend'); assert.equal(m.controller.draft.title, '里程碑 完成 🎉'); assert(!m.view.saveButton.disabled);
    m.view.saveButton.dispatch('click'); await m.flush(); assert.equal(m.raw.title, '里程碑 完成 🎉'); m.view.destroy();
});

test('DOM model: long drafts export exactly; invalid Unicode export fails visibly without losing the draft', async () => {
    const m = model({ settings: true, raw: configured() }); await m.flush(); const long = '😀'.repeat(81); m.input('title', long);
    m.view.saveButton.dispatch('click'); await m.flush(); assert.match(m.view.status.textContent, /too long/);
    m.view.exportButton.dispatch('click'); assert.equal(await m.blobs[0].text(), `${long}\n2026-10-11\n`);
    m.input('title', 'a\uD800b'); m.view.exportButton.dispatch('click'); assert.equal(m.blobs.length, 1); assert.equal(m.view.title.value, 'a\uD800b'); assert.match(m.view.status.textContent, /invalid Unicode/); m.view.destroy();
});

test('source boundary: Countdown UI uses semantic theme tokens, wrapping and native text without network', () => {
    const css = fs.readFileSync(require.resolve('../local-countdown.css'), 'utf8'), source = fs.readFileSync(require.resolve('../shared/local-countdown-view'), 'utf8');
    for (const token of ['--template-border', '--template-text', '--template-surface', '--template-muted', '--template-surface-raised', '--template-accent', '--template-focus', '--template-error']) assert(css.includes(token), token);
    assert.match(css, /overflow-wrap: anywhere/); assert.match(css, /flex-wrap: wrap/); assert.match(css, /minmax\(0, 1fr\)/); assert.match(css, /:focus-visible/);
    assert.doesNotMatch(source, /innerHTML|fetch\(|XMLHttpRequest|storage\.sync|chrome\.tabs|navigator\.sendBeacon/);
    assert.doesNotMatch(source, /setInterval/); assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i);
});

test('DOM model: failed dashboard Hide remains visible with a safe Retry, and remote visibility stops its timer', async () => {
    const m = model({ raw: configured() }); await m.flush(); m.writeFail(true); m.view.hideButton.dispatch('click'); await m.flush();
    assert(!m.host.hidden); assert(!m.view.retry.hidden); assert(m.view.hideButton.disabled); assert.equal(m.raw.enabled, true); assert(m.view.hasUncommittedWork());
    m.writeFail(false); m.view.retry.dispatch('click'); await m.flush(); assert(m.host.hidden); assert.equal(m.raw.title, 'Launch'); assert.equal(m.tickCount(), 0);
    await new m.api.Store(m.backend).mutate({ kind: 'visibility', value: true, revision: m.raw.revision }); await m.flush(); assert(!m.host.hidden); assert.equal(m.tickCount(), 1);
    await new m.api.Store(m.backend).mutate({ kind: 'visibility', value: false, revision: m.raw.revision }); await m.flush(); assert(m.host.hidden); assert.equal(m.tickCount(), 0); m.view.destroy();
});

test('DOM model: conflict plus unreadable storage retains editable text and Retry while blocking replacement', async () => {
    const m = model({ raw: configured(), settings: true }); await m.flush(); m.input('title', 'Preserve me');
    await new m.api.Store(m.backend).mutate({ kind: 'visibility', value: false, revision: m.raw.revision }); await m.flush(); assert(m.controller.conflict);
    m.readFail(true); await assert.rejects(m.controller.refresh()); assert(!m.view.retry.hidden); assert(m.view.replace.disabled); assert(!m.view.title.disabled);
    m.input('title', 'Preserve newer'); assert.equal(m.view.title.value, 'Preserve newer'); m.view.exportText(); assert.equal(await m.blobs[0].text(), 'Preserve newer\n2026-10-11\n');
    m.readFail(false); m.view.retry.dispatch('click'); await m.flush(); assert.equal(m.view.title.value, 'Preserve newer'); assert(m.controller.conflict); assert(!m.view.replace.disabled); m.view.destroy();
});

test('DOM model: edits made while Cancel reads saved values retain their generation', async () => {
    const m = model({ raw: configured(), settings: true }); await m.flush(); m.input('title', 'Discard old');
    const originalRead = m.backend.read; let release, block = new Promise(done => release = done); m.backend.read = async () => { await block; return originalRead(); };
    m.view.cancelButton.dispatch('click'); await m.flush(); assert(m.controller.pending); assert(!m.view.title.disabled);
    m.input('title', 'Keep newest'); release(); await m.flush(); assert.equal(m.view.title.value, 'Keep newest'); assert.equal(m.controller.draft.title, 'Keep newest'); assert(m.controller.conflict); m.view.destroy();
});

test('DOM model: oversized recovery export reports its own limit and never truncates text', async () => {
    const m = model({ raw: configured(), settings: true }); await m.flush(); const long = 'x'.repeat(32001); m.input('title', long);
    m.view.exportText(); assert.equal(m.blobs.length, 0); assert.equal(m.view.title.value, long); assert.match(m.view.status.textContent, /too large to export/); m.view.destroy();
});

test('DOM model: conflicted Hide stays recoverable after another page disables the saved card', async () => {
    const m = model({ raw: configured() }); await m.flush(); m.writeFail(true); m.view.hideButton.dispatch('click'); await m.flush();
    m.writeFail(false); await new m.api.Store(m.backend).mutate({ kind: 'visibility', value: false, revision: m.raw.revision }); await m.flush();
    assert(m.controller.conflict); assert(!m.host.hidden); assert(!m.view.useSaved.hidden); assert.equal(m.tickCount(), 0); assert.match(m.view.status.textContent, /Load saved before choosing Hide/);
    m.view.useSaved.dispatch('click'); await m.flush(); assert(m.host.hidden); assert(!m.view.hasUncommittedWork()); m.view.destroy();
});

test('DOM model: committed Hide with failed acknowledgement remains recoverable until Retry verifies it', async () => {
    const m = model({ raw: configured() }); await m.flush(); const originalWrite = m.backend.write;
    m.backend.write = async value => { await originalWrite(value); throw Error('acknowledgement lost'); };
    m.view.hideButton.dispatch('click'); await m.flush();
    assert.equal(m.raw.enabled, false); assert.equal(m.controller.state.enabled, false); assert(m.controller.error); assert(!m.host.hidden); assert.equal(m.tickCount(), 0);
    // A conflict can accompany the failed acknowledgement because its change event
    // refreshed the saved disabled state. Retry must verify rather than write again.
    assert(!m.view.retry.hidden); m.view.retry.dispatch('click'); await m.flush(); assert(m.host.hidden); assert(!m.view.hasUncommittedWork()); assert.equal(m.writes, 1); m.view.destroy();
});


test('DOM model: intentionally hidden configured card stays hidden through background read failure and Retry', async () => {
    const m = model({raw:configured({enabled:false})}); await m.flush();
    assert(m.host.hidden); assert.equal(m.controller.lastAttempt,null);
    m.readFail(true); await assert.rejects(m.controller.refresh());
    assert(m.controller.readError); assert(m.host.hidden); assert.equal(m.tickCount(),0);
    m.fire('focus'); m.document.hidden=false; m.document.listeners.get('visibilitychange')();
    assert(m.host.hidden); assert.equal(m.tickCount(),0);
    m.readFail(false); const originalRead=m.backend.read; let release;
    const gate=new Promise(resolve=>{release=resolve}); m.backend.read=async()=>{await gate;return originalRead()};
    const retry=m.controller.retry(); assert(m.controller.pending); assert(m.host.hidden);
    release(); await retry; assert(m.host.hidden); assert.equal(m.tickCount(),0); assert(!m.controller.error); m.view.destroy();
});

test('DOM model: clean remote Hide does not acquire recovery visibility on a later failed read', async () => {
    const m=model({raw:configured()});await m.flush();assert(!m.host.hidden);
    await new m.api.Store(m.backend).mutate({kind:'visibility',value:false,revision:m.raw.revision});await m.flush();
    assert(m.host.hidden);assert.equal(m.controller.lastAttempt,null);
    m.readFail(true);await assert.rejects(m.controller.refresh());
    assert(m.host.hidden);assert.equal(m.tickCount(),0);assert.equal(m.writes,1);m.view.destroy();
});

function importFile(text, name = 'countdown.txt') {
    const bytes = new TextEncoder().encode(text);
    return { name, size: bytes.byteLength, arrayBuffer: async () => bytes.buffer };
}
async function previewImport(m, file) {
    m.view.chooseImport(); m.view.importFile.files = [file]; await m.view.readImport();
}

test('Countdown TXT import previews literal multiline text, applies draft only and keeps explicit Save validation', async () => {
    const m = model({ raw: configured({ enabled: false }), settings: true }); await m.flush();
    const title = '里程碑 🎉\n<img src=x onerror=alert(1)>\n';
    await previewImport(m, importFile(storeApi.exportText({ title, targetDate: '2028-02-29' })));
    assert.equal(m.view.importPreview.children.length, 0); assert.equal(m.view.importPreview.textContent, `${title}\n2028-02-29\n`);
    assert.equal(m.controller.draft.title, 'Launch'); assert.equal(m.writes, 0);
    m.view.importApply.dispatch('click'); assert.equal(m.controller.draft.title, title); assert.equal(m.view.title.value, title);
    assert.equal(m.controller.draft.enabled, false); assert.equal(m.raw.title, 'Launch'); assert.equal(m.writes, 0);
    assert(m.view.importPanel.hidden); assert.equal(m.document.activeElement, m.view.title);
    m.view.saveButton.dispatch('click'); await m.flush(); assert.equal(m.writes, 0); assert.match(m.view.status.textContent, /plain-text title/);
    m.input('title', '里程碑 🎉'); m.view.saveButton.dispatch('click'); await m.flush();
    assert.equal(m.raw.title, '里程碑 🎉'); assert.equal(m.raw.targetDate, '2028-02-29'); assert.equal(m.raw.enabled, false); assert.equal(m.writes, 1); m.view.destroy();
});

test('Countdown TXT import Cancel, Escape and native picker cancellation leave draft and storage untouched', async () => {
    const m = model({ raw: configured(), settings: true }); await m.flush(); m.input('title', 'Existing unsaved');
    for (const action of ['cancel', 'escape', 'picker']) {
        await previewImport(m, importFile('Imported\n2028-02-29\n'));
        if (action === 'cancel') m.view.importCancel.dispatch('click');
        else if (action === 'escape') m.view.importPanel.dispatch('keydown', { key: 'Escape' });
        else m.view.importFile.dispatch('cancel');
        assert(m.view.importPanel.hidden); assert.equal(m.controller.draft.title, 'Existing unsaved'); assert.equal(m.writes, 0);
    }
    m.view.destroy();
});

test('Countdown TXT import rejects malformed, oversized and invalid UTF-8 files, supports choosing the same file again after failure', async () => {
    const m = model({ raw: configured(), settings: true }); await m.flush();
    const badBytes = new Uint8Array([0xc3, 0x28]);
    for (const file of [importFile('Title\n\n'), importFile('Title\n2026-02-29\n'), importFile('Title\n2028-02-29'), importFile('x'.repeat(32001)), importFile('Title\n2028-02-29\n', 'bad.html'),
        { name: 'bad.txt', size: 2, arrayBuffer: async () => badBytes.buffer },
        { name: 'bad.txt', size: 131073, arrayBuffer: async () => { throw Error('must not read'); } },
        { name: 'retry.txt', size: 1, arrayBuffer: async () => { throw Error('read failed'); } }]) {
        await previewImport(m, file); assert(m.view.importApply.disabled); assert.match(m.view.importInfo.textContent, /Could not read/);
        assert.equal(m.controller.draft.title, 'Launch'); assert.equal(m.writes, 0); assert.equal(m.view.importFile.value, '');
    }
    await previewImport(m, importFile('Recovered\n2028-02-29\n', 'retry.txt')); assert(!m.view.importApply.disabled);
    m.view.importApply.dispatch('click'); assert.equal(m.controller.draft.title, 'Recovered'); assert.equal(m.writes, 0); m.view.destroy();
});

test('Countdown TXT import delayed reads cannot overwrite edits, IME, Cancel, another file, departure or destroyed view', async () => {
    for (const action of ['edit', 'ime', 'cancel', 'another', 'pagehide', 'detach', 'destroy']) {
        const m = model({ raw: configured(), settings: true }); await m.flush();
        let release; const file = importFile('Stale\n2028-02-29\n'), bytes = await file.arrayBuffer(); file.arrayBuffer = () => new Promise(done => release = done);
        m.view.chooseImport(); m.view.importFile.files = [file]; const pending = m.view.readImport();
        if (action === 'edit') m.input('title', 'Newer');
        if (action === 'ime') { m.view.title.dispatch('compositionstart'); m.view.title.value = '输入'; }
        if (action === 'cancel') m.view.importCancel.dispatch('click');
        if (action === 'another') await previewImport(m, importFile('New file\n2029-01-01\n'));
        if (action === 'pagehide') m.fire('pagehide');
        if (action === 'detach') m.host.remove();
        if (action === 'destroy') m.view.destroy();
        release(bytes); await pending;
        assert.notEqual(m.controller.draft.title, 'Stale'); assert(!m.view.importPreview.textContent.includes('Stale')); assert.equal(m.writes, 0);
        if (action === 'another') { assert.match(m.view.importPreview.textContent, /New file/); m.view.importApply.dispatch('click'); assert.equal(m.controller.draft.title, 'New file'); }
        if (action === 'edit') assert.equal(m.controller.draft.title, 'Newer');
        if (action === 'ime') { assert.equal(m.view.title.value, '输入'); m.view.title.dispatch('compositionend'); }
        if (action !== 'destroy') m.view.destroy();
    }
});

test('Countdown TXT import invalidates reviewed preview on newer edits, remote updates, visibility changes and storage failures', async () => {
    for (const action of ['edit', 'visibility', 'remote', 'readfail', 'save']) {
        const m = model({ raw: configured(), settings: true }); await m.flush(); m.input('title', 'My draft');
        await previewImport(m, importFile('Imported\n2028-02-29\n'));
        if (action === 'edit') m.input('date', '2030-01-01');
        if (action === 'visibility') { m.view.enabled.checked = false; m.view.enabled.dispatch('change'); }
        if (action === 'remote') { await new m.api.Store(m.backend).mutate({ kind: 'visibility', value: false, revision: m.raw.revision }); await m.flush(); assert(m.controller.conflict); }
        if (action === 'readfail') { m.readFail(true); await assert.rejects(m.controller.refresh()); }
        if (action === 'save') { m.view.saveButton.dispatch('click'); await m.flush(); }
        assert(m.view.importPanel.hidden); m.view.importApply.dispatch('click'); assert.equal(m.controller.draft.title, 'My draft');
        if (action === 'readfail') { assert(m.view.importButton.disabled); m.readFail(false); await m.controller.retry(); assert(!m.view.importButton.disabled); }
        m.view.destroy();
    }
});


// Real controllers/storage drive these focus cases. The DOM model moves focus
// to body when the active control becomes disabled/hidden, unlike a stale-node
// model that continues dispatching keys to an unusable button.
const settingsActions = [
    { button: 'saveButton', method: 'save', writes: 1, confirms: 0 },
    { button: 'cancelButton', method: 'useSaved', writes: 0, confirms: 1 },
    { button: 'useSaved', method: 'useSaved', writes: 0, confirms: 1 },
    { button: 'replace', method: 'replaceWithDraft', writes: 1, confirms: 1 },
    { button: 'retry', method: 'retry', writes: 1, confirms: 0 }
];
async function actionModel(action) {
    const m = model({ raw: configured(), settings: true }); await m.flush(); m.input('title', 'Submitted draft');
    if (['useSaved', 'replace'].includes(action.button)) {
        await new m.api.Store(m.backend).mutate({ kind: 'save', value: { enabled: true, title: 'Other page', targetDate: '2027-01-01' }, revision: m.raw.revision });
        await m.flush(); assert(m.controller.conflict);
    }
    if (action.button === 'retry') {
        m.writeFail(true); m.view.saveButton.dispatch('click'); await m.flush(); m.writeFail(false);
        assert(m.controller.lastAttempt); assert(!m.view.retry.hidden);
    }
    return m;
}
function pauseReads(m) {
    const read = m.backend.read; let release;
    const gate = new Promise(resolve => { release = resolve; });
    m.backend.read = async () => { await gate; return read(); };
    return release;
}
function countStatusFocus(m) {
    let count = 0; const focus = m.view.status.focus.bind(m.view.status);
    m.view.status.focus = () => { count++; focus(); };
    return () => count;
}
for (const action of settingsActions) {
    for (const fail of [false, true]) test(`Settings action focus: ${action.button} transfers synchronous disabled focus once (${fail ? 'failure' : 'success'})`, async () => {
        const m = await actionModel(action), release = pauseReads(m), initialWrites = m.writes, focused = countStatusFocus(m);
        let calls = 0; const original = m.controller[action.method];
        m.controller[action.method] = function (...args) { calls++; return original.apply(this, args); };
        if (fail) m.readFail(true);
        const button = m.view[action.button]; button.focus(); assert(m.document.activeElement === button, 'focus remains with the expected owner');
        button.dispatch('click');
        assert(m.controller.pending); assert(button.disabled); assert(m.document.activeElement === m.view.status, 'focus remains with the expected owner');
        assert.equal(m.view.status.tabIndex, -1); assert(m.view.status.textContent); assert(m.view.status.getClientRects().length);
        assert.equal(focused(), 1); assert.equal(calls, 1); assert.equal(m.confirms.length, action.confirms);
        release(); await m.flush();
        assert(!m.controller.pending); assert(m.document.activeElement === m.view.status, 'focus remains with the expected owner'); assert.equal(focused(), 1);
        assert.equal(m.writes, initialWrites + (fail ? 0 : action.writes)); assert.equal(calls, 1);
        assert.equal(m.controller.draft.title, !fail && action.button === 'cancelButton' ? 'Launch' : !fail && action.button === 'useSaved' ? 'Other page' : 'Submitted draft');
        if (fail) assert(m.controller.error); m.view.destroy();
    });
    test(`Settings action focus: ${action.button} never takes an existing input or outside focus`, async () => {
        for (const location of ['input', 'outside']) {
            const m = await actionModel(action), release = pauseReads(m), focused = countStatusFocus(m);
            const target = location === 'input' ? m.view.date : m.document.createElement('button');
            if (location === 'outside') m.document.body.append(target); target.focus();
            m.view[action.button].dispatch('click'); assert(m.document.activeElement === target, 'focus remains with the expected owner'); assert.equal(focused(), 0);
            release(); await m.flush(); assert(m.document.activeElement === target, 'focus remains with the expected owner'); assert.equal(focused(), 0); m.view.destroy();
        }
    });
    test(`Settings action focus: ${action.button} settlement preserves newer input, external focus and submitted snapshot`, async () => {
        for (const location of ['input', 'outside', 'body']) {
            const m = await actionModel(action), release = pauseReads(m), initialWrites = m.writes, focused = countStatusFocus(m);
            m.view[action.button].focus(); m.view[action.button].dispatch('click'); assert(m.document.activeElement === m.view.status, 'focus remains with the expected owner');
            m.view.date.focus(); m.input('date', '2030-'); m.input('title', 'Newer draft');
            const target = location === 'input' ? m.view.date : location === 'body' ? m.document.body : m.document.createElement('button');
            if (location === 'outside') m.document.body.append(target); target.focus();
            release(); await m.flush(); assert(m.document.activeElement === target, 'focus remains with the expected owner'); assert.equal(focused(), 1);
            assert.equal(m.controller.draft.title, 'Newer draft'); assert.equal(m.controller.draft.targetDate, '2030-');
            assert.equal(m.writes, initialWrites + action.writes);
            if (action.writes) { assert.equal(m.raw.title, 'Submitted draft'); assert.equal(m.raw.targetDate, '2026-10-11'); }
            else assert(m.controller.conflict); m.view.destroy();
        }
    });
}
for (const name of ['cancelButton', 'useSaved', 'replace']) test(`Settings action focus: declined ${name} retains exact draft, focused button and confirmation count`, async () => {
    const m = await actionModel(settingsActions.find(action => action.button === name)), initialWrites = m.writes, focused = countStatusFocus(m);
    m.input('date', '2030-'); const draft = { ...m.controller.draft }; m.approve(false);
    m.view[name].focus(); m.view[name].dispatch('click'); await m.flush();
    assert(m.document.activeElement === m.view[name], 'focus remains with the expected owner'); assert.equal(focused(), 0); assert.equal(m.confirms.length, 1);
    assert.deepEqual(m.controller.draft, draft); assert.equal(m.writes, initialWrites); assert(!m.controller.pending); m.view.destroy();
});
test('Settings action focus: validation render completes before status focus and preserves the invalid draft', async () => {
    const m = await actionModel(settingsActions[0]), focused = countStatusFocus(m); m.input('date', '2026-02-30');
    m.view.saveButton.focus(); m.view.saveButton.dispatch('click');
    assert(m.document.activeElement === m.view.status, 'focus remains with the expected owner'); assert.match(m.view.status.textContent, /real date/);
    assert(!m.controller.pending); assert.equal(m.writes, 0); await m.flush(); assert.equal(focused(), 1);
    assert.equal(m.controller.draft.targetDate, '2026-02-30'); m.view.destroy();
});
test('Settings action focus: no-op actions, synchronous throws and rejected promises retain old run safety', async () => {
    for (const action of settingsActions) for (const outcome of ['noop', 'throw', 'reject', 'render-throw']) {
        const m = await actionModel(action), initialWrites = m.writes, focused = countStatusFocus(m); let calls = 0;
        m.controller[action.method] = () => {
            calls++;
            if (outcome === 'render-throw') { m.controller.pending = true; m.controller.emit(); }
            if (outcome === 'throw' || outcome === 'render-throw') throw Error('synthetic synchronous failure');
            if (outcome === 'reject') return Promise.reject(Error('synthetic rejection'));
        };
        m.view[action.button].focus(); assert.doesNotThrow(() => m.view[action.button].dispatch('click'));
        await m.flush(); assert.equal(calls, 1); assert.equal(m.writes, initialWrites); assert.equal(m.confirms.length, action.confirms);
        assert(m.document.activeElement === (outcome === 'render-throw' ? m.view.status : m.view[action.button]), 'focus remains with the expected owner');
        assert.equal(focused(), outcome === 'render-throw' ? 1 : 0); m.controller.pending = false; m.view.destroy();
    }
});
test('Settings action focus: the initial-load Retry keeps its inherited asynchronous behavior', async () => {
    const m = model({ settings: true, failRead: true }); await m.flush(); const focused = countStatusFocus(m), release = pauseReads(m);
    m.readFail(false); m.view.retry.focus(); m.view.retry.dispatch('click');
    assert(!m.controller.loaded); assert(!m.controller.pending); assert(!m.view.retry.disabled);
    assert(m.document.activeElement === m.view.retry, 'focus remains with the expected owner'); assert.equal(focused(), 0);
    release(); await m.flush(); assert(m.controller.loaded); assert(m.view.retry.hidden);
    // Initial load has no synchronous pending render. Its later hidden-button
    // focus loss is outside this fix; never add an asynchronous focus callback.
    assert(m.document.activeElement === m.document.body, 'focus remains with the expected owner'); assert.equal(focused(), 0); assert.equal(m.writes, 0); m.view.destroy();
});
test('Settings action focus: hidden, detached, inert or destroyed settings cannot receive status focus', async () => {
    for (const phase of ['before', 'during']) for (const boundary of ['document', 'visibilityState', 'ancestor', 'display', 'visibility', 'collapse', 'inert', 'detached', 'destroyed', 'remounted']) {
        const m = await actionModel(settingsActions[0]), release = pauseReads(m), focused = countStatusFocus(m);
        const leave = () => {
            if (boundary === 'document') m.document.hidden = true;
            if (boundary === 'visibilityState') m.document.visibilityState = 'hidden';
            if (boundary === 'ancestor') m.parent.hidden = true;
            if (boundary === 'display') m.parent.style.display = 'none';
            if (boundary === 'visibility') m.parent.style.visibility = 'hidden';
            if (boundary === 'collapse') m.parent.style.visibility = 'collapse';
            if (boundary === 'inert') m.parent.inert = true;
            if (boundary === 'detached') m.host.remove();
            if (boundary === 'destroyed') m.view.destroy();
            if (boundary === 'remounted') { m.view.destroy(); m.replacement = m.api.mountSettings(m.host, { controller: new Controller(new m.api.Store(m.backend)) }); }
        };
        m.view.saveButton.focus();
        let unsubscribe;
        if (phase === 'before') leave();
        else unsubscribe = m.controller.subscribe(() => { unsubscribe(); leave(); });
        m.view.saveButton.dispatch('click'); assert.equal(focused(), 0); release(); await m.flush(); assert.equal(focused(), 0);
        m.replacement?.destroy(); if (!m.view.closed) m.view.destroy();
    }
});
test('Settings action focus: settlement never refocuses hidden, removed, destroyed or remounted settings', async () => {
    for (const boundary of ['hidden', 'removed', 'destroyed', 'remounted']) {
        const m = await actionModel(settingsActions[0]), release = pauseReads(m), focused = countStatusFocus(m);
        m.view.saveButton.focus(); m.view.saveButton.dispatch('click'); assert.equal(focused(), 1);
        if (boundary === 'hidden') m.parent.hidden = true;
        if (boundary === 'removed') m.host.remove();
        if (boundary === 'destroyed' || boundary === 'remounted') m.view.destroy();
        if (boundary === 'remounted') { m.replacement = m.api.mountSettings(m.host, { controller: new Controller(new m.api.Store(m.backend)) }); m.replacement.status.focus(); }
        const active = m.document.activeElement; release(); await m.flush();
        assert(m.document.activeElement === active, 'focus remains with the expected owner'); assert.equal(focused(), 1);
        m.replacement?.destroy(); if (!m.view.closed) m.view.destroy();
    }
});

test('Settings action focus: synchronous render redirects, empty status and usable source never acquire focus', async () => {
    for (const outcome of ['redirect', 'empty', 'usable-body', 'retained']) {
        const m = await actionModel(settingsActions[0]), focused = countStatusFocus(m);
        m.controller.save = () => {
            if (outcome === 'usable-body') { m.document.body.focus(); return; }
            if (outcome === 'retained') return;
            m.controller.pending = true; m.controller.emit();
            if (outcome === 'redirect') m.view.date.focus();
            else m.view.status.textContent = '';
        };
        m.view.saveButton.focus(); m.view.saveButton.dispatch('click'); await m.flush();
        assert.equal(focused(), 0);
        const target = outcome === 'redirect' ? m.view.date : outcome === 'retained' ? m.view.saveButton : m.document.body;
        assert(m.document.activeElement === target, 'do not infer lost-button ownership from body alone');
        assert.equal(m.writes, 0); m.controller.pending = false; m.view.destroy();
    }
});
