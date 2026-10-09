# Main-search draft ownership validation — 2026-10-09

Ordinary non-whitespace queries, direct-URL drafts, Unicode/IME drafts and calculator expressions now retain the search instance's reload ownership. A confirmed live window returned from an ordinary submission releases only the unchanged value/revision; null/noopener ambiguity, blocked/closed/throwing opens and missing custom engines conservatively retain the draft. Subsequent edits restore ownership. No persistence, extra navigation, provider or open-option changes were added.

The final aggregate suite passes 124 tests. Independent review reproduced original data loss and fixed behavior through the actual initializer, applied-Sync listener and lifecycle with a modeled reload. Coverage includes throwing window getters, synchronous edits during open, repeated submissions, editing back, programmatic changes, composition, unrelated pending owners, discard cancellation and detached remounts.

These are deterministic DOM-model checks. Native Chromium/IME/popup/live Sync behavior was not newly verified because the cloud test browser was unresponsive. A returning window handle establishes dispatch, not completion of loading a destination. The conservative null/noopener behavior is intentional.
