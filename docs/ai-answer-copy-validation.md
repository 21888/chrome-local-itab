# Copy AI response text — development validation

This ordinary feature retains manifest1.1.96 and is not a release. An explicit
user click copies only the displayed answer or edited task JSON using the existing
clipboard interface. It does not include request/context/endpoint/key fields,
request new permissions, copy in the background, save or clear the response, or
invalidate review. Failure offers manual copying; late completion is fenced.

The frozen eight-file implementation passed2514 Node tests,64 Python tests,
65 focused view tests, syntax/whitespace and runtime build/verification checks.
Native clipboard and received-response flows have not been exercised. Synthetic
clipboard/transport coverage is not proof of real-provider/native clipboard behavior.
Formal release requires accurately bounded native evidence and final identity.
