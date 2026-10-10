# Shortcut editor departure protection

## English

Reloading (including keyboard reload), navigating away or closing a tab requests
the browser's native warning while an Add/Edit shortcut has a changed title,
URL, icon or category, or a shortcut save is unresolved. Each opening captures
the initialized raw field values, including its selected category. Whitespace
changes count; restoring every exact initial value removes draft protection.
Icon changes made without input events are included. An untouched dialog,
conflict status, Delete or Undo alone does not request this warning.

Cancel, ×, backdrop clicks and ordinary Escape retain their existing deliberate
discard behavior. IME Escape retains the composing dialog as before. Dismissing
a dialog does not release its pending write; success, failure or rejection settles
that write. Failed dirty drafts remain protected. An old save cannot remove
protection from a newer dirty dialog, nor make a newer pristine dialog dirty.
A successful current save closes its editor and releases its guard.

The deferred-Sync notice's explicit Reload button keeps its existing discard
confirmation. Accepting that confirmation can also show Chrome's native warning
for a dirty shortcut, as with other protected work. Canceling either prompt keeps
the draft, and a later keyboard reload still requests protection. Pending saves
block the notice-button reload before either prompt. There is no bypass token.

The existing shared departure listener is reused. Automatic Sync reload guards
are unchanged: they still defer for any open Add/Edit dialog, including pristine
forms. No permissions, storage format, settings, unload-time write, custom native
warning text or volatile-draft persistence are added. Chrome decides whether to
show the warning, including whether sufficient interaction occurred. Choosing to
leave, forced shutdown or a suppressed warning can still lose an unsaved draft.

## 中文

刷新（含键盘刷新）、导航离开或关闭标签页时，若快捷方式新增/编辑表单的标题、
网址、图标、分类有改动，或保存尚未完成，会请求浏览器原生提醒。每次打开时以
初始化后的原始字段值为基准；空白字符差异也算改动，完全还原则不提醒。无需
触发输入事件的图标更新也能识别。未改动表单、冲突标记、删除或撤销本身不触发。

取消、×、点击遮罩和普通 Esc 仍会明确丢弃草稿；输入法组字时的 Esc 仍保留对话框。
关闭编辑器不会解除尚未完成的保存保护；失败后的脏草稿继续受保护。旧保存完成
不会解除新草稿的保护，也不会让新打开的干净表单被误判为脏。当前保存成功后解除。

Sync 延迟刷新提示中的“重新加载”按钮仍先明确确认丢弃；确认后，Chrome 还可能
显示额外的原生提醒。取消任一提醒均保留草稿，之后键盘刷新仍受保护。保存尚未
完成时，该按钮在任何确认前就会阻止刷新；不增加绕过保护的状态。

自动 Sync 刷新规则不变，仍保护所有打开的编辑器，包括未改动表单。不新增权限、
存储格式、离页保存或草稿持久化。是否显示提醒由 Chrome 决定；选择离开、强制
关闭或浏览器抑制提醒时，未保存草稿仍可能丢失。

## Español

Al recargar (también con el teclado), navegar fuera o cerrar una pestaña, se
solicita el aviso nativo cuando cambió el título, URL, icono o categoría de un
acceso directo, o cuando su guardado sigue pendiente. Se comparan los valores
originales de cada apertura, incluida la categoría inicial. Los espacios cuentan;
restaurar exactamente todos los campos elimina el aviso. Se detectan los cambios
de icono sin eventos de entrada. Un formulario intacto, un conflicto, Eliminar
o Deshacer por sí solos no activan este aviso.

Cancelar, ×, el fondo y Escape normal conservan el descarte explícito existente.
Escape durante la composición IME mantiene el diálogo. Cerrar el editor no libera
un guardado pendiente. Los borradores modificados siguen protegidos tras un fallo;
un guardado anterior no desprotege un borrador nuevo ni marca como modificado un
formulario nuevo intacto. Guardar correctamente el editor actual libera su aviso.

El botón Recargar del aviso de Sync aplazado conserva su confirmación de descarte.
Después de aceptarla, Chrome puede mostrar un segundo aviso nativo. Cancelar
cualquiera conserva el borrador y una recarga posterior con el teclado sigue
protegida. Un guardado pendiente bloquea ese botón antes de ambas confirmaciones.
No se añade ningún estado para omitir la protección.

La recarga automática por Sync conserva sus reglas, incluido aplazarla ante
formularios intactos abiertos. No se añaden permisos, formatos de almacenamiento,
guardado al salir ni persistencia de borradores. Chrome decide si muestra el aviso;
salir, forzar el cierre o suprimirlo puede perder el borrador sin guardar.

## Automated verification

`tests/shortcut-departure.test.js` executes the production shortcut methods,
modal event bindings, shared dialog helper and existing lifecycle listener with
a deferred storage/DOM model. Its 35 cases cover all four raw fields in Add and
Edit, exact reversion, no-event programmatic changes, actual icon-fetch/clear bindings, initialized category,
Cancel/×/backdrop/Escape, composition, Ctrl+R/Cmd+R/F5 event routing, notice
discard accept/cancel with subsequent departure and pending-write blocking, pending saves
on pristine forms, success/false/rejection/conflict, closed and reopened clean or
dirty editors, retry, unrelated flags, mutable links/index and retired snapshots.
Keyboard tests model the subsequent beforeunload event; they do not claim to
invoke browser chrome or a real operating-system IME.

The existing shortcut reload regression now expects the native departure request
for a dirty shortcut, while retaining its automatic Sync reload assertions.
Focused Node checks: 57 passed across departure, reload, save-session,
favicon-session, write-conflict, IME and Tasks departure files. All 35 new
departure cases fail against original 7a4069d. Both changed runtime files pass
JavaScript syntax checks. Final integration: 886 Node tests and 37 Python tests passed on the 1.1.10
release candidate. Native warning acceptance is recorded separately below.

## Native verification on 2026-10-10

Chrome for Testing 155 on Linux passed a bounded native session: pristine Add
reload, dirty-title reload warning, Stay retaining the exact draft, exact title
reversion, explicit Cancel, successful save/reload persistence, and unchanged Edit
reload. The isolated snapshot had manifest 1.1.9 plus this change; all 60 runtime
files remained unchanged. Final release source differs only by manifest 1.1.10.
29 original screenshots and a runtime hash inventory were retained with the QA
record. This is not exhaustive native coverage of every model-tested branch.

## Broader native checklist (remaining coverage is not claimed)

Use synthetic local shortcuts in an isolated unpacked extension profile with
no unrelated dirty widgets. Interact with the page before testing departure.

1. Open pristine Add and unchanged Edit; keyboard reload should not warn.
2. Change each title/URL/icon/category individually; reload and tab close should
   request Chrome's warning. Choose Stay and verify every value remains exact.
3. Restore all fields exactly; reload should not warn. Test an icon changed by
   the existing icon controls too, if online icon access is already enabled.
4. Try Cancel, ×, backdrop and ordinary Escape; reload should not warn and the
   saved shortcut must remain unchanged. During IME composition, Escape should
   preserve the draft; reload should still request a warning when text differs.
5. Save a changed shortcut, then reload without a warning and verify persistence.
6. If a controlled local storage delay/failure is available, test pending saves
   after dismissal, failure with retained draft, and reopening a new clean/dirty
   editor before the older save settles. Otherwise label these model-only.
7. With a dirty shortcut and deferred-reload notice, accept the existing custom
   discard prompt. An additional native warning is expected when Chrome elects
   to display it. Cancel either prompt and confirm the exact draft remains; a
   later Ctrl+R should still warn. A pending save must block notice-button reload.
8. Verify a deferrable configuration/Sync reload still preserves a pristine
   open editor. Do not require or enable live Sync just to run this checklist.

Warning display is browser-controlled, not guaranteed. Only the bounded native
checks above passed. Real IME, injected native failures, screen-reader behavior
and live Sync were not tested in this session.
