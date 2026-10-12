const assert = require('node:assert/strict');
const review = require('../fixtures/navigation-chinese-alias-review.json');
// Reverse only this explicitly reviewed search-only diff; never drop arbitrary fields.
function beforeChineseAliasReview(site) {
    const copy = structuredClone(site);
    const change = review.changes.find(change => change.id === site.id);
    if (change) {
        assert.deepEqual(site.searchAliases, change.searchAliases, `${site.id} aliases`);
        assert.deepEqual(site.sources, [...change.previousSources, ...change.sources], `${site.id} evidence`);
        assert.equal(site.verifiedOn, review.verifiedOn, `${site.id} review date`);
        delete copy.searchAliases;
        copy.sources = [...change.previousSources];
    }
    return copy;
}
module.exports = { review, beforeChineseAliasReview };
