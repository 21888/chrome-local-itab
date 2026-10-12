# 1.1.97 batch verification

This batch combines AI-copy commitc5bc380dab3735b65d5dde50a287b347bdc52f37
and purpose-discovery commit82730386c67241801ec8e9960036d8023196b798. Both
ordinary commits retained96 without publication. Second exact-source CI passed
2517 Node/64 Python tests. Release changes only version96→97 and docs;
official v1.1.96 baseline isa25956dad57d9b31822ff41a840574c6aa7c71c1.

Feature scopes are in ai-answer-copy-validation.md and
navigation-tag-discovery-validation.md. Actual answer/taskJSON clipboard writes,
clipboard errors and async races remain synthetic-only; native AI smoke had no
answer and made no clipboard writes. Navigation had representative desktop
mouse/keyboard/filter checks, not dark/320 or a full focus matrix.

## Final identity smoke — 2026-10-12

Exact112-file ZIP SHA-256:
`2c80167677d21361cb8aa56f6801183740c0a88c8edeaaf1fda4e77a112baf58`.
Preparation compared all entries with development ZIP
`b7783f3b32e808f499354687611d988720a76ed61eb9ef273852a26a228aa6c3`
and found only manifest.json differs. Native QA verified final hash,112 entries
and version before staging. This docs-only update preserves those bytes.

Existing independent CfT155 Chinese synthetic profile, foreground confirmed,
used normal Reload. Settled card showed1.1.97 and a fresh tab loaded normally
with Default14, prior category counts, selected qa remaining2, Clarity light/Grid.
This was minimal identity smoke, not another feature regression or clipboard test.

No edits/saves, provider activity, credentials, permissions, DevTools, injection,
external links or uploaded screenshots. AI/prompt/note fixtures were untouched
and not re-audited here. Candidate identity does not certify live publication;
exact-source released CI and asset verification remain separate steps.

## Unpublished-release recovery

The first version97 commit7adf5d434f5fb678581081290bc32c26f6861105 failed
exact-source CI: one copy UI test incorrectly pinned manifest.version to96.
It passed2516/2517 Node tests; Python/publication did not run. No97 tag or
release was created by that failed run.

A separate test-only correction replaced the version pin with the complete
explicit permission baseline while retaining clipboard permission/read guards.
The manifest97 tree then passed2517 Node/64 Python. A separate tooling change
added narrowly explicit recovery opt-in; its exact-source CI passed2517 Node/81
Python tests with publication skipped, leaving workflow,
permissions, protections, production files and version unchanged. Ordinary
same-version commits still build as non-releases.

Recovery requires one exact final commit trailer, the unchanged parent version,
the latest ancestor release patch+1, matching checkout/CI/remote master, and the
latest completed baseline release with all four uploaded nonempty assets. Any
existing target tag or release (including drafts), uncertain API state, drift or
partial previous publication fails closed rather than overwriting. Guards run
before creation and before making the draft public. The explicit recovery commit
still runs full exact-source CI and immutable asset checks.

The runtime ZIP remains the exact previously smoke-tested version97 hash above.
No additional native feature coverage or real clipboard/provider result is claimed.
This recovery retains the original two-feature batch without a version98 bump.
