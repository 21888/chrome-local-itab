# Six specialized navigation services

Reviewed 2026-10-12. The offline catalog grows from 114 to 120 sites and
168 to 180 bilingual use labels, within the existing 18 categories. The
original 114 records and their order remain unchanged. No permissions,
defaults, runtime behavior, network requests or saved shortcuts change.

## Evidence and scope

- **PhET Interactive Simulations**: science simulations in Learning. The
  [official introduction](https://phet.colorado.edu/en/about) and
  [university resource page](https://www.colorado.edu/csl/programs/phet-interactive-simulations)
  establish free website simulations; this is not a promise about app pricing
  or every license use. The [project contact](https://phet.colorado.edu/en/about/contact)
  locates the University of Colorado project in Boulder, Colorado.
- **WAVE**: web accessibility evaluation in Development and Design.
  [About WAVE](https://wave.webaim.org/about) identifies WebAIM at Utah State
  University, its Utah address, and its free community service. The
  [terms and privacy notice](https://wave.webaim.org/terms) distinguish the
  online server's handling of submitted URLs/content from the browser
  extension. The catalog explicitly describes server processing, separate
  API offerings, and the need for human evaluation. It does not submit any
  page, install an extension, perform automated scans or promise compliance.
- **O*NET OnLine**: U.S. occupation skills, tasks and education in Careers.
  [O*NET overview](https://www.onetcenter.org/overview.html) identifies the
  free occupational database, U.S. government program and National Center
  for O*NET Development's role. [Official contact](https://www.onetcenter.org/contact.html)
  confirms the Center's support role. The entry describes U.S. occupational
  information rather than a hiring or placement service.
- **We Work Remotely**: remote role discovery in Careers, reusing the existing
  job-search tag. The [FAQ](https://weworkremotely.com/frequently-asked-questions)
  distinguishes free Basic from paid Pro and TopAccess. The
  [terms](https://weworkremotely.com/terms-and-conditions), updated July 20,
  2026, name We Work Remotely Ltd. and describe annual paid commitments with
  remaining-term payments due after cancellation. The note includes that
  important boundary without pinning changing amounts. Country stays unknown:
  facilities or governing law alone do not establish an operator location.
  Listings may restrict location and eligibility; outcomes are not promised.
- **Google Dataset Search**: dataset discovery in Search and Learning.
  [Official help](https://datasetsearch.research.google.com/help) describes
  searching across repositories. No standalone price is established there,
  so pricing stays unknown. Linked datasets retain their own access and
  license conditions.
- **Google Ads Transparency Center**: advertiser/ad discovery in Marketing.
  [Official help](https://support.google.com/adspolicy/answer/13733850?hl=en)
  explains searches by advertiser or website and date/location filters.
  Pricing stays unknown because the reviewed documentation does not establish
  a standalone price. This directory entry neither buys ads nor provides
  performance analytics. Google remains a verified brand for both entries;
  country stays unknown rather than treating regional terms as a global
  product-operator location.

All six retain unknown language/signup fields and use only official HTTPS
sources. Verification dates mean editorial source review, not a live
availability or regional access guarantee. Links and source notes are stored
locally and opened only by user action. Existing personal content is not sent
to these services by browsing or filtering this catalog.

## Verification

The specialized-service tests pin the original 114-record SHA256, six appended
IDs, unchanged schema, twelve new bilingual tags, 120 unique sites and 18
categories. Tests cover bilingual use/name searches, normalized names, AND
query semantics, exact combined category/tag/company/country/pricing filters,
conservative prices and the WAVE/WWR boundaries. View tests discover all six
in both languages, select them across searches, cancel review with zero writes,
confirm one batch, show six saved entries, and disable duplicate additions.
Existing offline network guards remain in place.

No browser QA, screenshots, commit, push or release was performed in this
implementation pass. The manifest remains at 1.1.89.

Completed checks:

- Focused navigation suite: 183 passed, none failed or skipped.
- Full Node suite: 2,418 passed, none failed or skipped.
- Full Python suite: 64 passed.
- Direct comparison: original 114 records and entire manifest unchanged.
- All JavaScript syntax checks, locale/manifest JSON parsing and diff whitespace checks passed.
- Offline runtime ZIP build and exact source verification: 112 files passed.
  Runtime ZIP SHA256: `fc62690f482bd161bf065c59cec2f97efc6ba413fc2248cd0c80a97d3c94c612`.

## Prepared development snapshot: bounded native verification

2026-10-12, independent Chrome for Testing 155.0.8059.39 Chinese synthetic
profile. The prepared 112-file development ZIP has the same `fc62690f482bd161bf065c59cec2f97efc6ba413fc2248cd0c80a97d3c94c612`
hash above and retains version89, distinct from published89. Ordinary Reload
loaded it; this docs-only update preserves its bytes.

- Native catalog showed120/106 not added/14 added. ASCII searches located all
  six additions and expanded details showed their documented purpose, operator
  and pricing caveats. `onet` also matched IMF Data; O*NET was selected specifically.
- WAVE server processing/human-review limits, We Work Remotely annual-paid-plan
  cancellation obligation, PhET website scope, O*NET occupational scope and
  both Google entries' unknown pricing/country were visible.
- Ads Transparency + Marketing + Google + unknown pricing returned one result.
  A later nonmatching query kept six hidden selections; review showed all six
  names/canonical URLs and existing destination. Escape canceled without saving;
  reopening showed120/106/14 and zero selected.
- At 320×900 light/dark, the representative longest new title, Google Ads
  Transparency Center, and its description/details/source URLs wrapped within
  the card without observed horizontal clipping.
- Clarity light/Grid and fourteen saved sites/category counts were restored.

This is a limited native pass. Country filtering was not successfully applied,
so it is not counted. The 180-use/18-category totals and unchanged original114
remain source/test evidence, not exhaustive native enumeration. No actual add,
external links, provider calls, paid plan, real accessibility scan or full-site/
filter/locale/viewport matrix. AI/note fixtures were untouched but not re-audited.
Screenshots remain tool-transcript evidence, not release attachments.
