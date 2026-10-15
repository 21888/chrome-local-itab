const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const sites = require('../shared/navigation-sites').map(require('./helpers/navigation-ai-pricing-review').beforeAiPricingReview);
const Catalog = require('../shared/navigation-catalog');
const review = require('./fixtures/navigation-metadata-review.json');
const { beforeChineseAliasReview } = require('./helpers/navigation-chinese-alias-review');
const byId = id => sites.find(site => site.id === id);

test('review changes only the 17 existing entries and explicitly reviewed metadata fields', () => {
    assert.equal(sites.length, 146);
    assert.equal(review.changes.length, 17);
    assert.equal(review.changes.filter(change => 'country' in change.fields).length, 16);
    assert.equal(review.changes.filter(change => 'pricing' in change.fields).length, 3);
    // The six appended services are pinned in navigation-service-expansion.test.js.
    const preserved = sites.slice(0, 108).map(beforeChineseAliasReview).map(site => {
        const copy = structuredClone(site), change = review.changes.find(change => change.id === site.id);
        // Later search-only aliases are separately pinned; preserve the original metadata hash.
        const aliases = { google: ['谷歌'], bing: ['必应'] };
        if (Object.hasOwn(aliases, site.id)) {
            assert.deepEqual(site.searchAliases, aliases[site.id]);
            delete copy.searchAliases;
        }
        if (change) {
            for (const [key, value] of Object.entries(change.fields)) {
                assert.deepEqual(site[key], value, `${site.id}.${key}`);
                delete copy[key];
            }
            assert.deepEqual(site.sources, [...new Set([...change.previousSources, ...change.sources])]);
            delete copy.sources;
        }
        return copy;
    });
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(preserved)).digest('hex'), review.preservedSha256,
        'Unreviewed fields, site order, entries and metadata must remain intact');
});

test('verified company, country and pricing compose with bilingual search and existing category/tag filters', () => {
    for (const change of review.changes) {
        const site = byId(change.id);
        for (const language of ['en', 'zh']) {
            const criteria = { query: site.name, company: site.company, country: site.country,
                pricing: site.pricing, category: site.categories[0], tag: site.tags[0] };
            assert.deepEqual(Catalog.filter(sites, criteria, language), [site], `${site.id}/${language}`);
            assert.equal(Catalog.filter(sites, { ...criteria, country: site.country === 'US' ? 'CN' : 'US' }, language).length, 0);
        }
    }
    assert.ok(Catalog.filter(sites, { query: '北京月之暗面', country: 'CN' }, 'zh').some(site => site.id === 'kimi'));
    for (const id of ['canva', 'gitlab', 'tinypng']) {
        assert.ok(Catalog.filter(sites, { pricing: 'freemium' }).some(site => site.id === id));
        assert.ok(!Catalog.filter(sites, { pricing: 'unknown' }).some(site => site.id === id));
    }
    for (const id of review.heldUnknown) assert.equal(byId(id).country, 'unknown', id);
    assert.ok(!Catalog.filter(sites, { country: 'AU' }).some(site => site.id === 'canva'));
});

test('provenance is valid, unique, tracking-free, and offline loading cannot make network requests', () => {
    assert.equal(Catalog.validate(sites), true);
    for (const site of sites) {
        assert.equal(new Set(site.sources).size, site.sources.length, site.id);
        for (const source of site.sources) {
            const url = new URL(source);
            assert.equal(url.protocol, 'https:');
            assert.equal(url.username + url.password, '');
            for (const key of url.searchParams.keys()) assert.doesNotMatch(key, /^(utm_|src$|fbclid$|gclid$)/i);
        }
    }
    const unexpectedNetwork = () => { throw new Error('Offline catalog attempted network access'); };
    const sandbox = { fetch: unexpectedNetwork, XMLHttpRequest: unexpectedNetwork, WebSocket: unexpectedNetwork, Image: unexpectedNetwork, URL };
    vm.runInNewContext(fs.readFileSync('shared/navigation-sites.js', 'utf8'), sandbox);
    vm.runInNewContext(fs.readFileSync('shared/navigation-catalog.js', 'utf8'), sandbox);
    assert.equal(sandbox.LocalItabNavigationCatalog.validate(sandbox.LocalItabNavigationSites), true);
    assert.equal(sandbox.LocalItabNavigationCatalog.filter(sandbox.LocalItabNavigationSites, { country: 'GB', query: 'draw.io' }).length, 1);
});
