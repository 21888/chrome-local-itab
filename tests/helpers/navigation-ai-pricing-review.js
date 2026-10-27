const assert = require('node:assert/strict');
const review = require('../fixtures/navigation-ai-pricing-review.json');
// Reverse this exact later metadata review for historical catalog snapshots.
// Assert current values first; never hide arbitrary subsequent changes.
function beforeClaudeSourceReview(site) {
    const copy = structuredClone(site);
    // The 2026-10-27 Claude source repair changes only provenance, not the
    // earlier pricing review. Pin its exact new fields before projecting the
    // original record; keep every historical baseline hash unchanged.
    if (site.id === 'claude') {
        assert.deepEqual(site.sources, ['https://claude.com/pricing', 'https://www.anthropic.com/legal/privacy']);
        assert.equal(site.verifiedOn, '2026-10-27');
        copy.sources = [
            'https://support.claude.com/en/articles/11049762-choose-a-claude-plan',
            'https://www.anthropic.com/transparency/voluntary-commitments/security%26privacy'
        ];
        copy.verifiedOn = '2026-10-12';
    }
    return copy;
}
function beforeAiPricingReview(site) {
    const copy = beforeClaudeSourceReview(site);
    const change = review.changes.find(change => change.id === site.id);
    if (change) {
        for (const [key, value] of Object.entries(change.after)) {
            assert.deepEqual(site[key], value, `${site.id}.${key}`);
            copy[key] = structuredClone(change.before[key]);
        }
    }
    return copy;
}
module.exports = { review, beforeAiPricingReview, beforeClaudeSourceReview };
