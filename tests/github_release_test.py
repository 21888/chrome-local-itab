import copy
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import github_release as release

SHA = 'a' * 40
VERSION = '1.1.8'
TAG = 'v' + VERSION


def bundle(out):
    out.mkdir()
    archive = b'trusted canonical test archive'
    (out / f'local-itab-{VERSION}.zip').write_bytes(archive)
    (out / 'PROVENANCE.json').write_text(json.dumps({'version': VERSION, 'source_commit': SHA, 'repository': release.REPOSITORY, 'runtime_sha256': release.sha256(archive)}))
    (out / 'RELEASE-NOTES.md').write_text(release.notes(SHA, VERSION))
    (out / 'SHA256SUMS.txt').write_text(''.join(f'{release.sha256(p.read_bytes())}  {p.name}\n' for p in sorted(out.iterdir())))


class FakeGitHub:
    def __init__(self):
        self.target = None
        self.release = None
        self.assets = {}
        self.mutations = []
        self.private = False
        self.fail_upload_once = False

    def api(self, path, payload=None, method='GET', missing_ok=False):
        if method != 'GET':
            self.mutations.append((method, path, copy.deepcopy(payload)))
        if path == '':
            return {'full_name': release.REPOSITORY, 'private': self.private, 'default_branch': 'master'}
        if path.startswith('git/ref/tags/'):
            return None if self.target is None else {'object': {'type': 'commit', 'sha': self.target}}
        if path == 'git/refs' and method == 'POST':
            if self.target:
                raise RuntimeError('Already exists')
            self.target = payload['sha']
            return {}
        if path.startswith('releases?'):
            return [] if self.release is None else [copy.deepcopy(self.release)]
        if path == 'releases' and method == 'POST':
            self.release = dict(payload, id=42, html_url='https://github.com/' + release.REPOSITORY + '/releases/tag/' + TAG)
            return copy.deepcopy(self.release)
        if path.startswith('releases/42/assets?'):
            return [{'id': i, 'name': name, 'state': 'uploaded', 'size': len(data)} for i, (name, data) in enumerate(self.assets.items())]
        if path == 'releases/42' and method == 'PATCH':
            self.release.update(payload)
            return copy.deepcopy(self.release)
        if path == 'releases/tags/' + TAG:
            return copy.deepcopy(self.release)
        raise AssertionError(path)

    def download(self, asset_id):
        return list(self.assets.values())[asset_id]

    def upload(self, tag, path):
        if self.fail_upload_once:
            self.fail_upload_once = False
            raise RuntimeError('Simulated transport failure')
        if path.name in self.assets:
            raise AssertionError('Overwrite attempted')
        self.mutations.append(('UPLOAD', path.name, None))
        self.assets[path.name] = path.read_bytes()


class ReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.out = Path(self.temp.name) / 'assets'
        bundle(self.out)
        self.api = FakeGitHub()

    def test_build_identity_versions(self):
        for v in ['01.1.8', '1.1', '1.1.8/x', '1.1.65536', 'v1.1.8']:
            with self.subTest(v=v), self.assertRaises(ValueError):
                release.version_tuple(v)
        self.assertEqual(release.version_tuple(VERSION), (1, 1, 8))

    def test_inspect_bundle(self):
        version, assets = release.inspect_bundle(self.out, SHA)
        self.assertEqual(version, VERSION)
        self.assertEqual(len(assets), 4)

    def test_wrong_sha(self):
        with self.assertRaises(ValueError):
            release.publish(self.out, 'b' * 40, self.api)
        self.assertFalse(self.api.mutations)

    def test_tampered_asset(self):
        (self.out / f'local-itab-{VERSION}.zip').write_bytes(b'changed')
        with self.assertRaises(ValueError):
            release.publish(self.out, SHA, self.api)
        self.assertFalse(self.api.mutations)

    def test_unexpected_asset(self):
        (self.out / 'secret.txt').write_text('not uploaded')
        with self.assertRaises(ValueError):
            release.publish(self.out, SHA, self.api)
        self.assertFalse(self.api.mutations)

    def test_symlink_asset(self):
        target = self.out / 'RELEASE-NOTES.md'
        saved = Path(self.temp.name) / 'notes.md'
        target.rename(saved)
        target.symlink_to(saved)
        with self.assertRaises(ValueError):
            release.publish(self.out, SHA, self.api)

    def test_private_repo_no_mutations(self):
        self.api.private = True
        with self.assertRaises(ValueError):
            release.publish(self.out, SHA, self.api)
        self.assertFalse(self.api.mutations)

    def test_different_sha_tag_no_mutations(self):
        self.api.target = 'b' * 40
        with self.assertRaisesRegex(ValueError, 'different commit'):
            release.publish(self.out, SHA, self.api)
        self.assertFalse(self.api.mutations)

    def test_create_verify_publish(self):
        self.assertIn(TAG, release.publish(self.out, SHA, self.api))
        self.assertFalse(self.api.release['draft'])
        self.assertEqual(self.api.target, SHA)
        self.assertEqual(len(self.api.assets), 4)
        self.assertEqual(self.api.mutations[0][1], 'git/refs')
        self.assertEqual(self.api.mutations[1][2]['draft'], True)
        self.assertEqual(self.api.mutations[-1], ('PATCH', 'releases/42', {'draft': False, 'make_latest': 'legacy'}))

    def test_same_sha_retry_is_read_only(self):
        release.publish(self.out, SHA, self.api)
        self.api.mutations.clear()
        release.publish(self.out, SHA, self.api)
        self.assertFalse(self.api.mutations)

    def test_partial_draft_resumes(self):
        self.api.fail_upload_once = True
        with self.assertRaises(RuntimeError):
            release.publish(self.out, SHA, self.api)
        self.assertTrue(self.api.release['draft'])
        release.publish(self.out, SHA, self.api)
        self.assertFalse(self.api.release['draft'])
        self.assertEqual(sum(path == 'git/refs' for _, path, _ in self.api.mutations), 1)

    def test_existing_bad_bytes_not_overwritten(self):
        release.publish(self.out, SHA, self.api)
        name = next(iter(self.api.assets))
        self.api.assets[name] = b'x' * len(self.api.assets[name])
        self.api.mutations.clear()
        with self.assertRaises(ValueError):
            release.publish(self.out, SHA, self.api)
        self.assertFalse(self.api.mutations)

    def test_missing_published_asset_is_not_repaired_silently(self):
        release.publish(self.out, SHA, self.api)
        self.api.assets.pop(next(iter(self.api.assets)))
        self.api.mutations.clear()
        with self.assertRaises(ValueError):
            release.publish(self.out, SHA, self.api)
        self.assertFalse(self.api.mutations)

    def test_mismatched_draft_metadata(self):
        self.api.fail_upload_once = True
        with self.assertRaises(RuntimeError):
            release.publish(self.out, SHA, self.api)
        self.api.release['body'] = 'another release'
        self.api.mutations.clear()
        with self.assertRaises(ValueError):
            release.publish(self.out, SHA, self.api)
        self.assertFalse(self.api.mutations)

    def test_no_errors_misclassified_as_absence(self):
        for error in [b'network unavailable', b'(HTTP 403)', b'(HTTP 429)']:
            with self.subTest(error=error), patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, b'', error)):
                with self.assertRaises(RuntimeError):
                    release.GitHub().api('example', missing_ok=True)
        with patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 1, b'', b'Not Found (HTTP 404)')):
            self.assertIsNone(release.GitHub().api('example', missing_ok=True))

    def test_upload_never_clobbers(self):
        with patch.object(subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, b'', b'')) as run:
            release.GitHub().upload(TAG, self.out / 'SHA256SUMS.txt')
        self.assertNotIn('--clobber', run.call_args[0][0])

    def test_workflow_guards(self):
        workflow = (ROOT / '.github/workflows/release.yml').read_text()
        self.assertEqual(workflow.count('contents: write'), 1)
        self.assertEqual(workflow.count('persist-credentials: false'), 2)
        self.assertEqual(workflow.count("github.event.repository.private == false"), 2)
        self.assertNotIn('\nconcurrency:', workflow)
        self.assertNotIn('schedule:', workflow)
        self.assertNotIn('actions/upload-artifact', workflow)
        self.assertNotIn('actions/download-artifact', workflow)
        self.assertNotIn('actions/cache', workflow)
        self.assertIn('--expected-sha256', workflow)
        self.assertIn('needs.validate.outputs.source_commit', workflow)

    def test_build_actual_clean_commit(self):
        root = Path(self.temp.name) / 'repo'
        root.mkdir()
        (root / 'manifest.json').write_text('{"version":"1.1.7"}')
        def git(*args):
            return subprocess.check_output(['git', '-C', str(root), *args], stderr=subprocess.DEVNULL, text=True).strip()
        record = root / 'docs/releases/1.1.8.md'
        record.parent.mkdir(parents=True)
        record.write_text((ROOT / 'docs/releases/1.1.8.md').read_text())
        git('init', '-q');git('add', '.')
        git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base')
        (root / 'manifest.json').write_text('{"version":"1.1.8"}')
        git('add', '.');git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'next')
        import package_extension
        fake_files = {'manifest.json': (root / 'manifest.json').read_bytes()}
        with patch.object(package_extension, 'collect', return_value=fake_files):
            metadata = release.build(root, Path(self.temp.name) / 'built', git('rev-parse', 'HEAD'))
        self.assertEqual(metadata['runtime_count'], 1)
        release.inspect_bundle(Path(self.temp.name) / 'built', git('rev-parse', 'HEAD'))


if __name__ == '__main__':
    unittest.main()
