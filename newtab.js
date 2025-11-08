// New tab page JavaScript - with storage management
let dashboardHiddenState = false;
let currentUiState = null;

document.addEventListener('DOMContentLoaded', async function () {
    console.log('Local iTab new tab page loaded');

    try {
        // Initialize dashboard components with stored data
        const config = await initializeDashboard();

        // Apply i18n to static DOM
        if (window.i18n) {
            window.i18n.localizeDocument(document);
        }

        // Set up settings button
        const settingsButton = document.getElementById('open-options');
        if (settingsButton) {
            settingsButton.addEventListener('click', function () {
                chrome.runtime.openOptionsPage();
            });
        }

        // Category management button in sidebar header
        const manageBtn = document.getElementById('manage-categories');
        if (manageBtn) {
            manageBtn.addEventListener('click', () => {
                if (chrome.runtime?.openOptionsPage) {
                    chrome.runtime.openOptionsPage();
                } else {
                    window.open('options.html#category-settings', '_blank');
                }
            });
        }
        // Initialize custom context menu
        if (window.contextMenu) {
            window.contextMenu.init({
                theme: document.body.classList.contains('has-overlay') ? 'dark' : 'light',
                onAction: handleContextAction
            });
        }

        setupDashboardVisibilityToggle(config?.ui);
        // Performance guards: pause animations when tab hidden; honor reduced motion
        setupPerformanceGuards();
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        // Show error message to user
        showErrorMessage((window.i18n && i18n.t('failedToLoadDashboard')) || 'Failed to load dashboard. Please try refreshing the page.');
    }
});

// Handle custom context menu actions
async function handleContextAction(action, payload) {
    try {
        if (payload?.type === 'category') {
            if (action === 'open_all') {
                await openAllInCategory(payload.id);
            }
            return;
        }

        if (payload?.type === 'blank') {
            const comp = window.shortcutsComponentInstance;
            if (!comp) return;
            if (action === 'layout_auto_arrange_toggle') {
                await comp.setLayout({ autoArrange: !comp.layout?.autoArrange });
            } else if (action === 'layout_align_grid_toggle') {
                await comp.setLayout({ alignToGrid: !comp.layout?.alignToGrid });
            }
            return;
        }

        if (payload?.type === 'site') {
            const comp = window.shortcutsComponentInstance;
            if (!comp) return;
            const idx = payload.index;
            if (idx == null || idx < 0 || idx >= comp.links.length) return;

            switch (action) {
                case 'open':
                    comp.openShortcut(idx);
                    break;
                case 'edit':
                    comp.openEditModal(idx);
                    break;
                case 'delete':
                    comp.confirmDelete(idx);
                    break;
            }
        }
    } catch (e) {
        console.error('Context action error:', e);
    }
}

// Open all links in a category with user confirmation and limited concurrency
async function openAllInCategory(categoryId) {
    const comp = window.shortcutsComponentInstance;
    if (!comp) return;
    let links = comp.links || [];
    if (categoryId && categoryId !== 'all') {
        links = links.filter(l => (l.category || 'work') === categoryId);
    }
    if (!links.length) return;

    const ok = confirm((window.i18n && i18n.t('openAllConfirm')) || 'Open all links in this category? This may open multiple tabs.');
    if (!ok) return;

    // Normalize URLs
    const urls = links.map(l => {
        let url = l.url || '';
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        return url;
    });

    const concurrency = 5;
    const delayMs = 120;
    let active = 0;
    let i = 0;

    return new Promise(resolve => {
        const tick = () => {
            if (i >= urls.length && active === 0) return resolve();
            while (active < concurrency && i < urls.length) {
                const url = urls[i++];
                active++;
                // Use window.open to avoid extra permissions
                setTimeout(() => {
                    try { window.open(url, '_blank'); } catch (_) {}
                    active--;
                    tick();
                }, delayMs);
            }
        };
        tick();
    });
}

async function initializeDashboard() {
    try {
        // Load all configuration data from storage
        const config = await storageManager.getAll();

        // Apply background settings
        await applyBackgroundSettings(config.bg);

        // Apply module visibility settings
        applyModuleVisibility(config.show);

        // Initialize components based on visibility settings
        if (config.show.clock) {
            initializeClockComponent(config.clock);
        }



        if (config.show.shortcuts) {
            initializeShortcutsComponent(config.links, config.layout);
        }

        // Initialize other components (always visible for now)
        initializeQuoteComponent(config.quote);

        console.log('Dashboard initialized successfully');
        return config;
    } catch (error) {
        console.error('Error in initializeDashboard:', error);
        throw error;
    }
}

// Runtime performance guards to reduce CPU/GPU usage
function setupPerformanceGuards() {
    try {
        // Default minimal animations on
        document.body.classList.add('animations-minimal');
        const applyVisibilityState = () => {
            if (document.hidden) {
                document.body.classList.add('paused-animations');
            } else {
                document.body.classList.remove('paused-animations');
            }
        };
        document.addEventListener('visibilitychange', applyVisibilityState);
        window.addEventListener('blur', () => {
            document.body.classList.add('paused-animations');
        });
        window.addEventListener('focus', () => {
            document.body.classList.remove('paused-animations');
        });
        applyVisibilityState();

        // Honor user reduced-motion preference at runtime
        const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
        const applyReducedMotion = () => {
            if (mq && mq.matches) {
                document.body.classList.add('reduced-motion');
            } else {
                document.body.classList.remove('reduced-motion');
            }
        };
        if (mq) {
            if (mq.addEventListener) mq.addEventListener('change', applyReducedMotion);
            else if (mq.addListener) mq.addListener(applyReducedMotion);
            applyReducedMotion();
        }
    } catch (_) {}
}

async function applyBackgroundSettings(bgConfig) {
    const body = document.body;

    // Clear existing background classes
    body.classList.remove('bg-gradient', 'bg-color', 'bg-image', 'bg-api');
    body.style.backgroundColor = '';
    body.style.backgroundImage = '';
    body.style.backgroundSize = '';
    body.style.backgroundPosition = '';
    body.style.backgroundRepeat = '';
    body.style.backgroundAttachment = '';

    switch (bgConfig.type) {
        case 'gradient':
            body.classList.add('bg-gradient');
            break;
        case 'color':
            body.classList.add('bg-color');
            body.style.backgroundColor = bgConfig.value || '#1a1a1a';
            break;
        case 'image':
            if (bgConfig.value) {
                body.classList.add('bg-image');
                body.style.backgroundImage = `url(${bgConfig.value})`;
                body.style.backgroundSize = 'cover';
                body.style.backgroundPosition = 'center';
                body.style.backgroundRepeat = 'no-repeat';
                body.style.backgroundAttachment = 'fixed';
            } else {
                body.classList.add('bg-gradient');
            }
            break;
        case 'api':
            body.classList.add('bg-api');
            await loadApiBackground();
            break;
        default:
            body.classList.add('bg-gradient');
    }

    // adjust text color and overlay based on background type
    updateTextContrast(bgConfig);
}

/**
 * Load random wallpaper from API
 */
async function loadApiBackground() {
    try {
        const apiUrl = 'https://api.paugram.com/wallpaper/';
        const response = await fetch(apiUrl, { redirect: 'follow', cache: 'no-cache' });

        if (response.ok) {
            const imageUrl = response.url; // The API redirects to the actual image
            document.body.style.backgroundImage = `url(${imageUrl})`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundRepeat = 'no-repeat';
            document.body.style.backgroundAttachment = 'fixed';
        } else {
            console.warn('Failed to load API background, using gradient fallback');
            document.body.classList.remove('bg-api');
            document.body.classList.add('bg-gradient');
        }
    } catch (error) {
        console.error('Error loading API background:', error);
        // Fallback to gradient
        document.body.classList.remove('bg-api');
        document.body.classList.add('bg-gradient');
    }
}

// Update text color and overlay based on background settings
function updateTextContrast(bgConfig) {
    const root = document.documentElement;
    const body = document.body;

    body.classList.remove('has-overlay');

    if (bgConfig.type === 'color') {
        const hex = bgConfig.value || '#1a1a1a';
        const { r, g, b } = hexToRgb(hex);
        const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
        const isLight = brightness > 186;
        const primary = isLight ? '#000000' : '#ffffff';
        const secondary = isLight ? 'rgba(0, 0, 0, 0.85)' : 'rgba(248, 249, 250, 0.85)';
        const muted = isLight ? 'rgba(0, 0, 0, 0.65)' : 'rgba(248, 249, 250, 0.65)';

        root.style.setProperty('--text-primary', primary);
        root.style.setProperty('--text-secondary', secondary);
        root.style.setProperty('--text-muted', muted);
    } else {
        body.classList.add('has-overlay');
        root.style.setProperty('--text-primary', '#f8f9fa');
        root.style.setProperty('--text-secondary', 'rgba(248, 249, 250, 0.85)');
        root.style.setProperty('--text-muted', 'rgba(248, 249, 250, 0.65)');
    }
}

// helper to convert hex color to rgb components
function hexToRgb(hex) {
    let sanitized = hex.replace('#', '');
    if (sanitized.length === 3) {
        sanitized = sanitized.split('').map(ch => ch + ch).join('');
    }
    const intVal = parseInt(sanitized, 16);
    return {
        r: (intVal >> 16) & 255,
        g: (intVal >> 8) & 255,
        b: intVal & 255
    };
}

function applyModuleVisibility(showConfig) {
    // Get module containers
    const clockContainer = document.getElementById('clock-container');
    const shortcutsContainer = document.getElementById('shortcuts-container');

    // Apply visibility settings with CSS classes
    if (clockContainer) {
        if (showConfig.clock) {
            clockContainer.classList.remove('module-hidden');
            clockContainer.style.display = '';
        } else {
            clockContainer.classList.add('module-hidden');
        }
    }

    if (shortcutsContainer) {
        if (showConfig.shortcuts) {
            shortcutsContainer.classList.remove('module-hidden');
            shortcutsContainer.style.display = '';
        } else {
            shortcutsContainer.classList.add('module-hidden');
        }
    }
}

function initializeClockComponent(clockConfig) {
    const clockContainer = document.getElementById('clock-container');
    if (!clockContainer) return;

    // Create clock HTML structure
    clockContainer.innerHTML = `
        <div class="clock-display">
            <div class="time-display" id="time-display"></div>
            <div class="date-display" id="date-display"></div>
        </div>
    `;

    // Initialize clock with configuration
    const clockComponent = new ClockComponent(clockConfig);
    clockComponent.start();
}

/**
 * Clock Component Class
 * Handles time display, formatting, and real-time updates
 */
class ClockComponent {
    constructor(config) {
        this.config = config;
        this.intervalId = null;
        this.timeElement = document.getElementById('time-display');
        this.dateElement = document.getElementById('date-display');
        this._visBound = false;
        this._onVisChange = null;
    }

    /**
     * Start the clock with real-time updates
     */
    start() {
        this.resume();
        if (!this._visBound) {
            this._onVisChange = () => {
                if (document.hidden) {
                    this.stop();
                } else {
                    this.resume();
                }
            };
            document.addEventListener('visibilitychange', this._onVisChange);
            window.addEventListener('blur', this._onVisChange);
            window.addEventListener('focus', this._onVisChange);
            this._visBound = true;
        }
    }

    /**
     * Stop the clock updates
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    /**
     * Resume periodic updates if not already running
     */
    resume() {
        if (this.intervalId) return;
        // Update immediately
        this.updateDisplay();
        // Set up interval for updates
        this.intervalId = setInterval(() => {
            this.updateDisplay();
        }, 1000);
    }

    /**
     * Update the time and date display
     */
    updateDisplay() {
        const now = new Date();

        if (this.timeElement) {
            this.timeElement.textContent = this.formatTime(now);
        }

        if (this.dateElement) {
            this.dateElement.textContent = this.formatDate(now);
        }
    }

    /**
     * Format time according to configuration
     * @param {Date} date - Date object to format
     * @returns {string} - Formatted time string
     */
    formatTime(date) {
        const options = {
            hour: '2-digit',
            minute: '2-digit',
            hour12: this.config.hour12
        };

        if (this.config.showSeconds) {
            options.second = '2-digit';
        }

        return date.toLocaleTimeString('en-US', options);
    }

    /**
     * Format date with day of year and week number
     * @param {Date} date - Date object to format
     * @returns {string} - Formatted date string
     */
    formatDate(date) {
        const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
        const month = date.toLocaleDateString('en-US', { month: 'long' });
        const day = date.getDate();
        const year = date.getFullYear();

        const dayOfYear = this.getDayOfYear(date);
        const weekNumber = this.getWeekNumber(date);

        return `${dayOfWeek}, ${month} ${day}, ${year} • Day ${dayOfYear} • Week ${weekNumber}`;
    }

    /**
     * Calculate day of year (1-366)
     * @param {Date} date - Date object
     * @returns {number} - Day of year
     */
    getDayOfYear(date) {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }

    /**
     * Calculate ISO week number (1-53)
     * @param {Date} date - Date object
     * @returns {number} - Week number
     */
    getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    /**
     * Update configuration and refresh display
     * @param {Object} newConfig - New clock configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.updateDisplay();
    }
}



function initializeShortcutsComponent(linksConfig, layoutConfig) {
    const shortcutsContainer = document.getElementById('shortcuts-container');
    if (!shortcutsContainer) return;

    // Create shortcuts component
    const shortcutsComponent = new ShortcutsComponent(linksConfig, layoutConfig);
    shortcutsComponent.render();

    // Install a single capture listener to set default icon on error (CSP-safe)
    const grid = document.getElementById('shortcuts-grid');
    if (grid && !grid._iconErrorHandlerInstalled) {
        grid.addEventListener('error', function(e) {
            const target = e.target;
            if (target && target.classList && target.classList.contains('shortcut-icon-img')) {
                if (!target.dataset.fallbackApplied) {
                    target.dataset.fallbackApplied = '1';
                    target.src = 'assets/icon48.png';
                }
            }
        }, true);
        grid._iconErrorHandlerInstalled = true;
    }
}

function initializeQuoteComponent(quote) {
    const quoteContainer = document.getElementById('quote-container');
    if (quoteContainer) {
        quoteContainer.innerHTML = `<div>${quote}</div>`;
        quoteContainer.style.display = 'block';
    }
}


function setupDashboardVisibilityToggle(uiConfig) {
    const defaults = (window.storageManager && storageManager.defaultConfig && storageManager.defaultConfig.ui)
        ? storageManager.defaultConfig.ui
        : { dashboardHidden: false };

    currentUiState = { ...defaults, ...(uiConfig || {}) };
    dashboardHiddenState = !!currentUiState.dashboardHidden;
    applyDashboardHiddenState(dashboardHiddenState);

    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return;

    dashboard.addEventListener('dblclick', (event) => {
        if (!shouldToggleFromEvent(event)) {
            return;
        }

        if (window.getSelection && window.getSelection().toString()) {
            return;
        }

        event.preventDefault();
        const nextState = !dashboardHiddenState;
        setDashboardHidden(nextState);
    });
}

function shouldToggleFromEvent(event) {
    const interactiveSelectors = 'button, a, input, textarea, select, [contenteditable], .shortcut-item, .category-nav, .settings-button, .category-manage-btn, .shortcut-action-btn, .context-menu';
    if (!event || !event.target) return false;
    return !event.target.closest(interactiveSelectors);
}

function applyDashboardHiddenState(hidden) {
    document.body.classList.toggle('dashboard-hidden', !!hidden);
}

function setDashboardHidden(hidden) {
    dashboardHiddenState = !!hidden;
    applyDashboardHiddenState(dashboardHiddenState);

    if (!currentUiState) {
        const defaults = (window.storageManager && storageManager.defaultConfig && storageManager.defaultConfig.ui)
            ? storageManager.defaultConfig.ui
            : { dashboardHidden: false };
        currentUiState = { ...defaults };
    }

    currentUiState.dashboardHidden = dashboardHiddenState;

    if (window.storageManager && typeof storageManager.set === 'function') {
        storageManager.set('ui', currentUiState).catch((error) => {
            console.error('Failed to persist dashboard hidden state:', error);
        });
    }
}



/**
 * Shortcuts Component Class
 * Handles shortcuts grid display and CRUD operations
 */
class ShortcutsComponent {
    constructor(links, layout) {
        this.links = links || [];
        this.container = document.getElementById('shortcuts-container');
        this.currentEditIndex = -1;
        this.modal = null;
        this.confirmDialog = null;
        this._escListener = null;
        const defaultColumns = storageManager?.defaultConfig?.layout?.columns ?? 6;
        const defaultLayout = { autoArrange: true, alignToGrid: true, gridSize: 96, columns: defaultColumns, positions: {} };
        this.layout = { ...defaultLayout, ...(layout || {}) };
        this.defaultColumns = defaultLayout.columns;
        const sanitizedColumns = this.sanitizeColumns(this.layout.columns);
        this.layout.columns = sanitizedColumns ?? this.defaultColumns;
        this.positions = (this.layout && typeof this.layout.positions === 'object') ? this.layout.positions : {};
        if (!this.layout.positions || typeof this.layout.positions !== 'object') {
            this.layout.positions = this.positions;
        }
        this.gridEl = null;
        this.dragState = null;
        this._suppressClickUntil = 0;
        this._dragMoved = false;
        this._dragStartPos = null;
        this._isSaving = false;
    }

    /**
     * Render the shortcuts component
     */
    render() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="shortcuts-grid" id="shortcuts-grid">
                ${this.renderShortcuts()}
            </div>
        `;

        this.attachEventListeners();
        this.createModal();

        this.gridEl = document.getElementById('shortcuts-grid');
        this.applyLayoutMode();

        // 供分类导航使用
        window.shortcutsComponentInstance = this;
        // 渲染后根据当前分类过滤一次
        if (window.categoryNavigation) {
            window.categoryNavigation.filterShortcuts();
        }
    }

    /**
     * Render shortcuts grid
     */
    renderShortcuts() {
        const items = this.links.map((link, index) => `
            <div class="shortcut-item" data-index="${index}" draggable="true">
                <div class="shortcut-content">
                    <div class="shortcut-icon">${this.renderIcon(link.icon || '🌐', link.url)}</div>
                    <h3 class="shortcut-title">${this.escapeHtml(link.title)}</h3>
                </div>
                <div class="shortcut-actions">
                    <button class="shortcut-action-btn edit" data-action="edit" data-index="${index}" title="${(window.i18n && i18n.t('edit')) || 'Edit'}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                    </button>
                    <button class="shortcut-action-btn delete" data-action="delete" data-index="${index}" title="${(window.i18n && i18n.t('remove')) || 'Delete'}">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `).join('');

        const addTile = `
            <div class="shortcut-item add-shortcut" data-action="open-add" draggable="false">
                <div class="shortcut-content">
                    <div class="shortcut-icon">+</div>
                    <h3 class="shortcut-title">${(window.i18n && i18n.t('addShortcut')) || 'Add Shortcut'}</h3>
                </div>
            </div>
        `;

        return items + addTile;
    }

    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Add shortcut button
        const addBtn = document.getElementById('add-shortcut-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.openAddModal());
        }

        // Shortcut grid events
        const grid = document.getElementById('shortcuts-grid');
        if (grid) {
            grid.addEventListener('click', (e) => this.handleGridClick(e));
            grid.addEventListener('dragstart', (e) => this.handleDragStart(e));
            grid.addEventListener('dragover', (e) => this.handleDragOver(e));
            grid.addEventListener('dragenter', (e) => this.handleDragEnter(e));
            grid.addEventListener('dragleave', (e) => this.handleDragLeave(e));
            grid.addEventListener('drop', (e) => this.handleDrop(e));
            grid.addEventListener('dragend', (e) => this.handleDragEnd(e));
        }
    }

    /**
     * Handle grid click events
     */
    handleGridClick(e) {
        if (this._suppressClickUntil && Date.now() < this._suppressClickUntil) {
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        // 统一从最近的按钮或卡片元素读取 data 属性，确保点击 SVG 子元素也能命中
        const actionBtn = e.target.closest('.shortcut-action-btn');
        const action = actionBtn?.dataset?.action || e.target.dataset.action;
        const indexStr = actionBtn?.dataset?.index || e.target.dataset.index;
        const index = indexStr !== undefined ? parseInt(indexStr) : NaN;

        if (action === 'open-add' || e.target.closest('.add-shortcut')) {
            e.stopPropagation();
            this.openAddModal();
            return;
        }

        if (action === 'edit') {
            e.stopPropagation();
            this.openEditModal(index);
        } else if (action === 'delete') {
            e.stopPropagation();
            this.confirmDelete(index);
        } else if (e.target.closest('.shortcut-item') && !e.target.closest('.shortcut-actions')) {
            // Open shortcut URL
            const shortcutItem = e.target.closest('.shortcut-item');
            const shortcutIndex = parseInt(shortcutItem.dataset.index);
            if (!shortcutItem.classList.contains('add-shortcut')) {
                this.openShortcut(shortcutIndex);
            }
        }
    }

    /**
     * Open shortcut URL
     */
    openShortcut(index) {
        if (index >= 0 && index < this.links.length) {
            const link = this.links[index];
            let url = link.url;

            // Add protocol if missing
            if (!url.match(/^https?:\/\//)) {
                url = 'https://' + url;
            }

            window.open(url, '_blank');
        }
    }

    /**
     * Open add shortcut modal
     */
    openAddModal() {
        this.currentEditIndex = -1;
        this.showModal(((window.i18n && i18n.t('addShortcut')) || 'Add Shortcut'), '', '');
    }

    /**
     * Open edit shortcut modal
     */
    openEditModal(index) {
        if (index >= 0 && index < this.links.length) {
            this.currentEditIndex = index;
            const link = this.links[index];
            this.showModal(((window.i18n && i18n.t('editShortcut')) || 'Edit Shortcut'), link.title, link.url, link.icon || '🌐');

            // 设置分类选择器
            const categorySelect = this.modal.querySelector('#shortcut-category');
            if (categorySelect) {
                categorySelect.value = link.category || 'work';
            }
        }
    }

    /**
     * Show modal dialog
     */
    showModal(title, currentTitle = '', currentUrl = '', currentIcon = '🌐') {
        if (!this.modal) return;

        const modalTitle = this.modal.querySelector('.modal-title');
        const titleInput = this.modal.querySelector('#shortcut-title');
        const urlInput = this.modal.querySelector('#shortcut-url');
        const iconInput = this.modal.querySelector('#shortcut-icon');
        this.updateCategoryOptions();
        const categorySelect = this.modal.querySelector('#shortcut-category');

        this.setSavingState(false);

        modalTitle.textContent = title;
        titleInput.value = currentTitle;
        urlInput.value = currentUrl;
        iconInput.value = currentIcon;

        // 新增默认分类：若已存在分类导航，使用当前选中分类；否则默认 work
        if (categorySelect) {
            const defaultCat = window.categoryNavigation?.getCurrentCategory?.() || 'work';
            categorySelect.value = this.currentEditIndex >= 0
                ? (this.links[this.currentEditIndex]?.category || 'work')
                : (defaultCat === 'all' ? 'work' : defaultCat);
        }

        // Clear previous errors
        this.clearFormErrors();

        // Show modal
        this.modal.classList.add('active');
        titleInput.focus();
    }

    /**
     * Hide modal dialog
     */
    hideModal() {
        if (this.modal) {
            this.modal.classList.remove('active');
            this.currentEditIndex = -1;
            this.setSavingState(false);
        }
    }

    /**
     * Create modal HTML
     */
    createModal() {
        // Remove existing modal
        const existingModal = document.getElementById('shortcut-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHtml = `
            <div class="modal-overlay" id="shortcut-modal">
                <div class="modal">
                    <div class="modal-header">
                        <h3 class="modal-title">${(window.i18n && i18n.t('addShortcut')) || 'Add Shortcut'}</h3>
                        <button class="modal-close" id="modal-close">×</button>
                    </div>
                    <form class="modal-form" id="shortcut-form">
                        <div class="form-group">
                            <label class="form-label" for="shortcut-title">${(window.i18n && i18n.t('title')) || 'Title'}</label>
                            <input type="text" class="form-input" id="shortcut-title" placeholder="${(window.i18n && i18n.t('title')) || 'Title'}" required>
                            <div class="form-error" id="title-error"></div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="shortcut-url">${(window.i18n && i18n.t('url')) || 'URL'}</label>
                            <input type="url" class="form-input" id="shortcut-url" placeholder="https://example.com" required>
                            <div class="form-error" id="url-error"></div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="shortcut-category">${(window.i18n && i18n.t('categoryLabel')) || 'Category'}</label>
                            <select class="form-input" id="shortcut-category"></select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="shortcut-icon">${(window.i18n && i18n.t('icon')) || 'Icon'}</label>
                            <div class="icon-input-group">
                                <input type="text" class="form-input" id="shortcut-icon" placeholder="🌐 or emoji/text" >
                                <button type="button" class="icon-fetch-btn" id="fetch-icon-btn" title="${(window.i18n && i18n.t('autoFetchIcon')) || 'Auto-fetch website icon'}">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M21 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1z"/>
                                        <path d="M16 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1z"/>
                                        <path d="M11 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1z"/>
                                        <path d="M6 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1z"/>
                                    </svg>
                                </button>
                                <button type="button" class="icon-fetch-btn" id="refresh-icon-btn" title="${(window.i18n && i18n.t('refreshIcon')) || 'Refresh icon from site'}" style="margin-left: 6px;">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M23 4v6h-6"/>
                                        <path d="M20.49 15A9 9 0 1 1 21 12"/>
                                    </svg>
                                </button>
                            </div>
                            <div class="form-hint">Enter an emoji, text, or click the button to auto-fetch the website's icon</div>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="modal-btn secondary" id="cancel-btn">${(window.i18n && i18n.t('cancel')) || 'Cancel'}</button>
                            <button type="submit" class="modal-btn primary" id="save-btn">${(window.i18n && i18n.t('save')) || 'Save'}</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.modal = document.getElementById('shortcut-modal');

        this.updateCategoryOptions();

        // Attach modal event listeners
        this.attachModalEventListeners();
    }

    /**
     * Attach modal event listeners
     */
    attachModalEventListeners() {
        if (!this.modal) return;

        // Close button
        const closeBtn = this.modal.querySelector('#modal-close');
        closeBtn.addEventListener('click', () => this.hideModal());

        // Cancel button
        const cancelBtn = this.modal.querySelector('#cancel-btn');
        cancelBtn.addEventListener('click', () => this.hideModal());

        // Icon fetch button
        const fetchIconBtn = this.modal.querySelector('#fetch-icon-btn');
        fetchIconBtn.addEventListener('click', () => this.fetchWebsiteIcon());

        // Refresh icon button: clear site+URL cache and force next load to fetch again
        const refreshIconBtn = this.modal.querySelector('#refresh-icon-btn');
        if (refreshIconBtn) {
            refreshIconBtn.addEventListener('click', async () => {
                try {
                    const urlInput = this.modal.querySelector('#shortcut-url');
                    const iconInput = this.modal.querySelector('#shortcut-icon');
                    const rawUrl = (urlInput?.value || '').trim();
                    if (!rawUrl) return;
                    if (window.faviconCache) {
                        const origin = window.faviconCache.getOriginFromUrl(rawUrl);
                        if (origin) await window.faviconCache.invalidate(origin);
                        const iconVal = (iconInput?.value || '').trim();
                        if (iconVal && (iconVal.startsWith('http://') || iconVal.startsWith('https://'))) {
                            await window.faviconCache.invalidateByUrl(iconVal);
                        }
                    }
                    // Also clear current icon field so user can重新获取
                    iconInput.value = '';
                    showErrorMessage('Icon cache cleared. Click auto-fetch to get a new one.');
                } catch (e) {}
            });
        }

        // Form submission
        const form = this.modal.querySelector('#shortcut-form');
        form.addEventListener('submit', (e) => this.handleFormSubmit(e));

        // Click outside to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hideModal();
            }
        });

        // Escape key to close (avoid duplicate listeners)
        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
        }
        this._escListener = (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.hideModal();
            }
        };
        document.addEventListener('keydown', this._escListener);
    }

    updateCategoryOptions() {
        const categorySelect = this.modal?.querySelector('#shortcut-category');
        if (!categorySelect) return;
        const categories = window.categoryNavigation?.getCategoriesForSelect?.() || [];
        categorySelect.innerHTML = categories.map(cat => `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`).join('');
    }

    /**
     * Handle form submission
     */
    async handleFormSubmit(e) {
        e.preventDefault();

        if (this._isSaving) return;

        const titleInput = this.modal.querySelector('#shortcut-title');
        const urlInput = this.modal.querySelector('#shortcut-url');
        const iconInput = this.modal.querySelector('#shortcut-icon');
        const categorySelect = this.modal.querySelector('#shortcut-category');

        const title = titleInput.value.trim();
        const url = urlInput.value.trim();
        const icon = iconInput.value.trim() || '🌐';
        const category = (categorySelect?.value || 'work').trim();

        // Validate form
        if (!this.validateForm(title, url)) {
            return;
        }

        this.setSavingState(true);

        // Save shortcut WITHOUT overwriting user's original icon field
        const shortcut = { title, url, icon, category };

        if (this.currentEditIndex >= 0) {
            // Edit existing shortcut
            this.links[this.currentEditIndex] = shortcut;
        } else {
            // Add new shortcut
            this.links.push(shortcut);
        }

        // Prefetch favicon to ensure cache is warmed for future loads (does not change stored icon)
        try {
            if (window.faviconCache) {
                const origin = window.faviconCache.getOriginFromUrl(url);
                if (origin) await window.faviconCache.prefetch(origin);
            }
        } catch (_) {}

        // Save to storage
        try {
            await storageManager.set('links', this.links);
            this.hideModal();
            this.updateGrid();
            if (window.categoryNavigation) {
                window.categoryNavigation.filterShortcuts();
            }
        } catch (error) {
            console.error('Error saving shortcut:', error);
            this.showFormError('url', ((window.i18n && i18n.t('failedToSave')) || 'Failed to save shortcut. Please try again.'));
        } finally {
            this.setSavingState(false);
        }
    }

    setSavingState(isSaving) {
        this._isSaving = !!isSaving;
        const saveBtn = this.modal?.querySelector('#save-btn');
        if (saveBtn) {
            saveBtn.disabled = this._isSaving;
            saveBtn.classList.toggle('is-disabled', this._isSaving);
        }
    }

    /**
     * Validate form inputs
     */
    validateForm(title, url) {
        let isValid = true;

        // Clear previous errors
        this.clearFormErrors();

        // Validate title
        if (!title) {
            this.showFormError('title', ((window.i18n && i18n.t('titleRequired')) || 'Title is required'));
            isValid = false;
        } else if (title.length > 50) {
            this.showFormError('title', ((window.i18n && i18n.t('titleTooLong')) || 'Title must be 50 characters or less'));
            isValid = false;
        }

        // Validate URL
        if (!url) {
            this.showFormError('url', ((window.i18n && i18n.t('urlRequired')) || 'URL is required'));
            isValid = false;
        } else if (!this.isValidUrl(url)) {
            this.showFormError('url', ((window.i18n && i18n.t('urlInvalid')) || 'Please enter a valid URL'));
            isValid = false;
        }

        return isValid;
    }

    /**
     * Validate URL format
     */
    isValidUrl(url) {
        try {
            // Add protocol if missing
            if (!url.match(/^https?:\/\//)) {
                url = 'https://' + url;
            }
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Show form error
     */
    showFormError(field, message) {
        const errorElement = this.modal.querySelector(`#${field}-error`);
        if (errorElement) {
            errorElement.textContent = message;
        }
    }

    /**
     * Clear form errors
     */
    clearFormErrors() {
        const errorElements = this.modal.querySelectorAll('.form-error');
        errorElements.forEach(element => {
            element.textContent = '';
        });
    }

    // (Removed) automatic replacement of stored icon URLs to data URLs to preserve original icon values

    /**
     * Confirm delete shortcut
     */
    confirmDelete(index) {
        if (index < 0 || index >= this.links.length) return;

        const link = this.links[index];
        this.showConfirmDialog(
            ((window.i18n && i18n.t('deleteShortcut')) || 'Delete Shortcut'),
            ((window.i18n && i18n.t('deleteShortcutConfirm')) || 'Are you sure you want to delete this shortcut?'),
            link,
            () => this.deleteShortcut(index)
        );
    }

    /**
     * Delete shortcut
     */
    async deleteShortcut(index) {
        if (index >= 0 && index < this.links.length) {
            this.links.splice(index, 1);

            try {
                await storageManager.set('links', this.links);
                this.updateGrid();
            } catch (error) {
                console.error('Error deleting shortcut:', error);
                showErrorMessage(((window.i18n && i18n.t('failedToDelete')) || 'Failed to delete shortcut. Please try again.'));
            }
        }
    }

    /**
     * Show confirmation dialog
     */
    showConfirmDialog(title, message, shortcut, onConfirm) {
        // Remove existing dialog
        const existingDialog = document.getElementById('confirm-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        const dialogHtml = `
            <div class="modal-overlay" id="confirm-dialog">
                <div class="modal confirm-dialog">
                    <div class="modal-header">
                        <h3 class="modal-title">${title}</h3>
                        <button class="modal-close" id="confirm-close">×</button>
                    </div>
                    <div class="confirm-message">${message}</div>
                    <div class="confirm-shortcut-info">
                        <div class="confirm-shortcut-title">${this.escapeHtml(shortcut.title)}</div>
                        <div class="confirm-shortcut-url">${this.escapeHtml(shortcut.url)}</div>
                    </div>
                    <div class="modal-actions">
                        <button class="modal-btn secondary" id="confirm-cancel">Cancel</button>
                        <button class="modal-btn primary" id="confirm-delete" style="background: #e74c3c; border-color: #e74c3c;">Delete</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', dialogHtml);
        this.confirmDialog = document.getElementById('confirm-dialog');

        // Show dialog
        this.confirmDialog.classList.add('active');

        // Attach event listeners
        const closeBtn = this.confirmDialog.querySelector('#confirm-close');
        const cancelBtn = this.confirmDialog.querySelector('#confirm-cancel');
        const deleteBtn = this.confirmDialog.querySelector('#confirm-delete');

        const hideDialog = () => {
            this.confirmDialog.classList.remove('active');
            setTimeout(() => {
                if (this.confirmDialog) {
                    this.confirmDialog.remove();
                    this.confirmDialog = null;
                }
            }, 300);
        };

        closeBtn.addEventListener('click', hideDialog);
        cancelBtn.addEventListener('click', hideDialog);
        deleteBtn.addEventListener('click', () => {
            onConfirm();
            hideDialog();
        });

        // Click outside to close
        this.confirmDialog.addEventListener('click', (e) => {
            if (e.target === this.confirmDialog) {
                hideDialog();
            }
        });
    }

    /**
     * Update shortcuts grid
     */
    updateGrid() {
        const grid = document.getElementById('shortcuts-grid');
        if (grid) {
            grid.innerHTML = this.renderShortcuts();
            this.gridEl = grid;
            this.applyLayoutMode();
        }
    }

    applyLayoutMode() {
        const grid = this.gridEl;
        if (!grid) return;
        this.applyAutoColumns();
        if (this.layout?.autoArrange) {
            grid.classList.remove('free-layout');
            // reset inline positions if any
            grid.querySelectorAll('.shortcut-item').forEach(el => {
                el.style.position = '';
                el.style.transform = '';
                el.style.left = '';
                el.style.top = '';
            });
            this.detachFreeDrag();
        } else {
            grid.classList.add('free-layout');
            // If we already have positions, just apply to visible; otherwise capture current visible positions as baseline
            if (this.positions && Object.keys(this.positions).length > 0) {
                this.applyVisibleTransformsFromPositions();
            } else {
                this.captureVisiblePositionsWithoutMove(true);
            }
            this.positionAddTile();
            this.attachFreeDrag();
        }
    }

    sanitizeColumns(value) {
        const num = Number(value);
        if (!Number.isFinite(num)) return null;
        const rounded = Math.round(num);
        if (rounded < 1) return 1;
        if (rounded > 10) return 10;
        return rounded;
    }

    getColumnsSetting() {
        const sanitized = this.sanitizeColumns(this.layout?.columns);
        if (sanitized == null) {
            return null;
        }
        return sanitized;
    }

    applyAutoColumns() {
        if (!this.gridEl) return;
        if (!this.layout?.autoArrange) {
            this.gridEl.classList.remove('columns-fixed');
            this.gridEl.style.removeProperty('--shortcuts-columns');
            return;
        }
        const columns = this.getColumnsSetting();
        if (columns) {
            this.gridEl.classList.add('columns-fixed');
            this.gridEl.style.setProperty('--shortcuts-columns', columns);
        } else {
            this.gridEl.classList.remove('columns-fixed');
            this.gridEl.style.removeProperty('--shortcuts-columns');
        }
    }

    // Ensure items have initial positions in grid layout (non-overlapping)
    layoutGridizeMissing() {
        const grid = this.gridEl;
        if (!grid) return;
        const gs = Math.max(48, Math.min(240, this.layout.gridSize || 96));
        const rect = grid.getBoundingClientRect();
        const maxCols = Math.max(1, Math.floor(rect.width / gs));
        const occupied = new Set();

        const currentCategory = this.getCurrentCategory();
        const items = Array.from(grid.querySelectorAll('.shortcut-item'));
        items.forEach((el, idx) => {
            const link = this.links[idx];
            if (!el || el.classList.contains('add-shortcut')) return;
            if (el.style.display === 'none') return; // skip hidden in current category
            const key = this.getPositionKey(link, currentCategory);
            let pos = this.positions[key];
            if (!pos) {
                // find next free cell
                let r = 0, c = 0;
                while (occupied.has(`${c}:${r}`)) {
                    c++;
                    if (c >= maxCols) { c = 0; r++; }
                }
                pos = { x: c * gs, y: r * gs };
                occupied.add(`${c}:${r}`);
                this.positions[key] = pos;
            }
            el.style.position = 'absolute';
            el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
        });
        this.saveLayoutDebounced();
    }

    getPositionKey(link, category) {
        const urlKey = (link && link.url) || `idx_${this.links.indexOf(link)}`;
        const cat = category || this.getCurrentCategory();
        return `${cat || 'all'}|${urlKey}`;
    }

    getCurrentCategory() {
        try {
            return window.categoryNavigation?.getCurrentCategory?.() || 'all';
        } catch (_) {
            return 'all';
        }
    }

    attachFreeDrag() {
        if (!this.gridEl || this._freeDragAttached) return;
        this._onPointerDown = (e) => this.onPointerDown(e);
        this.gridEl.addEventListener('pointerdown', this._onPointerDown);
        // Prevent native drag of images inside shortcuts to allow dragging by icon
        this.gridEl.addEventListener('dragstart', function(e) {
            const img = e.target.closest('.shortcut-icon-img');
            if (img) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
        this._freeDragAttached = true;
    }

    detachFreeDrag() {
        if (this.gridEl && this._freeDragAttached) {
            this.gridEl.removeEventListener('pointerdown', this._onPointerDown);
            this._freeDragAttached = false;
        }
    }

    onPointerDown(e) {
        const item = e.target.closest('.shortcut-item');
        if (!item || item.classList.contains('add-shortcut')) return;
        if (!this.gridEl.contains(item)) return;
        e.preventDefault();
        e.stopPropagation();

        const idx = parseInt(item.dataset.index, 10);
        const link = this.links[idx];
        const key = this.getPositionKey(link);
        const gs = Math.max(48, Math.min(240, this.layout.gridSize || 96));
        const gridRect = this.gridEl.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const origLeft = itemRect.left - gridRect.left;
        const origTop = itemRect.top - gridRect.top;
        const offsetX = startX - itemRect.left;
        const offsetY = startY - itemRect.top;

        item.classList.add('drag-free');
        this._dragStartPos = { x: startX, y: startY };
        this._dragMoved = false;

        // capture pointer to receive move events even if pointer leaves element
        try { item.setPointerCapture?.(e.pointerId); } catch (_) {}

        const onMove = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const x = ev.clientX - gridRect.left - offsetX;
            const y = ev.clientY - gridRect.top - offsetY;
            const clamped = this.clampToBounds(x, y, itemRect.width, itemRect.height, gridRect.width, gridRect.height);
            item.style.left = `${clamped.x}px`;
            item.style.top = `${clamped.y}px`;
            item.style.transform = 'none';
            if (!this._dragMoved && this._dragStartPos) {
                const dx = Math.abs(ev.clientX - this._dragStartPos.x);
                const dy = Math.abs(ev.clientY - this._dragStartPos.y);
                if (dx > 3 || dy > 3) this._dragMoved = true;
            }
        };
        const onUp = (ev) => {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            ev.preventDefault();
            ev.stopPropagation();
            // read back via inline left/top
            const curX = isFinite(parseFloat(item.style.left)) ? parseFloat(item.style.left) : origLeft;
            const curY = isFinite(parseFloat(item.style.top)) ? parseFloat(item.style.top) : origTop;
            const finalLeft = isFinite(curX) ? curX : origLeft;
            const finalTop = isFinite(curY) ? curY : origTop;

            let target = { x: finalLeft, y: finalTop };
            if (this.layout.alignToGrid) {
                target = this.snapToGrid(target.x, target.y, gs);
                const resolved = this.avoidOverlap(target.x, target.y, gs, gridRect.width);
                target = resolved;
            }
            item.style.left = `${target.x}px`;
            item.style.top = `${target.y}px`;
            item.style.transform = 'none';
            item.classList.remove('drag-free');

            this.positions[key] = { x: target.x, y: target.y };
            this.saveLayoutDebounced();

            if (this._dragMoved) {
                this._suppressClickUntil = Date.now() + 500;
            }
            this._dragMoved = false;
            this._dragStartPos = null;
        };
        document.addEventListener('pointermove', onMove, { passive: false });
        document.addEventListener('pointerup', onUp, { once: true });
    }

    clampToBounds(x, y, w, h, W, H) {
        const nx = Math.max(0, Math.min(x, Math.max(0, W - w)));
        const ny = Math.max(0, Math.min(y, Math.max(0, H - h)));
        return { x: nx, y: ny };
    }

    snapToGrid(x, y, gs) {
        const cx = Math.round(x / gs) * gs;
        const cy = Math.round(y / gs) * gs;
        return { x: Math.max(0, cx), y: Math.max(0, cy) };
    }

    avoidOverlap(x, y, gs, gridWidth) {
        // Build occupancy from current positions
        const occupied = new Set();
        const currentCategory = this.getCurrentCategory();
        const visibleKeys = new Set();
        const grid = this.gridEl;
        if (grid) {
            Array.from(grid.querySelectorAll('.shortcut-item')).forEach((el, idx) => {
                if (!el || el.classList.contains('add-shortcut')) return;
                if (el.style.display === 'none') return;
                const link = this.links[idx];
                visibleKeys.add(this.getPositionKey(link, currentCategory));
            });
        }
        for (const key of Object.keys(this.positions)) {
            if (!visibleKeys.has(key)) continue;
            const p = this.positions[key];
            const c = Math.round(p.x / gs);
            const r = Math.round(p.y / gs);
            occupied.add(`${c}:${r}`);
        }
        let c0 = Math.round(x / gs);
        let r0 = Math.round(y / gs);
        const maxCols = Math.max(1, Math.floor(gridWidth / gs));
        const keyCell = `${c0}:${r0}`;
        if (!occupied.has(keyCell)) return { x: c0 * gs, y: r0 * gs };
        // spiral search
        const dirs = [ [1,0], [0,1], [-1,0], [0,-1] ];
        let step = 1;
        let c = c0, r = r0;
        while (step < 200) {
            for (let d=0; d<4; d++) {
                const [dx, dy] = dirs[d];
                const len = (d % 2 === 0) ? step : step;
                for (let i=0; i<len; i++) {
                    c += dx; r += dy;
                    if (c < 0) c = 0;
                    if (c >= maxCols) c = maxCols - 1;
                    const cell = `${c}:${r}`;
                    if (!occupied.has(cell)) return { x: c * gs, y: r * gs };
                }
            }
            step++;
        }
        return { x: c0 * gs, y: (r0+1) * gs };
    }

    async setLayout(newLayout) {
        const prevAuto = !!this.layout?.autoArrange;
        if (newLayout && Object.prototype.hasOwnProperty.call(newLayout, 'columns')) {
            const sanitizedColumns = this.sanitizeColumns(newLayout.columns);
            if (sanitizedColumns != null) {
                newLayout = { ...newLayout, columns: sanitizedColumns };
            } else {
                const { columns, ...rest } = newLayout;
                newLayout = rest;
            }
        }
        this.layout = { ...this.layout, ...newLayout };
        if (newLayout.autoArrange) {
            // when turning on auto arrange, clear positions
            this.positions = {};
            this.layout.positions = {};
        } else {
            // Turning auto arrange OFF: freeze current visible positions as baseline without moving/snapping
            // Defer capture to applyLayoutMode so parent grid has free-layout (position: relative)
            this.layout.positions = this.positions;
        }
        const ensuredColumns = this.getColumnsSetting();
        if (ensuredColumns != null) {
            this.layout.columns = ensuredColumns;
        } else {
            delete this.layout.columns;
        }
        try { await storageManager.set('layout', this.layout); } catch (_) {}
        this.applyLayoutMode();
    }

    saveLayoutDebounced() {
        clearTimeout(this._saveLayoutTimer);
        this._saveLayoutTimer = setTimeout(async () => {
            try {
                const merged = { ...this.layout, positions: this.positions };
                await storageManager.set('layout', merged);
            } catch (_) {}
        }, 250);
    }

    reflowVisibleLayout() {
        if (this.layout?.autoArrange) return; // grid mode does not require reflow here
        if (this.positions && Object.keys(this.positions).length > 0) {
            this.applyVisibleTransformsFromPositions();
            this.positionAddTile();
        } else {
            this.captureVisiblePositionsWithoutMove(true);
        }
    }

    // Capture current visible items' positions relative to grid without moving them,
    // two-phase: compute all positions first, then apply absolute left/top to avoid reflow side-effects
    captureVisiblePositionsWithoutMove(persist) {
        const grid = this.gridEl;
        if (!grid) return;
        const currentCategory = this.getCurrentCategory();
        const gridRect = grid.getBoundingClientRect();
        const items = Array.from(grid.querySelectorAll('.shortcut-item'));
        const computed = [];
        items.forEach((el, idx) => {
            if (!el || el.classList.contains('add-shortcut')) return;
            if (el.style.display === 'none') return;
            const link = this.links[idx];
            const key = this.getPositionKey(link, currentCategory);
            const r = el.getBoundingClientRect();
            const x = r.left - gridRect.left;
            const y = r.top - gridRect.top;
            computed.push({ el, key, x, y });
        });
        // Apply in second pass to avoid moving items during measurement
        computed.forEach(({ el, key, x, y }) => {
            el.style.position = 'absolute';
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            el.style.transform = 'none';
            this.positions[key] = { x, y };
        });
        if (persist) {
            try {
                const merged = { ...this.layout, positions: this.positions };
                storageManager.set('layout', merged);
            } catch (_) {}
        }
    }

    // Apply saved positions to visible items only (no snapping, no animation)
    applyVisibleTransformsFromPositions() {
        const grid = this.gridEl;
        if (!grid) return;
        const currentCategory = this.getCurrentCategory();
        const items = Array.from(grid.querySelectorAll('.shortcut-item'));
        items.forEach((el, idx) => {
            if (!el || el.classList.contains('add-shortcut')) return;
            if (el.style.display === 'none') return;
            const link = this.links[idx];
            const key = this.getPositionKey(link, currentCategory);
            const pos = this.positions[key];
            if (!pos) return;
            el.style.position = 'absolute';
            el.style.left = `${pos.x}px`;
            el.style.top = `${pos.y}px`;
            el.style.transform = 'none';
        });
    }

    positionAddTile() {
        const grid = this.gridEl;
        if (!grid) return;
        const addEl = grid.querySelector('.shortcut-item.add-shortcut');
        if (!addEl) return;
        const currentCategory = this.getCurrentCategory();
        const gs = Math.max(48, Math.min(240, this.layout.gridSize || 96));
        let maxY = -gs;
        let found = false;
        Array.from(grid.querySelectorAll('.shortcut-item')).forEach((el, idx) => {
            if (!el || el.classList.contains('add-shortcut')) return;
            if (el.style.display === 'none') return;
            const link = this.links[idx];
            const key = this.getPositionKey(link, currentCategory);
            const pos = this.positions[key];
            if (pos) {
                found = true;
                if (pos.y > maxY) maxY = pos.y;
            }
        });
        const targetX = 0;
        const targetY = found ? (maxY + gs) : 0;
        addEl.style.position = 'absolute';
        addEl.style.left = `${targetX}px`;
        addEl.style.top = `${targetY}px`;
        addEl.style.transform = 'none';
    }

    /**
     * Handle drag start
     */
    handleDragStart(e) {
        if (!e.target.classList.contains('shortcut-item')) return;

        const draggedItem = e.target;
        this.draggedIndex = parseInt(draggedItem.dataset.index);

        // Add visual feedback
        // 使用一个延时来确保浏览器已经开始了拖拽操作
        setTimeout(() => {
            draggedItem.classList.add('dragging');
        }, 0);

        // Set drag data
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.draggedIndex.toString());

        // 移除创建自定义拖拽图像的代码，以避免闪烁
        /*
        const dragImage = draggedItem.cloneNode(true);
        dragImage.style.transform = 'rotate(5deg)';
        dragImage.style.opacity = '0.8';
        document.body.appendChild(dragImage);
        e.dataTransfer.setDragImage(dragImage, e.offsetX, e.offsetY);
        
        setTimeout(() => {
            if (document.body.contains(dragImage)) {
                document.body.removeChild(dragImage);
            }
        }, 0);
        */

        console.log('Drag started for item:', this.draggedIndex);
    }

    /**
     * Handle drag over
     */
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        /*
        const draggingItem = document.querySelector('.shortcut-item.dragging');
        if (!draggingItem) return;

        const grid = document.getElementById('shortcuts-grid');
        const afterElement = this.getDragAfterElement(grid, e.clientX, e.clientY);

        // Add visual feedback to drop zones
        this.updateDropZoneVisuals(e.target);

        // Reorder DOM elements for visual feedback
        if (afterElement === null) {
            grid.appendChild(draggingItem);
        } else {
            grid.insertBefore(draggingItem, afterElement);
        }
        */
    }

    /**
     * Handle drop
     */
    async handleDrop(e) {
        e.preventDefault();
        
        const draggedIndex = this.draggedIndex;
        // 获取鼠标指针正下方的目标卡片
        const dropTarget = e.target.closest('.shortcut-item:not(.add-shortcut)');
        
        // 清理拖动过程中的所有视觉样式 (如高亮框)
        this.cleanupDragState();
        
        // 检查拖动操作是否有效 (有拖动起点，且落点是一个有效的卡片)
        if (draggedIndex === undefined || draggedIndex === null || !dropTarget) {
            this.draggedIndex = null; // 重置拖动状态
            return;
        }
        
        const dropIndex = parseInt(dropTarget.dataset.index);
        
        // 如果拖到了它自己原来的位置，则什么也不做
        if (draggedIndex === dropIndex) {
            this.draggedIndex = null; // 重置拖动状态
            return;
        }
        
        // --- 核心排序逻辑 ---
        // 1. 从数组中把被拖拽的元素"拿出来"
        const itemToMove = this.links.splice(draggedIndex, 1)[0];
        // 2. 把拿出来的元素插入到目标位置
        this.links.splice(dropIndex, 0, itemToMove);
        
        try {
            // 3. 将重新排序后的数组保存到存储中
            await storageManager.set('links', this.links);
            console.log('Shortcuts reordered and saved successfully.');
        } catch (error) {
            console.error('Error saving shortcut order:', error);
            showErrorMessage('Failed to save new shortcut order.');
            // 如果保存失败，后续的 updateGrid 仍然会根据内存中的错误顺序刷新UI,
            // 但在下次加载时会恢复，这里也可以选择重新加载原始数据来立即纠正。
        } finally {
            // 4. 重新渲染整个宫格，以确保所有卡片的 data-index 都更新为最新顺序
            this.updateGrid();
            this.draggedIndex = null; // 重置拖动状态
        }
    }
    /**
     * Handle drag enter
     */
    handleDragEnter(e) {
        e.preventDefault();
        const shortcutItem = e.target.closest('.shortcut-item');
        if (shortcutItem && !shortcutItem.classList.contains('dragging')) {
            shortcutItem.classList.add('drag-over');
        }
    }

    /**
     * Handle drag leave
     */
    handleDragLeave(e) {
        const shortcutItem = e.target.closest('.shortcut-item');
        if (shortcutItem) {
            // Only remove drag-over if we're actually leaving the element
            const rect = shortcutItem.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;

            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                shortcutItem.classList.remove('drag-over');
            }
        }
    }

    /**
     * Handle drag end
     */
    handleDragEnd(e) {
        console.log('Drag ended');
        this.cleanupDragState();
    }

    /**
     * Clean up drag state and visual feedback
     */
    cleanupDragState() {
        // Remove dragging class from all items
        const draggingItems = document.querySelectorAll('.shortcut-item.dragging');
        draggingItems.forEach(item => {
            item.classList.remove('dragging');
        });

        // Remove drop zone visual feedback
        const dropZones = document.querySelectorAll('.shortcut-item.drag-over');
        dropZones.forEach(zone => {
            zone.classList.remove('drag-over');
        });

        // Reset drag state
        this.draggedIndex = null;
    }



    /**
     * Update visual feedback for drop zones
     */
    updateDropZoneVisuals(target) {
        // Remove previous drop zone highlights
        const prevDropZones = document.querySelectorAll('.shortcut-item.drag-over');
        prevDropZones.forEach(zone => {
            zone.classList.remove('drag-over');
        });

        // Add highlight to current drop zone
        const dropZone = target.closest('.shortcut-item');
        if (dropZone && !dropZone.classList.contains('dragging')) {
            dropZone.classList.add('drag-over');
        }
    }

    /**
     * Get element after drag position for grid layout
     */
    getDragAfterElement(container, x, y) {
        const draggableElements = [...container.querySelectorAll('.shortcut-item:not(.dragging):not(.add-shortcut)')];

        // For grid layout, we need to consider both x and y positions
        let closestElement = null;
        let closestDistance = Number.POSITIVE_INFINITY;

        draggableElements.forEach(element => {
            const box = element.getBoundingClientRect();
            const elementCenterX = box.left + box.width / 2;
            const elementCenterY = box.top + box.height / 2;

            // Calculate distance from cursor to element center
            const distance = Math.sqrt(
                Math.pow(x - elementCenterX, 2) + Math.pow(y - elementCenterY, 2)
            );

            // Check if cursor is in the right half of the element (for insertion after)
            const isAfter = x > elementCenterX || (x === elementCenterX && y > elementCenterY);

            if (distance < closestDistance) {
                closestDistance = distance;
                closestElement = isAfter ? element.nextElementSibling : element;
            }
        });

        return closestElement;
    }

    /**
     * Render icon - handle both emoji/text and data URLs (favicons)
     */
    renderIcon(icon, url) {
        if (!icon) return '🌐';

        const imgAttrs = 'style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px;" loading="lazy" decoding="async" referrerpolicy="no-referrer"';

        // Treat tiny data URLs as invalid (likely 1x1 placeholders)
        if (icon.startsWith('data:image/')) {
            if (icon.length < 200) {
                // fall through to cache/remote resolution below
            } else {
                return `<img class="shortcut-icon-img" src="${icon}" alt="Site icon" ${imgAttrs}>`;
            }
        }

        // Remote URL provided by user: try URL-based cache first; fallback to rendering remote URL
        if (icon.startsWith('http://') || icon.startsWith('https://')) {
            if (window.faviconCache) {
                window.faviconCache.getIconDataUrlByUrl(icon).then((dataUrl) => {
                    if (!dataUrl || (typeof dataUrl === 'string' && dataUrl.startsWith('data:image/') && dataUrl.length < 200)) return;
                    const grid = document.getElementById('shortcuts-grid');
                    if (!grid) return;
                    const idx = this.links.findIndex(l => l.url === url);
                    if (idx >= 0) {
                        const slot = grid.querySelector(`.shortcut-item[data-index="${idx}"] .shortcut-icon`);
                        if (slot) slot.innerHTML = `<img class=\"shortcut-icon-img\" src=\"${dataUrl}\" alt=\"icon\" ${imgAttrs}>`;
                    }
                });
            }
            // Render remote URL immediately for UX; background cache will handle future loads
            return `<img class="shortcut-icon-img" src="${icon}" alt="Site icon" ${imgAttrs}>`;
        }

        // Otherwise, it's emoji/text or invalid data URL; try cache by URL origin first
        if (window.faviconCache && url) {
            const origin = window.faviconCache.getOriginFromUrl(url);
            if (origin) {
                window.faviconCache.getIconDataUrl(origin).then((dataUrl) => {
                    if (!dataUrl) return;
                    const grid = document.getElementById('shortcuts-grid');
                    if (!grid) return;
                    const idx = this.links.findIndex(l => l.url === url);
                    if (idx >= 0) {
                        const slot = grid.querySelector(`.shortcut-item[data-index="${idx}"] .shortcut-icon`);
                        if (slot) slot.innerHTML = `<img class=\"shortcut-icon-img\" src=\"${dataUrl}\" alt=\"icon\" ${imgAttrs}>`;
                    }
                });
            }
        }

        // As a last resort, build a Google S2 URL from page URL
        try {
            if (url) {
                const u = new URL(url.startsWith('http') ? url : 'https://' + url);
                const s2 = `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=64`;
                return `<img class="shortcut-icon-img" src="${s2}" alt="Site icon" ${imgAttrs}>`;
            }
        } catch (_) {}

        return this.escapeHtml(icon);
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Fetch website icon automatically
     */
    async fetchWebsiteIcon() {
        const urlInput = this.modal.querySelector('#shortcut-url');
        const iconInput = this.modal.querySelector('#shortcut-icon');
        const titleInput = this.modal.querySelector('#shortcut-title');
        const fetchBtn = this.modal.querySelector('#fetch-icon-btn');

        const url = urlInput.value.trim();
        if (!url) {
            this.showFormError('url', 'Please enter a URL first');
            return;
        }

        // Validate URL format
        let validUrl;
        try {
            validUrl = new URL(url.startsWith('http') ? url : 'https://' + url);
        } catch {
            this.showFormError('url', 'Please enter a valid URL');
            return;
        }

        // Disable button and show loading state
        fetchBtn.disabled = true;
        fetchBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 12a9 9 0 11-6.219-8.56"/>
            </svg>
        `;
        fetchBtn.style.animation = 'spin 1s linear infinite';

        try {
            // 方式一：直接用 Google S2 获取 icon；并尝试抓取页面标题
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${validUrl.hostname}&sz=64`;
            const s2DataUrl = await this.fetchFaviconAsDataUrl(faviconUrl);
            iconInput.value = s2DataUrl || faviconUrl;

            // 方式二：尝试抓取网页 HTML，解析 <title> 与 <link rel="icon">
            // 说明：在扩展页面中 fetch 跨域网站通常受限，不保证都成功；尽力而为
            let htmlText = '';
            try {
                const resp = await fetch(validUrl.toString(), { method: 'GET', mode: 'cors' });
                if (resp.ok) {
                    htmlText = await resp.text();
                }
            } catch (_) { }

            if (htmlText) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');
                // 标题
                const pageTitle = doc.querySelector('title')?.textContent?.trim();
                if (pageTitle && !titleInput.value.trim()) {
                    titleInput.value = pageTitle;
                }
                // icon 链接解析，优先 apple-touch-icon、icon、shortcut icon
                const iconSelectors = [
                    'link[rel="apple-touch-icon"]',
                    'link[rel="apple-touch-icon-precomposed"]',
                    'link[rel="icon"]',
                    'link[rel="shortcut icon"]',
                    'link[rel~="icon"]'
                ];
                let href = '';
                for (const sel of iconSelectors) {
                    const el = doc.querySelector(sel);
                    if (el && el.getAttribute('href')) {
                        href = el.getAttribute('href');
                        break;
                    }
                }
                if (href) {
                    // 处理相对路径
                    try {
                        const absUrl = new URL(href, validUrl).toString();
                        const absDataUrl = await this.fetchFaviconAsDataUrl(absUrl);
                        iconInput.value = absDataUrl || absUrl;
                    } catch (_) { }
                }
            }
        } finally {
            fetchBtn.disabled = false;
            fetchBtn.style.animation = '';
            fetchBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1z"/>
                    <path d="M16 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1z"/>
                    <path d="M11 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1z"/>
                    <path d="M6 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1z"/>
                </svg>
            `;
        }
    }

    /**
     * Fetch favicon and convert to data URL
     */
    async fetchFaviconAsDataUrl(faviconUrl) {
        try {
            const response = await fetch(faviconUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const blob = await response.blob();

            // Convert blob to data URL
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.error('Error fetching favicon:', error);
            return null;
        }
    }
}

function showErrorMessage(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ff4444;
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        z-index: 1000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    document.body.appendChild(errorDiv);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 5000);
}
// 分类导航功能
class CategoryNavigation {
    constructor() {
        this.storageKey = 'currentCategory';
        this.currentCategory = localStorage.getItem(this.storageKey) || 'all';
        this.categories = [];
        this.defaultCategories = [
            { id: 'work', name: '工作', icon: '💼' },
            { id: 'social', name: '社交', icon: '👥' },
            { id: 'entertainment', name: '娱乐', icon: '🎮' },
            { id: 'tools', name: '工具', icon: '🔧' },
            { id: 'learning', name: '学习', icon: '📚' }
        ];
        this.init();
    }

    async init() {
        this.categories = await storageManager.get('categories', this.defaultCategories);
        if (this.currentCategory !== 'all' && !this.categories.some(c => c.id === this.currentCategory)) {
            this.currentCategory = 'all';
        }
        this.render();
    }

    render() {
        const list = document.getElementById('category-list');
        if (!list) return;

        list.innerHTML = '';

        // All category
        const allItem = this.createNavItem({ id: 'all', name: (window.i18n && i18n.t('all')) || '全部', icon: '🌟' });
        list.appendChild(allItem);

        // User categories
        this.categories.forEach(cat => {
            const item = this.createNavItem(cat);
            list.appendChild(item);
        });

        this.updateCategoryUI();
        this.filterShortcuts();
    }

    createNavItem(cat) {
        const btn = document.createElement('button');
        btn.className = 'category-item';
        btn.dataset.category = cat.id;
        btn.innerHTML = `<span class="category-icon">${cat.icon}</span><span class="category-name">${cat.name}</span>`;
        btn.addEventListener('click', () => this.selectCategory(cat.id));
        return btn;
    }

    selectCategory(category) {
        if (this.currentCategory === category) return;
        this.currentCategory = category;
        try {
            localStorage.setItem(this.storageKey, category);
        } catch (e) {
            console.warn('Failed to save category', e);
        }
        this.updateCategoryUI();
        this.filterShortcuts();
    }

    updateCategoryUI() {
        const items = document.querySelectorAll('.category-item');
        items.forEach(item => {
            const itemCategory = item.dataset.category;
            if (itemCategory === this.currentCategory) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    filterShortcuts() {
        const shortcutItems = document.querySelectorAll('.shortcut-item:not(.add-shortcut)');
        shortcutItems.forEach(item => {
            const index = parseInt(item.dataset.index);
            if (isNaN(index)) return;

            const shortcutsComponent = window.shortcutsComponentInstance;
            if (!shortcutsComponent || !shortcutsComponent.links[index]) return;

            const link = shortcutsComponent.links[index];
            const linkCategory = link.category || 'work';

            if (this.currentCategory === 'all' || linkCategory === this.currentCategory) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
        // trigger layout reflow in free layout mode to avoid chaos when switching categories
        try { window.shortcutsComponentInstance?.reflowVisibleLayout?.(); } catch (_) {}
    }

    getCurrentCategory() {
        return this.currentCategory;
    }

    getCategoriesForSelect() {
        return this.categories;
    }
}

// 在页面加载完成后初始化分类导航
document.addEventListener('DOMContentLoaded', function () {
    // 延迟初始化以确保shortcuts组件已经渲染
    setTimeout(() => {
        if (!window.categoryNavigation) {
            window.categoryNavigation = new CategoryNavigation();
        }
    }, 100);
});