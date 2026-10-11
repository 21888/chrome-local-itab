# Exact prompt-version picker: bounded native acceptance

Completed 2026-10-10. No confirmed functional defects in the exercised scope.

## Environment and integrity

- Frozen runtime: `/workspace/shared/prompt-links-native-candidate/runtime`.
- All 82 source hashes match its sibling `source-hashes.json` after testing.
- Official Chrome for Testing v155.0.8059.39, isolated new profile in this evidence directory, English/light appearance. Manifest remains 1.1.21, as supplied.
- Cloud desktop only. All application input used native CUA screenshots, keyboard and mouse. No CDP, headless automation, injected application JavaScript, direct application/storage writes, or storage seeding.
- Native accessibility was X11 fallback. Actual visible focus and keyboard selection were exercised; DOM identity/focus internals were not inspected.
- Download is original synthetic JSON, copied without modification using the native file manager. Profile and Chrome logs are not part of the sanitized evidence package.

## Reproduction and observed results

1. Open Prompt library from extension new tab. Create `native exact prompt` with exact body `v1 <b>literal</b>\n  keep {{topic}} exact.`. Save. Edit body to `v2 newer body {{topic}}` and save.
2. Open AI collection. Create `exact linked excerpt`, body `original excerpt <b>kept</b>`. Select the local prompt and older body version using native selects and keyboard, with no ID entry. Both versions were offered with timestamps; v2 was marked Current. Preview showed angle-bracket markup, two-space indentation and braces literally. Before Apply, existing link state remained “No prompt linked.” Evidence 01.
3. Click Save locally without Apply. Reopen Edit details: no prompt linked. Thus choosing/previewing alone did not attach it.
4. Select v1 and explicitly Apply link to draft. Draft showed exact linked version. Discard draft with confirmation, reopen Edit details: still no prompt linked. Evidence 02.
5. Select v1, Apply, Save locally. Reload the collection page. Saved exact v1 body and IDs were retained, while prompt current version was v2. Evidence 03.
6. Open Prompt library in a separate tab. Rename to `renamed native prompt`, change body to `v3 latest body`, save. Return to collection: display title refreshed, exact v1 IDs and body remained unchanged. Evidence 04.
7. Move prompt to Trash with explicit confirmation. Return to collection: exact v1 body resolved and provenance explicitly showed Archived. Evidence 05.
8. Edit collection details, Unlink in draft: draft displayed no link. Discard with confirmation: saved exact v1 link and archived body returned. Evidence 06.
9. Native window resized to 566 by 848 screen pixels. Tested at 100% and 125% Chrome zoom (approximately 450 CSS pixels wide at 125%, not DOM-measured). Stacked layout and picker controls remained usable. Selected archived prompt and v1 by keyboard; changed preview to v2 with Up and tabbed onto Apply, with a visible blue focus ring. Buttons wrapped; scrolling reached Save and Discard. IDs clipped within native closed select controls but were fully readable in preview text. Discarding this unapplied selection retained saved v1. Evidence 07.
10. Navigate from new-tab Settings to Data, export all complete-backup modules. Chrome download history confirmed actual file `local-itab-complete-2026-10-10 (16).json`. Evidence 08. Copied original 3,649 bytes into `exports/`. Offline verifier parsed once and confirmed exact link IDs, all three prompt bodies/history entries, archived status, renamed title, and unchanged collection body/single body version. Collection revision is 2, consistent with initial creation and explicit link save only.

## Evidence and repeatable comparison

From the unpacked evidence directory, run `node verify.cjs`. This standalone command validates the original download hash, byte count and exact synthetic contents without any sibling repository or runtime. It honestly reports source integrity as skipped (0 files checked). Current standalone output is in `comparison.json` and `verifier-output.txt`.

To additionally check a supplied frozen runtime, run `node verify.cjs --runtime-dir /path/to/runtime`. This uses the included `source-hashes.json`; the explicit runtime check result is preserved in `source-integrity.json`. The original 82-file verification run is preserved unmodified as `historical-comparison-with-runtime.json`. The verifier only prints results; it does not overwrite evidence files.

Original download SHA-256: `e1e3880f4af61f6342e58aa57b6161344fb29b2f1ba19c3365d15f99227208bc`.

Eight actual full-desktop screenshot JPEGs are in `evidence/`. They contain only synthetic test content and cloud QA paths. No screenshot was synthesized or edited.

## Limits

This is bounded native acceptance, not the whole application checklist. No injected read failures, corrupt store, deleted-version/unavailable race, recovery-only provenance, uncertain-write fault, rapid asynchronous apply race, or DOM node/focus identity inspection was performed. Those remain automated-only or untested natively. Rename and archive changes across tabs refreshed correctly in normal availability. No full backup restore repeat, browser restart durability, Chinese locale, dark theme, IME/Unicode/CRLF matrix, exhaustive widths, or network inspection was attempted. Persistent unlink via Save was not exercised; draft unlink plus discard was. No changes were made to runtime, manifest or git, and nothing was published.

## Browser handoff

Native browser ownership released to parent at 22:11 UTC. Cloud desktop ends in the native file manager showing the preserved original export. Chrome candidate remains open with synthetic data only.
