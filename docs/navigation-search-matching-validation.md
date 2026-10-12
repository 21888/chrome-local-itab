# Navigation search matching — 1.1.82 candidate

The six-file implementation patch SHA-256 is
`1f625c6f6f9433f5cf662dfb5ca4d2e257c96aa09d484559581d5afd6861f0fa`.
It normalizes local query/text with NFKC and lowercase, and adds compact matching
only within individual brand names and declared aliases, ignoring spaces and
ASCII hyphens. Each query term must still match; empty compact separators cannot
match everything. Descriptions and independently joined fields are not compacted.
Category/tag/country/company/pricing predicates remain exact before text matching.

Two explicit aliases, Google → 谷歌 and Bing → 必应, use official naming evidence
recorded in the navigation-library guide. Aliases are bounded optional strings;
no inferred subsidiary/operator aliases or display-name changes are introduced.
The metadata preservation test explicitly permits only these two exact alias
values before checking the unchanged 1.1.81 catalog-field hash.

## Automated verification

The implementation candidate passed 2335 Node tests, 53 Python tests, 54 focused
tests and 112-file package verification. Coverage includes brand variants,
full-width text, Chinese aliases, all-terms matching, noncompacted descriptions,
exact combined filters, optional-alias schema validation and preserved metadata.
The versioned preparation applies the patch unchanged, then adds only manifest
81→82 and release/validation records. No UI, permission or dependency change.

## Bounded native search checks — 2026-10-12

The existing synthetic Chrome for Testing 155.0.8059.39 loaded exact ZIP SHA-256
`417a8eee5f5ab0963db61b3b4d30a6d52e0aa4166be6b24286c995801af8d8f8`.
The 112 expected runtime paths and manifest were verified; ordinary Extensions
Reload showed 1.1.82. This documentation-only update preserves those bytes.

Chinese Clarity light desktop representative results:

- Initial catalog 108 / Not added100 / Added8, selection 0/20.
- Native ASCII chat-gpt found ChatGPT (one); git-hub found GitHub Copilot and
  GitHub (two); googlefonts found Google Fonts (one).
- With googlefonts, incompatible AI category, CN country and paid pricing each
  produced zero. Restoring unrestricted category/country restored the result.
- Clear reset search and filters to 108/Added8. Entering chat-gpt then Escape
  returned visible entry focus; reopening cleared search and advanced filters
  while preserving 108/Added8. Saved synthetic shortcuts remained eight.

No Add, selection, batch save, external link or other data mutation occurred.
Full-width/NFKC and 谷歌/必应 characters could not be entered through the supported
native keys and were not attempted; their coverage remains deterministic tests
only. Narrow/dark/write paths, every query and every filter combination were not
retested. Screenshots remain local with no upload, browser injection or new
permission. This establishes representative ASCII matching and exact-filter
intersection, not complete native algorithm/language acceptance.
