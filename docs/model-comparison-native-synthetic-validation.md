# Model comparison and save-receipt native interaction batch

Verified 2026-10-26 23:53 through 2026-10-27 00:00 UTC on cloud Linux Chrome.
This records two bounded complete workflows, not new functionality or a runtime
fix. No product defect was found.

## What was real, and what was synthetic

The actual Prompt page, comparison dialog, transport parser, collection store,
receipt checks, browser layout/input and browser Web Locks were exercised.
The frozen runtime was `fa1a2421b4131f67aad847f79e59d57827c6bffd`:

- `shared/ai-model-comparison.js` SHA-256:
  `aa50e7b3ad32e3f42ecc4431182a168aa9dd1f4e63212230145612ec501f036d`
- `shared/ai-model-client.js` SHA-256:
  `d6626943ac32c247113426ef90e2b7ea4baa5fe0fe5622c6c920e457232b17f7`

Storage used a synthetic origin-local bridge, not real extension storage.
Exactly two fixture URLs, `https://a.synthetic.test/v1/chat/completions` and its
`b.synthetic.test` counterpart, returned in-memory JSON Responses. They never
reached the network. Other external requests were refused. The fixture's
permission-presence lookup recognized only those two exact origins; actual
permission requests remained refused. No Allow button was clicked and no key
was entered. This is **not real provider compatibility, billing, permission-UI,
installation, upgrade, or user-data recovery acceptance**.

The two complete existing comparison/client test files passed **137/137** as
preflight. They were not repeatedly rerun to inflate coverage, and this
documentation-only batch makes no new full-suite claim.

## 8802: completed prompt → two results → differences → exact saved links

1. The saved prompt's current v2 (`test_00000005`) contained
   `Recovery version two {{topic}} 👩‍💻`. Filling the temporary value
   `Same topic 日本語 🧪` produced the same exact completed text for both targets.
2. Opening Compare initially selected neither target. Selecting Synthetic A and
   B and explicitly reviewing displayed both full endpoints, model IDs, identical
   completed text, the maximum request count of two and separate charging notice.
   The readback still showed **zero requests and zero writes**.
3. Explicit Send produced exactly two intercepted POST payloads with identical
   user-message content and `stream: false`. The actual transport parsed the
   response bodies. Neither answer was saved automatically.
4. Compare original text differences showed the equal first line and separate
   target-specific text, with no quality-score claim. Target A had one CRLF,
   one CR and no final newline; B had one CRLF, two LF and a final newline.
   Literal `<script>literal</script>` remained text, and the difference container
   contained no script element.
5. At native 200% zoom, the page measured 586 CSS px with `scrollWidth` 586.
   Target panels stacked vertically: both started at x=46 with width 487, and
   the second began 16 px after the first ended. Both explicit Save controls
   were reachable. Saving each created **two total writes**, after which both
   Save controls were disabled; no forced duplicate event was dispatched.
6. Readback retained each original response's exact CR/LF characters, respective
   `model-a`/`model-b` label and origin, and the immutable v2 prompt reference.
   The pre-existing result retained its older v1 reference.
7. Closing the dialog returned focus to Compare models and retained the temporary
   variable. Both v2 saved-result links appeared. Clicking the model-a link opened
   the exact collection record in a new tab, healthy on first load without a
   manual refresh. The detail showed the correct body, model, source attribution
   and linked prompt version. The external source link was not opened.

The raw answer strings were:

```text
A: Shared first line\r\nAlpha 日本語 <script>literal</script>\rFinal A
B: Shared first line\r\nBeta 👩‍💻\nFinal B\n
```

### Preserved initial fixture failure

The first 8802 fixture mistakenly omitted `:443` from its synthetic origin
allowlist. Production correctly requested its normalized `:443` origin pattern
and refused both sends, with zero requests/writes. The original negative result
was retained. Only the fixture's two exact strings and independent session key
were corrected, then the complete final flow above was rerun. No production
guard was relaxed and no real permission was granted.

## 8803: committed save loses acknowledgement → peer saves → read-only check

A separate fresh fixture performed the same two-target setup but injected one
failure only: after the first Collection write had persisted and its normal
change notification was scheduled, the synthetic storage call rejected its
acknowledgement. It did not cancel or roll back the committed data.

- Save A displayed **unconfirmed**, with a Check whether this result was saved
  button and clear read-only explanation. The stored A record already existed:
  one write, two synthetic model requests, exactly one injected lost acknowledgement.
- Save B then succeeded: two total writes and two new result records in addition
  to the original seed record.
- Explicit Check A confirmed the exact earlier operation. The message changed
  to saved, the check control became disabled, and counters remained **two writes
  and two requests**. No answer was written again, no provider was resent, and
  no duplicate record appeared.
- Closing displayed both exact-v2 result links. Both original raw answers,
  model labels and immutable references were intact. Clear values discarded
  only the synthetic temporary variable before leaving.

This validates the existing receipt path with a native UI and synthetic lost
acknowledgement, not every expired/missing/restore-invalidated receipt case.
Those remain separately scoped model evidence; this batch did not grow into
additional race variants.

## Preservation and cleanup

Both runs preserved the prompt library, privacy/sync configuration, all personal
workspace modules and the other workspace's registry/bundle. Only the intended
two Collection records were added in each independent fixture. There were no
clipboard, file chooser, import/export, permanent deletion or real provider
operations. Screenshots were inspected in-tool, not uploaded.

Owned 8802 tabs 59/60 were closed. The prompt tab's temporary values triggered a
native leave-page confirmation, which was explicitly accepted to discard only
those synthetic values. Zoom returned to 100%; the dedicated server and Terminal
tab were stopped normally. The protected pre-existing tab 9 was already absent
from inventory before this cleanup, for an unknown reason; this flow did not
read, close or navigate it. Its absence does not resolve or authorize any earlier
pending import operation.

Owned 8803 tab 61 was closed after Clear values, and its server/Terminal tab
were stopped normally. Final inventory at 00:00:24 UTC showed a new blank tab 62;
it was not read or used as a replacement for tab 9. GUI ownership was released.
