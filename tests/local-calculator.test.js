const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = {window: {}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('shared/local-calculator.js', 'utf8'), context);
const {calculate, MAX_LENGTH, MAX_DEPTH} = context.window.LocalItabCalculator;
assert.equal(MAX_LENGTH, 256); assert.equal(MAX_DEPTH, 32);
for (const [expression, expected] of [
    ['1+2*3',7], ['(1+2)*3',9], ['8/2/2',2], ['8-2-1',5],
    ['.5 + 1.',1.5], ['  - (2 + +3) * -2 ',10], ['1--2',3],
    ['1+-2',-1], ['-0',0], ['0.1+0.2',0.30000000000000004],
    ['('.repeat(32)+'1'+')'.repeat(32),1], ['-'.repeat(32)+'1',1],
    ['1'+' '.repeat(255),1]
]) assert.equal(calculate(expression).value, expected, expression);
for (const expression of ['', ' ', '.', '1..2', '1 2', '2(3)', '(2)3', '()', '(1', '1)', '2**3', '1e2', '0xff', 'NaN', 'Infinity', 'alert(1)', '1,5', '1%', '1=1', '1;2', 'Math.PI', '2−1', '=1', '<img src=x>', '1//2']) assert.equal(calculate(expression).error,'syntax',expression);
for (const expression of ['1/0','0/0','1/-0','1/(2-2)']) assert.equal(calculate(expression).error,'zero');
assert.equal(calculate('1'+'/(.1+.2-.3)'.repeat(20)).error,'range');
assert.equal(calculate('1'.repeat(257)).error,'length');
assert.equal(calculate('('.repeat(33)+'1'+')'.repeat(33)).error,'depth');
assert.equal(calculate('-'.repeat(33)+'1').error,'depth');
assert.equal(calculate('('.repeat(20)+'-'.repeat(13)+'1'+')'.repeat(20)).error,'depth');
assert.equal(calculate(null).error,'syntax');
// The entire evaluator is dependency-free and has no I/O or code execution surface.
const source = fs.readFileSync('shared/local-calculator.js','utf8');
assert(!/\b(?:eval|Function|fetch|XMLHttpRequest|localStorage|chrome|document|open|sendBeacon)\s*[.(]/.test(source));
console.log('PASS: local calculator grammar, precedence, limits, local errors, floating-point behavior and no-I/O source boundary');
