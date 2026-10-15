# Editable task JSON: rejected-edit authorization fence

## Scope and observed boundary

Based on the 1.1.151 source (`df1b571`), a programmatically assigned response longer than 32,000 UTF-16 units caused `editResult()` to reject before invalidating its previous task review. The displayed text could therefore differ from a still-authorized old task batch. This probe established the controller/programmatic-input boundary; it did not establish an existing native paste incident. The previous response textarea had `maxlength=32000`, which can constrain or truncate native user input.

Only the response textarea loses its native maxlength. An oversized draft now stays intact for repair instead of potentially becoming a different truncated JSON value. Other input limits remain unchanged. Task responses still have a 32,000 UTF-16-unit validation limit, 1–50 nonempty single-line tasks and at most 1,000 UTF-16 units per task. Answer responses remain read-only. No storage schema, task command protocol, transport, permission or provider behavior changes.

## Authorization and recovery

- Existing busy, task-command and save-command guards run before any edit invalidation. A pending or uncertain task write keeps its original command, review, generation and idempotent retry.
- An accepted edit event advances generation and removes the old review and candidate selection before checking the replacement string. Rejected length or Unicode input leaves a marker bound to that exact prior result; candidate parsing and review cannot fall back to its old internal JSON.
- The complete rejected string remains in the textarea and is not installed as the controller result or written to either store. An English/Chinese inline status explains the intact draft, canceled old review and need to repair/re-review; the field has `aria-invalid=true`. Old task rows and selection are hidden, and Review/Add are disabled.
- A later valid edit produces a new result identity, clears the marker, resets selection and requires explicit fresh review and confirmation. Restoring the exact original JSON also requires fresh authorization. Clear, close and successful replacement release the old marker; it cannot contaminate a later answer or task result.
- A generation mismatch rejects late task review or external-load callbacks. Invalid JSON in the separate external-input Load workflow retains its established transactional behavior: it keeps the old response, selection and review untouched.

## Performance boundary

The existing validator checks type and length before its Unicode scan. Oversized response edits never reach JSON parsing; the marker check also precedes task-candidate parsing and task-store review. The focused parse counter exercises a valid-structure 40-task JSON whose individual tasks are below 1,000 units but whose total exceeds 32,000. It records zero JSON parses and zero task-store reviews on the rejected edit/re-review path. No oversized text is assigned to controller result/state or persistent stores. This is not a claim that the browser creates no temporary strings: DOM reads, copying and existing draft-comparison serialization may still allocate strings.

## Focused automated checks

Run from the repository root:

```sh
node --test --test-concurrency=1 \
  tests/ai-context-task-edit.test.js \
  tests/ai-context-external-tasks.test.js \
  tests/ai-context.test.js \
  tests/ai-context-view.test.js \
  tests/ai-context-prompt-reuse.test.js
```

The new focused file covers 32,001-unit input, oversized otherwise-valid JSON, raw unpaired high/low surrogates, exactly 32,000 units, unchanged task-count/line limits, no old-candidate reauthorization, repair and undo, late preflight/store review and load callbacks, new provider/external results, clear/close, original pending/uncertain write identity, and invalid external Load preservation. It also seeds active, completed and removed records plus pin and recovery, verifies zero writes on rejection, and verifies that repaired append leaves all original records/recovery byte-for-byte unchanged and preserves pin/enabled state.

The view tests execute the actual view/controller/store scripts through the repository's synthetic DOM/event model. They assert full textarea preservation, status and ARIA state, disabled controls, detached old-checkbox events, stale callback behavior, safe retry and a successful fresh-review flow. They are not native browser tests and do not establish native paste, rendering, focus or clipboard acceptance. All fixtures use synthetic data and no credentials.

On 2026-10-15, these five focused files passed **357 tests**, with zero failures, skips or cancellations. Version remains 1.1.151 in this development worktree. No full suite, browser acceptance, commit, push, package or release was performed by this implementation pass; those are separately gated downstream checks.
