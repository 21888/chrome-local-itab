const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createDocument}=require('./helpers/task-dom-model');
function model() {
 const document=createDocument(),context={window:{}};vm.createContext(context);
 vm.runInContext(fs.readFileSync('shared/dialog-focus.js','utf8'),context);
 const create=(tag,parent,focusable=false)=>{
  const node=document.createElement(tag);if(focusable)node.setAttribute('tabindex','0');
  // Model the observed Chrome case: layout rectangles are insufficient to
  // decide whether descendants of a closed details can receive native Tab.
  node.getClientRects=()=>node.isConnected ? [{}] : [];
  parent.append(node);return node;
 };
 const overlay=create('div',document.body),first=create('button',overlay),details=create('details',overlay);
 const summary=create('summary',details,true),link=create('a',details,true);link.setAttribute('href','https://example.com/');
 context.window.LocalItabDialog.open(overlay,first,()=>{});
 return {document,create,overlay,first,details,summary,link};
}
const tab=(node,shiftKey=false)=>{node.focus();return node.dispatch('keydown',{key:'Tab',shiftKey});};
test('closed-details links with nonzero rectangles do not move the dialog boundary beyond summary',()=>{
 const h=model();assert.equal(h.link.getClientRects().length,1);
 assert.equal(tab(h.summary).prevented,true);assert.ok(h.document.activeElement===h.first);
 assert.equal(tab(h.first,true).prevented,true);assert.ok(h.document.activeElement===h.summary);
 h.details.open=true;assert.equal(tab(h.summary).prevented,false);
 assert.equal(tab(h.link).prevented,true);assert.ok(h.document.activeElement===h.first);
 tab(h.first,true);assert.ok(h.document.activeElement===h.link);
 h.details.open=false;tab(h.first,true);assert.ok(h.document.activeElement===h.summary);
});
test('a nested closed details inside an open ancestor keeps its own summary but excludes its body',()=>{
 const h=model();h.details.open=true;
 const nested=h.create('details',h.details),summary=h.create('summary',nested,true),link=h.create('a',nested,true);link.setAttribute('href','https://example.com/nested');
 tab(h.first,true);assert.ok(h.document.activeElement===summary);
 assert.equal(tab(summary).prevented,true);assert.ok(h.document.activeElement===h.first);
 nested.open=true;tab(h.first,true);assert.ok(h.document.activeElement===link);
 h.details.open=false;tab(h.first,true);assert.ok(h.document.activeElement===h.summary);
});
test('closed ancestors allow only their first direct summary subtree, including nested controls',()=>{
 const h=model();const extra=h.create('button',h.summary);
 h.create('summary',h.details,true);h.create('button',h.details);
 tab(h.first,true);assert.ok(h.document.activeElement===extra);
 assert.equal(tab(extra).prevented,true);assert.ok(h.document.activeElement===h.first);
 // A nested closed details within the visible summary must also apply its own
 // disclosure boundary; an outer summary is not a blanket visibility escape.
 const nested=h.create('details',h.summary),inner=h.create('summary',nested,true);h.create('button',nested);
 tab(h.first,true);assert.ok(h.document.activeElement===inner);
});
test('a closed details without summary excludes its body and does not hide a later sibling',()=>{
 const h=model(),without=h.create('details',h.overlay);h.create('button',without);
 tab(h.first,true);assert.ok(h.document.activeElement===h.summary);
 const sibling=h.create('button',h.overlay);tab(h.first,true);assert.ok(h.document.activeElement===sibling);
 assert.equal(tab(sibling).prevented,true);assert.ok(h.document.activeElement===h.first);
});
