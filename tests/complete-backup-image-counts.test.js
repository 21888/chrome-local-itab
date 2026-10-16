const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const {fixture, Backup, Workspaces, copy} = require('./helpers/complete-backup-acceptance.js');
const {createDocument} = require('./helpers/task-dom-model.js');
const viewSource = fs.readFileSync('shared/complete-backup-view.js', 'utf8');
const image = 'data:image/png;base64,QUJD';
const waitFor = async predicate => {
    const deadline = Date.now() + 2000;
    while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
    assert(predicate(), 'expected backup UI state settled');
};
function addImages(f, all = true) {
    for (const entry of f.raw[Workspaces.REGISTRY_KEY].workspaces) {
        const value = f.values(entry.id);
        value.bg = {type:'image', value:image};
        if (all) {
            value.movie = {title:'Synthetic film', note:'Synthetic only', poster:image};
            value.links = [1, 2].map(number => ({title:`Synthetic ${number}`, url:`https://example.com/${number}`, category:'work', icon:image}));
        }
    }
}
// Count the exported references independently of the Store's summary. Identical
// data URLs in different fields/workspaces are intentionally separate references.
const configurations = file => file.schemaVersion === 1 ? [file.modules.config.data]
    : [...file.workspaces, ...file.trash].map(space => space.modules.config.data);
const countReferences = file => configurations(file).reduce((total, data) => total
    + data.links.filter(link => link.icon?.startsWith('data:')).length
    + Number(data.bg.type === 'image' && !!data.bg.value) + Number(!!data.movie.poster), 0);
function mount(store, locale = 'en') {
    const document = createDocument(), host = document.createElement('div'); document.body.append(host);
    const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
    const t = key => catalog['completeBackup' + key].message;
    const window = {LocalItabCompleteBackup:Backup, i18n:{t:key => catalog[key]?.message || key}};
    vm.runInNewContext(viewSource, {window, setTimeout, URL, Blob});
    const view = window.LocalItabCompleteBackupView.mount(host, {store,
        reload:() => assert.fail('no automatic reload'), download:() => assert.fail('no download requested')});
    const get = name => host.querySelector('.complete-backup-' + name);
    const select = source => {
        get('file').files = [{size:Buffer.byteLength(source), text:async () => source}];
        get('file').dispatch('change');
    };
    const configRow = () => get('counts').children[0].children.map(node => node.textContent);
    const images = (incoming, current) => {
        const row = configRow();
        assert(row[1].endsWith(`${t('CountImages')}: ${incoming}`), row[1]);
        assert(row[2].endsWith(`${t('CountImages')}: ${current}`), row[2]);
    };
    return {host, view, get, select, configRow, images, t};
}

for (const locale of ['en', 'zh_CN']) test(`all-workspace image totals include Trash in ${locale}; review/cancel are read-only and Apply preserves exact images after reopening`, async t => {
    const source = fixture(), target = fixture(); addImages(source); addImages(target, false);
    const archive = await source.store.export(Backup.SCOPED_MODULES), file = JSON.parse(archive);
    const beforeArchive = JSON.parse(await target.store.export(Backup.SCOPED_MODULES)), before = copy(target.raw);
    assert.equal(countReferences(file), 12); assert.equal(countReferences(beforeArchive), 3);
    const m = mount(target.store, locale); t.after(() => m.view.destroy());
    m.select(archive); await waitFor(() => !m.get('apply').disabled);
    m.images(12, 3);
    const preview = await target.store.review(archive);
    assert.equal(preview.incoming.config.localImages, 12); assert.equal(preview.current.config.localImages, 3);
    assert.equal(preview.incoming.config.dataUrlIcons, 6);
    assert.equal(preview.incoming.config.hasBackgroundImage, true); assert.equal(preview.incoming.config.hasMoviePoster, true);
    assert.equal(preview.current.config.hasBackgroundImage, true); assert.equal(preview.current.config.hasMoviePoster, false);
    assert.equal(source.writes.length, 0); assert.equal(target.writes.length, 0);
    m.get('cancel').dispatch('click');
    assert.deepEqual(target.raw, before); assert.equal(target.writes.length, 0);
    assert(m.get('preview').hidden); assert(m.get('apply').disabled);

    m.select(archive); await waitFor(() => !m.get('apply').disabled);
    const config = m.host.querySelector('[data-module="config"]'); config.checked = false; config.dispatch('change');
    await waitFor(() => !m.get('apply').disabled);
    assert(m.configRow()[0].endsWith(`(${m.t('No')})`)); m.images(12, 3);
    m.get('cancel').dispatch('click');
    assert.deepEqual(target.raw, before); assert.equal(target.writes.length, 0);

    m.select(archive); await waitFor(() => !m.get('apply').disabled); m.images(12, 3);
    m.get('apply').dispatch('click'); await waitFor(() => !m.view.pending);
    assert.equal(m.get('status').textContent, m.t('Success')); assert(target.writes.length > 0);
    const reopened = fixture({persisted:JSON.parse(JSON.stringify(target.raw))});
    const restored = JSON.parse(await reopened.store.export(Backup.SCOPED_MODULES));
    assert.equal(countReferences(restored), 12);
    assert.deepEqual(configurations(restored), configurations(file));
    assert.deepEqual(configurations(JSON.parse(await reopened.store.recovery())), configurations(beforeArchive));
    assert(!archive.includes('localImages'), 'summary fields must not enter the archive schema');
    assert.equal(reopened.writes.length, 0);
});

for (const withImages of [false, true]) test(`one-workspace image total is ${withImages ? 4 : 0}, with no Trash and no writes`, async t => {
    const source = fixture({extra:false, trash:false}), target = fixture({extra:false, trash:false});
    if (withImages) addImages(source);
    const archive = await source.store.export(['config']), expected = withImages ? 4 : 0;
    const preview = await target.store.review(archive);
    assert.equal(preview.incoming.config.localImages, expected); assert.equal(preview.current.config.localImages, 0);
    assert.equal(countReferences(JSON.parse(archive)), expected);
    const m = mount(target.store); t.after(() => m.view.destroy());
    m.select(archive); await waitFor(() => !m.get('apply').disabled); m.images(expected, 0);
    m.get('cancel').dispatch('click'); assert.equal(target.writes.length, 0); assert.equal(source.writes.length, 0);
});

test('legacy schema 1 incoming and selected single-workspace destination keep the existing image fallback', async t => {
    const source = fixture({extra:false, trash:false}), target = fixture(); addImages(source); addImages(target, false);
    const archive = source.store.snapshot(source.values('default'), ['config']).source;
    const before = copy(target.raw), m = mount(target.store); t.after(() => m.view.destroy());
    m.select(archive); await waitFor(() => !m.get('destination').hidden && !m.get('target').disabled);
    assert(m.get('apply').disabled); m.images(4, 3);
    m.get('target').value = 'work'; m.get('target').dispatch('change');
    await waitFor(() => !m.get('apply').disabled); m.images(4, 1);
    const preview = await target.store.review(archive, ['config'], {targetWorkspaceId:'work'});
    assert.equal(Object.hasOwn(preview.incoming.config, 'localImages'), false);
    assert.equal(Object.hasOwn(preview.current.config, 'localImages'), false);
    assert.equal(preview.incoming.config.dataUrlIcons, 2);
    assert.equal(preview.incoming.config.hasBackgroundImage, true); assert.equal(preview.incoming.config.hasMoviePoster, true);
    m.get('cancel').dispatch('click'); assert.deepEqual(target.raw, before); assert.equal(target.writes.length, 0);
});

test('View prefers an explicit zero total and keeps strict-boolean fallback when no total exists', async t => {
    const store = {async review() { return {modules:['config'], selected:['config'],
        incoming:{config:{localImages:0, dataUrlIcons:2, hasBackgroundImage:true, hasMoviePoster:true}},
        current:{config:{dataUrlIcons:2, hasBackgroundImage:1, hasMoviePoster:'true'}}}; }};
    const m = mount(store); t.after(() => m.view.destroy());
    m.select('{}'); await waitFor(() => !m.get('apply').disabled); m.images(0, 2);
    m.get('cancel').dispatch('click');
});
