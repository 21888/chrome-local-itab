'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createDocument } = require('./helpers/dashboard-harness');

function fixture() {
    const document = createDocument();
    const node = (tag, id, classes = '') => {
        const element = document.createElement(tag);
        element.id = id;
        element.className = classes;
        return element;
    };
    const root = node('section', 'root', 'hit');
    const branch = node('div', 'branch');
    const first = node('button', 'duplicate', 'hit selected');
    const nested = node('a', 'nested', 'hit');
    const second = node('button', 'duplicate', 'hit excluded');
    const last = node('input', 'last');
    first.dataset.action = 'open';
    first.setAttribute('aria-label', 'Open');
    nested.href = 'https://example.invalid/';
    second.inert = true;
    first.append(nested);
    branch.append(first);
    root.append(branch, second, last);
    document.body.append(root);
    return { document, root, branch, first, nested, second, last };
}

// Count model work deterministically; this does not measure browser performance.
function trackMatches(root) {
    const visits = [];
    const wrap = node => {
        const matches = node.matches;
        node.matches = function (selector) {
            visits.push(this);
            return matches.call(this, selector);
        };
        node.children.forEach(wrap);
    };
    wrap(root);
    return visits;
}

test('queries preserve descendant-only depth-first order and existing selector matching', () => {
    const { document, root, branch, first, nested, second, last } = fixture();
    const cases = [
        ['.hit', [first, nested, second]],
        ['#duplicate', [first, second]],
        ['button', [first, second]],
        ['.hit.selected', [first]],
        ['.hit:not(.excluded)', [first, nested]],
        ['[data-action]', [first]],
        ['[data-action="open"]', [first]],
        ['[aria-label="Open"]', [first]],
        ['[inert]', [second]],
        ['a[href]', [nested]],
        ['input, .hit, button, .hit', [first, nested, second, last]],
        ['#root', []],
        ['.missing', []]
    ];
    for (const [selector, expected] of cases) {
        assert.deepEqual(root.querySelectorAll(selector), expected, selector);
        assert.equal(root.querySelector(selector), expected[0] || null, selector);
    }
    assert.deepEqual(document.querySelectorAll('.hit'), [root, first, nested, second]);
    assert.equal(document.querySelector('.hit'), root);
    assert.equal(document.getElementById('duplicate'), first);
    assert.equal(document.getElementById('missing'), null);
    assert.deepEqual(last.querySelectorAll('input'), []);
    assert.equal(last.querySelector('input'), null);
    assert.equal(branch.querySelector('.hit'), first);
});

test('query results are independent static snapshots and detached descendants remain queryable', () => {
    const { document, root, first, nested, second, last } = fixture();
    const snapshot = root.querySelectorAll('.hit');
    const separate = root.querySelectorAll('.hit');
    assert.notEqual(snapshot, separate);
    first.remove();
    last.className = 'hit';
    assert.deepEqual(snapshot, [first, nested, second]);
    assert.deepEqual(root.querySelectorAll('.hit'), [second, last]);
    snapshot.pop();
    assert.deepEqual(separate, [first, nested, second]);
    assert.deepEqual(root.querySelectorAll('.hit'), [second, last]);
    assert.equal(first.isConnected, false);
    assert.deepEqual(first.querySelectorAll('.hit'), [nested]);
    assert.equal(first.querySelector('.hit'), nested);
    assert.equal(document.getElementById('duplicate'), second);
    root.remove();
    assert.deepEqual(document.querySelectorAll('.hit'), []);
    assert.equal(document.getElementById('duplicate'), null);
    assert.equal(root.querySelector('#duplicate'), second);
});

test('all-results queries visit each descendant once and emit comma matches only once', () => {
    const { root, branch, first, nested, second, last } = fixture();
    const visits = trackMatches(root);
    assert.deepEqual(root.querySelectorAll('.hit, button, .hit'), [first, nested, second]);
    assert.deepEqual(visits, [branch, first, nested, second, last]);
    visits.length = 0;
    assert.deepEqual(root.querySelectorAll('.missing'), []);
    assert.deepEqual(visits, [branch, first, nested, second, last]);
});

test('first-match queries stop depth-first traversal as soon as a match is found', () => {
    const { document, root, branch, first, nested, second, last } = fixture();
    const visits = trackMatches(root);
    assert.equal(root.querySelector('#duplicate'), first);
    assert.deepEqual(visits, [branch, first]);
    visits.length = 0;
    assert.equal(root.querySelector('#nested, #duplicate'), first);
    assert.deepEqual(visits, [branch, first]);
    visits.length = 0;
    assert.equal(root.querySelector('#last'), last);
    assert.deepEqual(visits, [branch, first, nested, second, last]);
    visits.length = 0;
    assert.equal(root.querySelector('.missing'), null);
    assert.deepEqual(visits, [branch, first, nested, second, last]);
    visits.length = 0;
    assert.equal(document.getElementById('duplicate'), first);
    assert.deepEqual(visits, [root, branch, first]);
    visits.length = 0;
    assert.equal(document.querySelector('#nested'), nested);
    assert.deepEqual(visits, [root, branch, first, nested]);
});
