(function (root) {
    'use strict';
    const api = root.LocalItabNavigationCatalog;
    const fallback = {
        open: 'Discover sites', eyebrow: 'YOUR NEXT USEFUL PLACE', title: 'A little discovery. A better start.',
        intro: 'Browse the built-in library. Add only the sites you want to your own shortcuts.',
        search: 'Search names, uses or companies', all: 'All categories', filters: 'More filters', clear: 'Clear filters',
        savedState: 'Saved in this workspace', savedAll: 'All', savedNew: 'Not added', savedAdded: 'Added',
        tag: 'Use', country: 'Operator location', company: 'Company / organization', pricing: 'Pricing',
        any: 'Any', destination: 'Add to your category', results: 'sites', result: 'site', add: 'Add', added: 'Added', visit: 'Open official site', official: 'Official site',
        loading: 'Reading your saved sites…', saving: 'Saving…', saved: 'Added to', duplicate: 'Already in your shortcuts',
        empty: 'No sites match these filters.', emptyHelp: 'Try a different word, category or filter.',
        close: 'Close', privacy: 'Browsing this library stays offline. Adding uses your existing Sync and online-icon settings.',
        disclosure: 'Location describes the company or service operator, not where a site is accessible. Plans, availability and account requirements can change.',
        source: 'Sources & details', checked: 'Checked', unknown: 'Unknown', free: 'Free entry', freemium: 'Free + paid plans', paid: 'Paid', not_applicable: 'Not applicable',
        readError: 'Could not read your saved sites. Close and reopen to try again.',
        conflict: 'Your shortcuts, workspace or settings changed. Close and reopen to review the latest state.',
        failed: 'Nothing was added. You can try adding the site again.',
        uncertain: 'Could not confirm the save. Close and reopen to check your shortcuts before trying again.',
        layout: 'Finish or retry the pending layout change, then reopen the library.', noCategory: 'Create a personal shortcut category in Settings before adding sites.',
        select: 'Select', selected: 'selected', selectionHelp: 'Choose up to 20 sites. Selections stay when you change filters.',
        selectResults: 'Select current results', selectionLimit: 'These results would exceed 20 selected sites. Narrow the filters first.',
        clearSelection: 'Clear selection', reviewSelection: 'Review selected', reviewTitle: 'Review your selection',
        confirmSelection: 'Confirm and add', cancelSelection: 'Back to browsing', skipped: 'already added, skipped',
        batchFailed: 'Nothing was added. Review your selection before trying again.',
        sync: 'Chrome Sync', icons: 'Online icons', on: 'On', off: 'Off'
    };
    const t = key => { const id = `navigationLibrary${key[0].toUpperCase()}${key.slice(1)}`; const result = root.i18n?.t(id); return result && result !== id ? result : fallback[key] || key; };
    const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
    function mount(host, component) {
        let overlay, panel, cleanup, snapshot, status, results, count, search, destination, categoryNav, filtersPanel, savedNav, batchCount, batchReview, batchClear, batchSelect, batchHelp, reviewPanel, reviewConfirm;
        let selectableResults = [];
        const selected = new Set();
        let reviewed = null;
        let busy = false, writing = false, blocked = false, revision = 0, criteria = {}, currentDestination = '';
        const language = () => /^zh/i.test(document.documentElement.lang || '') ? 'zh' : 'en';
        const tagLabel = tag => {
            const id = `navigationTag${tag.split(/[-_]/).map(part => part[0]?.toUpperCase() + part.slice(1)).join('')}`;
            const result = root.i18n?.t(id); return result && result !== id ? result : tag.replace(/[-_]/g, ' ');
        };
        const button = (text, action, className) => {
            const node = el('button', text, className); node.type = 'button';
            node.addEventListener('click', event => { if (!event.isComposing && event.keyCode !== 229 && !event.repeat && !(event.detail > 1)) action(); }); return node;
        };
        const opener = button(t('open'), open, 'navigation-library-opener'); opener.setAttribute('aria-haspopup', 'dialog'); host.append(opener);
        function close() {
            if (writing) return false;
            revision++; busy = false; cleanup?.(); cleanup = null; overlay?.remove(); overlay = null; snapshot = null; selected.clear(); reviewed = null; return true;
        }
        function setControls() {
            for (const node of overlay.querySelectorAll('button, input, select')) node.disabled = writing || node.dataset.unavailable === 'true';
        }
        async function open() {
            if (overlay || root.LocalItabContentLifecycle?.departing || component._shortcutWritesPending || component._pendingSave || component._pendingDelete || component._shortcutOrderPending || component.modal?.classList.contains('active')) return false;
            const owner = ++revision; busy = true; writing = false; blocked = false; criteria = {}; selected.clear(); reviewed = null;
            overlay = el('div', undefined, 'navigation-library-overlay'); panel = el('section', undefined, 'navigation-library-panel'); panel.tabIndex = -1;
            panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-labelledby', 'navigation-library-title');
            const head = el('header', undefined, 'navigation-library-heading'), copy = el('div');
            copy.append(el('p', t('eyebrow'), 'navigation-library-eyebrow')); const title = el('h2', t('title')); title.id = 'navigation-library-title'; copy.append(title, el('p', t('intro'), 'navigation-library-intro'));
            const dismiss = button('×', close, 'navigation-library-close'); dismiss.setAttribute('aria-label', t('close')); head.append(copy, dismiss); panel.append(head);
            status = el('p', t('loading'), 'navigation-library-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true'); panel.append(status);
            overlay.append(panel); document.body.append(overlay); cleanup = root.LocalItabDialog?.open(overlay, panel, close);
            try {
                const controller = component.layoutController;
                if (controller?.failedChange || controller?.invalidated) throw Object.assign(new Error(), { code: 'CATALOG_LAYOUT_PENDING' });
                const flushed = await controller?.flush();
                if (flushed === false || controller?.failedChange || controller?.invalidated) throw Object.assign(new Error(), { code: 'CATALOG_LAYOUT_PENDING' });
                const fresh = await root.storageManager.readNavigationLibrarySnapshot();
                if (owner !== revision) return false;
                snapshot = fresh; busy = false; build(); return true;
            } catch (error) {
                if (owner === revision) { busy = false; status.textContent = t(error.code === 'CATALOG_LAYOUT_PENDING' ? 'layout' : 'readError'); }
                return false;
            }
        }
        function build() {
            const entries = root.LocalItabNavigationSites;
            const searchRow = el('div', undefined, 'navigation-library-search-row');
            const searchLabel = el('label', undefined, 'navigation-library-search'); searchLabel.append(el('span', '', 'navigation-library-search-icon'));
            search = el('input'); search.type = 'search'; search.placeholder = t('search'); search.setAttribute('aria-label', t('search')); searchLabel.append(search);
            const filterButton = button(t('filters'), () => { filtersPanel.hidden = !filtersPanel.hidden; filterButton.setAttribute('aria-expanded', String(!filtersPanel.hidden)); }, 'navigation-library-filter-toggle');
            filterButton.setAttribute('aria-expanded', 'false'); filterButton.setAttribute('aria-controls', 'navigation-library-filters'); searchRow.append(searchLabel, filterButton); panel.append(searchRow);
            search.addEventListener('input', () => { criteria.query = search.value; renderResults(); });
            categoryNav = el('nav', undefined, 'navigation-library-categories'); categoryNav.setAttribute('aria-label', t('all'));
            for (const category of [{id: '', en: t('all'), zh: t('all'), icon: '▦'}, ...api.categories]) {
                const control = button(category[language()], () => { criteria.category = category.id; criteria.tag = ''; refreshTagOptions(); refreshCategories(); renderResults(); }, 'navigation-library-category');
                control.dataset.category = category.id; categoryNav.append(control);
            }
            panel.append(categoryNav); refreshCategories();
            savedNav = el('div', undefined, 'navigation-library-saved-filters');
            savedNav.setAttribute('role', 'group'); savedNav.setAttribute('aria-label', t('savedState'));
            for (const [value, key] of [['', 'savedAll'], ['new', 'savedNew'], ['added', 'savedAdded']]) {
                const control = button('', () => { criteria.savedState = value; renderResults(); }, 'navigation-library-saved-filter');
                control.dataset.savedState = value; control.dataset.label = key; savedNav.append(control);
            }
            panel.append(savedNav);
            filtersPanel = el('div', undefined, 'navigation-library-filters'); filtersPanel.id = 'navigation-library-filters'; filtersPanel.hidden = true;
            function selectFilter(key, choices, label) {
                const wrapper = el('label', t(key)), select = el('select'); select.setAttribute('aria-label', t(key));
                const any = el('option', t('any')); any.value = ''; select.append(any);
                choices.forEach(value => { const option = el('option', label(value)); option.value = value; select.append(option); });
                select.addEventListener('change', () => { criteria[key] = select.value; renderResults(); }); wrapper.append(select); filtersPanel.append(wrapper); return select;
            }
            const distinct = key => [...new Set(entries.flatMap(site => site[key]))].sort();
            const tagSelect = selectFilter('tag', [], tagLabel);
            function refreshTagOptions() {
                tagSelect.replaceChildren();
                const any = el('option', t('any')); any.value = ''; tagSelect.append(any);
                const scoped = entries.filter(site => !criteria.category || site.categories.includes(criteria.category));
                const tags = [...new Set(scoped.flatMap(site => site.tags))].sort((a, b) => tagLabel(a).localeCompare(tagLabel(b), language()));
                tags.forEach(tag => { const option = el('option', tagLabel(tag)); option.value = tag; tagSelect.append(option); });
                tagSelect.value = criteria.tag || '';
            }
            refreshTagOptions();
            selectFilter('country', distinct('country'), country => {
                if (country === 'unknown') return t('unknown');
                try { return `${new Intl.DisplayNames([language()], { type: 'region' }).of(country)} (${country})`; } catch (_) { return country; }
            });
            selectFilter('company', distinct('company'), value => value === 'unknown' ? t('unknown') : value);
            selectFilter('pricing', api.pricing, t); panel.append(filtersPanel);
            const toolbar = el('div', undefined, 'navigation-library-toolbar');
            count = el('span', '', 'navigation-library-count'); count.setAttribute('role', 'status'); toolbar.append(count);
            const reset = button(t('clear'), () => { criteria = {}; search.value = ''; for (const select of filtersPanel.querySelectorAll('select')) select.value = ''; refreshTagOptions(); refreshCategories(); renderResults(); search.focus(); }, 'navigation-library-clear'); toolbar.append(reset);
            const destinationLabel = el('label', t('destination'), 'navigation-library-destination'); destination = el('select'); destination.setAttribute('aria-label', t('destination'));
            snapshot.categories.forEach(category => { const option = el('option', category.name); option.value = category.id; destination.append(option); });
            const active = root.categoryNavigation?.getCurrentCategory?.();
            currentDestination = snapshot.categories.some(category => category.id === active) ? active : snapshot.categories[0]?.id || '';
            destination.value = currentDestination; destination.addEventListener('change', () => { currentDestination = destination.value; renderResults(); }); destinationLabel.append(destination); toolbar.append(destinationLabel); panel.append(toolbar);
            const batchBar = el('div', undefined, 'navigation-library-batch');
            batchCount = el('span'); batchCount.setAttribute('role', 'status');
            batchClear = button(t('clearSelection'), () => { selected.clear(); renderResults(); search.focus(); }, 'navigation-library-clear');
            batchReview = button(t('reviewSelection'), reviewSelection, 'navigation-library-batch-review');
            batchSelect = button('', selectCurrentResults, 'navigation-library-select-results');
            batchHelp = el('p', t('selectionHelp'), 'navigation-library-selection-help'); batchHelp.id = 'navigation-library-selection-help';
            batchHelp.setAttribute('aria-live', 'polite');
            batchSelect.setAttribute('aria-describedby', batchHelp.id);
            batchBar.append(batchCount, batchClear, batchSelect, batchReview, batchHelp); panel.append(batchBar);
            reviewPanel = el('section', undefined, 'navigation-library-review'); reviewPanel.hidden = true; reviewPanel.tabIndex = -1;
            reviewPanel.setAttribute('aria-label', t('reviewTitle')); panel.append(reviewPanel);
            results = el('div', undefined, 'navigation-library-results'); panel.append(results);
            const foot = el('footer', undefined, 'navigation-library-footer'); foot.append(el('p', t('privacy')));
            if (snapshot.privacy) foot.append(el('p', `${t('sync')}: ${t(snapshot.privacy.syncEnabled ? 'on' : 'off')} · ${t('icons')}: ${t(snapshot.privacy.onlineFavicons ? 'on' : 'off')}`));
            foot.append(el('p', t('disclosure'))); panel.append(foot);
            status.textContent = currentDestination ? '' : t('noCategory'); renderResults(); search.focus();
        }
        function refreshCategories() {
            for (const node of categoryNav.children) node.setAttribute('aria-pressed', String(node.dataset.category === (criteria.category || '')));
        }
        function currentResultSelection() {
            return [...new Set(selectableResults.map(site => site.id))].filter(id => !selected.has(id));
        }
        function refreshResultSelection() {
            const additions = currentResultSelection(), overLimit = selected.size + additions.length > 20;
            batchSelect.textContent = `${t('selectResults')} (${additions.length})`;
            batchSelect.dataset.unavailable = String(!additions.length || overLimit || blocked || Boolean(reviewed));
            batchSelect.disabled = writing || batchSelect.dataset.unavailable === 'true';
            batchHelp.textContent = t(overLimit ? 'selectionLimit' : 'selectionHelp');
        }
        function selectCurrentResults() {
            if (writing || blocked || reviewed || !snapshot || root.LocalItabContentLifecycle?.departing) return;
            const additions = currentResultSelection();
            if (!additions.length || selected.size + additions.length > 20) return;
            additions.forEach(id => selected.add(id));
            renderResults();
            // The action is now exhausted and disabled; keep keyboard focus in the batch bar.
            (batchReview.disabled ? batchClear : batchReview).focus();
        }
        function refreshBatch() {
            reviewed = null; reviewPanel.hidden = true;
            batchCount.textContent = `${selected.size} / 20 ${t('selected')}`;
            batchReview.dataset.unavailable = String(!selected.size || !currentDestination || blocked);
            batchClear.dataset.unavailable = String(!selected.size);
            batchReview.disabled = writing || !selected.size || !currentDestination || blocked;
            batchClear.disabled = writing || !selected.size;
            refreshResultSelection();
        }
        function reviewSelection() {
            if (writing || blocked || !selected.size || !currentDestination) return;
            const sites = root.LocalItabNavigationSites.filter(site => selected.has(site.id));
            reviewed = { sites, destination: currentDestination };
            reviewPanel.replaceChildren();
            reviewPanel.append(el('h3', t('reviewTitle')), el('p', `${sites.length} ${t('selected')} · ${t('destination')}: ${snapshot.categories.find(category => category.id === currentDestination)?.name || currentDestination}`));
            const list = el('ul'); sites.forEach(site => list.append(el('li', site.name))); reviewPanel.append(list);
            const cancel = button(t('cancelSelection'), () => { reviewed = null; reviewPanel.hidden = true; refreshResultSelection(); batchReview.focus(); }, 'navigation-library-review-cancel');
            reviewConfirm = button(t('confirmSelection'), () => { if (reviewed) save(reviewed.sites, true); }, 'navigation-library-batch-confirm');
            reviewPanel.append(cancel, reviewConfirm); reviewPanel.hidden = false; refreshResultSelection(); reviewConfirm.focus();
        }
        function renderResults(focusId) {
            const matching = api.filter(root.LocalItabNavigationSites, criteria, language(), tagLabel), saved = api.savedURLs(snapshot.links);
            const isSaved = site => saved.has(api.canonicalURL(site.url));
            for (const site of root.LocalItabNavigationSites) if (isSaved(site)) selected.delete(site.id);
            const savedCount = matching.filter(isSaved).length;
            const totals = { '': matching.length, new: matching.length - savedCount, added: savedCount };
            for (const control of savedNav.children) {
                control.textContent = `${t(control.dataset.label)} (${totals[control.dataset.savedState]})`;
                control.setAttribute('aria-pressed', String(control.dataset.savedState === (criteria.savedState || '')));
            }
            const entries = matching.filter(site => !criteria.savedState || (criteria.savedState === 'added' ? isSaved(site) : !isSaved(site)));
            selectableResults = entries.filter(site => !isSaved(site));
            refreshBatch();
            // Keep keyboard users near their place when an added card leaves the Not added view.
            const oldIndex = focusId ? Array.from(results.children).findIndex(card => card.dataset.site === focusId) : -1;
            const focusSite = focusId && (entries.find(site => site.id === focusId) || entries[Math.max(0, Math.min(oldIndex, entries.length - 1))]);
            count.textContent = `${entries.length} ${t(entries.length === 1 ? 'result' : 'results')}`; results.replaceChildren();
            if (!entries.length) {
                const empty = el('div', undefined, 'navigation-library-empty'); empty.append(el('span', '', 'navigation-library-search-icon'), el('h3', t('empty')), el('p', t('emptyHelp'))); results.append(empty); if (focusId) { empty.tabIndex = -1; empty.focus(); } return;
            }
            for (const site of entries) {
                const card = el('article', undefined, 'navigation-library-card'); card.dataset.site = site.id;
                const top = el('div', undefined, 'navigation-library-card-top'), mark = el('span', site.icon || site.name.slice(0, 2), 'navigation-library-mark'); mark.setAttribute('aria-hidden', 'true');
                mark.dataset.tone = String(api.categories.findIndex(category => category.id === site.categories[0]) % 6);
                const titleBlock = el('div', undefined, 'navigation-library-site-heading'), title = el('h3', site.name);
                titleBlock.append(title, el('span', new URL(site.url).hostname.replace(/^www\./, ''), 'navigation-library-domain')); top.append(mark, titleBlock); card.append(top);
                const pickLabel = el('label', undefined, 'navigation-library-pick'), pick = el('input'); pick.type = 'checkbox'; pick.checked = selected.has(site.id);
                pick.setAttribute('aria-label', `${t('select')}: ${site.name}`);
                pick.dataset.unavailable = String(isSaved(site) || blocked || (!pick.checked && selected.size >= 20));
                pick.disabled = writing || pick.dataset.unavailable === 'true';
                pick.addEventListener('change', () => {
                    if (pick.disabled || writing || blocked || isSaved(site)) return;
                    if (pick.checked && selected.size < 20) selected.add(site.id); else selected.delete(site.id);
                    renderResults();
                    const replacement = Array.from(results.children).find(node => node.dataset.site === site.id)?.querySelector('input'); replacement?.focus();
                });
                pickLabel.append(pick, el('span', t('select'))); card.append(pickLabel);
                card.append(el('p', api.localized(site.description, language()), 'navigation-library-description'));
                const tags = el('div', undefined, 'navigation-library-tags');
                site.tags.slice(0, 2).forEach(tag => tags.append(el('span', tagLabel(tag)))); tags.append(el('span', t(site.pricing), 'navigation-library-price')); card.append(tags);
                const actions = el('div', undefined, 'navigation-library-card-actions'), added = saved.has(api.canonicalURL(site.url));
                const visit = el('a', t('official'), 'navigation-library-visit'); visit.href = site.url; visit.target = '_blank'; visit.rel = 'noopener noreferrer'; visit.setAttribute('aria-label', `${t('visit')}: ${site.name}`); visit.title = t('visit');
                const add = button(added ? `✓ ${t('added')}` : `+ ${t('add')}`, () => save(site), 'navigation-library-add');
                add.setAttribute('aria-label', `${added ? t('added') : t('add')}: ${site.name}`);
                add.dataset.unavailable = String(added || !currentDestination || blocked); add.disabled = writing || added || !currentDestination || blocked;
                if (added) add.classList.add('is-added'); actions.append(visit, add); card.append(actions);
                const details = el('details', undefined, 'navigation-library-details');
                const summary = el('summary', t('source')); summary.setAttribute('tabindex', '0'); details.append(summary);
                details.append(el('p', `${t('company')}: ${site.company === 'unknown' ? t('unknown') : site.company} · ${site.country === 'unknown' ? t('unknown') : site.country}`));
                if (site.pricingNote) details.append(el('p', api.localized(site.pricingNote, language())));
                details.append(el('p', `${t('checked')}: ${site.verifiedOn}`));
                site.sources.forEach((source, index) => { const link = el('a', `${index + 1}. ${new URL(source).hostname}`); link.href = source; link.target = '_blank'; link.rel = 'noopener noreferrer'; details.append(link); }); card.append(details);
                results.append(card);
                if (focusSite?.id === site.id) { card.tabIndex = -1; card.focus(); }
            }
        }
        async function save(site, batch = false) {
            if (writing || blocked || !snapshot || !currentDestination || root.LocalItabContentLifecycle?.departing) return;
            writing = busy = true; setControls(); panel.focus(); status.textContent = batch ? `${t('saving')} ${site.length}` : `${t('saving')} ${site.name}`;
            const serialize = value => ({ name: value.name, url: value.url, icon: value.icon || value.name.slice(0, 2) });
            const request = { baseline: snapshot.state, ...(batch ? { sites: site.map(serialize) } : { site: serialize(site) }), destination: currentDestination };
            try {
                const saved = await component.addCatalogShortcut(request); snapshot = saved;
                status.textContent = batch ? `${saved.addedCount} · ${t('saved')} ${snapshot.categories.find(category => category.id === currentDestination)?.name || currentDestination}${saved.skippedCount ? ` · ${saved.skippedCount} ${t('skipped')}` : ''}` : saved.duplicate ? `${site.name}: ${t('duplicate')}` : `${site.name} · ${t('saved')} ${snapshot.categories.find(category => category.id === currentDestination)?.name || currentDestination}`;
            } catch (error) {
                blocked = error.code !== 'CATALOG_FAILED';
                status.textContent = t(error.code === 'CATALOG_FAILED' ? (batch ? 'batchFailed' : 'failed') : error.code === 'CATALOG_UNVERIFIED' || error.mayHaveCommitted ? 'uncertain' : error.code === 'CATALOG_LAYOUT_PENDING' ? 'layout' : 'conflict');
            } finally {
                writing = busy = false; renderResults(batch ? site[0]?.id : site.id); setControls();
            }
        }
        return { open, close, get pending() { return busy; }, hasUncommittedWork: () => Boolean(overlay || busy), destroy() { if (!writing) { close(); opener.remove(); } } };
    }
    root.LocalItabNavigationLibrary = { mount };
})(window);
