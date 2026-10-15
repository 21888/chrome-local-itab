# Manual temporary context excerpts

Open **AI context Q&A → Add a temporary excerpt**, type or paste a title and plain-text body, and choose **Add temporary excerpt**. This creates one candidate in the current panel. It is not selected automatically. This is useful for a one-off passage that should not first become a saved collection or workspace note.

## Exact input and identity

- At most 12 temporary candidates can coexist, independently of how many saved sources are loaded. Duplicate titles and text are allowed; each candidate gets a different `manual:<session UUID>:<sequence>` ID.
- The title is required and kept exactly, within the existing title contract: 200 Unicode code points and 400 UTF-16 units. The body is required, with a 16,000 UTF-16-unit limit. Both must have valid Unicode. Whitespace is preserved; whitespace-only input fails.
- The title, body and manual outgoing-excerpt editor have no native `maxlength`. Oversize or malformed input remains complete in its editor for correction. Nothing is silently shortened, rewritten or partially accepted.
- The row and scope filter say **Manual temporary excerpt (unverified)**. The complete prompt additionally explains that `manual:` source IDs identify manually entered temporary excerpts with unverified origin. The exact title remains unprefixed so the user's full title allowance is preserved. An ID is not a real page, collection record or verified citation.

Select a candidate to reveal and edit its outgoing excerpt. **Restore original excerpt** restores the exact text originally added in this session; it does not read a source again. **Remove temporary excerpt** removes that candidate, whether selected or unselected. Edited and restored text reuse the existing exact-text/textarea line-ending handling. Input fields have ordinary native paste behavior; the extension never reads the clipboard.

Title search, scope and selected-only filters affect visibility only. Hidden selections remain included, counted and reviewable. The existing selected-source cap of 12, question limit of 4,000 UTF-16 units, per-excerpt limit of 16,000 and complete serialized prompt limit of 32,000 apply across saved and manual sources together. JSON escaping, the manual-origin instruction and IDs count toward that full-prompt limit. Adding or editing never silently selects or drops an item.

## Reload, clear and interruption

**Reload saved sources** replaces only saved collection/note rows. Their selections and edits are reset after a successful read. Every manual row retains its original DOM, ID, original text, current outgoing edit and selection; unadded title/body text and existing filters stay unchanged. Only saved rows that will lose selections or edits trigger the reload confirmation. Cancel or read/build failure keeps all existing rows and reviews. The complete draft is checked both after confirmation and after asynchronous reads, so a later change cannot be overwritten by the earlier reload.

Adding validates the complete draft and pinned workspace session before and after its asynchronous active-session check. A changed question, source, filter, unadded text, controller generation, workspace or departure rejects the old completion. Pending work and unresolved answer/task saves retain their existing lock priority; manual operations cannot release those locks or create a replacement save.

Any temporary candidate, even unselected and unedited, or any unadded title/body text counts as unsaved work. **Cancel / clear draft** asks before discarding a manual draft, then removes all temporary candidates and unadded inputs along with the rest of the draft. Cancel keeps everything. Normal panel close uses the existing unsaved-draft confirmation. Confirmed close and page departure discard volatile manual content; it is not carried to a replacement workspace. Closing or clearing cannot erase an already saved historical snapshot.

Adding, input editing, selection, restoration and removal invalidate previous local/network request reviews. The previous completed response and its immutable original request remain unchanged. New draft changes do not rewrite that response's historical sources or automatically change its existing snapshot consent choice.

## Persistence and privacy

Adding, editing, restoring, removing, reloading, reviewing locally and copying a reviewed prompt add no persistent writes, storage schema, permission, network action, source fetch or clipboard read. The panel does not automatically save temporary sources.

The existing answer-save checkbox **Also save this exact question and reviewed source excerpts** remains off by default. Its adjacent privacy explanation explicitly includes selected manual temporary text and says the snapshot joins the **global AI collection and unencrypted backups**. Checking it reveals the complete exact JSON before the separate save action. It records the original reviewed request, including manual IDs, titles, edited texts and the full prompt's manual-origin explanation. Later removal, reload or editing does not alter an old answer's snapshot or silently reset a choice already made for that answer. With the checkbox off, no question/source snapshot is added; the answer itself may still repeat private input. Review the full preview and answer before saving.

A manually loaded external answer still has no verified request context and cannot attach a question/source snapshot. Explicit model sending continues through the separate exact review, endpoint permission and send actions. The feature does not add any provider, real-account test, paid service or automatic send.

## Reference and verification boundary

Interaction research used the official LibreChat [message composer](https://www.librechat.ai/docs/features/composer) and [Upload Files as Text](https://www.librechat.ai/docs/features/upload_as_text) documentation, accessed October 15, 2026. Its composer exposes staged context and edit/remove controls; its upload feature routes files. Local iTab independently implements manually entered local candidates. No LibreChat code, uploader, dependency, asset or license content was copied.

Focused synthetic controller/store/DOM tests cover default-off selection, exact Unicode limits, duplicate identities, cap/hidden-selection behavior, raw-text restoration, whole invalid input, successful/cancelled/failed reloads, confirmation races, late Add/reload callbacks, close/clear/workspace fences, response provenance, explicit snapshot persistence, default snapshot exclusion, external-answer refusal, zero-write operations and unresolved-save locks. A native-blur DOM model checks focus ownership; it is not native-browser acceptance. No real provider request, credential, clipboard permission or personal data is used.

Run the new focused suite:

    node --test tests/ai-context-manual-sources.test.js

Run the adjacent controller/view, external-answer, prompt/collection handoff and task regression suites separately before publication. Native browser layout, keyboard/paste/clipboard and accessibility acceptance, full-suite results and release status must be reported from their actual checks, not inferred from these synthetic tests.
