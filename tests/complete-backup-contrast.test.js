const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync('complete-backup.css', 'utf8');
const selector = '.complete-backup .complete-backup-apply.btn-danger';
function block(s) { const at=css.indexOf(s+' {'); assert(at>=0,s); return css.slice(at+s.length+2,css.indexOf('}',at)); }
function luminance(hex) { const c=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722; }
function contrast(a,b) { const [hi,lo]=[luminance(a),luminance(b)].sort((a,b)=>b-a);return(hi+.05)/(lo+.05); }
for(const [mode,surface,s] of [['light','#ffffff',selector],['dark','#222728',':root[data-color-mode="dark"] '+selector]]) {
    const rules=block(s),value=name=>rules.match(new RegExp(`--backup-action-${name}: (#[0-9a-f]{6});`))?.[1];
    for(const [state,text,bg] of [['normal','text','bg'],['hover','text','hover'],['disabled','disabled-text','disabled-bg']]) test(`${mode} replacement ${state} uses opaque colors above 4.5:1`,()=>{
        assert(value(text));assert(value(bg));const ratio=contrast(value(text),value(bg));assert(ratio>=4.5,`${ratio.toFixed(2)}:1`);console.log(`${mode} ${state}: ${ratio.toFixed(2)}:1`);
    });
    test(`${mode} replacement focus outline contrasts with adjacent surface`,()=>{assert(contrast(value('focus'),surface)>=3);});
}
test('backup-specific selectors override legacy danger paint without changing unrelated controls',()=>{
    const base=block(selector);for(const rule of ['color: var(--backup-action-text);','background: var(--backup-action-bg);','opacity: 1;'])assert(base.includes(rule));
    assert(!css.match(/^\.btn-danger\s*\{/m));
    const html=fs.readFileSync('options.html','utf8');assert(html.indexOf('complete-backup.css')>html.indexOf('options.css'));
    assert(block(selector+':hover:not(:disabled)').includes('background: var(--backup-action-hover);'));
});
test('disabled replacement does not dim text or animate; keyboard focus remains visible',()=>{
    const disabled=block(selector+':disabled');for(const rule of ['opacity: 1;','cursor: not-allowed;','transform: none;','box-shadow: none;','color: var(--backup-action-disabled-text);','background: var(--backup-action-disabled-bg);'])assert(disabled.includes(rule));
    const focus=block(selector+':focus-visible');assert(focus.includes('outline: 2px solid var(--backup-action-focus);'));assert(focus.includes('outline-offset: 4px;'));
});
