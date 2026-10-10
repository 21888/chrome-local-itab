#!/usr/bin/env python3
"""Build or publish an immutable runtime release; publishing requires GH_TOKEN.

Only the CI publish step receives that token. No credential discovery or saving.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

REPOSITORY = '21888/chrome-local-itab'


def check(value, message):
    if not value:
        raise ValueError(message)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def version_tuple(value):
    check(isinstance(value, str) and re.fullmatch(r'(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)', value), 'Expected three-part numeric version')
    result = tuple(map(int, value.split('.')))
    check(all(x <= 65535 for x in result), 'Chrome version component exceeds 65535')
    return result


def validate_identity(sha, version):
    check(re.fullmatch('[0-9a-f]{40}', sha or ''), 'Expected full commit SHA')
    version_tuple(version)


def notes(sha, version):
    return f'''# Local iTab {version}

Source / 源码: https://github.com/{REPOSITORY}/commit/{sha}

简体中文：下载附件 local-itab-{version}.zip，解压到固定保留的文件夹，打开 chrome://extensions/，开启“开发者模式”，选择“加载已解压的扩展程序”，选中含 manifest.json 的文件夹。打开新标签页即可使用。这不是一键安装包或 Chrome 商店上架证明。升级前备份个人数据；已有手动安装请保留原加载目录，替换运行文件并重新加载。GitHub 的 Source code 下载是完整源码，不是精简运行包。

English: Download local-itab-{version}.zip, extract it into a folder you will keep, open chrome://extensions/, enable Developer mode, select Load unpacked, and choose the folder containing manifest.json. Open a new tab. This is not a one-click installer or evidence of Chrome Web Store publication. Back up your data before upgrading; retain the original loaded folder when replacing runtime files and reload the extension. GitHub's Source code downloads are full source archives, not the runtime package.

The runtime ZIP excludes tests, screenshots, browser profiles, user backups and credentials. 核心本地功能可离线使用；搜索、访问网站及启用的在线功能需要联网。Optional Drive backup in self-packaged installations requires valid extension identity/OAuth configuration and Google authorization; packaging does not validate it.

SHA256SUMS.txt verifies the assets. PROVENANCE.json records the exact source and runtime-file hashes. Automated tests do not replace native browser acceptance. GitHub releases follow versioned master pushes; Chrome Web Store submissions remain consolidated at most once per UTC+08 day. Published files are never replaced.
'''


def build(root, out, sha):
    # Import source execution occurs only in the read-only build job.
    import package_extension as package
    version = json.loads((root / 'manifest.json').read_text())['version']
    validate_identity(sha, version)
    head = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    check(head == sha, 'Checkout differs from event SHA')
    check(not subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain', '--untracked-files=normal'], text=True).strip(), 'Build requires a clean checkout')
    previous = json.loads(subprocess.check_output(['git', '-C', str(root), 'show', 'HEAD^:manifest.json'], text=True))['version']
    old = version_tuple(previous)
    check(version_tuple(version) == (old[0], old[1], old[2] + 1), 'Every release commit must increment the manifest patch version exactly once')
    check(not out.exists(), 'Output directory already exists')
    out.mkdir(parents=True)
    files = package.collect(root)
    archive = out / f'local-itab-{version}.zip'
    package.build(root, archive, files)
    package.verify(archive, files)
    provenance = {'repository': REPOSITORY, 'source_commit': sha, 'version': version,
                  'runtime_count': len(files), 'runtime_sha256': sha256(archive.read_bytes()),
                  'files': {name: sha256(data) for name, data in files.items()}}
    (out / 'PROVENANCE.json').write_text(json.dumps(provenance, sort_keys=True, indent=2) + '\n')
    (out / 'RELEASE-NOTES.md').write_text(notes(sha, version))
    (out / 'SHA256SUMS.txt').write_text(''.join(f'{sha256(p.read_bytes())}  {p.name}\n' for p in sorted(out.iterdir())))
    return provenance


def inspect_bundle(out, sha):
    check(out.is_dir() and not out.is_symlink(), 'Invalid asset directory')
    p = out / 'PROVENANCE.json'
    check(p.is_file() and not p.is_symlink(), 'Missing provenance')
    metadata = json.loads(p.read_text())
    version = metadata['version']
    validate_identity(sha, version)
    check(metadata['source_commit'] == sha and metadata['repository'] == REPOSITORY, 'Source identity mismatch')
    expected = {f'local-itab-{version}.zip', 'PROVENANCE.json', 'RELEASE-NOTES.md', 'SHA256SUMS.txt'}
    check({p.name for p in out.iterdir()} == expected, 'Unexpected or missing release assets')
    check(all(p.is_file() and not p.is_symlink() for p in out.iterdir()), 'Unsafe asset file')
    assets = {p.name: p.read_bytes() for p in out.iterdir()}
    actual_sums = ''.join(f'{sha256(data)}  {name}\n' for name, data in sorted(assets.items()) if name != 'SHA256SUMS.txt')
    check(assets['SHA256SUMS.txt'].decode() == actual_sums, 'Checksum mismatch')
    check(sha256(assets[f'local-itab-{version}.zip']) == metadata['runtime_sha256'], 'Runtime hash mismatch')
    check(assets['RELEASE-NOTES.md'].decode() == notes(sha, version), 'Release notes identity mismatch')
    return version, assets


class GitHub:
    def run(self, args, data=None, missing_ok=False):
        proc = subprocess.run(['gh', *args], input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode:
            # Only a confirmed 404 means absent; auth, network, rate limits fail.
            if missing_ok and b'(HTTP 404)' in proc.stderr:
                return None
            raise RuntimeError('GitHub command failed: ' + proc.stderr.decode(errors='replace'))
        return proc.stdout

    def api(self, path, payload=None, method='GET', missing_ok=False):
        args = ['api', f'repos/{REPOSITORY}/{path}'.rstrip('/'), '--method', method]
        data = None
        if payload is not None:
            args += ['--input', '-']
            data = json.dumps(payload).encode()
        value = self.run(args, data=data, missing_ok=missing_ok)
        return None if value is None else json.loads(value)

    def download(self, asset_id):
        return self.run(['api', f'repos/{REPOSITORY}/releases/assets/{int(asset_id)}', '-H', 'Accept: application/octet-stream'])

    def upload(self, tag, path):
        self.run(['release', 'upload', tag, str(path), '--repo', REPOSITORY])


def tag_commit(api, tag):
    ref = api.api(f'git/ref/tags/{tag}', missing_ok=True)
    if ref is None:
        return None
    obj = ref['object']
    for _ in range(8):
        if obj['type'] == 'commit':
            return obj['sha']
        check(obj['type'] == 'tag', 'Unexpected tag object type')
        obj = api.api('git/tags/' + obj['sha'])['object']
    raise ValueError('Excessively nested tag')


def assets_for(api, release_id):
    result = []
    page = 1
    while True:
        chunk = api.api(f'releases/{int(release_id)}/assets?per_page=100&page={page}')
        result.extend(chunk)
        if len(chunk) < 100:
            return result
        page += 1


def verify_assets(api, release_id, expected, complete):
    found = assets_for(api, release_id)
    check(len({a['name'] for a in found}) == len(found), 'Duplicate remote asset names')
    check({a['name'] for a in found} <= expected.keys(), 'Unexpected remote asset')
    for asset in found:
        data = expected[asset['name']]
        check(asset['state'] == 'uploaded' and asset['size'] == len(data), 'Incomplete or mismatched remote asset')
        check(api.download(asset['id']) == data, 'Existing remote asset differs; refusing overwrite')
    names = {a['name'] for a in found}
    if complete:
        check(names == expected.keys(), 'Missing published assets')
    return names


def find_release(api, tag):
    # List also includes drafts visible to this job; tag lookup alone is not
    # relied upon for recovering an interrupted draft publication.
    page = 1
    while True:
        items = api.api(f'releases?per_page=100&page={page}')
        matches = [r for r in items if r['tag_name'] == tag]
        check(len(matches) <= 1, 'Duplicate releases for a tag')
        if matches:
            return matches[0]
        if len(items) < 100:
            return None
        page += 1


def publish(out, sha, api=None):
    version, expected = inspect_bundle(out, sha)
    api = api or GitHub()
    repo = api.api('')
    check(repo['full_name'] == REPOSITORY and repo['private'] is False and repo['default_branch'] == 'master', 'Repository identity/visibility changed')
    tag = 'v' + version
    target = tag_commit(api, tag)
    check(target is None or target == sha, 'Tag already points to a different commit')
    release = find_release(api, tag)
    if release is not None:
        check(target == sha, 'Existing release is not pinned to expected SHA')
        check(release['tag_name'] == tag and release['body'] == notes(sha, version) and not release['prerelease'], 'Existing release metadata differs')
    if target is None:
        api.api('git/refs', {'ref': 'refs/tags/' + tag, 'sha': sha}, method='POST')
        check(tag_commit(api, tag) == sha, 'Created tag does not match source')
    if release is None:
        release = api.api('releases', {'tag_name': tag, 'target_commitish': sha, 'name': 'Local iTab ' + version,
                                     'body': notes(sha, version), 'draft': True, 'prerelease': False}, method='POST')
    published = not release['draft']
    present = verify_assets(api, release['id'], expected, complete=published)
    if published:
        return release['html_url']  # Same-SHA complete retry is read-only.
    for name in sorted(expected.keys() - present):
        api.upload(tag, out / name)  # No --clobber or delete, ever.
    verify_assets(api, release['id'], expected, complete=True)
    check(tag_commit(api, tag) == sha, 'Tag changed before publication')
    api.api(f"releases/{release['id']}", {'draft': False, 'make_latest': 'legacy'}, method='PATCH')
    final = api.api('releases/tags/' + tag)
    check(not final['draft'] and final['tag_name'] == tag and tag_commit(api, tag) == sha, 'Final publication not verified')
    verify_assets(api, final['id'], expected, complete=True)
    return final['html_url']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['build', 'publish'])
    parser.add_argument('--sha', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--expected-version')
    parser.add_argument('--expected-sha256')
    args = parser.parse_args()
    if args.action == 'build':
        result = build(Path(__file__).resolve().parents[1], args.output.resolve(), args.sha)
        if args.expected_version is not None:
            check(result['version'] == args.expected_version, 'Validated version mismatch')
        if args.expected_sha256 is not None:
            check(result['runtime_sha256'] == args.expected_sha256, 'Validated ZIP hash mismatch')
        if os.environ.get('GITHUB_OUTPUT'):
            with open(os.environ['GITHUB_OUTPUT'], 'a') as output:
                output.write(f"runtime_sha256={result['runtime_sha256']}\nversion={result['version']}\nsource_commit={result['source_commit']}\n")
        print(json.dumps(result))
    else:
        check(os.environ.get('GITHUB_REPOSITORY') == REPOSITORY, 'Unexpected repository context')
        check(os.environ.get('GITHUB_REF') == 'refs/heads/master' and os.environ.get('GITHUB_EVENT_NAME') == 'push', 'Publish requires a master push')
        check(args.sha == os.environ.get('GITHUB_SHA'), 'Source differs from event SHA')
        print(publish(args.output.resolve(), args.sha))


if __name__ == '__main__':
    main()
