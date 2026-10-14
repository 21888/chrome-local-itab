const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model.js');
const { setup: storeSetup, add, tick } = require('./helpers/collections-harness.js');
const Core = require('../shared/local-ai-collections-store.js');

function setup(locale = 'en') {
    const doc = createDocument({ blurUnavailableFocus: true, aggregateTextContent: true });
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
    const events = new Map(), forbidden = () => assert.fail('Navigation cannot contact a provider, storage, clipboard or URL API');
    const Marked = require('../vendor/marked/marked.umd.js'); let parses = 0;
    const root = { document: doc, marked: { Lexer: class extends Marked.Lexer { lex(source) { parses++; return super.lex(source); } } },
        i18n: { t: key => messages[key]?.message || key }, LocalItabAICollections: Core,
        addEventListener: (type, listener) => events.set(type, listener), removeEventListener: type => events.delete(type),
        location: { assign: forbidden, replace: forbidden }, history: { pushState: forbidden, replaceState: forbidden },
        navigator: { clipboard: { writeText: forbidden } }, localStorage: { setItem: forbidden } };
    const context = vm.createContext({ window: root, fetch: forbidden, XMLHttpRequest: forbidden, WebSocket: forbidden, Intl, Date });
    vm.runInContext(fs.readFileSync('shared/safe-answer-reader.js', 'utf8'), context);
    const translate = (key, fallback) => messages[`answerReader${key}`]?.message || fallback;
    return { doc, root, context, events, translate, api: root.LocalItabSafeAnswerReader, get parses() { return parses; } };
}
function mountReader(h, source, options = { sections: true }) {
    const reader = h.api.create(h.doc, source, h.translate, options); h.doc.body.append(reader.node);
    return reader;
}
function navigation(reader) {
    const details = reader.node.querySelector('.answer-reader-sections');
    return { details, summary: details?.querySelector('summary'), buttons: details?.querySelectorAll('button') || [],
        content: reader.node.querySelector('.answer-reader-content'), controls: reader.node.querySelectorAll('.answer-reader-controls button') };
}
function geometry(content) {
    content.scrollTop = 0; content.scrollLeft = 19; content.clientTop = 1;
    content.getBoundingClientRect = () => ({ top: 120 });
    for (const [index, heading] of content.children.filter(node => /^H[1-6]$/.test(node.tagName)).entries()) {
        heading.getBoundingClientRect = () => ({ top: 121 + index * 500 - content.scrollTop });
        const focus = heading.focus.bind(heading); heading.focus = options => { assert.deepEqual({ ...options }, { preventScroll: true }); focus(); };
    }
}
const source = '# One\n\nIntro.\n\n## Two\n\nBody.\n\n### Three\n\nBody.\n\n#### Four\n\nBody.\n\n##### Five\n\nBody.\n\n###### Six';

test('section navigation is explicit opt-in, root-only, safe, ordered and nonempty, with Setext headings', () => {
    const h = setup();
    const body = '# Repeated\n\n### **Repeated**\n\nSetext title\n===\n\nLower title\n---\n\n#\n\n> ## Quote excluded\n\n- ### List excluded\n\n```md\n# Code excluded\n```\n\n<h2>HTML excluded</h2>\n\n## <script>literal</script>\n\n#### [label](javascript:alert(1)) ![alt](https://invalid.example/pixel.png)';
    assert.equal(navigation(mountReader(h, body, {})).details, null);
    const reader = mountReader(h, body), n = navigation(reader);
    assert.equal(n.details.tagName, 'DETAILS'); assert.equal(n.summary.tagName, 'SUMMARY'); assert.equal(n.details.open, false);
    assert.equal(n.summary.textContent, 'Sections (6)'); assert.equal(n.details.parentElement, reader.node);
    assert(!n.content.contains(n.details));
    assert.deepEqual(n.buttons.map(button => button.textContent), ['1. Repeated', '2. Repeated', '3. Setext title', '4. Lower title', '5. <script>literal</script>', '6. label (javascript:alert(1)) alt (https://invalid.example/pixel.png)']);
    for (const button of n.buttons) { assert.equal(button.type, 'button'); assert.equal(button.children.length, 0); assert.deepEqual([...button.listeners.keys()], ['click']); }
    assert.equal(reader.node.querySelectorAll('a,img,script,iframe,svg,style').length, 0);
    for (const heading of n.content.querySelectorAll('h1,h2,h3,h4,h5,h6')) { assert.equal(heading.id, undefined); assert.equal(heading.getAttribute('id'), undefined); }
    assert.equal(reader.node.querySelector('.answer-reader-source').textContent, body);
});

test('zero, one, whitespace-only headings and every parser fallback omit section navigation', () => {
    const h = setup();
    for (const body of ['No headings', '# One', '#\n\n##\n\n### One', '> # Nested\n\n- ## Nested', '<h1>one</h1>\n\n<h2>two</h2>', '# One\n\n## Two\n' + 'x'.repeat(32001), '# One\n\n## Two\n' + '['.repeat(513)]) {
        assert.equal(navigation(mountReader(h, body)).details, null, body.slice(0, 60));
    }
    h.root.marked = { Lexer: class { lex() { return [{ type: 'heading', depth: 1, tokens: [{ type: 'text', text: 'First' }] }, { type: 'heading', depth: 2, tokens: [{ type: 'text', text: 'Second' }] }, { type: 'list', items: null }]; } } };
    const failed = mountReader(h, 'exact raw after partial failure'); assert.equal(navigation(failed).details, null);
    assert.equal(failed.node.querySelector('.answer-reader-source').textContent, 'exact raw after partial failure');
});

test('repeated section activation uses current DOM references and only content scrollTop, with preventScroll focus', () => {
    const h = setup(), reader = mountReader(h, source), n = navigation(reader); geometry(n.content);
    h.doc.body.scrollTop = 83; h.doc.documentElement.scrollTop = 83;
    n.details.open = true; const headings = n.content.children.filter(node => /^H[1-6]$/.test(node.tagName));
    for (const index of [0, 3, 5, 0, 3, 3]) {
        n.buttons[index].dispatch('click'); assert.equal(h.doc.activeElement, headings[index]);
        assert.equal(n.content.scrollTop, index * 500); assert.equal(n.content.scrollLeft, 19);
        assert.equal(h.doc.body.scrollTop, 83); assert.equal(h.doc.documentElement.scrollTop, 83); assert.equal(n.details.open, true);
    }
    headings[3].textContent = 'Changed after render'; n.buttons[3].dispatch('click'); assert.equal(h.doc.activeElement, headings[3]);
    assert.equal(n.buttons[3].textContent, '4. Four'); assert.equal(h.parses, 1);
});

test('closed, original, hidden, inert, detached, stale-target and destroyed section controls cannot act', () => {
    const h = setup(), reader = mountReader(h, source), n = navigation(reader); geometry(n.content);
    const unchanged = () => { n.content.scrollTop = 37; h.doc.body.focus(); n.buttons[2].dispatch('click'); assert.equal(n.content.scrollTop, 37); assert.equal(h.doc.activeElement, h.doc.body); };
    unchanged(); n.details.open = true; n.buttons[2].dispatch('click'); assert.equal(n.content.scrollTop, 1000);
    n.details.open = false; unchanged(); n.details.open = true;
    n.controls[1].dispatch('click'); assert(n.details.hidden); assert(n.buttons.every(button => button.disabled)); unchanged();
    n.controls[0].dispatch('click'); assert(!n.details.hidden); assert(n.buttons.every(button => !button.disabled)); assert.equal(n.content.scrollTop, 37);
    for (const property of ['hidden', 'inert']) { reader.node[property] = true; unchanged(); reader.node[property] = false; }
    h.doc.hidden = true; unchanged(); h.doc.hidden = false;
    h.doc.visibilityState = 'hidden'; unchanged(); h.doc.visibilityState = 'visible';
    n.buttons[2].hidden = true; unchanged(); n.buttons[2].hidden = false;
    const heading = n.content.querySelector('h3'); heading.remove(); unchanged(); n.content.append(heading);
    reader.node.remove(); unchanged(); h.doc.body.append(reader.node); n.buttons[2].dispatch('click'); assert.equal(h.doc.activeElement, heading);
    reader.destroy(); unchanged(); reader.refreshNavigationState(); assert.equal(reader.node.children.length, 0);
});

test('section navigation recovers host-disabled buttons, blocks pending actions, and never steals settled focus', () => {
    const h = setup(); let pending = false;
    const reader = mountReader(h, source, { sections: true, canNavigate: () => !pending }), n = navigation(reader); geometry(n.content); n.details.open = true;
    n.buttons[2].focus(); pending = true; reader.refreshNavigationState();
    assert(n.buttons.every(button => button.disabled)); assert.equal(h.doc.activeElement, n.summary);
    n.buttons[2].disabled = false; n.buttons[2].dispatch('click'); assert.equal(n.content.scrollTop, 0, 'eligibility guard blocks a stale enabled button');
    for (const button of n.buttons) button.disabled = true; h.doc.body.focus(); pending = false; reader.refreshNavigationState();
    assert(n.buttons.every(button => !button.disabled)); assert.equal(h.doc.activeElement, h.doc.body);
    n.buttons[2].dispatch('click'); assert.equal(n.content.scrollTop, 1000);
});

for (const locale of ['en', 'zh_CN']) test(`section labels localize and very long titles remain complete (${locale})`, () => {
    const h = setup(locale), long = '中文 long title '.repeat(120), reader = mountReader(h, `# ${long}\n\n## End`), n = navigation(reader);
    assert.equal(n.summary.textContent, locale === 'en' ? 'Sections (2)' : '章节（2）');
    assert.equal(n.buttons[0].textContent, `1. ${long.trim()}`); assert.equal(n.content.querySelector('h1').textContent, long.trim());
    const css = fs.readFileSync('safe-answer-reader.css', 'utf8');
    assert.match(css, /\.answer-reader-section-list\s*\{[^}]*max-height: 12rem;[^}]*overflow: auto;/);
    assert.match(css, /\.answer-reader-section-button\s*\{[^}]*max-height: 5em;[^}]*overflow: hidden;[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
});

async function mountCollection(locale = 'en') {
    const h = setup(locale), store = storeSetup(), host = h.doc.createElement('div'); h.doc.body.append(host);
    vm.runInContext(fs.readFileSync('shared/dialog-focus.js', 'utf8'), h.context);
    vm.runInContext(fs.readFileSync('shared/local-ai-collections-view.js', 'utf8'), h.context);
    const view = new h.root.LocalItabCollectionsView.View({ host, controller: store.controller, confirm: async () => false });
    view.render(); await store.controller.start();
    return { h, store, c: store.controller, view, host };
}

test('collections opt in only current saved body; unchanged rereads preserve section state and exact copies/exports/history', async () => {
    const { h, store, c, view, host } = await mountCollection();
    const body = `${source}\n\n\x60\x60\x60js\n  const example = "synthetic";  \n\x60\x60\x60`, record = await add(c, 'Synthetic sections', body);
    const reader = view.answerReader, n = navigation(reader); geometry(n.content); n.details.open = true; n.buttons[3].dispatch('click');
    const writes = store.writes, before = JSON.stringify(await store.store.read());
    view.render(); assert.equal(view.answerReader, reader); assert.equal(h.parses, 1); assert.equal(n.details.open, true); assert.equal(n.content.scrollTop, 1500);
    assert.equal(host.querySelectorAll('.answer-reader-sections').length, 1);
    assert.equal(host.querySelector('.prompt-history').querySelectorAll('.answer-reader-sections').length, 0);
    n.controls[1].dispatch('click'); view.render(); assert.equal(n.details.hidden, true); assert.equal(n.controls[1].getAttribute('aria-pressed'), 'true');
    n.controls[0].dispatch('click'); assert.equal(n.content.scrollTop, 1500); assert.equal(h.parses, 1);
    const copies = []; view.clipboard = { writeText: async value => copies.push(value) };
    await view.copy(body); reader.node.querySelector('.answer-reader-copy-code').dispatch('click'); await tick();
    assert.deepEqual(copies, [body, '  const example = "synthetic";  ']);
    assert.equal(JSON.parse(await store.store.export()).content.records[0].body, body);
    assert.equal(c.record().history[0].body, body); assert.equal(store.writes, writes); assert.equal(JSON.stringify(await store.store.read()), before);
    assert.equal(c.record().id, record.id); c.dispose();
});

test('collections busy, pending save/read and failure block old actions but restore the same reader afterward', async () => {
    const { h, store, c, view } = await mountCollection(); await add(c, 'Synthetic sections', source);
    const reader = view.answerReader, n = navigation(reader); geometry(n.content); n.details.open = true;
    for (const kind of ['busy', 'pendingCommand', 'pendingRead', 'error']) {
        if (kind === 'pendingRead') c.pendingReadGeneration = c.readGeneration;
        else c[kind] = kind === 'error' ? { scope: 'read', code: 'READ' } : kind === 'pendingCommand' ? { command: {} } : true;
        view.render(); assert.equal(view.answerReader, reader); assert(n.buttons.every(button => button.disabled), kind);
        n.content.scrollTop = 73; n.buttons[3].dispatch('click'); assert.equal(n.content.scrollTop, 73);
        if (kind === 'pendingRead') c.pendingReadGeneration = null; else c[kind] = kind === 'busy' ? false : null;
        view.render(); assert.equal(view.answerReader, reader); assert(n.buttons.every(button => !button.disabled), kind);
        n.buttons[3].dispatch('click'); assert.equal(n.content.scrollTop, 1500);
    }
    assert.equal(h.parses, 1); c.dispose();
});

test('archived current body has sections; edit/cancel, selection, body changes, BFCache and destroy retire old targets', async () => {
    const { h, c, view, host } = await mountCollection(); const first = await add(c, 'First synthetic', source);
    const retire = action => {
        const old = view.answerReader, n = navigation(old); geometry(n.content); n.details.open = true;
        action(); n.content.scrollTop = 83; n.buttons[3].dispatch('click'); assert.equal(n.content.scrollTop, 83); assert.equal(old.node.children.length, 0); return old;
    };
    retire(() => c.edit()); assert.equal(host.querySelector('.answer-reader-sections'), null);
    c.discard(); assert(navigation(view.answerReader).details); assert.equal(h.parses, 2);
    const second = await add(c, 'Second synthetic', source); retire(() => c.select(first.id)); assert(navigation(view.answerReader).details);
    const old = view.answerReader, oldNav = navigation(old); geometry(oldNav.content); oldNav.details.open = true;
    const review = await c.reviewBody(`${source}\n\n## Added`); await c.acceptRevision(review);
    oldNav.buttons[3].dispatch('click'); assert.equal(oldNav.content.scrollTop, 0); assert.equal(old.node.children.length, 0);
    assert.equal(navigation(view.answerReader).buttons.length, 7);
    await c.action('remove'); c.filter({ mode: 'trash' }); c.select(first.id);
    assert(c.record().deletedAt); assert.equal(navigation(view.answerReader).buttons.length, 7);
    retire(() => h.events.get('pagehide')({ persisted: true })); h.events.get('pageshow')({ persisted: true }); assert(navigation(view.answerReader).details);
    retire(() => view.destroy()); assert.equal(host.querySelector('.answer-reader-sections'), null); c.dispose(); assert(second.id);
});

test('same-reader host renders preserve section-owned focus, use summary while blocked, and never reclaim outside focus', async () => {
    const { h, c, view } = await mountCollection(); await add(c, 'Synthetic focused sections', source);
    const reader = view.answerReader, n = navigation(reader); geometry(n.content); n.details.open = true;
    n.buttons[1].focus(); view.render(); assert.equal(h.doc.activeElement, n.buttons[1]); assert.equal(view.answerReader, reader);
    n.buttons[3].dispatch('click'); const heading = h.doc.activeElement; view.render(); assert.equal(h.doc.activeElement, heading); assert.equal(n.content.scrollTop, 1500);
    for (const notify of [false, true]) {
        n.buttons[1].focus(); c.busy = true;
        if (notify) c.notify(); else view.render();
        assert.equal(h.doc.activeElement, n.summary, notify ? 'controller notification preserves safe summary focus' : 'direct busy render preserves safe summary focus');
        assert(n.buttons.every(button => button.disabled));
        view.search.focus(); c.busy = false;
        if (notify) c.notify(); else view.render();
        assert.equal(h.doc.activeElement, view.search); assert(n.buttons.every(button => !button.disabled));
    }
    n.buttons[1].focus(); const replace = view.main.replaceChildren.bind(view.main);
    view.main.replaceChildren = (...items) => { replace(...items); view.search.focus(); };
    view.render(); assert.equal(h.doc.activeElement, view.search, 'a newer focus owner is never reclaimed during reattachment');
    view.main.replaceChildren = replace;
    n.buttons[1].focus(); n.details.open = false; view.render(); assert.equal(h.doc.activeElement, n.summary, 'closed-list controls do not regain hidden focus');
    n.details.open = true; n.buttons[1].focus(); c.edit(); assert.equal(reader.node.children.length, 0); assert.notEqual(h.doc.activeElement, n.buttons[1]);
    c.discard(); assert.equal(navigation(view.answerReader).details.open, false); assert.equal(h.parses, 2); c.dispose();
});

test('captured section focus belongs to one Reading lifetime and cannot outlive Original or destruction', () => {
    const h = setup(), reader = mountReader(h, source), n = navigation(reader); n.details.open = true;
    n.buttons[1].focus(); const rawCapture = reader.captureNavigationFocus(); n.controls[1].dispatch('click'); h.doc.body.focus(); rawCapture();
    assert.equal(h.doc.activeElement, h.doc.body);
    n.controls[0].dispatch('click'); rawCapture(); assert.equal(h.doc.activeElement, h.doc.body, 'Reading return does not revive an earlier focus ticket');
    n.buttons[1].focus(); const deadCapture = reader.captureNavigationFocus(); reader.destroy(); deadCapture(); assert.equal(h.doc.activeElement, h.doc.body);
});

for (const leaveFocus of [false, true]) test(`deferred collection refresh preserves safe section focus without stealing a newer choice (${leaveFocus})`, async () => {
    const { h, store, c, view } = await mountCollection(); await add(c, 'Synthetic deferred sections', source);
    const reader = view.answerReader, n = navigation(reader); n.details.open = true; n.buttons[1].focus();
    const read = store.store.read.bind(store.store), saved = await read(); let finish;
    store.store.read = () => new Promise(resolve => { finish = resolve; });
    const refreshing = c.refresh();
    assert.equal(h.doc.activeElement, n.summary); assert(n.buttons.every(button => button.disabled)); assert.equal(view.answerReader, reader);
    if (leaveFocus) view.search.focus(); finish(saved); await refreshing; store.store.read = read;
    assert.equal(h.doc.activeElement, leaveFocus ? view.search : n.summary);
    assert(n.buttons.every(button => !button.disabled)); assert.equal(view.answerReader, reader); assert.equal(h.parses, 1); c.dispose();
});

function resetScrollWhenHostDetaches(view) {
    const replace = view.main.replaceChildren.bind(view.main);
    view.main.replaceChildren = (...items) => {
        const content = view.answerReader?.node.querySelector('.answer-reader-content');
        replace(...items);
        // Chrome's native fixture resets the existing scroll box on detach.
        if (content && !content.isConnected) content.scrollTop = 0;
    };
}

test('same-reader host redraws retain exact reading offsets through Chrome-style detach even with outside focus', async () => {
    const { h, c, view } = await mountCollection(); await add(c, 'Synthetic scroll ownership', source);
    const reader = view.answerReader, n = navigation(reader); geometry(n.content); n.details.open = true;
    resetScrollWhenHostDetaches(view); view.search.focus(); h.doc.body.scrollTop = 91; h.doc.documentElement.scrollTop = 91;
    for (const top of [0, 1798, 2955]) {
        n.content.scrollTop = top;
        for (const busy of [false, true, false]) {
            c.busy = busy; view.render();
            assert.equal(view.answerReader, reader); assert.equal(n.content.scrollTop, top); assert.equal(n.content.scrollLeft, 19);
            assert.equal(h.doc.activeElement, view.search); assert.equal(h.doc.body.scrollTop, 91); assert.equal(h.doc.documentElement.scrollTop, 91);
        }
    }
    n.buttons[1].focus(); c.busy = true; c.notify(); assert.equal(h.doc.activeElement, n.summary); assert.equal(n.content.scrollTop, 2955);
    c.busy = false; c.notify(); assert.equal(h.doc.activeElement, n.summary); assert.equal(n.content.scrollTop, 2955); assert.equal(h.parses, 1); c.dispose();
});

test('real pending reads preserve same-reader position through detach while the latest outside focus stays put', async () => {
    const { h, store, c, view } = await mountCollection(); await add(c, 'Synthetic read position', source);
    const reader = view.answerReader, n = navigation(reader); geometry(n.content); n.content.scrollTop = 1798;
    resetScrollWhenHostDetaches(view); const read = store.store.read.bind(store.store), saved = await read(); let finish;
    store.store.read = () => new Promise(resolve => { finish = resolve; });
    const refreshing = c.refresh(); assert.equal(n.content.scrollTop, 1798); assert(n.buttons.every(button => button.disabled));
    view.search.focus(); finish(saved); await refreshing; store.store.read = read;
    assert.equal(view.answerReader, reader); assert.equal(n.content.scrollTop, 1798); assert.equal(n.content.scrollLeft, 19);
    assert.equal(h.doc.activeElement, view.search); assert.equal(h.parses, 1); c.dispose();
});

test('reading-position captures are one-shot and cannot restore over a newer capture, section action, Original or destroyed reader', () => {
    const h = setup(), reader = mountReader(h, source), n = navigation(reader); geometry(n.content); n.details.open = true;
    n.content.scrollTop = 1798; const old = reader.captureReadingPosition();
    n.content.scrollTop = 2955; const newer = reader.captureReadingPosition(); n.content.scrollTop = 0;
    old(); assert.equal(n.content.scrollTop, 0); newer(); assert.equal(n.content.scrollTop, 2955);
    n.content.scrollTop = 0; newer(); assert.equal(n.content.scrollTop, 0, 'consumed capture does not override a later position');
    n.content.scrollTop = 1798; const beforeAction = reader.captureReadingPosition(); n.buttons[3].dispatch('click'); beforeAction();
    assert.equal(n.content.scrollTop, 1500, 'explicit section navigation invalidates an older position');
    const beforeRaw = reader.captureReadingPosition(); n.controls[1].dispatch('click'); assert.equal(reader.captureReadingPosition(), null);
    n.content.scrollTop = 0; beforeRaw(); assert.equal(n.content.scrollTop, 0); n.controls[0].dispatch('click'); assert.equal(n.content.scrollTop, 1500);
    n.content.scrollTop = 73; beforeRaw(); assert.equal(n.content.scrollTop, 73, 'old capture cannot override the current position after Reading returns');
    n.content.scrollTop = 1798; const beforeDestroy = reader.captureReadingPosition(); reader.destroy(); n.content.scrollTop = 0; beforeDestroy(); assert.equal(n.content.scrollTop, 0);
});

test('new saved-body owners and editing never inherit a retired reader position', async () => {
    const { c, view } = await mountCollection(); const first = await add(c, 'First owner', source);
    const retired = view.answerReader, n = navigation(retired); geometry(n.content); n.content.scrollTop = 1798;
    const restore = retired.captureReadingPosition(); resetScrollWhenHostDetaches(view);
    await add(c, 'Second owner', `${source}\n\n## Another`); const replacement = navigation(view.answerReader).content;
    replacement.scrollTop = 0; n.content.scrollTop = 0; restore(); assert.equal(replacement.scrollTop, 0); assert.equal(n.content.scrollTop, 0);
    c.select(first.id); const beforeEdit = view.answerReader, before = navigation(beforeEdit).content; before.scrollTop = 2955;
    c.edit(); c.discard(); const afterEdit = navigation(view.answerReader).content;
    assert.notEqual(view.answerReader, beforeEdit); assert.equal(afterEdit.scrollTop || 0, 0);
    afterEdit.scrollTop = 1798; const beforeBody = view.answerReader;
    const plan = await c.reviewBody(`${source}\n\n## Changed body`); await c.acceptRevision(plan);
    assert.notEqual(view.answerReader, beforeBody); assert.equal(navigation(view.answerReader).content.scrollTop || 0, 0); c.dispose();
});

function hiddenReadingScrollModel(content) {
    let retainedTop = content.scrollTop || 0;
    Object.defineProperty(content, 'scrollTop', {
        configurable: true,
        get: () => content.hidden ? 0 : retainedTop,
        set: value => { if (!content.hidden) retainedTop = value; }
    });
    return { detach() { retainedTop = 0; } };
}

test('Original redraws preserve only the same live reader Reading position despite hidden getter zero and latent detach loss', async () => {
    const { h, c, view } = await mountCollection(); await add(c, 'Synthetic hidden Reading position', source);
    const reader = view.answerReader, n = navigation(reader); geometry(n.content);
    const model = hiddenReadingScrollModel(n.content), replace = view.main.replaceChildren.bind(view.main);
    view.main.replaceChildren = (...items) => { replace(...items); model.detach(); };
    const original = reader.node.querySelector('.answer-reader-source'); original.scrollTop = 71;
    view.search.focus(); h.doc.body.scrollTop = 91; h.doc.documentElement.scrollTop = 91;
    for (const open of [false, true]) for (const top of [0, 1798, 2955]) {
        n.details.open = open; n.content.scrollTop = top;
        n.controls[1].dispatch('click'); assert.equal(n.content.scrollTop, 0, 'hidden getter masks the retained offset');
        n.controls[1].dispatch('click');
        for (const busy of [true, false]) { c.busy = busy; view.render(); assert.equal(view.answerReader, reader); assert.equal(n.content.scrollTop, 0); }
        n.controls[0].dispatch('click'); assert.equal(n.content.scrollTop, top); assert.equal(n.details.open, open);
        assert.equal(h.doc.activeElement, view.search); assert.equal(n.content.scrollLeft, 19); assert.equal(original.scrollTop, 71);
        assert.equal(h.doc.body.scrollTop, 91); assert.equal(h.doc.documentElement.scrollTop, 91);
    }
    assert.equal(h.parses, 1); c.dispose();
});

test('repeated Reading clicks never replay an older Raw snapshot, and a later Raw switch captures the latest manual position', () => {
    const h = setup(), reader = mountReader(h, source), n = navigation(reader); geometry(n.content); const model = hiddenReadingScrollModel(n.content);
    n.content.scrollTop = 1798; n.controls[1].dispatch('click'); model.detach(); n.controls[0].dispatch('click'); assert.equal(n.content.scrollTop, 1798);
    n.content.scrollTop = 2955; n.controls[0].dispatch('click'); assert.equal(n.content.scrollTop, 2955, 'Reading→Reading does not rewind');
    n.controls[1].dispatch('click'); n.controls[1].dispatch('click'); model.detach(); n.controls[0].dispatch('click'); assert.equal(n.content.scrollTop, 2955);
    n.content.scrollTop = 0; n.controls[1].dispatch('click'); model.detach(); n.controls[0].dispatch('click'); assert.equal(n.content.scrollTop, 0, 'zero replaces an older nonzero offset');
});

test('Raw during a real deferred read retains Reading position without reclaiming outside focus', async () => {
    const { h, store, c, view } = await mountCollection(); await add(c, 'Synthetic Raw refresh position', source);
    const reader = view.answerReader, n = navigation(reader); geometry(n.content); const model = hiddenReadingScrollModel(n.content);
    const replace = view.main.replaceChildren.bind(view.main); view.main.replaceChildren = (...items) => { replace(...items); model.detach(); };
    n.content.scrollTop = 1798; n.controls[1].dispatch('click');
    const read = store.store.read.bind(store.store), saved = await read(); let finish;
    store.store.read = () => new Promise(resolve => { finish = resolve; }); const refreshing = c.refresh();
    view.search.focus(); finish(saved); await refreshing; store.store.read = read;
    assert.equal(view.answerReader, reader); assert.equal(n.content.scrollTop, 0); n.controls[0].dispatch('click');
    assert.equal(n.content.scrollTop, 1798); assert.equal(h.doc.activeElement, view.search); assert.equal(h.parses, 1); c.dispose();
});

test('Raw position snapshots never transfer into a replacement body, record, edited reader or destroyed reader', async () => {
    const { c, view } = await mountCollection(); const first = await add(c, 'Synthetic first Raw owner', source);
    const old = view.answerReader, n = navigation(old); geometry(n.content); hiddenReadingScrollModel(n.content);
    n.content.scrollTop = 1798; n.controls[1].dispatch('click');
    const plan = await c.reviewBody(`${source}\n\n## Replacement`); await c.acceptRevision(plan);
    assert.notEqual(view.answerReader, old); assert.equal(navigation(view.answerReader).content.scrollTop || 0, 0); n.controls[0].dispatch('click'); assert.equal(old.node.children.length, 0);
    const revised = view.answerReader, revisedNav = navigation(revised); revisedNav.content.scrollTop = 2955; revisedNav.controls[1].dispatch('click');
    await add(c, 'Synthetic second Raw owner', source); assert.notEqual(view.answerReader, revised); assert.equal(navigation(view.answerReader).content.scrollTop || 0, 0);
    c.select(first.id); const selected = view.answerReader, selectedNav = navigation(selected); selectedNav.content.scrollTop = 1798; selectedNav.controls[1].dispatch('click');
    c.edit(); c.discard(); assert.notEqual(view.answerReader, selected); assert.equal(navigation(view.answerReader).content.scrollTop || 0, 0);
    const dead = view.answerReader, deadNav = navigation(dead); deadNav.content.scrollTop = 1798; deadNav.controls[1].dispatch('click'); view.destroy(); deadNav.controls[0].dispatch('click');
    assert.equal(dead.node.children.length, 0); c.dispose();
});
