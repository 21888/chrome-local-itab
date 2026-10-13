# Media and map utilities catalog addition

Reviewed on 2026-10-13. Four static records bring the catalog to 128 unique sites,
190 bilingual uses and the same 18 categories. Existing category IDs, including
`office` (Productivity), are unchanged. All 124 previous records are preserved;
the JSON SHA-256 is
`7eeece45d2752240ede5e180955302baa4735728c05a222d99024e0932584e39`.

- **Ezgif**: Open Idea, Latvia. [About](https://ezgif.com/about) identifies the
  developer and location. [Commercial use](https://ezgif.com/help/commercial-use)
  confirms free use. [Privacy](https://ezgif.com/privacy) describes advertising,
  server uploads and retention up to one hour after last use. Avoid sensitive media.
- **CloudConvert**: Lunaweb GmbH, Germany, per [About](https://cloudconvert.com/about).
  [Pricing](https://cloudconvert.com/pricing) lists 10 daily credits, 1 GB and
  five-minute free-plan limits; credits are not equivalent to a fixed conversion
  count. Paid credit packages and monthly subscriptions are separate options.
  [Privacy](https://cloudconvert.com/privacy) specifies deletion within 24 hours;
  this conservative policy wording is used rather than an immediate-deletion claim.
- **AudioMass**: Pantelis Kalogiros / AudioMass; operator location remains unknown.
  [About](https://audiomass.co/about.html), the [official repository](https://github.com/pkalogiros/AudioMass)
  and [license](https://github.com/pkalogiros/AudioMass/blob/production/LICENSE)
  support free open-source local browser editing without a backend. Recording
  requires microphone permission. Local file processing is not a claim that the
  website collects no visit data.
- **Google Maps**: the consumer map entry, under the Google brand. Operator location
  remains unknown because [US terms](https://policies.google.com/terms?hl=en-US)
  establish a US operator for that regional contract, not one global operator.
  [Consumer help](https://support.google.com/maps/answer/3096703?hl=en) supports
  free use, separate from developer-platform/API billing and mobile data charges.
  [Privacy help](https://support.google.com/maps/answer/10400210?hl=en) describes
  permissions and account settings; features and operator vary by region.
  [Product overview](https://www.google.com/maps/about/) describes places and routes.

Language and signup metadata stay unknown rather than being inferred. Four new
bilingual use labels cover GIF editing, animated images, audio editing and audio
effects; existing conversion and map tags are reused. Descriptions support Chinese
and English task queries without adding unverified brand aliases.

## Boundaries and verification

No runtime request, remote icon, automatic external navigation, upload or permission
request is introduced. The existing source-link and explicit-add flows are retained.
No manifest or permission changes are needed. Source review does not guarantee live
availability, pricing or feature parity in every region.

The regression tests cover the preserved-data hash, schema/category/ID/URL uniqueness,
bilingual search combined with every exact filter, AND queries, pricing/privacy
limits and offline rendering boundaries. Browser checks and publication are separate
steps; this catalog-only preparation does not claim to perform them.

Prepared-snapshot results (manifest 1.1.100, unchanged):
- Strict unhandled-rejection mode, 1 GiB Node heap, test concurrency 1: 2,564/2,564.
- Focused navigation tests: 250/250.
- Python tests: 81/81.
- Changed JavaScript syntax, manifest/localization JSON and `git diff --check`: pass.
- Offline runtime ZIP: 112 allowlisted files; build and source verification pass.
- No browser tests, commit, push or release performed in this preparation step.

## Limited native development observations

Chinese desktop-light local catalog checks passed: 128 total /114 unadded /14 added; each of the four ASCII brand queries returned one card. Details displayed CloudConvert 10 credits/day, 1GB, 5-minute and conservative 24-hour deletion limits; Ezgif upload/one-hour caveat; AudioMass local-processing and microphone caveat; Google Maps unknown operator location and separate API billing. Four hidden selections persisted across queries into a complete local review, then cancellation/reopening reset selection without adding anything. No external site was opened, upload performed, microphone/location permission requested or live service tested. Responsive/dark and exhaustive filters/focus were not covered. The 190 use tags and 18 categories are source/test counts, not individually native-verified.
