# Bounded AI catalog source review — 2026-10-27

The offline catalog still contains 149 sites, including 28 AI entries. This pass
reviewed the four priority services below and checked pricing/name continuity for
four additional major entries; it is **not a fresh verification of all 28 entries**.
Only Claude's two evidence URLs and its `verifiedOn` date change. No site URL,
name, operator, country, price tier, description, default shortcut or user data
changes. The remaining 27 AI review dates are deliberately unchanged.

## Priority services

- **ChatGPT:** [official Plus help](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus)
  supports limited free use, paid subscriptions and separate API billing.
  [Terms](https://openai.com/policies/terms-of-use/) identify a Delaware operator.
  Existing ChatGPT / OpenAI / US / freemium metadata remains appropriate.
- **Claude:** both old evidence URLs returned 404 through the public-page reader
  on repeated attempts. A search index still retained the old plan article; this
  is an observed retrieval failure, not proof of worldwide permanent removal.
  Replace them with readable [official pricing](https://claude.com/pricing) and
  [privacy policy](https://www.anthropic.com/legal/privacy). Pricing identifies
  Claude, links to claude.ai, and documents Free plus paid Pro/Max/team plans and
  usage limits. Privacy section 9 identifies Anthropic PBC's US address, while
  separately naming its Irish regional controller. Keep Anthropic / US / freemium;
  a regional controller is not a statement of service availability.
- **Grok:** [pricing](https://x.ai/pricing) still supports limited free and paid
  tiers. Although the site branding is SpaceXSI, the
  [consumer terms](https://x.ai/legal/terms-of-service) still name **SpaceXAI LLC**,
  a Nevada company with a US principal address. Do not replace the legal operator
  with the marketing brand. The Grok destination and existing US/freemium stay.
- **DeepSeek:** [official download page](https://www.deepseek.com/en/download/)
  advertises free assistant chat. The
  [Chinese privacy policy](https://cdn.deepseek.com/policies/zh-CN/deepseek-privacy-policy.html)
  identifies the Hangzhou operator. Existing CN/free applies to the linked chat
  entry, not a claim that the developer API is free.

## Additional bounded checks

- [Gemini subscriptions](https://gemini.google/subscriptions/): free and paid plans.
- [Perplexity plan guide](https://www.perplexity.ai/help-center/en/articles/11187416-which-perplexity-subscription-plan-is-right-for-you):
  Standard Free and paid subscription options; basic/free limits remain explicit.
- [Microsoft Copilot pricing FAQ](https://www.microsoft.com/en-us/copilot/pricing/individuals):
  limited free Copilot and eligible paid Microsoft 365 plans.
- [Mistral pricing](https://mistral.ai/pricing/) supports free and paid Vibe plans;
  [official rename notice](https://help.mistral.ai/en/articles/682992-le-chat-is-now-vibe)
  confirms Le Chat became Vibe and retains chat.mistral.ai. The existing name and
  destination already reflect this, so no rename is manufactured.

These four additional checks do not re-verify every corporate-location source or
all product features. No live quotas/prices are copied into the catalog. Countries
mean operator location, not hosting, user nationality or permitted regions.
Public evidence was read without login, subscriptions, credentials, account usage
access or runtime network fetching. This does not verify real provider login or
resolve the extension upgrade/import incident.

## Regression contract

The new catalog assertion first failed against the old Claude sources. Existing
historical review tests then correctly rejected the changed provenance: their
baseline hashes are retained. The existing historical projection helper now
asserts the exact new Claude source list and date before restoring only those
fields for historical comparisons; arbitrary changes remain detectable.

Validation results are recorded below. Test logs and exploratory
artifacts remain local; no screenshot or account data is included.

- Complete applicable navigation/catalog/Finder files: **24 files, 465/465** passed.
- Python suite: **91/91** passed.
- Offline package build and source verification: **138 runtime files**, both passed;
  this is not installed-extension/browser validation. The first output path was
  rejected because in-tree archives must be under `dist/`; using that documented
  location succeeded without changing packaging rules.
- `git diff --check`: passed.
- First full Node run: **17,277 tests, 17,276 passed, one failed**. The remaining
  failure was the subscription-guide test's original whole-catalog byte hash,
  not a runtime failure. That hash also stays unchanged: its test now reverses
  only the exact reviewed source/date block before comparison. New mutation
  cases reject altered evidence, dates, operator and unrelated Grok name. The
  complete guide/catalog/local-AI files then passed **31/31**. The original
  failed run remains in local evidence and is not reported as a green run.
- Final fixed-source Node suite: **440 files, 17,278/17,278 tests passed**, exit 0.
  This final result includes both historical source guards and their new negative
  cases; it does not erase the preceding failed run.
