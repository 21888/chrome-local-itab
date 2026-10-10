(function (root) {
    'use strict';
    // A bounded arithmetic grammar, deliberately independent of browser APIs.
    // Number uses IEEE-754 doubles: results are approximate, not decimal money math.
    const MAX_LENGTH = 256;
    const MAX_DEPTH = 32;
    function calculate(expression) {
        if (typeof expression !== 'string') return { error: 'syntax' };
        if (expression.length > MAX_LENGTH) return { error: 'length' };
        let index = 0;
        const fail = code => { throw code; };
        const skip = () => { while (/\s/.test(expression[index] || '') && index < expression.length) index++; };
        const finite = value => Number.isFinite(value) ? value : fail('range');
        function primary(depth) {
            if (depth > MAX_DEPTH) fail('depth');
            skip();
            const char = expression[index];
            if (char === '+' || char === '-') {
                index++;
                const value = primary(depth + 1);
                return char === '-' ? -value : value;
            }
            if (char === '(') {
                index++;
                const value = sum(depth + 1);
                skip();
                if (expression[index++] !== ')') fail('syntax');
                return value;
            }
            // Optional exponent belongs to this literal; its sign is not a unary operator.
            // The whole literal remains bounded by MAX_LENGTH, including exponent digits.
            const match = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(expression.slice(index));
            if (!match) fail('syntax');
            index += match[0].length;
            return finite(Number(match[0]));
        }
        function product(depth) {
            let value = primary(depth);
            while (true) {
                skip();
                const operator = expression[index];
                if (operator !== '*' && operator !== '/') return value;
                index++;
                const right = primary(depth);
                if (operator === '/' && right === 0) fail('zero');
                value = finite(operator === '*' ? value * right : value / right);
            }
        }
        function sum(depth) {
            let value = product(depth);
            while (true) {
                skip();
                const operator = expression[index];
                if (operator !== '+' && operator !== '-') return value;
                index++;
                const right = product(depth);
                value = finite(operator === '+' ? value + right : value - right);
            }
        }
        try {
            const value = sum(0);
            skip();
            if (index !== expression.length) fail('syntax');
            return { value: Object.is(value, -0) ? 0 : value };
        } catch (error) {
            return { error: ['syntax', 'depth', 'zero', 'range'].includes(error) ? error : 'syntax' };
        }
    }
    root.LocalItabCalculator = Object.freeze({ calculate, MAX_LENGTH, MAX_DEPTH });
})(window);
