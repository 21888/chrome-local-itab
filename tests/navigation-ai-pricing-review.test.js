const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sites = require('../shared/navigation-sites');
const Catalog = require('../shared/navigation-catalog');
const { review, beforeAiPricingReview } = require('./helpers/navigation-ai-pricing-review');

test('bounded AI review preserves every unrelated field, ID, URL, operator and catalog entry', () => {
    assert.equal(sites.length, 146);
    assert.deepEqual(review.changes.map(c => c.id), ['cursor', 'grok', 'luma-dream-machine', 'pika']);
    for (const change of review.changes) {
        assert.deepEqual(Object.keys(change.after).sort(),
            (change.id === 'luma-dream-machine' ? ['pricing', 'pricingNote', 'sources', 'verifiedOn'] : ['pricingNote', 'sources', 'verifiedOn']).sort());
        assert.equal(change.after.verifiedOn, '2026-10-15');
        for (const lang of ['en', 'zh']) assert.ok(change.after.pricingNote[lang].length > 0);
    }
    assert.equal(crypto.createHash('sha256').update(JSON.stringify(sites.map(beforeAiPricingReview))).digest('hex'), review.baselineSha256);
    assert.equal(Catalog.validate(sites), true);
});

test('uncertain Luma and Pika remain distinct from free or paid claims in combined filters', () => {
    for (const id of ['luma-dream-machine', 'pika', 'qwen']) {
        const site = sites.find(s => s.id === id);
        assert.equal(site.pricing, 'unknown');
        for (const lang of ['zh', 'en']) {
            const criteria = { query: site.name, company: site.company, country: site.country, category: 'ai', tag: site.tags[0] };
            assert.deepEqual(Catalog.filter(sites, { ...criteria, pricing: 'unknown' }, lang), [site]);
            for (const pricing of ['free', 'freemium', 'paid']) assert.deepEqual(Catalog.filter(sites, { ...criteria, pricing }, lang), []);
        }
    }
    for (const id of ['cursor', 'grok']) {
        const site = sites.find(s => s.id === id);
        assert.equal(site.pricing, 'freemium');
        assert.ok(Catalog.filter(sites, { country: 'US', pricing: 'freemium', category: 'ai' }).includes(site));
        assert.doesNotMatch(site.pricingNote.en, /Hobby|SuperGrok/);
    }
});

test('review retains official evidence and exposes uncertainty without inferred access restrictions', () => {
    for (const change of review.changes) {
        const site = sites.find(s => s.id === change.id);
        assert.deepEqual(site.sources.slice(0, change.before.sources.length), change.before.sources);
        assert.equal(new Set(site.sources).size, site.sources.length);
        for (const source of site.sources) {
            const url = new URL(source);
            assert.equal(url.protocol, 'https:');
            assert.equal(url.username + url.password + url.search + url.hash, '');
        }
    }
    const luma = sites.find(s => s.id === 'luma-dream-machine');
    assert.match(luma.pricingNote.en, /free trial.*unverified/);
    assert.match(luma.pricingNote.zh, /免费试用.*未核实/);
    assert.doesNotMatch(sites.find(s => s.id === 'pika').pricingNote.en, /generation requires/);
});
