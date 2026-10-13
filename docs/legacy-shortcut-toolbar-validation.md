# Original-template shortcut toolbar

## Observed issue and scope

The published 1.1.116 Chinese-light Clarity screenshot showed the shortcut heading, layout selector, saved-site finder, organizer and discovery button stacked in a tall column. `newtab.css` supplies `flex-direction: column`; the original-template overrides set wrapping and alignment without overriding the direction. The eighteen newer templates already use a row with wrapping.

The repair applies the same compact, wrapping direction to Clarity, Graphite and Folio only. Direct children may shrink to the available width and wrap long text. It does not hide controls, alter their DOM order, change handlers, add permissions or write data. The other eighteen templates and free-layout positions are unchanged.

## Verification boundaries

The focused tests check a static contract for the two exact scoped rules, required properties, and basic negative mutations including a later direction declaration in the same rule. They are not a complete CSS cascade engine and do not prove rendered geometry or arbitrary later overrides. Native checks are required for wrapping, focus, overlap and control usability.

Final frozen-source strict serial Node regression passed 2825/2825 with a 1 GiB heap, including the strengthened static contract; Python passed81/81. Runtime package verification passed113 files; native validation is pending. Current README captures correctly remain photographs of released116 before this repair, and will be reconsidered when the interface change is released.
