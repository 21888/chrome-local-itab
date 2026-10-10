# Editor IME Escape protection

Candidate based on `39a525a0cc8b721190b88631452f04a5fe3c438d`, 2026-10-10. Only the shared dialog keyboard helper changes at runtime; no storage, permissions, manifest version, or Finder behavior changes.

## 中文

快捷方式和待办编辑器在输入法组字期间收到 Esc 时，保留对话框、焦点和未保存草稿，不阻止输入法自身处理该按键。支持 `isComposing`、旧式 `keyCode 229`，以及按键标记缺失时的 `compositionstart`/`compositionend` 状态。状态只属于当前打开的对话框；输入框失焦、移除或对话框关闭后释放，重新打开时不会沿用。组字结束后的普通 Esc 仍会关闭对话框并恢复焦点。

自动化测试使用合成 DOM/事件及实际编辑器方法，覆盖草稿、待保存操作、重开、过期清理、叠加对话框和 Tab 焦点约束。没有验证操作系统原生输入法、候选窗口或辅助技术；发布前仍需在真实中文输入法中检查取消组字、再次 Esc 关闭及焦点恢复。

## English

During IME composition, Escape keeps shortcut/task dialogs, focus and unsaved drafts intact without preventing the IME's own default key handling. The helper recognizes `isComposing`, legacy `keyCode 229`, and `compositionstart`/`compositionend` when the key flag is absent. State belongs to one opening and clears on field blur, removal or dialog close; it does not carry into reopening. Ordinary Escape after composition still closes and restores focus.

Automated tests use synthetic DOM/events and production editor methods, covering drafts, pending saves, reopening, stale cleanup, stacked dialogs and Tab trapping. No native operating-system IME, candidate-window or assistive-technology validation is claimed. Before release, use a real Chinese IME to check composition cancellation, a subsequent Escape closing the editor, and focus restoration.

## Español

Durante la composición con un IME, Escape conserva los diálogos de accesos directos y tareas, el foco y los borradores sin guardar, y permite que el IME procese la tecla. Se reconocen `isComposing`, el código heredado `keyCode 229` y los eventos `compositionstart`/`compositionend` si falta la marca en la tecla. El estado pertenece a cada apertura y se libera al perder el foco del campo, retirarlo o cerrar el diálogo; no se conserva al reabrirlo. Escape vuelve a cerrar el diálogo y restaurar el foco tras la composición.

Las pruebas automatizadas usan DOM/eventos sintéticos y métodos reales del editor. Cubren borradores, guardados pendientes, reapertura, limpieza antigua, diálogos superpuestos y el recorrido con Tab. No se ha validado un IME nativo, su ventana de candidatos ni tecnología de asistencia. Antes de publicar, hay que comprobar con un IME chino real la cancelación de la composición, el cierre con otro Escape y la restauración del foco.

## Automated evidence

- The six flagged/229/lifecycle-only shortcut/task editor regressions fail against the unchanged baseline.
- Candidate: 761 Node tests, including 17 added regressions, and 19 Python packaging tests passed without failures or skips.
- Full JavaScript syntax checks, manifest/locale JSON parsing and patch whitespace checks passed.
- Runtime-only ZIP creation and byte-for-byte verification passed (60 files). Packaging is static verification, not browser testing.
- Existing Finder composition, lifecycle, shortcut preference, dialog-focus and editor save-session tests remain passing.

Commands: `node --test tests/*.test.js`; `python3 -m unittest discover -s tests -p '*_test.py'`; the JavaScript/JSON checks in the README; `git apply --check` and `git diff --check` on the patch; `python3 tools/package_extension.py --output /tmp/protect-ime-editor-runtime.zip` and `python3 tools/package_extension.py --verify /tmp/protect-ime-editor-runtime.zip`.
