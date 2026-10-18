#!/usr/bin/env python3
"""Reproduce the pinned, scoped component CSS offline; never installs packages.

Usage: python3 tools/build_bulma_subset.py --sass /path/node_modules/sass/sass.js
The default verifies exact bytes. --write replaces only the expected runtime CSS,
after compiler/source integrity checks and comparison with the pinned output hash.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify_source(provenance):
    expected = {**provenance['upstream_sources'],
                provenance['entrypoint']: provenance['entrypoint_sha256'],
                'vendor/bulma/LICENSE': provenance['license_sha256']}
    for name, sha256 in expected.items():
        if digest(ROOT / name) != sha256:
            raise ValueError('Pinned source changed: ' + name)


def verify_scope(css):
    # Compiler output is expanded, flat CSS with optional media containers.
    # This is a build contract, not a browser layout/cascade simulation.
    without_comments = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    for match in re.finditer(r'([^{}]+)\{', without_comments):
        selector = match.group(1).strip()
        if selector.startswith('@media '):
            continue
        if not selector.startswith(':where(:root[data-dashboard-template=clarity])') and not selector.startswith(':where(:root[data-dashboard-template=clarity][data-color-mode=dark])'):
            raise ValueError('Unexpected unscoped selector: ' + selector)
    if re.search(r'@(?:import|font-face)|data-theme|https?://|url\(', without_comments):
        raise ValueError('Unexpected runtime resource or alternate theme')
    for variable in re.findall(r'--([\w-]+)', without_comments):
        if not variable.startswith('itab-b-'):
            raise ValueError('Unexpected unprefixed variable: ' + variable)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sass', type=Path, required=True)
    parser.add_argument('--write', action='store_true')
    args = parser.parse_args()
    sass = args.sass.resolve()
    provenance = json.loads((ROOT / 'vendor/bulma/PROVENANCE.json').read_text())
    package = json.loads((sass.parent / 'package.json').read_text())
    if package.get('name') != 'sass' or package.get('version') != provenance['compiler']['version']:
        raise ValueError('Dart Sass 1.86.3 is required')
    for name, version in [('chokidar', '4.0.3'), ('immutable', '5.1.1'), ('source-map-js', '1.2.1'), ('readdirp', '4.1.2')]:
        installed = json.loads((sass.parent.parent / name / 'package.json').read_text())
        if installed.get('version') != version:
            raise ValueError('Pinned compiler dependency required: ' + name + '@' + version)
    verify_source(provenance)
    with tempfile.TemporaryDirectory(prefix='itab-bulma-') as directory:
        output = Path(directory) / 'clarity-components.css'
        subprocess.run(['node', '--max-old-space-size=512', str(sass),
                        '--load-path=' + str(ROOT / 'vendor/bulma/upstream'),
                        '--style=expanded', '--no-source-map', '--no-charset',
                        str(ROOT / provenance['entrypoint']), str(output)], check=True, cwd=ROOT)
        css = output.read_text()
        verify_scope(css)
        if digest(output) != provenance['output_sha256']:
            raise ValueError('Generated CSS does not match the pinned output')
        destination = ROOT / provenance['output']
        if args.write:
            destination.write_bytes(output.read_bytes())
        elif destination.read_bytes() != output.read_bytes():
            raise ValueError('Runtime CSS differs from the reproducible output')
        print('Bulma 1.0.4 subset verified: ' + digest(output))


if __name__ == '__main__':
    main()
