const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const root = path.resolve(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'options.css'), 'utf8');
function block(selector) {
    const start = css.indexOf(selector + ' {');
    assert(start >= 0, selector);
    return css.slice(start + selector.length + 2, css.indexOf('}', start));
}
function luminance(hex) {
    const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
        .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + 0.05) / (values[1] + 0.05);
}
const base = block('.message');
const light = block(':root[data-color-mode="light"] .message,\n:root:not([data-color-mode])[data-theme="ink-paper"] .message');
for (const [mode, declarations] of [['dark', base], ['light', light]]) {
    for (const kind of ['error', 'success', 'info']) {
        test(`${mode} ${kind} toast has opaque text/background contrast above WCAG AA`, () => {
            const color = suffix => declarations.match(new RegExp(`--message-${kind}-${suffix}: (#[0-9a-f]{6});`))?.[1];
            assert(color('text')); assert(color('bg'));
            const ratio = contrast(color('text'), color('bg'));
            assert(ratio >= 4.5, `${mode} ${kind}: ${ratio.toFixed(2)}:1`);
            const bindings = kind === 'info' ? base : block(`.message-${kind}`);
            assert(bindings.includes(`color: var(--message-${kind}-text);`));
            assert(bindings.includes(`background: var(--message-${kind}-bg);`));
            console.log(`${mode} ${kind}: ${ratio.toFixed(2)}:1`);
        });
    }
}
test('toast width includes padding and borders, with room for long unbroken text', () => {
    assert(base.includes('width: min(360px, calc(100vw - 40px));'));
    assert(base.includes('box-sizing: border-box;'));
    assert(base.includes('overflow-wrap: anywhere;'));
    assert(base.includes('white-space: normal;'));
    assert(base.includes('line-height: 1.5;'));
    assert(block('.toast-container').includes('right: 20px;'));
    for (const viewport of [240, 320, 375, 768]) {
        const width = Math.min(360, viewport - 40);
        assert(viewport - 20 - width >= 20);
        assert(width - 28 - 2 > 0);
    }
});
test('production messages preserve literal text, semantics and existing dismissal timing', () => {
    const document = createDocument(), timers = [];
    const container = document.createElement('div'); container.id = 'toast-container'; document.body.append(container);
    // The shared DOM model provides parentElement/remove, not these native aliases.
    container.removeChild = node => node.remove();
    const context = { document, window: {}, console, setTimeout: (fn, delay) => timers.push({ fn, delay }) };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'options.js'), 'utf8'), context);
    for (const type of ['error', 'success', 'info']) {
        const message = '<script>literal</script> 保存失败 ' + 'X'.repeat(400);
        context.showMessage(message, type);
        const node = container.children[container.children.length - 1];
        Object.defineProperty(node, 'parentNode', { get: () => node.parentElement });
        assert.equal(node.className, `message message-${type}`);
        assert.equal(node.textContent, message);
        assert.equal(node.getAttribute('role'), type === 'error' ? 'alert' : 'status');
        const timer = timers[timers.length - 1]; assert.equal(timer.delay, 3000);
        timer.fn(); assert(!container.children.includes(node));
    }
});
