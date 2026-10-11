from pathlib import Path
import hashlib,json,zipfile
base=Path(__file__).resolve().parent
files=[base/'acceptance-notes.md',base/'verify.cjs',base/'comparison.json',base/'verifier-output.txt',base/'backend-before.sha256',base/'package-evidence.py']
files+=sorted(base.glob('source-hashes*.json'))+sorted((base/'exports').glob('*.json'))+sorted((base/'evidence').glob('*.png'))
manifest={str(p.relative_to(base)):{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files}
(base/'evidence-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with zipfile.ZipFile(base/'collections-native-sanitized.zip','w',zipfile.ZIP_DEFLATED) as z:
 for p in files+[base/'evidence-manifest.json']:z.write(p,p.relative_to(base))
print('Packaged',len(files)+1,'allowlisted files')
