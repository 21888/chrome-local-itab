'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const vm=require('node:vm');
const {createDocument}=require('./helpers/task-dom-model');
const optionsSource=fs.readFileSync('options.js','utf8');
const searchSource=fs.readFileSync('shared/settings-search.js','utf8');
const html=fs.readFileSync('options.html','utf8');
const section=html.match(/<section\b[^>]*id="subscription-usage-settings"[\s\S]*?<\/section>/)[0];
const locales=Object.fromEntries(['en','zh_CN'].map(lang=>[lang,JSON.parse(fs.readFileSync(`_locales/${lang}/messages.json`))]));
// The independently reviewed manual-topic spacing is unrelated to the passive
// subscription guide. Exempt exact reviewed literal blocks, not arbitrary CSS.
const topicScoreSpacing=Buffer.from('.topic-score {\n    margin-inline-start: var(--spacing-sm);\n}\n\n');
const interruptedSettingsIsolation=Buffer.from('\n/* A pending restore must not expose default-looking ordinary settings. */\n.options-main[hidden], .options-footer[hidden], #workspace-switcher[hidden] { display: none !important; }\n');
function preservedOptionsCss(bytes){
 // Only these independently reviewed literal blocks may differ from the guide baseline.
 for(const [name,block] of [['score spacing',topicScoreSpacing],['interrupted settings isolation',interruptedSettingsIsolation]]){
  const start=bytes.indexOf(block);
  assert.ok(start>=0,`reviewed ${name} block exists`);
  assert.equal(bytes.indexOf(block,start+block.length),-1,`reviewed ${name} block is unique`);
  bytes=Buffer.concat([bytes.subarray(0,start),bytes.subarray(start+block.length)]);
 }
 return bytes;
}
test('subscription viewing uses only two fixed user-clicked safe HTTPS anchors in Privacy',()=>{
 const anchors=[...section.matchAll(/<a\b([^>]+)>([^<]+)<\/a>/g)];assert.equal(anchors.length,2);
 const urls=['https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan','https://grok.com/dashboard'];
 anchors.forEach(([whole,attrs,label],i)=>{assert.ok(attrs.includes(`href="${urls[i]}"`));assert.ok(attrs.includes('target="_blank"'));assert.ok(attrs.includes('rel="noopener noreferrer"'));assert.ok(label.trim());assert.doesNotMatch(attrs,/\bon\w+=|tabindex="-1"|download/);});
 assert.doesNotMatch(section,/<(?:script|iframe|img|input|button)\b|\bon\w+=|\b(?:src|ping)=|0%|progressbar/);
 const before=html.slice(0,html.indexOf('id="subscription-usage-settings"'));
 assert.equal([...before.matchAll(/class="tab-panel[^\"]*" id="tab-([^\"]+)"/g)].at(-1)[1],'privacy');
 assert.match(fs.readFileSync('options.css','utf8'),/a:focus-visible/);
});
test('every guide label is bilingual, has an exact English HTML fallback, and distinguishes unconnected usage',()=>{
 for(const [,key,english]of section.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]+)</g)){
  for(const lang of ['en','zh_CN'])assert.ok(locales[lang][key]?.message.trim(),`${lang}/${key}`);
  assert.equal(english,locales.en[key].message,key);
 }
 assert.match(locales.en.subscriptionUsageDescription.message,/not connected to real-time Codex or Grok/);
 assert.match(locales.zh_CN.subscriptionUsageDescription.message,/尚未接入 Codex 或 Grok 的实时订阅用量/);
 assert.match(locales.en.subscriptionUsageDescription.message,/API billing is not subscription usage/);
 assert.match(locales.en.subscriptionUsageCodexHint.message,/help, not the Codex app/);
 for(const lang of ['en','zh_CN'])assert.ok(locales[lang].subscriptionUsagePrivacy.message.includes('Claude'));
});
test('guide does not change Claude permission flow, catalog, manifest, or install runtime requests',()=>{
 const expected=JSON.parse(fs.readFileSync('tests/fixtures/subscription-usage-preserved.json'));
 const manifest=JSON.parse(fs.readFileSync('manifest.json'));
 for(const [key,value] of Object.entries(expected.manifestPermissions))assert.deepEqual(manifest[key],value,key);
 delete expected.manifestPermissions;
 // Preserve the original permission code, rather than freezing unrelated
 // backup/UI functions in the entire Settings script.
 const boundaries={origins:['const PRIVACY_PERMISSION_ORIGINS = {','let driveBackupSnapshots ='],
  permissionHelpers:['async function requestOptionalOrigin(','function setPrivacyPermissionMetadata(']};
 for(const [name,[start,end]] of Object.entries(boundaries)){
  assert.equal(optionsSource.split(start).length,2);assert.equal(optionsSource.split(end).length,2);
  const code=optionsSource.slice(optionsSource.indexOf(start),optionsSource.indexOf(end));
  assert.equal(crypto.createHash('sha256').update(code).digest('hex'),expected.optionsPrivacySurface[name],name);
 }
 const permissionHelpers=optionsSource.slice(optionsSource.indexOf(boundaries.permissionHelpers[0]),optionsSource.indexOf(boundaries.permissionHelpers[1]));
 assert.doesNotMatch(optionsSource.replace(permissionHelpers,''),/\bchrome\s*(?:(?:\?\.)?\.?(?:permissions)\b|\[\s*['"]permissions['"]\s*\])/,'permission access stays inside reviewed helpers');
 delete expected.optionsPrivacySurface;
 assert.doesNotMatch(optionsSource,/subscription[-_]?usage|claude[-_]?usage|(?:help\.openai|chatgpt|grok|claude)\.com|claude\.ai/i);
 assert.doesNotMatch(optionsSource,/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|chrome\s*(?:\?\.)?\.?(?:cookies|scripting)|window\.open\s*\(|\bimport\s*\(/);
 // Bookmark scope review appends isolated styles after the original 42,422
 // bytes. After removing only the exact independently reviewed topic-score
 // spacing and interrupted-settings isolation blocks, preserve every other byte.
 // No subscription styling, permission or guide guard is removed.
 const preservedCss=preservedOptionsCss(fs.readFileSync('options.css'));
 const originalCss=preservedCss.subarray(0,42422);
 assert.equal(crypto.createHash('sha256').update(originalCss).digest('hex'),
  '2729c1d1465a5dd01fe39e659c431bb9510616b7025ca467d917ea8f1b377428','original Options CSS prefix');
 for(const [file,hash] of Object.entries(expected))assert.equal(crypto.createHash('sha256').update(file==='options.css'?preservedCss:fs.readFileSync(file)).digest('hex'),hash,file);
 assert.match(html,/<a\b[^>]*id="claude-usage-open"[^>]*href="claude-usage-experiment.html"/);
 const script=fs.readFileSync('shared/settings-search.js','utf8');
 assert.doesNotMatch(script,/fetch\s*\(|chrome\.permissions|chrome\.scripting|chrome\.storage|window\.open\s*\(/);
 assert.doesNotMatch(html,/<link\b[^>]*rel="(?:prefetch|preconnect|dns-prefetch)"/);
});

test('preserved Options CSS guard rejects other edits and broadened reviewed rules',()=>{
 const css=fs.readFileSync('options.css');
 const expected=JSON.parse(fs.readFileSync('tests/fixtures/subscription-usage-preserved.json'))['options.css'];
 const check=bytes=>assert.equal(crypto.createHash('sha256').update(preservedOptionsCss(bytes)).digest('hex'),expected);
 check(css);
 for(const [name,changed]of [
  ['unrelated existing token',Buffer.from(css.toString().replace('--spacing-sm: 12px;','--spacing-sm: 13px;'))],
  ['extra subscription rule',Buffer.concat([css,Buffer.from('\n#subscription-usage-settings { display: none; }\n')])],
  ['duplicate reviewed block',Buffer.concat([css,topicScoreSpacing])],
  ['duplicate isolation block',Buffer.concat([css,interruptedSettingsIsolation])],
  ['broadened isolation selector',Buffer.from(css.toString().replace('.options-footer[hidden]', '.options-footer'))],
  ['removed isolation rule',Buffer.from(css.toString().replace(interruptedSettingsIsolation.toString(),''))],
  ['extra isolation declaration',Buffer.from(css.toString().replace('#workspace-switcher[hidden] { display: none !important; }', '#workspace-switcher[hidden] { display: none !important; visibility: hidden; }'))],
  ['extra score declaration',Buffer.from(css.toString().replace('margin-inline-start: var(--spacing-sm);','margin-inline-start: var(--spacing-sm); display: none;'))]
 ]){assert.notDeepEqual(changed,css,name);assert.throws(()=>check(changed),assert.AssertionError,name);}
});


// Execute the production startup/event/tab/search code. Storage population and
// unrelated status panels are stubs; native external navigation is not modeled.
async function assertPassiveGuide(source=optionsSource,locale='en') {
 const document=createDocument(), calls=[], errors=[], stages=[];
 const registrations=[],addDocumentListener=document.addEventListener.bind(document);
 document.addEventListener=(type,handler,options)=>{
  registrations.push({type,handler,options});addDocumentListener(type,handler,options);
 };
 // This fixture models document capture explicitly; the shared helper models
 // only element bubbling. Dispatch the actual registered production callbacks,
 // without asserting native browser event/number-input behavior.
 const elementPrototype=Object.getPrototypeOf(document.body),dispatchElement=elementPrototype.dispatch;
 elementPrototype.dispatch=function(type,fields={}){
  const event={type,target:this,...fields};
  for(const registration of registrations)if(registration.type===type&&registration.options===true)registration.handler(event);
  return dispatchElement.call(this,type,fields);
 };
 // This document owns its Element class; leave the shared DOM model unchanged.
 Object.getPrototypeOf(document.body).prepend=function(...children){
  const nodes=children.flatMap(child=>child.tagName==='#FRAGMENT'?[...child.children]:[child]);
  const ordered=nodes.filter((child,index)=>nodes.lastIndexOf(child)===index);
  for(const child of ordered)child.remove();
  this.children.unshift(...ordered);
  for(const child of ordered)child.parentElement=this;
 };
 const node=(tag,id,parent=document.body)=>{const el=document.createElement(tag);el.id=id;parent.append(el);return el;};
 const host=node('section','settings-search');
 const input=node('input','settings-search-input',host);node('button','settings-search-clear',host);
 const results=node('ul','settings-search-results',host);node('p','settings-search-status',host);
 const tablist=node('aside','guide-test-tabs');tablist.className='options-tabs';
 const content=node('div','guide-test-content');content.className='options-content';
 const panels={};
 for(const [,name] of html.matchAll(/class="tab-button[^\"]*" data-tab="([^\"]+)"/g)){
  const button=node('button','guide-tab-'+name,tablist);button.className='tab-button';button.dataset.tab=name;
  const panel=node('div','tab-'+name,content);panel.className='tab-panel';panel.dataset.tab=name;panels[name]=panel;
 }
 const guide=node('section','subscription-usage-settings',panels.privacy);guide.className='settings-section';
 guide.scrollIntoView=()=>{};
 const heading=node('h2','subscription-usage-heading',guide);heading.className='section-title';
 const anchors=[...section.matchAll(/<a\b([^>]+)>[^<]+<\/a>/g)].map(([,attrs])=>{
  const values=Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([,key,value])=>[key,value]));
  const anchor=node('a',values.id,guide);for(const [key,value] of Object.entries(values))anchor.setAttribute(key,value);
  anchor.className=values.class||'';anchor.dataset.i18n=values['data-i18n'];
  anchor.href=values.href;return anchor;
 });
 const originalHrefs=anchors.map(anchor=>anchor.href);
 const record=name=>(...args)=>{calls.push(name);return Promise.resolve(false);};
 const window={location:{hash:''},matchMedia:()=>({matches:false,addEventListener(){}}),
  i18n:{t:key=>locales[locale][key]?.message||key,localizeDocument(){stages.push('localized');}},
  open:record('window.open'),addEventListener:record('window listener')};
 const chrome={permissions:{request:record('permission request'),contains:record('permission read')},
  scripting:{executeScript:record('scripting')},cookies:{getAll:record('cookies')},
  tabs:{create:record('tabs.create'),query:record('tabs.query')},runtime:{sendMessage:record('runtime message')}};
 // Browser window properties are global bindings. This VM separates the two,
 // so expose the same preloaded i18n object for production t() as well.
 const context=vm.createContext({window,document,chrome,i18n:window.i18n,storageManager:{getRecoveryAvailability:async()=>({}),set:record('storage write'),setAll:record('storage write'),saveSettingsPatch:record('storage write')},
  fetch:record('fetch'),XMLHttpRequest:record('XHR'),WebSocket:record('WebSocket'),EventSource:record('EventSource'),
  navigator:{sendBeacon:record('beacon')},setTimeout:record('timer'),clearTimeout(){},
  console:{log(){},warn(){},error:(...args)=>errors.push(args)}});
 window.document=document;window.chrome=chrome;
 vm.runInContext(searchSource,context);vm.runInContext(source,context);
 context.initializeOptionsPage=async()=>stages.push('initialized');
 context.displayStorageInfo=context.renderSyncStatus=context.renderDriveBackupPanel=async()=>{};
 context.showErrorMessage=message=>errors.push(message);
 const loaded=document.listeners.get('DOMContentLoaded')();
 const loading=document.getElementById('settings-loading-notice');
 assert(loading&&loading.parentElement===document.body&&document.body.children[0]===loading);
 assert.equal(loading.getAttribute('role'),'status');assert.equal(loading.textContent,locales[locale].settingsInitialLoading.message);
 assert.equal(document.querySelectorAll('#settings-loading-notice').length,1);
 await loaded;
 assert.equal(document.getElementById('settings-loading-notice'),null);assert.equal(loading.parentElement,null);assert.equal(loading.isConnected,false);
 // Static shell localization now precedes storage; the normal dynamic pass remains.
 assert.deepEqual(stages,['localized','initialized','localized']);assert.deepEqual(errors,[],'startup completed');
 for(const key of ['subscriptionUsageCodexOpen','subscriptionUsageGrokOpen']){
  input.value=locales[locale][key].message;input.dispatch('input');
  const matches=results.querySelectorAll('button');assert.equal(matches.length,1);
  matches[0].dispatch('click');assert(panels.privacy.classList.contains('active'));
  assert.equal(document.activeElement,heading);
 }
 for(const anchor of anchors){
  assert.equal(anchor.listeners.size,0,'native guide anchors have no script listeners');
  for(let ancestor=anchor.parentElement;ancestor;ancestor=ancestor.parentElement)assert.equal(ancestor.listeners.size,0,'no delegated guide handler');
  anchor.focus();anchor.dispatch('focus');anchor.dispatch('mouseover');anchor.dispatch('keydown',{key:'Enter'});anchor.dispatch('click');
 }
 // These are the only two reviewed non-guide document listeners. Pin both
 // callback behavior and its ownership collector: broadening selectors or
 // adding arbitrary document handlers is not an acceptable exemption.
 assert.deepEqual(registrations.map(({type})=>type),['input','change','DOMContentLoaded'],'only reviewed document handlers');
 const reviewedHandler=`event => {
    if (settingsReplacementControls().includes(event.target)) ++settingsOrdinaryInputRevision;
}`;
 for(const registration of registrations.slice(0,2)){
  assert.equal(registration.options,true,'ordinary revision handler is capture-only');
  assert.equal(registration.handler.toString(),reviewedHandler,'exact restricted ordinary revision handler');
 }
 assert.equal(crypto.createHash('sha256').update(context.settingsReplacementControls.toString()).digest('hex'),
  '5e25717c2ad0abc44bf762cf450d1d3101326ef16a77eaf36326cfc96a0982ee','exact reviewed ordinary ownership collector');
 const revision=()=>vm.runInContext('settingsOrdinaryInputRevision',context);
 const beforeGuideEvents=revision();
 for(const target of [guide,heading,...anchors])for(const type of ['input','change'])target.dispatch(type);
 assert.equal(revision(),beforeGuideEvents,'guide input/change must not write ordinary revision');
 // Positive control: an inert capture shim must not make the guide test pass.
 const owned=node('input','quote-text');
 for(const type of ['input','change']){
  const beforeOwnedEvent=revision();owned.dispatch(type);
  assert.equal(revision(),beforeOwnedEvent+1,'modeled capture reaches the ordinary owner');
 }
 owned.remove();
 assert.deepEqual(anchors.map(anchor=>anchor.href),originalHrefs,'guide URLs stay fixed');
 assert.deepEqual(anchors.map(anchor=>anchor.getAttribute('href')),originalHrefs);
 assert.deepEqual(calls,[],'startup, search, focus and guide clicks cause no JS requests or permissions');
}
for(const locale of ['en','zh_CN'])test(`guide remains passive through real Settings startup and navigation: ${locale}`,()=>assertPassiveGuide(optionsSource,locale));
test('passive-guide regression guard rejects injected requests and anchor handlers',async()=>{
 await assert.rejects(assertPassiveGuide(optionsSource+"\nfetch('https://grok.com/dashboard');"),/no JS requests/);
 await assert.rejects(assertPassiveGuide(optionsSource+"\ndocument.getElementById('subscription-usage-codex').addEventListener('click',()=>{});"),/no script listeners/);
 await assert.rejects(assertPassiveGuide(optionsSource+"\ndocument.querySelectorAll('a.btn').forEach(anchor=>anchor.addEventListener('click',()=>{}));"),/no script listeners/);
 await assert.rejects(assertPassiveGuide(optionsSource+"\nchrome.permissions.request({origins:['https:\/\/grok.com/*']});"),/no JS requests/);
});

test('passive-guide guard rejects unreviewed document handlers and expanded ordinary ownership',async()=>{
 for(const [source,reason]of [
  [optionsSource+"\ndocument.addEventListener('input',()=>{},true);",/only reviewed document handlers/],
  [optionsSource.replace("}, true);\nfunction settingsReplacementFormSnapshot()", "}, false);\nfunction settingsReplacementFormSnapshot()"),/capture-only/],
  [optionsSource.replace('if (settingsReplacementControls().includes(event.target)) ++settingsOrdinaryInputRevision;', '++settingsOrdinaryInputRevision;'),/exact restricted ordinary revision handler/],
  [optionsSource.replace(".topic-title-input, .topic-score-input, #category-manage-list .cat-name", "a, .topic-title-input, .topic-score-input, #category-manage-list .cat-name"),/exact reviewed ordinary ownership collector/]
 ]){
  assert.notEqual(source,optionsSource,'mutation must change production source');
  await assert.rejects(assertPassiveGuide(source),reason);
 }
});
