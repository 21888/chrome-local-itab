const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const Catalog = require('../shared/navigation-catalog');
const sites = require('../shared/navigation-sites');
const ConfigurationCodec = require('../shared/configuration-codec');
const previous = sites.slice(0, 146);
const added = sites.slice(146);
const ids = ['ollama', 'comfyui', 'librechat'];
const tagKey = tag => 'navigationTag' + tag.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('');

test('local AI entries append exactly three sites and preserve every field of the prior 146 records', () => {
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(previous)).digest('hex'),
        '24686256ab720a5c3cef1e0f330e50ddf1826e4c58d8a48f6204c1f999b0d472');
    assert.deepEqual(added.map(site => site.id), ids);
    assert.equal(sites.length, 149);
    assert.equal(new Set(sites.map(site => site.id)).size, 149);
    assert.equal(new Set(sites.map(site => Catalog.canonicalURL(site.url))).size, 149);
    assert.equal(Catalog.validate(sites), true);
    assert.equal(Catalog.categories.length, 18);
    assert.equal(Catalog.filter(previous, {category: 'ai'}).length, 25);
    assert.equal(Catalog.filter(sites, {category: 'ai'}).length, 28);
    assert.deepEqual([...new Set(sites.flatMap(site => site.tags))], [...new Set(previous.flatMap(site => site.tags))]);
    assert.equal(new Set(sites.flatMap(site => site.tags)).size, 218);
});

test('local AI entries retain complete schema, safe destinations and reviewed original sources', () => {
    assert.deepEqual(added.map(site => site.url), [
        'https://ollama.com/', 'https://comfy.org/download/',
        'https://www.librechat.ai/docs/quick_start/local_setup'
    ]);
    for (const site of added) {
        assert.deepEqual(Object.keys(site).sort(), ['id', 'name', 'url', 'company', 'country', 'categories', 'tags', 'pricing', 'description', 'pricingNote', 'sources', 'verifiedOn', 'searchAliases', 'icon', 'language', 'signup'].sort());
        assert.equal(Catalog.canonicalURL(site.url), site.url);
        assert.equal(site.verifiedOn, '2026-10-15');
        assert.equal(site.language, 'unknown'); assert.equal(site.signup, 'unknown');
        assert.deepEqual(site.categories, ['ai']);
        assert.match(site.icon, /^[A-Z]{2}$/);
        assert.equal(new Set(site.sources).size, site.sources.length);
        assert.ok(site.sources.includes(site.url));
        for (const source of site.sources) {
            const url = new URL(source);
            assert.equal(url.protocol, 'https:');
            assert.equal(url.username + url.password + url.search + url.hash, '');
        }
    }
    for (const [site, license] of added.map((site, index) => [site, [
        'https://github.com/ollama/ollama/blob/main/LICENSE',
        'https://github.com/Comfy-Org/ComfyUI/blob/master/LICENSE',
        'https://github.com/LibreChat-AI/LibreChat/blob/main/LICENSE'
    ][index]])) assert.ok(site.sources.includes(license));
});

test('local and self-hosted queries close previous empty searches without broad brand aliases', () => {
    const before = JSON.stringify(sites);
    for (const language of ['en', 'zh']) {
        for (const [query, expected] of [
            ['本地模型', ['ollama', 'librechat']], ['local models', ['ollama', 'librechat']],
            ['自托管', ['librechat']], ['self hosted', ['librechat']],
            ['self-hosted', ['librechat']], ['本地绘图', ['comfyui']], ['节点工作流', ['comfyui']],
            ['local image generation', ['comfyui']], ['node workflows', ['comfyui']]
        ]) {
            assert.deepEqual(Catalog.filter(previous, {query}, language), [], `previous: ${query}`);
            assert.deepEqual(Catalog.filter(sites, {query}, language).map(site => site.id), expected, `${language}: ${query}`);
            assert.deepEqual(Catalog.filter(sites, {query: `${query} absent-84920912`}, language), []);
        }
        for (const [query, id] of [['Ollama 本地模型', 'ollama'], ['ＣｏｍｆｙＵＩ 节点', 'comfyui'], ['Libre Chat 自托管', 'librechat']])
            assert.deepEqual(Catalog.filter(sites, {query}, language).map(site => site.id), [id]);
    }
    assert.deepEqual(added.map(site => site.searchAliases), [
        ['本地模型', 'local models'],
        ['本地绘图', '节点工作流', 'local image generation', 'node workflows'],
        ['自托管', 'self hosted']
    ]);
    assert.equal(JSON.stringify(sites), before);
});

test('local AI searches compose with every existing exact filter and localized use label', () => {
    for (const [locale, language] of [['en', 'en'], ['zh_CN', 'zh']]) {
        const dictionary = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, 'utf8'));
        const label = tag => dictionary[tagKey(tag)]?.message;
        for (const site of added) for (const tag of site.tags) {
            assert.ok(label(tag), `${locale}/${tag}`);
            const criteria = {query: label(tag), category: 'ai', tag, country: site.country, company: site.company, pricing: site.pricing};
            assert.deepEqual(Catalog.filter(sites, criteria, language, label), [site]);
            for (const field of ['category', 'tag', 'country', 'company', 'pricing'])
                assert.deepEqual(Catalog.filter(sites, {...criteria, [field]: 'absent-84920912'}, language, label), []);
        }
    }
});

test('free filters refer to local software and never imply free hosted services or verified operator locations', () => {
    const [ollama, comfy, libre] = added;
    assert.deepEqual(added.map(site => site.company), ['Ollama Inc.', 'Comfy Organization, Inc.', 'LibreChat project']);
    assert.deepEqual(added.map(site => site.country), ['unknown', 'US', 'unknown']);
    assert.deepEqual(Catalog.filter(added, {pricing: 'free'}).map(site => site.id), ['comfyui', 'librechat']);
    assert.deepEqual(Catalog.filter(added, {pricing: 'freemium'}).map(site => site.id), ['ollama']);
    assert.deepEqual(Catalog.filter(added, {pricing: 'paid'}), []);
    assert.deepEqual(Catalog.filter(added, {country: 'unknown'}).map(site => site.id), ['ollama', 'librechat']);
    assert.deepEqual(Catalog.filter(added, {country: 'US'}).map(site => site.id), ['comfyui']);
    assert.match(ollama.pricingNote.en, /Local software is free.*suitable hardware.*limited free allowance.*paid subscriptions.*pay-as-you-go credits.*own license/);
    assert.match(ollama.pricingNote.zh, /本地软件免费.*硬件.*有限免费额度.*付费订阅.*按量.*许可/);
    assert.match(comfy.pricingNote.en, /local core is free.*models and suitable hardware.*model licenses are separate.*Cloud.*Partner Nodes cost extra.*trial is not permanent free/);
    assert.match(comfy.pricingNote.zh, /本地核心免费.*模型及合适硬件.*模型许可独立.*另计.*试用不代表永久免费/);
    assert.match(libre.pricingNote.en, /MIT-licensed self-hosted software is free.*deploy.*hardware or hosting.*connect models.*external API and hosting charges are separate/);
    assert.match(libre.pricingNote.zh, /自托管软件免费.*自行部署.*硬件或托管.*连接模型.*外部 API 与托管费用另计/);
    for (const site of added) for (const language of ['en', 'zh'])
        assert.doesNotMatch(site.description[language] + site.pricingNote[language], /guaranteed|always offline|no data collection|already connected|绝对安全|无需硬件|已连接|已集成/i);
});

test('loading local AI catalog data performs no network or storage actions and leaves default shortcuts alone', () => {
    const defaults = ConfigurationCodec.createDefaultConfig();
    const before = JSON.stringify(defaults);
    const unexpected = () => { throw new Error('Catalog loading must not perform I/O'); };
    const sandbox = {
        URL, fetch: unexpected, XMLHttpRequest: unexpected, WebSocket: unexpected, Image: unexpected,
        open: unexpected, localStorage: {setItem: unexpected},
        chrome: {storage: {local: {set: unexpected}, sync: {set: unexpected}}, permissions: {request: unexpected}}
    };
    vm.runInNewContext(fs.readFileSync('shared/navigation-sites.js', 'utf8'), sandbox);
    vm.runInNewContext(fs.readFileSync('shared/navigation-catalog.js', 'utf8'), sandbox);
    assert.equal(sandbox.LocalItabNavigationCatalog.validate(sandbox.LocalItabNavigationSites), true);
    assert.equal(sandbox.LocalItabNavigationSites.length, 149);
    assert.equal(JSON.stringify(defaults), before);
    assert.equal(JSON.stringify(ConfigurationCodec.createDefaultConfig()), before);
    assert.ok(defaults.links.every(link => !added.some(site => site.url === Catalog.canonicalURL(link.url))));
    const doc = fs.readFileSync('docs/navigation-local-ai-tools.md', 'utf8');
    for (const license of ['MIT', 'GPL-3.0']) assert.ok(doc.includes(license));
    assert.match(doc, /No SDK, model, source code\s+or license text is copied/);
    assert.match(doc, /operator location.*access-country list/s);
});
