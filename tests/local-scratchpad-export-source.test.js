const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { createDocument, deferred } = require('./helpers/task-dom-model');
const api = require('../shared/local-scratchpad-store');
const { Controller } = require('../shared/local-scratchpad-controller');
const tick = () => new Promise(resolve => setImmediate(resolve));
const EXACT = '\uFEFF \tOriginal 中文 😀 e\u0301\r\n<script>literal</script>\rEnd\n\n';
const DRAFT = '\uFEFF Unsaved 中文 🪷\r\n<draft>\rEnd\n';
// Public-field and synchronous callback substitutions are robustness probes.
// They are not normal workspace navigation or a historical data-loss claim.
async function model(t, options = {}) {
    const document = options.document || createDocument({ blurUnavailableFocus: true });
    const sources = [], effects = [], hooks = new Map(), blobs = [], links = [], urls = [], revoked = [], timers = [], clicks = [];
    const call = (name, ...args) => { const fn = hooks.get(name); if (fn) { hooks.delete(name); fn(...args); } };
    let queue = Promise.resolve(), raw = api.validate({ ...api.initial(), enabled: options.enabled !== false, revision: 4, content: EXACT });
    const subscriptions = new Set(), io = { reads: 0, writes: 0, mutations: 0, locks: 0, commits: 0 };
    const backend = {
        lock(fn) { io.locks++; const p = queue.then(fn); queue = p.catch(() => {}); return p; },
        async read() { io.reads++; if (backend.readGate) await backend.readGate.promise; if (backend.readError) throw Error('Synthetic read failure'); return structuredClone(raw); },
        async write(value) { io.writes++; if (backend.writeGate) { backend.writeEntered.resolve(); await backend.writeGate.promise; }
            if (backend.writeError) throw Error('Synthetic write failure'); raw = structuredClone(value); io.commits++;
            for (const fn of subscriptions) fn(); if (backend.ackError) throw Error('Synthetic lost acknowledgement'); },
        subscribe(fn) { subscriptions.add(fn); return () => subscriptions.delete(fn); }
    };
    if (options.workspace) backend.workspace = { id: 'original-workspace', generation: 'original-generation' };
    if (options.loading) backend.readGate = deferred();
    if (options.readError) backend.readError = true;
    const store = new api.Store(backend), mutate = store.mutate;
    store.mutate = function (...args) { io.mutations++; return mutate.apply(this, args); };
    const controller = new Controller(store, { delay: 60000 });
    const window = {
        LocalItabScratchpad: { ...api }, TextDecoder,
        Blob: class extends Blob { constructor(...args) { call('blob'); super(...args); blobs.push(this); } },
        URL: { createObjectURL(blob) { assert.equal(this, originalURL); call('url'); const url = 'blob:synthetic-' + urls.length; urls.push({ url, blob }); return url; },
            revokeObjectURL(url) { assert.equal(this, originalURL); revoked.push(url); call('revoke', url); } },
        setTimeout(fn, delay) { assert.equal(this, window); call('timer'); timers.push({ fn, delay }); return timers.length; },
        addEventListener() {}, removeEventListener() {},
        navigator: { clipboard: { writeText() { effects.push('clipboard write'); }, readText() { effects.push('clipboard read'); } },
            permissions: { query() { effects.push('permission'); } } },
        fetch() { effects.push('network'); }
    };
    if (options.workspace) window.LocalItabWorkspaces = { session: backend.workspace };
    const originalURL = window.URL;
    document.execCommand = () => effects.push('fallback');
    const create = document.createElement;
    document.createElement = function (tag) {
        assert.equal(this, document); const node = create(tag);
        if (tag === 'a') {
            call('create', node);
            const remove = node.remove;
            node.remove = function () { assert.equal(this, node); node.removes++; call('remove', node); return remove.call(node); };
            node.removes = 0; node.clicks = 0;
            node.click = function () { assert.equal(this, node); node.clicks++; clicks.push({ link: node, url: node.href }); call('click', node); };
            for (const name of ['href', 'download']) { let value; Object.defineProperty(node, name, { configurable: true,
                get() { return value; }, set(next) { value = next; call(name, node); } }); }
            links.push(node);
        } else node.click = () => node.dispatch('click');
        return node;
    };
    const append = document.body.append;
    document.body.append = function (...nodes) { assert.equal(this, document.body); append.apply(this, nodes); if (nodes.some(n => n.tagName === 'A')) call('append', nodes[0]); };
    vm.runInNewContext(fs.readFileSync(process.env.SCRATCHPAD_VIEW_SOURCE || path.join(__dirname, '../shared/local-scratchpad-view.js'), 'utf8'), { window, document });
    const wrapper = document.createElement('main'), host = document.createElement('article'), neutral = document.createElement('input');
    document.body.append(wrapper, neutral); wrapper.append(host);
    const view = new window.LocalItabScratchpad.View(host, { controller });
    const nodes = Object.fromEntries(Object.entries(view).filter(([, node]) => node?.tagName));
    const h = { document, window, wrapper, host, neutral, controller, store, backend, view, nodes, io, effects, hooks, blobs, links, urls, revoked, timers, clicks,
        originalURL, bytes: () => JSON.stringify(raw), flushTimers() { for (const timer of timers.splice(0)) timer.fn(); },
        async foreign() { const f = await model(t, { document: createDocument({ blurUnavailableFocus: true }) }); f.controller.setDraft('FOREIGN draft should never escape 😀'); f.controller.cancelTimer(); sources.push(f); return f; } };
    t.after(async () => { backend.readGate?.resolve(); backend.writeGate?.resolve(); await tick(); hooks.clear();
        Object.assign(view, nodes, { controller }); controller.store = store; store.backend = backend;
        try { view.destroy(); } catch (_) {} controller.destroy(); });
    await tick(); neutral.focus(); nodes.textarea.selectionStart = 2; nodes.textarea.selectionEnd = 7; nodes.textarea.selectionDirection = 'backward';
    return h;
}
function remember(h) {
    const c = h.controller, n = h.nodes;
    return { raw: h.bytes(), io: { ...h.io }, state: c.state, stateJSON: JSON.stringify(c.state), draft: c.draft, generation: c.generation,
        error: c.error, readError: c.readError, writeError: c.writeError, conflict: c.conflict, pending: c.pending, pendingWrite: c.pendingWrite,
        status: c.status, composing: c.composing, editor: n.textarea.value, saved: n.savedPreview.value, savedHidden: n.savedPreview.hidden,
        readOnly: n.textarea.readOnly, statusText: n.status.textContent, retryHidden: n.retry.hidden, retryDisabled: n.retry.disabled,
        focus: h.document.activeElement, selection: [n.textarea.selectionStart, n.textarea.selectionEnd, n.textarea.selectionDirection] };
}
function same(h, before, { status = false } = {}) { const after = remember(h); if (status) { delete after.statusText; before = { ...before }; delete before.statusText; } assert.deepEqual(after, before); assert.deepEqual(h.effects, []); }
function move(node, parent, document = parent?.ownerDocument) {
    const original = { parent: node.parentElement, document: node.ownerDocument }; node.remove();
    if (document) { const adopt = n => { n.ownerDocument = document; n.children.forEach(adopt); }; adopt(node); }
    parent?.append(node); return () => move(node, original.parent, original.document);
}
async function assertExport(h, text) {
    assert.equal(h.clicks.length, 1); assert.equal(h.blobs.length, 1); assert.equal(new TextDecoder('utf-8', { ignoreBOM: true }).decode(await h.blobs[0].arrayBuffer()), text);
    assert.equal(h.blobs[0].type, 'text/plain;charset=utf-8'); assert.equal(h.links[0].download, 'local-itab-scratchpad.txt');
    assert.equal(h.links[0].removes, 1); assert.equal(h.links[0].parentElement, null); assert.equal(h.timers.length, 1); assert.equal(h.timers[0].delay, 1000);
    assert.deepEqual(h.revoked, []); h.flushTimers(); assert.deepEqual(h.revoked, [h.urls[0].url]); assert.deepEqual(h.effects, []);
}
function assertAbandoned(h) {
    assert.equal(h.clicks.length, 0, 'no actual anchor activation after ownership loss');
    assert.equal(h.timers.length, 0); for (const link of h.links) { assert.equal(link.removes, 1); assert.equal(link.parentElement || null, null); }
    assert.deepEqual(h.revoked, h.urls.map(item => item.url)); assert.deepEqual(h.effects, []);
}
const replace = {
    controller(h, f) { h.view.controller = f.controller; return () => { h.view.controller = h.controller; }; },
    store(h, f) { h.controller.store = f.store; return () => { h.controller.store = h.store; }; },
    backend(h, f) { h.store.backend = f.backend; return () => { h.store.backend = h.backend; }; },
    host(h, f) { h.view.host = f.host; return () => { h.view.host = h.host; }; },
    textarea(h, f) { h.view.textarea = f.nodes.textarea; return () => { h.view.textarea = h.nodes.textarea; }; },
    status(h, f) { h.view.status = f.nodes.status; return () => { h.view.status = h.nodes.status; }; },
    exportButton(h, f) { h.view.exportButton = f.nodes.exportButton; return () => { h.view.exportButton = h.nodes.exportButton; }; }
};
const changeContext = {
    ...replace,
    workspace(h) { const old = h.backend.workspace; h.backend.workspace = { ...old }; return () => { h.backend.workspace = old; }; },
    workspaceId(h) { const old = h.backend.workspace.id; h.backend.workspace.id = 'foreign-workspace'; return () => { h.backend.workspace.id = old; }; },
    workspaceGeneration(h) { const old = h.backend.workspace.generation; h.backend.workspace.generation = 'foreign-generation'; return () => { h.backend.workspace.generation = old; }; },
    session(h) { const old = h.window.LocalItabWorkspaces.session; h.window.LocalItabWorkspaces.session = { ...old }; return () => { h.window.LocalItabWorkspaces.session = old; }; }
};
for (const entry of ['direct', 'button']) for (const [name, change] of Object.entries(replace)) test(`export source: ${entry} rejects construction ${name} substitution and allows restoration`, async t => {
    const h = await model(t), f = await h.foreign(), before = remember(h), other = remember(f); const restore = change(h, f);
    if (entry === 'direct') h.view.exportText(); else h.nodes.exportButton.dispatch('click');
    assertAbandoned(h); assert.equal(h.blobs.length, 0); same(h, before); same(f, other); restore(); h.view.exportText(); await assertExport(h, EXACT);
});
for (const transfer of ['same-document', 'cross-document']) for (const name of ['textarea', 'status', 'exportButton', 'host', 'wrapper']) test(`export source: ${transfer} transfer of ${name} cannot dispatch`, async t => {
    const h = await model(t), foreignDocument = transfer === 'same-document' ? h.document : createDocument(), target = foreignDocument.createElement('section'); foreignDocument.body.append(target);
    const node = h[name] || h.nodes[name], restore = move(node, target), before = remember(h);
    h.view.exportText(); assertAbandoned(h); assert.equal(h.blobs.length, 0); same(h, before); restore(); h.view.exportText(); await assertExport(h, EXACT);
});
for (const name of ['hidden host', 'hidden document', 'detached host', 'detached wrapper', 'disabled control', 'departing', 'closed Controller', 'late workspace', 'late session', 'suspended workspace', 'invalidated workspace', 'empty', 'initial read error', 'initial loading']) test(`export compatibility: ${name} preserves original permissive recovery admission`, async t => {
    const h = await model(t, { workspace: name.includes('workspace') && !name.startsWith('late'), readError: name === 'initial read error', loading: name === 'initial loading' });
    if (name === 'hidden host') h.host.hidden = true;
    if (name === 'hidden document') h.document.hidden = true;
    if (name === 'detached host') h.host.remove();
    if (name === 'detached wrapper') h.wrapper.remove();
    if (name === 'disabled control') h.nodes.exportButton.disabled = true;
    if (name === 'departing') h.window.LocalItabContentLifecycle = { departing: true };
    if (name === 'closed Controller') h.controller.destroy();
    if (name === 'late workspace') { h.backend.workspace = { id: 'late', generation: 'late-generation' }; h.window.LocalItabWorkspaces = { session: h.backend.workspace }; }
    if (name === 'late session') h.window.LocalItabWorkspaces = { session: { id: 'late-session' } };
    if (name === 'suspended workspace') h.backend.workspace._suspended = true;
    if (name === 'invalidated workspace') h.backend.workspace.invalidated = true;
    if (name === 'empty') h.controller.setDraft('');
    const before = remember(h), text = h.controller.draft; h.view.exportText(); await assertExport(h, text); same(h, before);
});
for (const kind of ['raw saved', 'dirty', 'IME', 'write error', 'lost acknowledgement', 'conflict', 'read error', 'over-limit', 'pending success', 'pending failure']) test(`export bytes: genuine ${kind} preserves draft, storage, recovery, focus and selection`, async t => {
    const h = await model(t); let pending;
    if (kind !== 'raw saved') h.controller.setDraft(kind === 'over-limit' ? '😀'.repeat(33000) : DRAFT);
    if (kind === 'IME') { h.nodes.textarea.dispatch('compositionstart'); h.nodes.textarea.value = '真实 composition 😀\nfinal'; }
    if (kind === 'write error' || kind === 'lost acknowledgement') { h.backend[kind === 'write error' ? 'writeError' : 'ackError'] = true; await assert.rejects(h.controller.save(), { code: 'WRITE' }); await tick(); }
    if (kind === 'conflict') { await new api.Store(h.backend).mutate({ kind: 'content', value: 'Latest saved conflict', revision: h.controller.state.revision }); await tick(); assert(h.controller.conflict); }
    if (kind === 'read error') { h.backend.readError = true; await assert.rejects(h.controller.refresh(), { code: 'READ' }); }
    if (kind === 'over-limit') await assert.rejects(h.controller.save(), { code: 'TEXT_LIMIT' });
    if (kind.startsWith('pending')) { h.backend.writeGate = deferred(); h.backend.writeEntered = deferred(); h.backend.writeError = kind === 'pending failure'; pending = h.controller.save(); pending.catch(() => {}); await h.backend.writeEntered.promise; assert(h.controller.pendingWrite); }
    if (kind === 'raw saved') h.nodes.textarea.value = EXACT.replace(/\r\n?/g, '\n');
    h.controller.cancelTimer(); const text = kind === 'IME' ? h.nodes.textarea.value : h.controller.draft, before = remember(h);
    h.view.exportText(); await assertExport(h, text); same(h, before);
    if (pending) { h.backend.writeGate.resolve(); if (kind === 'pending failure') await assert.rejects(pending, { code: 'WRITE' }); else { await pending; assert.equal(JSON.parse(h.bytes()).content, DRAFT); } }
});
for (const text of ['a\uD800b', '\uDC00', 'valid\uD83D']) test('export Unicode: rejects incomplete code points without lossy Blob construction ' + JSON.stringify(text), async t => {
    const h = await model(t); h.controller.setDraft(text); h.controller.cancelTimer(); const before = remember(h);
    h.view.exportText(); assert.equal(h.blobs.length, 0); assertAbandoned(h); assert.match(h.nodes.status.textContent, /cannot be saved or exported exactly/); same(h, before, { status: true });
});
for (const stage of ['blob', 'url', 'create', 'href', 'download', 'append', 'click getter']) for (const [name, change] of Object.entries(changeContext)) test(`export boundary: ${stage} ${name} transfer suppresses actual click`, async t => {
    const h = await model(t, { workspace: true }), f = await h.foreign(), before = remember(h), other = remember(f); let restore;
    const lose = () => { restore = change(h, f); };
    if (stage === 'click getter') h.hooks.set('create', node => { let click; Object.defineProperty(node, 'click', { configurable: true, get() { lose(); return click; }, set(fn) { click = fn; } }); });
    else h.hooks.set(stage, lose);
    h.view.exportText(); assertAbandoned(h); same(h, before); same(f, other); restore?.();
});
for (const stage of ['blob', 'url', 'create', 'href', 'download', 'append', 'click getter']) for (const transfer of ['same-document', 'cross-document']) test(`export boundary: ${stage} ${transfer} status adoption preserves new owner feedback`, async t => {
    const h = await model(t), destination = transfer === 'same-document' ? h.document : createDocument(), parent = destination.createElement('aside'); destination.body.append(parent);
    const lose = () => { move(h.nodes.status, parent); h.nodes.status.textContent = 'New owner status'; };
    if (stage === 'click getter') h.hooks.set('create', node => { let click; Object.defineProperty(node, 'click', { configurable: true, get() { lose(); return click; }, set(fn) { click = fn; } }); });
    else h.hooks.set(stage, lose);
    h.view.exportText(); assertAbandoned(h); assert.equal(h.nodes.status.textContent, 'New owner status');
});
for (const stage of ['entry', 'blob', 'url', 'append', 'click getter']) for (const reset of [false, true]) test(`export retirement: ${stage}, public closed reset ${reset}`, async t => {
    const h = await model(t), retire = () => { h.view.destroy(); if (reset) h.view.closed = false; };
    if (stage === 'entry') retire(); else if (stage === 'click getter') h.hooks.set('create', node => { let click; Object.defineProperty(node, 'click', { configurable: true, get() { retire(); return click; }, set(fn) { click = fn; } }); }); else h.hooks.set(stage, retire);
    h.view.exportText(); assertAbandoned(h); assert(h.controller.closed);
});
for (const stage of ['blob', 'url', 'create', 'href', 'download', 'append', 'click', 'remove', 'timer']) test(`export failure: ${stage} attempts each returned resource cleanup once`, async t => {
    const h = await model(t), before = remember(h); h.hooks.set(stage, () => { throw Error('Synthetic ' + stage + ' failure'); });
    assert.doesNotThrow(() => h.view.exportText()); assert.deepEqual(h.revoked, h.urls.map(item => item.url));
    for (const link of h.links) assert.equal(link.removes, 1, 'each returned anchor removal attempted once');
    assert.match(h.nodes.status.textContent, /Could not export/); same(h, before, { status: true });
});
for (const stage of ['blob', 'url', 'create', 'href', 'download', 'append', 'click', 'remove', 'timer']) test(`export failure: ${stage} cannot overwrite substituted foreign status`, async t => {
    const h = await model(t), f = await h.foreign(), before = remember(h), other = remember(f);
    h.hooks.set(stage, () => { h.view.status = f.nodes.status; throw Error('Synthetic ownership-loss failure'); });
    assert.doesNotThrow(() => h.view.exportText()); same(h, before); same(f, other); for (const link of h.links) assert.equal(link.removes, 1);
    assert.deepEqual(h.revoked, h.urls.map(item => item.url));
});
for (const stage of ['blob', 'url', 'append', 'click', 'remove', 'timer']) test(`export resources: ${stage} replacement cannot redirect captured URL cleanup`, async t => {
    const h = await model(t), foreign = [], originalRevoke = h.originalURL.revokeObjectURL;
    h.hooks.set(stage, () => { h.originalURL.revokeObjectURL = url => foreign.push('mutated:' + url); h.window.URL = { createObjectURL() { foreign.push('create'); return 'blob:foreign'; }, revokeObjectURL(url) { foreign.push('foreign:' + url); } }; });
    h.view.exportText(); h.flushTimers(); assert.deepEqual(foreign, []); assert.deepEqual(h.revoked, h.urls.map(item => item.url)); assert.equal(h.revoked.length, 1); assert.equal(h.clicks.length, 1);
    h.originalURL.revokeObjectURL = originalRevoke;
});
for (const stage of ['href', 'download', 'append', 'click']) test(`export resources: ${stage} cannot replace original anchor remove/click methods`, async t => {
    const h = await model(t), foreign = [];
    h.hooks.set(stage, node => { node.remove = () => foreign.push('remove'); node.click = () => foreign.push('click'); });
    h.view.exportText(); await assertExport(h, EXACT); assert.deepEqual(foreign, []);
});
for (const stage of ['blob', 'url', 'create', 'href', 'download', 'append', 'click', 'remove', 'timer']) test(`export reentry: ${stage} nested call cannot duplicate dispatch; next user call works`, async t => {
    const h = await model(t); h.hooks.set(stage, () => h.view.exportText()); h.view.exportText(); await assertExport(h, EXACT);
    h.view.exportText(); assert.equal(h.clicks.length, 2); h.flushTimers(); assert.equal(h.revoked.length, 2); assert.deepEqual(h.effects, []);
});
test('export resources: delayed revocation retains original receiver/method even after retirement', async t => {
    const h = await model(t); h.view.exportText(); assert.equal(h.clicks.length, 1); h.view.destroy(); const foreign = [];
    h.window.URL = { revokeObjectURL: value => foreign.push(value) }; h.flushTimers(); assert.deepEqual(h.revoked, [h.urls[0].url]); assert.deepEqual(foreign, []);
});
test('export activation: source transfer inside actual click cannot undo the issued download', async t => {
    const h = await model(t), f = await h.foreign(), other = remember(f); h.hooks.set('click', () => { h.view.controller = f.controller; });
    h.view.exportText(); await assertExport(h, EXACT); same(f, other);
});
for (const name of ['workspace', 'workspaceId', 'workspaceGeneration', 'session']) test(`export context: completed ${name} change before invocation remains permitted`, async t => {
    const h = await model(t, { workspace: true }); changeContext[name](h); const before = remember(h);
    h.view.exportText(); await assertExport(h, EXACT); same(h, before);
});
for (const name of ['Blob', 'URL', 'createObjectURL', 'revokeObjectURL', 'createElement', 'body', 'append', 'setTimeout']) test(`export method access: ${name} getter losing Controller ownership cannot dispatch`, async t => {
    const h = await model(t), f = await h.foreign(), before = remember(h), other = remember(f);
    const target = ['Blob', 'URL', 'setTimeout'].includes(name) ? h.window : ['createObjectURL', 'revokeObjectURL'].includes(name) ? h.originalURL : name === 'append' ? h.document.body : h.document;
    const original = target[name]; let reads = 0;
    Object.defineProperty(target, name, { configurable: true, get() { reads++; h.view.controller = f.controller; return original; } });
    h.view.exportText(); assert.equal(reads, 1); assertAbandoned(h); same(h, before); same(f, other);
    Object.defineProperty(target, name, { configurable: true, writable: true, value: original });
});
for (const mode of ['move status', 'substitute status', 'change controller']) test(`export Unicode feedback: translation ${mode} cannot write foreign feedback`, async t => {
    const h = await model(t), f = await h.foreign(); h.controller.setDraft('invalid\uD800'); h.controller.cancelTimer();
    const other = remember(f), prior = h.nodes.status.textContent;
    h.window.i18n = { t(key) { if (key === 'scratchpadInvalidText') {
        if (mode === 'move status') { move(h.nodes.status, f.host); h.nodes.status.textContent = 'Foreign feedback'; }
        if (mode === 'substitute status') h.view.status = f.nodes.status;
        if (mode === 'change controller') h.view.controller = f.controller;
    } return key; } };
    h.view.exportText(); assertAbandoned(h); assert.equal(h.nodes.status.textContent, mode === 'move status' ? 'Foreign feedback' : prior); same(f, other);
});
for (const stage of ['blob', 'url', 'append', 'click']) test(`export feedback: ${stage} real newer Controller edit keeps its current feedback after failure`, async t => {
    const h = await model(t); let before;
    h.hooks.set(stage, () => { h.controller.setDraft('Newer genuine edit 😀'); h.controller.cancelTimer(); before = remember(h); throw Error('Old export fails'); });
    h.view.exportText(); same(h, before); assert.deepEqual(h.revoked, h.urls.map(item => item.url));
});
test('export cleanup: throwing remove still revokes once; throwing revoke never retries or prevents next export', async t => {
    const h = await model(t); h.hooks.set('remove', () => { throw Error('remove failed'); }); h.hooks.set('revoke', () => { throw Error('revoke failed'); });
    assert.doesNotThrow(() => h.view.exportText()); assert.equal(h.links[0].removes, 1); assert.deepEqual(h.revoked, [h.urls[0].url]);
    h.view.exportText(); assert.equal(h.clicks.length, 2); h.flushTimers(); assert.deepEqual(h.revoked, h.urls.map(item => item.url));
});
test('export cleanup: timer that registers then throws cannot double revoke the URL', async t => {
    const h = await model(t); h.window.setTimeout = function (fn) { h.timers.push({ fn }); throw Error('registered then threw'); };
    h.view.exportText(); assert.deepEqual(h.revoked, [h.urls[0].url]); h.flushTimers(); assert.deepEqual(h.revoked, [h.urls[0].url]); assert.equal(h.links[0].removes, 1);
});
for (const prop of ['parentElement', 'ownerDocument']) test(`export ownership: one-shot ${prop} getter transfer cannot retain stale authority`, async t => {
    const h = await model(t), f = await h.foreign(), node = h.nodes.status, original = node[prop]; let armed = true, value = original;
    Object.defineProperty(node, prop, { configurable: true, get() { if (armed) { armed = false; move(node, f.host); node.textContent = 'New owner feedback'; return original; } return value; }, set(next) { value = next; } });
    h.view.exportText(); assertAbandoned(h); assert.equal(node.textContent, 'New owner feedback');
});
test('export resources: already-issued success remains independent of later failed user export', async t => {
    const h = await model(t); h.view.exportText(); h.hooks.set('blob', () => { throw Error('second fails'); }); h.view.exportText();
    assert.equal(h.clicks.length, 1); assert.equal(h.links[0].removes, 1); assert.match(h.nodes.status.textContent, /Could not export/);
    h.flushTimers(); assert.deepEqual(h.revoked, [h.urls[0].url]); assert.match(h.nodes.status.textContent, /Could not export/);
});
// Transfer is test setup, not an export cleanup attempt. Bypass only the
// fixture's instrumented remove wrapper while retaining actual DOM detachment.
function transferAnchor(link, parent) {
    Object.getPrototypeOf(link).remove.call(link);
    const adopt = node => { node.ownerDocument = parent.ownerDocument; node.children.forEach(adopt); }; adopt(link);
    parent.append(link);
}
const alterAnchor = {
    href(h, link) { link.href = 'blob:foreign-resource'; },
    download(h, link) { link.download = 'foreign-download-name.txt'; },
    parent(h, link) { const parent = h.document.createElement('section'); h.document.body.append(parent); transferAnchor(link, parent); },
    document(h, link) { const document = createDocument(); transferAnchor(link, document.body); }
};
for (const [name, change] of Object.entries(alterAnchor)) test(`export anchor ownership: append callback ${name} change cannot activate substituted resource`, async t => {
    const h = await model(t), before = remember(h); h.hooks.set('append', link => change(h, link));
    h.view.exportText(); assertAbandoned(h); same(h, before); assert.equal(h.urls.length, 1); assert.equal(h.links.length, 1);
    h.view.exportText(); assert.equal(h.clicks.length, 1, 'next genuine export is independent'); assert.equal(h.clicks[0].url, h.urls[1].url);
    h.flushTimers(); assert.deepEqual(h.revoked, h.urls.map(item => item.url));
});
for (const property of ['href', 'download', 'parentElement', 'ownerDocument']) test(`export anchor ownership: one-shot stale ${property} getter cannot authorize changed anchor`, async t => {
    const h = await model(t), before = remember(h);
    h.hooks.set('append', link => {
        let armed = true, value = link[property]; const original = value;
        Object.defineProperty(link, property, { configurable: true, get() {
            if (armed) { armed = false;
                if (property === 'href') value = 'blob:foreign-resource';
                if (property === 'download') value = 'foreign-download-name.txt';
                if (property === 'parentElement') alterAnchor.parent(h, link);
                if (property === 'ownerDocument') alterAnchor.document(h, link);
                return original;
            } return value;
        }, set(next) { value = next; } });
    });
    h.view.exportText(); assertAbandoned(h); same(h, before); assert.equal(h.urls.length, 1);
});
for (const property of ['href', 'download', 'parentElement', 'ownerDocument']) test(`export anchor ownership: ${property} getter source loss cannot dispatch or replace feedback`, async t => {
    const h = await model(t), f = await h.foreign(), before = remember(h), other = remember(f);
    h.hooks.set('append', link => { let value = link[property]; Object.defineProperty(link, property, { configurable: true,
        get() { h.view.controller = f.controller; return value; }, set(next) { value = next; } }); });
    h.view.exportText(); assertAbandoned(h); same(h, before); same(f, other);
});
