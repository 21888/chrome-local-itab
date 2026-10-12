# Unicode source-label consistency — development validation

This ordinary fix retains manifest1.1.94 and is not a release. AI source labels
and saved context snapshot labels use the same200-Unicode-code-point limit as
valid collection titles. Full labels are preserved; request/excerpt/question
budgets remain their existing UTF-16 limits. One valid non-BMP collection title
must not block loading the other collections and workspace note.

The frozen three-file implementation passed2493 Node tests,64 Python tests,
38 focused tests and exact112-file packaging. Native Unicode input and resulting
source loading have not been verified. Synthetic mixed-source, code-point and
snapshot regressions do not imply provider or native Unicode-entry coverage.
No new permissions, automatic writes or external requests. Formal publication
requires accurately scoped native evidence and final package identity checks.
