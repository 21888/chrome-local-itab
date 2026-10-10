const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createDocument} = require('./helpers/task-dom-model');
function mount(engine='google',custom='',locale='en') {
    const document=createDocument(), calls=[], writes=[], io=[];
    document.body.prepend=(...nodes)=>document.body.append(...nodes);
    const host=document.createElement('section');host.id='search-container';document.body.append(host);
    const messages=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`,'utf8'));
    const window={addEventListener(){},open(...args){calls.push(args)},location:{reload(){calls.push(['reload'])}},confirm(){return false}};
    const context={window,document,URL,console,encodeURIComponent,storageManager:{async set(...args){writes.push(args);return true}},i18n:{t:key=>messages[key]?.message||key}};
    const forbidden = () => { io.push('forbidden'); throw new Error('Unexpected calculator I/O'); };
    context.fetch=forbidden; window.fetch=forbidden; window.open= (...args)=>calls.push(args);
    context.XMLHttpRequest=forbidden; context.localStorage={getItem:forbidden,setItem:forbidden};
    window.navigator={sendBeacon:forbidden,clipboard:{writeText:forbidden,readText:forbidden}};
    context.navigator=window.navigator; document.execCommand=forbidden;
    window.i18n=context.i18n;window.storageManager=context.storageManager;
    vm.createContext(context);
    for(const file of ['shared/search-template.js','shared/local-calculator.js','shared/local-content-lifecycle.js','newtab.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
    context.initializeSearchComponent({engine,custom});
    const input=host.querySelector('.search-input'),form=host.querySelector('form'),status=host.querySelector('.search-calculator-status');
    const edit=value=>{input.value=value;input.dispatch('input');};
    const submit=()=>{const e=form.dispatch('submit');assert(e.prevented);};
    const output=host.querySelector('.search-calculator-output'),value=host.querySelector('.search-calculator-value');
    // This test-local stub models only selection and focus events, not native copy.
    value.select=()=>{value.selectionStart=0;value.selectionEnd=value.value.length;};
    const focusResult=()=>{value.focus();if(document.activeElement===value)value.dispatch('focus');};
    return {context,window,document,host,input,form,status,output,value,focusResult,calls,writes,io,edit,submit};
}
for(const locale of ['en','zh_CN'])for(const engine of ['google','bing','duck','custom']){
    const h=mount(engine,'',locale);h.input.focus();
    assert.equal(h.input.getAttribute('aria-describedby'),`${h.status.id} search-open-status`);
    assert.equal(h.status.getAttribute('role'),'status');
    for(const expression of ['=1+2','=1/0','=foo','=https://example.com','=1'+' '.repeat(256),'=',' =1+(2*3)']){
        h.edit(expression);h.submit();h.submit();
        assert.equal(h.calls.length,0);assert.equal(h.writes.length,0);
        assert.equal(h.document.activeElement,h.input,'status must not steal focus, including missing custom URL');
        assert(h.status.textContent.length>0);assert(!h.status.textContent.startsWith('calculator'));
    }
    assert(h.status.textContent.endsWith('= 7'));
    h.edit('=4');assert(!h.status.textContent.endsWith('= 7'),'edit clears result');
    h.submit();assert(h.status.textContent.endsWith('= 4'));
    h.edit('=1/0');h.submit();assert(h.status.classList.contains('is-error'));
    h.edit('=5');assert(!h.status.classList.contains('is-error'));
    h.input.dispatch('compositionstart');h.submit();assert(!h.status.textContent.endsWith('= 5'));
    assert(h.input.dispatch('keydown',{key:'Enter',isComposing:true}).prevented);
    h.input.dispatch('compositionend');h.submit();assert(h.status.textContent.endsWith('= 5'));
    h.window.LocalItabCalculator = { calculate() { throw new Error('private internal details'); } };
    h.submit();assert(h.status.classList.contains('is-error'));assert(!h.status.textContent.includes('private internal details'));assert.equal(h.calls.length,0);
    delete h.window.LocalItabCalculator;h.submit();assert(h.status.classList.contains('is-error'));assert.equal(h.calls.length,0);
}
for(const [engine,custom,expected] of [
    ['google','','https://www.google.com/search?q=cats%20%26%20dogs'],
    ['bing','','https://www.bing.com/search?q=cats%20%26%20dogs'],
    ['duck','','https://duckduckgo.com/?q=cats%20%26%20dogs'],
    ['custom','https://example.com/?q=%s','https://example.com/?q=cats%20%26%20dogs']
]){
    const h=mount(engine,custom);h.edit('cats & dogs');h.submit();assert.equal(h.calls[0][0],expected);
    h.edit('example.com/path');h.submit();assert.equal(h.calls[1][0],'https://example.com/path');
    h.edit('https://example.com/?q=x');h.submit();assert.equal(h.calls[2][0],'https://example.com/?q=x');
    h.edit('');h.submit();assert.equal(h.calls.length,3);
    h.edit('1+2');h.submit();assert.equal(h.calls.length,4,'no implicit calculation');
    h.edit('1e2');h.submit();assert.equal(h.calls.length,5,'scientific text without = stays search');
    assert(h.calls[4][0].endsWith('q=1e2'));
}
{
 const h=mount('custom');h.edit('ordinary search');h.submit();assert.equal(h.calls.length,0);assert.equal(h.document.activeElement,h.host.querySelector('.search-custom-input'));
}
{
 const h=mount();h.edit('=123+4');h.submit();const lifecycle=h.window.LocalItabContentLifecycle;
 assert.equal(lifecycle.reload(),false);assert.equal(h.calls.length,0);assert.equal(h.input.value,'=123+4');
 h.document.querySelector('.local-content-reload-notice button').dispatch('click');assert.equal(h.calls.length,0,'declining discard preserves input');
 h.window.confirm=()=>true;h.document.querySelector('.local-content-reload-notice button').dispatch('click');assert.equal(h.calls.length,1);
 h.edit('ordinary');assert.equal(lifecycle.hasUncommittedWork(),true,'ordinary unfinished search also owns its draft');
 h.edit('=2');h.context.initializeSearchComponent({});assert.equal(lifecycle.hasUncommittedWork(),false,'remount cannot retain detached input guard');
}
// Real initializer output lifecycle, exact selectable values, and local ownership.
for (const locale of ['en','zh_CN']) {
 const h=mount('custom','',locale);
 assert.equal(h.output.hidden,true);assert.equal(h.value.value,'');
 assert.equal(h.value.readOnly,true);assert.equal(h.value.type,'text');
 assert.equal(h.value.tabIndex,0);assert.equal(h.value.parentElement,h.output);
 const messages=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`,'utf8'));
 assert.equal(h.output.querySelector('span').textContent,messages.calculatorCopyResult.message);
 for (const [expression, expected] of [['=0','0'],['=-12','-12'],['=1/8','0.125'],['=0.1+0.2','0.30000000000000004'],['=1000000000000000000000','1e+21'],['=1/10000000','1e-7']]) {
  h.input.focus();h.edit(expression);h.submit();
  assert.equal(h.output.hidden,false);assert.equal(h.value.value,expected);
  assert.equal(h.document.activeElement,h.input,'calculation never autofocuses output');
  h.focusResult();assert.equal(h.document.activeElement,h.value);
  assert.equal(h.value.value.slice(h.value.selectionStart,h.value.selectionEnd),expected,'native copy selection is the unformatted number only');
  for (const key of [{key:'c',ctrlKey:true},{key:'c',metaKey:true},{key:'a',ctrlKey:true}]) assert(!h.value.dispatch('keydown',key).prevented,'native selection/copy keys remain untouched');
  for (const flags of [{},{repeat:true},{isComposing:true}]) assert(h.value.dispatch('keydown',{key:'Enter',...flags}).prevented,'output Enter cannot implicitly submit');
  assert.equal(h.value.value,expected);assert.equal(h.input.value,expression);
  assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(),true,'selecting output retains expression ownership');
  h.input.focus();h.submit();assert.equal(h.value.value,expected,'repeat calculation stays exact');
  const literal=h.value.value;
  h.edit('=('+literal+')*1');h.submit();
  assert.equal(h.output.hidden,false);assert.equal(h.value.value,expected,'displayed result can be reused in arithmetic');
  assert.equal(h.calls.length,0);assert.equal(h.writes.length,0);assert.equal(h.io.length,0);
  h.edit(expression+' ');assert.equal(h.output.hidden,true);assert.equal(h.value.value,'');
 }
 for(const expression of ['=1/0','=foo','=1e+','=','='+ '9'.repeat(257)]) {
  h.edit('=2');h.submit();h.edit(expression);h.submit();
  assert.equal(h.output.hidden,true);assert.equal(h.value.value,'');assert(h.status.classList.contains('is-error'));
 }
 h.edit('=3');h.submit();h.input.dispatch('compositionstart');
 assert.equal(h.output.hidden,true);assert.equal(h.value.value,'');h.submit();assert.equal(h.output.hidden,true);
 h.input.dispatch('compositionend');assert.equal(h.output.hidden,true);h.submit();assert.equal(h.value.value,'3');
 h.window.LocalItabCalculator={calculate(){throw new Error('private')}};h.submit();assert.equal(h.output.hidden,true);assert.equal(h.value.value,'');
 delete h.window.LocalItabCalculator;h.submit();assert.equal(h.output.hidden,true);
 assert.deepEqual(h.calls,[]);assert.deepEqual(h.writes,[]);assert.deepEqual(h.io,[]);
}
{
 const h=mount();h.edit('=42');h.submit();h.focusResult();
 h.context.initializeSearchComponent({});
 assert.equal(h.output.hidden,true);assert.equal(h.value.value,'','remount clears detached output too');
 assert.equal(h.host.querySelector('.search-calculator-output').hidden,true);
 assert.equal(h.host.querySelector('.search-calculator-value').value,'');
 assert.equal(h.window.LocalItabContentLifecycle.hasUncommittedWork(),false);
 h.submit();h.value.dispatch('focus');assert.equal(h.value.value,'');assert.deepEqual(h.calls,[]);
}
for(const reenter of ['edit','remount']) {
 const h=mount();h.edit('=1');
 h.window.LocalItabCalculator={calculate(){if(reenter==='edit')h.edit('=2');else h.context.initializeSearchComponent({});return {value:1};}};
 h.submit();assert.equal(h.output.hidden,true);assert.equal(h.value.value,'','obsolete calculation cannot publish a result');
}
{
 const h=mount();h.edit('=2');h.submit();h.edit('ordinary');assert.equal(h.output.hidden,true);assert.equal(h.value.value,'');
 h.submit();assert.equal(h.calls.length,1);assert.equal(h.output.hidden,true);
}
const html=fs.readFileSync('newtab.html','utf8');assert(html.indexOf('shared/local-calculator.js')<html.indexOf('src="newtab.js"'));
assert.match(fs.readFileSync('newtab.css','utf8'),/\.search-calculator-status\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
const css=fs.readFileSync('newtab.css','utf8');
assert.match(css,/\.search-calculator-output\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
assert.match(css,/\.search-calculator-output\[hidden\]\s*\{\s*display:\s*none/);
assert.match(css,/\.search-calculator-value\s*\{[^}]*min-width:\s*0[^}]*var\(--text-primary\)/);
console.log('PASS: exact keyboard-selectable calculator output, stale clearing and ownership; actual search initializer, all engines/locales, no expression navigation or storage, repeated submit, edits, IME, focus, URL/search regressions, reload ownership and script/CSS wiring');

(async () => {
 const h=mount(), events=[]; let pulls=0;
 Object.assign(h.context.storageManager,{syncMetaKey:'meta',syncChunkPrefix:'chunk',syncIdentityStateKey:'guard',getSyncCompatibilityStatus:async()=>null,shouldIgnoreRemoteSyncChange:async()=>false,pullFromSync:async()=>{pulls++;return {applied:true}}});
 h.context.chrome={storage:{onChanged:{addListener:fn=>events.push(fn)}}};
 h.context.setupCloudSyncChangeListener(); h.edit('=42/7'); h.submit();
 await events[0]({meta:{newValue:{}}},'sync');
 assert.equal(pulls,1);assert.equal(h.calls.length,0);assert.equal(h.input.value,'=42/7');assert(h.status.textContent.endsWith('= 6'));
 h.edit('');await events[0]({meta:{newValue:{}}},'sync');assert.equal(h.calls.length,1);assert.equal(h.calls[0][0],'reload');
 console.log('PASS: real applied Sync listener defers reload for calculator input and releases after clearing');
})().catch(error=>{console.error(error);process.exitCode=1;});
