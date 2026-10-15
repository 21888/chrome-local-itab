// Synthetic controller/store/DOM coverage only. No real clipboard, provider,
// account, credential, personal text or native browser behavior is claimed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { webcrypto } = require('node:crypto'); global.crypto ||= webcrypto;
const { createDocument, deferred } = require('./helpers/task-dom-model');
const Context = require('../shared/ai-context'), Tasks = require('../shared/local-tasks-store'), Collections = require('../shared/local-ai-collections-store');
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
function backend() {
    let raw, queue = Promise.resolve();
    return { reads: 0, writes: 0, fail: null, snapshot: () => structuredClone(raw),
        lock(fn) { const next = queue.then(fn); queue = next.catch(() => {}); return next; },
        async read() { this.reads++; return structuredClone(raw); },
        async write(value) { this.writes++; raw = structuredClone(value); if (this.fail) { this.fail = false; throw Error('synthetic uncertain write'); } },
        subscribe: () => () => {} };
}
function setup() {
    const b = backend(), c = backend(), calls = { active: 0, network: 0, permission: 0, sources: 0 };
    let active = true, gate = null;
    const ensureActive = async () => { calls.active++; if (gate) await gate.promise; if (!active) throw Context.fault('WORKSPACE_INVALIDATED'); };
    const controller = new Context.Controller({ ensureActive, taskStore: new Tasks.Store(Context.guardedBackend(b, ensureActive)), collectionStore: new Collections.Store(Context.guardedBackend(c, ensureActive)),
        readSources: async () => { calls.sources++; return [{ id: 'collection:synthetic', label: 'Saved synthetic title', text: 'Saved synthetic body', scope: 'library' }, { id: 'scratchpad:synthetic', label: 'Saved workspace note', text: 'Saved synthetic note', scope: 'workspace' }]; },
        transport: { review: input => ({ ...input, origin: 'https://synthetic.example', permission: 'https://synthetic.example:443/*' }), run: async () => { calls.network++; return { text: 'Synthetic provider answer' }; } },
        permissions: { contains: async () => { calls.permission++; return true; }, request: async () => { calls.permission++; return true; } } });
    // Real controller/view share a realm. Normalize cross-realm VM review input.
    const review = controller.review.bind(controller); controller.review = value => review(JSON.parse(JSON.stringify(value)));
    return { controller, b, c, calls, deactivate() { active = false; },
        hold() { gate = deferred(); const ticket = gate; return () => { gate = null; ticket.resolve(); }; } };
}
async function ui({ clipboard, t, normalize = false } = {}) {
    const h = setup(), document = createDocument({ blurUnavailableFocus: true, aggregateTextContent: true });
    if (normalize) {
        const create = document.createElement;
        document.createElement = tag => { const node = create(tag); if (tag === 'textarea') { let value = ''; Object.defineProperty(node, 'value', { get: () => value, set: text => { value = text.replace(/\r\n?/g, '\n'); } }); } return node; };
    }
    const host = document.createElement('main'); document.body.append(host);
    const events = new Map(), confirmations = []; let confirm = () => true;
    const window = { document, confirm: text => { confirmations.push(text); return confirm(); }, addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type) };
    vm.runInNewContext(fs.readFileSync('shared/ai-context-view.js', 'utf8'), { window });
    const view = window.LocalItabAIContextView.mount(host, { controller: h.controller, presetStore: null, clipboard, t }); await view.ready;
    const button = text => host.querySelectorAll('button').find(node => node.textContent.startsWith(text));
    const input = (node, value) => { node.value = value; node.dispatch('input'); };
    const panel = host.querySelector('.ai-context-manual'); panel.open = true;
    return { ...h, document, host, events, confirmations, view, button, input, panel,
        title: host.querySelector('.ai-context-manualtitle'), body: host.querySelector('.ai-context-manualbody'), add: host.querySelector('.ai-context-manual-add'),
        status: host.querySelector('.ai-context-manual-status'), question: host.querySelector('.ai-context-question'),
        setConfirm: value => { confirm = typeof value === 'function' ? value : () => value; },
        click(text) { const node = button(text); assert(node, text); assert(!node.disabled, `${text} enabled`); node.dispatch('click'); return node; } };
}
const rows = h => h.host.querySelectorAll('.ai-context-source');
const manualRows = h => h.host.querySelector('.ai-context-manual-sources').querySelectorAll('.ai-context-source');
const choose = (row, value = true) => { const check = row.querySelector('input'); check.checked = value; check.dispatch('change'); };
const setScope = (h, value) => { const select = h.host.querySelector('.ai-context-source-scope'); select.value = value; select.dispatch('change'); };
const restore = row => row.querySelector('.ai-context-source-restore');
const remove = row => row.querySelector('.ai-context-manual-remove');
const noWrites = h => { assert.equal(h.b.writes + h.c.writes, 0); assert.equal(h.calls.network, 0); assert.equal(h.calls.permission, 0); };
async function add(h, title = 'Synthetic temporary title', body = 'Synthetic temporary body') {
    h.input(h.title, title); h.input(h.body, body); h.click('Add temporary'); await settle(); return manualRows(h).at(-1);
}
async function local(h) { h.input(h.question, 'Synthetic question'); h.click('Review prompt locally'); await settle(); return h.controller.localReview; }
async function send(h) {
    h.input(h.host.querySelector('.ai-context-endpoint'), 'https://synthetic.example/v1/chat/completions'); h.input(h.host.querySelector('.ai-context-model'), 'synthetic');
    h.input(h.question, 'Synthetic question'); h.click('Review exact'); await settle(); h.click('Send reviewed'); await settle();
}
async function idle(h) { for (let index = 0; index < 100 && h.controller.busy; index++) await new Promise(resolve => setTimeout(resolve, 5)); await settle(); }

test('manual source preparation is exact, immutable, session-identified and read/write/network-free except active validation', async () => {
    const h = setup(), title = '  中文 😀 <b>literal</b>  ', body = '  text\r\n😀\t<svg>literal</svg>\rmore  ';
    const one = await h.controller.prepareManualSource(title, body), two = await h.controller.prepareManualSource(title, body), other = await setup().controller.prepareManualSource(title, body);
    assert.equal(one.label, title); assert.equal(one.text, body); assert.equal(one.scope, 'manual'); assert(Object.isFrozen(one));
    assert.match(one.id, /^manual:[a-f0-9-]{36}:1$/); assert.notEqual(one.id, two.id); assert.notEqual(one.id, other.id);
    assert.equal(h.controller.generation, 0); assert.equal(h.b.reads + h.c.reads + h.calls.sources, 0); noWrites(h);
    const packed = Context.pack('Question', [one]); assert.match(packed.prompt, /manually entered temporary excerpts, with unverified origin/);
    assert.equal(packed.sources[0].label, title); assert.equal(packed.sources[0].text, body);
    assert.doesNotMatch(Context.pack('Question', []).prompt, /Source IDs beginning with manual/);
});

test('manual preparation accepts exact title/body boundaries, rejects malformed Unicode and entire oversize strings', async () => {
    const h = setup();
    for (const title of ['t'.repeat(200), '😀'.repeat(200)]) {
        const source = await h.controller.prepareManualSource(title, '😀'.repeat(8000)); assert.equal(source.label, title); assert.equal(source.text.length, 16000);
    }
    for (const title of ['', ' ', 't'.repeat(201), '😀'.repeat(201), '\ud800', '\udc00']) await assert.rejects(h.controller.prepareManualSource(title, 'text'), { code: 'LIMIT' });
    for (const body of ['', '\n ', 'x'.repeat(16001), '😀'.repeat(8000) + 'x', '\ud800', '\udc00']) await assert.rejects(h.controller.prepareManualSource('title', body), { code: 'LIMIT' });
    for (const count of [-1, 12, 13, NaN, 1.5]) await assert.rejects(h.controller.prepareManualSource('title', 'body', { count }), { code: 'MANUAL_LIMIT' });
    noWrites(h);
});

for (const boundary of ['closed', 'generation', 'workspace', 'draft', 'busy', 'saveCommand', 'taskCommand']) test(`manual preparation rejects a late ${boundary} change before creating a source`, async () => {
    const h = setup(), release = h.hold(); let current = true;
    const operation = h.controller.prepareManualSource('title', 'body', { isCurrent: () => current });
    if (boundary === 'closed') h.controller.close(); else if (boundary === 'generation') h.controller.edit(); else if (boundary === 'workspace') h.deactivate(); else if (boundary === 'draft') current = false; else h.controller[boundary] = true;
    release(); await assert.rejects(operation); assert.equal(h.controller.manualSequence, 0); noWrites(h);
});

test('temporary candidates default unselected, keep independent identical titles and participate in dirty/selection/scope views', async () => {
    const h = await ui(); assert.equal(h.view.hasUncommittedWork(), false);
    assert.equal(h.title.maxLength, undefined); assert.equal(h.body.maxLength, undefined);
    h.input(h.title, 'Same title'); assert.equal(h.view.hasUncommittedWork(), true);
    const one = await add(h, 'Same title'), two = await add(h, 'Same title');
    assert.equal(manualRows(h).length, 2); assert.equal(h.title.value, ''); assert.equal(h.body.value, '');
    assert.equal(one.querySelector('input').checked, false); assert.equal(one.querySelector('textarea').hidden, true);
    assert.match(one.textContent, /Manual temporary excerpt \(unverified\): Same title/); assert.equal(h.view.hasUncommittedWork(), true);
    choose(one); choose(two); const ticket = await local(h); assert.equal(ticket.packed.sources.length, 2); assert.notEqual(ticket.packed.sources[0].id, ticket.packed.sources[1].id);
    setScope(h, 'library'); assert.match(h.host.querySelector('.ai-context-source-count').textContent, /Selected: 2.*Selected but hidden: 2/);
    assert.equal(h.controller.localReview, ticket); setScope(h, 'manual'); assert.equal(rows(h).filter(row => !row.hidden).length, 2); noWrites(h);
});

test('manual candidate cap is independent of selected-source cap and never silently adds a partial set', async () => {
    const h = await ui();
    for (let index = 0; index < 12; index++) await add(h, `Temporary ${index}`);
    assert.equal(manualRows(h).length, 12); h.input(h.title, 'Thirteenth'); h.input(h.body, 'Kept draft'); assert.equal(h.add.disabled, true);
    h.add.dispatch('click'); await settle(); assert.equal(manualRows(h).length, 12); assert.equal(h.body.value, 'Kept draft');
    assert.equal(h.button('Select visible unselected').disabled, true); // 12 manual + 2 saved
    setScope(h, 'manual'); h.click('Select visible unselected'); assert.equal(rows(h).filter(row => row.querySelector('input').checked).length, 12);
    setScope(h, 'library'); assert.equal(h.button('Select visible unselected').disabled, true); setScope(h, 'manual');
    remove(manualRows(h)[0]).dispatch('click'); assert.equal(manualRows(h).length, 11); assert.equal(h.add.disabled, false); noWrites(h);
});

for (const [title, body] of [['x'.repeat(201), 'complete body'], ['title', 'x'.repeat(16001)], ['\ud800', 'body'], ['title', '\udc00']]) test(`invalid manual input is retained whole (${title.length}/${body.length})`, async () => {
    const h = await ui(); h.input(h.title, title); h.input(h.body, body); h.click('Add temporary'); await settle();
    assert.equal(manualRows(h).length, 0); assert.equal(h.title.value, title); assert.equal(h.body.value, body); assert.match(h.status.textContent, /complete input.*kept/); noWrites(h);
});

test('selected manual editor keeps oversize text, invalidates both review types, restores exact initial CRLF and copies only reviewed text', async () => {
    const copied = [], h = await ui({ normalize: true, clipboard: { writeText: async text => copied.push(text) } });
    const raw = 'Synthetic\r\n😀\rOriginal';
    // A controller-created exact string simulates a manual source before native textarea normalization.
    h.controller.prepareManualSource = async () => ({ id: 'manual:synthetic:1', label: 'CRLF', text: raw, scope: 'manual' });
    const row = await add(h); choose(row); const input = row.querySelector('textarea'); assert.equal(input.maxLength, undefined);
    const first = await local(h); assert.equal(first.packed.sources[0].text, raw);
    h.click('Copy reviewed prompt'); await settle(); assert.equal(copied[0], first.packed.prompt);
    h.input(input, 'x'.repeat(16001)); assert.equal(input.value.length, 16001); assert.equal(h.controller.localReview, null); assert.equal(h.button('Copy reviewed prompt').disabled, true);
    h.click('Review prompt locally'); await settle(); assert.equal(h.controller.localReview, null); assert.match(h.host.querySelector('.ai-context-source-budget').textContent || row.textContent, /16001|Over limit/);
    restore(row).focus(); restore(row).dispatch('click'); assert.equal(h.document.activeElement, input); assert.equal(input.value, raw.replace(/\r\n?/g, '\n'));
    h.click('Review prompt locally'); await settle(); assert.equal(h.controller.localReview.packed.sources[0].text, raw); noWrites(h);
});

test('manual edited excerpts obey existing 12-source and complete serialized 32000-unit budgets', async () => {
    const h = await ui(); const one = await add(h, 'One', 'x'.repeat(16000)), two = await add(h, 'Two', 'y'.repeat(16000)); choose(one); choose(two);
    h.input(h.question, 'Question'); h.click('Review prompt locally'); await settle(); assert.equal(h.controller.localReview, null);
    assert.match(h.host.querySelector('.ai-context-budget').textContent, /Complete prompt: \d+ \/ 32000 \(Over limit\)/);
    choose(two, false); h.click('Review prompt locally'); await settle(); assert.equal(h.controller.localReview.packed.sources.length, 1); noWrites(h);
});

test('reload replaces only saved rows and preserves manual DOM identity, ID, selected edits, unadded input and original restore text', async () => {
    const h = await ui(), manual = await add(h, 'Temporary', 'Original'), saved = rows(h)[0]; choose(manual); choose(saved);
    h.input(manual.querySelector('textarea'), 'Edited manual'); h.input(saved.querySelector('textarea'), 'Edited saved'); h.input(h.title, 'Not added title'); h.input(h.body, 'Not added body');
    const before = await local(h), id = before.packed.sources.find(item => item.id.startsWith('manual:')).id;
    setScope(h, 'manual'); h.input(h.host.querySelector('.ai-context-source-search'), 'Temporary');
    h.controller.readSources = async () => [{ id: 'collection:new', label: 'New saved', text: 'New text', scope: 'library' }]; h.click('Reload saved'); await settle();
    assert.equal(manualRows(h)[0], manual); assert.equal(manual.isConnected, true); assert.equal(manual.querySelector('input').checked, true); assert.equal(manual.querySelector('textarea').value, 'Edited manual');
    assert.equal(saved.isConnected, false); assert.equal(rows(h)[0].querySelector('input').checked, false); assert.equal(h.title.value, 'Not added title'); assert.equal(h.body.value, 'Not added body');
    assert.equal(h.controller.localReview, null); assert.match(h.confirmations[0], /saved-source selections.*Manual temporary excerpts/);
    h.click('Review prompt locally'); await settle(); assert.equal(h.controller.localReview.packed.sources[0].id, id); assert.equal(h.controller.localReview.packed.sources[0].text, 'Edited manual');
    restore(manual).dispatch('click'); assert.equal(manual.querySelector('textarea').value, 'Original'); noWrites(h);
});

test('manual-only edits never trigger reload-discard confirmation; reload cancellation and failure preserve every draft value and review', async () => {
    const h = await ui(), manual = await add(h); choose(manual); h.input(manual.querySelector('textarea'), 'Edited manual');
    h.click('Reload saved'); await settle(); assert.equal(h.confirmations.length, 0);
    const saved = rows(h)[0]; choose(saved); h.input(saved.querySelector('textarea'), 'Edited saved'); const ticket = await local(h), signature = h.view.captureDraft(), reads = h.calls.sources;
    h.setConfirm(false); h.click('Reload saved'); await settle(); assert(signature()); assert.equal(h.calls.sources, reads); assert.equal(h.controller.localReview, ticket);
    h.setConfirm(true); h.controller.readSources = async () => { throw Error('Synthetic failure'); }; h.click('Reload saved'); await settle(); assert(signature()); assert.equal(manualRows(h)[0], manual); assert.equal(h.controller.localReview, ticket); noWrites(h);
});

test('reload confirmation cannot discard a newly changed complete draft or source selection', async () => {
    for (const change of [h => h.input(h.body, 'New unadded text'), h => choose(manualRows(h)[0]), h => h.input(rows(h)[0].querySelector('textarea'), 'New saved edit')]) {
        const h = await ui(); await add(h); choose(rows(h)[0]); const reads = h.calls.sources;
        h.setConfirm(() => { change(h); return true; }); h.click('Reload saved'); await settle(); assert.equal(h.calls.sources, reads); assert.equal(manualRows(h).length, 1); noWrites(h);
    }
});

for (const boundary of ['question', 'source', 'unadded', 'scope', 'generation', 'workspace', 'close', 'pagehide', 'hideReturn']) test(`late manual Add cannot revive or override a newer ${boundary} state`, async () => {
    const h = await ui(); h.input(h.title, 'Pending title'); h.input(h.body, 'Pending body'); const release = h.hold(); h.click('Add temporary');
    if (boundary === 'question') h.question.value = 'New question';
    else if (boundary === 'source') rows(h)[0].querySelector('input').checked = true;
    else if (boundary === 'unadded') h.body.value = 'New manual body';
    else if (boundary === 'scope') setScope(h, 'manual');
    else if (boundary === 'generation') h.controller.edit();
    else if (boundary === 'workspace') h.deactivate();
    else if (boundary === 'close') h.view.destroy();
    else if (boundary === 'pagehide') h.events.get('pagehide')();
    else { h.document.visibilityState = 'hidden'; await h.document.listeners.get('visibilitychange')(); h.document.visibilityState = 'visible'; await h.document.listeners.get('visibilitychange')(); }
    release(); await settle(); assert.equal(h.controller.manualSequence, 0);
    if (boundary !== 'close' && boundary !== 'pagehide') { assert.equal(manualRows(h).length, 0); assert.equal(h.title.value, 'Pending title'); }
    else { assert.equal(h.host.children.length, 0); assert.equal(h.title.value, ''); assert.equal(h.body.value, ''); }
    noWrites(h);
});

for (const boundary of ['draft', 'generation', 'workspace', 'close', 'hideReturn']) test(`late reload preserves manual state and refuses replacement after ${boundary}`, async () => {
    const h = await ui(), manual = await add(h), saved = rows(h)[0]; choose(manual); const gate = deferred(); h.controller.readSources = () => gate.promise; h.click('Reload saved'); await settle();
    if (boundary === 'draft') h.body.value = 'New draft'; else if (boundary === 'generation') h.controller.edit(); else if (boundary === 'workspace') h.deactivate(); else if (boundary === 'close') h.view.destroy();
    else { h.document.visibilityState = 'hidden'; await h.document.listeners.get('visibilitychange')(); h.document.visibilityState = 'visible'; await h.document.listeners.get('visibilitychange')(); }
    gate.resolve([{ id: 'collection:late', label: 'Late', text: 'Late', scope: 'library' }]); await settle();
    if (boundary !== 'close') { assert.equal(manualRows(h)[0], manual); assert.equal(rows(h)[0], saved); assert.equal(manual.querySelector('input').checked, true); } else assert.equal(h.host.children.length, 0);
    noWrites(h);
});

test('clear cancel keeps all manual rows and raw input; confirmed clear discards them and old row callbacks cannot return', async () => {
    const h = await ui(), row = await add(h); h.input(h.title, 'Unused title'); h.input(h.body, 'Unused text');
    h.setConfirm(false); const capture = h.view.captureDraft(); h.click('Cancel / clear'); assert(capture()); assert.equal(manualRows(h)[0], row);
    h.setConfirm(true); h.click('Cancel / clear'); assert.equal(manualRows(h).length, 0); assert.equal(h.title.value + h.body.value, ''); assert.equal(h.view.hasUncommittedWork(), false);
    const generation = h.controller.generation; choose(row); row.querySelector('textarea').dispatch('input'); restore(row).dispatch('click'); remove(row).dispatch('click');
    assert.equal(h.controller.generation, generation); assert.equal(manualRows(h).length, 0); noWrites(h);
});

test('clear confirmation fences edits made inside the confirmation and draft capture covers manual-only input/candidates', async () => {
    const h = await ui(), before = h.view.captureDraft(); h.title.value = 'Unsubmitted'; assert.equal(before(), false); assert.equal(h.view.hasUncommittedWork(), true);
    const capture = h.view.captureDraft(); h.body.value = 'New body'; assert.equal(capture(), false);
    h.setConfirm(() => { h.input(h.body, 'Changed during confirmation'); return true; }); h.click('Cancel / clear'); assert.equal(h.body.value, 'Changed during confirmation');
    h.setConfirm(true); h.click('Cancel / clear'); await add(h); assert.equal(h.view.hasUncommittedWork(), true); noWrites(h);
});

test('manual changes invalidate next request but preserve previous response provenance and existing snapshot choice exactly', async () => {
    const h = await ui(), row = await add(h, 'Original label', 'Original body'); choose(row); await send(h);
    const result = h.controller.result, review = h.controller.resultReview, snapshot = h.controller.answerSnapshot();
    const section = h.host.querySelector('.ai-context-save-context'), consent = section.querySelector('input'); assert.equal(consent.checked, false);
    consent.checked = true; consent.dispatch('change'); assert.match(section.textContent, /including selected manual temporary text.*global AI collection and unencrypted backups/);
    h.input(row.querySelector('textarea'), 'New edited body'); assert.equal(h.controller.reviewed, null); assert.equal(h.controller.result, result); assert.equal(h.controller.resultReview, review); assert.equal(consent.checked, true);
    assert.deepEqual(h.controller.answerSnapshot(), snapshot); assert.deepEqual(JSON.parse(section.querySelector('pre').textContent), snapshot);
    await add(h, 'Another', 'Another text'); remove(row).dispatch('click'); assert.equal(h.controller.resultReview, review); assert.deepEqual(h.controller.answerSnapshot(), snapshot); assert.equal(consent.checked, true);
    h.click('Save answer'); await idle(h); const record = (await h.controller.collectionStore.read()).records[0]; assert.deepEqual(record.contextSnapshot, snapshot);
    assert.equal(record.contextSnapshot.sources[0].text, 'Original body'); assert.match(record.contextSnapshot.sources[0].id, /^manual:/); assert.match(record.contextSnapshot.prompt, /manually entered temporary excerpts/);
    assert.equal(h.c.writes, 1); assert.equal(h.b.writes, 0);
});

test('default answer save excludes manual snapshot; manually loaded external answers still reject context opt-in', async () => {
    const h = await ui(), row = await add(h); choose(row); await send(h); h.click('Save answer'); await idle(h);
    const record = (await h.controller.collectionStore.read()).records[0]; assert.equal(Object.hasOwn(record, 'contextSnapshot'), false);
    const external = setup(); await external.controller.loadExternalAnswer('Synthetic manually pasted answer', { mode: 'answer' });
    await assert.rejects(external.controller.saveAnswer('Title', { includeContext: true }), { code: 'CONTEXT_UNAVAILABLE' }); noWrites(external);
});

for (const command of ['saveCommand', 'taskCommand']) test(`unresolved ${command} locks manual add/edit/remove/restore/reload/clear without unlocking it`, async () => {
    const h = await ui(), row = await add(h); choose(row); h.input(row.querySelector('textarea'), 'Edited'); h.input(h.title, 'Next'); h.input(h.body, 'Next body');
    const original = h.controller[command] = Object.freeze({ id: 'synthetic-uncertain' }); h.controller[command === 'saveCommand' ? 'saveUncertain' : 'taskUncertain'] = true;
    h.host.querySelector('.ai-context-external-input').dispatch('input'); const generation = h.controller.generation;
    assert.equal(h.add.disabled, true); assert.equal(h.title.disabled, true); assert.equal(h.body.disabled, true); assert.equal(remove(row).disabled, true); assert.equal(restore(row).disabled, true);
    for (const control of [h.add, remove(row), restore(row), h.button('Reload saved'), h.button('Cancel / clear')]) control.dispatch('click');
    await settle(); assert.equal(h.controller[command], original); assert.equal(h.controller.generation, generation); assert.equal(manualRows(h)[0], row); assert.equal(row.querySelector('textarea').value, 'Edited'); noWrites(h);
});

test('manual native-blur model keeps focus on owned status during pending Add and on a reachable control after removal', async () => {
    const h = await ui(); h.input(h.title, 'Title'); h.input(h.body, 'Body'); h.add.focus(); const release = h.hold(); h.click('Add temporary');
    assert.equal(h.document.activeElement, h.status); release(); await settle(); assert.equal(h.document.activeElement, h.status);
    const row = manualRows(h)[0]; setScope(h, 'manual'); remove(row).focus(); remove(row).dispatch('click'); assert.equal(h.document.activeElement, h.panel.querySelector('summary')); assert.notEqual(h.document.activeElement, h.document.body);
    const one = await add(h); const two = await add(h, 'Two'); remove(one).focus(); remove(one).dispatch('click'); assert.equal(h.document.activeElement, two.querySelector('input')); noWrites(h);
});

test('pending manual add does not steal unrelated focus and double clicks do not add twice', async () => {
    const h = await ui(); h.input(h.title, 'Title'); h.input(h.body, 'Body'); const scope = h.host.querySelector('.ai-context-source-scope'); scope.focus();
    const release = h.hold(); h.click('Add temporary'); h.add.dispatch('click'); assert.equal(h.document.activeElement, scope); release(); await settle(); assert.equal(manualRows(h).length, 1); assert.equal(h.document.activeElement, scope); noWrites(h);
});

test('manual UI is text-safe and all new keys have English/Chinese labels with truthful snapshot and reload disclosures', async () => {
    const h = await ui(), row = await add(h, '<img src=x>', '<script>literal</script>'); choose(row); await local(h);
    assert.equal(h.host.querySelectorAll('img, script').length, 0); assert.equal(h.controller.localReview.packed.sources[0].label, '<img src=x>');
    for (const locale of ['en', 'zh_CN']) {
        const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
        for (const suffix of ['ManualHeading', 'ManualHelp', 'ManualTitle', 'ManualBody', 'ManualAdd', 'ManualCount', 'ManualTitleCount', 'ManualBodyCount', 'ManualAdded', 'ManualInvalid', 'ManualError', 'ManualRemoved', 'ManualClearConfirm', 'ManualRestoreHelp', 'ManualScope', 'ManualRemove', 'SourceScopeManual']) assert(messages[`aiContext${suffix}`]?.message);
        assert.match(messages.aiContextSaveContextPrivacy.message, locale === 'en' ? /selected manual temporary text/ : /手动临时文字/);
        assert.match(messages.aiContextSourceReloadHelp.message, locale === 'en' ? /Manual temporary excerpts/ : /手动临时摘录/);
    }
    noWrites(h);
});

test('manual-only work leaves existing saved collections and tasks byte-for-byte unchanged', async () => {
    const h = await ui(); h.controller.saveGeneration = h.controller.generation;
    const collections = h.controller.collectionStore, tasks = h.controller.taskStore;
    await collections.mutate(collections.request('add', { title: 'Existing synthetic record', body: 'Keep saved body' }));
    await tasks.mutate(tasks.request('add', { text: 'Existing synthetic task' }));
    const before = [h.c.snapshot(), h.b.snapshot()], writes = [h.c.writes, h.b.writes];
    const row = await add(h); choose(row); h.input(row.querySelector('textarea'), 'Temporary edit'); await local(h);
    h.click('Clear all selections'); assert.equal(row.querySelector('textarea').value, 'Temporary edit'); assert.equal(h.view.hasUncommittedWork(), true);
    h.click('Reload saved'); await settle(); remove(row).dispatch('click'); h.click('Cancel / clear');
    assert.deepEqual([h.c.snapshot(), h.b.snapshot()], before); assert.deepEqual([h.c.writes, h.b.writes], writes); assert.equal(h.calls.network + h.calls.permission, 0);
});

test('reload row-build failure preserves manual DOM, edits, selections and local review exactly', async () => {
    const h = await ui(), row = await add(h); choose(row); h.input(row.querySelector('textarea'), 'Keep edited manual'); const ticket = await local(h), capture = h.view.captureDraft();
    h.controller.readSources = async () => [{ id: 'collection:bad', label: null, text: 'Unreadable title', scope: 'library' }];
    h.click('Reload saved'); await settle(); assert(capture()); assert.equal(h.controller.localReview, ticket); assert.equal(manualRows(h)[0], row); assert.equal(row.querySelector('textarea').value, 'Keep edited manual'); noWrites(h);
});

for (const unadded of [true, false]) test(`existing dialog host confirms manual ${unadded ? 'unadded text' : 'unselected candidate'} close, cancel retains it, confirmed close discards it`, async () => {
    const h = setup(), document = createDocument({ blurUnavailableFocus: true });
    const trigger = document.createElement('button'); trigger.id = 'ai-context-entry'; document.body.append(trigger); trigger.focus();
    const events = new Map(), confirmations = []; let confirm = false;
    const window = { document, chrome: { permissions: h.controller.permissions }, LocalItabAIContext: { createController: () => h.controller },
        confirm: text => { confirmations.push(text); return confirm; }, addEventListener: (type, fn) => events.set(type, fn), removeEventListener: type => events.delete(type) };
    const context = vm.createContext({ window });
    for (const file of ['shared/dialog-focus.js', 'shared/ai-context-view.js', 'ai-context.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    trigger.dispatch('click'); await settle(); const title = document.querySelector('.ai-context-manualtitle'), body = document.querySelector('.ai-context-manualbody');
    document.querySelector('.ai-context-manual').open = true; title.value = 'Synthetic title'; title.dispatch('input'); body.value = 'Synthetic body'; body.dispatch('input');
    if (!unadded) { document.querySelector('.ai-context-manual-add').dispatch('click'); await settle(); }
    const close = document.querySelector('.ai-context-close'); close.dispatch('click'); assert.equal(confirmations.length, 1); assert(document.querySelector('.ai-context-dialog'));
    if (unadded) assert.equal(body.value, 'Synthetic body'); else assert.equal(document.querySelector('.ai-context-manual-sources').querySelectorAll('.ai-context-source').length, 1);
    confirm = true; close.dispatch('click'); assert.equal(document.querySelector('.ai-context-dialog'), null); assert.equal(body.value, ''); assert.equal(h.controller.closed, true); assert.equal(document.activeElement, trigger); noWrites(h);
});
