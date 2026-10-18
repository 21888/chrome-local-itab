/* Display-only native disclosures. No preference, workspace or storage writes. */
(function (root) {
    'use strict';
    const mounted = new WeakMap();
    function mount(doc = root.document, Observer = root.MutationObserver) {
        if (mounted.has(doc)) return mounted.get(doc);
        const appearance = doc.getElementById('dashboard-appearance');
        const disclosures = ['dashboard-tools-disclosure', 'dashboard-appearance-disclosure']
            .map(id => doc.getElementById(id)).filter(Boolean);
        if (!disclosures.length) return null;
        const savedOpen = new Map(disclosures.map(details => [details, false]));
        const appearanceDetails = doc.getElementById('dashboard-appearance-disclosure');
        let clarity = null, destroyed = false;
        const listeners = [];
        const isClarity = () => doc.documentElement.dataset.dashboardTemplate === 'clarity';
        const needsAttention = () => /^(?:saving|error|preview(?:-loading|-saving|-restoring|-blocked)?)$/.test(appearance?.dataset.saveState || '');
        const summary = details => details.querySelector('summary');
        function close(details) {
            if (details.contains(doc.activeElement) && doc.activeElement !== summary(details)) summary(details)?.focus();
            details.open = false;
        }
        function syncTemplate() {
            if (destroyed) return;
            const next = isClarity();
            if (next === clarity) return;
            if (clarity === true) disclosures.forEach(details => savedOpen.set(details, details.open));
            clarity = next;
            for (const details of disclosures) {
                // A live template preview or focused native select must never be
                // hidden simply because the template returned to Clarity.
                const focused = details.contains(doc.activeElement);
                if (!clarity || savedOpen.get(details) || focused || (details === appearanceDetails && needsAttention())) details.open = true;
                else close(details);
            }
        }
        function syncStatus() {
            if (destroyed) return;
            // Opening reveals the original live region and its original controls;
            // do not duplicate status text or claim focus after an async save.
            if (appearance?.dataset.saveState && appearanceDetails && clarity) appearanceDetails.open = true;
        }
        for (const details of disclosures) {
            const onToggle = () => {
                if (!clarity) { if (!details.open) details.open = true; return; }
                if (!details.open && details === appearanceDetails && needsAttention()) { details.open = true; return; }
                if (!details.open && details.contains(doc.activeElement) && doc.activeElement !== summary(details)) summary(details)?.focus();
                savedOpen.set(details, details.open);
            };
            const onKeydown = event => {
                if (!clarity || event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229 || !details.open) return;
                // Native select popups, text edits and nested gallery/dialog
                // Escape handlers keep ownership. Preview cancellation is handled
                // by the existing appearance listener, never by this adapter.
                if (event.target?.closest('select, input, textarea') ||
                    (details === appearanceDetails && needsAttention())) return;
                event.preventDefault();
                close(details);
                summary(details)?.focus();
            };
            details.addEventListener('toggle', onToggle);
            details.addEventListener('keydown', onKeydown);
            listeners.push([details, 'toggle', onToggle], [details, 'keydown', onKeydown]);
        }
        syncTemplate();
        syncStatus();
        const modeObserver = Observer ? new Observer(syncTemplate) : null;
        modeObserver?.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-dashboard-template'] });
        const statusObserver = Observer && appearance ? new Observer(syncStatus) : null;
        statusObserver?.observe(appearance, { attributes: true, attributeFilter: ['data-save-state'] });
        const view = { syncTemplate, syncStatus, destroy() {
            if (destroyed) return;
            destroyed = true;
            modeObserver?.disconnect(); statusObserver?.disconnect();
            for (const [node, type, listener] of listeners) node.removeEventListener(type, listener);
            mounted.delete(doc);
        } };
        mounted.set(doc, view);
        return view;
    }
    root.LocalItabClarityDashboard = { mount };
    mount();
})(window);
