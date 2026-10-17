# Completed streaming answer: prompt-read recovery

Version: 1.1.155. This change is confined to the optional model dialog UI.

## Confirmed failure

A real prompt Controller subscription begins a pending read when any saved prompt changes. After a successful streamed answer, even an unrelated prompt title edit made `sourceCurrent()` temporarily false. The model dialog treated that transient read as a definitive source change and discarded the completed answer. If an earlier collection save had committed but returned an uncertain write result, the same-operation retry became unreachable even though the collection receipt still proved that exactly one answer had been saved.

## Behavior

- Only an already completed streaming response can survive a temporary prompt read. An unsaved answer and a submitted save's existing command remain in memory.
- Pending and failed prompt reads disable Save and show a separate localized source notice. Transport/save feedback remains visible. A failed read does not establish source deletion. A modal-local “Retry source check” button explicitly invokes the existing Controller read; it is unavailable during pending reads or saves and after interruption/closure. Background controls remain inert.
- A successful read of the same source record version/session/preview restores the explicit Save action. It never resends the model request, creates a new save command, or retries a write automatically.
- A save already in progress keeps its existing close/duplicate-save lock. After an uncertain outcome, explicit retry uses the exact same command and the existing Store receipt reconciliation.
- Actual source metadata/version changes, body/source deletion, selection, preview or session changes and page departure retain the existing interruption behavior, including during a pending read.
- Active transport, partial output, Stop, late packets, reader/copy eligibility, the non-streaming source-reference guard, and collection Store validation/receipt protocol are unchanged. This does not guarantee a source reference remains valid at save time; the Store continues to validate it under its existing lock.

## Focused validation

`tests/ai-model-stream-receipt.test.js` mounts the real prompt View with real prompt Store/Controller subscriptions, the real collection Store, and the real model client consuming synthetic SSE bytes. All source text, answers and endpoints are synthetic; no provider, browser, credential or user data is used.

- Baseline at `364a038fb816cb295ba9b3425e7c7490149c4cf2`: 4 failed, 8 passed. All four failures are the expected completed-answer erasure, covering unrelated refresh, pending/failed-read recovery for unsaved and uncertain answers, and refresh during a pending committed save.
- The answer-preserving candidate before the modal retry control (`087b475c95e208d9c83f0e36ae3394e7b74b7283`) produces 2 additional focused failures at the explicit assertion that the retry control exists, with 10 passing. These isolate the inaccessible recovery action rather than a TypeError.
- Final: all 12 pass. The uncertain-save cases inspect the real receipt, assert a single backend write and stored answer, and compare retry command object identity and request count. Failed-read recovery is exercised through the actual modal button, including repeated clicks, another failed read, pending-read focus, same-source recovery and preservation of newer focus; it does not depend on an inaccessible background reload.
- Existing focused model View cases: all 33 pass, including the non-streaming source guard, streaming interruption/Stop/late-packet behavior, successful SSE, reader/copy streaming cases and locale-key inventory.
- Streaming parser/client suite: all 21 pass.

Commands (run sequentially, each with a 256 MiB Node heap ceiling):

```sh
node --max-old-space-size=256 --test --test-concurrency=1 tests/ai-model-stream-receipt.test.js
node --max-old-space-size=256 --test --test-concurrency=1 --test-name-pattern='stream:|run source reference:|reader: streaming|full answer copy: streaming|all model labels' tests/ai-model-view.test.js
node --max-old-space-size=256 --test --test-concurrency=1 tests/ai-model-stream.test.js
```

The full repository suite and browser QA were not run for this isolated change. No manifest, permissions, workflow, transport or Store changes; no version bump, push, Release or Chrome Web Store publication.
