# Navigation catalog: task coverage expansion

## Scope

The offline catalog grows from 84 to 108 unique sites across the same 18
categories, and from 116 to 154 bilingual use labels. The 24 additions cover
regex and API testing, structured-data conversion, browser compatibility,
image editing, fonts/icons, diagramming, programming practice, mathematical
exploration, research writing/citations, and official laws/standards searches.

Only catalog records, 38 new messages in each English/Chinese locale, tests,
and documentation change. Existing 84 records and locale messages are
preserved. UI code, default shortcuts, permissions, runtime dependencies and
version are unchanged by this feature patch. No runtime network lookup is
introduced; source links open only through the existing explicit link action.

## Source review (2026-10-12)

Each added record retains its official evidence URLs and source-review date.
Descriptions and pricing notes are bilingual. All language/signup fields stay
`unknown`; 18 operator countries and six pricing records remain `unknown`.
No availability, privacy, unlimited-use or unrestricted-license promise is
inferred from an open-source project or an accessible landing page.

High-risk metadata was checked against official sources:

- [Photopea accounts](https://www.photopea.com/api/accounts) distinguishes the
  consumer free ad-supported account from Premium; API/self-hosted pricing
  does not determine this entry's classification.
- [regex101 multiple test strings](https://support.regex101.com/application/regex101-pro/multiple-test-strings/)
  and [debugger documentation](https://support.regex101.com/application/regex101-pro/regex-debugger/)
  establish free/Pro feature limits. The main Pro overview timed out during
  integration review; these official indexed documentation pages independently
  support the free-plus-paid classification. No exact price is stored.
- [JSON Crack's FAQ](https://jsoncrack.com/) identifies its own free tool,
  practical data-size limits, and the separate ToDiagram paid features.
- The [official migration notice](https://openstd.samr.gov.cn/bzgk/std/nd?no=83)
  says the old standards full-text service moved into
  [the national standards platform](https://std.samr.gov.cn/). The new URL is
  used; universal full-text availability is not claimed.

Source review is not functional testing of the 24 external services. Prices,
product conditions and access can change; consult the recorded official
sources. There were no account creations, external file uploads or user-data
submissions for this expansion.

## Regression coverage

New tests pin the 108 unique IDs/URLs and 154 use labels; exercise English and
Chinese translated-use searches; preserve uncertain metadata and scoped
pricing; reject equivalent-URL duplicates; and verify representative new
entries through the existing saved-state filter and add flow. Existing schema,
URL, provenance, bilingual, dependency and no-runtime-fetch guards remain.
Historical 1.1.76/1.1.77 native reports retain their original 84-site counts,
which describe the snapshots actually tested then.

## Verified implementation candidate

The reviewed seven-file feature patch has SHA-256
`9e909fdcf7bd1ac3cfb62075edb34f514e8f4ef6083a91c7760bcf75545a48dd`.
Its independent full run passed 2301 Node tests (zero failures/skips/cancellations,
no unhandled/asynchronous diagnostics) and 53 Python tests; 41 focused tests and
canonical 112-file package verification also passed. Existing 84 records and old
locale messages were compared individually and remain unchanged. Release
preparation applies this patch on published 1.1.78, then changes only the manifest
version and release/validation documentation. No new full-run result is implied
for documentation-only commits after that implementation verification.

## Bounded native catalog smoke — 2026-10-12

The existing synthetic Chrome for Testing 155.0.8059.39 installation loaded the
exact 112-file ZIP with SHA-256
`30d85b767bb14395f38eda05abda055dc0a91ed0c8ace0d744fa76536cc3ae56`.
The hash, version and runtime paths were verified before replacement; ordinary
Reload showed 1.1.79 in native Extensions UI. This documentation-only update
preserves the tested runtime bytes.

English Clarity light desktop representative checks passed:

- The library showed 108 sites, Not added104 / Added4, matching existing
  synthetic shortcuts.
- Search psd found Photopea with Photo editing/PSD editing and Free + paid plans.
  Details showed ad-supported free accounts, Premium removing ads and possibly adding
  benefits, prices in the account window, 2026-10-12 review date and two official
  Photopea source labels. The coordinating reviewer inspected this screenshot.
- Search jsoncrack found the initially unadded JSON Crack. Adding to Learning
  produced confirmation and Added1 / Not added0. Clicking the existing Added
  affordance did not duplicate it; the dashboard showed five shortcuts, JSON
  Crack once and Learning four.
- Search samr found the national standards platform with `std.samr.gov.cn`.
  Details showed the official organization/CN, English standards description,
  full-text/download availability and copyright caveat, review date and source
  labels for the current and legacy official platforms. Links were not opened.

Not covered: exhaustive 108-record review, Chinese locale/input, external-link
reachability, other themes/resolutions or AI streaming. No personal data,
provider calls, browser injection, permission changes or uploads were involved.
Screenshots remain local. These checks verify representative displayed records
and the existing add-state flow, not real-time availability or functionality of
all linked services.
