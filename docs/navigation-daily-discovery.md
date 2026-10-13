# Daily discovery catalog addition

Reviewed 2026-10-13. Four static entries bring the catalog to 136 unique sites,
200 bilingual uses and the same 18 categories. The original 132 records, their
order, aliases and provenance are unchanged. Their JSON SHA-256 is
`022320e9aae5e3fd80fa4225bb7d4b8a9f1c2a69cd3e563d48425c19958d3005`.

## Official evidence and scope

- **CFPB Consumer Resources**: Consumer Financial Protection Bureau, US. The
  [consumer tools](https://www.consumerfinance.gov/consumer-tools/) page covers
  credit, borrowing and banking; [contact details](https://www.consumerfinance.gov/about-us/contact-us/)
  establish its Washington address. An [archived official article](https://www.consumerfinance.gov/archive/blog/you-have-the-right-to-free-unbiased-financial-information/)
  from 2015 establishes that educational information and tools are free; no old
  tool counts or product pricing are carried forward. This guidance is US-focused
  and is not personalized financial or legal advice. Linked products have their
  own fees and eligibility requirements. [Privacy](https://www.consumerfinance.gov/privacy/website-privacy-policy/)
  was reviewed; free access does not imply no data collection.
- **FTC Shopping Guides**: Federal Trade Commission, US. The current
  [shopping guide](https://consumer.ftc.gov/shopping-and-donating/shopping) covers
  online purchases, reviews, warranties and returns. [Resource sharing](https://consumer.ftc.gov/share-our-resources)
  describes free publications; [contacts](https://www.ftc.gov/about-ftc/contact)
  confirm the Washington headquarters. The entry opens reading resources, not
  shopping checkout or complaint submission. Legal remedies are primarily US-specific.
- **Board Game Arena**: AD2G Studio SAS, France. The complete
  [legal terms](https://en.boardgamearena.com/legal?section=legal) identify the
  publisher and its Guyancourt address (Publishing 1.1). Player G.T.S. 1 and 9
  distinguish free accounts from Premium, confirm Premium members can open tables
  and invite free members, and describe same-device play. Section 9.4 covers
  renewal. Privacy provisions cover account/IP and public username/game data.
  The [Premium page](https://en.boardgamearena.com/premium) did not return complete
  body content during review; pricing boundaries rely on the complete legal terms,
  not that page's shell. The historical exclusion in `navigation-daily-utilities.md`
  records an earlier incomplete review and remains unchanged.
- **AllTrails**: AllTrails, LLC, US. The [plans](https://www.alltrails.com/plans)
  page confirms paid offline maps and trial-to-paid conversion. [Terms](https://www.alltrails.com/terms)
  identify the San Francisco operator (section 19), recurring subscriptions
  (section 3), and trail-condition/safety limits (section 10). The
  [Base help page](https://support.alltrails.com/hc/en-us/articles/37202982202900-AllTrails-Base-membership)
  could not be retrieved directly; its official search index supplied the Base
  free-plan description, app-only Navigate and additional Plus/Peak features.
  Home, plans and terms were retrieved directly. We do not claim free offline web
  navigation or guaranteed current trail conditions or safety.

US/FR describe operator countries, not availability or user eligibility. Language
and signup enums remain `unknown`; specific account conditions appear in notes.
Seven new bilingual tags cover personal finance, financial education, shopping
guides, scam awareness, online board games, multiplayer games and hiking trails.
Route planning reuses its existing label. Runtime locales remain en and zh_CN.

## Boundaries and validation

Only offline catalog/localization data, documentation and regression tests change.
No runtime fetch, remote icons, permissions, account creation, purchase, upload,
automatic external navigation or manifest changes are introduced. Official-source
review is not external end-to-end testing or a regional availability guarantee.
Government education is not personalized financial or legal advice; trail content
is not a real-time safety guarantee. 政府教育资料不构成个性化财务或法律建议；路线资料不保证实时安全。

Tests check preserved-record hash, unique safe IDs/URLs, schema, dates, counts,
all seven bilingual labels, combined filters and AND search, account/pricing and
safety boundaries. A synthetic two-locale DOM flow selects the four records across
searches, preserves hidden selections, reviews all four and cancels/reopens with
zero saved links. No native browser, registration or paid-service checks are claimed.

Prepared snapshot results (manifest 1.1.105 unchanged):
- Full Node suite, strict unhandled rejections, 1 GiB heap, concurrency 1: 2,650/2,650.
- Independent focused navigation review: 277/277; no blocking findings.
- Python tests: 81/81.
- Changed JavaScript syntax, both locale JSON files and `git diff --check`: pass.
- Original catalog source prefix preserved verbatim, in addition to JSON hash checks.
- Runtime ZIP build and verification: 112 allowlisted files; SHA-256
  `8d747b5d9a5e52a5f97448e1339f07717de54264ffb1ebff54873d720d6fdd2f`.
- No browser test, commit, push or release was performed by this implementation step.

## Limited native development checks

Chinese desktop-light local catalog checks passed:136/122/14 counts, CFPB and AllTrails queries returned one card; ftc also matched Microsoft Copilot and board also matched Excalidraw, with only intended new sites selected. Rendered operator/pricing/account/advice/safety caveats and one hovered official-source URL per site checked. Cross-query four-site review remained complete; AllTrails purpose/category filtering and visible deselection preserved hidden3 and destination. Cancel/reopen restored selection0 without additions. No external service/account/purchase/download or individual advice eligibility was tested.200 purposes/18 categories remain source/test counts; dark/320/full filtering and accessibility matrices were not run.
