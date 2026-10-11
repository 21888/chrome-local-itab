# Explicit selection capture: bounded native acceptance

Completed 2026-10-11 UTC. Main capture flow passes with a browser text-formatting limitation; no confirmed implementation defect in the exercised scope.

## Environment and integrity

- Frozen runtime: `/workspace/shared/selection-capture-native-candidate/runtime`, manifest 1.1.25. All 88 supplied hashes remain unchanged.
- Official Chrome for Testing 155.0.8059.39, fresh isolated synthetic profile, dot cloud desktop only. Native window ID 71303171.
- All browser input used native Sky screenshot coordinates and key events. No injected application JavaScript, DOM/CDP browser automation, headless mode, storage seeding or application storage inspection.
- Trusted static fixture served on loopback port 8873 through native terminal. Only synthetic literal markup, code, Unicode and textarea content. No account/user data, no publication, no permission/security setting changes, no incognito enablement.
- Original downloads copied using native file-manager UI. Screenshots saved directly from CUA screenshot bytes without editing.

## Exercised sequence

1. Opened empty AI collection and exported baseline: `local-itab-ai-collection (2).json`, 135 bytes, records/recovery both empty. Screenshot 01.
2. On HTTP fixture `http://127.0.0.1:8873/?qa=synthetic#sample`, selected the three preformatted lines and explicitly chose “Save selected text to AI collection…” in native right-click menu. Screenshot 02.
3. A new extension tab opened an unsaved draft with empty title and literal selected content. Source checkbox was initially unchecked. The source preview excluded query and fragment, showing `http://127.0.0.1:8873/`. Successful hydration and removal of the capture token from URL exercises real Chrome session claim/ack and sender frame/tab checks. Screenshot 03.
4. Exported while draft was unsaved: `(3).json`, 135 bytes. Its content/recovery exactly match baseline. Export timestamps differ as expected.
5. Opted in to the sanitized source, entered `native captured aurora`, explicitly saved using Ctrl+S. Saved locally notice appeared. Screenshot 04. Export `(4).json`, 791 bytes, contains exactly one revision-1 record with one body history entry and sanitized source.
6. Reloaded saved tab. One record and source persisted, no new draft replayed. Screenshot 05.
7. Selected text in editable textarea and chose same native menu. New tab showed “Selections from editable fields are excluded…” and existing record remained intact. Screenshot 06. Error URL contains fixed code only, no selected text.
8. Original browser download list recorded in screenshot 07.
9. Selected only first fixture line and captured again. New unsaved draft contained exact `Aurora <b>literal</b> & plain`; source remained unchecked. Screenshot 08.
10. Duplicated this tab after capture token had been consumed/cleared. Duplicate showed saved record only, no captured draft. Screenshot 09. This is a post-consumption duplicate sample, not the pre-ack binding race.
11. Reloaded original second unsaved capture. Draft did not replay; only original saved record remained. Screenshot 10.
12. Final export `(5).json`, 791 bytes, has content/recovery exactly equal to `(4).json`, including unchanged record/version/history IDs, revision and timestamps. Editable rejection, second capture, duplication and reload did not mutate durable collection content.

## Formatting limitation

The multiline `<pre>` selection yielded a single-line captured body:

`Aurora <b>literal</b> & plain   const café = "星 ⭐"; 끝 — exact.`

Literal markup, indentation spaces, accented text, CJK, Korean, star and em dash were retained, but the two original newlines became spaces. Native screenshots and downloaded JSON establish the observed result. Source inspection shows selectionText -> payload.body -> draft.input.body passed unchanged; this supports the inference that Chrome's context-menu selectionText normalized the newlines. No raw API instrumentation was performed. Do not claim preservation of original page formatting or exact original multiline code. The page correctly describes the draft as browser-provided text; manual copy/paste remains the path to review original multiline formatting.

## Explicitly untested

- Forced service-worker termination and recovery, incognito, expiry/TTL boundary, session API fault injection, oversize/full queue, hostile frame or spoofed sender, pre-ack duplicate race, late-edit/hydration race.
- No worker/devtools instrumentation or extension security change was used to force these conditions.
- No claim that these native paths pass; automated coverage is separate.
- No exhaustive responsive/accessibility audit, no full backup/restore repeat, no real external account pages.

## Reproduction and evidence

- `verify.cjs` is standalone Node verification of 10 original screenshots, four untouched native JSON exports and static fixture hashes plus semantic assertions. Run `node verify.cjs` without source checkout.
- Optional `node verify.cjs --runtime-dir /path/to/runtime` validates all 88 source hashes.
- `verifier-output.txt` records native export semantics and frozen-source integrity passing.
- Sanitized ZIP omits browser profile, browser/server logs and launcher. Browser/server remain local test state, not deliverables.
