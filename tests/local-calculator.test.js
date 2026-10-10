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
for (const expression of ['', ' ', '.', '1..2', '1 2', '2(3)', '(2)3', '()', '(1', '1)', '2**3', '0xff', 'NaN', 'Infinity', 'alert(1)', '1,5', '1%', '1=1', '1;2', 'Math.PI', '2−1', '=1', '<img src=x>', '1//2']) assert.equal(calculate(expression).error,'syntax',expression);
for (const expression of ['1/0','0/0','1/-0','1/(2-2)']) assert.equal(calculate(expression).error,'zero');
assert.equal(calculate('1'+'/(.1+.2-.3)'.repeat(20)).error,'range');
assert.equal(calculate('1'.repeat(257)).error,'length');
assert.equal(calculate('('.repeat(33)+'1'+')'.repeat(33)).error,'depth');
assert.equal(calculate('-'.repeat(33)+'1').error,'depth');
assert.equal(calculate('('.repeat(20)+'-'.repeat(13)+'1'+')'.repeat(20)).error,'depth');
assert.equal(calculate(null).error,'syntax');
// Scientific literals preserve the existing decimal, operator and resource bounds.
for (const [expression, expected] of [
    ['1e2',100], ['1E+2',100], ['1e-2',0.01], ['.5e1',5], ['1.e2',100],
    ['-1e-2',-0.01], ['1e2--2',102], ['1e2+-2',98], ['1e+2+3',103],
    ['1e-2*-2',-0.02], ['(1E2+2)/2',51], ['1e0002',100],
    ['5e-324',Number.MIN_VALUE], ['1.7976931348623157e308',Number.MAX_VALUE],
    ['1e-324',0], ['-1e-999',0], ['0e999',0],
    ['1e+'+'0'.repeat(252)+'2',100], ['1e-'+'9'.repeat(253),0],
    ['-'.repeat(32)+'1e-2',0.01]
]) assert.equal(calculate(expression).value, expected, expression);
for (const expression of ['1e','1E+','1e-','1e--2','1e+-2','1e++2','1e-+2',
    '1e 2','1 e2','1e+ 2','1e2.3','1e.2','1e2e3','e2','1e2(3)',
    '(1)e2','1e2 3','1e2foo','1eInfinity','1eNaN']) {
    assert.equal(calculate(expression).error,'syntax',expression);
}
for (const expression of ['1e309','-1e309','1e+'+'9'.repeat(253),'1e308*10']) {
    assert.equal(calculate(expression).error,'range',expression);
}
assert.equal(calculate('1/1e-324').error,'zero','underflow stays IEEE-754 zero');
assert.equal(calculate('1e+'+'0'.repeat(253)+'2').error,'length');
assert.equal(calculate('-'.repeat(33)+'1e-2').error,'depth');
assert.equal(calculate('1+'.repeat(127)+'1').value,128,'existing flat expression bound');
// Every finite displayed Number remains usable as an exact literal, then in arithmetic.
for (const expression of ['1/10000000','1000000000000000000000','-1e-100',
    '0.1+0.2','5e-324','1.7976931348623157e308','-0','1e-999']) {
    const value = calculate(expression).value;
    assert(Number.isFinite(value),expression);
    const literal = String(value);
    assert.equal(calculate(literal).value,value,literal);
    assert.equal(calculate('('+literal+')*1').value,value,literal);
}
// The entire evaluator is dependency-free and has no I/O or code execution surface.
const source = fs.readFileSync('shared/local-calculator.js','utf8');
assert(!/\b(?:eval|Function|Math|fetch|XMLHttpRequest|localStorage|chrome|document|open|sendBeacon)\s*[.(]/.test(source));
console.log('PASS: local calculator grammar, precedence, limits, local errors, floating-point behavior and no-I/O source boundary');
