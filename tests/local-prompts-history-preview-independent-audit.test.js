const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const Core = require('../shared/local-prompts-store.js');
const { Controller, SESSION_LIMIT, SESSION_VALUE_LIMIT } = require('../shared/local-prompts-controller.js');
const { setup, add, tick } = require('./helpers/prompts-harness.js');
const Collections = require('./helpers/collections-harness.js');
const { createDocument, deferred } = require('./helpers/task-dom-model.js');
const clone = x => JSON.parse(JSON.stringify(x));
async function fixture() {
 const h=setup(), collection=Collections.setup(), c=new Controller({store:h.store,collectionStore:{read:()=>collection.store.read(),subscribe:f=>collection.store.subscribe(f)}});
 await c.start(); await add(c,'Synthetic','old {{old}}'); const first=c.record().currentVersionId;
 c.edit(); c.update('body','new {{new}}'); await c.save(); await tick(); const second=c.record().currentVersionId;
 const doc=createDocument({blurUnavailableFocus:true}),host=doc.createElement('div');doc.body.append(host);
 const writes=[]; const root={LocalItabPrompts:Core,LocalItabAISearch:require('../shared/local-ai-search.js'),LocalItabPromptDraft:require('../shared/collection-prompt-draft.js'),document:doc,addEventListener(){},navigator:{clipboard:{writeText:async t=>writes.push(t)}}};
 vm.runInNewContext(fs.readFileSync(`${__dirname}/../shared/local-prompts-view.js`,'utf8'),{window:root,Intl,Date,Object,Array,Boolean,String,Promise});
 const view=new root.LocalItabPromptsView.View({host,controller:c});view.render();
 return {h,c,collection,view,doc,first,second,writes};
}
test('audit: exact independent values and literal mode survive historical/current round trips without writes',async()=>{
 const {h,c,first,second}=await fixture(); const before=JSON.stringify(h.raw),writes=h.writes;
 c.setVariable('new','current');c.setLiteral(true);assert.equal(c.useVersion(first),true);c.setVariable('old','historical');
 c.returnToCurrent();assert.equal(c.session().versionId,second);assert.equal(c.session().values.new,'current');assert.equal(c.session().literal,true);
 c.useVersion(first);assert.equal(c.preview().text,'old historical');assert.equal(c.session().values.new,undefined);
 assert.equal(h.writes,writes);assert.equal(JSON.stringify(h.raw),before);c.dispose();
});
test('audit: Clear removes active plus cached current only, preserving third history and drafts',async()=>{
 const {c,first,second}=await fixture(); c.setVariable('new','v2');c.edit();c.update('body','third {{third}}');await c.save();await tick();const third=c.record().currentVersionId;
 c.returnToCurrent();c.setVariable('third','v3');c.useVersion(first);c.setVariable('old','v1');c.clearVariables();assert.equal(c.session().versionId,third);assert.deepEqual(Object.keys(c.session().values),[]);
 c.useVersion(second);assert.equal(c.session().values.new,'v2');c.useVersion(first);assert.deepEqual(Object.keys(c.session().values),[]);c.dispose();
});
test('audit: same IDs changed body retains invalid source until explicit valid selection',async()=>{
 const {c,first}=await fixture();c.useVersion(first);c.setVariable('old','keep');const original=c.session(),s=clone(c.state);s.revision++;s.records[0].history.find(v=>v.id===first).body='replacement {{x}}';c.accept(s);c.notify();
 assert.equal(c.session(),original);assert.equal(c.preview().complete,false);assert.equal(c.preview().text,'old keep');assert.equal(c.excerptContext('old'),null);
 assert.equal(c.useVersion(first,'old {{old}}'),false);assert.equal(c.useVersion(first,'replacement {{x}}'),true);assert.deepEqual(Object.keys(c.session().values),[]);assert.equal(original.values.old,'keep');c.dispose();
});
test('audit: pruned source and archived records block copy and result draft routing',async()=>{
 for(const mode of ['prune','archive']){const {c,view,first,writes}=await fixture();c.useVersion(first);c.setVariable('old','keep');const s=clone(c.state);s.revision++;if(mode==='prune')s.records[0].history=s.records[0].history.filter(v=>v.id!==first);else s.records[0].deletedAt=s.records[0].updatedAt;c.accept(s);c.notify();assert.equal(c.preview().complete,false,mode);await view.copy();assert.deepEqual(writes,[]);assert.equal(view.main.querySelector('.prompt-result-draft'),null);assert.equal(c.session().values.old,'keep');c.dispose();}
});
test('audit: pending read rejects switch and late clipboard feedback, preserving fields',async()=>{
 const {c,view,first}=await fixture();c.setVariable('new','keep');const wait=deferred(),saved=clone(c.state),read=c.store.read;c.store.read=()=>wait.promise;const p=c.refresh();assert.equal(c.useVersion(first),false);assert.equal(c.preview().complete,false);assert.equal(view.previewElements.copy.disabled,true);wait.resolve(saved);await p;c.store.read=read;assert.equal(c.preview().complete,true);assert.equal(c.session().values.new,'keep');c.dispose();
});
test('audit: history browsing is independent of explicit preview and exact result route',async()=>{
 const {c,view,first,second}=await fixture();c.useVersion(first);c.setVariable('old','keep');let list=view.main.querySelector('.prompt-history-list');list.children[1].dispatch('click');assert.equal(view.historyId,second);assert.equal(c.session().versionId,first);assert.ok(view.main.querySelector('.prompt-result-draft').href.endsWith(`bodyVersionId=${first}`));c.returnToCurrent();assert.equal(view.historyId,second);assert.ok(view.main.querySelector('.prompt-result-draft').href.endsWith(`bodyVersionId=${second}`));c.dispose();
});
test('audit: async excerpt review is invalidated by explicit switch away and back',async()=>{
 const {c,collection,first}=await fixture();await collection.store.mutate(collection.store.request('add',{title:'Synthetic excerpt',body:'replacement'}));await tick();const context=c.excerptContext('new'),review=c.reviewExcerpt(context,c.excerptRows(context)[0]);const wait=deferred(),state=await collection.store.read();c.collectionStore.read=()=>wait.promise;const pending=c.applyExcerpt(review);c.useVersion(first);c.returnToCurrent();wait.resolve(state);assert.equal((await pending).ok,false);assert.equal(c.session().values.new,undefined);c.dispose();
});
test('audit: session and value bounds refuse without evicting input and explicit recovery preserves draft',async()=>{
 const {c,first}=await fixture();c.setVariable('new','KEEP');const active=c.session();for(let i=c.sessions.size;i<SESSION_LIMIT;i++)c.sessions.set(`audit-${i}`,{values:{x:'kept'},literal:false,body:'x',versionId:`audit-${i}`});assert.equal(c.useVersion(first),false);assert.equal(c.session(),active);assert.equal(active.values.new,'KEEP');assert.ok(c.sessions.size<=SESSION_LIMIT);
 c.edit();c.update('title','UNSAVED');const draft=c.draft();c.clearPreviewSessions();assert.equal(c.draft(),draft);assert.equal(draft.input.title,'UNSAVED');assert.equal(c.sessions.size,0);c.dispose();
});
test('audit: disposal clears cache and cannot re-materialize via stale preview access',async()=>{
 const {c}=await fixture();c.setVariable('new','PRIVATE MEMORY');c.dispose();assert.equal(c.sessions.size,0);assert.equal(c.activeSessions.size,0);c.preview();assert.equal(c.sessions.size,0);
});
test('audit: rejected over-limit typing reconciles visible value and does not claim ready',async()=>{
 const {c,view}=await fixture();c.setVariable('new','KEEP');const input=view.main.querySelector('[data-prompt-focus="variable-new"]');input.value='x'.repeat(Core.LIMITS.value+1);input.dispatch('input');const shown=view.main.querySelector('[data-prompt-focus="variable-new"]');assert.equal(shown.value,c.session().values.new);assert.equal(c.session().values.new,'KEEP');assert.doesNotMatch(view.previewElements.status.textContent,/Ready to copy/);c.dispose();
});
test('audit: variable and literal edits are prevented or reconciled while prompt read is pending',async()=>{
 const {c,view}=await fixture();c.setVariable('new','KEEP');const wait=deferred(),saved=clone(c.state);c.store.read=()=>wait.promise;const p=c.refresh();const input=view.main.querySelector('[data-prompt-focus="variable-new"]');if(!input.disabled){input.value='REJECTED';input.dispatch('input');assert.equal(view.main.querySelector('[data-prompt-focus="variable-new"]').value,c.session().values.new);}const literal=view.previewElements.literal;if(!literal.disabled){literal.checked=true;literal.dispatch('change');assert.equal(view.previewElements.literal.checked,c.session().literal);}wait.resolve(saved);await p;c.dispose();
});
test('audit: excerpt insertion reports refusal at aggregate budget instead of success',async()=>{
 const {c,collection}=await fixture();await collection.store.mutate(collection.store.request('add',{title:'Synthetic excerpt',body:'abc'}));await tick();c.sessions.set('audit-full',{values:{x:'x'.repeat(SESSION_VALUE_LIMIT)},literal:false,body:'x',versionId:'audit-full'});const context=c.excerptContext('new'),review=c.reviewExcerpt(context,c.excerptRows(context)[0]);const outcome=await c.applyExcerpt(review);assert.equal(outcome.ok,false);assert.equal(c.session().values.new,undefined);c.dispose();
});
test('audit: late clipboard success cannot claim copied after switch away and back',async()=>{
 const {c,view,first}=await fixture();c.setVariable('new','KEEP');const wait=deferred();view.clipboard={writeText:()=>wait.promise};const pending=view.copy();c.useVersion(first);c.returnToCurrent();wait.resolve();await pending;assert.doesNotMatch(view.previewElements.status.textContent,/Copied\./);assert.equal(c.session().values.new,'KEEP');c.dispose();
});
test('audit: invalid-source literal controls cannot diverge from the retained session',async()=>{
 const {c,view,first}=await fixture();c.useVersion(first);const s=clone(c.state);s.revision++;s.records[0].history=s.records[0].history.filter(v=>v.id!==first);c.accept(s);c.notify();const literal=view.previewElements.literal;if(!literal.disabled){literal.checked=true;literal.dispatch('change');assert.equal(view.previewElements.literal.checked,c.session().literal);}c.dispose();
});
test('audit: capacity-only session cannot accept visibly divergent fields or literal toggles',async()=>{
 const {c,view}=await fixture();c.sessions.clear();c.activeSessions.clear();for(let i=0;i<SESSION_LIMIT;i++)c.sessions.set(`audit-${i}`,{values:{x:'kept'},literal:false,body:'x',versionId:`audit-${i}`});c.notify();assert.equal(c.session().capacity,true);const input=view.main.querySelector('[data-prompt-focus="variable-new"]');if(!input.disabled){input.value='REJECTED';input.dispatch('input');assert.equal(view.main.querySelector('[data-prompt-focus="variable-new"]').value,c.session().values.new||'');}const literal=view.previewElements.literal;if(!literal.disabled){literal.checked=true;literal.dispatch('change');assert.equal(view.previewElements.literal.checked,c.session().literal);}assert.equal(view.previewElements.copy.disabled,true);c.dispose();
});
test('audit: frozen saved-source replacement during excerpt reread cannot mutate retained variables',async()=>{
 const {c,collection,first}=await fixture();c.useVersion(first);c.setVariable('old','KEEP');await collection.store.mutate(collection.store.request('add',{title:'Synthetic excerpt',body:'abc'}));await tick();const context=c.excerptContext('old'),review=c.reviewExcerpt(context,c.excerptRows(context)[0]),changed=clone(c.state);changed.records[0].history.find(v=>v.id===first).body='changed {{old}}';c.store.read=async()=>changed;assert.equal((await c.applyExcerpt(review)).ok,false);assert.equal(c.session().values.old,'KEEP');c.dispose();
});
test('audit: newer prompt reads win over superseded completion without input reassignment',async()=>{
 const {c,first}=await fixture();c.useVersion(first);c.setVariable('old','KEEP');const old=clone(c.state),fresh=clone(c.state);fresh.revision++;fresh.records[0].history=fresh.records[0].history.filter(v=>v.id!==first);const wait=deferred();c.store.read=()=>wait.promise;const pending=c.refresh();c.store.read=async()=>fresh;await c.refresh();wait.resolve(old);await pending;assert.equal(c.state.revision,fresh.revision);assert.equal(c.preview().complete,false);assert.equal(c.session().values.old,'KEEP');c.dispose();
});
test('audit: confirmed capacity recovery clears inaccessible cached values without saved changes',async()=>{
 const {h,c,view}=await fixture();c.sessions.clear();c.activeSessions.clear();for(let i=0;i<SESSION_LIMIT;i++)c.sessions.set(`inaccessible-${i}`,{values:{x:'retained orphan'},literal:true,body:'orphan',versionId:`gone-${i}`});c.notify();const snapshot=JSON.stringify(h.raw),writes=h.writes;let asked=0;view.confirm=async()=>{asked++;return true;};const button=[...view.main.querySelectorAll('button')].find(b=>b.textContent==='Clear all preview values in this tab');assert.ok(button);button.dispatch('click');await tick();assert.equal(asked,1);assert.equal(c.session().capacity,undefined);assert.equal(c.sessions.size,1);assert.deepEqual(Object.keys(c.session().values),[]);assert.equal(h.writes,writes);assert.equal(JSON.stringify(h.raw),snapshot);c.dispose();
});
