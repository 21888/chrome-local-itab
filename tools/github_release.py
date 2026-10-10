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


def notes(sha, version, root=None, *, historical=False):
    validate_identity(sha, version)
    root = root or Path(__file__).resolve().parents[1]
    record = root / 'docs' / 'releases' / f'{version}.md'
    check(record.is_file() and not record.is_symlink(), f'Missing source-controlled change record: {version}')
    changes = record.read_text().strip()
    check(all(section in changes for section in ('## 新增', '## 修复', '## 注意事项', '## English')), 'Change record lacks required sections')
    check(40 <= len(changes) <= 16000, 'Invalid change record length')
    historical_note = ('\n历史说明补充：本页新增版本改动说明；已发布附件中的 RELEASE-NOTES.md 与校验文件保留原样。\nHistorical web-note update: downloadable notes, checksums and all other assets remain unchanged.\n' if historical else '')
    # Keep historical release-body regeneration byte-for-byte unchanged.
    upgrade_guidance = ''
    if version_tuple(version) >= (1, 1, 17):
        guide = f'https://github.com/{REPOSITORY}/blob/{sha}/docs/version-updates.md'
        upgrade_guidance = f"""
### 已有解压安装升级 / Upgrade an existing unpacked installation

先保存打开页面中的编辑。设置 JSON 和 Drive 快照不含待办、专注、便笺或倒计时：待办单独导出 JSON，便笺和倒计时分别导出文本；专注偏好需手动记录，会话不可迁移。便笺须从包含要保留文本的原标签页导出，尤其是未保存或冲突草稿。将运行文件 ZIP 解压后的内容替换到最初加载的固定目录内，保持 manifest.json 位于目录根部；不要移除扩展或加载新目录，更换目录可能改变扩展身份并导致原数据无法访问。重新加载扩展后，刷新打开的新标签页和设置页，确认版本与原有数据。[完整备份与更新步骤]({guide})。

Save edits in open pages first. Settings JSON and Drive snapshots exclude Tasks, Focus, Scratchpad and Countdown: export Tasks as JSON and Scratchpad/Countdown as separate text files; record Focus preferences manually, as sessions cannot be migrated. Export Scratchpad from the existing tab containing the text to keep, especially an unsaved or conflicted draft. Replace files with the extracted runtime ZIP contents inside the original permanent loaded folder, with manifest.json at its root. Do not remove the extension or load a new folder; changing folders may change its identity and make existing data inaccessible. After reloading the extension, refresh open new-tab and Settings pages and verify the version and existing data. [Full backup and upgrade steps]({guide}).
"""
    return f'''# Local iTab {version}

{changes}
{historical_note}
Source / 源码: https://github.com/{REPOSITORY}/commit/{sha}

SHA256SUMS.txt 校验附件；PROVENANCE.json 记录准确源码及运行文件哈希。自动化测试不替代原生浏览器验收或 Chrome 商店审核。

## 安装 / Installation

下载 local-itab-{version}.zip，解压到固定保留的文件夹，打开 chrome://extensions/，开启“开发者模式”，选择“加载已解压的扩展程序”，选中含 manifest.json 的文件夹。升级前备份个人数据；已有手动安装请保留原加载目录，替换运行文件并重新加载。GitHub 的 Source code 是完整源码，运行 ZIP 不是一键安装程序。

Download local-itab-{version}.zip, extract it to a folder you retain, open chrome://extensions/, enable Developer mode, choose Load unpacked and select the folder containing manifest.json. Back up your data before upgrading; retain the original loaded folder and reload after replacing runtime files. GitHub Source code archives differ from the runtime ZIP. This is not a one-click installer or proof of Chrome Web Store publication.

核心本地功能可离线使用，在线功能需要联网。Optional Drive backup for unpacked installs requires valid extension identity/OAuth configuration and Google authorization; packaging does not validate it.
{upgrade_guidance}'''


def build(root, out, sha):
    # Packaging runs before the publication step receives GH_TOKEN.
    import package_extension as package
    version = json.loads((root / 'manifest.json').read_text())['version']
    validate_identity(sha, version)
    body = notes(sha, version, root)
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
    (out / 'RELEASE-NOTES.md').write_text(body)
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


# This one-time migration is intentionally not a generic release-edit interface.
BACKFILL_TARGETS = {
    '1.1.8': (408922236, 'bddd9f87c314e84baf1d62a4b7f4adbf23990770'),
    '1.1.9': (408923713, 'e348f7721f7e6ebd5cd4c4436091b3d6cdea6e23'),
    '1.1.10': (408928285, 'e296eea65605627c911871c0382069e6210e4bbc'),
}


def load_backfill(root):
    plan = json.loads((root / 'tools/release_body_backfill.json').read_text())
    check(len(plan) == 3 and {x['version'] for x in plan} == BACKFILL_TARGETS.keys(), 'Unexpected backfill targets')
    for item in plan:
        check((item['release_id'], item['source_commit']) == BACKFILL_TARGETS[item['version']], 'Backfill identity mismatch')
        check(re.fullmatch('[0-9a-f]{64}', item['original_body_sha256']), 'Invalid original body hash')
        expected_names = {f"local-itab-{item['version']}.zip", 'PROVENANCE.json', 'RELEASE-NOTES.md', 'SHA256SUMS.txt'}
        check(item['assets'].keys() == expected_names, 'Unexpected backfill asset set')
        for asset in item['assets'].values():
            check(re.fullmatch('[0-9a-f]{64}', asset['sha256']) and isinstance(asset['bytes'], int) and asset['bytes'] > 0, 'Invalid asset guard')
    return plan


def historical_state(api, item, desired):
    tag = 'v' + item['version']
    check(tag_commit(api, tag) == item['source_commit'], 'Historical tag source mismatch')
    current = api.api(f"releases/{item['release_id']}")
    check(current['id'] == item['release_id'] and current['tag_name'] == tag and not current['draft'] and not current['prerelease'], 'Historical release identity mismatch')
    body_hash = sha256(current['body'].encode())
    check(body_hash in (item['original_body_sha256'], sha256(desired.encode())), 'Historical body was edited unexpectedly')
    assets = assets_for(api, item['release_id'])
    check(len(assets) == 4 and {a['name'] for a in assets} == item['assets'].keys(), 'Historical asset set differs')
    for asset in assets:
        guard = item['assets'][asset['name']]
        check(asset['state'] == 'uploaded' and asset['size'] == guard['bytes'], 'Historical asset metadata differs')
        data = api.download(asset['id'])
        check(len(data) == guard['bytes'] and sha256(data) == guard['sha256'], 'Historical asset bytes differ')
    return current, [(a['id'], a['name'], a['size']) for a in assets]


def backfill(root, out, sha, api=None):
    version, _ = inspect_bundle(out, sha)
    check(version == '1.1.11', 'Backfill is restricted to the 1.1.11 release workflow')
    api = api or GitHub()
    repo = api.api('')
    check(repo['full_name'] == REPOSITORY and repo['private'] is False and repo['default_branch'] == 'master', 'Repository identity/visibility changed')
    plan = load_backfill(root)
    prepared = []
    # Preflight all three before changing any body. A retry accepts only the
    # exact original or exact desired text and always rechecks original assets.
    for item in plan:
        desired = notes(item['source_commit'], item['version'], root, historical=True)
        current, assets = historical_state(api, item, desired)
        prepared.append((item, desired, current, assets))
    for item, desired, before, before_assets in prepared:
        endpoint = f"releases/{item['release_id']}"
        current = api.api(endpoint)
        check(current['body'] == before['body'], 'Historical body changed during preflight')
        if current['body'] != desired:
            api.api(endpoint, {'body': desired}, method='PATCH')
        after, after_assets = historical_state(api, item, desired)
        check(after['body'] == desired, 'Backfill text not verified')
        check(sorted(before_assets) == sorted(after_assets), 'Backfill changed asset identities')
        for field in ('id', 'tag_name', 'name', 'draft', 'prerelease', 'target_commitish'):
            check(after.get(field) == before.get(field), 'Backfill changed release identity')
    return ['v' + item['version'] for item in plan]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['build', 'publish', 'backfill'])
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
        if args.action == 'publish':
            print(publish(args.output.resolve(), args.sha))
        else:
            print(backfill(Path(__file__).resolve().parents[1], args.output.resolve(), args.sha))


if __name__ == '__main__':
    main()
