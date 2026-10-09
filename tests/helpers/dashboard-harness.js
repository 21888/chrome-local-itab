const fs = require('node:fs');
const vm = require('node:vm');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

// A small DOM/event model for ownership and routing. Real native-key behavior,
// focus painting and browser dragging remain a separate unpacked-extension check.
function createDocument() {
    const doc = { activeElement: null, listeners: new Map(), addEventListener(type, fn) { this.listeners.set(type, fn); }, removeEventListener(type) { this.listeners.delete(type); } };
    class Element {
        constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {}; this.attributes = {}; this.style = { setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } }; this.listeners = new Map(); this.inert = false; this.ownerDocument = doc; this._classes = new Set(); this.classList = { add: name => this._classes.add(name), remove: name => this._classes.delete(name), contains: name => this._classes.has(name), toggle: (name, enabled) => enabled ? this._classes.add(name) : this._classes.delete(name) }; }
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
    doc.documentElement = new Element('html'); doc.body = new Element('body'); doc.documentElement.append(doc.body); doc.activeElement = doc.body;
    doc.createElement = tag => new Element(tag); doc.createDocumentFragment = () => new Element('#fragment');
    doc.getElementById = id => doc.body.querySelector(`#${id}`); doc.querySelectorAll = selector => doc.body.querySelectorAll(selector); doc.querySelector = selector => doc.body.querySelector(selector);
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
    // Model the new delete transaction while retaining each test's deferred set hook.
    const store = context.storageManager;
    store.deleteShortcutWithUndo = async (index, options) => {
        const links = options.expectedLinks.filter((_, slot) => slot !== index);
        const result = await store.set('links', links, options);
        if (!result) throw new Error('Storage write returned false');
        return { snapshot: result.links ? result : { links, layout: { autoArrange: true, positions: {}, positionsById: {} } }, receipt: {} };
    };
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

module.exports = { createDocument, createHarness, nativeActivation, submit, sampleLinks, deferred };
