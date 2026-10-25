"""Build a local synthetic Options fixture; never modify repository runtime."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path, help='New directory outside the checkout')
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or ROOT in output.parents or output.exists():
        parser.error('Output must be a new directory outside the checkout; existing data is never overwritten')
    spec = importlib.util.spec_from_file_location('runtime_pack', ROOT / 'tools/package_extension.py')
    package = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(package)
    output.mkdir(parents=True)
    hashes = {}
    for name in package.RUNTIME_FILES:
        source = ROOT / name
        if source.is_symlink() or not source.is_file():
            raise ValueError(f'Runtime must be a regular repository file: {name}')
        dest = output / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, dest)
        hashes[name] = hashlib.sha256(source.read_bytes()).hexdigest()
    subprocess.run(['node', str(HERE / 'seed.cjs'), str(ROOT), str(output)], check=True, cwd=ROOT)
    catalog = json.loads((ROOT / '_locales/en/messages.json').read_text())
    (output / 'qa-data.js').write_text('window.QA_CATALOG=' + json.dumps(catalog, ensure_ascii=False) + ';\n')
    shutil.copyfile(HERE / 'bridge.js', output / 'qa-bridge-rich2.js')
    shutil.copyfile(HERE / 'hooks.js', output / 'qa-hooks.js')
    html = (ROOT / 'options.html').read_text()
    if html.count('<head>') != 1 or html.count('<script src="options.js"></script>') != 1:
        raise ValueError('Options script entry changed; review fixture injection first')
    html = html.replace('<head>', '<head>\n<script src="qa-data.js"></script><script src="qa-rich2-data.js"></script><script src="qa-bridge-rich2.js"></script>', 1)
    html = html.replace('<script src="options.js"></script>', '<script src="qa-hooks.js"></script>\n<script src="options.js"></script>', 1)
    (output / 'options-rich2.html').write_text(html)
    (output / 'evidence').mkdir()
    revision = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True, text=True)
    provenance = {'sourceCommit': revision.stdout.strip() if revision.returncode == 0 else None,
                  'runtimeSha256': hashes, 'syntheticStorageOnly': True,
                  'note': 'Reproducible packaging adaptation; not a claim of rerun native acceptance',
                  'fixtureSha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in output.iterdir() if p.is_file() and p.name.startswith(('qa-', 'options-rich2', 'seed-', 'synthetic-import'))}}
    (output / 'BUILD-PROVENANCE.json').write_text(json.dumps(provenance, indent=2))
    print(f'Built {len(hashes)} unchanged runtime files plus synthetic fixture at {output}')

if __name__ == '__main__':
    main()
