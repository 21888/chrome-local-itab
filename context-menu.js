// Themed, menu-scoped context actions for the new tab page.
(function() {
    'use strict';

    const state = { root: null, session: null, theme: 'dark', onAction: null, initialized: false };
    const translate = (key, fallback) => window.i18n?.t(key) || fallback;
    const closest = (target, selector) => (target?.nodeType === 3 ? target.parentElement : target)?.closest?.(selector) || null;
    const visible = element => element?.isConnected && !element.disabled &&
        !closest(element, '[hidden], [inert]') && element.getClientRects().length > 0;

    function closeMenu({ restoreFocus = false } = {}) {
        const session = state.session;
        if (!session) return;
        state.session = null;
        const ownedFocus = session.menu.contains(document.activeElement);
        session.menu.remove();
        // Retire before returning focus: a focus handler or action can open a new
        // menu/dialog, and no delayed old cleanup may affect that newer surface.
        if (restoreFocus && ownedFocus && visible(session.origin)) session.origin.focus();
    }

    function snapshotTarget(target, payload) {
        const component = window.shortcutsComponentInstance;
        const fields = ['title', 'url', 'icon', 'category'];
        const capture = (records, keys) => records.map(record => ({ record, values: keys.map(key => record[key]) }));
        const matches = (records, snapshot, keys) => records.length === snapshot.length && snapshot.every((saved, index) =>
            records[index] === saved.record && keys.every((key, field) => records[index][key] === saved.values[field]));
        // Keep references and field values rather than serializing potentially
        // large embedded icons every time a menu opens.
        const links = capture(component?.links || [], fields);
        const categoryFields = ['id', 'name', 'icon'];
        const currentCategories = () => window.categoryNavigation?.categories || component?.categories || [];
        const categories = capture(currentCategories(), categoryFields);
        const hidden = () => typeof window.dashboardHiddenState === 'boolean' ? window.dashboardHiddenState : document.body.classList.contains('dashboard-hidden');
        const hiddenSnapshot = hidden();
        const layoutState = () => JSON.stringify([component?.layout?.autoArrange, component?.layout?.alignToGrid, Boolean(component?.layoutController?.modePending)]);
        const layoutSnapshot = layoutState();
        return action => {
            if (payload.type === 'blank') return action === 'dashboard_visibility_toggle' ? hidden() === hiddenSnapshot :
                component === window.shortcutsComponentInstance && layoutState() === layoutSnapshot;
            if (!visible(target) || component !== window.shortcutsComponentInstance) return false;
            if (!matches(component?.links || [], links, fields)) return false;
            if (payload.type === 'site') return Number(target.dataset.index) === payload.index && Boolean(component?.links[payload.index]);
            return (target.dataset.category || 'all') === payload.id && matches(currentCategories(), categories, categoryFields);
        };
    }

    function activate(session, action, button) {
        if (state.session !== session || button.disabled) return;
        const payload = { ...session.payload };
        closeMenu({ restoreFocus: true });
        if (state.session) return; // A focus handler already opened a newer menu.
        if (!session.isValid(action)) {
            window.showErrorMessage?.(translate('contextTargetChanged', 'This item changed. Reopen the action and try again.'));
            return;
        }
        try {
            const result = session.onAction?.(action, payload);
            result?.catch?.(error => console.error('Context action failed:', error));
        } catch (error) { console.error('Context action failed:', error); }
    }

    function createItem(session, labelKey, fallback, action, { checked, radio = false, disabled = false } = {}) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'ctx-item';
        item.tabIndex = -1;
        item.disabled = disabled;
        item.setAttribute('aria-disabled', String(disabled));
        item.setAttribute('role', checked === undefined ? 'menuitem' : radio ? 'menuitemradio' : 'menuitemcheckbox');
        if (checked !== undefined) {
            item.setAttribute('aria-checked', String(checked));
            const indicator = document.createElement('span');
            indicator.className = 'ctx-checkbox';
            indicator.setAttribute('aria-hidden', 'true');
            indicator.textContent = checked ? '☑' : '☐';
            item.appendChild(indicator);
        }
        const label = document.createElement('span');
        label.textContent = translate(labelKey, fallback);
        item.appendChild(label);
        item.addEventListener('click', () => activate(session, action, item));
        session.items.push(item);
        session.menu.appendChild(item);
        return item;
    }

    function separator(menu) {
        const element = document.createElement('div');
        element.className = 'ctx-sep';
        element.setAttribute('role', 'separator');
        menu.appendChild(element);
    }

    function focusItem(session, item) {
        for (const candidate of session.items) candidate.tabIndex = candidate === item ? 0 : -1;
        item?.focus();
    }

    function onMenuKeydown(event, session) {
        if (state.session !== session || !session.menu.contains(event.target)) return;
        if (event.ctrlKey || event.metaKey || event.altKey || (event.shiftKey && event.key !== 'Tab')) return;
        if (event.key === 'Tab') {
            // Restore the contextual origin, then let the browser perform its
            // ordinary forward/backward Tab navigation. No menu focus trap.
            closeMenu({ restoreFocus: true });
            return;
        }
        if (event.key === 'Escape') {
            event.preventDefault(); event.stopPropagation();
            closeMenu({ restoreFocus: true });
            return;
        }
        if ((event.key === 'Enter' || event.key === ' ') && event.repeat) {
            event.preventDefault(); event.stopPropagation();
            return;
        }
        const items = session.items.filter(visible);
        const index = items.indexOf(document.activeElement);
        let next;
        if (event.key === 'ArrowDown') next = (index + 1) % items.length;
        else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = items.length - 1;
        else return; // Native buttons own Enter/Space; no E/Delete shortcuts.
        event.preventDefault(); event.stopPropagation();
        if (items.length) focusItem(session, items[next]);
    }

    function buildMenu(session) {
        const { menu, payload } = session;
        const component = window.shortcutsComponentInstance;
        if (payload.type === 'site') {
            menu.setAttribute('aria-label', translate('contextShortcutActions', 'Shortcut actions'));
            createItem(session, 'openInNewTab', 'Open in new tab', 'open');
            createItem(session, 'edit', 'Edit', 'edit');
            createItem(session, 'remove', 'Delete', 'delete');
        } else if (payload.type === 'category') {
            menu.setAttribute('aria-label', translate('contextCategoryActions', 'Category actions'));
            createItem(session, 'openAll', 'Open all', 'open_all');
        } else {
            menu.setAttribute('aria-label', translate('contextPageActions', 'Page actions'));
            const auto = component?.layout?.autoArrange !== false;
            const align = Boolean(component?.layout?.alignToGrid);
            const disabled = !component || Boolean(component.layoutController?.modePending);
            createItem(session, 'placementGrid', 'Grid (default)', 'layout_grid', { checked: auto, radio: true, disabled });
            createItem(session, 'placementFree', 'Free placement', 'layout_free', { checked: !auto && !align, radio: true, disabled });
            createItem(session, 'placementSnap', 'Manual · snap to grid', 'layout_snap', { checked: !auto && align, radio: true, disabled });
            separator(menu);
            const hidden = typeof window.dashboardHiddenState === 'boolean' ? window.dashboardHiddenState : document.body.classList.contains('dashboard-hidden');
            createItem(session, 'toggleDashboardHidden', 'Hide dashboard', 'dashboard_visibility_toggle', { checked: hidden });
        }
        separator(menu);
        const hint = document.createElement('div');
        hint.className = 'ctx-hint';
        hint.textContent = translate('contextCloseHint', 'Click outside or press Esc to close');
        menu.appendChild(hint);
        menu.addEventListener('keydown', event => onMenuKeydown(event, session));
        menu.addEventListener('focusin', event => {
            if (session.items.includes(event.target)) {
                for (const item of session.items) item.tabIndex = item === event.target ? 0 : -1;
            }
        });
    }

    function onDocumentContextMenu(event) {
        if (!state.root) return;
        if (state.session?.menu.contains(event.target)) { event.preventDefault(); return; }
        // Leave editing/native menus and active dialogs alone.
        if (closest(event.target, 'input, textarea, select, [contenteditable], [inert], .modal, .modal-form, .modal-overlay, [role="dialog"], [role="alertdialog"]')) { closeMenu(); return; }
        const hit = closest(event.target, '.category-item, .category-nav-header, .shortcut-item:not(.add-shortcut)') ||
            closest(document.elementFromPoint?.(event.clientX, event.clientY), '.category-item, .category-nav-header, .shortcut-item:not(.add-shortcut)');
        const category = closest(hit, '.category-item, .category-nav-header');
        const site = closest(hit, '.shortcut-item:not(.add-shortcut)');
        const payload = category ? { type: 'category', id: category.dataset.category || 'all' } :
            site ? { type: 'site', index: Number(site.dataset.index) } : { type: 'blank' };
        const target = category || site;
        const focused = document.activeElement;
        const origin = closest(event.target, 'button, a[href], [tabindex]') ||
            site?.querySelector('.shortcut-launch') || closest(category, 'button, a[href]') ||
            (state.session?.menu.contains(focused) ? state.session.origin : focused);
        event.preventDefault();
        closeMenu();
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.dataset.theme = state.theme;
        menu.setAttribute('role', 'menu');
        const session = { menu, payload, origin, items: [], isValid: snapshotTarget(target, payload), onAction: state.onAction };
        state.session = session;
        buildMenu(session);
        state.root.appendChild(menu);
        const rect = menu.getBoundingClientRect();
        const anchor = origin?.getBoundingClientRect();
        const keyboard = !event.clientX && !event.clientY;
        const x = keyboard ? anchor?.left || 8 : event.clientX;
        const y = keyboard ? (anchor ? anchor.top + anchor.height : 8) : event.clientY;
        menu.style.left = `${Math.max(8, Math.min(x, Math.max(8, window.innerWidth - rect.width - 8)))}px`;
        menu.style.top = `${Math.max(8, Math.min(y, Math.max(8, window.innerHeight - rect.height - 8)))}px`;
        requestAnimationFrame(() => { if (state.session === session) menu.classList.add('open'); });
        focusItem(session, session.items.find(visible));
    }

    function onOutsidePointer(event) {
        if (state.session && !state.session.menu.contains(event.target)) closeMenu();
    }
    function onOutsideFocus() {
        if (state.session && !state.session.menu.contains(document.activeElement)) closeMenu();
    }
    function onWindowChange() { closeMenu(); }

    function init(options = {}) {
        if (state.initialized) destroy();
        state.theme = options.theme || 'dark';
        state.onAction = options.onAction || null;
        state.root = document.createElement('div');
        state.root.className = 'context-menu-root';
        document.body.appendChild(state.root);
        document.addEventListener('contextmenu', onDocumentContextMenu);
        document.addEventListener('pointerdown', onOutsidePointer, { passive: true });
        document.addEventListener('focusin', onOutsideFocus);
        window.addEventListener('resize', onWindowChange);
        window.addEventListener('blur', onWindowChange);
        state.initialized = true;
    }

    function destroy() {
        document.removeEventListener('contextmenu', onDocumentContextMenu);
        document.removeEventListener('pointerdown', onOutsidePointer);
        document.removeEventListener('focusin', onOutsideFocus);
        window.removeEventListener('resize', onWindowChange);
        window.removeEventListener('blur', onWindowChange);
        closeMenu({ restoreFocus: true });
        state.root?.remove();
        state.root = null;
        state.initialized = false;
    }

    window.contextMenu = { init, destroy };
})();
