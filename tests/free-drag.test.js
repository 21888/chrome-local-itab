const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function eventTarget() {
    const listeners = new Map();
    return {
        listeners,
        addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
        removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
        emit(type, event) { for (const fn of [...(listeners.get(type) || [])]) fn(event); }
    };
}
function classes(...initial) {
    const values = new Set(initial);
    return { add: name => values.add(name), remove: name => values.delete(name), contains: name => values.has(name) };
}
function createHarness() {
    const document = { ...eventTarget(), getElementById(id) { return id === 'shortcuts-grid' ? grid : null; } };
    const context = { document, window: { addEventListener() {} }, storageManager: { defaultConfig: { layout: { columns: 6 } } }, console };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent;', context);
    const items = [0, 1].map(index => ({
        ...eventTarget(), dataset: { index: String(index) },
        classList: classes('shortcut-item'),
        style: { left: `${index * 96}px`, top: '0px', transform: 'translate(0px, 0px)', display: 'flex' },
        closest(selector) { return selector.startsWith('.shortcut-item') ? this : null; },
        getBoundingClientRect() { return { left: index * 96, top: 0, width: 80, height: 80 }; },
        captures: 0, releases: 0,
        setPointerCapture() { this.captures++; },
        releasePointerCapture(pointerId) { this.releases++; this.emit('lostpointercapture', { pointerId }); }
    }));
    const grid = {
        ...eventTarget(), classList: classes(), style: { removeProperty() {} },
        contains(item) { return items.includes(item); }, querySelectorAll() { return items; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 288, height: 288 }; },
        replaceChildren() {}
    };
    const component = new context.ShortcutsComponent(['A', 'B'].map(title => ({ title, url: `https://example.com/${title}` })), { autoArrange: false, alignToGrid: true, gridSize: 96 });
    component.gridEl = grid;
    component.positions = { [component.getPositionKey(component.links[0])]: { x: 0, y: 0 }, [component.getPositionKey(component.links[1])]: { x: 96, y: 0 } };
    let saves = 0, opens = 0;
    component.saveLayoutDebounced = () => { saves++; };
    component.openShortcut = () => { opens++; };
    const event = (overrides = {}) => ({
        pointerId: 1, button: 0, isPrimary: true, clientX: 10, clientY: 10, target: items[0],
        prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides
    });
    const pointerListeners = () => ['pointermove', 'pointerup', 'pointercancel'].reduce((sum, type) => sum + (document.listeners.get(type)?.size || 0), 0);
    return { component, context, document, grid, items, event, pointerListeners, saves: () => saves, opens: () => opens };
}

for (const jitter of [0, 3]) {
    const h = createHarness();
    const style = { ...h.items[0].style };
    h.component.onPointerDown(h.event());
    if (jitter) h.document.emit('pointermove', h.event({ clientX: 10 + jitter, clientY: 10 + jitter }));
    assert.deepEqual(h.items[0].style, style, 'threshold jitter must not move the tile');
    h.document.emit('pointerup', h.event());
    assert.deepEqual(h.items[0].style, style);
    assert.equal(h.saves(), 0);
    assert.equal(h.pointerListeners(), 0);
    assert.equal(h.items[0].releases, 1);
    h.component.handleGridClick(h.event());
    assert.equal(h.opens(), 1, 'ordinary clicks remain launchable');
}
for (const end of ['pointercancel', 'lostpointercapture', 'detach', 'rebuild', 'category']) {
    const h = createHarness();
    const original = { ...h.items[0].style };
    h.component._suppressClickUntil = 99;
    h.component.onPointerDown(h.event());
    h.document.emit('pointermove', h.event({ clientX: 150, clientY: 110 }));
    assert.notDeepEqual(h.items[0].style, original);
    if (end === 'pointercancel') h.document.emit(end, h.event());
    if (end === 'lostpointercapture') h.items[0].emit(end, h.event());
    if (end === 'detach') h.component.detachFreeDrag();
    if (end === 'rebuild') { h.component.buildShortcutsFragment = () => []; h.component.applyLayoutMode = () => {}; h.component.updateGrid(); }
    if (end === 'category') { h.component.layout.autoArrange = true; h.component.reflowVisibleLayout(); }
    assert.deepEqual(h.items[0].style, original, end);
    assert.equal(h.component._suppressClickUntil, 99);
    assert.equal(h.saves(), 0);
    assert.equal(h.pointerListeners(), 0);
    assert.equal(h.component._cancelFreeDrag, null);
    assert.equal(h.component._dragMoved, false);
    assert.equal(h.items[0].classList.contains('drag-free'), false);
    h.document.emit('pointerup', h.event());
    assert.equal(h.saves(), 0, 'late release after cancellation must not save');
}
for (const destination of ['own-cell', 'occupied', 'hidden']) {
    const h = createHarness();
    if (destination === 'hidden') h.items[1].style.display = 'none';
    h.component.onPointerDown(h.event());
    const lateLostCapture = [...h.items[0].listeners.get('lostpointercapture')][0];
    h.document.emit('pointermove', h.event({ clientX: destination === 'own-cell' ? 20 : 106 }));
    h.document.emit('pointerup', h.event());
    const expectedX = destination === 'own-cell' ? 0 : destination === 'occupied' ? 192 : 96;
    assert.equal(h.component.positions[h.component.getPositionKey(h.component.links[0])].x, expectedX);
    assert.equal(h.saves(), destination === 'own-cell' ? 0 : 1);
    lateLostCapture(h.event());
    assert.equal(parseInt(h.items[0].style.left), expectedX, 'lostcapture after commit cannot roll the drag back');
    assert.equal(h.pointerListeners(), 0);
    assert(h.component._suppressClickUntil > Date.now());
}
for (const modifiers of [{ button: 2 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { isPrimary: false }]) {
    const h = createHarness(); const event = h.event(modifiers);
    h.component.onPointerDown(event);
    assert.equal(event.prevented, false);
    assert.equal(h.pointerListeners(), 0);
    assert.equal(h.items[0].captures, 0);
}
{
    const h = createHarness();
    const button = { closest(selector) { return selector.startsWith('button') ? this : h.items[0]; } };
    const event = h.event({ target: button });
    h.component.onPointerDown(event);
    assert.equal(event.prevented, false, 'edit/delete buttons keep ordinary click behavior');
    assert.equal(h.pointerListeners(), 0);
    h.component.onPointerDown(h.event());
    h.component.onPointerDown(h.event({ pointerId: 2 }));
    h.document.emit('pointermove', h.event({ pointerId: 2, clientX: 210 }));
    h.document.emit('pointerup', h.event({ pointerId: 2 }));
    assert.equal(h.pointerListeners(), 3, 'another pointer cannot finish or replace the active drag');
    assert.equal(h.items[0].captures, 1);
    assert.equal(h.items[0].style.left, '0px');
    h.document.emit('pointercancel', h.event());
    assert.equal(h.pointerListeners(), 0);
    const nativeDrag = h.event();
    h.component.handleDragStart(nativeDrag);
    assert.equal(nativeDrag.prevented, true, 'free mode suppresses competing native drag');
}
console.log('free drag tests ok (DOM event model)');
