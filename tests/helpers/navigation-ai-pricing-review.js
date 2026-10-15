const assert = require('node:assert/strict');
const review = require('../fixtures/navigation-ai-pricing-review.json');
// Reverse this exact later metadata review for historical catalog snapshots.
// Assert current values first; never hide arbitrary subsequent changes.
function beforeAiPricingReview(site) {
    const copy = structuredClone(site);
    const change = review.changes.find(change => change.id === site.id);
    if (change) {
        for (const [key, value] of Object.entries(change.after)) {
            assert.deepEqual(site[key], value, `${site.id}.${key}`);
            copy[key] = structuredClone(change.before[key]);
        }
    }
    return copy;
}
module.exports = { review, beforeAiPricingReview };
