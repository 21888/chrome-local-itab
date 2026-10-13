# Open learning resources catalog addition

Reviewed on 2026-10-13. Four static records bring the catalog to 132 unique sites,
193 bilingual uses and the same 18 categories. The original 128 records are
unchanged; their JSON SHA-256 is
`0b81996ae82fa11f01275695fc41dd88dc26e25ddedda1d1cbd67fd76b2aca99`.

- **Project Gutenberg**: Project Gutenberg Literary Archive Foundation, US.
  [About](https://www.gutenberg.org/about/) confirms free ebooks and the operator;
  [contact details](https://www.gutenberg.org/about/contact_information.html)
  establish its US address. [Terms](https://www.gutenberg.org/policy/terms_of_use.html)
  and the [license](https://www.gutenberg.org/policy/license) distinguish US
  copyright assessment from rules in other countries. Free ebooks are not a
  claim that every title is public domain worldwide.
- **Smithsonian Open Access**: Smithsonian Institution, US. The
  [official FAQ](https://www.si.edu/openaccess/faq) covers free reuse of assets
  designated CC0, not blanket permission over every item. The
  [terms](https://www.si.edu/termsofuse) preserve third-party rights, including
  privacy and publicity. [Contacts](https://www.si.edu/contacts) and its
  [institution building](https://www.si.edu/museums/smithsonian-institution-building)
  support the operator location. No API key or account is created.
- **OpenLearn**: The Open University, GB. The
  [getting-started page](https://www.open.edu/openlearn/get-started-openlearn),
  [FAQ](https://www.open.edu/openlearn/about-openlearn/frequently-asked-questions-on-openlearn)
  and [free-courses overview](https://university.open.ac.uk/open-educational-resources/openlearn/free-courses)
  describe free courses, account-based progress/participation statements and the
  absence of formal qualification credit. [Copyright terms](https://about.open.ac.uk/strategy-and-policies/policies-and-statements/copyright-openlearn)
  qualify non-commercial reuse and third-party materials; the
  [Milton Keynes campus](https://about.open.ac.uk/locations/milton-keynes-campus)
  supports GB.
- **British Council LearnEnglish**: British Council, GB. The
  [FAQ](https://learnenglish.britishcouncil.org/frequently-asked-questions)
  confirms free materials without an account, account-based community/tests and
  that the former LearnEnglish subscription no longer accepts new subscribers.
  The [home page](https://learnenglish.britishcouncil.org/) still links separate
  paid courses. `freemium` describes these free materials plus separate paid
  offerings; it does not advertise the discontinued subscription or a fixed price.
  [About](https://www.britishcouncil.org/about-us) supports the UK operator;
  [terms](https://www.britishcouncil.org/terms) govern reuse. The research pass
  could inspect official search-indexed terms but direct retrieval timed out;
  the catalog therefore gives only a general instruction to check current terms.

Language/signup metadata remain `unknown`; verified account conditions are written
in explanatory notes instead of adding a new metadata enum. All four use the
existing Learning category. E-books, cultural collections and English learning are
three new bilingual use tags; existing useful tags are reused. Chinese discovery
works through descriptions without expanding the existing brand-alias list.

This catalog is not legal advice. Check each resource's current license and the
official site's terms before reuse. 本导航说明不构成法律建议；具体资源许可及复用条件以官网当前说明为准。

## Boundaries and verification

Only static catalog/localization data, docs and regression tests change. No runtime
fetch, remote icon, automatic external navigation, download, account creation,
permission request or manifest change is introduced. All links remain explicit
user actions. Source review is not a live availability or worldwide access guarantee.

Regression coverage includes the preserved-data hash, ID/URL uniqueness, schema,
counts, bilingual search combined with every exact selector, AND search semantics,
scoped pricing/copyright/credit notes and a two-locale synthetic DOM flow: select
all four across searches, reveal hidden selections, review all four, close/reopen
and verify zero saved links. Native browser checks and publication are separate.

Prepared-snapshot results (manifest 1.1.101, unchanged):
- Strict unhandled-rejection mode, 1 GiB Node heap, concurrency 1: 2,574/2,574.
- Focused navigation suite: 260/260; final learning/view recheck: 109/109.
- Python tests: 81/81.
- Changed JavaScript syntax, localization JSON and `git diff --check`: pass.
- Offline runtime ZIP: 112 allowlisted files; build and source verification pass.
- Package SHA-256: `3ddc6f627090ebc9be63a0cbe984e7af048b7ab63be2166b715b757915e1b0ae`.
- No native browser test, external navigation, commit, push or release performed
  in this preparation step.
