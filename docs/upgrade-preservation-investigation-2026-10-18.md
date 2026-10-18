# Upgrade preservation investigation — 2026-10-18

This is a bounded source-path investigation, not a native Chrome Web Store
upgrade certification. It does not establish the cause of an affected user's
incident or what remains in that user's profile. No user profile, credentials,
provider account or browser extension installation was used.

## Exact source and current store package

The candidate runtime examined is master
`0565b43e5030342159cdccc1624609ca1a7e36aa`, tree
`97c9159b843327468217ada019e07e610ca4a816`. Its manifest remains 1.1.155.
The frozen v1.1.155 GitHub Release is a different, older source commit,
`dac0732b60926c2b2391a6a1ba2a927c38600ee1`; the two must not be conflated.

The public Chrome Web Store update endpoint returned version 1.1.151 on
2026-10-18 at 15:52 UTC for item `hgcpfeedmndipealdcejckphlaicgjma`.
The downloaded CRX is 841737 bytes, SHA-256
`da7cdf013f7886b56561b55c98d1c64f1b98c2f24ab740804e1cc5a520241000`.
Offline CRX3 verification passed all three signatures, including the developer
key deriving that exact extension ID and the publisher key matching Chromium's
pinned publisher hash. Changing one archive byte or signed-header byte invalidated
each proof. This was package inspection, not installation.

The store package's 132 non-manifest runtime files are byte-identical to the
GitHub v1.1.151 package and tag `df1b571cd8fec142a091c3c0093610d7deebaabc`.
The only manifest semantic difference is Google's added `update_url`; the only
extra file is `_metadata/verified_contents.json`. That file is covered by the CRX
signature, but its internal signatures and block hashes were not separately
verified. Current-store versus candidate manifests differ only in version and
that store-added URL; permissions, OAuth configuration and CSP are unchanged.
This public download does not establish pending-review or submission status.

The historical 1.1.6 source used below is candidate
`90b91e6456bfaea9a4519ae1ba9c5c5ed6e6b760`, not an authenticated original store
binary. Version 71 uses the exact GitHub Release package at
`acbe9084e5831c9408c90f41bc69efbb5c530150`; all 108 files were checked against the
tag. The original signed store 6/71 packages and affected-device raw data remain
unavailable to this investigation.

## Admission and first-render writes are different boundaries

Workspace admission and `StorageManager.getAll` do not allocate layout identities
or missing positions for these inputs. The complete migration snapshot is
verified before activation and the original top-level fields remain present.
This does **not** mean the complete new-tab first render is read-only.

For a saved free layout, ordinary `ShortcutsComponent.render` calls
`applyLayoutMode` with `persistMissing` enabled. Records with exact duplicate saved URL strings
and without IDs can therefore cause `Layout.Controller` to call `StorageManager.applyLayoutPatch`
and allocate identities. A missing position in the current view can cause a
separate debounced layout write. This is existing behavior, not a newly added
migration step or a change made by this investigation.

Eight bounded first-render cases were executed: four with canonical saved URLs
and the same four with `example.com` and `https://example.com`, two supported
historical spellings sharing a destination. Each set covered identity allocation,
a missing current-view coordinate, a fully positioned zero-write control and a
backing write rejected before assignment. All passed. The real production
migration, read, render, layout controller, store and recovery getter ran.
Original URL strings, link fields, existing coordinates, personal stores and
retained recovery copies remained exact. The identity recovery's checksum was
independently recomputed. A failed write left the complete raw state unchanged.

These tests use a fixed-size DOM model, synthetic Web Locks and a modeled storage
API. The expected new coordinate is a model result, not a browser pixel
measurement. They do not establish concurrent-writer behavior, Chrome disk
persistence, a commit-then-error outcome or native rendering.

## Unmodified raw state across actual source versions

Three lanes each ran four distinct Node processes:

1. Candidate 6 saved shortcuts and all four personal modules using its own APIs.
2. Exact 71 migrated that raw state, rendered shortcuts and performed guarded
   shortcut/layout/task/note/countdown edits.
3. Current master loaded those results, rendered and attempted one real layout
   transaction whose backing storage write failed before assignment.
4. A fresh current-master process reopened the exact failed-write output.

The lanes cover an unavailable Sync API, an available Sync API with an empty
remote store and local opt-out, and an actual candidate 6-produced acknowledged
cloud snapshot followed by newer local edits. No acknowledgment or successful
transaction result was injected. Twelve stages and 462 recorded assertions
passed; independent review checked all nine file handoffs byte-for-byte and
confirmed distinct process IDs.

In the available-empty-cloud lane, candidate 6 and 71 each read the cloud once;
the two current stages read it zero times and all stages made zero cloud writes
or removals. Version 71 made two first-render layout writes; current master made
none because the received identities and positions were already prepared.
After the current write failure and fresh process reopening, each lane's whole
local+sync file was byte-identical to the 71 output. All prior migration and
identity recovery data, personal content and later edits remained present.

The first run exposed an evidence-probe assertion error: an unknown top-level
sentinel was incorrectly required to enter the workspace's scoped bundle.
Independent comparison confirmed the sentinel remained exact at the top level
and in the complete pre-migration copy, while the production scope allowlist
correctly excluded it from the bundle. Original failing evidence was retained;
the probe's scope assertion was corrected and full-raw protections strengthened.
No production code or existing test was changed to accommodate it.

The file-backed API fsyncs a temporary file and renames it before returning.
This proves observed handoff across clean process exits, not Chromium's storage
implementation, power-loss durability or crash recovery; the parent directory
was not fsynced. In the acknowledged-cloud lane, the process deliberately closes
after all dispatched work settles and before a future 900 ms upload debounce fires.
It makes no assertion about that later upload.

### Separately observed scheduled upload

A subsequent five-process probe waited for the original, unaccelerated 900 ms
upload callback after first render. Exact 71 and current master received the same
candidate 6-produced acknowledged cloud snapshot and newer local edits. Version
71 really uploaded its newer configuration once. Current master instead refused
the upload because the acknowledged cloud configuration differed from the newer
local copy, with `SYNC_IDENTITY_COMPATIBILITY`, kind `review`:
only the local guard's blocked state changed, with zero cloud writes or removals.
The complete configuration, four personal modules and retained recovery remained
unchanged during that callback. A local-opt-out control with a foreign cloud copy
performed its normal migration and first-render layout writes, but scheduled no
upload timer, read no cloud data and made no push call.

Two fresh current processes then read the actual outputs. All local and cloud raw
values remained equal. Reading the 71 output performed one real acknowledgement
write that only reordered the `revision` and `fingerprint` object properties; it
did not change either value. The current-review output remained byte-identical.
Five stages and 381 assertions passed. Native Node timer resources and completion
of their actual async callbacks were observed; the timer functions and delays were
not replaced. All dispatched operations and locks settled. These remain Node
timers and modeled browser boundaries, not Chrome scheduling or disk guarantees.

The initial probe had two overstrict assertions: an async resource ancestor was
assumed to survive queued-lock dispatch, and JSON object-property order was
assumed to remain unchanged after acknowledgement. Original failures were kept.
The revised probe instead verified the same original review Error through the
actual timer-origin push and blocking calls, strict call ordering, complete raw
equality and the exact acknowledgement-only serialization difference. Production
code and existing tests were not changed.

## Historical overwrite condition and recovery limits

Eight further source-version/consent probes confirmed the known historical
condition: version 71 can accept an unknown enabled cloud configuration and replace
local configuration, even when the local Sync preference is false. Source review
finds the same condition in candidate 6. Current 151, frozen 155 and candidate master block
that replacement: local opt-out skips cloud initialization, while an unknown
different cloud copy requires review. Complete producer-shaped metadata and
payload hashes were independently verified. This condition remains a possible
explanation, not proof of the reported users' actual cloud state or incident.

A further five-process probe used an independent candidate 6 instance's real
`setAll` and `setSyncEnabled`/`pushToSync` calls to create an enabled empty-shortcut
configuration, rather than constructing metadata. Its exact sync channel was delivered
alongside the unchanged local channel from the previous old-version run. All five
stages and 51 recorded assertions passed. Version 71 reproduced replacement and
changed local Sync from false to true. Current master receiving that result
acknowledged the known revision without silently restoring an older copy. Direct
candidate 6-to-master upgrade with Sync off made zero cloud reads and zero
initialization writes **after migration**. With Sync on, it entered the real review
guard and only wrote guard bookkeeping; configuration, personal modules and the
original recovery remained unchanged. Migration's snapshot/staging/activation
writes are separately observed and are not included in the zero-initialization-write
statement. This is simulated transport of an actual producer's output, not a live
Chrome Sync or affected-user reproduction.

Separately, the current read-only Inspector consumed the 71 raw output from the
eight source-version/consent probes above, including their post-migration quote
edit. The earlier links, layout, categories and quote remained readable in a
configuration inspection export, with zero writes. The newer quote overwritten
by 71 and absent from every retained copy could not be recovered from that captured
raw state. The inspection export is a projection, not a complete backup or verified
importable file.
The pre-migration source has unverified content integrity. Its import review is
refused because it has no importable recovery descriptor; this was not a
corrupted-checksum test.

## Historical workspace error classification

Exact 71's workspace View displays its deleted-or-replaced warning for every
non-legacy-conflict rejection of `session.ready()`, before trying a fallback
registry refresh. If no registry has rendered, its button can still say that the
workspace is loading while the status says it could not load. This combination
does not establish deletion: it can appear briefly before that refresh completes,
or persist when the fallback also fails. The runtime stylesheet already explicitly
hides hidden banners, so this source path does not require a CSS visibility bug.

A separate six-process composition ran the real Manager, Session, workspace-bound
StorageManager validator and View with the same actual candidate 6-produced raw
input. For each of 71 and current master, it covered persistent backing reads
rejecting, the first migration snapshot submission rejecting before assignment,
and healthy admission followed by real create/trash/restore-generation controls.
All six stages and 204 assertions passed. In all four fault cases, every raw value
and its complete serialization remained exact: there were zero assigned writes,
removals, clears or cloud calls. The actual `StorageManager.getAll()` rejected with
`WORKSPACE_READ` or `WORKSPACE_WRITE`, rather than returning empty defaults.

Version 71's fault cases produced the loading, load-error and retirement messages
together. Current master already separates those faults into an unavailable label
and a load-error panel with the sanitized code. Its real deletion and replacement
controls still retire the original captured session; restoring a new generation
does not reactivate that old session. The healthy controls deliberately perform
real migration and workspace-management writes and are not zero-write cases.

These are injected backing failures and DOM text/visibility-flag checks, not a
browser rendering test or a diagnosis of any affected profile. Version 71 requests
`unlimitedStorage`; the write-failure case is not evidence of a user exhausting a
10 MB quota. The earlier legacy-URL research also distinguishes the trim-only
writer in **1.0.6** from the later candidate **1.1.6**, whose new shortcut writes
canonicalize URLs. Those version numbers must not be interchanged to infer an
affected user's stored input.

## Remaining release evidence

The existing preservation suite also passed 612 tests across 12 explicit files,
including migration interruptions, read/write failures, legacy URL identity,
Sync guards, recovery inspection and complete-workspace recovery. The candidate's
existing full CI passed 16545 Node tests, 84 Python tests and 138 runtime checks.

None of those results proves an actual store upgrade, diagnoses an affected
profile or verifies a user's recovered data. No new data-loss defect was found
in the current paths executed here. Historical artifact identity, actual affected
local/cloud state, native upgrade behavior and authenticated pending-review
status remain separate evidence gaps. This investigation alone is not a release
or store-submission approval.

## Primary references

- [Official store update endpoint documentation](https://developer.chrome.com/docs/extensions/how-to/distribute/install-extensions)
- [Chromium CRX3 format](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/crx_file/crx3.proto)
- [Chromium signature verifier and publisher key](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/crx_file/crx_verifier.cc)
- [Chromium extension ID derivation](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/crx_file/id_util.cc)
- [Exact candidate baseline CI](https://github.com/21888/chrome-local-itab/actions/runs/39139420391)

The CRX RSA verification follows the verifier implementation's PKCS#1 v1.5
algorithm, not the conflicting PSS wording in the proto comment.
