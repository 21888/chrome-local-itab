# Navigation operator and pricing metadata review

Reviewed 2026-10-12 against official sources. This is a metadata-only change: 108 entries, URLs, descriptions, categories, tags, permissions and runtime behavior remain unchanged. Sixteen existing country values are resolved; three pricing values are resolved across 17 entries. Sources remain local data and are opened only on user action. No runtime metadata lookup is added.

## Meaning and scope

Country identifies the reviewed named service operator; it does not describe availability, server location, ownership nationality, every affiliate, or every customer contract. General service terms take precedence over inferring an operator from a regional privacy controller. Where the same worldwide service explicitly chooses different contracting entities by customer region, country remains unknown. Existing brand descriptions are preserved.

## Operator checks

- **github: GitHub, Inc. / US.** Current general ToS definition identifies GitHub, Inc. as service provider. Privacy policy also names Dutch GitHub B.V.; US represents the explicitly named general provider, not every regional data controller.
  - https://docs.github.com/en/site-policy/github-terms/github-terms-of-service
  - https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement
- **perplexity: Perplexity AI, Inc. / US.** Official French consumer terms identify Perplexity AI, Inc., expressly cover www.perplexity.ai, exclude API and Enterprise, and list San Francisco contact address. English URL failed to load.
  - https://www.perplexity.ai/fr/hub/legal/terms-of-service
- **kimi: 北京月之暗面科技股份有限公司 / CN.** Effective 2026-08-31. Search-index Chinese text names 北京月之暗面科技股份有限公司; live English translation names Beijing Moonshot Technology Co., Ltd.; Chinese prevails per section 13.4. Actual office is Beijing.
  - https://www.kimi.com/user/agreement/modeluse?version=v2
- **midjourney: Midjourney, Inc. / US.** Current terms name the provider and its US legal-notice address.
  - https://docs.midjourney.com/hc/en-us/articles/32083055291277-Terms-of-Service
- **figma: Figma, Inc. / US.** Official policy names Figma, Inc. and affiliates; contact address belongs to Figma, Inc. No acquisition claim made.
  - https://www.figma.com/legal/privacy/
- **notion: Notion Labs, Inc. / US.** Policy defines Notion as Notion Labs, Inc. and relevant affiliates and explicitly covers online SaaS and public websites.
  - https://www.notion.com/trust/privacy-policy
- **ilovepdf: ILOVEPDF, S.L. / ES.** Current terms directly identify SaaS provider and registered company country.
  - https://www.ilovepdf.com/help/terms
- **tinypng: Tinify B.V. / NL.** tinypng.com/terms redirects to tinify.com/terms; terms explicitly cover TinyPNG/TinyJPG and identify owner/operator Tinify B.V.
  - https://tinify.com/terms
- **drawio: draw.io Ltd / GB.** Section 1 gives Northampton, United Kingdom registered offices. Section 2 expressly covers app.diagrams.net. Updated v1.2 2026-09-28. Do not assign Swiss draw.io AG (separate product context).
  - https://www.drawio.com/trust/terms-of-use/
- **stackoverflow: Stack Exchange, Inc. / US.** Public Network terms apply to exact catalog entry, rather than Stack Internal/Teams. Current legal notice address is New York.
  - https://stackoverflow.com/legal/terms-of-service/public
- **gitlab: GitLab Inc. / US.** Version GLSA_01.12.26 v8 WEB identifies default provider. The main terms page explicitly applies this agreement to the Free tier; Appendix 2 covers GitLab.com. Different Order Form entities remain possible, so not every customer contract is US.
  - https://about.gitlab.com/terms/
  - https://handbook.gitlab.com/handbook/legal/subscription-agreement/
- **excalidraw: Excalidraw s.r.o. / CZ.** Despite plus subdomain, agreement opening expressly covers https://excalidraw.com website, so operator evidence matches catalog entry. Pricing unchanged.
  - https://plus.excalidraw.com/terms-of-service
- **zotero: Corporation for Digital Scholarship / US.** Direct operator location statement, not inferred from storage/server location. Company already correct; country only changes.
  - https://www.zotero.org/support/terms/terms_of_service/
- **khan-academy: Khan Academy, Inc. / US.** Independently rechecked the official search-indexed privacy policy dated 2026-01-30: its Overview identifies Khan Academy, Inc. as a US-based charitable nonprofit and expressly covers www.khanacademy.org. Direct open returned an empty body, so this verification uses the official-domain indexed policy text. Country follows the explicit operator-location statement, not its separate US server statement or a jurisdiction inference.
  - https://en.khanacademy.org/about/privacy-policy
- **coursera: Coursera, Inc. / US.** Privacy notice updated 2026-09-03 additionally gives principal place of business at 2440 West El Camino Real, Suite 500, Mountain View, CA 94040, USA. Regional branches also exist; do not imply every education provider is US.
  - https://www.coursera.org/about/privacy
- **timeanddate: Time and Date AS / NO.** Official company address and site terms; not inferred solely from Norwegian jurisdiction clause.
  - https://www.timeanddate.com/information/contact.html
  - https://www.timeanddate.com/information/terms-conditions.html

## Independent scope checks

- GitHub: general ToS definition A.7 identifies GitHub, Inc. Privacy contact details establish that entity's US address; the same privacy statement separately names GitHub B.V. in the Netherlands as a data controller. The catalog's US value is scoped to the general service operator, not a claim that all privacy processing is US-based.
- Perplexity: official French consumer terms name Perplexity AI, Inc., cover the catalog's www.perplexity.ai entry, and explicitly describe US operation. API and enterprise agreements are outside this entry's evidence.
- Kimi: current Chinese text independently appears in the official indexed user agreement and privacy policy, naming 北京月之暗面科技股份有限公司. The English agreement gives the Beijing office and says the Chinese wording prevails on conflict. The formal Chinese company name is retained, rather than treating the abbreviated English translation as a different entity.
- draw.io: sections 1 and 2 identify the UK company and expressly include app.diagrams.net. Separate Atlassian products are excluded; their provider is not assigned to this entry.
- Excalidraw: despite the Plus subdomain, the opening terms explicitly cover excalidraw.com; the contact section identifies the Czech operator. The US hosting statement is not used as an operator country.
- GitLab: the terms index applies the current subscription agreement to the Free tier; the agreement defaults to GitLab Inc. and covers GitLab.com. A different entity on an individual order form can override this default, so US is not a universal contracting-country claim.
- Canva: terms select US, UK, or Australian contracting entities based on billing address. Country remains unknown and the existing company label is preserved. Its terms source is attached alongside its newly checked pricing source.

## Pricing checks

- **canva: freemium.** A free design plan is available; Pro, Business and Enterprise are paid upgrades with plan-specific AI limits.
  - https://www.canva.com/pricing/
- **gitlab: freemium.** GitLab.com offers a Free tier with user, storage and compute limits; Premium, Ultimate and extra resources are paid.
  - https://about.gitlab.com/pricing/
- **tinypng: freemium.** The web tool has a free tier with batch and file-size limits; Web Pro and Web Ultra are paid subscriptions. API pricing is separate.
  - https://tinify.com/pricing/web

## Conservative holds

Canva, Photopea, Hoppscotch, MDN and freeCodeCamp retain unknown country. Canva's multi-region contracting entities are explicit; the other four have not gained sufficient service-specific operator-country evidence in this review. No founder biography, server location, domain suffix, placeholder terms, or adjacent paid product is promoted into a country claim.

## Regression coverage

- A metadata fixture records the 17-entry change allowlist, 16 country resolutions, three pricing resolutions, prior sources and expected new sources.
- A SHA-256 guard checks every unmodified field and every other entry against the pre-review catalog, including ordering.
- Every reviewed entry is checked through combined company, country, pricing, category, tag and bilingual search; wrong-country filters must not match.
- Ambiguous entries remain unknown; Canva does not appear under Australia.
- Source URLs are HTTPS, unique and tracking-free; isolated catalog evaluation and filtering run with throwing network APIs.
- Full Node suite, Python suite and reproducible runtime package are required before publication. Native browser UI validation is performed separately on the final release candidate.

## Versioned candidate status

The reviewed five-file implementation patch SHA-256 is
`44445ea5839413d835b2c982960a32d5ecb39c812215f5b1cbf54e1f31baf6b4`.
It is applied to published 1.1.80 without UI or permission changes; release
preparation adds only the 1.1.81 manifest version and release/status records.
The focused metadata checks passed 14/14. The implementation candidate then
passed all 2331 Node tests and 53 Python tests, plus 112-file package verification.
The source-review clarification above changes documentation only; runtime data
and regression tests are unchanged from that full run.

## Bounded native metadata checks — 2026-10-12

The existing synthetic Chinese Chrome for Testing installation loaded the exact
1.1.81 ZIP, SHA-256
`63e1aeb7fd7ca19d92baf5f72ba7112dfae4355d35f47b5a9acbed6d78739dac`.
The version and 108-site default count were observed; this documentation update
does not change runtime bytes.

Representative Chinese Clarity light desktop checks passed:

- GitHub displayed GitHub, Inc., US and official source labels. Searching github
  with US retained GitHub and Copilot (two results); switching to CN returned zero.
- Kimi showed the complete reviewed Chinese company name and CN.
- Canva showed unknown country plus free-and-paid classification. Australia
  excluded Canva and showed only Leonardo.Ai; unknown showed only Canva.
- TinyPNG showed Tinify B.V., NL and the scoped web-tool free limits / paid plans
  note, with API pricing explicitly separate.

Escape returned visible focus to the entry. Saved synthetic shortcuts remained
eight, with no Add, selection or save action. No claim
is made that all 17 changed records, all country/filter combinations, languages,
themes or resolutions were natively inspected. draw.io/Khan and narrow/dark
layouts were not checked. This does not establish that external terms and live
links will stay unchanged. Screenshots remain local; no source link needed to be
opened for these local catalog checks.

## Bounded AI pricing review — 2026-10-15

Four existing entries receive revised bilingual pricing notes, additional official evidence and this source-review date. IDs, names, destinations, operators, countries, tags, catalog size and runtime behavior are unchanged. This is not a logged-in product test or a guarantee of access in any country. Consumer plan labels do not promise API allowances.

- **Cursor**: [Current pricing](https://cursor.com/pricing) and [models and pricing](https://cursor.com/docs/models-and-pricing) distinguish current Free from legacy Hobby. Available third-party models are billed separately from the first request. Keep `freemium`, Anysphere and US; avoid fixing volatile plan names or amounts in the note. Existing customers may retain legacy rules.
- **Grok**: [Current pricing](https://x.ai/pricing) and [subscription overview](https://docs.x.ai/x-subscription/overview) distinguish new subscriptions from legacy SuperGrok. Use generic free/paid wording. The price-page API FAQ and [Grok usage FAQ](https://docs.x.ai/grok/faq) describe API pooling differently, so this note makes no API-allowance claim. Keep `freemium`, SpaceXAI LLC and US; this does not say existing subscribers lost their old plan.
- **Luma Dream Machine**: [Current pricing](https://lumalabs.ai/pricing) and [new Luma Agents FAQ](https://lumalabs.ai/learning-hub/frequently-asked-questions-about-the-new-luma-agents-app) differ from the legacy Dream Machine guides. The FAQ mentions a free trial, but its allowance and the old/new plan mapping are unverified; even Plus/Pro naming differs between official pages. Set pricing to `unknown`, preserve the existing destination, and distinguish legacy Free from current paid/trial information. Do not infer that free access disappeared or transfer legacy commercial-use rules to a different plan. API billing remains separate.
- **Pika**: [Current pricing](https://pika.art/pricing) lists zero monthly Free credits while the [older FAQ](https://pika.art/faq) lists different allowances. Keep `unknown`; state that paid packs/subscriptions supply credits without claiming that no promotional or one-time free credits can exist. Legacy, iOS and API allowances are not interchangeable.

Also reviewed without changes: Replit's daily Agent credits/monthly cap, Runway's one-time nonrefreshing Free credits, Mistral Vibe's name/operator and free/paid entry, and Qwen's operator evidence. Qwen's dynamic public page did not establish a complete current plan, so `unknown` and its existing review date remain unchanged. No dates are refreshed for unrelated entries. Country continues to describe the named operator, not product availability, hosting, founders or a subscription payment merchant.
