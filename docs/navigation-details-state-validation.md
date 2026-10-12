# Navigation details state — development validation

This ordinary feature retains manifest1.1.93 and is not a release. Expanded
site details are retained by stable site identity within the current dialog
across selection, target changes and filtering rerenders. Closing and reopening
starts a fresh session. Detached-node events cannot overwrite current state.
No persistent storage or permission is introduced.

The frozen two-file implementation passed2483 Node and64 Python tests. Five new
regressions failed on the old baseline and passed after the change. Runtime
packaging retains112 files. Native verification is pending; synthetic toggle
and focus handling does not establish full browser/accessibility behavior.
Formal release remains gated on bounded native and final runtime identity checks.
