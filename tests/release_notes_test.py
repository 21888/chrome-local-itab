import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import github_release as release

SHA = 'a' * 40


class HistoricalAPI:
    def __init__(self):
        self.plan = copy.deepcopy(release.load_backfill(ROOT))
        self.releases = {}
        self.tags = {}
        self.assets = {}
        self.data = {}
        self.mutations = []
        self.fail_after_patch = False
        for item in self.plan:
            tag = 'v' + item['version']
            body = 'Original installation text for ' + tag
            item['original_body_sha256'] = release.sha256(body.encode())
            self.tags[tag] = item['source_commit']
            self.releases[item['release_id']] = {'id': item['release_id'], 'tag_name': tag, 'body': body, 'name': 'Local iTab ' + item['version'], 'target_commitish': item['source_commit'], 'draft': False, 'prerelease': False}
            self.assets[item['release_id']] = []
            for name, guard in item['assets'].items():
                data = ('immutable asset ' + tag + ' ' + name).encode()
                asset_id = len(self.data) + 1
                self.data[asset_id] = data
                guard.update(sha256=release.sha256(data), bytes=len(data))
                self.assets[item['release_id']].append({'id': asset_id, 'name': name, 'size': len(data), 'state': 'uploaded'})

    def api(self, path, payload=None, method='GET', missing_ok=False):
        if path == '':
            return {'full_name': release.REPOSITORY, 'private': False, 'default_branch': 'master'}
        if path.startswith('git/ref/tags/'):
            return {'object': {'type': 'commit', 'sha': self.tags[path.rsplit('/', 1)[-1]]}}
        if path.startswith('releases/'):
            release_id = int(path.split('/')[1])
            if '/assets?' in path:
                return copy.deepcopy(self.assets[release_id])
            if method == 'PATCH':
                assert set(payload) == {'body'}, 'Only body may change'
                self.mutations.append((release_id, copy.deepcopy(payload)))
                self.releases[release_id].update(payload)
                if self.fail_after_patch:
                    self.fail_after_patch = False
                    raise RuntimeError('Lost response after successful edit')
            return copy.deepcopy(self.releases[release_id])
        raise AssertionError(path)

    def download(self, asset_id):
        return self.data[asset_id]


class NotesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.out = Path(self.temp.name) / 'assets'
        self.out.mkdir()
        version = '1.1.11'
        archive = b'canonical mock runtime'
        (self.out / f'local-itab-{version}.zip').write_bytes(archive)
        (self.out / 'PROVENANCE.json').write_text(json.dumps({'repository': release.REPOSITORY, 'version': version, 'source_commit': SHA, 'runtime_sha256': release.sha256(archive)}))
        (self.out / 'RELEASE-NOTES.md').write_text(release.notes(SHA, version))
        (self.out / 'SHA256SUMS.txt').write_text(''.join(f'{release.sha256(p.read_bytes())}  {p.name}\n' for p in sorted(self.out.iterdir())))
        self.api = HistoricalAPI()

    def run_backfill(self):
        with patch.object(release, 'load_backfill', return_value=self.api.plan):
            return release.backfill(ROOT, self.out, SHA, self.api)

    def test_changes_are_first_and_unique(self):
        bodies = [release.notes(SHA, version) for version in ('1.1.8', '1.1.9', '1.1.10', '1.1.11')]
        for body in bodies:
            self.assertLess(body.index('## 新增'), body.index('## 安装'))
            self.assertLess(body.index('## 修复'), body.index('## 安装'))
            self.assertLess(body.index('## 注意事项'), body.index('## 安装'))
        self.assertIn('自动发布流程', bodies[0])
        self.assertIn('HTML 文档语言', bodies[1])
        self.assertIn('快捷方式新增/编辑', bodies[2])
        self.assertIn('独立、随源码保存', bodies[3])

    def test_new_upgrade_guidance_has_commit_pinned_link_and_backup_scopes(self):
        body = release.notes(SHA, '1.1.17')
        self.assertIn(f'https://github.com/{release.REPOSITORY}/blob/{SHA}/docs/version-updates.md', body)
        self.assertNotIn('](docs/', body)
        for required in ('Settings JSON and Drive snapshots exclude Tasks, Focus, Scratchpad and Countdown',
                         'record Focus preferences manually', 'sessions cannot be migrated',
                         'existing tab containing the text', 'unsaved or conflicted draft',
                         'original permanent loaded folder', 'Do not remove the extension or load a new folder',
                         'refresh open new-tab and Settings pages', 'verify the version and existing data'):
            self.assertIn(required, body)

    def test_historical_generated_bodies_remain_unchanged(self):
        expected = {'1.1.8': 'e8119f480901412a0ee8237023b7fc9ce624920eacabfe6fe8590bc8ccfbdc75', '1.1.11': '2005d1d02158188ab9b732e79c6cc6d9875b5e0dc78abad94404b721203aac6e', '1.1.16': 'd2a1e4f7f27fd8e87cf15b25e71f8158ebad02e3195e79e068892c3af1aaa1d9'}
        for version, digest in expected.items():
            self.assertEqual(release.sha256(release.notes(SHA, version, ROOT, historical=True).encode()), digest)

    def test_missing_record_fails_no_generic_fallback(self):
        with self.assertRaisesRegex(ValueError, 'Missing source-controlled'):
            release.notes(SHA, '1.1.12', Path(self.temp.name))

    def test_invalid_record_sections_fail(self):
        record = Path(self.temp.name) / 'docs/releases/1.1.12.md'
        record.parent.mkdir(parents=True)
        record.write_text('Generic installation only ' * 5)
        with self.assertRaisesRegex(ValueError, 'required sections'):
            release.notes(SHA, '1.1.12', Path(self.temp.name))

    def test_real_plan_has_exact_three_targets(self):
        self.assertEqual({p['version'] for p in release.load_backfill(ROOT)}, {'1.1.8', '1.1.9', '1.1.10'})

    def test_backfill_changes_body_only(self):
        assets = copy.deepcopy(self.api.assets)
        data = dict(self.api.data)
        tags = dict(self.api.tags)
        self.assertEqual(self.run_backfill(), ['v1.1.8', 'v1.1.9', 'v1.1.10'])
        self.assertEqual(len(self.api.mutations), 3)
        self.assertEqual(self.api.assets, assets)
        self.assertEqual(self.api.data, data)
        self.assertEqual(self.api.tags, tags)
        for item in self.api.plan:
            self.assertEqual(self.api.releases[item['release_id']]['body'], release.notes(item['source_commit'], item['version'], ROOT, historical=True))

    def test_retry_is_read_only(self):
        self.run_backfill()
        self.api.mutations.clear()
        self.run_backfill()
        self.assertEqual(self.api.mutations, [])

    def test_partial_or_uncertain_success_resumes_safely(self):
        self.api.fail_after_patch = True
        with self.assertRaises(RuntimeError):
            self.run_backfill()
        self.run_backfill()
        self.assertEqual(len(self.api.mutations), 3)

    def test_unexpected_human_edit_blocks_all(self):
        self.api.releases[self.api.plan[1]['release_id']]['body'] = 'Manually edited body'
        with self.assertRaisesRegex(ValueError, 'edited unexpectedly'):
            self.run_backfill()
        self.assertEqual(self.api.mutations, [])

    def test_tag_mismatch_blocks_all(self):
        self.api.tags['v1.1.10'] = 'b' * 40
        with self.assertRaisesRegex(ValueError, 'tag source'):
            self.run_backfill()
        self.assertEqual(self.api.mutations, [])

    def test_asset_mismatch_blocks_all(self):
        asset_id = self.api.assets[self.api.plan[2]['release_id']][0]['id']
        self.api.data[asset_id] = b'x' * len(self.api.data[asset_id])
        with self.assertRaisesRegex(ValueError, 'asset bytes'):
            self.run_backfill()
        self.assertEqual(self.api.mutations, [])

    def test_wrong_release_id_blocks_all(self):
        self.api.releases[self.api.plan[2]['release_id']]['id'] = 123
        with self.assertRaisesRegex(ValueError, 'identity mismatch'):
            self.run_backfill()
        self.assertEqual(self.api.mutations, [])

    def test_workflow_backfill_only_on_migration_version(self):
        workflow = (ROOT / '.github/workflows/release.yml').read_text()
        self.assertIn("if: needs.validate.outputs.version == '1.1.11'", workflow)
        self.assertEqual(workflow.count('contents: write'), 1)


if __name__ == '__main__':
    unittest.main()
