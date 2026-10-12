# 1.1.88 batch release provenance and verification

This batch combines two independent feature commits after published v1.1.87:

- Active filter chips: 12d4317407df3a0de1472825a5570b97b68a0c68.
- AI input feedback: 0524ca0a929046410cf2745c3909fc556401bcb3.

Both ordinary commits retained manifest 1.1.87 and ran CI without publication.
The second combined tree passed 2404 Node and 64 Python tests, also verified in
its exact-source remote CI. This separate release commit changes only manifest
87→88 and release documentation; baseline tag v1.1.87 resolves to
37ac420590e472b2f0e0cfe6e3ba346ef53892f7. Maintenance commits are not feature counts.

Feature-native evidence remains scoped in navigation-active-filters-validation.md
and ai-input-budget-validation.md. Their tests ran on exact development hashes,
not on a separately claimed complete version-88 native matrix.

## Final identity smoke — 2026-10-12

The exact 112-file 1.1.88 ZIP SHA-256 is
`1d92e0f23a02efc7ee9d1eb4fc8e58735b52f739ad86a24d07c444c4ee803f20`.
Every path matches the second development ZIP
`48afc29ca2eb35491e42545d2bfb3360baa12ecb11da023760d3dfb9397862ce`;
only manifest.json differs. This final documentation update preserves the ZIP.

Independent Chrome for Testing 155.0.8059.39 Chinese synthetic profile performed
ordinary Reload and visibly showed 1.1.88. A fresh tab showed the expected
fourteen saved sites. The AI panel showed zero selected/question and prompt279,
with UTF-16 explanation. Navigation showed 114/100 not added/14 added; OpenAI
company chip remained visible with advanced controls collapsed and one ChatGPT
result. Both panels closed without writes. Clarity light/Grid and prior category
counts were restored.

This is final identity and minimal feature-presence verification, not a repeat of
all earlier native paths or new boundary certification. No provider configuration,
Allow/Send, external links, new permissions or data writes. Screenshots remain
transcript evidence, not release attachments. GitHub publication and asset identity
require the later exact-source CI/release checks.
