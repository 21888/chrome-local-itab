(function (root) {
    'use strict';
    const api = root.LocalItabNavigationCatalog;
    const fallback = {
        open: 'Discover sites', eyebrow: 'YOUR NEXT USEFUL PLACE', title: 'A little discovery. A better start.',
        intro: 'Browse the built-in library. Add only the sites you want to your own shortcuts.',
        search: 'Search names, uses or companies', searchShortcutHint: 'Press / to search while browsing, outside editing fields.', all: 'All categories', filters: 'More filters', clear: 'Clear filters',
        categoryCount: '{count} sites in full catalog', categoryCountHelp: 'Full catalog counts stay the same when filtering. A site can belong to multiple categories.',
        activeFilters: 'Active filters', removeFilter: 'Remove filter',
        savedLocations: 'Saved in your personal categories:', unknownSavedCategory: 'Unknown personal category',
        savedState: 'Saved in this workspace', savedAll: 'All', savedNew: 'Not added', savedAdded: 'Added',
        tag: 'Use', country: 'Operator location', company: 'Company / organization', pricing: 'Pricing',
        any: 'Any', destination: 'Add to your category', results: 'sites', result: 'site', add: 'Add', added: 'Added', visit: 'Open official site', official: 'Official site',
        loading: 'Reading your saved sites…', saving: 'Saving…', saved: 'Added to', duplicate: 'Already in your shortcuts',
        empty: 'No sites match these filters.', emptyHelp: 'Clear filters to browse all sites. Your selection and destination stay unchanged.',
        emptySelected: 'No sites selected yet.', emptySelectedHelp: 'Turn off selected-only view to choose sites. Other filters stay in place.',
        emptyHidden: 'Your selected sites are hidden by filters.', emptyHiddenHelp: 'Clear filters to see them again. Your selection and destination stay unchanged.',
        browseAll: 'Turn off selected-only view', catalogEmpty: 'The built-in library has no sites.',
        catalogEmptyHelp: 'There are no built-in sites to browse right now.', catalogError: 'Could not load the built-in library. Close and reopen to try again.',
        close: 'Close', privacy: 'Browsing this library stays offline. Adding uses your existing Sync and online-icon settings.',
        disclosure: 'Location describes the company or service operator, not where a site is accessible. Plans, availability and account requirements can change.',
        source: 'Sources & details', allUses: 'All uses', categories: 'Categories', moreUse: 'more use in details', moreUses: 'more uses in details', sources: 'Sources', checked: 'Checked', unknown: 'Unknown', free: 'Free entry', freemium: 'Free + paid plans', paid: 'Paid', not_applicable: 'Not applicable',
        refreshReadOnly: 'Saved state refreshed for viewing. Page data changed; reload this page before adding sites or adjusting the layout.', refreshReload: 'Page data changed. Reload this page before adding sites or adjusting the layout.', refreshSaved: 'Refresh saved state', refreshingSaved: 'Refreshing saved state…', refreshedSaved: 'Saved state refreshed.', refreshRemoved: '{count} selected sites are now added and were removed from the selection.', refreshFailed: 'Could not refresh saved state. The previous saved state is still shown; your browsing and drafts are unchanged.', missingDestination: 'The selected personal category is no longer available. Choose another category before adding.',
        readError: 'Could not read your saved sites. Close and reopen to try again.',
        conflict: 'Your shortcuts, workspace or settings changed. Close and reopen to review the latest state.',
        failed: 'Nothing was added. You can try adding the site again.',
        uncertain: 'Could not confirm the save. Close and reopen to check your shortcuts before trying again.',
        layout: 'Finish or retry the pending layout change, then reopen the library.', noCategory: 'Create a personal category here before adding sites.',
        select: 'Select', selected: 'selected', selectedOnly: 'Show selected only', hiddenSelected: 'Hidden by filters', selectionHelp: 'Choose up to 20 sites. Selections stay when you change filters.',
        selectResults: 'Select current results', deselectResults: 'Deselect current results', selectionLimit: 'These results would exceed 20 selected sites. Narrow the filters first.',
        removeSelection: 'Remove from selection', clearSelection: 'Clear selection', reviewSelection: 'Review selected', reviewTitle: 'Review your selection',
        confirmSelection: 'Confirm and add', cancelSelection: 'Back to browsing', skipped: 'already added, skipped',
        batchFailed: 'Nothing was added. Review your selection before trying again.',
        noNewSites: 'All these sites are already in your shortcuts. No category was created.', createAndAdd: 'Create category and add', willCreate: 'Will create personal category', newCategory: 'New personal category', existingCategory: 'Use existing category', categoryName: 'New category name', categoryHint: '1–80 characters. Created only after you review and confirm.', categoryInvalid: 'Enter a category name of 1–80 characters without control characters.', categoryExists: 'A category with this name already exists. Choose a different name or use the existing category.', sync: 'Chrome Sync', icons: 'Online icons', on: 'On', off: 'Off'
    };
    const t = key => { const id = `navigationLibrary${key[0].toUpperCase()}${key.slice(1)}`; const result = root.i18n?.t(id); return result && result !== id ? result : fallback[key] || key; };
    const el = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
    function mount(host, component) {
        let overlay, panel, cleanup, cleanupSearchShortcut, cleanupComposition, snapshot, status, results, count, search, destination, categoryNav, filtersPanel, savedNav, batchCount, batchReview, batchClear, batchSelect, batchDeselect, batchHelp, batchSelectedOnly, batchHiddenCount, reviewPanel, reviewConfirm;
        let refreshSavedButton, resetFiltersButton, privacySummary, refreshing = false, readTicket = 0;
        let destinationLabels = new Map(), missingDestinationFeedback = null;
        let clearFilters = () => {}, leaveSelectedOnly = () => {};
        let selectableResults = [], refreshActiveFilters = () => {}, applyTagFilter = () => {};
        let newCategoryMode = false, draftName = '', compositionTarget = null, nameInput, newCategoryPanel, existingDestination, newCategoryButton, categoryError, useExisting;
        const selected = new Set();
        const expandedDetails = new Set(), renderedDetails = new Map();
        let reviewed = null, selectedOnly = false;
        let busy = false, writing = false, blocked = false, revision = 0, criteria = {}, currentDestination = '';
        const language = () => /^zh/i.test(document.documentElement.lang || '') ? 'zh' : 'en';
        const countryLabels = new Map();
        const countryLabel = country => {
            const key = `${language()}:${country}`;
            if (countryLabels.has(key)) return countryLabels.get(key);
            if (country === 'unknown') return t('unknown');
            try {
                const name = new Intl.DisplayNames([language()], { type: 'region' }).of(country);
                countryLabels.set(key, typeof name === 'string' && name.trim() && name !== country ? `${name} (${country})` : country);
            } catch (_) { countryLabels.set(key, country); }
            return countryLabels.get(key);
        };
        const tagLabel = tag => {
            const id = `navigationTag${tag.split(/[-_]/).map(part => part[0]?.toUpperCase() + part.slice(1)).join('')}`;
            const result = root.i18n?.t(id); return result && result !== id ? result : tag.replace(/[-_]/g, ' ');
        };
        const button = (text, action, className) => {
            const node = el('button', text, className); node.type = 'button';
            node.addEventListener('click', event => { if (!writing && !isComposing() && !event.isComposing && event.keyCode !== 229 && !event.repeat && !(event.detail > 1)) action(); }); return node;
        };
        const opener = button(t('open'), open, 'navigation-library-opener'); opener.setAttribute('aria-haspopup', 'dialog'); host.append(opener);
        function close() {
            if (writing) return false;
            revision++; readTicket++; refreshing = false; expandedDetails.clear(); renderedDetails.clear(); busy = false; cleanupSearchShortcut?.(); cleanupSearchShortcut = null; cleanupComposition?.(); cleanupComposition = null; cleanup?.(); cleanup = null; overlay?.remove(); overlay = null; snapshot = null; selected.clear(); selectedOnly = false; reviewed = null; draftName = ''; newCategoryMode = false; compositionTarget = null; return true;
        }
        function isComposing() {
            // A lost end/blur event must not strand every action after focus moves
            // or the composing result node is removed.
            if (compositionTarget && (!compositionTarget.isConnected || !panel?.contains(compositionTarget) ||
                !compositionTarget.contains(document.activeElement))) compositionTarget = null;
            return Boolean(compositionTarget);
        }
        function bindComposition(owner, ownedPanel) {
            let retired = false;
            const owns = event => !retired && owner === revision && panel === ownedPanel &&
                ownedPanel.isConnected && ownedPanel.contains(event.target);
            const handleCompositionStart = event => {
                if (!owns(event)) return;
                compositionTarget = event.target;
                invalidateReview(); refreshCurrentDeselection();
            };
            const handleCompositionEnd = event => {
                if (owns(event) && compositionTarget === event.target) { compositionTarget = null; refreshCurrentDeselection(); }
            };
            const handleFocusOut = event => {
                if (owns(event) && compositionTarget === event.target) { compositionTarget = null; refreshCurrentDeselection(); }
            };
            ownedPanel.addEventListener('compositionstart', handleCompositionStart);
            ownedPanel.addEventListener('compositionend', handleCompositionEnd);
            ownedPanel.addEventListener('focusout', handleFocusOut);
            cleanupComposition = () => {
                retired = true;
                compositionTarget = null;
                ownedPanel.removeEventListener('compositionstart', handleCompositionStart);
                ownedPanel.removeEventListener('compositionend', handleCompositionEnd);
                ownedPanel.removeEventListener('focusout', handleFocusOut);
            };
        }
        function setControls() {
            for (const node of overlay.querySelectorAll('.navigation-library-add, .navigation-library-batch-review')) { if (externalWorkPending()) node.dataset.unavailable = 'true'; }
            for (const node of overlay.querySelectorAll('button, input, select')) {
                const disabled = writing || (refreshing && !node.classList.contains('navigation-library-close')) || node.dataset.unavailable === 'true';
                if (disabled && document.activeElement === node) panel.focus();
                node.disabled = disabled;
            }
            refreshReadControl();
        }
        async function open() {
            if (overlay || root.LocalItabContentLifecycle?.departing || component._shortcutWritesPending || component._pendingSave || component._pendingDelete || component._shortcutOrderPending || component.modal?.classList.contains('active')) return false;
            countryLabels.clear(); missingDestinationFeedback = null;
            const owner = ++revision; expandedDetails.clear(); renderedDetails.clear(); busy = true; writing = false; blocked = false; criteria = {}; selected.clear(); selectedOnly = false; reviewed = null; draftName = ''; newCategoryMode = false; compositionTarget = null;
            overlay = el('div', undefined, 'navigation-library-overlay'); panel = el('section', undefined, 'navigation-library-panel'); panel.tabIndex = -1;
            bindComposition(owner, panel);
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
                if (!Array.isArray(root.LocalItabNavigationSites)) throw Object.assign(new Error(), { code: 'CATALOG_UNAVAILABLE' });
                snapshot = fresh; busy = false; build(); return true;
            } catch (error) {
                if (owner === revision) { busy = false; status.textContent = t(error.code === 'CATALOG_LAYOUT_PENDING' ? 'layout' : error.code === 'CATALOG_UNAVAILABLE' ? 'catalogError' : 'readError'); }
                return false;
            }
        }
        function build() {
            const entries = root.LocalItabNavigationSites;
            const searchRow = el('div', undefined, 'navigation-library-search-row');
            const searchLabel = el('label', undefined, 'navigation-library-search'); searchLabel.append(el('span', '', 'navigation-library-search-icon'));
            search = el('input'); search.type = 'search'; search.placeholder = t('search'); search.setAttribute('aria-label', t('search')); search.setAttribute('aria-keyshortcuts', '/'); search.setAttribute('aria-describedby', 'navigation-library-search-hint'); searchLabel.append(search);
            const filterButton = button(t('filters'), () => { filtersPanel.hidden = !filtersPanel.hidden; filterButton.setAttribute('aria-expanded', String(!filtersPanel.hidden)); }, 'navigation-library-filter-toggle');
            filterButton.setAttribute('aria-expanded', 'false'); filterButton.setAttribute('aria-controls', 'navigation-library-filters'); searchRow.append(searchLabel, filterButton); panel.append(searchRow);
            const searchHint = el('p', t('searchShortcutHint'), 'navigation-library-search-hint'); searchHint.id = 'navigation-library-search-hint'; panel.append(searchHint);
            search.addEventListener('input', () => { criteria.query = search.value; renderResults(); });
            categoryNav = el('nav', undefined, 'navigation-library-categories'); categoryNav.setAttribute('aria-label', t('all'));
            for (const category of [{id: '', en: t('all'), zh: t('all'), icon: '▦'}, ...api.categories]) {
                const control = button(category[language()], () => {
                    if (owner !== revision || !control.isConnected || control.disabled || busy || !snapshot || root.LocalItabContentLifecycle?.departing) return;
                    criteria.category = category.id; refreshTagOptions(); refreshCategories(); renderResults();
                }, 'navigation-library-category');
                const total = api.filter(entries, { category: category.id }).length;
                const badge = el('span', String(total), 'navigation-library-category-count'); badge.setAttribute('aria-hidden', 'true');
                control.append(badge);
                control.setAttribute('aria-label', `${category[language()]} · ${t('categoryCount').replace('{count}', String(total))}`);
                control.dataset.category = category.id; categoryNav.append(control);
            }
            categoryNav.setAttribute('aria-describedby', 'navigation-library-category-count-help');
            const countHelp = el('p', t('categoryCountHelp'), 'navigation-library-category-count-help'); countHelp.id = 'navigation-library-category-count-help';
            panel.append(categoryNav, countHelp); refreshCategories();
            savedNav = el('div', undefined, 'navigation-library-saved-filters');
            savedNav.setAttribute('role', 'group'); savedNav.setAttribute('aria-label', t('savedState'));
            for (const [value, key] of [['', 'savedAll'], ['new', 'savedNew'], ['added', 'savedAdded']]) {
                const control = button('', () => { criteria.savedState = value; renderResults(); }, 'navigation-library-saved-filter');
                control.dataset.savedState = value; control.dataset.label = key; savedNav.append(control);
            }
            panel.append(savedNav);
            filtersPanel = el('div', undefined, 'navigation-library-filters'); filtersPanel.id = 'navigation-library-filters'; filtersPanel.hidden = true;
            const filterControls = [];
            function selectFilter(key, choices, label) {
                const wrapper = el('label', t(key)), select = el('select'); select.setAttribute('aria-label', t(key));
                const any = el('option', t('any')); any.value = ''; select.append(any);
                choices.forEach(value => { const option = el('option', label(value)); option.value = value; select.append(option); });
                select.addEventListener('change', () => {
                    if (owner !== revision || !select.isConnected || select.disabled || busy || !snapshot || root.LocalItabContentLifecycle?.departing) return;
                    applyFilter(key, select.value);
                }); wrapper.append(select); filtersPanel.append(wrapper); filterControls.push({ key, select, label }); return select;
            }
            function applyFilter(key, value) {
                criteria[key] = value;
                const control = filterControls.find(item => item.key === key);
                if (control) control.select.value = value;
                renderResults();
            }
            applyTagFilter = tag => applyFilter('tag', tag);
            const distinct = key => [...new Set(entries.flatMap(site => site[key]))].sort();
            const tagSelect = selectFilter('tag', [], tagLabel);
            function refreshTagOptions() {
                tagSelect.replaceChildren();
                const any = el('option', t('any')); any.value = ''; tagSelect.append(any);
                const scoped = entries.filter(site => !criteria.category || site.categories.includes(criteria.category));
                const tags = [...new Set(scoped.flatMap(site => site.tags))].sort((a, b) => tagLabel(a).localeCompare(tagLabel(b), language()));
                // Keep a use filter when it still exists in the destination category,
                // independently of the other AND filters or current result count.
                if (criteria.tag && !tags.includes(criteria.tag)) criteria.tag = '';
                tags.forEach(tag => { const option = el('option', tagLabel(tag)); option.value = tag; tagSelect.append(option); });
                tagSelect.value = criteria.tag || '';
            }
            refreshTagOptions();
            const countries = distinct('country').sort((a, b) => {
                if (a === 'unknown' || b === 'unknown') return a === b ? 0 : a === 'unknown' ? 1 : -1;
                return countryLabel(a).localeCompare(countryLabel(b), language()) || (a < b ? -1 : a > b ? 1 : 0);
            });
            selectFilter('country', countries, countryLabel);
            selectFilter('company', distinct('company'), value => value === 'unknown' ? t('unknown') : value);
            selectFilter('pricing', api.pricing, t); panel.append(filtersPanel);
            const activeFilters = el('div', undefined, 'navigation-library-active-filters');
            activeFilters.setAttribute('role', 'group'); activeFilters.setAttribute('aria-label', t('activeFilters'));
            panel.append(activeFilters);
            refreshActiveFilters = () => {
                const active = filterControls.filter(({ key }) => criteria[key]);
                filterButton.textContent = active.length ? `${t('filters')} (${active.length})` : t('filters');
                activeFilters.hidden = !active.length;
                activeFilters.replaceChildren();
                active.forEach(({ key, select, label }, index) => {
                    const value = criteria[key], description = `${t(key)}: ${label(value)}`;
                    const remove = button(undefined, () => {
                        if (!remove.isConnected || criteria[key] !== value) return;
                        criteria[key] = ''; select.value = '';
                        renderResults();
                        const remaining = activeFilters.querySelectorAll('button');
                        (remaining[Math.min(index, remaining.length - 1)] || filterButton).focus();
                    }, 'navigation-library-active-filter');
                    remove.addEventListener('keydown', event => {
                        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
                    });
                    remove.dataset.filter = key;
                    remove.setAttribute('aria-label', `${t('removeFilter')}: ${description}`);
                    const icon = el('span', '×'); icon.setAttribute('aria-hidden', 'true');
                    remove.append(el('span', description), icon);
                    activeFilters.append(remove);
                });
            };

            const toolbar = el('div', undefined, 'navigation-library-toolbar');
            count = el('span', '', 'navigation-library-count'); count.setAttribute('role', 'status'); toolbar.append(count);
            clearFilters = () => { if (owner !== revision || browsingUnavailable()) return; selectedOnly = false; criteria = {}; search.value = ''; for (const select of filtersPanel.querySelectorAll('select')) select.value = ''; refreshTagOptions(); refreshCategories(); renderResults(); search.focus(); };
            const reset = resetFiltersButton = button(t('clear'), clearFilters, 'navigation-library-clear'); toolbar.append(reset);
            const refreshControl = refreshSavedButton = button(t('refreshSaved'), () => { if (owner === revision && refreshControl.isConnected) refreshSavedState(); }, 'navigation-library-refresh-saved'); toolbar.append(refreshSavedButton);
            const destinationLabel = el('label', t('destination'), 'navigation-library-destination'); destination = el('select'); destination.setAttribute('aria-label', t('destination'));
            const active = root.categoryNavigation?.getCurrentCategory?.();
            currentDestination = snapshot.categories.some(category => category.id === active) ? active : snapshot.categories[0]?.id || '';
            rebuildDestinations();
            destination.addEventListener('change', () => {
                if (busy || writing) return;
                currentDestination = destination.value;
                if (validDestination() && missingDestinationFeedback) {
                    // Retire only the missing-target part of this refresh's own
                    // feedback. Read-only guidance and newer errors stay intact.
                    if (status.textContent === missingDestinationFeedback.text) status.textContent = missingDestinationFeedback.remaining;
                    missingDestinationFeedback = null;
                }
                renderResults();
            });
            destinationLabel.append(destination); existingDestination = destinationLabel; toolbar.append(destinationLabel);
            newCategoryButton = button(t('newCategory'), () => changeTargetMode(true), 'navigation-library-new-category'); toolbar.append(newCategoryButton); panel.append(toolbar);
            newCategoryPanel = el('div', undefined, 'navigation-library-new-category-panel'); newCategoryPanel.hidden = true;
            const nameLabel = el('label', t('categoryName')); nameInput = el('input'); nameInput.type = 'text'; nameInput.autocomplete = 'off';
            nameInput.setAttribute('aria-label', t('categoryName')); nameInput.setAttribute('aria-describedby', 'navigation-library-category-hint navigation-library-category-error');
            nameInput.addEventListener('input', () => { if (writing) return; draftName = nameInput.value; categoryError.textContent = ''; nameInput.setAttribute('aria-invalid', 'false'); renderResults(); });
            nameLabel.append(nameInput); const hint = el('p', t('categoryHint')); hint.id = 'navigation-library-category-hint';
            categoryError = el('p', '', 'navigation-library-category-error'); categoryError.id = 'navigation-library-category-error'; categoryError.setAttribute('role', 'status');
            useExisting = button(t('existingCategory'), () => changeTargetMode(false), 'navigation-library-use-existing');
            useExisting.dataset.unavailable = String(!snapshot.categories.length); useExisting.disabled = !snapshot.categories.length;
            newCategoryPanel.append(nameLabel, useExisting, hint, categoryError); panel.append(newCategoryPanel);
            const batchBar = el('div', undefined, 'navigation-library-batch');
            batchCount = el('span'); batchCount.setAttribute('role', 'status');
            const owner = revision;
            batchClear = button(t('clearSelection'), () => {
                if (owner !== revision || !batchClear.isConnected || selectionUnavailable()) return;
                selected.clear(); renderResults(); (selectedOnly ? batchSelectedOnly : search).focus();
            }, 'navigation-library-clear');
            leaveSelectedOnly = () => { if (owner !== revision || browsingUnavailable()) return; selectedOnly = false; renderResults(); batchSelectedOnly.focus(); };
            const selectedToggle = batchSelectedOnly = button(t('selectedOnly'), () => {
                if (owner !== revision || !selectedToggle.isConnected || browsingUnavailable()) return;
                selectedOnly = !selectedOnly; renderResults(); selectedToggle.focus();
            }, 'navigation-library-selected-only');
            batchHiddenCount = el('span', '', 'navigation-library-hidden-selected');
            batchHiddenCount.setAttribute('role', 'status');
            selectedToggle.addEventListener('keydown', event => {
                if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
            });
            batchReview = button(t('reviewSelection'), reviewSelection, 'navigation-library-batch-review');
            batchSelect = button('', selectCurrentResults, 'navigation-library-select-results');
            const deselect = batchDeselect = button('', () => {
                if (owner !== revision || !deselect.isConnected || deselect.disabled || selectionUnavailable() || reviewed) return;
                const removals = currentResultDeselection();
                if (!removals.length) return;
                removals.forEach(id => selected.delete(id));
                renderResults();
                // The exhausted action is disabled, and selected-only cards may disappear.
                batchSelectedOnly.focus();
            }, 'navigation-library-deselect-results');
            deselect.addEventListener('keydown', event => {
                if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
            });
            batchHelp = el('p', t('selectionHelp'), 'navigation-library-selection-help'); batchHelp.id = 'navigation-library-selection-help';
            batchHelp.setAttribute('aria-live', 'polite');
            batchSelect.setAttribute('aria-describedby', batchHelp.id);
            batchBar.append(batchCount, batchHiddenCount, batchSelectedOnly, batchClear, batchSelect, batchDeselect, batchReview, batchHelp); panel.append(batchBar);
            reviewPanel = el('section', undefined, 'navigation-library-review'); reviewPanel.hidden = true; reviewPanel.tabIndex = -1;
            reviewPanel.setAttribute('aria-label', t('reviewTitle')); panel.append(reviewPanel);
            results = el('div', undefined, 'navigation-library-results'); panel.append(results);
            const foot = el('footer', undefined, 'navigation-library-footer'); foot.append(el('p', t('privacy')));
            privacySummary = el('p'); foot.append(privacySummary); refreshPrivacySummary();
            foot.append(el('p', t('disclosure'))); panel.append(foot);
            status.textContent = currentDestination ? '' : t('noCategory'); renderResults(); search.focus(); bindSearchShortcut();
        }
        function bindSearchShortcut() {
            const owner = revision, ownedPanel = panel, ownedSearch = search;
            const unavailable = node => {
                if (!node?.isConnected || node.closest('[hidden], [inert], [aria-hidden="true"]') || !node.getClientRects().length) return true;
                for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
                    if (ancestor !== node && ancestor.tagName === 'DETAILS' && !ancestor.open) {
                        const summary = Array.from(ancestor.children).find(child => child.tagName === 'SUMMARY');
                        if (!summary?.contains(node)) return true;
                    }
                    const style = root.getComputedStyle?.(ancestor) || ancestor.style;
                    if (style?.display === 'none' || style?.visibility === 'hidden' || style?.visibility === 'collapse') return true;
                }
                return false;
            };
            const handleSearchShortcut = event => {
                // Own only this opening and these live nodes. Never re-render or
                // invalidate a review merely to move keyboard focus.
                if (owner !== revision || panel !== ownedPanel || search !== ownedSearch || !overlay ||
                    busy || writing || blocked || reviewed || !reviewPanel.hidden || !snapshot || isComposing() ||
                    root.LocalItabContentLifecycle?.departing || component._shortcutWritesPending || component._pendingSave ||
                    component._pendingDelete || component._shortcutOrderPending || component.layoutController?.failedChange ||
                    component.layoutController?.invalidated || component.layoutController?.pending || component.layoutController?.timer ||
                    component.layoutController?.modePending || component.modal?.classList.contains('active') ||
                    document.hidden || document.visibilityState === 'hidden' || event.key !== '/' || event.defaultPrevented ||
                    event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey ||
                    event.altKey || event.getModifierState?.('AltGraph') || ownedSearch.disabled ||
                    !ownedPanel.contains(ownedSearch) || !ownedPanel.contains(event.target) ||
                    !ownedPanel.contains(document.activeElement) || unavailable(ownedPanel) || unavailable(ownedSearch) ||
                    unavailable(event.target) || unavailable(document.activeElement)) return;
                const controls = 'input, textarea, select, audio, video, iframe, object, embed, [contenteditable], [role="textbox"], [role="combobox"], [role="listbox"], [role="slider"], [role="spinbutton"]';
                const path = event.composedPath?.() || [event.target];
                if (document.designMode?.toLowerCase() === 'on' || path.some(node => node.isContentEditable || node.closest?.(controls)) ||
                    document.activeElement?.isContentEditable || document.activeElement?.closest(controls)) return;
                // The library is itself a dialog. Only another visible modal/menu
                // should suppress this local shortcut; never suppress our own panel.
                if (Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], [role="menu"], dialog[open], .modal-overlay.active'))
                    .some(node => node !== ownedPanel && !unavailable(node))) return;
                ownedSearch.focus();
                if (document.activeElement !== ownedSearch) return;
                event.preventDefault();
                ownedSearch.select();
            };
            ownedPanel.addEventListener('keydown', handleSearchShortcut);
            cleanupSearchShortcut = () => {
                ownedPanel.removeEventListener('keydown', handleSearchShortcut);
            };
        }
        function validDestination() { return snapshot?.categories.some(category => category.id === currentDestination); }
        function refreshPrivacySummary() {
            if (privacySummary) privacySummary.textContent = snapshot.privacy ? `${t('sync')}: ${t(snapshot.privacy.syncEnabled ? 'on' : 'off')} · ${t('icons')}: ${t(snapshot.privacy.onlineFavicons ? 'on' : 'off')}` : '';
        }
        function refreshReadControl() {
            if (!refreshSavedButton?.isConnected) return;
            refreshSavedButton.dataset.unavailable = String(Boolean(refreshUnavailable() || reviewed || refreshing));
            if (refreshSavedButton.dataset.unavailable === 'true' && document.activeElement === refreshSavedButton) panel.focus();
            refreshSavedButton.disabled = refreshSavedButton.dataset.unavailable === 'true';
        }
        async function refreshSavedState() {
            if (!refreshSavedButton?.isConnected || refreshUnavailable() || reviewed || isComposing() || refreshing) return;
            const owner = revision, ticket = ++readTicket, ownedPanel = panel, store = root.storageManager;
            const workspace = store.workspace, workspaceId = workspace?.id, lifecycle = root.LocalItabContentLifecycle;
            const layoutOwner = component.layoutController, layoutVersion = layoutOwner?.version, layoutGeneration = layoutOwner?.generation, mutationEpoch = layoutOwner?.shortcutMutationEpoch;
            const restoreFocus = document.activeElement === refreshSavedButton;
            // Move focus before disabling its owner so panel-local Escape/Tab still work.
            if (restoreFocus) ownedPanel.focus();
            refreshing = busy = true; setControls(); status.textContent = t('refreshingSaved');
            const owns = () => owner === revision && ticket === readTicket && panel === ownedPanel && ownedPanel.isConnected;
            const sameContext = () => store === root.storageManager && workspace === store.workspace && workspaceId === store.workspace?.id &&
                lifecycle === root.LocalItabContentLifecycle && !lifecycle?.departing &&
                layoutOwner === component.layoutController && layoutVersion === layoutOwner?.version && layoutGeneration === layoutOwner?.generation && mutationEpoch === layoutOwner?.shortcutMutationEpoch && !externalWorkPending(true);
            try {
                const fresh = await store.readNavigationLibrarySnapshot();
                if (!owns()) return;
                if (!sameContext()) {
                    blocked = true; refreshing = busy = false; renderResults(); status.textContent = t('conflict'); return;
                }
                const before = selected.size;
                snapshot = fresh;
                rebuildDestinations(); refreshPrivacySummary();
                useExisting.dataset.unavailable = String(!snapshot.categories.length);
                // Render against one coherent snapshot without rebuilding editor/filter nodes.
                refreshing = busy = false; renderResults();
                const removed = before - selected.size;
                const remaining = [t(component.layoutController?.invalidated ? 'refreshReadOnly' : 'refreshedSaved'), removed ? t('refreshRemoved').replace('{count}', String(removed)) : ''].filter(Boolean).join(' ');
                const missing = !newCategoryMode && !validDestination();
                status.textContent = [remaining, missing ? t('missingDestination') : ''].filter(Boolean).join(' ');
                missingDestinationFeedback = missing ? { text: status.textContent, remaining } : null;
            } catch (_) {
                if (owns()) {
                    if (!sameContext()) { blocked = true; refreshing = busy = false; renderResults(); }
                    status.textContent = t(blocked ? 'conflict' : 'refreshFailed');
                }
            } finally {
                if (owns()) {
                    refreshing = busy = false;
                    refreshResultSelection(); setControls();
                    if (restoreFocus && !refreshSavedButton.disabled && document.activeElement === ownedPanel) refreshSavedButton.focus();
                }
            }
        }
        function rebuildDestinations() {
            destinationLabels = api.personalCategoryLabels(snapshot.categories);
            destination.replaceChildren();
            if (!validDestination()) { const missing = el('option', currentDestination ? `${t('missingDestination')} (${currentDestination})` : t('noCategory')); missing.value = currentDestination; missing.disabled = true; destination.append(missing); }
            snapshot.categories.forEach(category => { const option = el('option', destinationLabels.get(category.id)); option.value = category.id; destination.append(option); });
            destination.value = currentDestination;
        }
        function invalidateReview() { reviewed = null; if (reviewPanel) reviewPanel.hidden = true; refreshReadControl(); }
        function changeTargetMode(value) {
            if (busy || writing || blocked) return;
            newCategoryMode = value; newCategoryPanel.hidden = !value; existingDestination.hidden = value; newCategoryButton.hidden = value;
            renderResults(); (value ? nameInput : destination).focus();
        }
        function validatedName() {
            const name = draftName.trim().normalize('NFC');
            const invalid = !name || [...name].length > 80 || /[\u0000-\u001f\u007f-\u009f]/u.test(draftName);
            const duplicate = snapshot.categories.some(category => category.name.trim().normalize('NFC').toLowerCase() === name.toLowerCase());
            if (invalid || duplicate) {
                categoryError.textContent = t(invalid ? 'categoryInvalid' : 'categoryExists'); nameInput.setAttribute('aria-invalid', 'true'); nameInput.focus(); return null;
            }
            return name;
        }
        const serialize = value => ({ name: value.name, url: value.url, icon: value.icon || value.name.slice(0, 2) });
        function frozenCopy(value) {
            const copy = JSON.parse(JSON.stringify(value));
            const freeze = item => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } return item; };
            return freeze(copy);
        }
        function refreshCategories() {
            for (const node of categoryNav.children) node.setAttribute('aria-pressed', String(node.dataset.category === (criteria.category || '')));
        }
        function currentResultSelection() {
            return [...new Set(selectableResults.map(site => site.id))].filter(id => !selected.has(id));
        }
        function currentResultDeselection() {
            return [...new Set(selectableResults.map(site => site.id))].filter(id => selected.has(id));
        }
        function refreshCurrentDeselection() {
            if (!batchDeselect?.isConnected) return;
            const removals = currentResultDeselection();
            batchDeselect.textContent = `${t('deselectResults')} (${removals.length})`;
            batchDeselect.dataset.unavailable = String(!removals.length || Boolean(selectionUnavailable()) || isComposing() || Boolean(reviewed));
            batchDeselect.disabled = batchDeselect.dataset.unavailable === 'true';
        }
        function refreshResultSelection() {
            refreshReadControl();
            refreshCurrentDeselection();
            const additions = currentResultSelection(), overLimit = selected.size + additions.length > 20;
            batchSelect.textContent = `${t('selectResults')} (${additions.length})`;
            batchSelect.dataset.unavailable = String(!additions.length || overLimit || Boolean(selectionUnavailable()) || isComposing() || Boolean(reviewed));
            batchSelect.disabled = writing || batchSelect.dataset.unavailable === 'true';
            batchHelp.textContent = t(overLimit ? 'selectionLimit' : 'selectionHelp');
        }
        function selectCurrentResults() {
            if (selectionUnavailable() || isComposing() || reviewed) return;
            const additions = currentResultSelection();
            if (!additions.length || selected.size + additions.length > 20) return;
            additions.forEach(id => selected.add(id));
            renderResults();
            // The action is now exhausted and disabled; keep keyboard focus in the batch bar.
            (batchReview.disabled ? batchClear : batchReview).focus();
        }
        function selectionUnavailable() {
            return busy || writing || blocked || !snapshot || root.LocalItabContentLifecycle?.departing || externalWorkPending();
        }
        function browsingUnavailable() {
            return busy || writing || blocked || !snapshot || root.LocalItabContentLifecycle?.departing || externalWorkPending(true);
        }
        function refreshUnavailable() { return browsingUnavailable(); }
        function readOnlyInvalidatedLayout(controller) {
            // Only the known controller's invalidation-derived modePending is
            // safe to ignore for reads. Never adopt/clear its write fence.
            const Controller = root.LocalItabLayout?.Controller;
            return typeof Controller === 'function' && controller instanceof Controller && controller.invalidated === true &&
                controller.modePending === true && !controller.failedChange && !controller.pending && !controller.timer &&
                !controller.externalHold && !controller.identityPending &&
                [controller.patch, controller.positions, controller.identityPositions].every(value =>
                    value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0);
        }
        function externalWorkPending(allowReadOnlyInvalidation = false) {
            const readOnly = allowReadOnlyInvalidation && readOnlyInvalidatedLayout(component.layoutController);
            return component._shortcutWritesPending || component._pendingSave || component._pendingDelete || component._shortcutOrderPending ||
                component.layoutController?.failedChange || (!readOnly && component.layoutController?.invalidated) || component.layoutController?.pending ||
                component.layoutController?.timer || (!readOnly && component.layoutController?.modePending) || component.modal?.classList.contains('active');
        }
        function refreshBatch() {
            reviewed = null; reviewPanel.hidden = true;
            batchCount.textContent = `${selected.size} / 20 ${t('selected')}`;
            batchReview.dataset.unavailable = String(!selected.size || (!newCategoryMode && !validDestination()) || blocked || externalWorkPending());
            batchClear.dataset.unavailable = String(!selected.size || selectionUnavailable());
            resetFiltersButton.dataset.unavailable = String(Boolean(browsingUnavailable()));
            resetFiltersButton.disabled = resetFiltersButton.dataset.unavailable === 'true';
            batchSelectedOnly.dataset.unavailable = String(Boolean(browsingUnavailable()));
            batchSelectedOnly.disabled = batchSelectedOnly.dataset.unavailable === 'true';
            batchSelectedOnly.setAttribute('aria-pressed', String(selectedOnly));
            const visibleSelected = selectableResults.filter(site => selected.has(site.id)).length;
            batchHiddenCount.textContent = `${t('hiddenSelected')}: ${selected.size - visibleSelected}`;
            batchReview.disabled = writing || !selected.size || (!newCategoryMode && !validDestination()) || blocked || externalWorkPending();
            batchClear.disabled = batchClear.dataset.unavailable === 'true';
            refreshResultSelection();
        }
        function reviewSelection() {
            reviewSites(root.LocalItabNavigationSites.filter(site => selected.has(site.id)), true);
        }
        function reviewSites(sites, batch) {
            if (externalWorkPending()) { status.textContent = t(component.layoutController?.invalidated ? 'refreshReload' : 'layout'); setControls(); return; }
            if (busy || writing || isComposing() || blocked || !sites.length || (!newCategoryMode && !validDestination())) return;
            const name = newCategoryMode ? validatedName() : null;
            if (newCategoryMode && !name) return;
            const confirmation = frozenCopy({ sites: sites.map(serialize), batch, baseline: snapshot.state,
                ...(newCategoryMode ? { newCategory: { name } } : { destination: currentDestination }) });
            reviewed = confirmation;
            reviewPanel.replaceChildren();
            const target = newCategoryMode ? `${t('willCreate')}: ${name}` : `${t('destination')}: ${destinationLabels.get(currentDestination) || currentDestination}`;
            reviewPanel.append(el('h3', t('reviewTitle')), el('p', `${sites.length} ${t('selected')} · ${target}`));
            const list = el('ul');
            if (batch) list.className = 'navigation-library-review-list';
            sites.forEach((site, index) => {
                const row = el('li', batch ? undefined : `${site.name} · ${site.url}`);
                if (batch) {
                    row.append(el('span', `${site.name} · ${site.url}`));
                    const remove = button(t('removeSelection'), () => {
                        if (reviewed !== confirmation || !selected.has(site.id)) return;
                        if (selectionUnavailable()) {
                            if (externalWorkPending()) status.textContent = t(component.layoutController?.invalidated ? 'refreshReload' : 'layout');
                            return;
                        }
                        selected.delete(site.id);
                        // Refresh cards/counts and retire every closure from the old review.
                        // Rebuilding the review creates a new immutable confirmation.
                        renderResults();
                        if (!selected.size) { search.focus(); return; }
                        reviewSelection();
                        const controls = reviewPanel.querySelectorAll('.navigation-library-review-remove');
                        controls[Math.min(index, controls.length - 1)]?.focus();
                    }, 'navigation-library-review-remove');
                    remove.setAttribute('aria-label', `${t('removeSelection')}: ${site.name}`);
                    remove.addEventListener('keydown', event => {
                        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
                    });
                    row.append(remove);
                }
                list.append(row);
            });
            reviewPanel.append(list);
            if (snapshot.privacy) reviewPanel.append(el('p', `${t('sync')}: ${t(snapshot.privacy.syncEnabled ? 'on' : 'off')} · ${t('icons')}: ${t(snapshot.privacy.onlineFavicons ? 'on' : 'off')}`));
            const cancel = button(t('cancelSelection'), () => {
                if (reviewed !== confirmation) return;
                invalidateReview(); refreshResultSelection();
                const target = batch ? batchReview : nameInput;
                (target?.isConnected && !target.disabled && !target.closest('[hidden]') ? target : !search.disabled ? search : panel).focus();
            }, 'navigation-library-review-cancel');
            reviewConfirm = button(newCategoryMode ? `${t('createAndAdd')} (${sites.length})` : t('confirmSelection'), () => { if (reviewed === confirmation) save(batch ? sites : sites[0], batch, confirmation); }, 'navigation-library-batch-confirm');
            reviewPanel.append(cancel, reviewConfirm); reviewPanel.hidden = false; refreshResultSelection(); reviewConfirm.focus();
        }
        function renderResults(focusId) {
            // Native toggle events are queued/coalesced. Read the live property before
            // replacing nodes so a same-task filter change cannot lose the latest state.
            let detailFocus;
            for (const [id, details] of renderedDetails) {
                if (!details.isConnected) continue;
                if (details.open) expandedDetails.add(id); else expandedDetails.delete(id);
                if (details.contains(document.activeElement)) {
                    detailFocus = { id, index: Array.from(details.querySelectorAll('summary, button, a')).indexOf(document.activeElement) };
                }
            }
            renderedDetails.clear();
            const owner = revision;
            refreshActiveFilters();
            const saved = api.savedLocations(snapshot.links, snapshot.categories);
            const isSaved = site => saved.has(api.canonicalURL(site.url));
            for (const site of root.LocalItabNavigationSites) if (isSaved(site)) selected.delete(site.id);
            const matching = api.filter(root.LocalItabNavigationSites, criteria, language(), tagLabel).filter(site => !selectedOnly || selected.has(site.id));
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
                const catalogEmpty = !root.LocalItabNavigationSites.length;
                const noSelection = selectedOnly && !selected.size;
                const hiddenSelection = selected.size > 0;
                const title = catalogEmpty ? 'catalogEmpty' : noSelection ? 'emptySelected' : hiddenSelection ? 'emptyHidden' : 'empty';
                const help = catalogEmpty ? 'catalogEmptyHelp' : noSelection ? 'emptySelectedHelp' : hiddenSelection ? 'emptyHiddenHelp' : 'emptyHelp';
                const empty = el('div', undefined, 'navigation-library-empty');
                empty.append(el('span', '', 'navigation-library-search-icon'), el('h3', t(title)), el('p', t(help)));
                if (!catalogEmpty && hiddenSelection) empty.append(el('p', `${t('hiddenSelected')}: ${selected.size}`));
                if (!catalogEmpty) {
                    const recover = button(t(noSelection ? 'browseAll' : 'clear'), () => {
                        if (owner !== revision || !recover.isConnected || recover.disabled || browsingUnavailable()) return;
                        (noSelection ? leaveSelectedOnly : clearFilters)();
                    }, 'navigation-library-clear navigation-library-empty-recover');
                    recover.dataset.unavailable = String(Boolean(browsingUnavailable()));
                    recover.disabled = recover.dataset.unavailable === 'true';
                    recover.addEventListener('keydown', event => {
                        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
                    });
                    empty.append(recover);
                }
                results.append(empty); if (focusId || detailFocus) { empty.tabIndex = -1; empty.focus(); } return;
            }
            for (const site of entries) {
                const card = el('article', undefined, 'navigation-library-card'); card.dataset.site = site.id;
                const top = el('div', undefined, 'navigation-library-card-top'), mark = el('span', site.icon || site.name.slice(0, 2), 'navigation-library-mark'); mark.setAttribute('aria-hidden', 'true');
                mark.dataset.tone = String(api.categories.findIndex(category => category.id === site.categories[0]) % 6);
                const titleBlock = el('div', undefined, 'navigation-library-site-heading'), title = el('h3', site.name);
                titleBlock.append(title, el('span', new URL(site.url).hostname.replace(/^www\./, ''), 'navigation-library-domain')); top.append(mark, titleBlock); card.append(top);
                const pickLabel = el('label', undefined, 'navigation-library-pick'), pick = el('input'); pick.type = 'checkbox'; pick.checked = selected.has(site.id);
                pick.setAttribute('aria-label', `${t('select')}: ${site.name}`);
                pick.dataset.unavailable = String(isSaved(site) || selectionUnavailable() || (!pick.checked && selected.size >= 20));
                pick.disabled = writing || pick.dataset.unavailable === 'true';
                pick.addEventListener('change', () => {
                    if (owner !== revision || !pick.isConnected) return;
                    if (pick.disabled || selectionUnavailable() || isSaved(site)) {
                        // Native change toggles checked before this handler runs.
                        // Keep the visual state faithful when a read-only fence rejects it.
                        pick.checked = selected.has(site.id);
                        if (selectionUnavailable()) {
                            if (document.activeElement === pick) panel.focus();
                            pick.dataset.unavailable = 'true'; pick.disabled = true;
                        }
                        return;
                    }
                    const index = Array.from(results.children).findIndex(node => node.dataset.site === site.id);
                    if (pick.checked && selected.size < 20) selected.add(site.id); else selected.delete(site.id);
                    renderResults();
                    const remaining = Array.from(results.children).filter(node => node.dataset.site);
                    const replacement = (remaining.find(node => node.dataset.site === site.id) || remaining[Math.min(index, remaining.length - 1)])?.querySelector('input');
                    (replacement || batchSelectedOnly).focus();
                });
                pickLabel.append(pick, el('span', t('select'))); card.append(pickLabel);
                card.append(el('p', api.localized(site.description, language()), 'navigation-library-description'));
                function tagControl(tag, location) {
                    const control = button(tagLabel(tag), () => {
                        if (owner !== revision || !control.isConnected || control.disabled || busy || !snapshot || root.LocalItabContentLifecycle?.departing) return;
                        applyTagFilter(tag);
                        // The old card was replaced. Restore the same purpose control,
                        // including its disclosure location, rather than a detached node.
                        const replacement = Array.from(results.children).find(node => node.dataset.site === site.id);
                        const next = Array.from(replacement?.querySelectorAll('.navigation-library-tag') || []).find(node => node.dataset.tag === tag && node.dataset.location === location);
                        (next || overlay.querySelector('.navigation-library-active-filter[data-filter="tag"]') || search).focus();
                    }, 'navigation-library-tag');
                    control.dataset.tag = tag; control.dataset.location = location;
                    control.setAttribute('aria-pressed', String(criteria.tag === tag));
                    control.setAttribute('aria-label', `${t('tag')}: ${tagLabel(tag)}`);
                    control.disabled = writing;
                    control.addEventListener('keydown', event => {
                        if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
                    });
                    return control;
                }
                const tags = el('div', undefined, 'navigation-library-tags');
                site.tags.slice(0, 2).forEach(tag => tags.append(tagControl(tag, 'card')));
                if (site.tags.length > 2) tags.append(el('span', `+${site.tags.length - 2} ${t(site.tags.length === 3 ? 'moreUse' : 'moreUses')}`, 'navigation-library-more-uses'));
                tags.append(el('span', t(site.pricing), 'navigation-library-price')); card.append(tags);
                const actions = el('div', undefined, 'navigation-library-card-actions'), added = saved.has(api.canonicalURL(site.url));
                const visit = el('a', t('official'), 'navigation-library-visit'); visit.href = site.url; visit.target = '_blank'; visit.rel = 'noopener noreferrer'; visit.setAttribute('aria-label', `${t('visit')}: ${site.name}`); visit.title = t('visit');
                const add = button(added ? `✓ ${t('added')}` : `+ ${t('add')}`, () => newCategoryMode ? reviewSites([site], false) : save(site), 'navigation-library-add');
                add.setAttribute('aria-label', `${added ? t('added') : t('add')}: ${site.name}`);
                add.dataset.unavailable = String(added || (!newCategoryMode && !validDestination()) || blocked || externalWorkPending()); add.disabled = writing || add.dataset.unavailable === 'true';
                if (added) add.classList.add('is-added'); actions.append(visit, add); card.append(actions);
                if (added) {
                    const locations = saved.get(api.canonicalURL(site.url));
                    const locationInfo = el('div', undefined, 'navigation-library-saved-locations');
                    const labelId = `navigation-library-saved-locations-${site.id}`;
                    const label = el('p', t('savedLocations')); label.id = labelId;
                    const list = el('ul'); list.setAttribute('aria-labelledby', labelId);
                    for (const location of locations) {
                        list.append(el('li', destinationLabels.get(location.id) || `${t('unknownSavedCategory')} (${location.id})`));
                    }
                    locationInfo.append(label, list); card.append(locationInfo);
                    add.setAttribute('aria-describedby', labelId);
                }
                const details = el('details', undefined, 'navigation-library-details');
                details.open = expandedDetails.has(site.id);
                renderedDetails.set(site.id, details);
                details.addEventListener('toggle', () => {
                    // Retired nodes and previous dialog sessions cannot change this session.
                    if (owner !== revision || !details.isConnected || renderedDetails.get(site.id) !== details) return;
                    if (details.open) expandedDetails.add(site.id); else expandedDetails.delete(site.id);
                });
                const summary = el('summary', t('source')); summary.setAttribute('tabindex', '0'); details.append(summary);
                const metadata = el('dl', undefined, 'navigation-library-metadata');
                const detailRow = (label, value) => metadata.append(el('dt', t(label)), el('dd', value));
                const allUses = el('dd', undefined, 'navigation-library-all-uses');
                site.tags.forEach(tag => allUses.append(tagControl(tag, 'details')));
                metadata.append(el('dt', t('allUses')), allUses);
                detailRow('categories', site.categories.map(id => api.categories.find(category => category.id === id)?.[language()] || id).join(' · '));
                details.append(metadata);
                details.append(el('p', `${t('company')}: ${site.company === 'unknown' ? t('unknown') : site.company}`));
                details.append(el('p', `${t('country')}: ${countryLabel(site.country)}`));
                details.append(el('p', `${t('pricing')}: ${t(site.pricing)}${site.pricingNote ? ` · ${api.localized(site.pricingNote, language())}` : ''}`));
                details.append(el('p', `${t('checked')}: ${site.verifiedOn}`));
                details.append(el('p', t('sources'), 'navigation-library-detail-label'));
                site.sources.forEach((source, index) => { const link = el('a', `${index + 1}. ${new URL(source).hostname}`); link.href = source; link.target = '_blank'; link.rel = 'noopener noreferrer'; details.append(link); }); card.append(details);
                results.append(card);
                if (focusSite?.id === site.id) { card.tabIndex = -1; card.focus(); }
            }
            if (!focusId && detailFocus) {
                const details = renderedDetails.get(detailFocus.id);
                const controls = details?.querySelectorAll('summary, button, a');
                (controls?.[details?.open ? Math.max(0, detailFocus.index) : 0] || search).focus();
            }
        }
        async function save(site, batch = false, confirmation = null) {
            if (externalWorkPending()) { status.textContent = t(component.layoutController?.invalidated ? 'refreshReload' : 'layout'); setControls(); return; }
            if (busy || writing || isComposing() || blocked || !snapshot || (!newCategoryMode && !validDestination()) || root.LocalItabContentLifecycle?.departing || (confirmation && reviewed !== confirmation) || (newCategoryMode && !confirmation?.newCategory)) return;
            writing = busy = true; setControls(); panel.focus(); status.textContent = batch ? `${t('saving')} ${site.length}` : `${t('saving')} ${site.name}`;
            const request = confirmation ? { baseline: confirmation.baseline,
                ...(batch ? { sites: confirmation.sites } : { site: confirmation.sites[0] }),
                ...(confirmation.newCategory ? { newCategory: confirmation.newCategory, confirmedNewCategory: true } : { destination: confirmation.destination }) } :
                { baseline: snapshot.state, ...(batch ? { sites: site.map(serialize) } : { site: serialize(site) }), destination: currentDestination };
            try {
                const saved = await component.addCatalogShortcut(request); snapshot = saved;
                if (saved.createdCategory) { currentDestination = saved.destination || saved.createdCategory.id; draftName = ''; nameInput.value = ''; newCategoryMode = false; newCategoryPanel.hidden = true; existingDestination.hidden = false; newCategoryButton.hidden = false; }
                rebuildDestinations();
                useExisting.dataset.unavailable = String(!snapshot.categories.length);
                status.textContent = request.newCategory && !saved.createdCategory ? t('noNewSites') : batch ? `${saved.addedCount} · ${t('saved')} ${destinationLabels.get(currentDestination) || currentDestination}${saved.skippedCount ? ` · ${saved.skippedCount} ${t('skipped')}` : ''}` : saved.duplicate ? `${site.name}: ${t('duplicate')}` : `${site.name} · ${t('saved')} ${destinationLabels.get(currentDestination) || currentDestination}`;
            } catch (error) {
                blocked = error.mayHaveCommitted || !['CATALOG_FAILED', 'CATALOG_CATEGORY_NAME', 'CATALOG_CATEGORY_EXISTS'].includes(error.code);
                status.textContent = t(error.mayHaveCommitted ? 'uncertain' : error.code === 'CATALOG_CATEGORY_NAME' ? 'categoryInvalid' : error.code === 'CATALOG_CATEGORY_EXISTS' ? 'categoryExists' : error.code === 'CATALOG_FAILED' ? (batch ? 'batchFailed' : 'failed') : error.code === 'CATALOG_UNVERIFIED' || error.mayHaveCommitted ? 'uncertain' : error.code === 'CATALOG_LAYOUT_PENDING' ? 'layout' : 'conflict');
            } finally {
                writing = busy = false; renderResults(batch ? site[0]?.id : site.id); setControls();
            }
        }
        return { open, close, get pending() { return busy; }, hasUncommittedWork: () => Boolean(overlay || busy), destroy() { if (!writing) { close(); opener.remove(); } } };
    }
    root.LocalItabNavigationLibrary = { mount };
})(window);
