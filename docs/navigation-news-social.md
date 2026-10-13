# News and social catalog addition

Reviewed on 2026-10-13. Three static records bring the catalog from 136 to 139
unique sites, with 204 bilingual use tags and the same 18 categories. The original
136 records remain unchanged; their JSON SHA-256 is
`48423fd8a0846b0fdde25e46ed636e94658e719dd9c2159b4bdc522108d96698`.

## Official evidence and limits

All pages below were read directly on 2026-10-13. This was a public-source review,
not a signed-in product test. No registration, login, submission or purchase was
performed. Price labels describe the scoped offering, not every linked service.

- **Inoreader**: Innologica Ltd, BG. The [home page](https://www.inoreader.com/)
  explains the RSS reader; [pricing](https://www.inoreader.com/pricing) specifies
  the free account's 150 RSS feeds and paid features. The
  [terms](https://www.inoreader.com/tos) describe automatic subscription renewal.
  The [privacy policy](https://www.inoreader.com/privacy_policy) identifies
  Innologica Ltd in Sofia, Bulgaria. A personal collection requires an account;
  third-party publishers retain their own access conditions. Region-dependent
  currency prices are not fixed into the catalog.
- **Hacker News**: Y Combinator Management, LLC, US. The public
  [listing](https://news.ycombinator.com/) and discussions were readable without
  payment or login. The [FAQ](https://news.ycombinator.com/newsfaq.html) confirms
  Y Combinator ownership/funding and participation thresholds; the
  [login page](https://news.ycombinator.com/login?goto=news) shows account-based
  participation. [YC legal terms](https://www.ycombinator.com/legal/) cover its
  subdomains, reference HN guidelines, and identify the LLC and its California
  address. `free` covers public listings/discussions only. External articles may
  have paywalls; it is not a claim that all Y Combinator products are free.
- **Mastodon**: Mastodon GmbH, DE. The [home page](https://joinmastodon.org/) and
  [about page](https://joinmastodon.org/about) describe the free, open-source
  project and public server directory. The current about-page Impressum identifies
  Mastodon GmbH in Berlin, Germany; the former gGmbH name is not used. The
  [signup documentation](https://docs.joinmastodon.org/user/signup/) distinguishes
  independent servers and open, invitation or approval-based registration.
  `free` applies to the software/public project directory. Server terms,
  registration policies and possible fees vary. Self-hosting costs and optional
  donations are outside this classification. DE identifies the project website's
  operator, not the operators or locations of all servers.

Language/signup remain `unknown`; observed account conditions are explained in
pricing notes rather than generalized into unsupported metadata. Four new tags
are RSS reader, Read later, Technology news and Federated social; existing
Discussions and Communities are reused. New aliases are RSS 阅读器, HN, 黑客新闻
and 长毛象. All previous records, aliases and locale keys retain their values.
BG uses the existing Intl region-label path: Bulgaria (BG) / 保加利亚 (BG), with
literal BG when Intl support is missing. It requires no third locale or runtime
code change.

The review does not guarantee worldwide or China availability, news impartiality,
platform safety, server acceptance or logged-in features. Sources can change.

## Scope and validation

Only static catalog/localization data, tests and this document change. Manifest
1.1.106 remains unchanged. No runtime request, remote icon, automatic navigation,
account creation, download or permission is introduced. External links remain
explicit user actions. No user data or credentials are present in fixtures.

Regression tests cover preserved-record hashing, schema, ID/URL uniqueness,
139 sites /204 tags /18 categories, new aliases, bilingual tag search with every
exact selector, AND semantics, operator identity and scoped pricing notes. The
synthetic two-locale DOM checks cover cross-query selection, hidden selection
review, close/reopen with zero writes, and Bulgaria labels in options, details
and active filter chips with both Intl and ISO-only fallback.

Native-browser review and publication are separate from this preparation step.

Prepared-snapshot results (manifest 1.1.106, unchanged):
- Full Node tests, strict unhandled rejections, 1 GiB heap, concurrency 1:
  2,670/2,670 passed.
- Final news/social and navigation-view focused tests: 125/125 passed.
- Python tests: 81/81 passed.
- Changed JavaScript syntax, locale JSON and `git diff --check`: passed.
- All original 136 records and previous locale key values compared unchanged.
- Offline runtime ZIP: 112 allowlisted files; build/source verification passed.
- ZIP SHA-256: `664fdade6bfc908472865f7390031fa7a2e06a41638a559614394bf940fe64c0`.
- No native-browser test, commit, push or release performed by this preparation.
