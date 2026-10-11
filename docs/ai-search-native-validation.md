# Unified local AI search: bounded native acceptance

2026-10-11. Full automated regression passed **1,476 Node tests and 52 Python tests**. Native acceptance passed against the frozen 85-file candidate, manifest 1.1.25. Local release source 1.1.26 changes only the manifest version; all other runtime bytes match the accepted candidate. No remote publication is implied.

[Detailed native evidence and limits](qa/unified-ai-search-native/acceptance-notes.md).

Verified through an isolated native Chrome profile with synthetic content:
- Both-library results and prompt/AI excerpt filters; literal HTML-like snippets.
- Keyboard-selected exact records open in new tabs, preserving an existing source-tab draft.
- Invalid, missing and archived record targets show explicit notices and never select an arbitrary first record.
- Escape returns visible focus to the opener. Light and dark layouts were sampled in a 556×848 outer browser window.
- All frozen runtime source hashes remained unchanged.

Real IME input, forced read-fault injection and exhaustive theme/viewport/keyboard matrices were not tested natively. Independent automated regressions cover a lost compositionend after focusout, retry focus, emoji boundaries and case-expanded Unicode snippet offsets. Automated checks do not constitute native coverage of those scenarios.
