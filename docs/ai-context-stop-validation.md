# AI context Stop validation — 1.1.75 candidate

## Change and deterministic coverage

A stopped send no longer depends on an unresolved permission/workspace/transport
Promise settling before the controller releases its request state. Abort-aware
waits and request-identity checks isolate stopped generations; the UI retains
its explicit stopped status and clears the old request key. Local save write
fences and receipt/uncertainty handling remain intact.

Synthetic tests explicitly cover:

- Workspace checks before permission, before transport and after transport.
- An unresolved permission check and an abort-ignoring transport callback.
- Stop completing without those five old callbacks resolving; late callbacks
  during/after a newer run cannot send old work, replace result/title/status,
  clear a new key or unlock a new controller.
- UI Stop, Close/pagehide and no late request/UI resurrection.
- Stop during a queued local save preserving write-lock and receipt protection.

The reviewed five-file implementation patch had SHA-256
`def6b55b24b46de75a5544971ed398d3486ae4db066d4ddce79fe3b90e556150`.
Its independent pre-integration verification passed 2199 Node tests in strict
unhandled-rejection mode with a 1 GiB heap, 53 Python tests, syntax checks for
259 JavaScript files, manifest/locales JSON checks and diff whitespace checks.
An initial artificial 256 MiB heap limit caused a scale-test OOM; the unchanged
code passed the complete run with the suitable heap limit. These are results
for that patch candidate, not a claim that the final versioned 1.1.75 source
already completed a new full-suite run.

After integration on the 1.1.74 candidate, the targeted command
`node --unhandled-rejections=strict --test --test-concurrency=1 tests/ai-context.test.js tests/ai-context-view.test.js tests/settings-danger-contrast.test.js`
passed 56 tests with 0 failures. The reviewed patch is unchanged, apart from
separate version/release documentation. No CI workflow change is involved;
`docs/ai-context-workflow.md` documents the user workflow only.

## Bounded native local-interaction smoke — 2026-10-12

The existing independent Chrome for Testing 155.0.8059.39 synthetic installation
loaded the canonical 1.1.75 ZIP, SHA-256
`bd5958f5638ebbfb44eec72c921175a083619bbbc4c5ded97953962227e3a364`.
The hash and exact 108 runtime paths were checked before extraction over the
fixed runtime directory; ordinary extension Reload visibly showed 1.1.75.
This documentation-only update preserves those tested runtime bytes.

Passed, English UI / Clarity dark / desktop only:

- AI context Q&A opened one visible panel with blank fields and idle Stop disabled.
- A reserved synthetic endpoint, synthetic model/question and empty selected
  sources produced a local exact-request preview. The API key stayed blank;
  neither Allow nor Send was activated, and no connection preset was saved.
- Editing the question hid the old review and disabled Allow/Send; re-review
  generated a new local preview.
- Cancel / clear draft removed the question and preview and restored disabled
  idle Allow/Send. This is draft clearing, not an in-flight Stop check.
- Escape closed the panel and visibly returned focus to its trigger. Return
  reopened blank fields with Close focused, and Tab moved to the endpoint.
- A further unsaved synthetic draft triggered Chrome's unsaved-changes warning
  on page reload. After confirming reload for that disposable data, reopening
  showed blank endpoint/model/preset/key/question and no restored request/response.

Screenshots remain local, with no upload or release attachment. No key entry,
permission change, provider call or browser/storage injection was used.

Not tested natively: in-flight Stop, unresolved permission/workspace callbacks,
hanging transport, real provider/model response, billing cancellation, key
lifecycle during send or actual-response persistence. The Stop race guarantees
remain supported only by deterministic synthetic regression tests, not this UI
smoke. Nonempty source deselection, clear-draft focus, narrow viewports, Chinese
UI and a full accessibility audit were also outside this pass. Escape/Tab focus
checks do not imply every focus path was verified.
