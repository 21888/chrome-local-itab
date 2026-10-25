/* Rebuilt synthetic QA bridge; not extension runtime and not native storage. */
(() => {
'use strict';
const clone=x=>x===undefined?undefined:structuredClone(x), key='itab-f15-synthetic-qa-rich2-v2'+(true?'-rich':'');
let previous;try{previous=JSON.parse(sessionStorage.getItem(key)||'null')}catch{}
const raw=previous?.raw||clone(true?window.QA_RICH_SEED:window.QA_SEED), history=previous?.history||[], listeners=new Set();
let freshRequested=false;
let armed=null, pending=new Map(), seq=0, writes=previous?.writes||0, boot=(previous?.boot||0)+1;
const persist=()=>{if(!freshRequested)sessionStorage.setItem(key,JSON.stringify({raw,history,writes,boot}));};
const originalSeed=clone(true?window.QA_RICH_SEED:window.QA_SEED);
function preservation(){
 const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b), prefix='__localItabWorkspaceV1:', reg='__localItabWorkspaceRegistryV1';
 const beforeEntries=originalSeed[reg]?.workspaces||[], nowEntries=raw[reg]?.workspaces||[];
 const targetBefore=beforeEntries.find(e=>e.id==='default'), targetNow=nowEntries.find(e=>e.id==='default');
 const key=e=>e?prefix+e.id+':'+e.generation:null, beforeKey=key(targetBefore), nowKey=key(targetNow);
 const personal=['__localItabPersonalTasksV1','__localItabFocusV1','__localItabScratchpadV1','__localItabCountdownV1'];
 return {hasRichTarget:!!targetBefore,targetCurrent:{id:targetNow?.id,generation:targetNow?.generation,deletedAt:targetNow?.deletedAt,bundlePresent:!!raw[nowKey]},
 globalExact:Object.fromEntries(['privacy','sync','__localItabPersonalPromptsV1','__localItabAICollectionsV1'].map(k=>[k,eq(originalSeed[k],raw[k])])),
 otherWorkspacesExact:Object.fromEntries(beforeEntries.filter(e=>e.id!=='default').map(e=>{const current=nowEntries.find(n=>n.id===e.id);return [e.id,{registryExact:eq(e,current),bundleExact:!!current&&eq(originalSeed[key(e)],raw[key(current)])}]})),
 targetPersonalExact:beforeKey?Object.fromEntries(personal.map(k=>[k,!!targetNow&&targetNow.deletedAt===null&&!!raw[nowKey]&&eq(originalSeed[beforeKey].values[k],raw[nowKey].values[k])])):null};
}
const snapshot=()=>({visibility:document.visibilityState,focus:document.activeElement?.id,quote:document.getElementById('quote-text')?.value,writes,boot,preservation:preservation(),eventCount:history.length,visibilityHistory:history.filter(e=>e.type==='initial'||e.type==='visibilitychange').map(({n,time,type,visibility})=>({n,time,type,visibility})),storedQuotes:Object.fromEntries((raw.__localItabWorkspaceRegistryV1?.workspaces||[]).map(e=>[e.id,raw['__localItabWorkspaceV1:'+e.id+':'+e.generation]?.values?.quote]))});
function log(type,detail={}){history.push({n:history.length+1,time:Date.now(),type,visibility:document.visibilityState,...clone(detail)});persist();render();}
function render(){const pre=document.getElementById('qa-log');if(pre)pre.textContent=JSON.stringify({armed,pending:[...pending.keys()],summary:snapshot(),events:history.slice(-18)},null,2);}
async function gate(kind,value){if(armed!==kind)return value;armed=null;log('held-delivery',{kind});return new Promise((resolve,reject)=>{if(pending.has(kind)){reject(Error('Synthetic fixture gate already held: '+kind));return;}pending.set(kind,{kind,resolve:()=>resolve(value),reject});render()});}
const get=keys=>keys==null?clone(raw):Object.fromEntries((typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys)).filter(k=>k in raw||!Array.isArray(keys)&&typeof keys==='object').map(k=>[k,clone(k in raw?raw[k]:keys[k])]));
const local={QUOTA_BYTES:10485760,async get(keys){return get(keys)},async set(values){
 const input=clone(values),bundle=Object.entries(input).find(([k])=>k.startsWith('__localItabWorkspaceV1:'));
 log('write-request-precommit',{keys:Object.keys(input),bundle:bundle?.[1]});
 if(armed==='next-write'||armed==='replacement-write'&&bundle&&bundle[1].values.quote!==raw[bundle[0]]?.values.quote)await gate(armed,true);
 const changes=Object.fromEntries(Object.entries(input).map(([k,v])=>[k,{oldValue:clone(raw[k]),newValue:clone(v)}]));
 Object.assign(raw,input);writes++;log('write-applied',{keys:Object.keys(input),bundle:bundle?.[1]});
 queueMicrotask(()=>{for(const f of listeners)f(clone(changes),'local')});
 },async remove(keys){keys=typeof keys==='string'?[keys]:keys;for(const k of keys)delete raw[k];writes++;log('remove-applied',{keys})},async getBytesInUse(){return new TextEncoder().encode(JSON.stringify(raw)).length}};
const deny=name=>async()=>{log('forbidden-provider',{name});throw Error('Synthetic QA forbids '+name)};
window.chrome={storage:{local,sync:{get:async(keys)=>{log('synthetic-empty-sync-read',{keys});return {}},set:deny('sync.set'),remove:deny('sync.remove'),getBytesInUse:async()=>0,QUOTA_BYTES:102400},onChanged:{addListener:f=>listeners.add(f),removeListener:f=>listeners.delete(f)}},runtime:{id:'synthetic-local-qa',getURL:p=>new URL(p,location.href).href,getManifest:()=>({version:'1.1.160'})},permissions:{contains:(_q,cb)=>{cb?.(false);return Promise.resolve(false)},request:deny('permissions.request'),remove:deny('permissions.remove')},i18n:{getUILanguage:()=> 'en-US',getMessage:(k,subs=[])=>{const entry=QA_CATALOG[k];if(!entry)return '';if(!Array.isArray(subs))subs=[subs];return entry.message.replace(/\$([A-Z_]+)\$/gi,(_,p)=>{const n=entry.placeholders?.[p.toLowerCase()]?.content?.match(/\$(\d+)/)?.[1];return n?String(subs[n-1]??''):''})}}};
// Keep same-origin asset loading supported, refuse external provider requests.
const fetch0=window.fetch.bind(window);window.fetch=(url,options)=>{const target=new URL(typeof url==='string'?url:url.url,location.href);if(target.origin!==location.origin)return deny('external fetch')();return fetch0(url,options)};
const confirm0=window.confirm.bind(window);window.confirm=text=>{log('confirm-open',{text});const result=confirm0(text);log('confirm-result',{result});return result};
const fileText=File.prototype.text;File.prototype.text=async function(){const result=await fileText.call(this);return gate('file-text',result)};
window.QA={gate,log,raw,history,snapshot,arm:kind=>{armed=kind;log('armed',{kind})},checkpoint:()=>log('checkpoint',snapshot()),release:(reject=false,kind=null)=>{if(kind===null&&pending.size!==1){log('release-needs-specific-gate',{pending:[...pending.keys()]});return;}const chosen=kind||[...pending.keys()][0],p=pending.get(chosen);if(!p){log('release-no-pending',{kind:chosen});return;}pending.delete(chosen);log('release',{kind:p.kind,reject});reject?p.reject(Error('Synthetic held delivery rejection')):p.resolve()},fresh:()=>{freshRequested=true;sessionStorage.removeItem(key);location.href=location.pathname+'?'+(true?'rich=1&':'')+'qa='+Date.now()}};
for(const type of ['visibilitychange','blur','change','input'])document.addEventListener(type,e=>{if(e.target?.closest?.('#qa-panel'))return;log(type,{target:e.target?.id,value:e.target?.type==='file'?'[synthetic file selection]':e.target?.value})},true);
window.addEventListener('pagehide',()=>log('pagehide'));window.addEventListener('error',e=>log('error',{message:e.message}));window.addEventListener('unhandledrejection',e=>log('unhandledrejection',{message:String(e.reason)}));
log('initial',{boot});
document.addEventListener('DOMContentLoaded',()=>{const panel=document.createElement('aside');panel.id='qa-panel';panel.style='position:fixed;right:4px;top:4px;width:360px;max-height:46vh;overflow:auto;background:#fff;color:#111;border:3px solid #b00;z-index:2147483647;font:12px monospace;padding:8px';
const title=document.createElement('strong');title.textContent='SYNTHETIC QA — sessionStorage-backed RAM shim';panel.append(title);
for(const [label,action] of [['Arm replacement write',()=>QA.arm('replacement-write')],['Arm next write',()=>QA.arm('next-write')],['Arm file text',()=>QA.arm('file-text')],['Arm provider read',()=>QA.arm('provider-read')],['Release gate',()=>QA.release()],['Release file text',()=>QA.release(false,'file-text')],['Reject file text',()=>QA.release(true,'file-text')],['Release provider read',()=>QA.release(false,'provider-read')],['Reject provider read',()=>QA.release(true,'provider-read')],['Release replacement write',()=>QA.release(false,'replacement-write')],['Reject replacement write',()=>QA.release(true,'replacement-write')],['Release next write',()=>QA.release(false,'next-write')],['Reject gate',()=>QA.release(true)],['Checkpoint',()=>QA.checkpoint()],['Download synthetic audit',()=>{QA.checkpoint();const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({history,raw,initial:originalSeed,summary:snapshot()},null,2)],{type:'application/json'}));a.download='synthetic-itab-audit.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}],['Fresh synthetic run',()=>QA.fresh()]]){const b=document.createElement('button');b.textContent=label;b.type='button';b.addEventListener('click',action);panel.append(b)}
const pre=document.createElement('pre');pre.id='qa-log';pre.style='white-space:pre-wrap';panel.append(pre);document.body.append(panel);render();});
})();
