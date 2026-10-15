'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
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
 for(const [file,hash] of Object.entries(expected))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,file);
 assert.match(html,/<a\b[^>]*id="claude-usage-open"[^>]*href="claude-usage-experiment.html"/);
 const script=fs.readFileSync('shared/settings-search.js','utf8');
 assert.doesNotMatch(script,/fetch\s*\(|chrome\.permissions|chrome\.scripting|chrome\.storage|window\.open\s*\(/);
 assert.doesNotMatch(html,/<link\b[^>]*rel="(?:prefetch|preconnect|dns-prefetch)"/);
});
