# Real-content template preview / 真实内容模板预览

## English

On the new-tab page, open **Browse 21 layouts** and choose a style. The existing dashboard previews that template with your current sites, categories, modules, background and card overrides. **Apply** explicitly saves the template; **Cancel**, **Close**, the disclosure summary or **Escape** ends the temporary preview. The compact template selector and the Settings gallery keep their existing immediate-save behavior. Settings diagrams are still schematic, not a live dashboard.

Preview is memory-only. It neither saves layout coordinates nor initializes missing positions/identities, changes the selected category, selects a workspace, starts Sync, requests permissions, or fetches/cache-writes favicons. Grid regrouping uses available cached icons only; Free placement uses display fitting without changing saved or hidden-view coordinates. Shortcut/category editing is temporarily unavailable while preview is active. Other module drafts and their DOM nodes stay in place; their independently authorized saves are not globally paused. Finish an active appearance/shortcut/layout edit before starting a preview.

Apply owns only the template. It checks the admitted workspace object and its generation, the settings generation, and the originally saved template under the existing local write lock. It merges into the latest appearance, preserving other own fields, and verifies the entire resulting appearance before reporting local success. For an older configuration with no appearance object, creating that object also carries forward the effective legacy color mode so dark mode is not lost. A confirmed local Apply uses the existing opt-in Chrome Sync scheduler; local success does not claim that Sync has completed. A scheduler failure cannot undo or invalidate the confirmed local save.

A changed source, replaced configuration, workspace departure or pagehide retires the local preview. Cancel reads the latest saved appearance; it never writes back an old snapshot. If a write or readback fails, the attempt is retired. The saved value may already have changed, so the message reports an unconfirmed outcome rather than claiming that nothing was saved. No automatic rollback or blind retry occurs. A new preview needs a fresh read. If current storage/workspace cannot be verified, keep drafts and reopen the page to continue safely. An Apply already submitted to storage cannot be undone by subsequently closing the chooser.

### Verification scope

`node --test tests/template-live-preview.test.js` covers 28 synthetic cases: repeated browsing/Cancel, fresh saved-view restoration, explicit and duplicate Apply, queued-source races, settings invalidation, disclosure/Close/Escape, pagehide and stale callbacks, read/write failures, current-session fencing, Settings parity, Free coordinate preservation, cached icons, pending edits and late Grid-to-Free reconciliation. Existing appearance, customization, layout, icon-session and lifecycle tests provide focused regression coverage. These are source/store/DOM-model tests; native Chromium layout, focus, scroll and extension behavior must be validated separately. No browser result is claimed here.

The keyboard cases model focus loss when controls are disabled or hidden. First admission moves a focused template choice to the existing status notice before disabling it; subsequent choices keep focus, and delayed reads never reclaim focus moved to an input or the summary. Apply's exact submitted appearance event no longer clears its confirmed local-save status. Differing color, customization, adjacent appearance revision, settings-generation and other-source events still invalidate the pending preview, even with the same template. Escape already handled by a nested control or marked as IME composition does not close the gallery or move focus out of another module's draft; a gallery-handled Escape is not handled again at the window. English and Chinese status text is checked; native keyboard navigation and screen-reader announcements are not modeled.

## 中文

在新标签页打开“浏览 21 种布局”并选择样式，即可用当前的网站、分类、模块、自定义背景和卡片设置临时试看。点击“应用”才保存模板；“取消”“关闭”、收起图库或按 Esc 都会退出预览。紧凑模板下拉框与设置页图库仍保持立即保存。设置页仍明确展示布局示意图，不冒充完整实时仪表盘。

预览只保存在内存中，不保存布局坐标、不补建位置或身份、不改变选中分类、不切换工作区、不启动同步、不请求权限，也不联网获取或写入图标缓存。网格重组只读取现有图标缓存；自由布局只调整显示适配，不改写当前或隐藏视图的坐标。预览期间暂时禁用快捷方式和分类编辑；其他模块的输入草稿和 DOM 节点保持原样，独立授权的保存不会被全局暂停。已有外观、快捷方式或布局编辑应先完成，再开始预览。

“应用”只拥有模板字段的修改权限。它在既有本地写锁内核验当前已接纳的工作区对象及代次、设置代次和原已保存模板，合并最新外观中的其他原有字段，并完整读回核验外观后才报告本地保存成功。没有 appearance 对象的旧配置首次建立该对象时，会同时保留旧主题的有效明暗模式，避免丢失暗色。确认成功的本地保存沿用既有、已启用的 Chrome 同步调度；本地保存成功不代表同步已经完成，同步调度失败也不会回滚已确认的本地保存。

来源改变、配置替换、离开工作区或 pagehide 都会使预览失效。取消时重新读取最新已保存外观，绝不回写旧快照。写入或读回失败后，该次尝试立即退役；由于保存可能已经完成，界面明确提示结果未确认，不声称“完全没有保存”。不会自动回滚或盲目重试，新预览必须重新读取。若不能核验当前存储或工作区，请保留草稿并重新打开页面。已经提交给存储的“应用”不能通过随后关闭图库撤销。

### 验证边界

测试包含 28 个合成存储与 DOM 模型用例，覆盖连续试看和取消、最新保存值恢复、明确及重复应用、等锁并发、设置替换、关闭与 Esc、pagehide 和晚回调、读写失败、会话失效、设置页原行为、自由布局坐标保真、缓存图标、待完成编辑和晚到的网格转自由布局。另运行相关既有聚焦回归。它们不等于原生 Chromium 的布局、焦点、滚动或扩展实测；浏览器验证需单独完成，本文件不声称已通过浏览器实测。

键盘用例模拟控件被禁用或隐藏后的失焦。首次读取前，图库将当前模板按钮拥有的焦点转交既有状态提示；后续选择保持按钮焦点，晚到读取不会抢回已移到输入框或图库标题的焦点。应用自身精确提交的外观事件不再清空已确认的本地保存提示。即便模板相同，明暗、自定义、相邻外观版本、设置代次或其他来源事件仍使待完成预览失效。已被内层控件处理或标记为输入法组合输入的 Esc 不会关闭图库，也不会把焦点从其他模块草稿拉走；图库已处理的 Esc 不会在窗口层再次处理。已检查中英文状态文案；模型不覆盖原生键盘导航和读屏播报。
