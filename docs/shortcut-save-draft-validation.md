# Shortcut drafts edited during a save

## Reproduced problem

The Add/Edit editor keeps its fields enabled while Save is pending. Previously,
completion checked only the modal session and closed that editor even after a
later title, URL, icon or category edit. The earlier submitted values were saved,
but the newer visible draft disappeared and its departure protection was cleared.
An IME composition beginning before its first input event had the same ownership
problem.

## UI behavior

- Save captures the raw submitted fields and this opening's editing-intent
  revision. Input, change and compositionstart events advance that revision.
  Raw-field comparison also catches programmatic changes, including explicit
  icon-fetch completion that emits no input event.
- An unchanged current editor still closes after success. A current editor with
  later editing intent keeps its fields, focus and preview. Save becomes available
  again after the first write settles. There is no automatic second write.
- The successful storage snapshot becomes the next save's existing list/identity
  baseline. A retained Add becomes Edit for the item just added, including its
  storage-allocated layout identity when present; the next Save edits that item
  rather than adding a duplicate.
- The submitted raw fields become the retained editor's departure baseline.
  Newer differences remain protected. Reverting to the old opening's value can
  therefore be dirty after the submitted value commits. Exactly restoring the
  submitted raw values removes the warning; later editing intent can still keep
  the editor open. Whitespace remains significant for draft comparison even when
  the saved value was trimmed or its URL normalized.
- Failure and conflict retain the existing handling. A later external list change
  is still rejected by the existing conditional save. Cancel, close, backdrop and
  ordinary Escape remain deliberate discards. A closed or reopened editor keeps
  its separate session ownership.

This changes only UI completion ownership. It adds no persistence format, storage
protocol, permissions, automatic icon lookup, network behavior or unload-time
writes. Icon-request composition ownership is a separate concern and is unchanged.

## Focused verification

Run `node --test tests/shortcut-save-draft.test.js`.

The 20 tests use production shortcut methods and production StorageManager with
synthetic memory-only Chrome storage, a modeled lock queue, deferred submission
and DOM events. The preceding source at `95288c2` fails 19 of these tests; its
unchanged-editor control passes. The fixed source passes all 20. Cases cover all
four fields in Add/Edit, programmatic icon edits, explicit favicon completion,
focus, raw baselines, exact reversion, compositionstart before input, schema 1/2
identity allocation for duplicate URLs, Add-to-Edit retry and a subsequent external
conflict. Related preview, departure, reload, favicon-session, save-session,
keyboard, dialog-IME, dialog-focus and unlisted-category files pass with this
change: 110 Node tests across the 10 explicitly selected files.

These are deterministic models, not native Chrome or operating-system IME
acceptance. Full repository Node/Python suites and release packaging were not run
for this focused change. Native follow-up should use synthetic shortcuts and a
controlled write delay: type or start composition during Save, verify the editor
stays open after the original values commit, then save the later draft once and
confirm no duplicate and correct reload persistence. Real IME event ordering,
focus painting, native beforeunload warnings and live Sync remain unverified here.
