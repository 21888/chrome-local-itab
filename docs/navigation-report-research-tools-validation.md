# Report and research tools catalog additions

Reviewed 2026-10-13 against baseline `63f92cc6b7a622148c8513800ce06bcdc89ab749`.

This offline content update appends Datawrapper, Wikimedia Commons, WorldCat.org,
Typst and PDF24 Tools. Inventory is 146 unique sites, 18 categories and 218
bilingual use tags. Category memberships total 186 because a site can belong to
multiple categories. The original 141 records and existing locale values are
unchanged. No runtime code, permissions, network requests, tracking, or version
changes are included.

## Official evidence and scope

- Datawrapper GmbH, Germany; freemium. [Pricing](https://www.datawrapper.de/pricing)
  supports free publishing, embedding and PNG export with attribution. Paid plans
  add PDF/SVG export and attribution removal; API usage beyond included free
  allowances is billed separately. [Imprint](https://www.datawrapper.de/imprint).
- Wikimedia Foundation, United States; free browsing/downloads. Commons is an
  [educational media repository](https://commons.wikimedia.org/wiki/Commons:Welcome).
  Reuse depends on each file's license and applicable rights, including possible
  attribution/share-alike requirements. [Operator contact](https://wikimediafoundation.org/contact/).
- OCLC, United States; public catalog search is free, per its
  [annual report](https://www.oclc.org/en/annual-report/2025/home.html).
  [WorldCat](https://search.worldcat.org/) locates books, editions and holding
  libraries; free search does not promise free full text or borrowing.
  [Some features, including all editions, require sign-in](https://help.oclc.org/Discovery_and_Reference/WorldCat-org/Search/Search_WorldCat_org/20Work_with_search_results).
  [Operator terms](https://policies.oclc.org/en/terms/worldcatorg.html).
- Typst GmbH, Germany; freemium hosted editing/collaboration. Its
  [pricing page](https://typst.app/pricing/) distinguishes free web-plan capacity
  limits, paid comments/integrations/capacity and the free open-source compiler.
  [Legal identity](https://typst.app/legal/).
- geek software GmbH, Germany; PDF24 Tools are free for personal/business use,
  supported by ads. [FAQ](https://tools.pdf24.org/en/faq),
  [OCR](https://tools.pdf24.org/en/ocr-pdf),
  [PDF comparison](https://tools.pdf24.org/en/compare-pdf),
  [imprint](https://www.pdf24.org/de/impressum).
  Some online tools upload files. The comparison tool states browser processing;
  Windows Creator provides an offline option. This is not a claim that all PDF24
  processing stays local, nor an independent implementation/privacy audit.

Official-source review checks stated scope and operator location on the review
date, not regional accessibility or future pricing. No accounts were created,
files uploaded, or paid services used. Language/signup fields remain unknown
rather than asserting unsupported whole-service guarantees.

## Regression coverage

`tests/navigation-report-research-tools.test.js` pins the original record hash,
new IDs, schema/URL uniqueness, 146/18/218 counts, eight new bilingual tags,
name/alias/purpose search, exact filter composition, AND-search exclusions and
scoped pricing/privacy language. Existing navigation tests and three README
inventory paragraphs are updated to current counts. Historical screenshots and
past release descriptions remain historical evidence.

The package workflow checks all 118 runtime files against the source snapshot.
Node/Python/package outcomes are reported with the development candidate; a ZIP
build alone does not constitute native-browser validation.
