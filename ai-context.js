/* New-tab entry: all source reads and model setup begin only after opening. */
(function (root) {
    'use strict';
    const trigger = root.document.getElementById('ai-context-entry'); if (!trigger) return;
    const t = (key, fallback) => { const value = root.i18n?.t(key); return value && value !== key ? value : fallback; };
    let current = null;
    trigger.addEventListener('click', () => {
        if (current) return;
        const doc = root.document, overlay = doc.createElement('div'), panel = doc.createElement('section');
        overlay.className = 'ai-context-overlay'; panel.className = 'ai-context-dialog';
        panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', t('aiContextEntry', 'AI context Q&A'));
        const close = doc.createElement('button'), notice = doc.createElement('p'), host = doc.createElement('div');
        close.type = 'button'; close.className = 'ai-context-close'; close.textContent = t('aiContextClose', 'Close');
        notice.setAttribute('role', 'status'); panel.append(close, notice, host); overlay.append(panel); doc.body.append(overlay);
        let view, controller, cleanup, closed = false;
        const dispose = (restore = true) => {
            if (closed) return; closed = true; view?.destroy(); cleanup?.(restore); overlay.remove(); current = null; root.aiContextView = null;
            root.removeEventListener('pagehide', onHide);
        };
        const finish = () => {
            if (controller?.busy && !controller.aborter) { notice.textContent = t('aiContextSaving', 'Wait for the current save to finish before closing.'); return; }
            if (view?.hasUncommittedWork() && !root.confirm(t('aiContextDiscard', 'Stop any model request and discard this unsaved response? Already confirmed writes remain saved.'))) return;
            dispose();
        };
        const onHide = () => dispose(false);
        current = overlay; close.addEventListener('click', finish);
        cleanup = root.LocalItabDialog.open(overlay, close, finish);
        root.addEventListener('pagehide', onHide);
        try {
            controller = root.LocalItabAIContext.createController({ workspaces: root.LocalItabWorkspaces, tasks: root.LocalItabTasks,
                collections: root.LocalItabAICollections, scratchpad: root.LocalItabScratchpad, transport: root.LocalItabAIModel, permissions: root.chrome.permissions });
            view = root.LocalItabAIContextView.mount(host, { controller, t });
            root.aiContextView = { get pending() { return controller.busy; }, hasUncommittedWork: () => !closed, destroy: dispose };
        } catch (_) { notice.textContent = t('aiContextUnavailable', 'This workspace is not ready. Close this panel and try again after it has loaded.'); }
    });
})(window);
