# Six everyday navigation additions

Source review: 2026-10-12. The offline catalog grows from 108 to 114 unique
sites and from 154 to 168 bilingual use labels, within the same 18 categories.
The original 108 records retain their content and order. No runtime behavior,
permissions, defaults, remote catalogs, or saved shortcuts change.

## Coverage and evidence

- **Google Scholar** (search, learning): scholarly literature and citations.
  [About](https://scholar.google.com/intl/en/scholar/about.html) and
  [Search Help](https://scholar.google.com/intl/en/scholar/help.html) establish
  the use case and distinguish open results from subscription full text.
  [US terms](https://policies.google.com/terms?hl=en-US) identify Google LLC.
  The listed US location describes that entity, not every regional contract.
  Search-entry pricing stays unknown; linked papers are not promised free.
- **TuneIn** (media): internet radio, podcasts and live audio.
  [About](https://tunein.com/about/) names TuneIn, Inc. and San Francisco;
  [Premium](https://tunein.com/premium/) distinguishes free and paid plans.
  Freemium does not promise particular sports rights, ad removal, trial terms,
  or region-specific content.
- **Stack Exchange** (social): focused Q&A communities across subjects.
  [The public network](https://stackexchange.com/) describes free public
  knowledge; [public terms](https://meta.stackexchange.com/legal/terms-of-service/public)
  name Stack Exchange, Inc., a Delaware corporation. Free refers to the public
  network, excluding enterprise knowledge products and advertising.
- **eBay** (shopping): secondhand, refurbished goods, collectibles and auctions.
  [Buying help](https://www.ebay.com/help/buying/buy-now/buying-works-ebay?id=4002)
  and [sustainable commerce](https://www.ebayinc.com/impact/sustainable-commerce/)
  establish those uses. [Corporate contact](https://www.ebayinc.com/company/contact-us/)
  identifies the US base; [user agreement](https://www.ebay.com/help/policies/member-behavior-policies/user-agreement?id=4259)
  names different contracting entities by user region. The US label is the
  corporate base, not a global contracting or availability claim.
  Pricing is not applicable to this marketplace entry; items and fees are
  separate, and [bidding](https://www.ebay.com/help/buying/buy-now/buy-now?id=4003)
  can create a purchase commitment.
- **Rome2Rio** (travel): compare rail, bus, flight and ferry combinations.
  [About](https://www.rome2rio.com/about/) and
  [company disclosure](https://www.rome2rio.com/company-disclosure/) identify
  Rome2Rio Pty Ltd and its Australian base. Search-entry pricing remains
  unknown; users must confirm fares, schedules and booking terms with providers.
- **17TRACK** (everyday life): cross-carrier parcel-status lookup.
  [About](https://www.17track.net/en/about) and
  [consumer-service explanation](https://help.17track.net/hc/en-us/articles/4687259231897-Who-are-we-and-why-is-it-important-to-you-A-letter-from-17TRACK)
  distinguish free small-to-medium consumer tracking from paid extensions.
  The [2026-06-23 privacy policy](https://www.17track.net/privacy-zh-cn.html)
  names different regional personal-information controllers; that does not
  establish a global service-contract entity. Company is the verified brand
  `17TRACK`, country stays unknown. There are no numeric API quotas, carrier
  counts, delivery guarantees, or claims that this tracker ships or refunds goods.

All descriptions, pricing notes and use labels are English/Chinese. Language
and signup metadata stay unknown. Review dates indicate source review, not
live regional accessibility or future availability. No new aliases were added.

## Regression coverage

`navigation-service-expansion.test.js` pins the six appended IDs, existing
schema, 114 records / 168 uses / 18 categories, conservative pricing and
17TRACK identity boundaries, bilingual task searches and combined filters.
The previous metadata-review hash still protects the original 108 records.
View tests cover discovering every new service in both languages, selecting
six, cancelling review without writing, explicit batch confirmation, updated
114/6 saved-state counts and duplicate prevention. Existing view count
assertions now expect 114 rather than 108; older historical validation reports
retain their original observed counts.

No native-browser QA, screenshots, commit, push or release was performed as
part of this implementation pass. Native QA is a separate verification stage.

Implementation verification completed:

- Full Node suite: 2,393 passed, 0 failed/skipped.
- Full Python suite: 53 passed.
- Offline runtime ZIP build and exact source verification: 112 files passed.
- Direct deep comparison confirms all original 108 entries are unchanged.
- Manifest/version/permissions are byte-identical to the implementation baseline.
- `git diff --check` passed.

## Versioned runtime and bounded native verification

The 1.1.87 candidate adds manifest 86→87 and release/validation documentation.
Independent Chrome for Testing 155.0.8059.39 loaded its exact 112-file ZIP:
`9fce5f5a90d12ea9768912859b5878748102d5fe713fd112e485c03328020a15`.
Ordinary Reload showed 1.1.87; this docs-only finalization preserves its bytes.

Chinese native checks passed on 2026-10-12:

- Default catalog showed 114 / 100 not added / 14 added. The 168-use and
  18-category totals remain source/test counts, not independently counted UI evidence.
- Each new site's ASCII search and expanded details showed purposes, scoped
  pricing/country/company and source links. `stack exchange` returned two results
  including existing Stack Overflow; the other five searches returned one each.
- Details retained scholarly paid-full-text, audio plan/region, public-Q&A scope,
  marketplace costs/bidding, carrier fares/timetables and consumer-versus-business
  tracking caveats. 17TRACK country remained unknown.
- All six were selected across searches. `17track` plus incompatible Development
  category showed zero results while retaining six hidden selections. Review
  showed six names/full URLs and existing target `qa remaining`. Escape canceled
  and returned entry focus; reopening had zero selected. Nothing was saved.
- At actual 320px light and dark, the representative 17TRACK long explanation
  and source links remained readable without horizontal overflow.
- Ended Clarity light desktop; fourteen saved sites and category counts unchanged.

No external/source links were opened. This is not all-site live availability,
all country/pricing combinations, all cards/widths, actual-add/persistence,
CJK input, 20-item/race or complete theme verification. Existing AI/note fixture
contents were not re-audited here. Screenshots stay local; no provider calls,
credentials or permission changes were involved.
