import json,pathlib,hashlib
import argparse
parser=argparse.ArgumentParser(description='Verify synthetic native audit preservation; no browser/network access')
parser.add_argument('fixture',type=pathlib.Path)
p=parser.parse_args().fixture.resolve();results={}
for f in sorted((p/'evidence').glob('*.json')):
 d=json.loads(f.read_text()); old,raw=d['initial'],d['raw'];reg='__localItabWorkspaceRegistryV1'
 def ent(x,id):return next(e for e in x[reg]['workspaces'] if e['id']==id)
 def bundle(x,id):
  e=ent(x,id);return x['__localItabWorkspaceV1:'+e['id']+':'+e['generation']]
 def digest(x):return hashlib.sha256(json.dumps(x,ensure_ascii=False,separators=(',',':')).encode()).hexdigest()
 if ent(raw,'default').get('deletedAt') is not None: raise ValueError('Target workspace is deleted: '+f.name)
 personal=['__localItabPersonalTasksV1','__localItabFocusV1','__localItabScratchpadV1','__localItabCountdownV1'];globals=['privacy','sync','__localItabPersonalPromptsV1','__localItabAICollectionsV1']
 checks={'targetPersonal':{k:bundle(raw,'default')['values'][k]==bundle(old,'default')['values'][k] for k in personal},'global':{k:raw[k]==old[k] for k in globals},'otherWorkspace':{e['id']:ent(raw,e['id'])==e and bundle(raw,e['id'])==bundle(old,e['id']) for e in old[reg]['workspaces'] if e['id']!='default'}}
 if not all(all(v.values()) for v in checks.values()): raise ValueError('Preservation mismatch: '+f.name)
 results[f.name]={'checks':checks,'canonicalPersonalHashPairs':{k:[digest(bundle(old,'default')['values'][k]),digest(bundle(raw,'default')['values'][k])] for k in personal},'globalRecords':{k:len(old[k].get('records',[])) for k in globals if k.startswith('__')},'boot':d['summary']['boot'],'writes':d['summary']['writes'],'visibility':[e for e in d['history'] if e['type'] in ['initial','visibilitychange']],'timeline':[{'n':e['n'],'time':e['time'],'type':e['type'],'target':e.get('target'),'kind':e.get('kind')} for e in d['history'] if e['type'] in ['confirm-open','confirm-result','write-applied','held-delivery','release','input','change','blur','checkpoint','pagehide']]}
if not results: raise SystemExit('No audit JSON files found; nothing verified')
(p/'AUDIT-VERIFICATION.json').write_text(json.dumps(results,ensure_ascii=False,indent=2));print('Verified',len(results),'audit files, all preservation assertions pass; acceptance classification remains in RESULT.md')
