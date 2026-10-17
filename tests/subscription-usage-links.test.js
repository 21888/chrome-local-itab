'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const vm=require('node:vm');
const {createDocument}=require('./helpers/task-dom-model');
const optionsSource=fs.readFileSync('options.js','utf8');
const searchSource=fs.readFileSync('shared/settings-search.js','utf8');
const html=fs.readFileSync('options.html','utf8');
const section=html.match(/<section\b[^>]*id="subscription-usage-settings"[\s\S]*?<\/section>/)[0];
const locales=Object.fromEntries(['en','zh_CN'].map(lang=>[lang,JSON.parse(fs.readFileSync(`_locales/${lang}/messages.json`))]));
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
 // bytes. Keep that entire historical CSS byte-for-byte as well as checking
 // the reviewed current file below; no permission or guide guard is removed.
 const originalCss=fs.readFileSync('options.css').subarray(0,42422);
 assert.equal(crypto.createHash('sha256').update(originalCss).digest('hex'),
  '2729c1d1465a5dd01fe39e659c431bb9510616b7025ca467d917ea8f1b377428','original Options CSS prefix');
 for(const [file,hash] of Object.entries(expected))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,file);
 assert.match(html,/<a\b[^>]*id="claude-usage-open"[^>]*href="claude-usage-experiment.html"/);
 const script=fs.readFileSync('shared/settings-search.js','utf8');
 assert.doesNotMatch(script,/fetch\s*\(|chrome\.permissions|chrome\.scripting|chrome\.storage|window\.open\s*\(/);
 assert.doesNotMatch(html,/<link\b[^>]*rel="(?:prefetch|preconnect|dns-prefetch)"/);
});


// Execute the production startup/event/tab/search code. Storage population and
// unrelated status panels are stubs; native external navigation is not modeled.
async function assertPassiveGuide(source=optionsSource,locale='en') {
 const document=createDocument(), calls=[], errors=[], stages=[];
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
 const context=vm.createContext({window,document,chrome,storageManager:{getRecoveryAvailability:async()=>({})},
  fetch:record('fetch'),XMLHttpRequest:record('XHR'),WebSocket:record('WebSocket'),EventSource:record('EventSource'),
  navigator:{sendBeacon:record('beacon')},setTimeout:record('timer'),clearTimeout(){},
  console:{log(){},warn(){},error:(...args)=>errors.push(args)}});
 window.document=document;window.chrome=chrome;
 vm.runInContext(searchSource,context);vm.runInContext(source,context);
 context.initializeOptionsPage=async()=>stages.push('initialized');
 context.displayStorageInfo=context.renderSyncStatus=context.renderDriveBackupPanel=async()=>{};
 context.showErrorMessage=message=>errors.push(message);
 await document.listeners.get('DOMContentLoaded')();
 assert.deepEqual(stages,['initialized','localized']);assert.deepEqual(errors,[],'startup completed');
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
 assert.deepEqual([...document.listeners.keys()],['DOMContentLoaded'],'no document-level guide handler');
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
