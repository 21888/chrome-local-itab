# Non-streaming run: missing saved-source reference

The ordinary **Run with your model** dialog retains a frozen URL, model and
prompt. Its result is saved with the original prompt ID and saved body-version
ID. This change prevents starting a request when the loaded prompt library
already proves that this exact save reference is unavailable.

## Boundary

- Review, Allow and Send check the original prompt ID and body-version ID in the
  controller's loaded state, using the same reference predicate as the existing
  collection-save validator: the prompt exists, is not deleted, and its history
  still contains that version ID.
- A title/body edit, selection of another preview version, or an unchanged refresh
  does not invalidate an otherwise valid historical reference or replace the
  frozen outgoing text. The check does not require the latest body, current
  selected record, preview identity or record revision to match.
- A pending or failed prompt-library read is an unknown state. It temporarily
  blocks unsent actions with a distinct notice, without treating the source as
  deleted or clearing a valid review. A send whose permission check finishes
  while the read is unresolved stops before transport; a later successful read
  never automatically sends it.
- Observed deletion retires the unsent review and clears its temporary key. It
  also releases a pending permission check. Deleting then restoring the source
  cannot revive that old send; the user must explicitly review again. An already
  initiated permission request cannot be retracted, but its late response does
  not restore the retired review or overwrite the missing-reference notice.
- Once transport has started, source deletion does not abort it or discard the
  answer. A separate notice explains that saving may fail. The existing main
  request/save feedback, Save control, save command, validator and receipt retry
  path remain unchanged. No source read, storage protocol, request payload,
  permission scope or automatic retry was added.
- Streaming and refinement keep their existing source/current-preview rules.

## Focused synthetic validation

The new cases use the real prompt store and controller subscriptions, with a
small DOM model and mocked permission/transport calls. The missing-history
fixture is a validated synthetic replacement state, not a new history-edit UI.
No provider, browser grant, external fetch, credentials, user device or paid
service was used. These checks do not certify native browser behavior.

On the original runtime at `188ab61b30a501508d4725d7fad9b8274a75d8d5`, the eight
negative deletion/history/permission-race regressions fail on behavior assertions.
With the fix, all 18 new cases pass. They also cover valid historical references,
temporary read states, late permission checks without a render hook, in-flight
success/failure, answer retention, uncertain-save retry and EN/ZH notices.
The new uncertain-save case uses a collection-store mock and restores the prompt
before retrying; it verifies UI command identity, not receipt reconciliation
while the prompt remains deleted. The complete existing Save handler, including
its command, reference validator and retry path, is byte-identical to the baseline.

Focused commands, run serially:

```sh
node --max-old-space-size=192 --test --test-concurrency=1 \
  --test-name-pattern='run source reference:' tests/ai-model-view.test.js
node --max-old-space-size=192 --test --test-concurrency=1 \
  tests/ai-model-view.test.js tests/ai-model-client.test.js \
  tests/ai-model-stream.test.js tests/ai-model-presets.test.js
```

The four related suites pass 218 tests. JavaScript syntax, EN/ZH JSON parsing and
`git diff --check` also pass. Full-repository and release gates are separate.
