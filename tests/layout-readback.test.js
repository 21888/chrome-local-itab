// Each preparation, fault, read and mutation runs serially in a separate 512 MiB
// Node process. Complete synthetic JSON states are written to disk between them.
// This is not installed-extension upgrade, browser, disk-atomicity or race proof.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const child = path.join(__dirname, 'helpers/layout-readback-child.cjs');
function run(input, directory, name) {
    const inputFile = path.join(directory, `${name}-input.json`);
    fs.writeFileSync(inputFile, JSON.stringify(input, null, 2));
    const result = spawnSync(process.execPath, ['--max-old-space-size=512', child, inputFile], {
        encoding: 'utf8', timeout: 20000
    });
    fs.writeFileSync(path.join(directory, `${name}-stderr.log`), result.stderr || '');
    assert.equal(result.status, 0, result.stderr || String(result.error));
    const output = JSON.parse(result.stdout);
    const outputFile = path.join(directory, `${name}-output.json`);
    fs.writeFileSync(outputFile, JSON.stringify(output, null, 2));
    // The next process starts from the exact disk checkpoint, not an in-memory
    // storage adapter or module instance retained by the preceding process.
    return JSON.parse(fs.readFileSync(outputFile, 'utf8'));
}
for (const workspace of [false, true]) for (const mode of ['drop', 'corrupt', 'schema', 'generation', 'layout', 'layout-valid', 'recovery', 'readfail', 'reject', 'after', 'success', 'reorder']) {
    test(`${workspace ? 'workspace' : 'compatibility'} layout verifies ${mode} and preserves raw state across processes`, t => {
        const evidenceRoot = process.env.ITAB_LAYOUT_EVIDENCE_DIR || os.tmpdir();
        fs.mkdirSync(evidenceRoot, { recursive: true });
        const directory = fs.mkdtempSync(path.join(evidenceRoot, `layout-${workspace ? 'workspace' : 'compatibility'}-${mode}-`));
        if (!process.env.ITAB_LAYOUT_EVIDENCE_DIR) t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
        const prepared = run({ workspace, mode, phase: 'prepare' }, directory, '01-original');
        fs.writeFileSync(path.join(directory, 'original-raw.json'), JSON.stringify(prepared.initial, null, 2));
        const checkpoint = run(prepared, directory, '02-fault');
        const inspected = run({ ...checkpoint, phase: 'restart-read' }, directory, '03-restart-read');
        assert.deepEqual(inspected.raw, checkpoint.raw);
        assert.equal(inspected.writes.length, 0);
        assert.equal(new Set([prepared.pid, checkpoint.pid, inspected.pid]).size, 3);
        if (!['corrupt', 'schema'].includes(mode)) {
            const changed = run(checkpoint, directory, '04-explicit-fresh-edit');
            assert.equal(changed.writes.length, mode === 'layout' ? 0 : 1);
            if (mode === 'layout') assert.deepEqual(changed.raw, checkpoint.raw);
            assert.equal(new Set([prepared.pid, checkpoint.pid, inspected.pid, changed.pid]).size, 4);
        }
    });
}
