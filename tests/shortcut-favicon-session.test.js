const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((done, fail) => { resolve = done; reject = fail; }); return { promise, resolve, reject }; };

function createEditor() {
    const pending = [], writes = [];
    const context = {
        document: { addEventListener() {}, getElementById() { return null; } },
        window: { addEventListener() {}, LocalItabDialog: { open(overlay) { overlay.classList.add('active'); return () => overlay.classList.remove('active'); } } },
        storageManager: { defaultConfig: { layout: { columns: 6 } }, set(key, value, options) {
            const request = deferred(); pending.push(request); writes.push({ key, value: clone(value), expected: clone(options.expectedLinks) }); return request.promise;
        } },
        console: { log() {}, error() {}, warn() {} }, URL
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent; this.errors = []; showErrorMessage = value => errors.push(value);', context);
    const component = new context.ShortcutsComponent(['A', 'B'].map(title => ({ title, url: `https://example.com/${title}`, icon: '🌐', category: 'work' })));
    const fields = new Map(['shortcut-title', 'shortcut-url', 'shortcut-icon', 'shortcut-category', 'save-btn', 'title-error', 'url-error'].map(id => [`#${id}`, { value: '', textContent: '', focus() {}, classList: { toggle() {} } }]));
    fields.set('.modal-title', { textContent: '' });
    const classes = new Set();
    component.modal = {
        classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
        querySelector: selector => fields.get(selector),
        querySelectorAll: () => [fields.get('#title-error'), fields.get('#url-error')]
    };
    component.updateCategoryOptions = () => {};
    component.updateGrid = () => {};
    return { component, fields, pending, writes, context };
}
function setup() {
    const h = createEditor();
    for (const id of ['#fetch-icon-btn', '#modal-close', '#cancel-btn', '#shortcut-form', '#refresh-icon-btn']) h.fields.set(id, { disabled: false, innerHTML: 'Fetch', style: { animation: '' } });
    for (const field of h.fields.values()) {
        field.listeners = new Map();
        field.addEventListener = (name, fn) => field.listeners.set(name, fn);
        field.dispatch = name => field.listeners.get(name)?.();
    }
    h.component.modal.addEventListener = () => {};
    h.component.attachModalEventListeners();
    h.context.window.localItabPrivacy.onlineFavicons = true;
    h.component.openEditModal(0);
    return h;
}

(async () => {
    for (const change of ['cancel', 'reopen', 'url', 'icon', 'url-return', 'icon-return', 'privacy']) {
        for (const reject of [false, true]) {
            const h = setup(), wait = deferred();
            h.component.fetchFaviconAsDataUrl = () => wait.promise;
            const fetching = h.component.fetchWebsiteIcon();
            assert.equal(h.fields.get('#fetch-icon-btn').disabled, true);
            const icon = h.fields.get('#shortcut-icon'), url = h.fields.get('#shortcut-url');
            if (change === 'cancel' || change === 'reopen') h.component.hideModal();
            if (change === 'reopen') { h.component.openEditModal(1); icon.value = 'B custom'; }
            if (change === 'url') url.value = 'https://other.example/';
            if (change === 'icon') icon.value = 'manual';
            if (change === 'url-return' || change === 'icon-return') {
                const input = change === 'url-return' ? url : icon, previous = input.value;
                input.value = 'different'; input.dispatch('input'); input.value = previous; input.dispatch('input');
            }
            if (change === 'privacy') h.context.window.localItabPrivacy.onlineFavicons = false;
            const expected = icon.value;
            if (reject) wait.reject(new Error('network failed')); else wait.resolve('data:image/png;base64,OLD');
            await fetching;
            assert.equal(icon.value, expected, `${change}: stale response cannot overwrite draft`);
            assert.equal(h.fields.get('#url-error').textContent, '', 'stale failure cannot attach to draft');
            assert.equal(h.fields.get('#fetch-icon-btn').disabled, false);
            assert.equal(h.fields.get('#fetch-icon-btn').innerHTML, 'Fetch');
        }
    }
    for (const oldRejects of [false, true]) {
        const h = setup(), old = deferred(), current = deferred(); let calls = 0;
        h.component.fetchFaviconAsDataUrl = () => (++calls === 1 ? old.promise : current.promise);
        const first = h.component.fetchWebsiteIcon();
        h.component.hideModal(); h.component.openEditModal(1);
        const second = h.component.fetchWebsiteIcon();
        if (oldRejects) old.reject(new Error('old failed')); else old.resolve('old');
        await first;
        assert.equal(h.fields.get('#fetch-icon-btn').disabled, true, 'old finally cannot reset newer spinner');
        assert.equal(h.fields.get('#shortcut-icon').value, '🌐');
        current.resolve('new'); await second;
        assert.equal(h.fields.get('#shortcut-icon').value, 'new');
        assert.equal(h.fields.get('#fetch-icon-btn').disabled, false);
    }
    for (const result of ['data:image/png;base64,OK', null, 'reject']) {
        const h = setup();
        h.component.fetchFaviconAsDataUrl = async () => { if (result === 'reject') throw new Error('failed'); return result; };
        await h.component.fetchWebsiteIcon();
        assert.equal(h.fields.get('#shortcut-icon').value, result === 'reject' ? '🌐' : result || 'https://www.google.com/s2/favicons?domain=example.com&sz=64');
        assert.equal(Boolean(h.fields.get('#url-error').textContent), result === 'reject');
        assert.equal(h.fields.get('#fetch-icon-btn').disabled, false);
    }
    // Cache refresh is another asynchronous icon intent: neither completion
    // may overwrite a newer manual draft or win over an explicit newer fetch.
    for (const change of ['reopen', 'manual', 'fetch']) {
        const h = setup(), wait = deferred();
        h.context.window.faviconCache = { getOriginFromUrl: () => 'https://example.com', invalidate: () => wait.promise };
        const refresh = h.fields.get('#refresh-icon-btn').dispatch('click');
        if (change === 'reopen') { h.component.hideModal(); h.component.openEditModal(1); }
        if (change === 'manual') { h.fields.get('#shortcut-icon').value = 'manual'; h.fields.get('#shortcut-icon').dispatch('input'); }
        if (change === 'fetch') { h.component.fetchFaviconAsDataUrl = async () => 'new'; await h.component.fetchWebsiteIcon(); }
        const expected = h.fields.get('#shortcut-icon').value;
        wait.resolve(); await refresh;
        assert.equal(h.fields.get('#shortcut-icon').value, expected);
    }
    const disabled = setup(); let fetched = false;
    disabled.context.window.localItabPrivacy.onlineFavicons = false;
    disabled.component.fetchFaviconAsDataUrl = async () => { fetched = true; };
    await disabled.component.fetchWebsiteIcon(); assert.equal(fetched, false);
    console.log('shortcut favicon session tests ok (DOM model)');
})().catch(error => { console.error(error); process.exitCode = 1; });
