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
function createHarness({ width = 288, height = 288, tileWidth = 80, tileHeight = 80, gridSize = 96 } = {}) {
    const document = { ...eventTarget(), getElementById(id) { return id === 'shortcuts-grid' ? grid : null; } };
    const frames = new Map();
    let nextFrame = 0;
    const window = { ...eventTarget(), requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; }, cancelAnimationFrame(id) { frames.delete(id); } };
    const frame = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); };
    const context = { document, window, storageManager: { defaultConfig: { layout: { columns: 6 } } }, console };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent; this.errors = []; showErrorMessage = message => errors.push(message);', context);
    const items = [0, 1].map(index => ({
        ...eventTarget(), dataset: { index: String(index) },
        classList: classes('shortcut-item'),
        style: { left: `${index * 96}px`, top: '0px', transform: 'translate(0px, 0px)', display: 'flex' },
        closest(selector) { return selector.startsWith('.shortcut-item') ? this : null; },
        getBoundingClientRect() { return { left: index * 96, top: 0, width: tileWidth, height: tileHeight }; },
        captures: 0, releases: 0,
        setPointerCapture() { this.captures++; },
        releasePointerCapture(pointerId) { this.releases++; this.emit('lostpointercapture', { pointerId }); }
    }));
    const grid = {
        ...eventTarget(), classList: classes(), style: { removeProperty() {} },
        contains(item) { return items.includes(item); }, querySelector() { return null; }, querySelectorAll(selector) { return selector.startsWith('.shortcut-item') ? items : []; },
        getBoundingClientRect() { return { left: 0, top: 0, width, height }; },
        replaceChildren() {}
    };
    const component = new context.ShortcutsComponent(['A', 'B'].map(title => ({ title, url: `https://example.com/${title}` })), { autoArrange: false, alignToGrid: true, gridSize });
    component.gridEl = grid;
    component.positions = { [component.getPositionKey(component.links[0])]: { x: 0, y: 0 }, [component.getPositionKey(component.links[1])]: { x: 96, y: 0 } };
    let saves = 0, opens = 0;
    component.saveLayoutDebounced = () => { saves++; };
    component.openShortcut = () => { opens++; };
    // A synthetic release defaults to the last delivered endpoint, as an
    // unchanged real pointer does; tests may explicitly provide a newer one.
    let clientX = 10, clientY = 10;
    const emit = document.emit;
    document.emit = (type, event) => {
        if (type === 'pointermove' && event.pointerId === 1) { clientX = event.clientX; clientY = event.clientY; }
        emit(type, event);
    };
    const event = (overrides = {}) => ({
        pointerId: 1, button: 0, isPrimary: true, clientX, clientY, target: items[0],
        prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...overrides
    });
    const pointerListeners = () => ['pointermove', 'pointerup', 'pointercancel'].reduce((sum, type) => sum + (document.listeners.get(type)?.size || 0), 0);
    return { component, context, document, window, frames, frame, grid, items, event, pointerListeners, saves: () => saves, opens: () => opens };
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
    const button = { classList: classes(), closest(selector) { return selector.startsWith('button') ? this : h.items[0]; } };
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
// Final placement must fit the full tile, including after snapping or a resize.
for (const size of [146, 170, 191, 200, 288]) {
    const h = createHarness({ width: size, height: size });
    h.items[1].style.display = 'none';
    h.component.onPointerDown(h.event());
    h.document.emit('pointermove', h.event({ clientX: size, clientY: size }));
    h.document.emit('pointerup', h.event());
    const position = h.component.positions[h.component.getPositionKey(h.component.links[0])];
    assert(position.x >= 0 && position.y >= 0);
    assert(position.x + 80 <= size && position.y + 80 <= size, `tile overflow at ${size}px`);
    assert.equal(position.x % 96, 0);
    assert.equal(position.y % 96, 0);
}
{
    const h = createHarness();
    h.items[1].style.display = 'none';
    h.component.onPointerDown(h.event());
    h.document.emit('pointermove', h.event({ clientX: 270, clientY: 270 }));
    h.grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: 146, height: 146 });
    h.document.emit('pointerup', h.event());
    assert.equal(h.items[0].style.left, '0px', 'drop uses current bounds after resize');
    assert.equal(h.items[0].style.top, '0px');
}
{
    const h = createHarness({ width: 240, height: 240, gridSize: 48 });
    const result = h.component.avoidOverlap(96, 0, 48, { width: 240, height: 240, tileWidth: 80, tileHeight: 80 }, h.component.getPositionKey(h.component.links[0]));
    assert(result.x + 80 <= 240 && result.y + 80 <= 240);
    assert(!(result.x < 176 && result.x + 80 > 96 && result.y < 80 && result.y + 80 > 0), 'nearby grid cells may still overlap a wider tile');
}
{
    const h = createHarness({ width: 96, height: 96 });
    h.component.positions[h.component.getPositionKey(h.component.links[1])] = { x: 0, y: 0 };
    h.items[1].getBoundingClientRect = () => ({ left: 0, top: 0, width: 80, height: 80 });
    const original = { ...h.items[0].style };
    h.component.onPointerDown(h.event());
    h.document.emit('pointermove', h.event({ clientX: 80, clientY: 80 }));
    h.document.emit('pointerup', h.event());
    assert.deepEqual(h.items[0].style, original, 'no fitting cell restores the original position');
    assert.equal(h.saves(), 0);
    assert.equal(h.context.errors.length, 1);
    assert.equal(h.pointerListeners(), 0);
}
{
    const h = createHarness();
    h.items[1].style.display = 'none';
    const bounds = { width: 288, height: 1e9, tileWidth: 80, tileHeight: 80 };
    const result = h.component.avoidOverlap(192, 999999936, 96, bounds, h.component.getPositionKey(h.component.links[0]));
    assert(result.y + 80 <= bounds.height, 'huge sparse canvases are searched lazily');
    assert.equal(h.component.avoidOverlap(0, 0, 96, { ...bounds, height: Infinity }), null);
    assert.equal(h.component.avoidOverlap(0, 0, 96, { ...bounds, width: 40 }), null);
}
// Template/resize fitting changes display only; legacy snapping must collide
// against the fitted rectangle rather than the still-preserved off-canvas data.
{
    const h = createHarness();
    const key = h.component.getPositionKey(h.component.links[1]);
    h.component.positions[key] = { x: 800, y: 0 };
    h.items[1].getBoundingClientRect = () => ({ left: parseFloat(h.items[1].style.left), top: parseFloat(h.items[1].style.top), width: 80, height: 80 });
    h.component.applyVisibleTransformsFromPositions();
    assert.equal(h.items[1].style.left, '208px');
    const result = h.component.avoidOverlap(192, 0, 96, { width: 288, height: 288, tileWidth: 80, tileHeight: 80 }, h.component.getPositionKey(h.component.links[0]));
    assert(result);
    assert(!(result.x < 288 && result.x + 80 > 208 && result.y < 80 && result.y + 80 > 0));
    assert.deepEqual(h.component.positions[key], { x: 800, y: 0 });
}
// Compare lazy search with a bounded exhaustive oracle on small deterministic grids.
for (let sample = 0; sample < 60; sample++) {
    const width = 140 + (sample * 37) % 280;
    const height = 140 + (sample * 53) % 280;
    const gs = sample % 2 ? 48 : 96;
    const h = createHarness({ width, height, gridSize: gs });
    const obstacle = { x: (sample * 29) % width, y: (sample * 19) % height };
    h.component.positions[h.component.getPositionKey(h.component.links[1])] = obstacle;
    h.items[1].getBoundingClientRect = () => ({ left: obstacle.x, top: obstacle.y, width: 80, height: 80 });
    const x = (sample * 67) % width;
    const y = (sample * 41) % height;
    const result = h.component.avoidOverlap(x, y, gs, { width, height, tileWidth: 80, tileHeight: 80 }, h.component.getPositionKey(h.component.links[0]));
    let nearest = Infinity;
    for (let top = 0; top + 80 <= height; top += gs) {
        for (let left = 0; left + 80 <= width; left += gs) {
            if (left < obstacle.x + 80 && left + 80 > obstacle.x && top < obstacle.y + 80 && top + 80 > obstacle.y) continue;
            nearest = Math.min(nearest, (left - x) ** 2 + (top - y) ** 2);
        }
    }
    if (!Number.isFinite(nearest)) assert.equal(result, null);
    else {
        assert(result, `missing free cell for sample ${sample}`);
        assert.equal((result.x - x) ** 2 + (result.y - y) ** 2, nearest, `not nearest for sample ${sample}`);
    }
}
console.log('free drag tests ok (DOM event model)');

// True Free placement retains exact pixel coordinates regardless of snap size.
for (const gridSize of [48, 96, 192, 240]) {
    const h = createHarness({ gridSize });
    h.component.layout.alignToGrid = false;
    h.component.onPointerDown(h.event());
    h.document.emit('pointermove', h.event({ clientX: 51.625, clientY: 73.375 }));
    h.document.emit('pointerup', h.event());
    assert.deepEqual(JSON.parse(JSON.stringify(h.component.positions[h.component.getPositionKey(h.component.links[0])])), { x: 41.625, y: 63.375 });
    assert.equal(h.saves(), 1);
}

// Narrow fitting is presentation-only until the adjusted tile is deliberately
// dragged. Cancellation restores the painted start and leaves raw maps intact.
for (const alignToGrid of [false, true]) for (const cancel of [false, true]) {
    const h = createHarness({ height: 600 });
    h.component.layout.alignToGrid = alignToGrid;
    h.component.links.forEach((link, i) => { link.layoutId = `fitted-${i}`; link.url = 'https://example.com/duplicate'; });
    h.component.identityPositions = { 'fitted-0': { all: { x: 600, y: 0 } }, 'fitted-1': { all: { x: 800, y: 0 } } };
    h.items.forEach(item => { item.getBoundingClientRect = () => ({ left: parseFloat(item.style.left), top: parseFloat(item.style.top), width: 80, height: 80 }); });
    h.component.applyVisibleTransformsFromPositions();
    const before = JSON.stringify(h.component.identityPositions);
    const painted = { ...h.items[1].style };
    assert.equal(painted.top, '96px');
    h.component.onPointerDown(h.event({ target: h.items[1], clientX: 218, clientY: 106 }));
    h.document.emit('pointermove', h.event({ target: h.items[1], clientX: 110, clientY: 210 }));
    h.document.emit(cancel ? 'pointercancel' : 'pointerup', h.event({ target: h.items[1] }));
    assert.equal(h.saves(), cancel ? 0 : 1);
    if (cancel) {
        assert.deepEqual(h.items[1].style, painted);
        assert.equal(JSON.stringify(h.component.identityPositions), before);
    } else {
        assert.equal(h.component.identityPositions['fitted-0'].all.x, 600);
        assert.equal(h.component.identityPositions['fitted-1'].all.x, alignToGrid ? 96 : 100);
        assert.equal(h.component.identityPositions['fitted-1'].all.y, alignToGrid ? 192 : 200);
    }
    assert.equal(h.pointerListeners(), 0);
}

// The right-hand member of an oversized intentional composition remains
// draggable after horizontal scrolling; a tiny move must not jump to x=208.
for (const alignToGrid of [false, true]) {
    const h = createHarness({ height: 600 });
    h.component.layout.alignToGrid = alignToGrid;
    h.grid.scrollLeft = 150; h.grid.scrollWidth = 500;
    h.items[0].style.left = '350px'; h.items[0].style.top = '192px';
    h.items.forEach(item => { item.getBoundingClientRect = () => ({ left: parseFloat(item.style.left) - h.grid.scrollLeft, top: parseFloat(item.style.top), width: 80, height: 80 }); });
    h.component.onPointerDown(h.event({ clientX: 210, clientY: 202 }));
    h.document.emit('pointermove', h.event({ clientX: 220, clientY: 202 }));
    assert.equal(h.items[0].style.left, '360px');
    h.document.emit('pointerup', h.event());
    assert.equal(h.component.getSavedPosition(h.component.links[0]).x, alignToGrid ? 384 : 360);
    assert.equal(h.saves(), 1);
}


// Live client-to-canvas coordinate model: the actual handlers see rectangles
// derived from CSS placement, ancestor movement and local canvas scroll.
function scrollingHarness(alignToGrid = false) {
    const h = createHarness({ width: 500, height: 1000 });
    h.component.layout.alignToGrid = alignToGrid;
    const geometry = { left: 30, top: 200, width: 500, height: 1000, tileWidth: 80, tileHeight: 80 };
    h.grid.scrollLeft = 0; h.grid.scrollTop = 0;
    h.grid.scrollWidth = 800; h.grid.scrollHeight = 1000;
    h.grid.getBoundingClientRect = () => ({ ...geometry });
    h.items.forEach(item => {
        item.getBoundingClientRect = () => ({
            left: geometry.left + parseFloat(item.style.left) - h.grid.scrollLeft,
            top: geometry.top + parseFloat(item.style.top) - h.grid.scrollTop,
            width: geometry.tileWidth, height: geometry.tileHeight
        });
    });
    h.component.links.forEach((link, i) => { link.layoutId = `scroll-${i}`; link.url = 'https://example.com/duplicate'; });
    h.component.identityPositions = { 'scroll-0': { all: { x: 0, y: 0 } }, 'scroll-1': { all: { x: 96, y: 0 } } };
    const saved = [];
    h.component.saveLayoutDebounced = (...args) => saved.push(args);
    h.component.positionAddTile = () => {};
    const down = h.event({ clientX: 40, clientY: 210 });
    const move = h.event({ clientX: 70, clientY: 250 });
    h.component.onPointerDown(down);
    return { ...h, geometry, saved, down, move };
}
for (const trigger of ['pointermove', 'document-scroll', 'nested-scroll', 'frame', 'pointerup']) {
    const h = scrollingHarness();
    h.document.emit('pointermove', h.move);
    h.geometry.top = 100;
    if (trigger === 'pointermove') h.document.emit('pointermove', h.move);
    if (trigger.endsWith('scroll')) h.document.emit('scroll', { target: trigger === 'nested-scroll' ? { scrollTop: 100 } : h.document });
    if (trigger === 'frame') h.frame();
    if (trigger !== 'pointerup') assert.equal(h.items[0].getBoundingClientRect().top, 240, `${trigger}: original grab point stays under a stationary pointer`);
    h.document.emit('pointerup', h.move);
    assert.deepEqual(JSON.parse(JSON.stringify(h.component.identityPositions['scroll-0'].all)), { x: 30, y: 140 });
    assert.equal(h.saved.length, 1);
    assert.equal(h.frames.size, 0);
    assert.equal(h.document.listeners.get('scroll').size, 0);
    assert.equal(h.window.listeners.get('resize').size, 0);
}
for (const alignToGrid of [false, true]) {
    const h = scrollingHarness(alignToGrid);
    const untouched = JSON.stringify(h.component.identityPositions['scroll-1']);
    h.document.emit('pointermove', h.move);
    h.geometry.left = -20; h.geometry.top = 100;
    h.grid.scrollLeft = 150; h.grid.scrollTop = 40;
    h.document.emit('scroll', { target: h.grid });
    assert.equal(h.items[0].getBoundingClientRect().left, 60);
    assert.equal(h.items[0].getBoundingClientRect().top, 240);
    assert.equal(h.saved.length, 0, 'scroll/frame tracking never writes');
    h.document.emit('pointerup', h.move);
    const position = h.component.identityPositions['scroll-0'].all;
    assert.equal(position.x, alignToGrid ? 192 : 230);
    assert.equal(position.y, alignToGrid ? 192 : 180);
    assert.equal(JSON.stringify(h.component.identityPositions['scroll-1']), untouched);
    assert.equal(h.saved.length, 1);
    assert.deepEqual(Object.keys(h.saved[0][0]), []);
    assert.deepEqual(Object.keys(h.saved[0][1]), ['["all","scroll-0"]']);
}
for (const end of ['pointercancel', 'lostpointercapture', 'detach']) {
    const h = scrollingHarness();
    const original = { ...h.items[0].style }, before = JSON.stringify(h.component.identityPositions);
    h.document.emit('pointermove', h.move);
    h.geometry.top = 100; h.grid.scrollLeft = 150;
    h.frame();
    const lateFrame = [...h.frames.values()][0];
    if (end === 'detach') h.component.detachFreeDrag();
    else (end === 'lostpointercapture' ? h.items[0] : h.document).emit(end, h.move);
    lateFrame();
    h.document.emit('scroll', {}); h.window.emit('resize', {}); h.document.emit('pointerup', h.move);
    assert.deepEqual(h.items[0].style, original);
    assert.equal(JSON.stringify(h.component.identityPositions), before);
    assert.equal(h.saved.length, 0);
    assert.equal(h.frames.size, 0);
    assert.equal(h.document.listeners.get('scroll').size, 0);
    assert.equal(h.window.listeners.get('resize').size, 0);
}
{
    const h = scrollingHarness();
    const original = { ...h.items[0].style };
    h.geometry.top = 100;
    h.document.emit('scroll', {}); h.window.emit('resize', {}); h.frame();
    h.document.emit('pointerup', h.down);
    assert.deepEqual(h.items[0].style, original, 'scroll without an intentional pointer drag does not reposition');
    assert.equal(h.saved.length, 0);
    assert.equal(h.frames.size, 0);
}
{
    const h = scrollingHarness();
    h.document.emit('pointermove', h.move);
    h.geometry.left = -600; h.geometry.top = -800;
    h.geometry.tileWidth = 120; h.geometry.tileHeight = 150;
    h.window.emit('resize', {});
    assert.equal(h.items[0].style.left, '660px');
    assert.equal(h.items[0].style.top, '850px', 'live resized tile clamps to current canvas bounds');
    h.document.emit('pointerup', h.move);
    assert.equal(h.component.identityPositions['scroll-0'].all.y, 850);
    assert.equal(h.saved.length, 1);
}
console.log('free drag live scroll, layout-shift, resize and cleanup tests ok');

{
    const h = scrollingHarness();
    h.document.emit('pointermove', h.move);
    h.geometry.top = 100;
    h.document.emit('pointerup', h.event({ clientX: 100, clientY: 300 }));
    assert.deepEqual(JSON.parse(JSON.stringify(h.component.identityPositions['scroll-0'].all)), { x: 60, y: 190 }, 'release uses its newest client endpoint and current canvas origin');
    assert.equal(h.saved.length, 1);
}
