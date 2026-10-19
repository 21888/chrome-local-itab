# Download retained complete copies after structural Settings failures

## Reproduced gap

A completed complete restore can leave a valid root-level pre-restore recovery copy. If a Default or Trash bundle later goes missing, or the registry has an unsupported schema version, the real Settings startup rejects even when opening an intact Work workspace. Previously the complete-backup view was never mounted, while the separate investigation page did not read this complete recovery key. The copy remained present and independently exportable through `Store.recovery()` but had no reachable download control on those pages.

The synthetic reproduction retained the exact 14,044-byte complete copy with two live workspaces and one in Trash. Reconstructed real managers and Settings startup performed no writes or provider operations. The initial three production-path tests failed because the limited download view did not exist.

## Narrow behavior

Only `WORKSPACE_BUNDLE_MISSING` and `WORKSPACE_VERSION` now select a download-only limited view. Unknown errors, I/O failures, permission failures and other structural error codes are not added to this allowlist. Existing interrupted-restore handling remains separate.

Ordinary settings, their sibling Save/Reset footer and workspace controls stay hidden, inert and disabled. The limited view offers only the existing retained-copy download. Its `downloadOnly` mode implies `recoveryOnly`; ordinary import/export/apply and transaction inspection/recovery are refused in event handlers as well as hidden/disabled. Repeated entry does not replace an existing view or unlock it. The view includes privacy and explicit limited-capability notices in English and Chinese.

A click uses the unchanged `Store.recovery()` validation: bounded envelope and source size, checksum, supported schema and complete required modules. Invalid, incomplete or unavailable copies do not produce a download request. Missing V2 retains the existing V1 fallback behavior. No automatic root-copy read or download is introduced at startup. A requested download is not proof that the browser saved a file.

Storage readers/writers, restore protocols, backup formats and their validation rules are unchanged. This is an access improvement for retained copies, not diagnosis or repair of the reported 1.1.71 upgrade data-loss incident. Version and Release/store gates remain unchanged.

## Validation

- Final targeted startup/Store/view tests: 18/18 passed. The same final tests against prior `dec31aa` produced 11 passes and 7 failures. Combined view, prompt and skip-link validation: 75/75 passed.
- Three startup cases perform 6/10/2 reads; explicit retained-copy download adds one V2 read to each. No write/remove/provider/inspection/recovery/reload calls occur. Repeated pending entry retains download-only mode. Invalid checksum, unsupported format, partial backup, extra envelope fields and absent copies never request a download; absence preserves the existing V2-to-V1 fallback read. Late validated results after cancel/destroy do not download, replace feedback or steal focus.
- Native dot Linux cloud Chromium preview: all 138 frozen runtime files matched source. English/Work with a missing Trash bundle shows the limited notice, privacy text and one download button without the ordinary form/footer or transaction controls. Chinese/Work with the same fault and a wrong-checksum copy reports no valid retained copy after clicking, without success feedback. No actual download or restore was performed; no screenshot was uploaded.

The preview uses only generated synthetic data and is not installed-extension upgrade certification. Complete serial Node suite: 16,749 passed, no failures/cancellations/skips, exit 0 (512 MiB heap limit, 361.4 seconds). Python: 84 passed. Runtime package: 138 files; SHA-256 `69e4dd5ed1dfc7f323cff168962979172989e415463bdeb4658e4de9c1419547`. Static packaging checks passed; the packaging tool does not perform browser testing.
