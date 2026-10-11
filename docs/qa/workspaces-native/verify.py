#!/usr/bin/env python3
"""Compare original synthetic native exports; uses only the standard library."""
import copy, hashlib, json
from pathlib import Path
ROOT = Path(__file__).resolve().parent

def read(name):
    return json.loads((ROOT / 'exports' / name).read_text())
def payload(value):
    result = copy.deepcopy(value)
    result.pop('exportedAt', None)
    return result

old = read('legacy-1.1.21-baseline.json')
migrated = read('migrated-default.json')
old_modules = copy.deepcopy(old['modules'])
del old_modules['config']['data']['privacy']  # Device-global; deliberately absent in schema 2.
assert old_modules == migrated['workspaces'][0]['modules']
assert len(migrated['workspaces']) == 1 and not migrated['trash']
assert migrated['workspaces'][0]['id'] == 'default'

s = read('all-workspaces-source-s.json')
t = read('all-workspaces-destination-t.json')
u = read('all-workspaces-restored-u.json')
r = read('all-workspaces-recovery-r.json')
assert s['modules'] == ['config', 'tasks', 'scratchpad', 'countdown', 'focus']
assert len(s['workspaces']) == 3 and len(s['trash']) == 1
assert [w['name'] for w in s['registry']['entries']] == ['Default', 'studio', 'timer copy']
assert s['trash'][0]['name'] == 'lab'
assert len({w['id'] for w in s['workspaces'] + s['trash']}) == 4
assert s['workspaces'][1]['modules']['countdown']['targetDate'] == '2031-02-03'
expected_t = payload(s)
expected_t['workspaces'][2]['modules']['scratchpad']['content'] = 'destination note before archive restore'
assert expected_t == payload(t), 'Destination differs by more than its one deliberate note edit'
assert payload(r) == payload(t), 'Recovery must exactly retain the destination portable archive'

source = payload(s)
restored = payload(u)
regenerated = []
for kind in ['workspaces', 'trash']:
    for before, after in zip(source[kind], restored[kind]):
        assert before['id'] == after['id']
        for a, b in zip(before['modules']['tasks']['records'], after['modules']['tasks']['records']):
            assert a['id'] == b['id'] and a['version'] != b['version']
            regenerated.append({'workspaceId': before['id'], 'taskId': a['id']})
            b['version'] = a['version']
        if kind == 'trash':
            assert after['updatedAt'] > before['updatedAt']
            after['updatedAt'] = before['updatedAt']
for before, after in zip(source['registry']['entries'], restored['registry']['entries']):
    assert after['updatedAt'] > before['updatedAt']
    after['updatedAt'] = before['updatedAt']
assert source == restored, 'Unexpected restored-data delta'
assert len(regenerated) == 7
text = (ROOT / 'exports' / 'local-itab-workspace-page-text.txt').read_text()
assert '\nAdd a task\nlab draft retained after trash\n' in text
assert '\nScratchpad text\nlab saved note\n' in text
result = {'passed': True, 'migrationPortableModulesExact': True, 'sourceLiveWorkspaces': 3,
          'sourceTrashWorkspaces': 1, 'destinationOnlyDeliberateNoteDelta': True,
          'recoveryExactDestinationExceptExportedAt': True,
          'restoredExactSourceExceptDocumentedMetadata': True,
          'regeneratedTaskVersionCount': len(regenerated),
          'regeneratedTaskVersions': regenerated,
          'preservedTaskHistoryCopies': sum(len(w['modules']['tasks']['recovery']) for w in s['workspaces'] + s['trash']),
          'staleDraftExportContainsExactText': True}
print(json.dumps(result, ensure_ascii=False, indent=2))
