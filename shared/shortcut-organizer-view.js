(function (root) {
    'use strict';
    const api = root.LocalItabOrganizer;
    const fallback = {
        organizerOpen: 'Organize saved sites', organizerLoading: 'Reading saved sites…', organizerDestination: 'Move to existing category',
        organizerChoose: 'Choose a destination', organizerReview: 'Review move', organizerCancel: 'Cancel', organizerBack: 'Back',
        organizerSubmit: 'Move reviewed sites', organizerRetry: 'Retry reviewed move', organizerPending: 'Checking and saving…',
        organizerOrphan: 'Category no longer listed', organizerSelected: 'Selected sites', organizerReviewTitle: 'Review exact sites and destination',
        organizerHelp: 'Select individual records. Sites already in the destination cannot be selected. No categories are removed.',
        organizerEmpty: 'No saved sites.', organizerError: 'Could not read saved sites. Close and try again.',
        organizerChanged: 'Saved sites, categories or layout changed. Cancel and reopen to review the latest sites.',
        organizerFailed: 'Nothing was moved. Retry the reviewed move.', organizerUnverified: 'Could not verify the move. Retry checks the saved result before writing.',
        organizerSaved: 'Sites moved', organizerBusy: 'Finish the other shortcut action first.', organizerLayout: 'Finish or retry the pending layout change first. Then reopen the organizer.'
    };
    const t = key => { const value = root.i18n?.t(key); return value && value !== key ? value : fallback[key]; };
    const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
    function mount(host, component) {
        let overlay, body, status, cleanup, snapshot, request, selected = new Set(), destination = '', busy = false, revision = 0, submitted = false;
        const button = (key, action) => { const node = el('button', t(key)); node.type = 'button'; node.addEventListener('click', event => { if (!event.isComposing && event.keyCode !== 229 && !event.repeat && !(event.detail > 1)) action(); }); return node; };
        const opener = button('organizerOpen', () => open()); opener.className = 'organizer-opener'; opener.setAttribute('aria-haspopup', 'dialog'); host.append(opener);
        function close() {
            if (busy && submitted) return false;
            revision++; busy = false; cleanup?.(); cleanup = null; overlay?.remove(); overlay = null; request = snapshot = null; selected.clear(); submitted = false; return true;
        }
        function controls() { for (const node of overlay.querySelectorAll('button, input, select')) node.disabled = busy || node.dataset.unavailable === 'true'; }
        async function open(source = '') {
            if (overlay || root.LocalItabContentLifecycle?.departing || component._shortcutWritesPending || component._pendingSave || component._pendingDelete || component._shortcutOrderPending || component.modal?.classList.contains('active')) return false;
            const owner = ++revision; busy = true; selected = new Set(); destination = ''; request = null; submitted = false;
            overlay = el('div', undefined, 'organizer-overlay'); const panel = el('section', undefined, 'organizer-panel');
            panel.tabIndex = -1; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', t('organizerOpen'));
            panel.append(el('h2', t('organizerOpen'))); status = el('p', t('organizerLoading')); status.setAttribute('role', 'status'); panel.append(status);
            body = el('div'); body.append(button('organizerCancel', close)); panel.append(body); overlay.append(panel); document.body.append(overlay);
            cleanup = root.LocalItabDialog?.open(overlay, panel, close);
            try {
                // Pending layout writes complete before capturing the exact review.
                const controller = component.layoutController;
                if (controller?.failedChange || controller?.invalidated) throw Object.assign(new Error(), { code: 'ORGANIZER_LAYOUT_PENDING' });
                const flushed = await controller?.flush();
                if (flushed === false || controller?.failedChange || controller?.invalidated) throw Object.assign(new Error(), { code: 'ORGANIZER_LAYOUT_PENDING' });
                const fresh = await root.storageManager.readShortcutOrganizerSnapshot();
                if (owner !== revision) return false;
                snapshot = fresh;
                busy = false; renderSelection(source); return true;
            } catch (error) { if (owner === revision) { busy = false; status.textContent = t(error.code === 'ORGANIZER_LAYOUT_PENDING' ? 'organizerLayout' : 'organizerError'); } return false; }
        }
        function renderSelection(source = '') {
            body.replaceChildren(); status.textContent = t('organizerHelp');
            const label = el('label', t('organizerDestination')); const select = el('select'); label.append(select);
            const first = el('option', t('organizerChoose')); first.value = ''; select.append(first);
            for (const category of snapshot.categories) { const option = el('option', category.name); option.value = category.id; select.append(option); }
            select.value = destination;
            select.addEventListener('change', () => { destination = select.value; selected = new Set([...selected].filter(index => snapshot.links[index].category !== destination)); renderSelection(); }); body.append(label);
            const count = el('p', `${t('organizerSelected')}: ${selected.size}`); body.append(count);
            const list = el('div', undefined, 'organizer-list'); body.append(list);
            const review = button('organizerReview', () => { try { request = api.plan(snapshot, [...selected], destination); renderReview(); } catch (_) {} });
            const update = () => { count.textContent = `${t('organizerSelected')}: ${selected.size}`; review.disabled = !destination || !selected.size; };
            for (const group of api.groups(snapshot)) {
                const section = el('section'); section.append(el('h3', `${group.name}${group.orphaned ? ` · ${t('organizerOrphan')}` : ''} (${group.rows.length})`));
                for (const { index, link } of group.rows) {
                    const row = el('label', undefined, 'organizer-row'), check = el('input'); check.type = 'checkbox'; check.checked = selected.has(index); check.disabled = link.category === destination;
                    check.addEventListener('change', () => { check.checked ? selected.add(index) : selected.delete(index); update(); });
                    const detail = el('span'); detail.append(el('strong', `${index + 1}. ${link.title}`), el('span', link.url, 'organizer-url')); row.append(check, detail); section.append(row);
                }
                if (source && source !== 'all' && group.id === source) section.dataset.source = 'true';
                list.append(section);
            }
            if (!snapshot.links.length) list.append(el('p', t('organizerEmpty')));
            body.append(button('organizerCancel', close), review); update();
            (list.querySelector('[data-source="true"]') || select).scrollIntoView?.({ block: 'nearest' }); select.focus();
        }
        function renderReview() {
            body.replaceChildren(); status.textContent = t('organizerReviewTitle');
            const destinationName = snapshot.categories.find(category => category.id === request.destination).name;
            body.append(el('p', `${t('organizerDestination')}: ${destinationName} (${request.destination})`), el('p', `${t('organizerSelected')}: ${request.indices.length}`));
            const list = el('ol', undefined, 'organizer-list');
            for (const index of request.indices) { const link = snapshot.links[index], item = el('li'); item.append(el('strong', `${index + 1}. ${link.title}`), el('span', link.url, 'organizer-url'), el('span', `${link.category} → ${destinationName}`)); list.append(item); }
            body.append(list, button('organizerCancel', close));
            if (!submitted) body.append(button('organizerBack', () => { request = null; renderSelection(); }));
            const submit = button(submitted ? 'organizerRetry' : 'organizerSubmit', save); body.append(submit); submit.focus();
        }
        async function save() {
            if (busy || !request || root.LocalItabContentLifecycle?.departing) return;
            busy = true; submitted = true; controls(); overlay.querySelector('.organizer-panel').focus(); status.textContent = t('organizerPending');
            try {
                await component.moveReviewedShortcuts(request);
                busy = false; const count = request.indices.length; close();
                const result = el('span', `${t('organizerSaved')}: ${count}`); result.setAttribute('role', 'status'); host.append(result);
            } catch (error) {
                busy = false; renderReview();
                status.textContent = t(error.code === 'ORGANIZER_LAYOUT_PENDING' ? 'organizerLayout' : error.code === 'ORGANIZER_FAILED' ? 'organizerFailed' : error.code === 'ORGANIZER_UNVERIFIED' ? 'organizerUnverified' : 'organizerChanged');
                if (error.code !== 'ORGANIZER_FAILED' && error.code !== 'ORGANIZER_UNVERIFIED') {
                    const buttons = body.querySelectorAll('button'); buttons[buttons.length - 1].disabled = true;
                }
            }
        }
        return { open, close, get pending() { return busy; }, hasUncommittedWork: () => Boolean(overlay || busy), destroy() { if (!busy) { close(); opener.remove(); } } };
    }
    api.mount = mount;
})(window);
