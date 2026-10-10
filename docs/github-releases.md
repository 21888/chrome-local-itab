# GitHub runtime releases

One coherent, patch-versioned commit per push to `master`. Update `manifest.json` from x.y.z to x.y.(z+1) and add `docs/releases/<version>.md` in that same commit, including documentation/workflow commits. No extra CI version-bump commit is created. A multi-commit push only releases its tip; push each intended release commit separately. Releases are not triggered by pull requests, tags, forks or schedules. Failed tests block publication rather than releasing a broken package.

The first workflow integration is version **1.1.8**. Its exact source SHA will be the integration commit, not the earlier 1.1.7 candidate. Existing unpublished or unrelated working-tree changes must not be included accidentally.

## Jobs and cost boundary

- Both jobs have a pre-run exact repository/public visibility guard. Only a standard `ubuntu-latest` hosted runner is used.
- Validation has `contents: read`, checks out the exact event SHA with credentials not persisted, runs the serial Node suite and Python tests, then builds the canonical runtime ZIP. Outputs contain only version, source SHA and ZIP SHA256.
- The publishing job has `contents: write`, checks out the same exact SHA without persisting credentials, rebuilds deterministically and checks the validated source/version/hash. Only the final publication step receives `GH_TOKEN` from GitHub's built-in job token. It never runs application code with that token; it runs the release script.
- There are no Actions artifact uploads, caches, separately saved secrets, personal account logins, paid large runners or external services. Release ZIP/checksum/provenance files are GitHub Release assets.
- Standard hosted runner use in public repositories is free under [GitHub's documented billing policy](https://docs.github.com/en/actions/concepts/billing-and-usage#about-billing-for-github-actions). Private repositories are excluded by the workflow guard, not silently switched to billed execution. Platform/organization policies can still prevent execution.

Checkout is pinned to the official [v7.0.1 source](https://github.com/actions/checkout/tree/3d3c42e5aac5ba805825da76410c181273ba90b1), verified through GitHub's tag API on 2026-10-10; its action metadata uses node24, supported on current standard hosted runners. Review upgrades rather than following a mutable major-version tag.

## Publication and retry

The script checks repository identity/visibility, verifies the version and source, creates the exact lightweight tag and then a draft release, uploads all four deterministic assets and downloads them to compare every byte. It checks the tag again before publishing and verifies the final public release and assets.

The four files are `local-itab-<version>.zip`, `PROVENANCE.json`, `RELEASE-NOTES.md` and `SHA256SUMS.txt`. The checksum file covers the other three; provenance records all allowlisted runtime-file hashes. The canonical ZIP is produced by the existing packager, not a broad repository glob. Tests, docs/screenshots, browser profiles, backups and credentials are excluded.

A successfully published same-source rerun is read-only after checking metadata and all asset bytes. A partially uploaded draft can resume by uploading only missing assets. An existing tag pointing to a different source, unexpected/mismatched asset, changed release notes, or incomplete already-published release fails closed. No tag retarget, asset replacement, deletion or `--clobber` is attempted. Fixing such a collision requires investigation; do not relabel changed code with an existing version.

No shared concurrency group cancels older pending runs. Distinct versions may finish out of order. Publication requests GitHub's documented `make_latest: legacy`, which selects according to release creation date and higher semantic version, rather than forcibly promoting whichever run finishes last. The release list may still show completion/creation order; use version tags to identify a precise build. See [GitHub release API](https://docs.github.com/en/rest/releases/releases#update-a-release).

A network/auth/rate-limit error fails the workflow; only an explicit HTTP 404 means absence. A same-source run may be retried after a transient failure. After publication, inspect the tag's source SHA and the release assets/checksums. A workflow test pass is not native browser acceptance or Chrome Web Store approval.

## Manual installation and store separation

Download the runtime ZIP, extract it to a folder you retain, open `chrome://extensions/`, enable Developer mode, choose Load unpacked and select the folder containing `manifest.json`. Back up personal data before upgrades. Retain the originally loaded folder when replacing runtime files, then reload the extension; changing the folder may change its extension identity. GitHub's automatic Source code archives contain the full repository and are different from the ready runtime ZIP. Neither is a one-click Chrome installer.

Core local features work offline. Searches, website visits and user-enabled online features require network access. Optional Drive backup in unpacked installations depends on working extension identity/OAuth configuration and authorization and is not proven by packaging.

Chrome Web Store submissions remain limited to at most one consolidated version per UTC+08 day, with new tested changes and no version under review. This GitHub workflow never signs in to or uploads to the Chrome Web Store and never changes that cadence.

## Local checks

Run `python3 -m unittest discover -s tests -p '*_test.py'`. Release tests use only local temporary repositories and a fake GitHub transport; they never publish real tags, assets or releases. Run the full Node suite before integration/publication. For an offline build from a clean checkout whose manifest is one patch greater than its parent:

```
python3 tools/github_release.py build --sha "$(git rev-parse HEAD)" --output /tmp/a-new-output-directory
```

Publish mode requires the Actions master-push repository/SHA context and an authorized job token; do not discover or borrow local credentials to invoke it elsewhere.


## Version-specific descriptions (from 1.1.11)

Every release requires a tracked `docs/releases/<manifest version>.md`. Write useful, accurate Chinese-first **新增 / 修复 / 注意事项** sections and a concise **English** summary. If a category has no changes, say so; do not invent a feature. Describe user-visible effects and important limits, rather than copying a technical commit title. The build refuses a missing/malformed record instead of silently substituting an installation introduction.

The renderer places that version's changes first, then source/integrity details, with installation guidance last. The same exact generated text is used in the web Release and its newly created downloadable RELEASE-NOTES.md. Records are part of the exact source SHA; they are not runtime ZIP inputs. Never edit an older record casually when preparing a newer version.

### Bounded historical body correction

The 1.1.11 publishing job has a one-time final step correcting only the web bodies of v1.1.8, v1.1.9 and v1.1.10. The script hardcodes those three release IDs and tag source SHAs; `tools/release_body_backfill.json` stores their original body and all four downloaded-asset hashes/sizes. No arbitrary release/version/payload is accepted. The existing contents:write job permission suffices; no new scope, schedule or credential is added.

Before any edit, all three tags, identities, accepted body states and original asset bytes are checked. Each web body must equal the recorded original or the exact desired correction. Immediately before editing, the body is read again to detect an intervening edit. Only a `body` field is PATCHed, and tag/asset bytes/asset identities/release identity are checked again afterward. GitHub's REST update is not a multi-release transaction; an interrupted operation can be partially complete, and rerunning the same 1.1.11 workflow safely skips already-correct bodies after rechecking their assets. Unexpected manual edits or changed assets fail closed.

Historical ZIPs, RELEASE-NOTES.md attachments, provenance, checksums, tags and source SHAs stay untouched. Historical web pages explicitly state that their downloadable notes remain original. The old 1.1.8–1.1.10 workflow source still expects the original web body; rerunning those old runs after this correction can intentionally fail its strict metadata equality check. Use the 1.1.11 bounded retry to finish this correction, not an old workflow or overwrite flag. No hash/source checks are relaxed to accommodate the correction.

Future versions do not run the historical backfill step; each simply publishes its own reviewed record. Before pushing, run Python tests and preview `notes(source_sha, version)` from tools/github_release.py for text accuracy.
