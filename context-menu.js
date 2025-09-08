// Themed custom context menu for the new tab page
// Usage: contextMenu.init({ theme: 'dark'|'light', onAction: (action, payload)=>{} })

(function() {
	const state = {
		root: null,
		menu: null,
		theme: 'dark',
		onAction: null,
		currentPayload: null
	};

	function ensureRoot() {
		if (!state.root) {
			state.root = document.createElement('div');
			state.root.className = 'context-menu-root';
			document.body.appendChild(state.root);
		}
	}

	function closeMenu() {
		if (state.menu) {
			state.menu.classList.remove('open');
			const m = state.menu;
			state.menu = null;
			setTimeout(() => m.remove(), 100);
		}
		state.currentPayload = null;
	}

	function placeMenu(x, y) {
		if (!state.menu) return;
		const rect = state.menu.getBoundingClientRect();
		const vw = window.innerWidth;
		const vh = window.innerHeight;
		const nx = Math.min(x, vw - rect.width - 8);
		const ny = Math.min(y, vh - rect.height - 8);
		state.menu.style.left = nx + 'px';
		state.menu.style.top = ny + 'px';
		requestAnimationFrame(() => state.menu.classList.add('open'));
	}

	function createItem(labelKey, action, kbd) {
		const el = document.createElement('div');
		el.className = 'ctx-item';
		el.setAttribute('role', 'menuitem');
		el.textContent = i18n.t(labelKey);
		if (kbd) {
			const kb = document.createElement('span');
			kb.className = 'ctx-kbd';
			kb.textContent = kbd;
			el.appendChild(kb);
		}
		el.addEventListener('click', () => {
			if (typeof state.onAction === 'function') {
				state.onAction(action, state.currentPayload);
			}
			closeMenu();
		});
		return el;
	}

	function separator() {
		const sep = document.createElement('div');
		sep.className = 'ctx-sep';
		return sep;
	}

	function hint() {
		const el = document.createElement('div');
		el.className = 'ctx-hint';
		el.textContent = i18n.t('contextCloseHint');
		return el;
	}

	function buildMenuForCategory(payload) {
		const menu = document.createElement('div');
		menu.className = `context-menu ${state.theme}`;
		menu.appendChild(createItem('openAll', 'open_all', '⇧Enter'));
		menu.appendChild(separator());
		menu.appendChild(hint());
		return menu;
	}

	function buildMenuForSite(payload) {
		const menu = document.createElement('div');
		menu.className = `context-menu ${state.theme}`;
		menu.appendChild(createItem('openInNewTab', 'open', 'Enter'));
		menu.appendChild(createItem('edit', 'edit', 'E'));
		menu.appendChild(createItem('remove', 'delete', 'Del'));
		menu.appendChild(separator());
		menu.appendChild(hint());
		return menu;
	}

	function onDocumentContextMenu(e) {
		if (!state.root) return;
		const categoryEl = e.target.closest('.category-item, .category-nav-header');
		const siteEl = e.target.closest('.shortcut-item:not(.add-shortcut)');
		if (!categoryEl && !siteEl) return; // only intercept inside app areas

		e.preventDefault();
		closeMenu();

		const payload = categoryEl
			? { type: 'category', id: categoryEl.dataset.category || 'all' }
			: { type: 'site', index: parseInt(siteEl.dataset.index || '-1', 10) };
		state.currentPayload = payload;

		const menu = payload.type === 'category'
			? buildMenuForCategory(payload)
			: buildMenuForSite(payload);
		state.menu = menu;
		state.root.appendChild(menu);
		placeMenu(e.clientX, e.clientY);
	}

	function onGlobalPointerDown(e) {
		if (state.menu && !state.menu.contains(e.target)) closeMenu();
	}
	function onKeydown(e) {
		if (e.key === 'Escape') closeMenu();
	}

	function init(opts = {}) {
		state.theme = opts.theme || 'dark';
		state.onAction = opts.onAction || null;
		ensureRoot();
		document.addEventListener('contextmenu', onDocumentContextMenu);
		document.addEventListener('pointerdown', onGlobalPointerDown, { passive: true });
		document.addEventListener('keydown', onKeydown);
	}

	function destroy() {
		document.removeEventListener('contextmenu', onDocumentContextMenu);
		document.removeEventListener('pointerdown', onGlobalPointerDown);
		document.removeEventListener('keydown', onKeydown);
		closeMenu();
		if (state.root) { state.root.remove(); state.root = null; }
	}

	window.contextMenu = { init, destroy };
})();

