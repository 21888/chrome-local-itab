const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const css=fs.readFileSync('dashboard-templates.css','utf8');
const selector=':root:is([data-dashboard-template="clarity"], [data-dashboard-template="graphite"], [data-dashboard-template="folio"]) #dashboard .shortcuts-header';
function contract(source) {
 const start=source.indexOf(selector+' {');assert.notEqual(start,-1);
 const body=source.slice(start).split('{')[1].split('}')[0];
 const declarations=Object.fromEntries(body.split(';').filter(s=>s.includes(':')).map(s=>s.split(':').map(x=>x.trim())));
 assert.equal(declarations.padding,'6px');assert.equal(declarations['flex-direction'],'row');assert.equal(declarations['flex-wrap'],'wrap');
 assert.equal(/focus/.test(selector),false,'space must be constant, not appear only on focus');
}
test('original three shortcut toolbars reserve constant six-pixel space for outside focus outlines',()=>{contract(css);});
test('missing or later-zero toolbar padding fails the targeted static contract',()=>{
 assert.throws(()=>contract(css.replace('  padding: 6px;','')));
 assert.throws(()=>contract(css.replace('  padding: 6px;','  padding: 6px; padding: 0;')));
});
test('toolbar focus fix keeps the clipping container and existing outside focus style',()=>{
 const base=fs.readFileSync('newtab.css','utf8'),nav=fs.readFileSync('navigation-library.css','utf8');
 assert.match(base,/\.clock-section,\s*\.search-section,\s*\.shortcuts-section,\s*\.quote-section\s*\{[^}]*overflow:\s*hidden/);
 assert.match(nav,/\.navigation-library-opener:focus-visible\s*\{[^}]*outline:\s*3px[^}]*outline-offset:\s*3px/);
});
