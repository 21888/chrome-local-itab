# Read-only saved-copy inspection

`recovery.html` is an independent diagnostic surface. It can open when normal
workspace startup, migration or strict configuration validation fails. Links in
the new-tab/settings workspace bar and startup/conflict warnings open a separate
page so that drafts stay open.

## Safety contract

- Uses only explicit-key `chrome.storage.local.get` calls. It never initializes
  the workspace manager, `Storage.getAll`, Sync, providers, migration or writers.
- Does not restore, import, normalize URLs, generate layout IDs, install defaults,
  delete records or overwrite either old or current content.
- Reads registry/activation metadata to locate supported workspace bundles,
  including entries in Trash. It also inspects the pre-migration snapshot, legacy
  configuration, and retained replacement/cloud-clear/identity recovery chains.
- Repeated reads reject observed changes. A displayed report is an immutable
  observation, not an atomic database snapshot or proof that data still exists.
- Missing, corrupt and unverified records are distinguished from an empty links
  array. Record times describe migration or backup construction, never a claimed
  last-edit time. Cloud-clear copies are explicitly labelled as cloud copies.
- Damaged attribution does not hide otherwise readable copies. A migration copy
  is attributed only when its ID matches validated registry/activation metadata.
- Inspection is bounded by aggregate copy-byte/node budgets, depth, chain, entry
  and workspace limits. Reads are one explicit key at a time, and the second
  pass retains hashes rather than another set of raw values. Chrome may still
  materialize a single stored key before this module validates its size.

## Preview and export

The first view shows source metadata and counts only. Preview and download need
an explicit click. Site previews use text nodes; links, icons and other remote
resources never load. The page's CSP blocks network connections and images.

Investigation JSON is a whitelist projection, **not a complete or directly
restorable backup**. Original order, URL spelling, missing optional fields,
duplicate rows, supported layout IDs, view names and coordinates are retained.
Malformed rows are represented explicitly instead of silently becoming an empty
list. Invalid or unsupported fields and recognized credential-bearing URLs are
omitted with fixed warnings. Provider state, authentication fields, Sync/privacy
settings and personal-module stores are excluded. Raw and portable saved
representations are inspected separately, with separate checksum status.

The custom `local-itab-readonly-recovery` envelope is rejected by ordinary backup
importers. Downloaded JSON can contain private titles, text and ordinary URL query
parameters. Users should review files before sharing them. Nothing is uploaded.
Final pretty-printed UTF-8 output must also fit the export size limit.

A missing copy does not prove deletion, and a verified checksum does not establish
restorability or completeness. This feature cannot reconstruct values no longer
present in supported retained records. Keep existing pages/drafts open; avoid
resetting storage or reinstalling during an investigation.

## Focused regressions

```sh
node --test tests/recovery-inspector.test.js tests/recovery-view.test.js \
  tests/workspaces-view.test.js tests/locale-defaults.test.js \
  tests/category-locale-defaults.test.js
python -m unittest discover -s tests -p package_extension_test.py
```

All fixtures are synthetic. Tests cover zero writes, raw/portable separation,
credential redaction including malformed URLs, old URL/layout identity fidelity,
unknown formats, corrupt/changed records, cumulative/scaled size limits, source
attribution, click-gated downloads, stale results, bilingual labels, safe DOM
rendering, and deterministic packaging of all four new runtime files.
