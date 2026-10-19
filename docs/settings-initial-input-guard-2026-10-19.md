# Protect Settings input during its first asynchronous load

## Reproduction and evidence limits

The statically active Appearance panel exposes the 12-hour-format checkbox before Settings has loaded. A real delayed storage read allowed that checkbox to accept a change while no form owner existed. When the read resumed, production population replaced the change with the saved value and established a clean baseline. No storage write was needed to lose that unsaved input.

An initial probe used the quote field in an inactive tab. Its minimal DOM did not prove native first-screen reachability; that probe and limitation are preserved separately and are not the basis for this fix. The replacement test checks the actual active Appearance markup and CSS, then exercises its visible checkbox. The old committed Options script fails this test.

## Narrow first-load gate

Before the first initialization await, make only the original normal main/footer regions inert when no Settings form owner exists. Record each original inert state without changing individual controls' disabled states. Do not include an interrupted-recovery host.

A shared count tracks overlapping startup calls. Only after the last call settles can the gate restore its original regions and states. A verified form owner must exist and neither the persistent unloaded-form notice nor interrupted-recovery view may be present. Failed initialization therefore retains its existing protection. Regions added after the snapshot are untouched. A later initialization with an already owned form does not lock its existing drafts.

The existing Back initialization guard uses the same pending count, so an earlier finally cannot prematurely release navigation while another startup is still reading. No store, restore, Sync or provider protocol changes are made.

## Validation

- Focused real-startup tests: 37/37 passed. Old committed Options script: 30 passed, 7 failed.
- The eight added cases cover the visible checkbox, original inert true/false, pre-disabled controls, overlapping real reads, failed ordinary and recovery paths, newly created recovery hosts and an already owned draft. Raw state stays unchanged, with zero writes, removals, provider calls, repairs or navigation requests.
- Native dot-cloud Chromium used a visible preview-only Resume button to pause the first synthetic RAM read. Clicking the visible 12-hour checkbox during the pause did not check or focus it; it was excluded from the accessibility tree. After Resume and production initialization, the checkbox was exposed and a native click changed its value.
- That checkbox already participates in delayed autosave. A later successful Back navigation is not counted as evidence of an unsaved-draft guard or of disk persistence. The destination preview starts a new synthetic fixture.
- All 138 runtime file hashes matched the frozen native preview. Final serial full suite: 16,768/16,768 passed, zero failures/cancellations. Python: 84/84 passed; the 138-file runtime package passed static checks.

This does not diagnose or repair the historical upgrade data-loss incident. Synthetic storage and preview evidence are not installed-extension upgrade certification. Release/version/store-update gates remain unchanged.
