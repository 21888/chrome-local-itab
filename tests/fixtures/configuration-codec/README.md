# Test-only configuration oracle

`formal139-storage.js` is the exact original `storage.js` from release v1.1.139,
commit `008b97ab064d323baa4b26d8e6f72f57da2feca3`. It was copied with:

```sh
git show 008b97ab064d323baa4b26d8e6f72f57da2feca3:storage.js > tests/fixtures/configuration-codec/formal139-storage.js
```

SHA256: `bc51d96953fa58ea790cc1e77cfc910d779017198039f5f73968cc2475c31060`

The helper asserts this hash before executing the source in an isolated VM.
The local `.gitattributes` disables line-ending normalization for this fixture;
the historic source includes both LF and CRLF lines and must retain both.
The storage fixture alone also disables whitespace-error checks because its
byte-pinned original contains historical trailing spaces. Current runtime and
all other files retain normal whitespace checks; do not clean up this oracle.
This fixture must not be regenerated from current `storage.js`, edited to share
the new codec, imported by runtime code, or included in extension packaging.
Its historical duplicate implementation exists solely as an independent test
oracle. Both sides use separately loaded copies of the same pure dependencies,
fixed time, controlled locale and inert synthetic browser APIs. No saved user
data, real browser profile, provider, network, timers or persistence is used.

The four sources under `shared/` are also exact copies from that same commit;
the helper pins and verifies each SHA256. The oracle loads these historic
copies, while the candidate loads the runtime dependency files. They are
identical in this refactor. Keeping the oracle dependencies frozen prevents a
later change to a shared dependency from silently changing both sides of the
comparison and concealing a regression. Never regenerate the oracle from the
candidate, even if a future intentional behavior change requires a new test.
