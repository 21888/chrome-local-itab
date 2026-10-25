# Synthetic native Settings timing harness

Opt-in developer QA only. These tools construct a **new local fixture** from this
checkout's runtime. They do not install an extension, access a user profile, run
CI, publish a release, or prove native Chrome storage/upgrade behavior.

## Build and run

Needs Python 3 and Node with structuredClone (the repository uses Node tests).
From the repository root, choose a **new directory outside the checkout**:

```sh
python3 qa/native-settings/build.py --output /tmp/itab-native-settings-run
node qa/native-settings/verify_bridge.cjs
python3 qa/native-settings/serve.py /tmp/itab-native-settings-run --port 8768
```

Open `http://127.0.0.1:8768/options-rich2.html` in the authorized cloud test
browser. The server must run in that browser's network namespace. If an executor
command's loopback is isolated, start the same normal server in the cloud native
Terminal; do not change browser security, network policy, or sandbox flags.
Stop with Ctrl+C when no longer needed. The server binds only 127.0.0.1; it does
not implement POST/upload and refuses directory listings and escaping symlinks.

`build.py` copies the explicit runtime list in `tools/package_extension.py`,
without changing the checkout or copied runtime. A separate `options-rich2.html`
adds fixture scripts. It refuses existing output and output inside the checkout.
The generator uses the actual storage/helper modules to construct and validate
synthetic records; it does not use a captured personal dataset. Output includes
source hashes, seed validation, a synthetic import file, and an empty evidence
folder. Keep all generated artifacts OUT of commits.

## Instrumentation contract

- Original product scripts and real Options controls, browser events,
  confirmation dialogs and reloads run unchanged.
- `bridge.js` supplies sessionStorage-backed **synthetic RAM** Chrome APIs;
  this is not installed-extension `chrome.storage` persistence. Global Prompts
  and Collections each have one schema-valid synthetic record; target and other
  workspace personal content have independent sentinels.
- Independent synthetic sync reads return empty data. Sync writes, permission
  requests and external fetch calls are rejected. No provider credentials.
- This preserved bridge fixes synthetic getManifest to 1.1.160 and identifies
  the replacement write by the seeded quote changing. It is specific to this
  reviewed source/seed; re-review these assumptions for future runtime or seeds.
- Write gates act **before apply**, not after apply/before acknowledgement.
  The separate already-applied generation-fence write is counted. Rejecting a
  replacement does not mean the entire raw store stayed unchanged.
- File.text and local-provider hooks execute the original method first, then
  delay delivery. Reject buttons inject a synthetic delivery rejection; they
  are not evidence of an OS or remote-provider failure.
- Multiple pending gates are independent; ambiguous general Release refuses.
  Use the named release/reject button. Keep the same page visible: switching
  browser tabs can retire preparation and invalidate the intended experiment.
- Fresh removes only the fixture's own session key and suppresses late unload
  persistence. Verify boot=1 and a fresh initial event before each independent
  case. No record is read from the actual extension profile.
- Download synthetic audit is a local download. Copy only generated audit JSON
  to the output's evidence directory, then run:

```sh
python3 qa/native-settings/verify_audits.py /tmp/itab-native-settings-run
```

The verifier checks current-registry target bundle personal values, global
library values, and other-workspace entry/bundle equality. It fails on no input
or mismatches. It does **not** decide that a native journey ran or passed; read
visibility, event ordering, real DOM values and case purpose independently.

## Actual 2026-10-25 acceptance versus reproducible packaging

Observed product source: commit
`f15c22d3ea92724549be5730a2efb6d83c273fd2`, tree
`f643861e906a9bc6b4afb706b9025086fe112406`; 138 runtime blobs verified.
The prior environment's kit was absent; this was rebuilt, not recovered under
its old hash. No version/manifest/release was changed.

Rich2 browser-used bytes reproduced unchanged here:

| Item | SHA-256 |
|---|---|
| bridge.js → qa-bridge-rich2.js | a891a1a12603e396eafb0ca97e4a4c4b2914210712805176b31a29ee41039a93 |
| hooks.js → qa-hooks.js | f984ab3f0f9348800f997e3b2364f6f059581c56c6b1e8f359fb9a08bb407f42 |
| generated qa-rich2-data.js | 37dc756688c23d92cf3f6da8f5d548c9926383a8ef5194a42f591e011b51bc56 |
| generated rich2 baseline JSON | 4e7d5738145a4268d1858afa1170e9377e5641d670c3a67f4031e78a8187a625 |
| generated options-rich2.html | 5e6960f79c4857403548ac0e1f63da53965e4eb4e87ec6a9fef6b8c7abace352 |

The packaging generator, loopback server and verifier path arguments are NEW
adaptations, not the browser-used runner. Generated qa-data.js now contains only
the English catalog; the unused old fallback seed was omitted. That difference
was build/syntax checked, **not** rerun as native acceptance. Future builds on a
changed checkout must record their own hashes and repeat relevant native cases.

### Matrix of actual evidence

| Journey | Actual result and scope |
|---|---|
| Held Reset, new clock + Score=123, release, old Save | Passed real UI timing; draft kept, no reload, 2 writes total, old Save adds zero. Earlier seed global AI containers were empty. |
| Explicit second Reset after retained draft | Passed; 2 additional writes, genuine reload boot1→2. |
| Rich2 held Reset, new Quote Text | Passed; nonempty global and all personal/other workspace sentinels equal, no hidden event, old Save adds zero. |
| Rich2 unchanged Reset | Passed; 2 writes, immediate genuine reload boot1→2, sentinels equal. |
| Rich2 synthetic replacement rejection | Passed within precommit-shim scope; only generation-fence write applied, saved quote unchanged, new draft retained, old Save adds zero. |
| Rich2 raw invalid number draft | Passed: native key `e` produced value='' and validity.badInput=true, retained after Reset/release/old Save; no assignment or simulated event. |
| Import postcommit 1500ms edit window | NOT RUN. Reset reloads immediately; an attempted Reset substitute reloaded after 25ms, recorded as inapplicable exploration, not a product failure. |
| Late File.text/provider-read success/rejection after Reset; cancelled Reset; fresh picker; confirmed uncertain ownership/retry | NOT RUN: file-selection approval pending. |
| Installed extension/native persistent chrome.storage/install or upgrade/real providers/CWS | NOT RUN. These remain separate release gates. |

First bridge's sync.get rejection interrupted initialization before binding
handlers. First Fresh implementation let pagehide repersist old state. These
were **fixture-only** failures, not product fixes. Corrected accepted cases used
boot1 isolation and preserved failed exploratory records locally. Screenshots,
raw audit/download JSON and logs are intentionally excluded from this package.

### Approval boundary

A requested chooser.setFiles of a purely synthetic JSON to the local Options
page triggered the platform upload approval. No user approval arrived; the
waiting tool call was interrupted. Later read-only state showed writes0 and no
file-change/held-delivery event; request-service cancellation was not proven.
Do not retry, use a native picker, inject a File, change the origin, or otherwise
bypass that pending approval. Continue unrelated Reset tests. A newly generated
fixture does not grant approval to complete the blocked import action.

## Isolation from default checks and release runtime

The exact source `.github/workflows/release.yml` runs
`node --test --test-concurrency=1 tests/*.test.js` and Python discovery under
`tests` with `*_test.py`. This opt-in directory matches neither. No test/workflow
configuration is changed. `tools/package_extension.py` has an explicit runtime
list, so these QA tools are not extension release assets. Invoke self-checks
explicitly. No browser is auto-opened by build, tests or import of seed.cjs.
