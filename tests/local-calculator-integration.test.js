const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {createDocument} = require('./helpers/task-dom-model');
function mount(engine='google',custom='',locale='en') {
    const document=createDocument(), calls=[], writes=[];
    document.body.prepend=(...nodes)=>document.body.append(...nodes);
    const host=document.createElement('section');host.id='search-container';document.body.append(host);
    const messages=JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`,'utf8'));
    const window={addEventListener(){},open(...args){calls.push(args)},location:{reload(){calls.push(['reload'])}},confirm(){return false}};
    const context={window,document,URL,console,encodeURIComponent,storageManager:{async set(...args){writes.push(args);return true}},i18n:{t:key=>messages[key]?.message||key}};
    const forbidden = () => { throw new Error('Unexpected calculator I/O'); };
    context.fetch=forbidden; window.fetch=forbidden; window.open= (...args)=>calls.push(args);
    context.XMLHttpRequest=forbidden; context.localStorage={getItem:forbidden,setItem:forbidden};
    window.navigator={sendBeacon:forbidden};
    window.i18n=context.i18n;window.storageManager=context.storageManager;
    vm.createContext(context);
    for(const file of ['shared/search-template.js','shared/local-calculator.js','shared/local-content-lifecycle.js','newtab.js'])vm.runInContext(fs.readFileSync(file,'utf8'),context);
    context.initializeSearchComponent({engine,custom});
    const input=host.querySelector('.search-input'),form=host.querySelector('form'),status=host.querySelector('.search-calculator-status');
    const edit=value=>{input.value=value;input.dispatch('input');};
    const submit=()=>{const e=form.dispatch('submit');assert(e.prevented);};
    return {context,window,document,host,input,form,status,calls,writes,edit,submit};
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
const html=fs.readFileSync('newtab.html','utf8');assert(html.indexOf('shared/local-calculator.js')<html.indexOf('src="newtab.js"'));
assert.match(fs.readFileSync('newtab.css','utf8'),/\.search-calculator-status\s*\{[^}]*grid-column:\s*1\s*\/\s*-1/);
console.log('PASS: actual search initializer, all engines/locales, no expression navigation or storage, repeated submit, edits, IME, focus, URL/search regressions, reload ownership and script/CSS wiring');

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
