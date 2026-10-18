const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/task-dom-model');
const html = fs.readFileSync('newtab.html', 'utf8');
const regions = [
    ['workspace-switcher','dashboardWorkspaceLabel','Workspace','工作区'],
    ['clock-container','dashboardClockLabel','Current time and date','当前日期与时间'],
    ['search-container','search','Search','搜索'],
    ['shortcuts-container','dashboardShortcutsLabel','Quick access shortcuts','快捷方式'],
    ['info-cards-container','dashboardCardsLabel','Local information cards','本地信息卡片'],
    ['weather-container','dashboardWeatherLabel','Local weather','本地天气'],
    ['hot-container','dashboardTopicsLabel','Local hot topics','本地热点'],
    ['movie-container','dashboardMovieLabel','Movie card','电影卡片'],
    ['quote-container','dashboardQuoteLabel','Daily quote','每日语录']
];
function fixture() {
    const document = createDocument({aggregateTextContent:true});
    const tags = [html.match(/<a\b[^>]*class="skip-link"[^>]*>[^<]*<\/a>/)?.[0], ...regions.map(([id])=>html.match(new RegExp(`<\\w+\\b[^>]*id="${id}"[^>]*>`))?.[0])];
    const nodes = tags.map(markup=>{
        assert(markup, 'extract the actual production markup');
        const node=document.createElement(markup.match(/^<(\w+)/)[1]);
        for(const [,name,value] of markup.matchAll(/([\w-]+)="([^"]*)"/g)) {
            node.setAttribute(name,value); if(name==='id') node.id=value;
            if(name==='class') node.className=value;
            if(name.startsWith('data-')) node.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
        }
        node.textContent=markup.match(/>([^<]*)<\//)?.[1] || '';
        document.body.append(node);return node;
    });
    const drafts=nodes.slice(1).map((node,index)=>{const input=document.createElement('input');input.value=`  preserved draft ${index}  `;node.append(input);return input;});
    drafts[2].focus();const calls=[];let current='en';
    const forbidden=name=>()=>{calls.push(name);throw Error('unexpected '+name);};
    const catalogs=Object.fromEntries(['en','zh_CN'].map(locale=>[locale,JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`,'utf8'))]));
    const chrome={i18n:{getMessage:key=>catalogs[current][key]?.message||''},storage:{local:{get:forbidden('get'),set:forbidden('set'),remove:forbidden('remove'),clear:forbidden('clear')}}};
    const window={document};vm.runInNewContext(fs.readFileSync('i18n.js','utf8'),{document,window,chrome,fetch:forbidden('fetch'),setTimeout:forbidden('timer')});
    return {document,nodes,drafts,calls,localize(locale){current=locale;window.i18n.localizeDocument(document);}};
}
test('static dashboard navigation retains native English fallback, target and region children',()=>{
    const f=fixture();assert.equal(f.nodes[0].textContent,'Skip to shortcuts');assert.equal(f.nodes[0].getAttribute('href'),'#shortcuts-container');
    assert.equal(f.document.getElementById('shortcuts-container'),f.nodes[4]);
    for(let i=0;i<regions.length;i++)assert.equal(f.nodes[i+1].getAttribute('aria-label'),regions[i][2]);
    assert.equal(f.nodes[0].getAttribute('onclick'),undefined);assert.equal(f.nodes[0].getAttribute('tabindex'),undefined);
});
test('every static main-screen name binds to the existing localization helper without replacing children',()=>{
    const f=fixture();assert.equal(f.nodes[0].getAttribute('data-i18n'),'dashboardSkipShortcuts');
    for(let i=0;i<regions.length;i++){
        assert.equal(f.nodes[i+1].getAttribute('data-i18n-aria-label'),regions[i][1]);
        assert.equal(f.nodes[i+1].getAttribute('data-i18n'),undefined,'region contents must never be translated as textContent');
    }
});
for(const locale of ['en','zh_CN'])test(`${locale}: actual HTML navigation names localize with exact draft/focus/node preservation and zero I/O`,()=>{
    const f=fixture(),focus=f.document.activeElement;f.localize(locale);
    assert.equal(f.nodes[0].textContent,locale==='en'?'Skip to shortcuts':'跳至快捷方式');
    assert.equal(f.document.documentElement.lang,locale==='en'?'en':'zh-CN');
    for(let i=0;i<regions.length;i++){
        assert.equal(f.nodes[i+1].getAttribute('aria-label'),regions[i][locale==='en'?2:3]);
        assert.equal(f.nodes[i+1].children[0],f.drafts[i]);assert.equal(f.drafts[i].value,`  preserved draft ${i}  `);
    }
    assert.equal(f.document.activeElement,focus);assert.deepEqual(f.calls,[]);
});
test('language round trips retain exact original navigation and every content node',()=>{
    const f=fixture(),focus=f.document.activeElement;
    for(const locale of ['zh_CN','en','zh_CN']){
        f.localize(locale);assert.equal(f.nodes[0].textContent,locale==='en'?'Skip to shortcuts':'跳至快捷方式');
        assert.equal(f.nodes[4].getAttribute('aria-label'),locale==='en'?'Quick access shortcuts':'快捷方式');
        assert.equal(f.document.getElementById('shortcuts-container'),f.nodes[4]);
        assert.equal(f.document.activeElement,focus);assert.deepEqual(f.calls,[]);
    }
});
test('Clarity quote-only hides the skip link whose target is hidden without changing normal-mode navigation',()=>{
    const css=fs.readFileSync('clarity-dashboard.css','utf8');
    const rule=css.match(/:root\[data-dashboard-template="clarity"\] body\.dashboard-hidden > \.skip-link\s*\{([^}]+)\}/);
    assert(rule,'a visible skip link must not point at the hidden main area');assert.equal(rule[1].trim(),'display: none;');
    const base=fs.readFileSync('newtab.css','utf8');assert.match(base,/\.skip-link:focus\s*\{[^}]*transform: translateY\(0\);/);
    assert.match(fs.readFileSync('local-focus.css','utf8'),/body\.temporary-focus-view > \.skip-link,/);
});
