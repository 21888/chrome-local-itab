(function (root) {
    'use strict';
    const api = root.LocalItabOrganizer;
    const fallback = {
        organizerOpen: 'Organize saved sites', organizerLoading: 'Reading saved sites…', organizerDestination: 'Move to existing category',
        organizerChoose: 'Choose a destination', organizerReview: 'Review move', organizerCancel: 'Cancel', organizerBack: 'Back',
        organizerSubmit: 'Move reviewed sites', organizerRetry: 'Retry reviewed move', organizerPending: 'Checking and saving…',
        organizerOrphan: 'Category no longer listed', organizerSelected: 'Selected sites', organizerReviewTitle: 'Review exact sites and destination',
        organizerHelp: 'Select individual records or current matches. Sites already in the destination cannot be selected. No categories are removed.',
        organizerSearch: 'Search saved sites', organizerSearchPlaceholder: 'Title, URL or source category', organizerClearSearch: 'Clear search',
        organizerSelectMatches: 'Select current matches', organizerDeselectMatches: 'Deselect current matches',
        organizerSearchHelp: 'Search only filters this list. Review includes all selected sites, even hidden ones.',
        organizerMatches: 'Matching sites', organizerHiddenSelected: 'Hidden selected sites', organizerNoMatches: 'No saved sites match this search.',
        organizerEmpty: 'No saved sites.', organizerError: 'Could not read saved sites. Close and try again.',
        organizerChanged: 'Saved sites, categories or layout changed. Cancel and reopen to review the latest sites.',
        organizerFailed: 'Nothing was moved. Retry the reviewed move.', organizerUnverified: 'Could not verify the move. Retry checks the saved result before writing.',
        organizerSaved: 'Sites moved', organizerBusy: 'Finish the other shortcut action first.', organizerLayout: 'Finish or retry the pending layout change first. Then reopen the organizer.'
    };
    const t = key => { const value = root.i18n?.t(key); return value && value !== key ? value : fallback[key]; };
    const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
    function mount(host, component) {
        let overlay, body, status, cleanup, snapshot, request, selected = new Set(), destination = '', query = '', busy = false, revision = 0, selectionRevision = 0, submitted = false;
        const button = (key, action) => { const node = el('button', t(key)); node.type = 'button'; node.addEventListener('click', event => { if (node.isConnected && !node.disabled && !event.isComposing && event.keyCode !== 229 && !event.repeat && !(event.detail > 1)) action(); }); return node; };
        const opener = button('organizerOpen', () => open()); opener.className = 'organizer-opener'; opener.setAttribute('aria-haspopup', 'dialog'); host.append(opener);
        function close() {
            if (busy && submitted) return false;
            revision++; busy = false; cleanup?.(); cleanup = null; overlay?.remove(); overlay = null; request = snapshot = null; selected.clear(); destination = query = ''; submitted = false; return true;
        }
        function controls() { for (const node of overlay.querySelectorAll('button, input, select')) node.disabled = busy || node.dataset.unavailable === 'true'; }
        async function open(source = '') {
            if (overlay || root.LocalItabContentLifecycle?.departing || component._shortcutWritesPending || component._pendingSave || component._pendingDelete || component._shortcutOrderPending || component.modal?.classList.contains('active')) return false;
            const owner = ++revision; busy = true; selected = new Set(); destination = query = ''; request = null; submitted = false;
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
            const owner = revision, view = ++selectionRevision;
            const current = node => owner === revision && view === selectionRevision && !busy && !request &&
                !root.LocalItabContentLifecycle?.departing && node.isConnected && body.contains(node);
            // Only this temporary view is indexed. Snapshot records and their original
            // indices stay untouched, including duplicate URLs and orphan categories.
            const fold = value => String(value).normalize('NFKC').toLowerCase().replace(/\s+/gu, ' ').trim();
            const groups = api.groups(snapshot).map(group => ({ ...group, searchName: fold(group.name),
                rows: group.rows.map(row => ({ ...row, searchTitle: fold(row.link.title), searchUrl: fold(row.link.url) })) }));
            body.replaceChildren(); status.textContent = t('organizerHelp');
            const label = el('label', t('organizerDestination')); const select = el('select'); label.append(select);
            const first = el('option', t('organizerChoose')); first.value = ''; select.append(first);
            for (const category of snapshot.categories) { const option = el('option', category.name); option.value = category.id; select.append(option); }
            select.value = destination; body.append(label);
            const searchLabel = el('label', t('organizerSearch'), 'organizer-search-label');
            const searchRow = el('div', undefined, 'organizer-search-row'), search = el('input', undefined, 'organizer-search-input');
            search.type = 'search'; search.placeholder = t('organizerSearchPlaceholder'); search.value = query;
            search.autocomplete = 'off'; search.spellcheck = false; search.setAttribute('aria-label', t('organizerSearch'));
            let composing = false;
            const clear = button('organizerClearSearch', () => {
                if (!current(clear) || composing) return;
                query = search.value = ''; renderRows(); search.focus();
            });
            searchLabel.append(search); searchRow.append(searchLabel, clear); body.append(searchRow, el('p', t('organizerSearchHelp'), 'organizer-search-help'));
            const count = el('p', undefined, 'organizer-count'); count.setAttribute('role', 'status'); count.setAttribute('aria-live', 'polite'); count.setAttribute('aria-atomic', 'true'); body.append(count);
            const matchActions = el('div', undefined, 'organizer-match-actions');
            const selectMatches = button('organizerSelectMatches', () => selectVisible(true, selectMatches));
            const deselectMatches = button('organizerDeselectMatches', () => selectVisible(false, deselectMatches));
            matchActions.append(selectMatches, deselectMatches); body.append(matchActions);
            const list = el('div', undefined, 'organizer-list'); body.append(list);
            const review = button('organizerReview', () => {
                if (!current(review) || composing) return;
                try { request = api.plan(snapshot, [...selected], destination); renderReview(); } catch (_) {}
            });
            let visible = new Set(), visibleChecks = new Map();
            const update = () => {
                let hiddenSelected = 0, selectable = 0, visibleSelected = 0;
                for (const index of selected) if (!visible.has(index)) hiddenSelected++;
                for (const index of visible) {
                    if (selected.has(index)) visibleSelected++;
                    else if (snapshot.links[index].category !== destination) selectable++;
                }
                count.textContent = `${t('organizerMatches')}: ${visible.size} / ${snapshot.links.length} · ${t('organizerSelected')}: ${selected.size} · ${t('organizerHiddenSelected')}: ${hiddenSelected}`;
                selectMatches.textContent = `${t('organizerSelectMatches')} (${selectable})`;
                deselectMatches.textContent = `${t('organizerDeselectMatches')} (${visibleSelected})`;
                // A native button loses focus when disabled. Hand off only its own
                // focus before disabling it; typing in the search field stays put.
                if ((!selectable && document.activeElement === selectMatches) || (!visibleSelected && document.activeElement === deselectMatches)) {
                    const next = selectable ? selectMatches : visibleSelected ? deselectMatches : search;
                    next.disabled = false; next.focus();
                }
                selectMatches.disabled = !selectable; deselectMatches.disabled = !visibleSelected;
                review.disabled = !destination || !selected.size;
                clear.disabled = !query;
            };
            function selectVisible(checked, control) {
                if (!current(control) || composing) return;
                for (const index of visible) {
                    if (!checked) selected.delete(index);
                    else if (snapshot.links[index].category !== destination) selected.add(index);
                    visibleChecks.get(index).checked = selected.has(index);
                }
                update();
            }
            function renderRows() {
                list.replaceChildren(); visible = new Set(); visibleChecks = new Map();
                const needle = fold(query);
                for (const group of groups) {
                    const rows = !needle || group.searchName.includes(needle) ? group.rows :
                        group.rows.filter(row => row.searchTitle.includes(needle) || row.searchUrl.includes(needle));
                    if (!rows.length) continue;
                    const section = el('section'); section.append(el('h3', `${group.name}${group.orphaned ? ` · ${t('organizerOrphan')}` : ''} (${rows.length})`));
                    for (const { index, link } of rows) {
                        visible.add(index);
                        const row = el('label', undefined, 'organizer-row'), check = el('input'); check.type = 'checkbox'; check.checked = selected.has(index); check.disabled = link.category === destination;
                        visibleChecks.set(index, check);
                        check.addEventListener('change', () => {
                            if (!current(check) || check.disabled || link.category === destination) return;
                            check.checked ? selected.add(index) : selected.delete(index); update();
                        });
                        const detail = el('span'); detail.append(el('strong', `${index + 1}. ${link.title}`), el('span', link.url, 'organizer-url')); row.append(check, detail); section.append(row);
                    }
                    if (source && source !== 'all' && group.id === source) section.dataset.source = 'true';
                    list.append(section);
                }
                if (!visible.size) list.append(el('p', t(snapshot.links.length ? 'organizerNoMatches' : 'organizerEmpty')));
                update();
            }
            const searchChanged = () => {
                if (!current(search) || composing || query === search.value) return;
                query = search.value; renderRows();
            };
            search.addEventListener('input', event => { if (!event.isComposing && event.keyCode !== 229) searchChanged(); });
            search.addEventListener('compositionstart', () => { if (current(search)) composing = true; });
            search.addEventListener('compositionend', () => { if (current(search)) { composing = false; searchChanged(); } });
            search.addEventListener('focusout', () => { if (current(search)) { composing = false; searchChanged(); } });
            select.addEventListener('change', () => {
                if (!current(select)) return;
                destination = select.value;
                selected = new Set([...selected].filter(index => snapshot.links[index].category !== destination));
                renderRows();
            });
            body.append(button('organizerCancel', close), review); renderRows();
            (list.querySelector('[data-source="true"]') || select).scrollIntoView?.({ block: 'nearest' });
            (query ? search : select).focus();
        }
        function renderReview(retryUnavailable = false) {
            selectionRevision++;
            body.replaceChildren(); status.textContent = t('organizerReviewTitle');
            const destinationName = snapshot.categories.find(category => category.id === request.destination).name;
            body.append(el('p', `${t('organizerDestination')}: ${destinationName} (${request.destination})`), el('p', `${t('organizerSelected')}: ${request.indices.length}`));
            const list = el('ol', undefined, 'organizer-list');
            for (const index of request.indices) { const link = snapshot.links[index], item = el('li'); item.append(el('strong', `${index + 1}. ${link.title}`), el('span', link.url, 'organizer-url'), el('span', `${link.category} → ${destinationName}`)); list.append(item); }
            const cancel = button('organizerCancel', close);
            body.append(list, cancel);
            if (!submitted) body.append(button('organizerBack', () => { request = null; renderSelection(); }));
            const submit = button(submitted ? 'organizerRetry' : 'organizerSubmit', save);
            submit.disabled = retryUnavailable;
            body.append(submit);
            // Never focus a retry that will immediately become disabled: native
            // focus would fall to body, outside this dialog's Escape/Tab handler.
            (retryUnavailable ? cancel : submit).focus();
        }
        async function save() {
            if (busy || !request || root.LocalItabContentLifecycle?.departing) return;
            busy = true; submitted = true; controls(); overlay.querySelector('.organizer-panel').focus(); status.textContent = t('organizerPending');
            try {
                await component.moveReviewedShortcuts(request);
                busy = false; const count = request.indices.length; close();
                const result = el('span', `${t('organizerSaved')}: ${count}`); result.setAttribute('role', 'status'); host.append(result);
            } catch (error) {
                busy = false; renderReview(error.code !== 'ORGANIZER_FAILED' && error.code !== 'ORGANIZER_UNVERIFIED');
                status.textContent = t(error.code === 'ORGANIZER_LAYOUT_PENDING' ? 'organizerLayout' : error.code === 'ORGANIZER_FAILED' ? 'organizerFailed' : error.code === 'ORGANIZER_UNVERIFIED' ? 'organizerUnverified' : 'organizerChanged');
            }
        }
        return { open, close, get pending() { return busy; }, hasUncommittedWork: () => Boolean(overlay || busy), destroy() { if (!busy) { close(); opener.remove(); } } };
    }
    api.mount = mount;
})(window);
