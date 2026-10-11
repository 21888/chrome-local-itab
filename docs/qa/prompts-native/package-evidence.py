"""Allowlist-only synthetic QA packaging. Never includes profile, browser logs or executables."""
from pathlib import Path
import hashlib,json,zipfile
root=Path(__file__).resolve().parent
allowed=[root/'acceptance-notes.md',root/'verify.cjs',root/'comparison.json',root/'package-evidence.py']
allowed += sorted((root/'evidence').glob('*.jpg'))
allowed += [root/'exports'/n for n in ['source-a.json','changed-b.json','restored-c.json','recovery-b.json']]
assert all(p.is_file() for p in allowed)
manifest={str(p.relative_to(root)):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in allowed}
(root/'evidence-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(root/'prompt-library-native-sanitized.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in allowed+[root/'evidence-manifest.json']:z.write(p,p.relative_to(root))
print('Packaged',len(allowed)+1,'allowlisted files')
