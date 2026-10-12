# Four everyday navigation additions

Official sources reviewed on 2026-10-12. This append-only catalog update adds
USA.gov, iFixit Repair Guides, Lichess and Buffer to the existing 120 records:
124 sites, 186 bilingual purpose labels and the same 18 categories. The first
120 records, including their order, aliases and provenance, remain identical.
Their JSON SHA256 is
`5c2b22fe9c94bb43e6f76823344a1692b8475d0f5c5f313fea0645ab8644e9b2`.

## Verified sources and boundaries

- **USA.gov** (`usa-gov`, Public services): the [official about page](https://www.usa.gov/about)
  identifies the U.S. General Services Administration (US) and the government
  service directory. The [privacy and security page](https://www.usa.gov/privacy-security)
  describes free assistance with government questions, analytics cookies and
  the privacy boundary when leaving for another agency. Pricing is
  `not_applicable`: the directory is not a priced service plan. It does not
  mean that every government application is free or that everyone qualifies.
  The visible pricing note directs eligibility, application requirements and
  fees to the responsible agency. Existing government-information and
  public-service-guides labels are reused. USA gov / USAGov aliases support
  punctuation-free English brand searches; Chinese purpose search is provided
  by the description and translated labels, not an invented official name.
- **iFixit Repair Guides** (`ifixit`, Everyday life): the [official homepage](https://www.ifixit.com/)
  offers free repair guides separately from tools and parts in its store. The
  entry opens [Repair Guides](https://www.ifixit.com/Guide), not a purchase or
  chatbot flow. The [privacy policy](https://www.ifixit.com/Info/Privacy),
  updated April 8, 2026, identifies the United States location and describes
  analytics/marketing cookies and personal information processing. The
  [terms of use](https://www.ifixit.com/Info/Terms_of_Use) apply to the service.
  `free` covers reading guides only; tools, parts and other services are not
  included and successful repair is not promised. New bilingual labels:
  repair-guides and device-repair.
- **Lichess** (`lichess`, Games): [about](https://lichess.org/about) establishes
  free, ad-free online chess supported by volunteers and donations. The
  [privacy policy](https://lichess.org/privacy) identifies Lichess.org as a
  French association with an address in La Mure, France. The
  [terms of service](https://lichess.org/terms-of-service) confirm the French
  organization. `free` and no advertisements do not imply no data processing:
  the visible note explicitly mentions IP addresses, session cookies and
  account data; the privacy policy also describes messages. Donations are
  voluntary. New bilingual labels: online-chess and chess-practice.
- **Buffer** (`buffer`, Marketing): [pricing](https://buffer.com/pricing)
  establishes the free plan's maximum 3 channels, 10 simultaneously queued
  posts per channel and 1 user. Ten is a queue limit, not a monthly allowance.
  Paid tiers expand limits and are billed per channel. Buffer's [legal page](https://buffer.com/legal)
  is an integrated document, not a redirect: it contains the current
  [terms](https://buffer.com/legal#terms) and
  [privacy policy](https://buffer.com/legal#privacy-policy). Terms section
  17.4 and the privacy contact identify Buffer, Inc. in San Francisco,
  California (US). Connecting social accounts grants access and can involve
  access tokens, posts and engagement data; the visible note warns about
  permissions and processing. New bilingual labels: social-scheduling and
  social-publishing.

The price classification, operator country and editorial verification date
are not availability, regional eligibility or future pricing guarantees.
Language/signup fields remain unknown rather than inferring broad coverage.
Board Game Arena and Open Food Facts are deliberately excluded because their
pricing/terms review was incomplete.

## Privacy and interaction scope

All entries remain local catalog data, represented by two-letter text icons.
Existing official-site and source links open only on user action. Viewing,
searching, filtering, opening details and cancelling the add review do not
contact these sites, fetch favicons, connect accounts or submit any personal
content. No runtime code, permissions, manifest version, default shortcuts,
or user-device files change. Manifest remains 1.1.95.

## Validation

Tests pin 124 unique IDs and canonical URLs, all 120 unchanged original
records, 18 categories, 186 bilingual labels, the six newly introduced labels,
metadata dates, precise pricing boundaries, name/alias normalization, Chinese
purpose searches and combined category/tag/company/country/pricing filters.
Bilingual synthetic view tests discover all four, retain selection across
searches, cancel with zero writes, confirm one explicit batch and prevent
duplicate additions. Existing offline-network guards apply to the enlarged
catalog. Historical catalog tests retain their original hash boundaries while
current total-count assertions account for the new entries.

No native browser testing, screenshots, commit, push or Release was performed
in this implementation pass. All interaction evidence here is synthetic.

Completed checks:

- Full Node suite: 2,509 passed, zero failures/skips, run sequentially with
  `NODE_OPTIONS=--max-old-space-size=1024`.
- Final focused navigation suite: 231 passed, zero failures/skips.
- Full Python suite: 64 passed.
- All JavaScript syntax checks, locale/manifest JSON parsing and diff
  whitespace checks passed. Direct manifest comparison remains identical.
- Offline runtime ZIP build and exact source verification passed: 112 files,
  2,560,175 uncompressed source bytes. SHA256:
  `7fce5f768b7ff0f87253b02e1ad83b5f1ecf78bbab0502295715c22006374ea5`.


## Prepared development snapshot: limited native check

2026-10-12, independent CfT155 Chinese desktop-light synthetic profile loaded
112-file dev95 ZIP `7fce5f768b7ff0f87253b02e1ad83b5f1ecf78bbab0502295715c22006374ea5`.
Catalog showed124/110 not added/14 added. ASCII searches for all four brands each
found one card. Expanded details showed operator/location/pricing/source caveats:
Buffer simultaneously scheduled posts rather than monthly quota; iFixit free
reading of guides with parts/tools separate; Lichess free/donation/privacy scope;
USA.gov informational role and agency-specific fees/eligibility.
Four selections survived searches; full review listed all names/URLs and target.
Escape canceled, reopening showed0 selected and unchanged124/110/14. Default14/
Clarity light/Grid restored. No external links, authorizations, purchases or saves.
186 uses and original120 preservation remain source/test counts, not native
manual enumeration. No dark/320 or exhaustive filter/focus matrix; screenshots
remain transcript evidence. This does not verify live external availability.
