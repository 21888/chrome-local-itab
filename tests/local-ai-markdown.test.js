const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const Markdown = require('../shared/local-ai-markdown.js');

function prompt(changes = {}) {
    return {
        id: 'prompt_record_1', type: 'prompt', version: 'editor_fence_1', revision: 2,
        title: 'Saved title', body: 'Saved current body', tags: ['first', 'second'],
        category: 'Learning', tool: 'Manual', favorite: true,
        createdAt: '2026-10-10T12:00:00.000Z', updatedAt: '2026-10-11T01:00:00.000Z', deletedAt: null,
        currentVersionId: 'body_version_2',
        history: [{ id: 'body_version_1', body: 'PRIVATE_OLD_BODY', createdAt: '2026-10-10T12:00:00.000Z' }],
        ...changes
    };
}
function collection(changes = {}) {
    const { category, favorite, ...record } = prompt();
    return {
        ...record, id: 'collection_record_1', type: 'answer', notes: 'Private annotation',
        sourceUrl: 'https://example.com/private/conversation?secret=URL_ONLY_SECRET',
        promptRef: { promptId: 'exact_prompt_1', bodyVersionId: 'exact_prompt_body_7' },
        ...changes
    };
}
// Read raw fenced sections, removing only the fixed framing LF. A Markdown
// renderer normalizes line endings, so rendering is not an exact-text oracle.
function sections(markdown) {
    const found = [];
    const matcher = /^(#{2,3}) ([^\n]+)\n\n(`{3,})text\n/gm;
    let match;
    while ((match = matcher.exec(markdown))) {
        const start = matcher.lastIndex;
        const end = markdown.indexOf(`\n${match[3]}\n\n`, start);
        assert.notEqual(end, -1, `Missing closing fence for ${match[2]}`);
        found.push({ label: match[2], value: markdown.slice(start, end), fence: match[3] });
        matcher.lastIndex = end + match[3].length + 3;
    }
    return found;
}
function value(markdown, label) { return sections(markdown).find(item => item.label === label)?.value; }
function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
}

test('exports a pure CommonJS API and equivalent browser global without any I/O', () => {
    assert.deepEqual(Object.keys(Markdown), ['serialize']);
    const root = {};
    const context = vm.createContext({ window: root });
    vm.runInContext(fs.readFileSync(require.resolve('../shared/local-ai-markdown.js'), 'utf8'), context);
    assert.equal(typeof root.LocalItabAIMarkdown.serialize, 'function');
    assert.equal(root.LocalItabAIMarkdown.serialize('prompt', prompt()), Markdown.serialize('prompt', prompt()));
});

test('prompt export contains current saved body and concise relevant metadata', () => {
    const record = freeze(prompt()), before = structuredClone(record);
    const output = Markdown.serialize('prompt', record);
    assert.ok(output.startsWith('# Saved prompt\n\n'));
    for (const [label, key] of [
        ['Title', 'title'], ['Body', 'body'], ['Body version', 'currentVersionId'],
        ['Category', 'category'], ['Tool', 'tool']
    ]) assert.equal(value(output, label), record[key]);
    assert.equal(value(output, 'Tag 1'), 'first');
    assert.equal(value(output, 'Tag 2'), 'second');
    for (const label of ['ID', 'Version', 'Created at', 'Updated at', 'Archived', 'Archived at', 'Favorite']) {
        assert.equal(value(output, label), undefined);
    }
    for (const key of ['id', 'version', 'createdAt', 'updatedAt']) assert.ok(!output.includes(record[key]));
    assert.ok(!output.includes('PRIVATE_OLD_BODY'));
    assert.deepEqual(record, before);
    assert.equal(Markdown.serialize('prompt', record), output, 'output is deterministic');
});

test('body remains exact Unicode, CRLF, lone CR/LF, tabs, HTML and unresolved template text', () => {
    const bodies = [
        '  中文 🧪 e\u0301\r\n\t<script>alert("literal")</script>\r\n{{secret}}  ',
        '\r', '\n', '\r\n', 'no final newline', 'trailing spaces \t  ', '',
        'line one\rline two\nline three\r\n\r\n',
        '```js\nconst value = "``````";\n```\n\n# injected\n![image](https://example.com/pixel)',
        '`'.repeat(4096) + '\r\n~~~\n</pre><img src="https://example.com/track">'
    ];
    for (const body of bodies) {
        for (const kind of ['prompt', 'collection']) {
            const output = Markdown.serialize(kind, kind === 'prompt' ? prompt({ body }) : collection({ body }));
            assert.equal(value(output, 'Body'), body);
            const section = sections(output).find(item => item.label === 'Body');
            const runs = body.match(/`+/g) || [];
            assert.ok(runs.every(run => section.fence.length > run.length));
        }
    }
});

test('all untrusted metadata is confined to length-safe fences, never headings or active Markdown', () => {
    const attack = '  \r\n```\n# attack\n![track](https://example.com/track)\n``````\n<script>literal</script>\t  ';
    const record = collection({
        title: attack, id: attack, version: attack, currentVersionId: attack,
        createdAt: attack, updatedAt: attack, deletedAt: attack, tool: attack,
        tags: [attack, 'second\r\n\ttag'], type: attack, notes: attack,
        sourceUrl: attack, promptRef: { promptId: attack, bodyVersionId: attack }
    });
    const output = Markdown.serialize('collection', record, { includeSourceUrl: true });
    const labels = ['Title', 'Body version', 'Tool', 'Tag 1', 'Type', 'Notes',
        'Source URL', 'Prompt ID', 'Prompt body version ID'];
    for (const label of labels) assert.equal(value(output, label), attack);
    assert.equal(value(output, 'Tag 2'), 'second\r\n\ttag');
    assert.equal(sections(output).length, 11);
    const promptOutput = Markdown.serialize('prompt', prompt({ category: attack }));
    assert.equal(value(promptOutput, 'Category'), attack);
});

test('collection includes exact promptRef IDs without looking up any linked content', () => {
    const record = freeze(collection({
        promptRef: { promptId: 'missing_prompt_999', bodyVersionId: 'archived_body_777', body: 'LINKED_BODY_SECRET' },
        linkedPrompt: { body: 'LINKED_PROMPT_SECRET' },
        recovery: [{ body: 'RECOVERY_SECRET' }], draft: { body: 'UNSAVED_DRAFT_SECRET' },
        preview: 'TEMPLATE_PREVIEW_SECRET'
    }));
    const before = structuredClone(record);
    const output = Markdown.serialize('collection', record);
    assert.equal(value(output, 'Type'), 'answer');
    assert.equal(value(output, 'Notes'), record.notes);
    assert.equal(value(output, 'Prompt ID'), 'missing_prompt_999');
    assert.equal(value(output, 'Prompt body version ID'), 'archived_body_777');
    for (const secret of ['LINKED_BODY_SECRET', 'LINKED_PROMPT_SECRET', 'RECOVERY_SECRET', 'UNSAVED_DRAFT_SECRET', 'TEMPLATE_PREVIEW_SECRET', 'PRIVATE_OLD_BODY']) {
        assert.ok(!output.includes(secret));
    }
    assert.deepEqual(record, before);
});

test('source URL is excluded by default and included only on explicit true for this collection export', () => {
    const record = collection(), before = structuredClone(record);
    for (const option of [undefined, {}, { includeSourceUrl: false }, { includeSourceUrl: 'true' }, { includeSourceUrl: 1 }]) {
        const output = Markdown.serialize('collection', record, option);
        assert.ok(!output.includes('Source URL'));
        assert.ok(!output.includes('URL_ONLY_SECRET'));
    }
    assert.equal(value(Markdown.serialize('collection', record, { includeSourceUrl: true }), 'Source URL'), record.sourceUrl);
    assert.ok(!Markdown.serialize('collection', record).includes('URL_ONLY_SECRET'), 'opt-in is not sticky');
    assert.deepEqual(record, before);
    assert.ok(!Markdown.serialize('prompt', prompt({ sourceUrl: record.sourceUrl }), { includeSourceUrl: true }).includes('URL_ONLY_SECRET'));
});

test('URL omission leaves body and notes intact even when they contain that same URL', () => {
    const record = collection(); record.body = `  ${record.sourceUrl}\r\n`; record.notes = record.sourceUrl;
    const output = Markdown.serialize('collection', record);
    assert.equal(value(output, 'Body'), record.body);
    assert.equal(value(output, 'Notes'), record.notes);
    assert.equal(value(output, 'Source URL'), undefined);
});

test('empty metadata and absent prompt references produce no placeholder sections', () => {
    const deletedAt = '2026-10-11T02:00:00.000Z';
    const output = Markdown.serialize('collection', collection({
        deletedAt, promptRef: null, tags: [], tool: '', type: '', notes: '', sourceUrl: ''
    }), { includeSourceUrl: true });
    assert.deepEqual(sections(output).map(item => item.label), ['Title', 'Body', 'Body version']);
    for (const label of ['Archived', 'Archived at', 'Prompt reference', 'Tags', 'Prompt ID', 'Tool', 'Type', 'Notes', 'Source URL']) {
        assert.ok(!output.includes(`## ${label}\n`));
    }
    assert.ok(!output.includes(deletedAt));
    const promptOutput = Markdown.serialize('prompt', prompt({ favorite: false, tags: [''], tool: '', category: '' }));
    assert.deepEqual(sections(promptOutput).map(item => item.label), ['Title', 'Body', 'Body version']);
});

test('ignored properties and serialization hooks are never evaluated', () => {
    const record = collection(); let reads = 0;
    for (const field of ['id', 'version', 'createdAt', 'updatedAt', 'deletedAt', 'favorite',
        'history', 'recovery', 'linkedPrompt', 'sourceUrl', 'toJSON']) {
        Object.defineProperty(record, field, { get() { reads++; throw new Error('Secret getter'); } });
    }
    Object.defineProperty(record.promptRef, 'body', { get() { reads++; throw new Error('Secret body'); } });
    assert.doesNotThrow(() => Markdown.serialize('collection', record));
    assert.equal(reads, 0);
    assert.throws(() => Markdown.serialize('collection', record, { includeSourceUrl: true }), /Invalid saved Markdown record/);
    assert.equal(reads, 0);
});

test('malformed selected fields fail without coercion, executing accessors, or exposing private values', () => {
    const accessor = prompt(); let reads = 0;
    Object.defineProperty(accessor, 'body', { get() { reads++; return 'PRIVATE_GETTER'; } });
    const coercion = { toString() { reads++; return 'PRIVATE_COERCION'; } };
    const options = { get includeSourceUrl() { reads++; return true; } };
    for (const action of [
        () => Markdown.serialize('unknown', prompt()), () => Markdown.serialize('prompt', null),
        () => Markdown.serialize('prompt', {}), () => Markdown.serialize('prompt', accessor),
        () => Markdown.serialize('prompt', prompt({ title: coercion })),
        () => Markdown.serialize('prompt', prompt({ tags: [coercion] })),
        () => Markdown.serialize('prompt', prompt({ tags: new Array(1) })),
        () => Markdown.serialize('prompt', prompt({ tool: coercion })),
        () => Markdown.serialize('collection', collection({ promptRef: [] })),
        () => Markdown.serialize('collection', collection(), options)
    ]) assert.throws(action, error => error instanceof TypeError && error.message === 'Invalid saved Markdown record');
    assert.equal(reads, 0);
});
