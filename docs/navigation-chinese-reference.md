# Chinese official reference catalog additions

Reviewed on 2026-10-13. Two static official entries bring the catalog from 139
to 141 unique sites, with 210 bilingual use tags across the same 18 categories.
The original 139 records retain JSON SHA-256
`9473712ed854a4195ae19e694316f8bf36b999cd9b70a424675b578702670e24`.
All prior locale values are preserved; six new use labels are added in English
and Chinese. Current three-language README counts are updated; historical reports
retain their original snapshot counts.

## Official evidence and boundaries

- **教育部《國語辭典簡編本》**: 國家教育研究院（教育部國語辭典）, TW.
  The [dictionary](https://dict.concised.moe.edu.tw/) and
  [search](https://dict.concised.moe.edu.tw/search.jsp?md=1) support modern
  Mandarin meanings, pronunciation, examples, phonetic and radical indexes.
  [Learning notes](https://dict.concised.moe.edu.tw/note.jsp) require membership.
  The [official overview](https://www.naer.edu.tw/PageMenu?fid=60) describes the
  dictionary; [operator information](https://www.naer.edu.tw/PageDoc/Detail?fid=126&id=3727)
  confirms National Academy for Educational Research maintenance.
  The [official FAQ](https://www.naer.edu.tw/PageFaq) permits ordinary new-window
  hyperlinks, not iframe embedding or API/APP online-query parsing. This entry
  uses only the existing explicit new-tab navigation. No content retrieval,
  integration or embedding is introduced. The dictionary primarily uses
  Traditional Chinese and Taiwan Mandarin; reuse remains subject to licensing.
- **中国领事服务网**: 中华人民共和国外交部领事司, CN.
  The [official homepage](https://cs.mfa.gov.cn/) provides travel advisories,
  destination risks and passport, visa and consular-assistance guidance.
  [About the service](https://cs.mfa.gov.cn/gylsx/) identifies the operator.
  [Passport/travel-document guidance](https://cs.mfa.gov.cn/zggmcgx/hzlxz_149470/)
  distinguishes applications requiring registration, identity verification,
  documents and possible payments from public reading.
  The [ministry website](https://www.mfa.gov.cn/web/xglj/zylj/) identifies its
  Beijing location. Eligibility depends on nationality, destination and consulate.

Both entries use `not_applicable` for public reference information, not a blanket
claim of free services or account-free functionality. `language` and `signup`
remain `unknown` under the existing schema, with precise observed conditions in
bilingual notes. Operator countries describe location, not access eligibility or
worldwide availability. Sources were reviewed publicly without registration,
application submission, purchase or external upload; this is not end-to-end
external-service testing. Sources and conditions may change.

The six new tags are Chinese dictionary, Pronunciation, Language learning,
Travel advisories, Destination guides and Consular guidance; none existed in the
previous 204-tag set. Aliases include simplified/traditional dictionary names,
中文词典, Concised Mandarin Chinese Dictionary, 中国领事, 领事服务,
领事保护 and China Consular Services.

## Implementation and verification

Only catalog/localization data, tests and documentation change. Manifest 1.1.108,
UI logic, permissions and the runtime allowlist are unchanged. No runtime fetch,
remote images, account actions or automatic navigation are added. Evidence links
continue through the existing explicit source-link action.

Tests pin the old-record hash, 141 unique HTTPS IDs/URLs, 210 bilingual tags,
18 categories, official destinations/operator locations, account/license/fee
conditions, bilingual aliases and localized tag matching with all exact selectors.
AND semantics and full-width/spacing normalization are covered. Existing catalog
and UI counts are updated without weakening historical preserved-record checks.
Native browser verification and publication are separate from this preparation.

### Development verification

The frozen implementation passed 2,686/2,686 Node tests with strict unhandled
rejections, a 1 GiB heap and serial test execution, plus 81/81 Python tests and
126/126 focused tests. Syntax, locale JSON and diff checks passed. The offline
runtime package contains 112 allowlisted files. Native browser validation is
pending for this development commit; the counts above do not claim live service
availability or browser coverage. Manifest remains 1.1.108 and this ordinary
feature commit does not publish a new release.
