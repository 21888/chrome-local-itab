# Saved prompt body comparison

Open **Body version history → Compare saved versions**. Choose **From** and
**To** explicitly; switching those selectors does not change the selected
history body, linked results, variable session or saved record. The initial From
is the selected history version; To is the current version, or another saved
version when From is already current. One-version records can compare to themselves.

Changes are exact line-level, grouped as **− Removed**, **+ Added** and
**= Unchanged**, with labels independent of color. Expand **Original saved text**
for both literal bodies. Variables and HTML remain text. CRLF, CR, LF and final
newlines participate in equality; the browser may display different line endings
similarly. Separate From/To summaries show CRLF, LF and CR counts and whether
each body ends with a newline, making these otherwise invisible changes
understandable without normalizing, rewriting or inserting markers into either source.

Comparison is an inline, ephemeral panel. Close or Escape returns focus to the
opener; IME Escape is ignored. Changing records, opening an editor, a failed
prompt read or disappearance of either version clears the comparison. A normal
refresh retaining both versions preserves the pair and keeps history open.

The exact LCS table is limited to 250,000 cells (under 1 MB). Common prefix and
suffix lines are removed first. Larger middles use a disclosed coarse comparison:
all old middle text is removed and all new middle text is added, preserving exact
unchanged edges. This deliberately avoids unbounded quadratic work at the 32,000
character body limit. Adjacent operation lines are grouped to avoid creating one
DOM node for every empty line. No persistence, provider/network calls, new
permissions, clipboard writes, association changes or restore actions occur.

## Verification

`node --test tests/local-prompts-comparison.test.js` covers reconstruction of
both originals, empty/equal text, final newlines, mixed line endings, Unicode,
literal HTML, deterministic varied edits, maximum-length fallback, variable and
history preservation, no storage writes, selectors, Escape/focus, refresh,
missing versions, read failure and editor navigation. These are synthetic DOM
checks; native Chrome keyboard behavior, screen-reader output and small-screen
visual layout require independent browser acceptance.
