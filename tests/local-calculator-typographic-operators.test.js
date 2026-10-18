const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const parserSource = fs.readFileSync('shared/local-calculator.js', 'utf8');
const parserContext = vm.createContext({ window: {} });
vm.runInContext(parserSource, parserContext);
const { calculate, MAX_LENGTH, MAX_DEPTH } = parserContext.window.LocalItabCalculator;

test('only the three documented typographic operators extend arithmetic, unary signs and scientific literals', () => {
    for (const [expression, expected] of [
        ['2−1', 1], ['12×3', 36], ['12÷3', 4], ['(12×3−6)÷2', 15],
        ['−2×−3', 6], ['−(2+3)', -5], ['1−−2', 3], ['1+−2', -1],
        ['8÷2÷2', 2], ['8−2−1', 5], ['2*3×4/2÷2', 6], ['−0', 0],
        ['1e−7×2', 2e-7], ['−1E−2÷2', -0.005], ['.5e−1', 0.05],
        ['1.e−2', 0.01], ['1e−2−−2', 2.01], ['1e−324', 0]
    ]) assert.equal(calculate(expression).value, expected, expression);
});

test('aliases keep the original expression length and combined depth bounds', () => {
    assert.equal(MAX_LENGTH, 256); assert.equal(MAX_DEPTH, 32);
    assert.equal(calculate('1−0' + ' '.repeat(253)).value, 1);
    assert.equal(calculate('1−0' + ' '.repeat(254)).error, 'length');
    assert.equal(calculate('−'.repeat(32) + '1').value, 1);
    assert.equal(calculate('−'.repeat(33) + '1').error, 'depth');
    assert.equal(calculate('('.repeat(20) + '−'.repeat(12) + '1' + ')'.repeat(20)).value, 1);
    assert.equal(calculate('('.repeat(20) + '−'.repeat(13) + '1' + ')'.repeat(20)).error, 'depth');
    assert.equal(calculate('1e−' + '9'.repeat(253)).value, 0);
    assert.equal(calculate('1e−' + '9'.repeat(254)).error, 'length');
});

test('typographic division and minus retain zero, range and malformed-expression errors', () => {
    for (const expression of ['1÷0', '0÷0', '1÷−0', '1÷(2−2)', '1÷1e−324']) {
        assert.equal(calculate(expression).error, 'zero', expression);
    }
    for (const expression of ['−1e309', '1e308×10', '1e308÷1e−308']) {
        assert.equal(calculate(expression).error, 'range', expression);
    }
    for (const expression of ['×2', '2÷', '2××3', '1e−', '1e−−2', '1e− 2', '1 e−2', '1e−2(3)']) {
        assert.equal(calculate(expression).error, 'syntax', expression);
    }
});

test('no general Unicode normalization, implicit multiplication or executable syntax is introduced', () => {
    for (const expression of ['２−１', '2＋1', '2／1', '2＊1', '2﹣1', '2－1', '2–1', '2—1',
        '2‐1', '2·3', '2⋅3', '2∙3', '2∕1', '2⁄1', '2x3', '2(3)', '2²', '½+1',
        '2\u200b−1', '2\u202e−1', '2%', '2,5', '=2−1', 'Math.PI', 'alert(1)', '<img src=x>', '1;2']) {
        assert.equal(calculate(expression).error, 'syntax', expression);
    }
    const value = { toString() { throw new Error('must not coerce'); } };
    assert.equal(calculate(value).error, 'syntax');
    assert.equal(calculate(null).error, 'syntax');
    assert(!/\b(?:eval|Function|fetch|XMLHttpRequest|localStorage|chrome|document|open|sendBeacon)\s*[.(]/.test(parserSource));
    assert(!/\.normalize\s*\(/.test(parserSource));
});

// Real search initializer with the existing bounded DOM model. This does not
// model native paste, keyboard activation, IME or operating-system clipboard.
function mount(locale, engine = 'custom', custom = '') {
    const document = createDocument(), events = new Map(), observers = new Set();
    document.body.prepend = (...nodes) => document.body.append(...nodes);
    const host = document.createElement('section'); host.id = 'search-container'; document.body.append(host);
    const messages = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
    const io = [], opens = [], copies = [], reloads = [];
    const forbidden = () => { io.push('forbidden'); throw new Error('Unexpected I/O'); };
    const window = {
        i18n: { t: key => messages[key]?.message || key },
        navigator: { clipboard: { writeText(text) { copies.push(text); return Promise.resolve(); }, readText: forbidden } },
        addEventListener(type, fn) { if (!events.has(type)) events.set(type, new Set()); events.get(type).add(fn); },
        removeEventListener(type, fn) { events.get(type)?.delete(fn); },
        open(...args) { opens.push(args); return { closed: false }; },
        location: { reload() { reloads.push('reload'); } }, confirm: () => false,
        getComputedStyle(node) { return { visibility: node.style.visibility || 'visible', display: node.style.display || 'block' }; },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; }
            observe() { observers.add(this); } disconnect() { observers.delete(this); } takeRecords() { return []; }
        }
    };
    const context = vm.createContext({ window, document, URL, console, encodeURIComponent,
        navigator: window.navigator, i18n: window.i18n, fetch: forbidden, XMLHttpRequest: forbidden,
        localStorage: { getItem: forbidden, setItem: forbidden }, storageManager: { get: forbidden, set: forbidden } });
    window.storageManager = context.storageManager; window.fetch = forbidden; document.execCommand = forbidden;
    for (const file of ['shared/search-template.js', 'shared/local-calculator.js', 'shared/local-content-lifecycle.js', 'newtab.js']) {
        vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    }
    context.initializeSearchComponent({ engine, custom });
    const input = host.querySelector('.search-input'), form = host.querySelector('form');
    input.setSelectionRange = (start, end) => { input.selectionStart = start; input.selectionEnd = end; };
    return { window, document, host, input, form, io, opens, copies, reloads, messages, observers, events,
        value: host.querySelector('.search-calculator-value'), output: host.querySelector('.search-calculator-output'),
        status: host.querySelector('.search-calculator-status'), recent: host.querySelector('.search-calculator-recent'),
        rows() { return host.querySelectorAll('.search-calculator-recent-item'); },
        edit(text) { input.value = text; input.dispatch('input'); },
        submit() { assert(form.dispatch('submit').prevented); } };
}
function records(h) { return h.rows().map(row => [row.querySelector('.search-calculator-recent-expression').textContent, row.querySelector('.search-calculator-recent-value').textContent]); }
function noIO(h) { assert.deepEqual(h.io, []); assert.deepEqual(h.opens, []); assert.deepEqual(h.reloads, []); }
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

for (const locale of ['en', 'zh_CN']) {
    test(`${locale}: explicit calculation preserves typographic draft and recent original text through edit and copy`, async () => {
        const h = mount(locale), raw = ' \t= (12×3−6)÷2 \t'; h.input.focus(); h.edit(raw);
        assert.equal(h.status.textContent, h.messages.calculatorHint.message);
        for (const symbol of ['×', '÷', '−']) assert(h.status.textContent.includes(symbol));
        assert.deepEqual(records(h), []); assert.equal(h.output.hidden, true); h.submit();
        assert.equal(h.value.value, '15'); assert.equal(h.input.value, raw); assert.equal(h.document.activeElement, h.input);
        assert.deepEqual(records(h), [[raw, '15']]); assert.deepEqual(h.copies, []); noIO(h);
        assert.equal(h.window.LocalItabContentLifecycle.reload(), false); assert.equal(h.input.value, raw); noIO(h);
        h.recent.open = true; h.rows()[0].querySelector('.search-calculator-recent-copy').dispatch('click'); await settle();
        assert.deepEqual(h.copies, [raw + '\n15']); assert.equal(h.input.value, raw); assert.equal(h.document.activeElement, h.input);
        assert.equal(h.rows()[0].querySelector('.search-calculator-recent-copy-status').textContent, h.messages.calculatorRecentCopySuccess.message);
        h.edit('new unfinished draft');
        assert.equal(h.observers.size, 0);
        for (const type of ['blur', 'pagehide']) assert.equal(h.events.get(type)?.size || 0, 0);
        assert.equal(h.document.listeners.has('visibilitychange'), false);
        h.rows()[0].querySelector('.search-calculator-recent-edit').dispatch('click');
        assert.equal(h.input.value, raw); assert.equal(h.input.selectionStart, raw.length); assert.equal(h.input.selectionEnd, raw.length);
        assert.equal(h.output.hidden, true); assert.deepEqual(records(h), [[raw, '15']]); assert.equal(h.document.activeElement, h.input);
        h.submit(); assert.equal(h.value.value, '15'); assert.deepEqual(records(h), [[raw, '15'], [raw, '15']]);
        h.rows()[0].querySelector('.search-calculator-recent-use').dispatch('click');
        assert.equal(h.input.value, '=15'); assert.equal(h.output.hidden, true); assert.equal(records(h).length, 2);
        h.edit(h.input.value + '×2'); h.submit(); assert.equal(h.value.value, '30'); noIO(h);
    });

    test(`${locale}: composition, malformed aliases and unsupported lookalikes never navigate or replace successful history`, () => {
        const h = mount(locale); h.input.focus(); h.edit('=1e−7×2'); h.submit();
        assert.equal(h.value.value, '2e-7'); const previous = records(h);
        h.edit('=2×3'); h.input.dispatch('compositionstart'); h.submit();
        assert.equal(h.output.hidden, true); assert.deepEqual(records(h), previous);
        assert(h.input.dispatch('keydown', { key: 'Enter', isComposing: true }).prevented);
        h.input.dispatch('compositionend'); assert.deepEqual(records(h), previous);
        h.submit(); assert.equal(h.value.value, '6'); const successful = records(h);
        for (const expression of ['=1÷0', '=1e−', '=2××3', '=2—1', '=２−１', '=alert(1)', '=−1e309', '=' + '−'.repeat(33) + '1']) {
            h.edit(expression); h.submit(); assert.equal(h.input.value, expression); assert.equal(h.output.hidden, true);
            assert(h.status.classList.contains('is-error')); assert.deepEqual(records(h), successful);
            assert.equal(h.document.activeElement, h.input); noIO(h); assert.deepEqual(h.copies, []);
        }
    });

    test(`${locale}: typographic expressions without explicit equals remain ordinary search on every configured engine`, () => {
        for (const engine of ['google', 'bing', 'duck', 'custom']) {
            const h = mount(locale, engine, 'https://example.com/?q=%s'), raw = '(12×3−6)÷2'; h.edit(raw); h.submit();
            assert.equal(h.opens.length, 1); assert(h.opens[0][0].endsWith('q=' + encodeURIComponent(raw)));
            assert.deepEqual(records(h), []); assert.equal(h.output.hidden, true); assert.equal(h.input.value, raw);
            assert.deepEqual(h.io, []); assert.deepEqual(h.copies, []);
        }
    });
}
