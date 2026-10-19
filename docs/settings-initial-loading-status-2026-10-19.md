# Initial settings loading status

The initial settings input gate now has a short English/Chinese loading status outside its inert areas. It says editing is temporarily unavailable; it does not promise successful loading. Concurrent startup attempts share one status, removed only when the final attempt settles. Existing failure notices and read-only recovery surfaces remain responsible for errors. Retrying with an established form owner does not add the initial status or lock an existing draft.

The gate and Back binding now run inside the existing initialization try/finally, so a setup exception also clears initialization accounting and reaches the existing unloaded-form protection. No storage or recovery protocol changes.

## Evidence

- Real production initialization paused after workspace mounting at configuration and quota reads previously had no outside-gate loading explanation. Raw storage remained unchanged, with zero writes/removes/provider calls.
- Eight new focused cases: original implementation failed seven; the already-owned retry control passed. Final recovery-access file: 45/45 passed. With both corrected navigation/guide fixtures, focused coverage is 67/67.
- Cases cover both delayed reads, concurrent completion, pending-restore/structural/general-read failures, existing draft retries and a real Back listener setup exception. No automatic focus or navigation; raw and write/provider counters are checked.
- An initial test run exited without a useful assertion; a new-cases run reported SIGKILL. A contradictory test assertion was identified: its isolation helper deliberately focused the recovery host before the test asserted the original focus. The assertion now runs before that helper and compares identity as a boolean. Failed logs are retained; the SIGKILL cause itself is not proven.
- The first full suite finished 16,769/16,776, with seven failures in two older test fixtures. Import navigation lacked `prepend`; the passive subscription guide modeled `window` separately from the VM global and omitted the global `i18n` alias, plus the same DOM capability. Local fixture corrections preserve original navigation/focus and request/anchor regression guards; the failed full log is retained.
- Dot cloud Chromium synthetic preview on port 8788: English status visible above the settings header during a paused first read, then removed when Resume completed normal loading. Chinese status visible during the same pause, then replaced by the existing unloaded-settings warning for a malformed synthetic Work setting. Ordinary controls remained isolated on failure. The page retained focus; no save, download or recovery was performed.
- The preview freezes the 138 production runtime files and uses page-memory synthetic data. Post-workspace configuration/quota delays are covered by automated production-path tests, not claimed as the native preview scenario. Other static headers still use their existing English fallback until localization completes.

This is a loading-experience improvement. It does not establish the cause or repair of the reported 1.1.71 upgrade data-loss incident. Store publication, version changes and GitHub Releases remain frozen.
