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
    (out / 'PROVENANCE.json').write_text(json.dumps({'version': VERSION, 'source_commit': SHA, 'repository': release.REPOSITORY, 'runtime_sha256': release.sha256(archive), 'release_plan': {'release': True, 'version': VERSION, 'source_commit': SHA, 'base_tag': 'v1.1.7', 'base_commit': 'b' * 40}}))
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
        if path == 'git/ref/tags/v1.1.7':
            return {'object': {'type': 'commit', 'sha': 'b' * 40}}
        if path == 'releases/tags/v1.1.7':
            return {'id': 41, 'tag_name': 'v1.1.7', 'draft': False, 'prerelease': False}
        if path.startswith('releases/41/assets?'):
            return [{'name': name, 'state': 'uploaded', 'size': 100} for name in ('local-itab-1.1.7.zip', 'PROVENANCE.json', 'RELEASE-NOTES.md', 'SHA256SUMS.txt')]
        if path.startswith('git/ref/tags/'):
            return None if self.target is None else {'object': {'type': 'commit', 'sha': self.target}}
        if path == 'git/refs' and method == 'POST':
            if self.target:
                raise RuntimeError('Already exists')
            self.target = payload['sha']
            return {'ref': payload['ref'], 'object': {'type': 'commit', 'sha': self.target}}
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

    def post_create_reads(self, results, creation=None):
        original = self.api.api
        reads = []
        def api(path, payload=None, method='GET', missing_ok=False):
            if path == 'git/ref/tags/' + TAG and self.api.target is not None:
                reads.append(path)
                if results:
                    value = results.pop(0)
                    if isinstance(value, Exception):
                        raise value
                    return value
            value = original(path, payload, method, missing_ok)
            return creation(value) if path == 'git/refs' and method == 'POST' and creation else value
        self.api.api = api
        return reads

    def test_post_create_missing_then_correct(self):
        reads = self.post_create_reads([None, None])
        with patch.object(release.time, 'sleep') as sleep:
            release.publish(self.out, SHA, self.api)
        self.assertEqual(sleep.call_args_list, [unittest.mock.call(1), unittest.mock.call(1)])
        self.assertEqual(len(reads), 5)  # Three admission reads plus pre/post-publication guards.
        self.assertEqual(sum(path == 'git/refs' for _, path, _ in self.api.mutations), 1)
        self.assertFalse(self.api.release['draft'])

    def test_post_create_persistently_missing_stops_before_release(self):
        reads = self.post_create_reads([None] * 4)
        with patch.object(release.time, 'sleep') as sleep, self.assertRaisesRegex(ValueError, 'not visible'):
            release.publish(self.out, SHA, self.api)
        self.assertEqual(len(reads), 3)
        self.assertEqual(sleep.call_count, 2)
        self.assertEqual([path for _, path, _ in self.api.mutations], ['git/refs'])
        self.assertIsNone(self.api.release)

    def test_post_create_wrong_target_fails_without_retry(self):
        reads = self.post_create_reads([{'object': {'type': 'commit', 'sha': 'c' * 40}}])
        with patch.object(release.time, 'sleep') as sleep, self.assertRaisesRegex(ValueError, 'does not match'):
            release.publish(self.out, SHA, self.api)
        self.assertEqual(len(reads), 1)
        sleep.assert_not_called()
        self.assertEqual([path for _, path, _ in self.api.mutations], ['git/refs'])

    def test_post_create_error_after_absence_is_not_retried(self):
        for message in ['HTTP 403', 'HTTP 429', 'transport failure']:
            with self.subTest(message=message):
                self.api = FakeGitHub()
                reads = self.post_create_reads([None, RuntimeError(message)])
                with patch.object(release.time, 'sleep') as sleep, self.assertRaisesRegex(RuntimeError, message):
                    release.publish(self.out, SHA, self.api)
                self.assertEqual(len(reads), 2)
                self.assertEqual(sleep.call_count, 1)
                self.assertEqual([path for _, path, _ in self.api.mutations], ['git/refs'])

    def test_post_create_malformed_read_is_not_absence(self):
        for value in [{}, {'object': {}}, {'object': {'type': 'commit', 'sha': None}},
                      {'object': {'type': 'tag', 'sha': SHA}}]:
            with self.subTest(value=value):
                self.api = FakeGitHub()
                reads = self.post_create_reads([value])
                with patch.object(release.time, 'sleep') as sleep, self.assertRaisesRegex(ValueError, 'does not match'):
                    release.publish(self.out, SHA, self.api)
                self.assertEqual(len(reads), 1)
                sleep.assert_not_called()
                self.assertEqual([path for _, path, _ in self.api.mutations], ['git/refs'])

    def test_creation_response_must_identify_exact_lightweight_ref(self):
        for value in [None, {}, {'ref': 'refs/tags/wrong', 'object': {'type': 'commit', 'sha': SHA}},
                      {'ref': 'refs/tags/' + TAG, 'object': {'type': 'commit', 'sha': 'c' * 40}},
                      {'ref': 'refs/tags/' + TAG, 'object': {'type': 'tag', 'sha': SHA}}]:
            with self.subTest(value=value):
                self.api = FakeGitHub()
                reads = self.post_create_reads([], creation=lambda _: value)
                with patch.object(release.time, 'sleep') as sleep, self.assertRaisesRegex(ValueError, 'creation response'):
                    release.publish(self.out, SHA, self.api)
                self.assertFalse(reads)
                sleep.assert_not_called()
                self.assertEqual([path for _, path, _ in self.api.mutations], ['git/refs'])

    def test_existing_exact_tag_retry_never_creates_or_waits(self):
        self.api.target = SHA
        with patch.object(release.time, 'sleep') as sleep:
            release.publish(self.out, SHA, self.api)
        sleep.assert_not_called()
        self.assertFalse(any(path == 'git/refs' for _, path, _ in self.api.mutations))
        self.assertFalse(self.api.release['draft'])

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
        self.assertEqual(workflow.count('fetch-depth: 0'), 2)
        self.assertIn("if: needs.validate.outputs.release == 'true' &&", workflow)
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
        git('tag', 'v1.1.7')
        (root / 'manifest.json').write_text('{"version":"1.1.8"}')
        git('add', '.');git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'next')
        import package_extension
        fake_files = {'manifest.json': (root / 'manifest.json').read_bytes()}
        with patch.object(package_extension, 'collect', return_value=fake_files):
            metadata = release.build(root, Path(self.temp.name) / 'built', git('rev-parse', 'HEAD'))
        self.assertEqual(metadata['runtime_count'], 1)
        release.inspect_bundle(Path(self.temp.name) / 'built', git('rev-parse', 'HEAD'))


class BatchPlanTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'repo'
        self.root.mkdir()
        self.git('init', '-q')
        self.commit('1.1.7', 'base')
        self.git('tag', 'v1.1.7')

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args], stderr=subprocess.DEVNULL, text=True).strip()

    def commit(self, version, name):
        (self.root / 'manifest.json').write_text(json.dumps({'version': version}))
        (self.root / 'change.txt').write_text(name)
        self.git('add', '.')
        self.git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', name)
        return self.git('rev-parse', 'HEAD')

    def test_two_and_three_features_then_explicit_release(self):
        for count in (2, 3):
            with self.subTest(count=count):
                self.git('reset', '--hard', 'v1.1.7')
                for i in range(count):
                    sha = self.commit('1.1.7', f'feature {i}')
                    self.assertFalse(release.release_plan(self.root, sha)['release'])
                sha = self.commit('1.1.8', 'release batch')
                plan = release.release_plan(self.root, sha)
                self.assertTrue(plan['release'])
                self.assertEqual(plan['base_tag'], 'v1.1.7')
                self.git('tag', '-f', 'v1.1.8')
                self.assertEqual(release.release_plan(self.root, sha), plan)

    def test_development_bundle_without_release_record(self):
        sha = self.commit('1.1.7', 'feature')
        import package_extension
        with patch.object(package_extension, 'collect', return_value={'manifest.json': (self.root / 'manifest.json').read_bytes()}):
            out = Path(self.temp.name) / 'assets'
            result = release.build(self.root, out, sha)
        self.assertFalse(result['release_plan']['release'])
        release.inspect_bundle(out, sha)
        api = FakeGitHub()
        with self.assertRaisesRegex(ValueError, 'not an explicit release'):
            release.publish(out, sha, api)
        self.assertFalse(api.mutations)

    def test_invalid_version_transitions(self):
        for version in ('1.1.6', '1.1.9', '1.2.0'):
            with self.subTest(version=version):
                self.git('reset', '--hard', 'v1.1.7')
                sha = self.commit(version, 'bad transition')
                with self.assertRaisesRegex(ValueError, 'patch exactly once'):
                    release.release_plan(self.root, sha)

    def test_missing_baseline(self):
        sha = self.commit('1.1.8', 'release')
        self.git('tag', '-d', 'v1.1.7')
        with self.assertRaisesRegex(ValueError, 'Missing ancestor'):
            release.release_plan(self.root, sha)

    def test_baseline_manifest_mismatch(self):
        self.git('tag', 'v1.1.8')
        sha = self.commit('1.1.9', 'release')
        with self.assertRaisesRegex(ValueError, 'manifest version mismatch'):
            release.release_plan(self.root, sha)

    def test_unreleased_transition(self):
        self.commit('1.1.6', 'bad intermediate version')
        sha = self.commit('1.1.8', 'release')
        with self.assertRaisesRegex(ValueError, 'Unreleased version transition'):
            release.release_plan(self.root, sha)

    def test_nonancestor_tag_does_not_change_baseline(self):
        original = self.git('rev-parse', 'HEAD')
        self.commit('1.1.99', 'unrelated branch')
        self.git('tag', 'v1.1.99')
        self.git('reset', '--hard', original)
        sha = self.commit('1.1.8', 'release')
        self.assertEqual(release.release_plan(self.root, sha)['base_tag'], 'v1.1.7')

    def test_baseline_asset_metadata_must_be_complete(self):
        out = Path(self.temp.name) / 'assets'
        bundle(out)
        complete = FakeGitHub().api('releases/41/assets?per_page=100&page=1')
        cases = [complete[:-1], complete + [complete[0]],
                 [dict(a, state='new') if i == 0 else a for i, a in enumerate(complete)],
                 [dict(a, size=0) if i == 0 else a for i, a in enumerate(complete)],
                 [dict(a, name='unexpected.zip') if i == 0 else a for i, a in enumerate(complete)]]
        for assets in cases:
            with self.subTest(assets=assets):
                api = FakeGitHub()
                original = api.api
                def read(path, *args, **kwargs):
                    return assets if path.startswith('releases/41/assets?') else original(path, *args, **kwargs)
                with patch.object(api, 'api', side_effect=read), self.assertRaisesRegex(ValueError, 'Previous release assets are incomplete'):
                    release.publish(out, SHA, api)
                self.assertFalse(api.mutations)


    def test_baseline_auth_or_transport_failure_never_mutates(self):
        out = Path(self.temp.name) / 'assets'
        bundle(out)
        api = FakeGitHub()
        original = api.api
        def failure(path, *args, **kwargs):
            if path == 'releases/tags/v1.1.7':
                raise RuntimeError('HTTP 403 or transient transport error')
            return original(path, *args, **kwargs)
        with patch.object(api, 'api', side_effect=failure), self.assertRaises(RuntimeError):
            release.publish(out, SHA, api)
        self.assertFalse(api.mutations)

    def test_release_still_requires_notes(self):
        sha = self.commit('1.1.8', 'release without notes')
        with self.assertRaisesRegex(ValueError, 'Missing source-controlled change record'):
            release.build(self.root, Path(self.temp.name) / 'assets', sha)


    def test_baseline_must_be_public_and_unchanged(self):
        out = Path(self.temp.name) / 'assets'
        bundle(out)
        for response in (None, {'tag_name': 'v1.1.7', 'draft': True, 'prerelease': False},
                         {'tag_name': 'v1.1.7', 'draft': False, 'prerelease': True}):
            api = FakeGitHub()
            original = api.api
            def read(path, *args, **kwargs):
                return response if path == 'releases/tags/v1.1.7' else original(path, *args, **kwargs)
            with patch.object(api, 'api', side_effect=read), self.assertRaisesRegex(ValueError, 'not publicly complete'):
                release.publish(out, SHA, api)
            self.assertFalse(api.mutations)
        api = FakeGitHub()
        original = api.api
        def changed(path, *args, **kwargs):
            return {'object': {'type': 'commit', 'sha': 'c' * 40}} if path == 'git/ref/tags/v1.1.7' else original(path, *args, **kwargs)
        with patch.object(api, 'api', side_effect=changed), self.assertRaisesRegex(ValueError, 'Baseline release tag changed'):
            release.publish(out, SHA, api)
        self.assertFalse(api.mutations)


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'repo'
        self.root.mkdir()
        self.git('init', '-q')
        self.base = self.commit('1.1.7', 'base')
        self.git('tag', 'v1.1.7')
        self.commit(VERSION, 'original release')
        self.sha = self.commit(VERSION, 'recover release\n\nRelease-Recovery: v' + VERSION)
        self.plan = release.release_plan(self.root, self.sha)
        self.out = Path(self.temp.name) / 'assets'
        bundle(self.out)
        metadata = json.loads((self.out / 'PROVENANCE.json').read_text())
        metadata.update(source_commit=self.sha, release_plan=self.plan)
        (self.out / 'PROVENANCE.json').write_text(json.dumps(metadata))
        (self.out / 'RELEASE-NOTES.md').write_text(release.notes(self.sha, VERSION))
        (self.out / 'SHA256SUMS.txt').write_text(''.join(f'{release.sha256(p.read_bytes())}  {p.name}\n' for p in sorted(self.out.iterdir()) if p.name != 'SHA256SUMS.txt'))
        self.api = FakeGitHub()
        original = self.api.api
        def api(path, *args, **kwargs):
            if path == 'git/ref/heads/master':
                return {'object': {'type': 'commit', 'sha': self.sha, 'url': 'ignored'}}
            if path == 'releases/latest':
                return original('releases/tags/v1.1.7')
            if path == 'git/ref/tags/v1.1.7':
                return {'object': {'type': 'commit', 'sha': self.base}}
            return original(path, *args, **kwargs)
        self.api.api = api
        self.env = patch.dict(release.os.environ, {'GITHUB_REPOSITORY': release.REPOSITORY,
                            'GITHUB_REF': 'refs/heads/master', 'GITHUB_EVENT_NAME': 'push',
                            'GITHUB_SHA': self.sha})
        self.env.start()
        self.addCleanup(self.env.stop)

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.root), *args], stderr=subprocess.DEVNULL, text=True).strip()

    def commit(self, version, message):
        (self.root / 'manifest.json').write_text(json.dumps({'version': version}))
        (self.root / 'change.txt').write_text(message)
        self.git('add', '.')
        self.git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', message)
        return self.git('rev-parse', 'HEAD')

    def publish(self):
        return release.publish(self.out, self.sha, self.api, root=self.root)

    def test_exact_recovery_plan_and_one_complete_publication(self):
        self.assertIs(self.plan['recovery'], True)
        self.assertEqual(self.plan['base_tag'], 'v1.1.7')
        self.assertIn(TAG, self.publish())
        self.assertFalse(self.api.release['draft'])
        self.assertEqual(len(self.api.assets), 4)
        self.api.mutations.clear()
        with self.assertRaisesRegex(ValueError, 'already exists'):
            self.publish()
        self.assertFalse(self.api.mutations)

    def test_only_exact_final_trailer_triggers(self):
        for message in ['ordinary test repair', 'Release-Recovery: v1.1.8',
                        'example\n\n> Release-Recovery: v1.1.8',
                        'example\n\n    Release-Recovery: v1.1.8',
                        'example\n\n```\nRelease-Recovery: v1.1.8\n```',
                        'example\n\nRelease-Recovery: v1.1.8\n\nmore prose',
                        'example\n\nHere is an example:\nRelease-Recovery: v1.1.8']:
            with self.subTest(message=message):
                sha = self.commit(VERSION, message)
                self.assertFalse(release.release_plan(self.root, sha)['release'])

    def test_wrong_duplicate_or_nonexact_trailers_fail_closed(self):
        for trailer in ['Release-Recovery: v1.1.9', 'Release-Recovery: 1.1.8',
                        'Release-Recovery: v1.1.8 ', 'Release-Recovery:  v1.1.8',
                        'Release-Recovery: v1.1.8\nRelease-Recovery: v1.1.8',
                        'Release-Recovery: v1.1.9\nRelease-Recovery: v1.1.8']:
            with self.subTest(trailer=trailer):
                # Test raw parsing too: git strips trailing whitespace on commit.
                with self.assertRaisesRegex(ValueError, 'Invalid or duplicate'):
                    release.recovery_trailer('recover\n\n' + trailer, VERSION)

    def test_body_and_final_markers_are_not_unique(self):
        for body_marker in ['Release-Recovery: v1.1.8', 'Release-Recovery: v1.1.9']:
            message = 'recover\n\n' + body_marker + '\n\nRelease-Recovery: v1.1.8'
            sha = self.commit(VERSION, message)
            with self.subTest(body_marker=body_marker), self.assertRaisesRegex(ValueError, 'Invalid or duplicate'):
                release.release_plan(self.root, sha)
        sha = self.commit(VERSION, 'recover\n\n> Release-Recovery: v1.1.8\n\nRelease-Recovery: v1.1.8')
        self.assertTrue(release.release_plan(self.root, sha)['recovery'])

    def test_marker_cannot_replace_regular_bump(self):
        self.git('reset', '--hard', 'v1.1.7')
        sha = self.commit(VERSION, 'bump\n\nRelease-Recovery: v' + VERSION)
        with self.assertRaisesRegex(ValueError, 'unchanged parent'):
            release.release_plan(self.root, sha)

    def test_real_97_version_and_other_trailers(self):
        self.commit('1.1.96', 'base96')
        self.git('tag', 'v1.1.96')
        self.commit('1.1.97', 'original97')
        sha = self.commit('1.1.97', 'recover97\n\nReviewed-by: Test\nRelease-Recovery: v1.1.97')
        plan = release.release_plan(self.root, sha)
        self.assertIs(plan['recovery'], True)
        self.assertEqual(plan['base_tag'], 'v1.1.96')
        self.assertEqual(plan['version'], '1.1.97')

    def test_commit_trailer_whitespace_is_not_normalized(self):
        self.git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid',
                 'commit', '--allow-empty', '--cleanup=verbatim', '-qm',
                 'recovery\n\nRelease-Recovery: v1.1.8 ')
        with self.assertRaisesRegex(ValueError, 'Invalid or duplicate'):
            release.release_plan(self.root, self.git('rev-parse', 'HEAD'))

    def test_recovery_cannot_skip_patch(self):
        self.commit('1.1.9', 'bad version')
        sha = self.commit('1.1.9', 'recovery\n\nRelease-Recovery: v1.1.9')
        with self.assertRaisesRegex(ValueError, 'patch exactly once'):
            release.release_plan(self.root, sha)

    def test_recovery_requires_event_and_checkout_identity(self):
        for key, value in [('GITHUB_SHA', 'c' * 40), ('GITHUB_EVENT_NAME', 'workflow_dispatch'),
                           ('GITHUB_REF', 'refs/heads/other'), ('GITHUB_REPOSITORY', 'other/repo')]:
            with self.subTest(key=key), patch.dict(release.os.environ, {key: value}), self.assertRaises(ValueError):
                self.publish()
            self.assertFalse(self.api.mutations)
        self.commit(VERSION, 'ordinary later commit')
        with self.assertRaisesRegex(ValueError, 'Checkout differs'):
            self.publish()
        self.assertFalse(self.api.mutations)

    def test_changed_or_uncertain_remote_state_never_creates(self):
        original = self.api.api
        cases = [('git/ref/heads/master', {'object': {'type': 'commit', 'sha': 'c' * 40}}),
                 ('releases/latest', {'id': 45, 'tag_name': 'v1.1.9', 'draft': False, 'prerelease': False}),
                 ('releases/latest', None), ('releases/latest', RuntimeError('API unavailable')),
                 ('git/ref/heads/master', RuntimeError('API unavailable')),
                 ('git/ref/tags/' + TAG, RuntimeError('API unavailable')),
                 ('releases?per_page=100&page=1', RuntimeError('API unavailable'))]
        for endpoint, response in cases:
            def api(path, *args, **kwargs):
                if path == endpoint:
                    if isinstance(response, Exception):
                        raise response
                    return response
                return original(path, *args, **kwargs)
            with self.subTest(endpoint=endpoint, response=response), patch.object(self.api, 'api', side_effect=api), self.assertRaises((ValueError, TypeError, RuntimeError)):
                self.publish()
            self.assertFalse(self.api.mutations)

    def test_existing_tags_drafts_and_releases_never_reused(self):
        for target, draft in [(self.sha, None), ('c' * 40, None), (None, True), (None, False)]:
            self.api.target = target
            self.api.release = None if draft is None else {'tag_name': TAG, 'draft': draft}
            with self.subTest(target=target, draft=draft), self.assertRaises(ValueError):
                self.publish()
            self.assertFalse(self.api.mutations)

    def test_partial_recovery_is_not_resumed(self):
        self.api.fail_upload_once = True
        with self.assertRaises(RuntimeError):
            self.publish()
        self.assertTrue(self.api.release['draft'])
        self.api.mutations.clear()
        with self.assertRaisesRegex(ValueError, 'already exists'):
            self.publish()
        self.assertFalse(self.api.mutations)

    def test_racing_create_failure_is_not_retried(self):
        original = self.api.api
        for endpoint in ['git/refs', 'releases']:
            self.api.target = None
            self.api.release = None
            self.api.mutations.clear()
            attempts = []
            def api(path, *args, **kwargs):
                if path == endpoint and kwargs.get('method') == 'POST':
                    attempts.append(path)
                    raise RuntimeError('HTTP 422 already exists')
                return original(path, *args, **kwargs)
            with self.subTest(endpoint=endpoint), patch.object(self.api, 'api', side_effect=api), self.assertRaises(RuntimeError):
                self.publish()
            self.assertEqual(attempts, [endpoint])
            self.assertFalse(self.api.assets)

    def test_remote_drift_after_upload_does_not_publish(self):
        original = self.api.api
        for endpoint in ['git/ref/heads/master', 'releases/latest']:
            calls = []
            self.api.target = None
            self.api.release = None
            self.api.assets.clear()
            self.api.mutations.clear()
            def api(path, *args, **kwargs):
                response = original(path, *args, **kwargs)
                if path == endpoint:
                    calls.append(path)
                    if len(calls) > 1:
                        if path == 'git/ref/heads/master':
                            response['object']['sha'] = 'c' * 40
                        else:
                            response['id'] = 99
                return response
            with self.subTest(endpoint=endpoint), patch.object(self.api, 'api', side_effect=api), self.assertRaises(ValueError):
                self.publish()
            self.assertTrue(self.api.release['draft'])
            self.assertFalse(any(method == 'PATCH' for method, _, _ in self.api.mutations))

    def test_baseline_drift_after_upload_does_not_publish(self):
        original = self.api.api
        for endpoint in ['git/ref/tags/v1.1.7', 'releases/41/assets?per_page=100&page=1']:
            self.api.target = None
            self.api.release = None
            self.api.assets.clear()
            self.api.mutations.clear()
            def api(path, *args, **kwargs):
                response = original(path, *args, **kwargs)
                if path == endpoint and self.api.assets:
                    if path.startswith('git/ref/'):
                        response['object']['sha'] = 'c' * 40
                    else:
                        response.pop()
                return response
            with self.subTest(endpoint=endpoint), patch.object(self.api, 'api', side_effect=api), self.assertRaises(ValueError):
                self.publish()
            self.assertTrue(self.api.release['draft'])
            self.assertFalse(any(method == 'PATCH' for method, _, _ in self.api.mutations))

    def test_baseline_four_assets_strict(self):
        original = self.api.api
        complete = original('releases/41/assets?per_page=100&page=1')
        cases = [complete[:-1], complete + [complete[0]],
                 [dict(a, name='unexpected.zip') if i == 0 else a for i, a in enumerate(complete)],
                 [dict(a, state='new') if i == 0 else a for i, a in enumerate(complete)]]
        cases.extend([dict(a, size=size) if i == 0 else a for i, a in enumerate(complete)] for size in [0, -1, '100', True])
        for assets in cases:
            def api(path, *args, **kwargs):
                return assets if path.startswith('releases/41/assets?') else original(path, *args, **kwargs)
            with self.subTest(assets=assets), patch.object(self.api, 'api', side_effect=api), self.assertRaises(ValueError):
                self.publish()
            self.assertFalse(self.api.mutations)

    def test_duplicate_release_across_pages_fails_closed(self):
        original = self.api.api
        def api(path, *args, **kwargs):
            if path == 'releases?per_page=100&page=1':
                return [{'tag_name': TAG}] + [{'tag_name': 'other'}] * 99
            if path == 'releases?per_page=100&page=2':
                return [{'tag_name': TAG}]
            return original(path, *args, **kwargs)
        with patch.object(self.api, 'api', side_effect=api), self.assertRaisesRegex(ValueError, 'Duplicate releases'):
            self.publish()
        self.assertFalse(self.api.mutations)


if __name__ == '__main__':
    unittest.main()
