const test = require('node:test');
const assert = require('node:assert/strict');
const Refinement = require('../shared/ai-prompt-refinement');
const { setup, add, tick } = require('./helpers/prompts-harness');
test('placeholder multiset includes count, exact spelling and parser semantics', () => {
    const source = { body: 'One {{topic}} and {{topic}}, literal \\{{other}}.' };
    assert.equal(Refinement.validateProposal(source, 'Clear {{topic}}, {{topic}}. Literal \\{{other}}.'), 'Clear {{topic}}, {{topic}}. Literal \\{{other}}.');
    for (const body of ['{{topic}} \\{{other}}', '{{topic}} {{ topic }} \\{{other}}', '{{topic}} \\{{topic}} {{other}}', '{{topic}} {{topic}} {{other}}']) assert.throws(() => Refinement.validateProposal(source, body), { code: 'PLACEHOLDERS' });
    assert.throws(() => Refinement.validateProposal(source, source.body), { code: 'UNCHANGED' });
    assert.throws(() => Refinement.request(source, '  '), { code: 'INSTRUCTION' });
});
test('source body/version fencing is checked under existing store lock, including malicious identity reuse', async () => {
    const h = setup(); await h.controller.start(); await add(h.controller, 'Synthetic', 'Original {{topic}}');
    const source = Refinement.capture(h.controller), op = Refinement.operation(h.controller, source, 'Improved {{topic}}');
    const raw = h.raw; raw.records[0].body = 'Changed {{topic}}'; raw.records[0].history[0].body = raw.records[0].body;
    await h.backend.write(raw); await tick(); const writes = h.writes;
    await assert.rejects(h.store.mutate(op.command), { code: 'CONFLICT' }); assert.equal(h.writes, writes);
    h.controller.dispose(); assert.equal(Refinement.current(h.controller, source), false);
});
test('source navigation and refresh invalidate proposal operation creation', async () => {
    const h = setup(); await h.controller.start(); await add(h.controller);
    const source = Refinement.capture(h.controller); await h.controller.refresh();
    assert.throws(() => Refinement.operation(h.controller, source, 'New {{topic}} {{reader}} {{topic}}'), { code: 'STALE' });
    h.controller.dispose();
});
test('nested and unmatched placeholder text cannot turn into live variables', () => {
    for (const [body, proposal] of [['Literal {{{{topic}}}}', 'Literal {{topic}}'], ['Literal {{topic', 'Literal {{topic}}'], ['{{topic}} plus {{{{other}}}}', '{{{{topic}}}} plus {{other}}']]) {
        assert.throws(() => Refinement.validateProposal({ body }, proposal), { code: 'PLACEHOLDERS' });
    }
});
