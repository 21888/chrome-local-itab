# Original-template shortcut toolbar

## Observed issue and scope

The published 1.1.116 Chinese-light Clarity screenshot showed the shortcut heading, layout selector, saved-site finder, organizer and discovery button stacked in a tall column. `newtab.css` supplies `flex-direction: column`; the original-template overrides set wrapping and alignment without overriding the direction. The eighteen newer templates already use a row with wrapping.

The repair applies the same compact, wrapping direction to Clarity, Graphite and Folio only. Direct children may shrink to the available width and wrap long text. It does not hide controls, alter their DOM order, change handlers, add permissions or write data. The other eighteen templates and free-layout positions are unchanged.

## Verification boundaries

The focused tests check a static contract for the two exact scoped rules, required properties, and basic negative mutations including a later direction declaration in the same rule. They are not a complete CSS cascade engine and do not prove rendered geometry or arbitrary later overrides. Native checks are required for wrapping, focus, overlap and control usability.

Final frozen-source strict serial Node regression passed 2825/2825 with a 1 GiB heap, including the strengthened static contract; Python passed81/81. Runtime package verification passed113 files; initial native A/B/C Chinese-light100%/200% verified readable compact row/wrapping but exposed clipped outer focus rings, addressed below. Current README captures correctly remain photographs of released116 before this repair, and will be reconsidered when the interface change is released.

## Follow-up: preserve outside focus rings

The first compact-toolbar native check at 200% browser zoom showed the right edge of the discovery button's outside focus outline clipped at the shortcut section boundary. The label and action remained accessible; this is a visual focus defect, not a claim that the button was unusable.

The original three templates now reserve a constant six pixels of toolbar padding, matching the maximum existing outside outline width plus offset. Padding applies in the ordinary state so focusing does not change layout. The shortcut section's clipping, free-layout behavior and shared focus styling are unchanged. Targeted static contracts reject missing or later-zero padding; they do not establish browser geometry. Frozen follow-up regression passed2828/2828 strict serial Node tests with a1GiB heap and81/81 Python tests. Six focused static tests, syntax/diff checks and113-file package verification passed; independent scope review found no blocker. Limited native confirmation passed: Clarity light/dark100%/200% first/last focus rings complete, no focus-time displacement, Discover Enter/Escape correct; Graphite/Folio light100% representative controls/cards readable. B/C dark and renewed200% focus-specific checks, other18 templates and true narrow viewports were not covered. Baseline restored with no content writes.
