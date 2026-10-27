# Public package identity evidence — 2026-10-27

## Scope and acquisition

Read-only public downloads and bounded static archive parsing on the dot cloud computer. No extension installation, execution, browser/profile access, login, credentials, developer dashboard, account data, file import, publishing or policy change. Downloaded ZIP/CRX members were read in memory; no member was extracted or executed. Binary evidence remains local.

The official [store listing](https://chromewebstore.google.com/detail/local-itab/hgcpfeedmndipealdcejckphlaicgjma) read on this pass shows version 1.1.151, updated October 15, 2026. Its reader response was crawled six days earlier; initial search snippets were older (1.1.5), so those snippets were not used as current-version evidence. More decisively, the actual public update response delivered a manifest-1.1.151 CRX.

[Chrome's distribution documentation](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions) identifies `https://clients2.google.com/service/update2/crx` as the Web Store update URL. A bounded unauthenticated request for the known item ID, with response=redirect, prodversion=140.0.0.0, acceptformat=crx3 and installed version 0.0.0.0, returned HTTP 200 after an official Googleusercontent redirect. Exact request/response metadata is retained locally. This tests that response, not every rollout/client configuration or dashboard submission status.

## Current store package and cryptographic identity

- File: `public-current.crx`, **841,737 bytes**.
- SHA-256: `da7cdf013f7886b56561b55c98d1c64f1b98c2f24ab740804e1cc5a520241000`.
- Format CRX3; signed header ID: `hgcpfeedmndipealdcejckphlaicgjma`.
- Manifest version: **1.1.151**, Manifest V3, official update URL; no manifest `key` field.
- Developer proof public-key SHA-256: `762f5443cd38f40b32492af7b08269c06250877e9f3f3de0d4b182d4c15852ef`. Its first 128 bits map to the same extension ID.
- All three embedded asymmetric proofs verify cryptographically over the exact signed header and ZIP bytes: two RSA PKCS#1 v1.5/SHA-256 and one ECDSA/SHA-256. The static inspector and detailed results remain local; no raw signature or package bytes are included in this document.

The framing/signature message follows the [Chromium CRX3 schema](https://chromium.googlesource.com/chromium/src/+/main/components/crx_file/crx3.proto). This is **not** a claim that Chrome's complete verifier, Google publisher-key pinning, revocation or signed-content policy was independently implemented. Embedded-key mathematical verification alone is not a full trusted-publisher chain. Official HTTPS acquisition, signed ID consistency, and byte comparisons are separate evidence. A browser-facing manifest without `key` does not make the CRX identity unknown: its signed header/proof supplies that identity.

## Current 151 Release/source correspondence

[GitHub Release v1.1.151](https://github.com/21888/chrome-local-itab/releases/tag/v1.1.151), published 2026-10-15 12:59:08 UTC, declares source `df1b571cd8fec142a091c3c0093610d7deebaabc`.

Actual release assets downloaded:

| Asset | SHA-256 |
|---|---|
| local-itab-1.1.151.zip | `247b04df47219e4409ffb28b31655014676253ff0cd6e7816515676e38751de7` |
| PROVENANCE.json | `9e9da5dca26ddeaaa4aae4dd5cbb53a886d0187490f207f150d6b813f6f64401` |
| SHA256SUMS.txt | `b9a2fb551ff3b5a01069827a628a52d088b39d2f7246ac5ef4635f5b6b15a611` |

Both downloaded ZIP and provenance match their checksum-file entries. All **133/133** runtime file SHA-256 values match provenance, and their Git blob IDs match the public Git tree response for that declared source commit. RELEASE-NOTES.md was not downloaded or checksum-verified; no all-four-assets claim is made.

The actual store archive has 134 files (135 ZIP members including a directory). Comparison with the actual Release ZIP yields:
- **132 shared files byte-for-byte identical**.
- Only shared-file difference: `manifest.json`; parsed structures differ solely by store-added `update_url`.
- Only store-only file: `_metadata/verified_contents.json`.
- No Release-only file.

This establishes the observed store package's runtime correspondence, not merely a Git tag/version-name association. CRX and ZIP whole-file hashes naturally differ; they are not claimed to be identical archives. Per-file comparison results, provenance checks and public source-tree/release metadata are retained locally.

## Historical 71: stronger Release evidence, missing store/device evidence

[GitHub Release v1.1.71](https://github.com/21888/chrome-local-itab/releases/tag/v1.1.71) declares source `acbe9084e5831c9408c90f41bc69efbb5c530150`, the same local historical tag already used by the earlier bounded incident review.

- Actual ZIP SHA-256: `e9a906a025acded57bd4a3d5f22839af24be6408a4269ba21e2d04dbcd7b1485` (2,293,321 bytes).
- Provenance SHA-256: `32c9a7f23e6b7f249f9953260e818c67caade0e7397bb74a2289ccb9f692f6b8`.
- Checksum-file SHA-256: `f64c63fd6d86ea4e6b9d9c6be1f6ae3ad51033b25c9770b89ad295b13799ec01`.
- Downloaded ZIP/provenance match checksum entries; **108/108** runtime files match provenance and local historical Git-tree blob IDs.
- Manifest version 1.1.71, no `key` or `update_url` in this **GitHub ZIP**.

No historical **store-signed 1.1.71 CRX** was located locally or obtained in this bounded pass. The observed public update interface supplies the current package, not an authenticated history of what any affected device installed. No guessed archive URLs or third-party CRX mirrors were used. Therefore GitHub71 runtime matching does not prove historical store71 equivalence, the user's actual previous version, extension ID/profile/folder continuity, or whether personal storage still exists. The earlier synthetic unpacked-profile identity was not evidence of the user's installed identity and must not be substituted for the store identity.

## Retrieval limitations and preserved distinctions

Initial unauthenticated GitHub Release API reads for 151 and 71 returned 403; the first handler retained only the exception string, so their exact cause is unknown. A single bounded diagnostic request to the **same URL**, without route/host/credential changes, returned 200 with 53/60 rate-limit requests remaining. That does not retrospectively prove why the initial response failed. Later same-public-endpoint and listed-asset reads succeeded. The successful diagnostic headers and intentionally truncated response body are retained locally. No credentials or alternative authenticated path were used to overcome a denial.

An attempted public-reader lookup of Chromium's full verifier source was unavailable, so no Google pinned-key trust claim is made. The CRX schema was readable. Historical release-note bytes and historical store71 signed bytes remain unverified.

The current151 artifact/source chain is now substantially established; it does **not** identify or rule out the earlier data-loss cause, establish recovery, authorize an install/import test, or lift Release/CWS gates. No old Sync experiment was rerun and no production fix was fabricated.

## Documentation validation

This is a text-only evidence record. `git diff --check` passed. No runtime or test source changed; no new full-suite/native-install result is claimed. The acquisition and static comparisons above were completed before this documentation commit and were not repeated to manufacture a fresh result.
