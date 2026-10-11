'use strict';
const assert = require('node:assert/strict');
const clone = value => structuredClone(value);
// The only ignored portable metadata is archive export time and, for selected
// records, regenerated mutation tokens/revisions. Staged workspace updatedAt
// is checked against the observed restore interval, never broadly discarded.
// Immutable body IDs and every other timestamp stay exact.
function withoutTime(file) {
    const result = clone(file); delete result.exportedAt;
    for (const archive of Object.values(result.globals || {})) delete archive.exportedAt;
    return result;
}
function renewedRecords(actual, incoming, previous = [], {tasks = false} = {}) {
    assert.equal(actual.length, incoming.length);
    actual.forEach((record, index) => {
        const expected = incoming[index], a = clone(record), b = clone(expected);
        assert.notEqual(a.version, b.version, 'selected mutation token must renew');
        delete a.version; delete b.version;
        if (!tasks) {
            const prior = previous.filter(item=>item.id === b.id).map(item=>item.revision);
            assert.equal(a.revision, Math.max(b.revision, ...prior) + 1);
            delete a.revision; delete b.revision;
        }
        assert.deepEqual(a,b,'all other record fields, body versions and links stay exact');
    });
}
function timestamp(value, label) {
    assert.equal(typeof value,'string',`${label} must be an ISO timestamp`);
    const millis = Date.parse(value);
    assert(Number.isFinite(millis) && new Date(millis).toISOString() === value,`${label} must be a canonical valid UTC timestamp`);
    return millis;
}
function restoreWindow(baseline, actual, recovery) {
    assert(recovery,'pre-restore recovery export is required to bound staging time');
    const baselineAt = timestamp(baseline.exportedAt,'baseline.exportedAt');
    const start = timestamp(recovery.exportedAt,'recovery.exportedAt');
    const end = timestamp(actual.exportedAt,'restored.exportedAt');
    assert(baselineAt <= start && start <= end,'restore export timestamps must be chronologically ordered');
    return {start,end};
}
function workspaceMetadata(actual, expected, staged, window) {
    const checked = clone(actual);
    if (staged && Object.hasOwn(expected,'updatedAt')) {
        const updatedAt = timestamp(checked.updatedAt,'workspace.updatedAt');
        assert(updatedAt >= window.start && updatedAt <= window.end,'staged workspace.updatedAt must be within recovery-export..restored-export interval');
        // Replace only the independently bounded field in this private comparison
        // copy; raw exports and all other metadata remain untouched.
        checked.updatedAt = expected.updatedAt;
    }
    assert.deepEqual(checked,expected);
}
function compareRestore(source, baseline, actual, selected, recovery) {
    const a = withoutTime(source), b = withoutTime(baseline), c = withoutTime(actual);
    assert.deepEqual(c.modules,b.modules);
    const full = ['config','tasks','scratchpad','countdown','focus'].every(name=>selected.includes(name));
    // Every selected personal module increments its saved revision; config
    // replacement refreshes layout/settings generation fences. Consequently
    // supported scoped restores stage every affected live/Trash bundle even
    // when portable content is equal. Global-only restores stage none.
    const staged = ['config','tasks','scratchpad','countdown','focus'].some(name=>selected.includes(name));
    const window = restoreWindow(baseline,actual,recovery);
    const expectedRegistry = (full?a:b).registry;
    assert.deepEqual({...c.registry,entries:null},{...expectedRegistry,entries:null});
    assert.equal(c.registry.entries.length,expectedRegistry.entries.length);
    c.registry.entries.forEach((entry,index)=>workspaceMetadata(entry,expectedRegistry.entries[index],staged,window));
    for (const group of ['workspaces','trash']) {
        assert.deepEqual(c[group].map(x=>x.id),(full?a:b)[group].map(x=>x.id));
        for (const entry of c[group]) {
            const original = (full?a:b)[group].find(x=>x.id===entry.id);
            const {modules,...metadata} = entry, {modules:unused,...expectedMetadata} = original;
            workspaceMetadata(metadata,expectedMetadata,staged,window);
            assert.deepEqual(Object.keys(modules).sort(),Object.keys(original.modules).sort());
            for (const name of Object.keys(modules)) {
                const expected = (selected.includes(name)?a:b)[group].find(x=>x.id===entry.id).modules[name];
                if (name === 'tasks' && selected.includes(name)) {
                    renewedRecords(modules[name].records,expected.records,[],{tasks:true});
                    assert.deepEqual({...modules[name],records:[]},{...expected,records:[]});
                } else assert.deepEqual(modules[name],expected,`${group}/${entry.id}/${name}`);
            }
        }
    }
    for (const name of ['prompts','collections']) {
        if (!selected.includes(name)) { assert.deepEqual(c.globals[name],b.globals[name]); continue; }
        const actualArchive = c.globals[name], incoming = a.globals[name], prior = b.globals[name];
        renewedRecords(actualArchive.content.records,incoming.content.records,[...prior.content.records,...prior.recovery.flatMap(x=>x.content.records)]);
        assert.deepEqual({...actualArchive,content:null,recovery:null},{...incoming,content:null,recovery:null});
        const expectedRecovery = clone(prior.recovery);
        for (const item of incoming.recovery) {
            const old = expectedRecovery.find(x=>x.id===item.id);
            if (old) assert.deepEqual(old,item); else expectedRecovery.push(item);
        }
        const recovery = clone(actualArchive.recovery);
        if (prior.content.records.length || (name === 'prompts' && prior.recovery.length)) {
            const snapshot = recovery.pop(); assert(snapshot.id); assert(!expectedRecovery.some(x=>x.id===snapshot.id));
            assert(Number.isFinite(Date.parse(snapshot.createdAt))); assert.deepEqual(snapshot.content,prior.content);
        }
        assert.deepEqual(recovery,expectedRecovery,'existing and incoming recovery remain exact');
    }
    return true;
}
function compareRecovery(baseline, recovery, selected) {
    const expected = withoutTime(baseline);
    for (const name of ['prompts','collections']) if (!selected.includes(name)) delete expected.globals[name];
    expected.modules = ['config','tasks','scratchpad','countdown','focus',...['prompts','collections'].filter(name=>selected.includes(name))];
    expected.schemaVersion = selected.includes('collections') ? 4 : selected.includes('prompts') ? 3 : 2;
    if (!Object.keys(expected.globals).length) delete expected.globals;
    assert.deepEqual(withoutTime(recovery),expected);
    return true;
}
module.exports = {withoutTime,compareRestore,compareRecovery,restoreWindow};
