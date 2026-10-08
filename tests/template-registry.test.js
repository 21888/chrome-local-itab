const assert = require('node:assert/strict');
const fs = require('node:fs');
const registry = require('../shared/dashboard-template-registry.js');
assert.equal(registry.all.length,15);
assert.equal(new Set(registry.ids).size,15);
assert.deepEqual(registry.ids.slice(0,3),['clarity','graphite','folio']);
assert(Object.isFrozen(registry.all));
assert.equal(registry.get('invalid').id,'clarity');
assert(!registry.isValid('invalid'));
const css=fs.readFileSync(require('node:path').join(__dirname,'../dashboard-template-gallery.css'),'utf8');
assert.doesNotMatch(css,/@import|url\(|\.local-tasks|\.finder|\.modal|\.free-layout\s*>/);
assert.doesNotMatch(css,/!important/);
function luminance(hex) {return hex.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0)}
function contrast(a,b){let x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
let checked=0;
for(const entry of registry.all.slice(3)){
 assert(registry.localize(entry.id,'zh-CN').name);
 assert.notEqual(registry.localize(entry.id,'zh-CN').heading,registry.localize(entry.id,'en').heading);
 assert(Object.isFrozen(entry.recommendedModules));
 for(const mode of ['light','dark']){
 const marker=`:root[data-dashboard-template="${entry.id}"][data-color-mode="${mode}"]`;
 const body=css.slice(css.indexOf(marker)).split('{')[1].split('}')[0];
 const tokens=Object.fromEntries([...body.matchAll(/--template-([a-z-]+):(#[a-f0-9]+);/g)].map(m=>[m[1],m[2]]));
 for(const background of ['page','surface','surface-raised'])for(const foreground of ['text','muted'])assert(contrast(tokens[foreground],tokens[background])>=4.5,`${entry.id} ${mode} ${foreground}/${background}`);
 assert(contrast(tokens['accent-ink'],tokens.accent)>=4.5,`${entry.id} ${mode} accent ink`);
 for(const foreground of ['text','muted'])assert(contrast(tokens[foreground],tokens['accent-soft'])>=4.5,`${entry.id} ${mode} ${foreground}/active category`);
 for(const background of ['page','surface','surface-raised','accent-soft'])assert(contrast(tokens.accent,tokens[background])>=4.5,`${entry.id} ${mode} accent/${background}`);
 checked++;
 }
}
console.log(`PASS: 15 immutable templates, 12 bilingual additions, ${checked} palettes with 13 AA role checks each, no network/host/free-plane CSS`);

const toolbarRules = css.split('}').filter(rule => rule.includes('.shortcuts-header'));
assert.equal(toolbarRules.length, 2);
for (const rule of toolbarRules) {
 for (const entry of registry.all.slice(3)) assert(rule.includes(`[data-dashboard-template="${entry.id}"]`));
 for (const id of registry.ids.slice(0, 3)) assert(!rule.includes(`[data-dashboard-template="${id}"]`));
}
assert(toolbarRules.some(rule => rule.includes('flex-direction:row') && rule.includes('flex-wrap:wrap')));
assert(toolbarRules.some(rule => rule.includes('min-width:0') && rule.includes('max-width:100%') && rule.includes('overflow-wrap:anywhere')));
