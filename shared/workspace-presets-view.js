(function (root) {
    'use strict';
    const t = (key, fallback) => { const value = root.i18n?.t(key); return value && value !== key ? value : fallback; };
    function mount(host, { store, getTemplate = () => root.appearanceController?.confirmed.template, isAppearancePending = () => Boolean(root.appearanceController?.pending || root.appearanceController?.refreshing) } = {}) {
        const doc = host.ownerDocument;
        let preview = null, generation = 0, pending = null, phase = '', closed = false, focusIntent = null;
        const make = (tag, text, parent = host) => { const node = doc.createElement(tag); node.textContent = text; parent.append(node); return node; };
        make('h3', t('workspacePresetTitle', 'Recommended modules'));
        make('p', t('workspacePresetHelp', 'Preview Tasks and Focus timer visibility for the selected template. Applying a visual template alone never changes these modules.'));
        const review = make('button', t('workspacePresetReview', 'Preview recommended modules')); review.type = 'button';
        const panel = make('div', ''); panel.hidden = true;
        const summary = make('p', '', panel), list = make('ul', '', panel); summary.tabIndex = -1;
        make('p', t('workspacePresetBoundary', 'Only visibility changes on this device. Tasks, previous copies, timer duration and session, sites, positions and appearance stay unchanged. A hidden running timer keeps counting. Settings backups and Sync do not carry these modules.'), panel);
        const apply = make('button', t('workspacePresetApply', 'Apply recommended modules'), panel); apply.type = 'button';
        const cancel = make('button', t('workspacePresetCancel', 'Cancel'), panel); cancel.type = 'button';
        const status = make('p', ''); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.tabIndex = -1;
        for (const button of [review, apply, cancel]) {
            button.className = 'workspace-preset-button';
            button.addEventListener('keydown', event => { if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault(); });
        }
        function controls() { review.disabled = Boolean(pending); apply.disabled = Boolean(pending) || !preview; cancel.disabled = phase === 'applying'; host.setAttribute('aria-busy', String(Boolean(pending))); }
        function dismiss(restoreFocus = false) { generation++; preview = null; panel.hidden = true; controls(); if (restoreFocus) review.focus(); }
        function moveFocus(node) {
            const intent = focusIntent;
            if (intent?.valid && !closed && !doc.hidden && host.isConnected && host.getClientRects().length &&
                (doc.activeElement === intent.origin || doc.activeElement === doc.body)) node.focus();
        }
        function fail(error) {
            if (closed) return;
            dismiss();
            status.textContent = error.code === 'CONFLICT' ? t('workspacePresetConflict', 'Tasks or timer changed. Preview again before applying.') :
                error.code === 'CANCELLED' ? t('workspacePresetCancelled', 'Preview cancelled. Choose the template and preview again.') :
                t('workspacePresetError', 'Could not confirm the result. Some visibility changes may have saved. Preview again to check the current state; nothing will be retried automatically.');
            moveFocus(status);
        }
        function run(action, nextPhase = 'reading') {
            if (closed) return Promise.resolve();
            if (pending) return pending;
            phase = nextPhase;
            const origin = nextPhase === 'applying' ? apply : review;
            const intent = { origin, valid: doc.activeElement === origin }; focusIntent = intent;
            const cancelFocus = () => { intent.valid = false; };
            const moved = event => { if (event.target !== origin && event.target !== doc.body) cancelFocus(); };
            const key = event => { if (!(event.repeat && ['Enter', ' '].includes(event.key))) cancelFocus(); };
            doc.addEventListener('pointerdown', cancelFocus, true);
            doc.addEventListener('keydown', key, true);
            doc.addEventListener('focusin', moved, true);
            doc.addEventListener('visibilitychange', cancelFocus, true);
            root.addEventListener?.('blur', cancelFocus);
            // Deferring lets pending protect even synchronously failing initialization.
            pending = Promise.resolve().then(() => { if (!closed) return action(); }).catch(fail).finally(() => {
                pending = null; phase = ''; controls();
                doc.removeEventListener('pointerdown', cancelFocus, true);
                doc.removeEventListener('keydown', key, true);
                doc.removeEventListener('focusin', moved, true);
                doc.removeEventListener('visibilitychange', cancelFocus, true);
                root.removeEventListener?.('blur', cancelFocus);
                if (focusIntent === intent) focusIntent = null;
            });
            controls(); return pending;
        }
        review.addEventListener('click', () => run(async () => {
            dismiss(); status.textContent = '';
            if (isAppearancePending()) { status.textContent = t('workspacePresetWait', 'Wait for the template to finish saving, then preview again.'); return; }
            summary.textContent = ''; list.replaceChildren(); panel.hidden = false;
            const token = generation, template = getTemplate();
            store ||= new root.LocalItabWorkspace.Store();
            let result;
            try { result = await store.prepare(template); }
            catch (error) { if (closed || token !== generation) return; throw error; }
            if (closed || token !== generation) return;
            if (isAppearancePending() || getTemplate() !== template) { fail({ code: 'CANCELLED' }); return; }
            preview = result;
            summary.textContent = t('workspacePresetFor', 'Modules for') + ': ' + t(root.LocalItabTemplates.get(template).labelKey, root.LocalItabTemplates.localize(template).name);
            list.replaceChildren();
            const target = root.LocalItabTemplates.get(template).recommendedWorkspace;
            const visibility = enabled => enabled ? t('workspacePresetShown', 'Shown') : t('workspacePresetHidden', 'Hidden');
            for (const [name, key, fallback] of [['tasks', 'tasksTitle', 'Tasks'], ['focus', 'focusTitle', 'Focus timer']]) {
                make('li', `${t(key, fallback)}: ${visibility(result.before[name].enabled)} → ${visibility(target[name])}`, list);
            }
            panel.hidden = false;
            status.textContent = t('workspacePresetReady', 'Review the visibility changes below, then apply or cancel.');
            moveFocus(summary);
        }));
        apply.addEventListener('click', () => {
            if (!preview || pending) return;
            const selected = preview, token = generation;
            run(async () => {
                await store.apply(selected, () => !closed && token === generation && !isAppearancePending() && getTemplate() === selected.template);
                if (closed) return;
                dismiss(); status.textContent = t('workspacePresetSaved', 'Module visibility saved in this workspace.'); moveFocus(status);
            }, 'applying');
        });
        function cancelReview() {
            if (phase === 'applying') return;
            dismiss();
            status.textContent = pending ? t('workspacePresetCancelled', 'Preview cancelled. Choose the template and preview again.') : '';
            (pending ? status : review).focus();
        }
        cancel.addEventListener('click', cancelReview);
        host.addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden && phase !== 'applying') { event.preventDefault(); cancelReview(); } });
        const changed = (changes, area) => {
            if (area === 'local' && (changes.appearance || changes.themePreset)) {
                const hadPreview = Boolean(preview), ownedFocus = panel.contains(doc.activeElement); dismiss();
                if (hadPreview) status.textContent = t('workspacePresetCancelled', 'Preview cancelled. Choose the template and preview again.');
                if (ownedFocus && !doc.hidden && host.getClientRects().length) status.focus();
            }
        };
        const unsubscribe = root.storageManager?.onLocalChanged?.(changed);
        // Cancel immediately for unsaved local template selection, too.
        const appearance = doc.getElementById('options-appearance');
        const selecting = () => { dismiss(); status.textContent = ''; };
        appearance?.addEventListener('change', selecting);
        controls();
        return { get pending() { return pending; }, hasUncommittedWork: () => Boolean(pending || preview),
            destroy() { closed = true; dismiss(); unsubscribe?.(); appearance?.removeEventListener('change', selecting); } };
    }
    root.LocalItabWorkspace.mount = mount;
})(window);
