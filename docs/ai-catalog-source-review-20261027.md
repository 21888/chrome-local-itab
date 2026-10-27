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


## Later bounded continuation — 2026-10-27

The initial eight-entry repair/review above is preserved as its original scope. A subsequent coding-tool pass checked Cursor, GitHub Copilot, Replit and Ollama pricing continuity without changes. The remaining sixteen entries were then reviewed as recorded below. Across these passes all 28 entries were considered, **not all fields freshly verified**; only the original Claude evidence repair changed the catalog. No other dates were advanced.

| Entry | Official evidence read | Result and limits |
|---|---|---|
| Midjourney | [Free trials](https://docs.midjourney.com/hc/en-us/articles/27870399340173-Free-Trials); [terms](https://docs.midjourney.com/hc/en-us/articles/32083055291277-Terms-of-Service) | No web/Discord free trial; niji mobile trial separate. Terms identify Midjourney Inc. and US address. Existing paid/scoped note retained. |
| Adobe Firefly | [credit FAQ](https://helpx.adobe.com/creative-cloud/apps/generative-ai/generative-credits-faq.html); [company article](https://blog.adobe.com/en/publish/2026/08/03/honoring-adobe-california-story-investing-in-future) | Limited daily free generations/curated models and paid additions; headquarters San Jose. Existing freemium/US retained. |
| Ideogram | [pricing](https://ideogram.ai/pricing/); [plans](https://docs.ideogram.ai/plans-and-billing/available-plans.md); [terms](https://ideogram.ai/legal/tos/) | Eligible free accounts receive weekly credits; paid plans and extra purchased credits. Terms give Toronto contact. **Current pages did not explicitly reconfirm the catalog's slow-queue wording for free credits.** Absence is not proof it is false; do not label this detail newly verified. Old about-domain terms redirect successfully. |
| Leonardo.Ai | [pricing](https://www.leonardo.ai/pricing); [MSA](https://www.leonardo.ai/master-services-agreement) | Free limited allowance; paid individual/team/API options. MSA gives North Sydney Australian notice address. Successful www redirects do not need source churn. |
| Runway | [free details](https://help.runwayml.com/hc/en-us/articles/50404627334547-Free-plan-details); [pricing](https://runway.com/pricing); [SEC filing](https://www.sec.gov/Archives/edgar/data/1957455/000123191922000071/0001231919-22-000071-index.htm) | Free one-time credits do not refresh; paid plans. Existing corporate source is a historical 2022 filing naming Runway AI Inc., Delaware and New York address, not proof of a newly re-verified current headquarters. |
| Luma Dream Machine | [Agents FAQ](https://lumalabs.ai/learning-hub/frequently-asked-questions-about-the-new-luma-agents-app); [terms](https://lumalabs.ai/legal/terms-of-service); [pricing](https://lumalabs.ai/pricing) | Terms name Luma AI Inc. and Palo Alto address. Pricing reader rejected text/markdown; FAQ did not establish a current free allowance. Keep **unknown**, existing legacy/current qualification and old date. No assertion current pricing fully verified. |
| Pika | [pricing](https://pika.art/pricing); [terms](https://pika.art/terms-of-service) | Current Free has zero monthly credits; paid subscriptions/purchased packs distinct. Terms identify Mellis Inc., Palo Alto. Existing **unknown** and old/current-plan distinction retained; Free label alone does not prove free usable generation. |
| ElevenLabs | [pricing](https://elevenlabs.io/pricing); [terms](https://elevenlabs.io/terms-of-use) | Monthly free credits, paid larger allowances/commercial-license features. Non-EEA terms identify Eleven Labs Inc. and New York address. No claim all regional contracting entities identical. |
| Suno | [pricing](https://suno.com/pricing); [careers](https://about.suno.com/careers) | Free daily allowance without commercial rights, paid monthly allowances with applicable rights supports existing note. Careers source returned 502 twice; **operator-location source not freshly verified**. Do not manufacture a dead-link correction from this transient result. |
| Descript | [pricing](https://www.descript.com/pricing); [terms](https://www.descript.com/terms) | Free limited monthly media allowance/AI tools and paid plans; terms show US contact. Existing freemium retained. |
| DeepL | [translator](https://www.deepl.com/en/translator); [plans guide](https://support.deepl.com/hc/en-us/articles/360019924499-About-DeepL-plans); [publisher](https://www.deepl.com/en/publisher) | Official free-translator entry and separate Pro/API products. Publisher names DeepL SE, Cologne Germany. Existing metadata retained; no account-level quota test. |
| Kimi | [projects](https://www.kimi.com/en/help/features/project); [membership](https://www.kimi.com/en/help/membership/membership-overview); [terms](https://www.kimi.com/user/agreement/modeluse?version=v2) | Free project tier and paid membership; shared credit pool and current local eligibility qualified. Terms identify Beijing Moonshot operator and free/paid services. Published plan names now include newer China plans, but catalog does not hardcode these names/amounts, so no artificial change. |
| Qwen | [entry](https://qwen.ai/); [terms](https://qwen.ai/termsservice) | Both pages returned zero readable text through public reader. Existing **unknown** pricing and SG operator not freshly reconfirmed; no contrary evidence, no date change. Not a site-dead finding. |
| ComfyUI | [download](https://comfy.org/download/); [terms](https://comfy.org/terms-of-service/) | Local core advertised free/open source with hardware responsibility; separate Cloud/platform. Terms name Comfy Organization Inc., Delaware. Existing scoped local-free note stays; no claim partner model/cloud services free. |
| LibreChat | [local setup](https://www.librechat.ai/docs/quick_start/local_setup); [license](https://github.com/LibreChat-AI/LibreChat/blob/main/LICENSE) | Local deployment instructions remain; MIT license permits free software use. ClickHouse affiliation banner does not establish a single project country or make external models/hosting free. Keep project/unknown-country/scoped-free metadata. |


No new confirmed factual error was established. Reader limits and incomplete field-level checks above remain explicit; absence of readable text is not evidence of a dead website or a free/paid plan change. No account login, paid service, regional availability or provider authentication was tested. Historical catalog hashes remain unchanged. This closes the bounded 28-entry review, not a review of every site in the 149-entry directory.
