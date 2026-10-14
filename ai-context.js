/* Shared local dialog host. Opening never sends, copies or saves a request. */
(function (root) {
    'use strict';
    const trigger = root.document.getElementById('ai-context-entry');
    const collectionHost = root.document.getElementById('collection-library');
    if (!trigger && !collectionHost) return;
    const t = (key, fallback) => { const value = root.i18n?.t(key); return value && value !== key ? value : fallback; };
    let current = null, incoming = false;
    function open(collectionRequest, collectionCurrent) {
        if (current) return false;
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
            if (view?.hasUncommittedWork() && !root.confirm(t('aiContextDiscard', 'Stop any model request and discard this unsaved draft or response? Already confirmed writes remain saved.'))) return;
            dispose();
        };
        const onHide = () => dispose(false);
        current = { overlay, dispose, get view() { return view; }, get controller() { return controller; } };
        close.addEventListener('click', finish);
        cleanup = root.LocalItabDialog.open(overlay, close, finish);
        root.addEventListener('pagehide', onHide);
        try {
            controller = root.LocalItabAIContext.createController({ workspaces: root.LocalItabWorkspaces, tasks: root.LocalItabTasks,
                collections: root.LocalItabAICollections, scratchpad: root.LocalItabScratchpad, transport: root.LocalItabAIModel, permissions: root.chrome.permissions });
            view = root.LocalItabAIContextView.mount(host, { controller, t, collectionRequest, collectionCurrent });
            root.aiContextView = { get pending() { return controller.busy || Boolean(view.pending); }, hasUncommittedWork: () => !closed, destroy: dispose };
            return true;
        } catch (_) { notice.textContent = t('aiContextUnavailable', 'This workspace is not ready. Close this panel and try again after it has loaded.'); return false; }
    }
    trigger?.addEventListener('click', () => { if (!incoming) open(); });
    root.LocalItabAIContextEntry = { async openCollection(value) {
        const reference = root.LocalItabAIContext.collectionReference(value), shelf = root.localCollectionsView;
        if (!reference || incoming || !collectionHost || !shelf?.canContinueContext(reference)) return false;
        const session = root.LocalItabWorkspaces.session;
        const previous = current, generation = shelf.controller.readGeneration, state = shelf.controller.state, detail = shelf.detailGeneration;
        const blocked = () => current !== previous || previous?.view?.pending || previous?.controller?.busy || previous?.controller?.taskCommand || previous?.controller?.saveCommand;
        if (blocked()) return false;
        if (previous?.view?.hasUncommittedWork() && !root.confirm(t('aiContextDiscard', 'Stop any model request and discard this unsaved draft or response? Already confirmed writes remain saved.'))) return false;
        const sameDraft = previous?.view?.captureDraft?.();
        incoming = true;
        // Readiness can wait before any dialog exists to own departure handling.
        // Once hidden or left, this request must not revive on a later return.
        let departed = false;
        const leave = () => { departed = true; };
        const visibility = () => { if (root.document.visibilityState === 'hidden') leave(); };
        root.addEventListener('pagehide', leave);
        root.document.addEventListener('visibilitychange', visibility);
        try {
            const sourceCurrent = () => !departed && !session.invalidated && root.LocalItabWorkspaces.session === session && shelf === root.localCollectionsView && shelf.canContinueContext(reference) &&
                shelf.controller.readGeneration === generation && shelf.controller.state === state && shelf.detailGeneration === detail;
            await session.readyExisting();
            if (blocked() || !sourceCurrent() || (sameDraft && !sameDraft())) return false;
            previous?.dispose();
            return open(reference, sourceCurrent);
        } catch (_) {
            if (shelf === root.localCollectionsView && !shelf.destroyed) shelf.status.textContent = t('aiContextCollectionWorkspace', 'This workspace is not ready for context Q&A. Open the normal new-tab page to finish its existing setup or recovery, then return here. The collection and drafts are unchanged.');
            return false;
        } finally {
            root.removeEventListener('pagehide', leave);
            root.document.removeEventListener('visibilitychange', visibility);
            incoming = false;
        }
    } };
})(window);
