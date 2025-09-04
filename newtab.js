// New tab page JavaScript - with storage management
document.addEventListener('DOMContentLoaded', async function () {
    console.log('Local iTab new tab page loaded');

    try {
        // Initialize dashboard components with stored data
        await initializeDashboard();

        // Set up settings button
        const settingsButton = document.getElementById('open-options');
        if (settingsButton) {
            settingsButton.addEventListener('click', function () {
                chrome.runtime.openOptionsPage();
            });
        }
    } catch (error) {
        console.error('Error initializing dashboard:', error);
        // Show error message to user
        showErrorMessage('Failed to load dashboard. Please try refreshing the page.');
    }
});

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
            initializeShortcutsComponent(config.links);
        }

        // Initialize other components (always visible for now)
        initializeQuoteComponent(config.quote);

        console.log('Dashboard initialized successfully');
    } catch (error) {
        console.error('Error in initializeDashboard:', error);
        throw error;
    }
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
    }

    /**
     * Start the clock with real-time updates
     */
    start() {
        // Update immediately
        this.updateDisplay();

        // Set up interval for updates
        this.intervalId = setInterval(() => {
            this.updateDisplay();
        }, 1000);
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



function initializeShortcutsComponent(linksConfig) {
    const shortcutsContainer = document.getElementById('shortcuts-container');
    if (!shortcutsContainer) return;

    // Create shortcuts component
    const shortcutsComponent = new ShortcutsComponent(linksConfig);
    shortcutsComponent.render();
}

function initializeQuoteComponent(quote) {
    const quoteContainer = document.getElementById('quote-container');
    if (quoteContainer) {
        quoteContainer.innerHTML = `<div>${quote}</div>`;
        quoteContainer.style.display = 'block';
    }
}



/**
 * Shortcuts Component Class
 * Handles shortcuts grid display and CRUD operations
 */
class ShortcutsComponent {
    constructor(links) {
        this.links = links || [];
        this.container = document.getElementById('shortcuts-container');
        this.currentEditIndex = -1;
        this.modal = null;
        this.confirmDialog = null;
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
                    <div class="shortcut-icon">${this.renderIcon(link.icon || '🌐')}</div>
                    <h3 class="shortcut-title">${this.escapeHtml(link.title)}</h3>
                </div>
                <div class="shortcut-actions">
                    <button class="shortcut-action-btn edit" data-action="edit" data-index="${index}" title="Edit">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                        </svg>
                    </button>
                    <button class="shortcut-action-btn delete" data-action="delete" data-index="${index}" title="Delete">
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
                    <h3 class="shortcut-title">添加图标</h3>
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
        this.showModal('Add Shortcut', '', '');
    }

    /**
     * Open edit shortcut modal
     */
    openEditModal(index) {
        if (index >= 0 && index < this.links.length) {
            this.currentEditIndex = index;
            const link = this.links[index];
            this.showModal('Edit Shortcut', link.title, link.url, link.icon || '🌐');

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
                        <h3 class="modal-title">Add Shortcut</h3>
                        <button class="modal-close" id="modal-close">×</button>
                    </div>
                    <form class="modal-form" id="shortcut-form">
                        <div class="form-group">
                            <label class="form-label" for="shortcut-title">Title</label>
                            <input type="text" class="form-input" id="shortcut-title" placeholder="Enter shortcut title" required>
                            <div class="form-error" id="title-error"></div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="shortcut-url">URL</label>
                            <input type="url" class="form-input" id="shortcut-url" placeholder="https://example.com" required>
                            <div class="form-error" id="url-error"></div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="shortcut-category">分类</label>
                            <select class="form-input" id="shortcut-category"></select>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="shortcut-icon">Icon</label>
                            <div class="icon-input-group">
                                <input type="text" class="form-input" id="shortcut-icon" placeholder="🌐 or emoji/text" >
                                <button type="button" class="icon-fetch-btn" id="fetch-icon-btn" title="Auto-fetch website icon">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M21 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1z"/>
                                        <path d="M16 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1z"/>
                                        <path d="M11 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1z"/>
                                        <path d="M6 12c0 1-1 1-1 1s-1 0-1-1 1-1 1-1 1 0 1 1z"/>
                                    </svg>
                                </button>
                            </div>
                            <div class="form-hint">Enter an emoji, text, or click the button to auto-fetch the website's icon</div>
                        </div>
                        <div class="modal-actions">
                            <button type="button" class="modal-btn secondary" id="cancel-btn">Cancel</button>
                            <button type="submit" class="modal-btn primary" id="save-btn">Save</button>
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

        // Form submission
        const form = this.modal.querySelector('#shortcut-form');
        form.addEventListener('submit', (e) => this.handleFormSubmit(e));

        // Click outside to close
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hideModal();
            }
        });

        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('active')) {
                this.hideModal();
            }
        });
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

        // Save shortcut
        const shortcut = { title, url, icon, category };

        if (this.currentEditIndex >= 0) {
            // Edit existing shortcut
            this.links[this.currentEditIndex] = shortcut;
        } else {
            // Add new shortcut
            this.links.push(shortcut);
        }

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
            this.showFormError('url', 'Failed to save shortcut. Please try again.');
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
            this.showFormError('title', 'Title is required');
            isValid = false;
        } else if (title.length > 50) {
            this.showFormError('title', 'Title must be 50 characters or less');
            isValid = false;
        }

        // Validate URL
        if (!url) {
            this.showFormError('url', 'URL is required');
            isValid = false;
        } else if (!this.isValidUrl(url)) {
            this.showFormError('url', 'Please enter a valid URL');
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

    /**
     * Confirm delete shortcut
     */
    confirmDelete(index) {
        if (index < 0 || index >= this.links.length) return;

        const link = this.links[index];
        this.showConfirmDialog(
            'Delete Shortcut',
            'Are you sure you want to delete this shortcut?',
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
                showErrorMessage('Failed to delete shortcut. Please try again.');
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
        }
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
        // 1. 从数组中把被拖拽的元素“拿出来”
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
    renderIcon(icon) {
        if (!icon) return '🌐';

        // Support data URL or remote http(s) icon URL
        if (icon.startsWith('data:image/') || icon.startsWith('http://') || icon.startsWith('https://')) {
            return `<img src="${icon}" alt="Site icon" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px;">`;
        }

        // Otherwise, it's emoji or text
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
            iconInput.value = faviconUrl;

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
                        iconInput.value = absUrl;
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
        this.currentCategory = 'all';
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
        this.render();
    }

    render() {
        const list = document.getElementById('category-list');
        if (!list) return;

        list.innerHTML = '';

        // All category
        const allItem = this.createNavItem({ id: 'all', name: '全部', icon: '🌟' });
        list.appendChild(allItem);

        // User categories
        this.categories.forEach(cat => {
            const item = this.createNavItem(cat);
            list.appendChild(item);
        });

        // Manage button
        const manageBtn = document.createElement('button');
        manageBtn.className = 'category-item';
        manageBtn.innerHTML = '<span class="category-icon">⚙️</span><span class="category-name">管理</span>';
        manageBtn.addEventListener('click', () => this.openManageModal());
        list.appendChild(manageBtn);

        this.updateCategoryUI();
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
    }

    getCurrentCategory() {
        return this.currentCategory;
    }

    getCategoriesForSelect() {
        return this.categories;
    }

    createManageItem(cat) {
        const li = document.createElement('li');
        li.className = 'category-manage-item';
        li.dataset.id = cat.id;
        li.innerHTML = `
            <input type="text" class="cat-icon" value="${cat.icon}">
            <input type="text" class="cat-name" value="${cat.name}">
            <div class="cat-item-actions">
                <button class="cat-up" title="上移">↑</button>
                <button class="cat-down" title="下移">↓</button>
                <button class="cat-delete" title="删除">✕</button>
            </div>
        `;

        li.querySelector('.cat-delete').addEventListener('click', () => li.remove());
        li.querySelector('.cat-up').addEventListener('click', () => {
            const prev = li.previousElementSibling;
            if (prev) li.parentNode.insertBefore(li, prev);
        });
        li.querySelector('.cat-down').addEventListener('click', () => {
            const next = li.nextElementSibling;
            if (next) li.parentNode.insertBefore(next, li);
        });

        return li;
    }

    openManageModal() {
        const existing = document.getElementById('category-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'category-modal';
        overlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3 class="modal-title">管理分类</h3>
                    <button class="modal-close" id="cat-modal-close">×</button>
                </div>
                <div class="modal-body">
                    <ul class="category-manage-list" id="category-manage-list"></ul>
                    <button type="button" class="modal-btn secondary" id="add-category-btn">添加分类</button>
                </div>
                <div class="modal-actions">
                    <button type="button" class="modal-btn secondary" id="cat-cancel-btn">取消</button>
                    <button type="button" class="modal-btn primary" id="cat-save-btn">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const list = overlay.querySelector('#category-manage-list');
        this.categories.forEach(cat => list.appendChild(this.createManageItem(cat)));

        overlay.classList.add('active');

        const close = () => overlay.remove();
        overlay.querySelector('#cat-modal-close').addEventListener('click', close);
        overlay.querySelector('#cat-cancel-btn').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

        overlay.querySelector('#add-category-btn').addEventListener('click', () => {
            const newCat = { id: `cat_${Date.now()}`, name: '新分类', icon: '📁' };
            list.appendChild(this.createManageItem(newCat));
        });

        overlay.querySelector('#cat-save-btn').addEventListener('click', async () => {
            const items = list.querySelectorAll('.category-manage-item');
            const cats = [];
            items.forEach(li => {
                const id = li.dataset.id || `cat_${Date.now()}`;
                const icon = li.querySelector('.cat-icon').value.trim() || '📁';
                const name = li.querySelector('.cat-name').value.trim();
                if (name) {
                    cats.push({ id, icon, name });
                }
            });
            this.categories = cats;
            await storageManager.set('categories', this.categories);
            close();
            this.render();
            this.filterShortcuts();
            window.shortcutsComponentInstance?.updateCategoryOptions();
        });
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