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

### Later bounded native supplements (2026-10-25)

The matrix above records the earlier observation window. These later cases used
that same frozen f15c22d product runtime and rich2 bridge, not the newly packaged
runner. They add real Chromium control/event/dialog evidence with the same
sessionStorage-backed synthetic RAM storage boundary:

- **14:41–14:46 UTC — first generation-fence rejection, then normal Save:**
  rejected the first precommit write; boot1, zero applied writes and complete raw
  storage identical to baseline. A subsequent ordinary Quote edit/Save succeeded
  with one applied write and only the target bundle's quote changed. The failure
  phase is zero-write; the full recovery flow is not. This is known-no-apply
  synthetic rejection, not persistent-storage failure or uncertain/partial apply.
- **14:41–14:46 UTC — explicit Reload cancel/accept:** after retained-draft Reset,
  cancel kept the draft and boot1; accepting the later prompt genuinely reloaded
  to boot2/default Quote. Raw storage was identical before/cancel/accept and writes
  stayed 2 throughout. Hidden/pagehide events occurred only after acceptance.
- **16:20–16:22 UTC — ordinary Quote A→B→A during held Reset:** 54 owned controls'
  id/value/checked/badInput fields and 5 categories' id/name/icon fields were
  identical in the before/after DOM captures. Two real input events showed B then
  A in the same focus, with no intermediate change/blur. A normal Quote blur
  occurred on Release, with no change event. The page retained A and its reload
  notice, boot1/writes2, no hidden/pagehide event; old Save added zero writes and
  changed no raw storage. This tests capture-input revision, not merely a changed
  final raw value. Personal records, nonempty global libraries/preferences and
  other-workspace registry/bundle values remained exact-equal.

Local evidence SHA-256 references (files remain outside this repository):

| Local evidence | SHA-256 |
|---|---|
| next-independent-case/VERIFICATION.json | 61e26d41ed29a210adaabeceef15760c965e0cc03d96d8e0c52b971cbf57914b |
| next-independent-case/RELOAD-VERIFICATION.json | 9f370d68699d4265b4e5abbccd15a2edc64915bd964f1ca4e2a0a94a38b6fa5b |
| next-independent-case/SHA256.json (18-entry original freeze) | 4c05218a0042fbbfa8d83eeff702456b009fd8e78d99ceca7679bc2ecdaa0e10 |
| capture-revision-aba/VERIFICATION.json | 5fc3a578f6504ae64e86f5122c284110a0e48f92728ce1ccc5b50b52db9d372f |
| capture-revision-aba/held-dom.json and edited-dom.json (equal bytes) | 65a1dcc8e4901c054c83239e1bc5ccdb1da6c28806258448c57447f786cdc097 |
| capture-revision-aba/SHA256.json (15-entry supplement freeze) | d3be583b1c5d7ac2a5451d6e1580341acd3344d86f10fca5d5b76b3b32022483 |

The original frozen PLAN's NOT RUN heading is historical; a separate local
STATUS pointer links its completed results without modifying the original
18-entry freeze. Screenshots, raw audits, DOM captures and generated fixtures
are not included in this documentation change. Numeric two-different-invalid-raw
input with equal value/badInput remains untested. None of these supplements
passes the pending import/file/provider cases, import's 1500ms delay, installed
extension persistence, install/upgrade, real providers or CWS. No version,
manifest, release or approval status changes follow from this supplement.

## Isolation from default checks and release runtime

The exact source `.github/workflows/release.yml` runs
`node --test --test-concurrency=1 tests/*.test.js` and Python discovery under
`tests` with `*_test.py`. This opt-in directory matches neither. No test/workflow
configuration is changed. `tools/package_extension.py` has an explicit runtime
list, so these QA tools are not extension release assets. Invoke self-checks
explicitly. No browser is auto-opened by build, tests or import of seed.cjs.
