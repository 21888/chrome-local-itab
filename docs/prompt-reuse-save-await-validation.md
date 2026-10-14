# Await the actual UI answer-save operation in prompt-reuse tests

The prompt-reuse regression that saves a previous answer after replacing its next question used at most 40 rounds of four `setImmediate` turns before reading the saved collection. It did not assert that the save had finished. The store performs asynchronous WebCrypto receipt digests and a fenced write/readback. A fixed count of event-loop turns is not a completion signal for those operations.

The first full-suite run of the manual saved-excerpt comparison candidate exposed this existing test race: 3,246 of 3,247 tests passed, while this test read `records[0]` before the write and failed on `saved.promptRef`. The failing test and its context/controller/store runtime files were unchanged from 1.1.127. A standalone rerun passed all 66 tests, which did not establish reliable completion.

## Controlled baseline reproduction

On exact baseline `f4bb62149a879eb5062825cca620a6dd56afdc7c`, a synthetic deferred gate held the existing backend write. After the original 40-round wait, the controller was still busy, writes were zero and saved was false. Reading the first record reproduced the same undefined `promptRef` failure. Releasing the gate and awaiting the actual save Promise produced exactly one write, saved true and busy false. No runtime code or provider was changed to reproduce this; only the test backend was delayed.

## Test-only change

The test now observes the Promise returned by the existing controller method invoked by the real Save button, asserts that the click initiated it, and awaits that exact operation. A rejection therefore fails the test rather than being confused with an empty saved collection. It then checks completed state, one write, and the original response's unlinked reference and historical question.

The same full interaction is exercised with ordinary completion and with a controlled deferred backend write. The delayed case explicitly verifies busy/unsaved/zero-write state while held and releases the gate before awaiting the real operation. A 10-second test deadline bounds a genuine hung operation; it is not a replacement polling count or success condition. There is no production change, wait-loop increase, network request, credential use or new dependency.

Focused command:

    node --test --test-concurrency=1 tests/ai-context-prompt-reuse.test.js

Run the serial JavaScript and Python suites against the final integrated commit before release. These are synthetic test checks, not native browser or real-provider acceptance.
