const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
const context = { document: { addEventListener() {} }, window: { addEventListener() {} }, console };
vm.createContext(context);
vm.runInContext(fs.readFileSync('newtab.js', 'utf8') + '\nthis.ShortcutsComponent = ShortcutsComponent;', context);
const prototype = context.ShortcutsComponent.prototype;
const json = value => JSON.parse(JSON.stringify(value));
const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const rectangle = (x, y, width = 80, height = 80) => ({ x, y, width, height });
function verify(rectangles, width) {
    const before = json(rectangles);
    const points = json(prototype.fitFreeLayoutRectangles(rectangles, width));
    const fitted = rectangles.map((r, i) => ({ ...r, ...points[i] }));
    assert.deepEqual(rectangles, before, 'fitting never changes inputs');
    assert.deepEqual(json(prototype.fitFreeLayoutRectangles(rectangles, width)), points, 'deterministic repeat');
    for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
        if (overlap(rectangles[i], rectangles[j])) {
            assert.equal(fitted[i].x - fitted[j].x, rectangles[i].x - rectangles[j].x, 'intentional horizontal overlap preserved');
            assert.equal(fitted[i].y - fitted[j].y, rectangles[i].y - rectangles[j].y, 'intentional vertical overlap preserved');
        } else assert(!overlap(fitted[i], fitted[j]), `new overlap between ${i} and ${j}`);
    }
    return fitted;
}
assert.deepEqual(verify([rectangle(600, 0), rectangle(800, 0)], 288).map(({ x, y }) => ({ x, y })), [{ x: 208, y: 0 }, { x: 208, y: 96 }]);
verify([rectangle(600, 0), rectangle(208, 0), rectangle(208, 96), rectangle(208, 192)], 288);
verify([rectangle(600, 0, 120, 100), rectangle(650, 40), rectangle(800, 0, 40, 140)], 288);
verify([rectangle(600.25, 0.5), rectangle(800.75, 0.5)], 288.5);
verify([rectangle(-20, -10), rectangle(20, 30), rectangle(700, 0)], 288);
verify([rectangle(600, 0, 200), rectangle(780, 0, 200), rectangle(900, 200)], 288);
let seed = 71823;
const random = max => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; };
for (let run = 0; run < 150; run++) {
    const rectangles = Array.from({ length: 25 }, () => rectangle(random(1200), random(600), 30 + random(150), 30 + random(150)));
    for (const width of [180, 288, 600]) verify(rectangles, width);
    assert.deepEqual(json(prototype.fitFreeLayoutRectangles(rectangles, 2000)), rectangles.map(({ x, y }) => ({ x, y })), 'widen restores exact saved coordinates');
}

// Actual rendering entrypoint: identities keep duplicate URLs independent, the
// current category map is used, hidden items do not reserve space, Add follows
// fitted content, and no save is triggered in either manual placement mode.
for (const alignToGrid of [false, true]) {
    let width = 288, writes = 0;
    const links = [0, 1, 2].map(i => ({ url: 'https://example.com/same', layoutId: `id-${i}` }));
    const component = Object.create(prototype);
    Object.assign(component, { links, layout: { autoArrange: false, alignToGrid }, positions: {},
        identityPositions: { 'id-0': { all: { x: 600, y: 0 }, work: { x: 12, y: 40 } },
            'id-1': { all: { x: 800, y: 0 }, work: { x: 120, y: 40 } },
            'id-2': { all: { x: 208, y: 0 } } },
        getCurrentCategory: () => 'all', saveLayoutDebounced: () => { writes++; } });
    const items = [0, 1, 2, 3].map(i => ({ dataset: { index: String(i) },
        classList: { contains: name => name === 'add-shortcut' && i === 3 },
        style: { display: i === 2 ? 'none' : '' },
        getBoundingClientRect() { return { left: parseFloat(this.style.left) || 0, top: parseFloat(this.style.top) || 0, width: 80, height: i === 1 ? 100 : 80 }; } }));
    const grid = { style: {}, querySelectorAll: () => items, querySelector: () => items[3], getBoundingClientRect: () => ({ width, left: 0, top: 0 }) };
    component.gridEl = grid;
    const saved = json(component.identityPositions);
    component.applyVisibleTransformsFromPositions(); component.positionAddTile();
    assert.equal(items[0].style.top, '0px'); assert.equal(items[1].style.top, '96px'); assert.equal(items[3].style.top, '212px');
    width = 1000; component.applyVisibleTransformsFromPositions();
    assert.equal(items[0].style.left, '600px'); assert.equal(items[1].style.left, '800px');
    component.getCurrentCategory = () => 'work'; component.applyVisibleTransformsFromPositions();
    assert.equal(items[0].style.left, '12px'); assert.equal(items[1].style.left, '120px');
    assert.deepEqual(json(component.identityPositions), saved); assert.equal(writes, 0);
    // Oversized overlap is scrollable, with spare height for the scrollbar.
    component.getCurrentCategory = () => 'all'; width = 100;
    component.identityPositions['id-1'].all = { x: 670, y: 0 };
    component.applyVisibleTransformsFromPositions(); component.positionAddTile();
    assert.equal(grid.style.overflowX, 'auto');
    assert.equal(items[0].style.left, '0px'); assert.equal(items[1].style.left, '70px');
    width = 1000; component.applyVisibleTransformsFromPositions();
    assert.equal(grid.style.overflowX, ''); assert.equal(grid.style.overflowY, '');
    assert.equal(items[0].style.left, '600px'); assert.equal(items[1].style.left, '670px');
    assert.equal(writes, 0);
}
// 20k supported imported links: crowded row and dense intentional composition.
// Bound time generously to detect combinatorial regressions, not benchmark CI.
for (const dense of [false, true]) {
    const rectangles = Array.from({ length: 20000 }, (_, i) => rectangle(dense ? 600 : i * 96, dense ? i % 3 : 0));
    const start = performance.now();
    const fitted = prototype.fitFreeLayoutRectangles(rectangles, 288);
    assert.equal(fitted.length, rectangles.length);
    assert(performance.now() - start < 8000, '20k fitting should remain bounded');
    if (!dense) for (let i = 1; i < fitted.length; i++) assert(fitted[i].y >= fitted[i - 1].y || fitted[i].x >= fitted[i - 1].x + 80);
}
console.log('free layout fitting tests ok (geometry and DOM model; browser QA separate)');
