# Offline calculator validation — 2026-10-09

The final integrated source matches the frozen reviewed and native-tested runtime. All 123 automated tests pass. Independent review additionally compared 30,000 generated arithmetic expressions and exercised 100,000 malformed/random inputs. Syntax, manifest/locale JSON, and patch checks passed.

Native Chrome for Testing verified English arithmetic precedence, unary signs, zero-division/malformed/depth errors without external navigation, stale-result clearing, retained input focus, and Graphite dark layout at a 510×848 browser window. These are window dimensions, not a measured content viewport. Twenty original screenshots and runtime hashes were recorded.

Chinese native rendering, native IME, ordinary localhost URL submission and all-template coverage were not completed because the disposable browser became unresponsive. Automated initializer checks cover Chinese/English, IME suppression, ordinary URL/search behavior and local-only error paths; these do not replace native verification. No permissions or external network consent were changed.

A cloud execution interruption terminated an integration run. After recovery, the full final suite was rerun successfully; the incomplete run is not counted as a pass.

Arithmetic uses standard JavaScript floating-point numbers, not exact decimal arithmetic; for example 0.1 + 0.2 can display 0.30000000000000004. Input and nesting bounds and supported grammar are documented in the README. There is no calculator history or persistent storage.

## Follow-up native acceptance after recovery

On 2026-10-09, the published runtime at `7242483` was reloaded in the recovered official Chrome for Testing profiles; all seven tracked runtime files matched production. Chinese Clarity/light at a 510×848 native window correctly rendered the calculator controls, evaluated precedence/unary expressions, displayed localized zero-division/syntax errors, and cleared stale output on ordinary input. English Graphite/dark arithmetic, error and ordinary-input regression also passed. Ordinary localhost URLs opened the exact requested destination in a new tab; connection refused was expected because no local server was running, so this verifies routing, not successful page serving.

These observations close the earlier Chinese rendering and localhost routing gaps for the executed cases. Real IME composition, screen-reader output, all-template coverage and an actual Sync-triggered reload remain unverified. The earlier interruption record remains historical, not a current blanket browser blocker.
