const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

// A small DOM/event model for ownership and routing. Real native-key behavior,
// focus painting and browser dragging remain a separate unpacked-extension check.
function createDocument() {
    const doc = { activeElement: null, listeners: new Map(), addEventListener(type, fn) { this.listeners.set(type, fn); }, removeEventListener(type) { this.listeners.delete(type); } };
    class Element {
        constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.style = {}; this.listeners = new Map(); this.inert = false; this.ownerDocument = doc; this._classes = new Set(); this.classList = { add: name => this._classes.add(name), remove: name => this._classes.delete(name), contains: name => this._classes.has(name), toggle: (name, enabled) => enabled ? this._classes.add(name) : this._classes.delete(name) }; }
        set className(value) { this._classes = new Set(value.split(/\s+/).filter(Boolean)); }
        get className() { return [...this._classes].join(' '); }
        get tabIndex() { return this._tabIndex ?? (['BUTTON', 'INPUT', 'SELECT'].includes(this.tagName) ? 0 : -1); }
        set tabIndex(value) { this._tabIndex = value; }
        get isConnected() { return this === doc.body || Boolean(this.parentElement?.isConnected); }
        append(...children) { for (const child of children) { if (child.tagName === '#FRAGMENT') { this.append(...child.children); continue; } child.parentElement = this; this.children.push(child); } }
        appendChild(child) { this.append(child); }
        replaceChildren(...children) { for (const child of this.children) { if (child.contains(doc.activeElement)) doc.activeElement = doc.body; child.parentElement = null; } this.children = []; this.append(...children); }
        remove() { if (this.parentElement) { this.parentElement.children = this.parentElement.children.filter(item => item !== this); this.parentElement = null; } }
        contains(element) { return element === this || this.children.some(child => child.contains(element)); }
        setAttribute(name, value) { this.attributes[name] = value; if (name === 'tabindex') this.tabIndex = Number(value); }
        getAttribute(name) { return this.attributes[name]; }
        matches(selector) {
            return selector.split(',').some(raw => {
                let rule = raw.trim();
                const excluded = rule.match(/:not\((\.[^)]+)\)/);
                if (excluded && this.matches(excluded[1])) return false;
                rule = rule.replace(/:not\([^)]+\)/g, '');
                const attr = rule.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
                if (attr) {
                    const name = attr[1];
                    const value = name.startsWith('data-') ? this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] : name === 'inert' ? (this.inert ? '' : undefined) : this.attributes[name];
                    return attr[2] === undefined ? value !== undefined : value === attr[2];
                }
                if (rule.startsWith('#')) return this.id === rule.slice(1);
                if (rule.startsWith('.')) return rule.slice(1).split('.').every(name => this._classes.has(name));
                if (rule === 'a[href]') return this.tagName === 'A' && Boolean(this.href);
                return this.tagName === rule.toUpperCase();
            });
        }
        closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
        querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
        addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
        removeEventListener(type, fn) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== fn)); }
        getClientRects() { for (let node = this; node; node = node.parentElement) if (node.hidden || node.style.display === 'none' || (node.classList.contains('modal-overlay') && !node.classList.contains('active'))) return []; return this.isConnected ? [{}] : []; }
        getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: 80, height: 80 }; }
        focus() { if (this.getClientRects().length && !this.disabled && !this.closest('[inert]')) doc.activeElement = this; }
        setPointerCapture() {}
        releasePointerCapture() {}
        dispatch(type, fields = {}) { const event = { target: this, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...fields }; for (let node = this; node && !event.stopped; node = node.parentElement) for (const fn of node.listeners.get(type) || []) fn(event); return event; }
    }
    doc.body = new Element('body'); doc.activeElement = doc.body;
    doc.createElement = tag => new Element(tag); doc.createDocumentFragment = () => new Element('#fragment');
    doc.getElementById = id => doc.body.querySelector(`#${id}`); doc.querySelectorAll = selector => doc.body.querySelectorAll(selector);
    return doc;
}
const sampleLinks = [
    { title: 'A <img "quoted">', url: 'https://example.com/a', icon: 'A', category: 'work' },
    { title: 'B', url: 'https://example.com/a', icon: 'B', category: 'work' },
    { title: 'Hidden C', url: 'https://example.com/c', icon: 'C', category: 'social' }
];
function createHarness(links = sampleLinks) {
    const document = createDocument();
    const container = document.createElement('section'); container.id = 'shortcuts-container';
    const search = document.createElement('input'); document.body.append(search, container);
    const opened = [];
    const storageManager = { defaultConfig: { layout: { columns: 6 } }, set: async () => true };
    const context = { document, window: { addEventListener() {}, open: url => opened.push(url), getComputedStyle: element => ({ visibility: element.style.visibility || 'visible' }) }, storageManager, URL, console: { error() {}, log() {}, warn() {} }, setTimeout() { return 0; }, clearTimeout() {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('shared/dialog-focus.js', 'utf8'), context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent; this.CategoryNavigation = CategoryNavigation; showErrorMessage = () => {};', context);
    const component = new context.ShortcutsComponent(JSON.parse(JSON.stringify(links)));
    component.applyLayoutMode = () => {}; component.reflowVisibleLayout = () => {};
    component.createModal = () => {
        const overlay = document.createElement('div'); overlay.className = 'modal-overlay';
        const heading = document.createElement('h3'); heading.className = 'modal-title'; overlay.append(heading);
        for (const id of ['shortcut-title', 'shortcut-url', 'shortcut-icon', 'shortcut-category', 'save-btn', 'title-error', 'url-error']) {
            const element = document.createElement(id === 'save-btn' ? 'button' : id.endsWith('error') ? 'div' : id === 'shortcut-category' ? 'select' : 'input');
            element.id = id; element.value = ''; element.textContent = ''; if (id.endsWith('error')) element.className = 'form-error'; overlay.append(element);
        }
        document.body.append(overlay); component.modal = overlay;
    };
    const navigation = Object.create(context.CategoryNavigation.prototype);
    navigation.currentCategory = 'work'; navigation.categories = [{ id: 'work', name: 'Work' }, { id: 'social', name: 'Social' }];
    context.window.categoryNavigation = navigation;
    component.render();
    const grid = document.getElementById('shortcuts-grid'); grid.rect = { left: 0, top: 0, width: 288, height: 288 };
    const tile = index => grid.querySelectorAll('.shortcut-item:not(.add-shortcut)').find(item => item.dataset.index === String(index));
    const control = (index, action = 'open') => tile(index).querySelector(`[data-action="${action}"]`);
    return { document, component, context, storageManager, grid, opened, search, tile, control, add: () => grid.querySelector('.add-shortcut') };
}
function nativeActivation(button, key, repeat = false) {
    button.focus(); const event = button.dispatch('keydown', { key, repeat });
    // Model native default activation; production code must not synthesize it too.
    if (!event.prevented && !repeat) { if (key === ' ') button.dispatch('keyup', { key }); button.dispatch('click'); }
    return event;
}
const submit = component => component.handleFormSubmit({ preventDefault() {} });

(async () => {
    const h = createHarness();
    assert.equal(h.control(0).tagName, 'BUTTON'); assert.equal(h.control(0).type, 'button'); assert.equal(h.control(0).tabIndex, 0);
    assert.match(h.control(0).getAttribute('aria-label'), /Open in new tab: A <img "quoted">/);
    assert.equal(h.control(0).querySelector('button'), null, 'no nested edit/delete controls');
    assert.equal(h.control(0).querySelector('.shortcut-title').textContent, sampleLinks[0].title);
    assert.match(h.control(0, 'edit').getAttribute('aria-label'), /Edit: A/);
    assert.match(h.control(0, 'delete').getAttribute('aria-label'), /Delete: A/);
    assert.equal(h.add().tagName, 'BUTTON'); assert.equal(h.add().getAttribute('aria-label'), 'Add Shortcut');
    nativeActivation(h.control(0), 'Enter'); assert.equal(h.opened.length, 1);
    assert.equal(nativeActivation(h.control(0), 'Enter', true).prevented, true); assert.equal(h.opened.length, 1);
    nativeActivation(h.control(0), ' '); assert.equal(h.opened.length, 2);
    assert.equal(h.control(2).getClientRects().length, 0); h.control(2).dispatch('click'); assert.equal(h.opened.length, 2);
    h.control(0).disabled = true; h.control(0).dispatch('click'); assert.equal(h.opened.length, 2); h.control(0).disabled = false;
    nativeActivation(h.add(), 'Enter'); assert.equal(h.document.activeElement.id, 'shortcut-title');
    assert.equal(h.document.activeElement.dispatch('keydown', { key: 'Enter', repeat: true }).prevented, true);
    h.component.modal.dispatch('keydown', { key: 'Escape' }); assert.equal(h.document.activeElement, h.add());
    nativeActivation(h.add(), ' '); h.component.hideModal(); assert.equal(h.document.activeElement, h.add());
    nativeActivation(h.control(1, 'edit'), 'Enter');
    h.component.modal.querySelector('#shortcut-title').value = 'Renamed B';
    await submit(h.component);
    assert.equal(h.document.activeElement, h.control(1, 'edit'), 'same-session edit follows its rebuilt control');
    nativeActivation(h.add(), 'Enter');
    h.component.modal.querySelector('#shortcut-title').value = 'New D'; h.component.modal.querySelector('#shortcut-url').value = 'example.com/d';
    await submit(h.component); assert.equal(h.document.activeElement, h.add(), 'successful Add returns to Add');
    h.search.focus(); h.component.updateGrid(); assert.equal(h.document.activeElement, h.search);

    for (const deleted of [0, 1]) {
        const h = createHarness(); h.control(deleted, 'delete').focus(); await h.component.deleteShortcut(deleted);
        assert.equal(h.document.activeElement, h.control(0), 'delete chooses next/previous visible primary, not Delete or hidden category');
    }
    {
        const h = createHarness([sampleLinks[0], sampleLinks[2]]); h.control(0, 'delete').focus(); await h.component.deleteShortcut(0);
        assert.equal(h.document.activeElement, h.add());
    }
    {
        const h = createHarness(); h.control(1, 'edit').focus(); h.component.links = [h.component.links[1], h.component.links[0], h.component.links[2]]; h.component.updateGrid();
        assert.equal(h.document.activeElement, h.control(0, 'edit'), 'duplicate URLs keep title/category identity');
        const create = h.component.createShortcutItem.bind(h.component);
        h.component.createShortcutItem = (link, index) => { const item = create(link, index); item.querySelector('.shortcut-actions').style.display = 'none'; return item; };
        h.component.updateGrid(); assert.equal(h.document.activeElement, h.control(0), 'hidden narrow action falls back to visible launch');
    }
    for (const outcome of [true, false]) {
        for (const destination of ['search', 'new-editor']) {
            const h = createHarness(); const write = deferred(); h.storageManager.set = () => write.promise;
            nativeActivation(h.control(0, 'edit'), 'Enter'); h.component.modal.querySelector('#shortcut-title').value = 'Pending A';
            const saving = submit(h.component); h.component.hideModal();
            if (destination === 'search') h.search.focus();
            else { nativeActivation(h.add(), 'Enter'); h.component.modal.querySelector('#shortcut-title').value = 'Newer draft'; }
            const focus = h.document.activeElement; write.resolve(outcome); await saving;
            assert.equal(h.document.activeElement, focus, 'old completion does not steal focus');
            if (destination === 'new-editor') { assert.equal(focus.value, 'Newer draft'); assert(h.component.modal.classList.contains('active')); }
        }
    }
    {
        const h = createHarness(); h.storageManager.set = async () => false;
        nativeActivation(h.control(0, 'edit'), 'Enter'); const focus = h.document.activeElement;
        await submit(h.component); assert.equal(h.document.activeElement, focus); assert(h.component.modal.classList.contains('active'));
        assert.equal(h.component.modal.querySelector('#save-btn').disabled, false);
    }
    for (const failure of ['false', 'throw', 'conflict']) {
        const h = createHarness();
        h.storageManager.set = async () => {
            if (failure === 'false') return false;
            const error = new Error('save failed');
            if (failure === 'conflict') { error.code = 'LINKS_CONFLICT'; error.latestLinks = [h.component.links[0]]; }
            throw error;
        };
        nativeActivation(h.control(1, 'edit'), 'Enter');
        await submit(h.component);
        assert(h.component.modal.classList.contains('active'));
        h.component.modal.dispatch('keydown', { key: 'Escape' });
        assert.equal(h.document.activeElement, failure === 'conflict' ? h.control(0) : h.control(1, 'edit'), 'failed save dismissal restores a rebuilt visible opener/fallback');
        assert(h.document.activeElement.getClientRects().length > 0);
    }
    {
        const twins = [sampleLinks[0], { ...sampleLinks[0], icon: 'Different icon' }];
        const h = createHarness(twins); h.control(0, 'delete').focus();
        await h.component.deleteShortcut(0);
        assert.equal(h.document.activeElement, h.control(0), 'successful deletion of an exact twin always chooses primary, not its Delete action');
    }
    {
        const h = createHarness(); h.component.layout.autoArrange = false;
        const pointer = target => ({ target, pointerId: 1, button: 0, clientX: 10, clientY: 10, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} });
        h.component.onPointerDown(pointer(h.control(0).querySelector('.shortcut-icon'))); assert.equal(typeof h.component._cancelFreeDrag, 'function'); h.component._cancelFreeDrag();
        const action = pointer(h.control(0, 'edit')); h.component.onPointerDown(action); assert.equal(action.prevented, false); assert.equal(h.component._cancelFreeDrag, null);
        h.component.layout.autoArrange = true;
        const data = [];
        h.component.handleDragStart({ target: h.control(0).querySelector('.shortcut-icon'), dataTransfer: { setData: (...args) => data.push(args) }, preventDefault() {} });
        assert.equal(h.component.draggedIndex, 0); assert.deepEqual(data, [['text/plain', '0']]);
    }
    console.log('shortcut keyboard tests ok (DOM/event model; native smoke pending)');
})().catch(error => { console.error(error); process.exitCode = 1; });
