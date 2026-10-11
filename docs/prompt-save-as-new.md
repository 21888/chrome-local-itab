# Save an editor draft as a new prompt

Existing-prompt editors provide one secondary **Save draft as new prompt** action,
including conflict and history-limit recovery. New editors use normal Save.

The new record gets the editor title, exact body, category, tags, tool note and
favorite, a fresh ID and one body version. Original records and their history
are untouched. Temporary variable values and historical preview selections
remain in their original in-memory session; they are never substituted into the
saved template. Unchanged templates can be copied. Normal Save and Ctrl/⌘ + S
continue to edit the original. Required fields gate both buttons.

## Interrupted-save safety

- Repeated activation while busy is blocked. Definitive first-attempt validation
  or capacity failures retain the editable draft and do not leave a pending save.
- An uncertain acknowledgement retains its immutable command and operation ID.
  Editors, new saves and discard remain blocked; retry uses the exact command.
- If an intervening write makes retry reject, that rejection does not prove the
  earlier attempt failed. The operation remains pending and the action changes
  to **Check saved outcome**, with distinct English/Chinese uncertainty wording.
- Checking is read-only under the existing store lock. An exact operation ID and
  SHA-256 command digest in the saved receipt window prove prior commitment.
  The latest state is displayed, including any subsequent edits to that copy.
  No record is rewritten and no new command ID is generated during inspection.
- Missing, evicted or mismatched receipts do not prove failure and never unlock
  fresh Save as new. The draft and operation remain in this tab; further checks
  are read-only. Keep the tab open and inspect the library. No speculative rollback,
  receipt matching by title/body, or silent recovery copy is performed.
- This does not loosen mutation replay: non-latest receipts still yield CONFLICT.
  Pending drafts and operation tracking remain page memory, not a durable journal.

## Focused verification

Synthetic fixtures only, no user information, credentials or screenshots.

```sh
timeout 60s node --max-old-space-size=256 --test --test-concurrency=1 \
  tests/local-prompts-controller.test.js tests/local-prompts-view.test.js \
  tests/local-prompts-store.test.js tests/local-prompts-lock-errors.test.js \
  tests/local-prompts-boundaries.test.js tests/local-prompts-independent-audit.test.js \
  tests/local-prompts-integration.test.js
```

128 tests passed on 2026-10-11. Coverage includes ordinary copies, stale originals,
20-version recovery, 200-record capacity, required and invalid fields, exact body
and metadata copying, preview isolation, repeated clicks, delayed acknowledgement,
lost acknowledgement plus another tab's mutation, receipt mismatch/absence and
real 128-receipt eviction, later edits to the copy, read-only proof, unchanged
replay/CAS rules, English/Chinese actions and keyboard focus.

These are focused Node/DOM-model checks. Full-suite CI and native-browser
acceptance are separate release gates; they were not run for this feature task.
