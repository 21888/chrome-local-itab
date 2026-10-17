// New tab page JavaScript - with storage management
let dashboardHiddenState = false;
if (typeof window !== 'undefined') {
    window.dashboardHiddenState = dashboardHiddenState;
}
let currentUiState = null;
let dashboardPreferenceBaseline = null;
let dashboardVisibilityQueue = Promise.resolve();
let dashboardVisibilitySession = 0;
let dashboardVisibilityRequest = 0;
let dashboardVisibilityPending = 0;
let dashboardSavedHiddenState = false;
let dashboardVisibilityOwner = null;
function dashboardPreferenceMessage(error) {
    const conflict = error?.code?.startsWith('DASHBOARD_PREF_');
    const unavailable = error?.code === 'DASHBOARD_PREF_LOCK_UNAVAILABLE';
    const key = unavailable ? 'dashboardPreferenceLockUnavailable' : conflict ? 'dashboardPreferenceConflict' : 'dashboardPreferenceFailed';
    const fallback = unavailable ? 'Safe preference saving is unavailable in this browser. Your saved settings are unchanged.'
        : conflict ? 'Saved preferences changed or could not be safely read. Keep any draft and open a new tab before retrying.'
        : 'Could not save this preference. Your last saved choice is still in use; try again.';
    const translated = window.i18n?.t(key);
    return translated && translated !== key ? translated : fallback;
}
let quoteRefreshIntervalId = null;
const THEME_PRESETS = ['aurora-glass', 'ink-paper', 'warm-studio', 'signal-pop'];
const SEARCH_ENGINES = {
    google: 'https://www.google.com/search?q=%s',
    bing: 'https://www.bing.com/search?q=%s',
    duck: 'https://duckduckgo.com/?q=%s'
};

window.localItabPrivacy = { onlineFavicons: false };
const PRIVACY_PERMISSION_ORIGINS = {
    onlineFavicons: 'https://www.google.com/*'
};

function hasOptionalOriginPermission(origin) {
    return new Promise(resolve => {
        if (typeof chrome === 'undefined' || !chrome.permissions?.contains) {
            resolve(false);
            return;
        }

        let settled = false;
        const done = (granted) => {
            if (settled) return;
            settled = true;
            resolve(granted === true);
        };

        try {
            const maybePromise = chrome.permissions.contains({ origins: [origin] }, done);
            if (maybePromise && typeof maybePromise.then === 'function') {
                maybePromise.then(done).catch(() => done(false));
            }
        } catch (_) {
            done(false);
        }
    });
}

async function getEffectivePrivacyConfig(privacyConfig = {}) {
    const wantsFavicons = privacyConfig.onlineFavicons === true;

    return {
        onlineFavicons: wantsFavicons && await hasOptionalOriginPermission(PRIVACY_PERMISSION_ORIGINS.onlineFavicons)
    };
}

function normalizeThemePreset(preset) {
    if (typeof preset !== 'string') return 'aurora-glass';
    return THEME_PRESETS.includes(preset) ? preset : 'aurora-glass';
}

function applyThemePreset(preset) {
    const normalized = normalizeThemePreset(preset);
    document.documentElement.dataset.theme = normalized;
    document.body.dataset.theme = normalized;
    return normalized;
}

function isOnlineFaviconsEnabled() {
    return window.localItabPrivacy?.onlineFavicons === true;
}

function normalizeHttpUrl(rawUrl) {
    if (window.LocalItabSearch?.normalizeHttpUrl) {
        return window.LocalItabSearch.normalizeHttpUrl(rawUrl);
    }
    const value = String(rawUrl || '').trim();
    if (!value) return '';
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only HTTP and HTTPS URLs are supported');
    }
    return parsed.toString();
}

function normalizeSearchTemplate(rawTemplate) {
    if (window.LocalItabSearch?.normalizeSearchTemplate) {
        return window.LocalItabSearch.normalizeSearchTemplate(rawTemplate);
    }
    const value = String(rawTemplate || '').trim();
    if (!value) return '';
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
    const parsed = new URL(withProtocol);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('Only HTTP and HTTPS URLs are supported');
    }
    return parsed.toString();
}

function setText(element, value) {
    if (element) element.textContent = value == null ? '' : String(value);
}

function isSafeImageDataUrl(value) {
    return /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(String(value || ''));
}

document.addEventListener('DOMContentLoaded', async function () {
    console.log('Local iTab new tab page loaded');

    try {
        // Localize the static shell even when workspace startup cannot finish.
        window.i18n?.localizeDocument(document);
        // Initialize dashboard components with stored data
        await window.LocalItabWorkspacesView?.mountPage();
        const config = await initializeDashboard();
        const themePreset = applyThemePreset(config?.themePreset);

        // Apply i18n to static DOM
        if (window.i18n) {
            window.i18n.localizeDocument(document);
        }
        window.localFocusView?.attachDocumentTitle();

        // Set up settings button
        const settingsButton = document.getElementById('open-options');
        if (settingsButton) {
            settingsButton.addEventListener('click', function () {
                window.LocalItabWorkspacesView.openSettings();
            });
        }

        // Category management button in sidebar header
        const manageBtn = document.getElementById('manage-categories');
        if (manageBtn) {
            manageBtn.addEventListener('click', () => {
                if (chrome.runtime?.openOptionsPage) {
                    window.LocalItabWorkspacesView.openSettings();
                } else {
                    window.LocalItabWorkspacesView.openSettings('category-settings');
                }
            });
        }
        // Initialize custom context menu
        if (window.contextMenu) {
            window.contextMenu.init({
                theme: themePreset,
                onAction: handleContextAction
            });
        }

        setupDashboardVisibilityToggle(config?.ui, config?._settingsBaseline);
        setupThemeChangeListener();
        setupClockPreferenceListener(config);
        setupDashboardAppearance(config);
        setupCloudSyncChangeListener();
        // Performance guards: pause animations when tab hidden; honor reduced motion
        setupPerformanceGuards();
        setupExtremeCompactMode();
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
            if (action === 'organize_sites') {
                await window.shortcutsComponentInstance?.organizerView?.open(payload.id);
            } else if (action === 'open_all') {
                await openAllInCategory(payload.id);
            }
            return;
        }

        if (payload?.type === 'blank') {
            if (action === 'dashboard_visibility_toggle') {
                setDashboardHidden(!dashboardHiddenState);
                return;
            }

            const comp = window.shortcutsComponentInstance;
            if (!comp) return;
            if (['layout_grid', 'layout_free', 'layout_snap'].includes(action)) {
                await comp.setLayoutMode(action.slice(7));
            } else if (action === 'layout_auto_arrange_toggle') {
                await comp.setLayoutMode(comp.layout?.autoArrange ? 'free' : 'grid');
            } else if (action === 'layout_align_grid_toggle') {
                await comp.setLayoutMode(comp.layout?.autoArrange || !comp.layout?.alignToGrid ? 'snap' : 'free');
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
                case 'move_earlier':
                case 'move_later':
                    await comp.moveShortcut(idx, action === 'move_earlier' ? -1 : 1);
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

// Own one category-opening batch per page, including its confirmation dialog.
let categoryOpenOperation = null;

function categoryOpenText(key, fallback, substitutions = []) {
    let translated;
    try { translated = window.i18n?.t(key, substitutions); } catch (_) {}
    if (typeof translated === 'string' && translated && translated !== key) return translated;
    return fallback.replace(/\$(\d+)/g, (_, index) => substitutions[Number(index) - 1] ?? '');
}

// Open a confirmed snapshot of valid category URLs, with limited concurrency.
async function openAllInCategory(categoryId) {
    if (categoryOpenOperation) return;
    const operation = { stopped: false, timers: new Set() };
    categoryOpenOperation = operation;
    try {
        const comp = window.shortcutsComponentInstance;
        if (!comp) return;
        const all = !categoryId || categoryId === 'all';
        const links = Array.isArray(comp.links) ? comp.links : [];
        // Capture normalized strings before asking. Later array edits cannot change
        // the destinations or count the user is about to approve.
        const urls = links.filter(link => all || (link?.category || 'work') === categoryId).map(link => {
            try {
                return normalizeHttpUrl(link?.url);
            } catch (_) {
                return '';
            }
        }).filter(Boolean);
        const name = (Array.isArray(comp.categories) ? comp.categories : []).find(category => category?.id === categoryId)?.name;
        const label = all ? categoryOpenText('allShortcuts', 'All shortcuts')
            : typeof name === 'string' && name.trim() ? name.trim()
                : categoryOpenText('categoryOpenUnnamed', 'this category');
        if (!urls.length) {
            showErrorMessage(categoryOpenText('categoryOpenNoUrls',
                'No valid web addresses in “$1”. Check the saved addresses before trying again.', [label]));
            return;
        }

        const ok = confirm(categoryOpenText(urls.length === 1 ? 'categoryOpenConfirmOne' : 'categoryOpenConfirmMany',
            urls.length === 1 ? 'Open $1 new tab for “$2”?' : 'Open $1 new tabs for “$2”?', [String(urls.length), label]));
        if (!ok) return;

        const concurrency = 5;
        const delayMs = 120;
        let active = 0;
        let i = 0;
        let failed = 0;
        let unknown = 0;

        await new Promise((resolve, reject) => {
            const tick = () => {
                if (operation.stopped) return;
                if (i >= urls.length && active === 0) return resolve();
                try {
                    while (active < concurrency && i < urls.length) {
                        const url = urls[i++];
                        active++;
                        // Use window.open to avoid extra permissions.
                        const timer = setTimeout(() => {
                            if (operation.stopped) return;
                            operation.timers.delete(timer);
                            let opened;
                            let outcome = 'unknown';
                            try { opened = window.open(url, '_blank'); } catch (_) { outcome = 'failed'; }
                            if (outcome !== 'failed') {
                                // A null/closed/unreadable handle does not prove a popup was
                                // blocked. An open handle also says nothing about page loading.
                                try { if (opened && opened.closed === false) outcome = 'opened'; } catch (_) {}
                            }
                            if (outcome === 'failed') failed++;
                            else if (outcome === 'unknown') unknown++;
                            active--;
                            tick();
                        }, delayMs);
                        operation.timers.add(timer);
                    }
                } catch (error) {
                    // Invalidate queued callbacks immediately, before releasing ownership.
                    operation.stopped = true;
                    reject(error);
                }
            };
            tick();
        });
        // One aggregate notice; never retry automatically or claim that pages loaded.
        if (failed && unknown) {
            showErrorMessage(categoryOpenText('categoryOpenMixed',
                'Of $1 requested tabs, $2 could not open and $3 could not be confirmed. Check your tabs and pop-up settings, then open missing sites individually.',
                [String(urls.length), String(failed), String(unknown)]));
        } else if (failed) {
            showErrorMessage(categoryOpenText('categoryOpenFailed',
                'Could not open $1 of $2 tabs. Check your tabs and pop-up settings, then open missing sites individually.', [String(failed), String(urls.length)]));
        } else if (unknown) {
            showErrorMessage(categoryOpenText('categoryOpenUnknown',
                'Opening could not be confirmed for $1 of $2 tabs. Check your tabs and pop-up settings, then open missing sites individually.', [String(unknown), String(urls.length)]));
        }
    } finally {
        operation.stopped = true;
        if (categoryOpenOperation === operation) categoryOpenOperation = null;
        for (const timer of operation.timers) clearTimeout(timer);
        operation.timers.clear();
    }
}

async function initializeDashboard() {
    try {
        // Load all configuration data from storage
        const config = await storageManager.getAll();
        window.localItabPrivacy = await getEffectivePrivacyConfig(config.privacy);
        window.faviconCache?.setOnlineEnabled?.(window.localItabPrivacy.onlineFavicons);

        // Apply theme preset early for consistent rendering
        applyThemePreset(config.themePreset);
        window.LocalItabAppearance?.apply(config.appearance);
        updateTemplateIntro(config.appearance?.template);

        // Apply background settings
        await applyBackgroundSettings(config.bg, window.localItabPrivacy);

        // Apply module visibility settings
        window.localItabWorldClocksConfigured = false;
        applyModuleVisibility(config.show);

        // Initialize components based on visibility settings
        if (config.show.clock) {
            initializeClockComponent(config.clock);
        }

        if (config.show.search) {
            initializeSearchComponent(config.search, config._settingsBaseline);
        }


        if (config.show.shortcuts) {
            initializeShortcutsComponent(config.links, config.layout, config.categories, config._layoutBaseline, config.ui);
        }

        initializeLocalInfoCards(config);
        const tasksHost = document.getElementById('local-tasks-card');
        if (tasksHost && window.LocalItabTasks) {
            window.localTasksView = window.LocalItabTasks.mount(tasksHost, {
                onVisibility(visible) {
                    window.localItabTasksVisible = visible;
                    applyModuleVisibility(window.localItabModuleVisibility || config.show);
                }
            });
        }
        const focusHost = document.getElementById('local-focus-card');
        if (focusHost && window.LocalItabFocus && !window.localFocusView) {
            window.localFocusView = window.LocalItabFocus.mount(focusHost, {
                onVisibility(visible) {
                    window.localItabFocusVisible = visible;
                    applyModuleVisibility(window.localItabModuleVisibility || config.show);
                }
            });
        }
        const countdownHost = document.getElementById('local-countdown-card');
        if (countdownHost && window.LocalItabCountdown && !window.localCountdownView) {
            window.localCountdownView = window.LocalItabCountdown.mount(countdownHost, {
                onVisibility(visible) {
                    window.localItabCountdownVisible = visible;
                    applyModuleVisibility(window.localItabModuleVisibility || config.show);
                }
            });
        }
        const scratchpadHost = document.getElementById('local-scratchpad-card');
        if (scratchpadHost && window.LocalItabScratchpad && !window.localScratchpadView) {
            window.localScratchpadView = window.LocalItabScratchpad.mount(scratchpadHost, {
                onVisibility(visible) {
                    window.localItabScratchpadVisible = visible;
                    applyModuleVisibility(window.localItabModuleVisibility || config.show);
                }
            });
        }
        initializeQuoteComponent(config.quote);

        console.log('Dashboard initialized successfully');
        return config;
    } catch (error) {
        console.error('Error in initializeDashboard:', error);
        throw error;
    }
}

function updateTemplateIntro(template = 'clarity') {
    if (window.LocalItabTemplates && !['clarity', 'graphite', 'folio'].includes(template)) {
        const copy = window.LocalItabTemplates.localize(template);
        setText(document.getElementById('template-heading'), copy.heading);
        setText(document.getElementById('template-description'), copy.description);
        return;
    }
    const copy = {
        clarity: ['templateClarityHeading', 'Start here. Make today yours.', 'templateClarityIntro', 'A clear place for the sites you use every day.'],
        graphite: ['templateGraphiteHeading', 'Open your workspace.', 'templateGraphiteIntro', 'Less distraction. More focus.'],
        folio: ['templateFolioHeading', 'Your everyday, thoughtfully collected.', 'templateFolioIntro', 'Work, reading and inspiration, each in its place.']
    }[template] || ['templateClarityHeading', 'Start here. Make today yours.', 'templateClarityIntro', 'A clear place for the sites you use every day.'];
    setText(document.getElementById('template-heading'), window.i18n?.t(copy[0]) || copy[1]);
    setText(document.getElementById('template-description'), window.i18n?.t(copy[2]) || copy[3]);
}

function setupDashboardAppearance(config) {
    if (!window.LocalItabAppearance) return;
    const session = window.LocalItabWorkspaces?.session;
    const previewCurrent = () => !window.LocalItabContentLifecycle?.autosavePaused &&
        (!session || window.LocalItabWorkspaces?.session === session && storageManager.workspace === session && !session.invalidated && !session._suspended);
    window.appearanceController = window.LocalItabAppearance.mount(document.getElementById('dashboard-appearance'), {
        initial: config.appearance,
        baseline: config._settingsBaseline,
        previewEnabled: true,
        isPreviewCurrent: previewCurrent,
        onPreviewStart() {
            if (!previewCurrent()) return false;
            if (window.LocalItabCustomization?.isPreviewing || document.querySelector('.customize-overlay') ||
                window.LocalItabContentLifecycle?.autosavePaused) return false;
            return window.shortcutsComponentInstance?.beginTemplatePreview() ?? true;
        },
        onPreviewEnd() { window.shortcutsComponentInstance?.endTemplatePreview(); },
        onBeforeApply(value, previous) {
            if (value.template !== previous.template) window.shortcutsComponentInstance?._cancelFreeDrag?.();
        },
        onApply(value, previous) {
            updateTemplateIntro(value.template);
            if (value.template !== previous.template) window.shortcutsComponentInstance?.refreshTemplate();
        },
        onError: error => console.warn('Appearance save/read failed:', error)
    });
}

function setupThemeChangeListener() {
    if (!storageManager.onLocalChanged) return;
    storageManager.onLocalChanged((changes, areaName) => {
        if (areaName !== 'local') return;
        if (!changes.themePreset) return;
        const nextTheme = applyThemePreset(changes.themePreset.newValue);
        if (window.contextMenu?.destroy && window.contextMenu?.init) {
            window.contextMenu.destroy();
            window.contextMenu.init({ theme: nextTheme, onAction: handleContextAction });
        }
    });
}

async function renderSyncCompatibilityNotice() {
    const blocked = await storageManager.getSyncCompatibilityStatus?.();
    let notice = document.getElementById('sync-compatibility-notice');
    if (!blocked) { notice?.remove(); return; }
    if (!notice) {
        notice = document.createElement('a');
        notice.id = 'sync-compatibility-notice';
        notice.className = 'layout-status';
        notice.setAttribute('role', 'status');
        notice.href = window.LocalItabWorkspacesView?.settingsUrl('default', 'cloud-sync-settings') || 'options.html#cloud-sync-settings';
        document.querySelector('.dashboard-main')?.prepend(notice);
    }
    const key = 'syncCompatibilityNotice';
    const translated = window.i18n?.t(key);
    notice.textContent = translated && translated !== key ? translated : 'Chrome Sync needs review. Local settings are preserved. Open settings.';
}

function setupCloudSyncChangeListener() {
    renderSyncCompatibilityNotice().catch(error => console.warn('Sync status unavailable:', error));
    if (!chrome?.storage?.onChanged || !window.storageManager?.syncMetaKey) return;
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
        if (areaName === 'local' && changes[storageManager.syncIdentityStateKey]) {
            await renderSyncCompatibilityNotice().catch(error => console.warn('Sync status unavailable:', error));
            return;
        }
        if (areaName !== 'sync' || !Object.keys(changes).some(key => key === storageManager.syncMetaKey || key.startsWith(storageManager.syncChunkPrefix))) return;
        try {
            if (await storageManager.shouldIgnoreRemoteSyncChange?.(changes)) return;
            const result = await storageManager.pullFromSync();
            if (result?.applied && (!storageManager.workspace || storageManager.workspace.id === 'default')) {
                window.LocalItabContentLifecycle.reload();
            }
        } catch (error) {
            console.warn('Cloud sync refresh failed:', error);
            await renderSyncCompatibilityNotice().catch(error => console.warn('Sync status unavailable:', error));
        }
    });
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

function setupExtremeCompactMode() {
    try {
        const body = document.body;
        if (!body || !window?.addEventListener) return;
        let resizeTimer = null;
        const applyMode = () => {
            const width = window.innerWidth || 0;
            const height = window.innerHeight || 0;
            const isCompact = width <= 900 || height <= 700;
            const isExtreme = width <= 520 || height <= 600;
            const isTight = width <= 420 || height <= 520;
            body.classList.toggle('viewport-compact', isCompact);
            body.classList.toggle('extreme-compact', isExtreme);
            body.classList.toggle('extreme-compact-tight', isTight);
        };
        const schedule = () => {
            if (resizeTimer) window.clearTimeout(resizeTimer);
            resizeTimer = window.setTimeout(applyMode, 120);
        };
        applyMode();
        window.addEventListener('resize', schedule);
        window.addEventListener('orientationchange', schedule);
    } catch (_) {}
}

async function applyBackgroundSettings(bgConfig, privacyConfig = {}) {
    const body = document.body;

    // Clear existing background classes
    body.classList.remove('bg-gradient', 'bg-color', 'bg-image');
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
        default:
            body.classList.add('bg-gradient');
    }

    // adjust text color and overlay based on background type
    updateTextContrast(bgConfig);
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
        return;
    }

    root.style.removeProperty('--text-primary');
    root.style.removeProperty('--text-secondary');
    root.style.removeProperty('--text-muted');

    if (bgConfig.type === 'image' || bgConfig.type === 'api') {
        body.classList.add('has-overlay');
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
    window.localItabModuleVisibility = { ...showConfig };
    // Get module containers
    const clockContainer = document.getElementById('clock-container');
    const searchContainer = document.getElementById('search-container');
    const shortcutsContainer = document.getElementById('shortcuts-container');
    const weatherContainer = document.getElementById('weather-container');
    const hotContainer = document.getElementById('hot-container');
    const movieContainer = document.getElementById('movie-container');
    const worldClocksContainer = document.getElementById('world-clocks-card');
    const worldClocksVisible = showConfig.clock === true && window.localItabWorldClocksConfigured === true;
    if (worldClocksContainer) {
        worldClocksContainer.hidden = !worldClocksVisible;
        worldClocksContainer.classList.toggle('module-hidden', !worldClocksVisible);
    }

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

    [
        [searchContainer, showConfig.search],
        [weatherContainer, showConfig.weather],
        [hotContainer, showConfig.hot],
        [movieContainer, showConfig.movie]
    ].forEach(([container, isVisible]) => {
        if (!container) return;
        container.classList.toggle('module-hidden', isVisible !== true);
        container.style.display = isVisible === true ? '' : 'none';
    });
    const hasCards = window.localItabCountdownVisible === true || worldClocksVisible || window.localItabTasksVisible === true || window.localItabFocusVisible === true || window.localItabScratchpadVisible === true || ['weather', 'hot', 'movie'].some(key => showConfig[key] === true);
    document.getElementById('info-cards-container')?.classList.toggle('module-hidden', !hasCards);
    document.querySelector('.dashboard-main')?.classList.toggle('has-info-cards', hasCards);
}

// A system clipboard write cannot be cancelled, including by a search remount.
let calculatorCopyAttempt = null;
function initializeSearchComponent(searchConfig = {}, baseline = null) {
    const container = document.getElementById('search-container');
    if (!container) return;

    const validEngines = ['google', 'bing', 'duck', 'custom'];
    let currentSearchConfig = {
        engine: validEngines.includes(searchConfig.engine) ? searchConfig.engine : 'google',
        custom: typeof searchConfig.custom === 'string' ? searchConfig.custom.trim() : ''
    };

    let searchBaseline = baseline ? JSON.parse(JSON.stringify({generation: baseline.generation,
        values: Object.prototype.hasOwnProperty.call(baseline.values, 'search') ? {search: baseline.values.search} : {}})) : null;
    window.localCalculatorView?.clearResult?.();
    container.replaceChildren();
    const form = document.createElement('form');
    form.className = 'search-form';
    form.setAttribute('role', 'search');

    const select = document.createElement('select');
    select.className = 'search-engine-select';
    select.id = 'search-engine';
    select.setAttribute('aria-label', (window.i18n && i18n.t('searchEngine')) || 'Search engine');

    [
        ['google', 'Google'],
        ['bing', 'Bing'],
        ['duck', 'DuckDuckGo'],
        ['custom', (window.i18n && i18n.t('customSearch')) || 'Custom']
    ].forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
    });
    select.value = currentSearchConfig.engine;

    const input = document.createElement('input');
    input.className = 'search-input';
    input.type = 'search';
    input.placeholder = (window.i18n && i18n.t('searchPlaceholder')) || 'Search or enter a URL';
    input.setAttribute('aria-label', input.placeholder);

    const button = document.createElement('button');
    button.className = 'search-submit';
    button.type = 'submit';
    button.textContent = (window.i18n && i18n.t('search')) || 'Search';

    const calculatorText = (key, fallback) => {
        const translated = window.i18n?.t(key);
        return translated && translated !== key ? translated : fallback;
    };
    const calculatorStatus = document.createElement('div');
    calculatorStatus.id = 'search-calculator-status';
    calculatorStatus.className = 'search-calculator-status';
    calculatorStatus.setAttribute('role', 'status');
    calculatorStatus.setAttribute('aria-live', 'polite');
    calculatorStatus.setAttribute('aria-atomic', 'true');
    // Keep native selection/copy available independently of the explicit copy action.
    const calculatorResultRow = document.createElement('div');
    calculatorResultRow.className = 'search-calculator-result';
    const calculatorOutput = document.createElement('label');
    calculatorOutput.className = 'search-calculator-output';
    const calculatorOutputLabel = document.createElement('span');
    calculatorOutputLabel.textContent = calculatorText('calculatorCopyResult', 'Result · select and press Ctrl/Cmd+C to copy');
    const calculatorValue = document.createElement('input');
    calculatorValue.className = 'search-calculator-value';
    calculatorValue.type = 'text';
    calculatorValue.readOnly = true;
    calculatorValue.autocomplete = 'off';
    calculatorValue.spellcheck = false;
    calculatorOutput.append(calculatorOutputLabel, calculatorValue);
    const calculatorCopy = document.createElement('button');
    calculatorCopy.className = 'search-calculator-copy';
    calculatorCopy.type = 'button';
    calculatorCopy.textContent = calculatorText('calculatorCopyAction', 'Copy result');
    const calculatorUseResult = document.createElement('button');
    calculatorUseResult.className = 'search-calculator-use-result';
    calculatorUseResult.type = 'button';
    calculatorUseResult.textContent = calculatorText('calculatorUseResult', 'Use result');
    const calculatorCopyStatus = document.createElement('div');
    calculatorCopyStatus.className = 'search-calculator-copy-status';
    calculatorCopyStatus.setAttribute('role', 'status');
    calculatorCopyStatus.setAttribute('aria-live', 'polite');
    calculatorCopyStatus.setAttribute('aria-atomic', 'true');
    calculatorResultRow.append(calculatorOutput, calculatorCopy, calculatorUseResult, calculatorCopyStatus);
    // Recent calculations belong only to this mounted search, never to storage.
    const calculatorRecent = document.createElement('details');
    calculatorRecent.className = 'search-calculator-recent';
    const calculatorRecentSummary = document.createElement('summary');
    calculatorRecentSummary.className = 'search-calculator-recent-summary';
    calculatorRecentSummary.textContent = calculatorText('calculatorRecentTitle', 'Recent calculations on this page');
    const calculatorRecentNote = document.createElement('p');
    calculatorRecentNote.className = 'search-calculator-recent-note';
    calculatorRecentNote.textContent = calculatorText('calculatorRecentNote', 'Up to 5 successful calculations. Not saved; clearing or reloading this page discards these entries.');
    const calculatorRecentEmpty = document.createElement('p');
    calculatorRecentEmpty.className = 'search-calculator-recent-empty';
    calculatorRecentEmpty.textContent = calculatorText('calculatorRecentEmpty', 'No calculations yet.');
    const calculatorRecentList = document.createElement('ol');
    calculatorRecentList.className = 'search-calculator-recent-list';
    const calculatorRecentClear = document.createElement('button');
    calculatorRecentClear.className = 'search-calculator-recent-clear';
    calculatorRecentClear.type = 'button';
    calculatorRecentClear.textContent = calculatorText('calculatorRecentClear', 'Clear recent calculations');
    calculatorRecentClear.disabled = true;
    calculatorRecent.append(calculatorRecentSummary, calculatorRecentNote, calculatorRecentEmpty, calculatorRecentList, calculatorRecentClear);
    let recentCalculations = [];
    const recentCopyFeedback = new Set();
    const clearRecentCopyFeedback = () => {
        for (const receipt of [...recentCopyFeedback]) receipt.cancel();
    };
    let calculatorResult = null;
    const clearCopyStatus = () => {
        calculatorCopyStatus.textContent = '';
        calculatorCopyStatus.hidden = true;
        calculatorCopyStatus.classList.remove('is-error');
    };
    const invalidateCalculatorCopy = () => {
        const attempt = calculatorCopyAttempt;
        if (attempt?.owner !== searchOwner) return;
        attempt.cancel();
        // Keep the shared lock until the issued write settles; only its UI is stale.
    };
    const clearCalculatorOutput = () => {
        invalidateCalculatorCopy();
        clearRecentCopyFeedback();
        calculatorResult = null;
        clearCopyStatus();
        calculatorValue.value = '';
        calculatorOutput.hidden = true;
        calculatorResultRow.hidden = true;
    };
    calculatorValue.addEventListener('focus', () => {
        if (calculatorValue.isConnected && !calculatorOutput.hidden && window.localCalculatorView === searchOwner) calculatorValue.select();
    });
    calculatorValue.addEventListener('keydown', event => {
        // Readonly text inputs otherwise implicitly submit their enclosing form.
        if (event.key === 'Enter') event.preventDefault();
    });
    const searchStatus = document.createElement('div');
    searchStatus.id = 'search-open-status';
    // Keep the empty live region in the accessibility tree before its first update.
    searchStatus.className = 'search-open-status sr-only';
    searchStatus.setAttribute('role', 'status');
    searchStatus.setAttribute('aria-live', 'polite');
    searchStatus.setAttribute('aria-atomic', 'true');
    input.setAttribute('aria-describedby', `${calculatorStatus.id} ${searchStatus.id}`);
    const clearSearchStatus = () => {
        searchStatus.classList.add('sr-only');
        searchStatus.textContent = '';
        searchStatus.classList.remove('is-error');
    };
    const isCalculation = () => input.value.trimStart().startsWith('=');
    // Search ownership is local to this mounted input; never persist its contents.
    let submittedValue = null;
    let editRevision = 0;
    let submissionRevision = 0;
    let customDraftBaseline = currentSearchConfig.custom;
    let customEditRevision = 0;
    let customSavePending = 0;
    let searchConfigPending = 0;
    let selectionRequest = 0;
    let customComposing = false;
    const refreshCopyControl = () => {
        const locked = String(Boolean(calculatorCopyAttempt));
        calculatorCopy.setAttribute('aria-disabled', locked);
        for (const record of recentCalculations) record.copyView?.control.setAttribute('aria-disabled', locked);
    };
    const searchOwner = {
        clearResult: clearCalculatorOutput,
        refreshCopyControl,
        get pending() { return searchConfigPending > 0; },
        hasUncommittedWork: () => window.localCalculatorView === searchOwner && (
            (input.isConnected && Boolean(input.value.trim()) &&
                (isCalculation() || input.value !== submittedValue)) ||
            (customInput.isConnected && (searchConfigPending > 0 || customSavePending > 0 || customComposing || customInput.value !== customDraftBaseline)))
    };
    window.localCalculatorView = searchOwner;
    refreshCopyControl();
    const markSearchEdited = () => {
        submittedValue = null;
        editRevision++;
        clearCalculatorOutput();
        clearSearchStatus();
    };
    const resultCurrent = (result, control = calculatorCopy) => {
        if (!result || calculatorResult !== result || window.localCalculatorView !== searchOwner ||
            input.value !== result.expression || editRevision !== result.editRevision ||
            submissionRevision !== result.submissionRevision || calculatorValue.value !== result.value ||
            !input.isConnected || !control.isConnected || !container.contains(control) ||
            calculatorOutput.hidden || composing || document.hidden || document.visibilityState === 'hidden' ||
            window.LocalItabContentLifecycle?.departing || !control.getClientRects().length) return false;
        for (let node = control; node; node = node.parentElement) {
            const style = window.getComputedStyle?.(node);
            if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true' ||
                style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility) ||
                (node.tagName === 'DETAILS' && !node.open)) return false;
        }
        return true;
    };
    calculatorCopy.addEventListener('keydown', event => {
        if (['Enter', ' '].includes(event.key) && (event.repeat || composing || event.isComposing || event.keyCode === 229)) event.preventDefault();
    });
    const executeCalculatorCopy = async ({ text, isCurrent, invalidating, status, messages, clear, retainFeedback = false }) => {
        const attempt = { owner: searchOwner, valid: true, settled: false, status };
        calculatorCopyAttempt = attempt;
        const cancel = () => {
            if (!attempt.valid) return;
            attempt.valid = false;
            attempt.cleanup();
            clear();
            recentCopyFeedback.delete(attempt);
        };
        attempt.cancel = cancel;
        const observer = window.MutationObserver ? new window.MutationObserver(records => { if (invalidating(records)) cancel(); }) : null;
        attempt.cleanup = () => {
            observer?.disconnect();
            document.removeEventListener('visibilitychange', cancel, true);
            window.removeEventListener?.('blur', cancel);
            window.removeEventListener?.('pagehide', cancel);
        };
        const current = () => {
            if (observer && invalidating(observer.takeRecords())) cancel();
            return attempt.valid && (attempt.settled || calculatorCopyAttempt === attempt) && isCurrent();
        };
        if (retainFeedback) recentCopyFeedback.add(attempt);
        document.addEventListener('visibilitychange', cancel, true);
        window.addEventListener?.('blur', cancel);
        window.addEventListener?.('pagehide', cancel);
        observer?.observe(document.documentElement, { subtree: true, childList: true, attributes: true,
            characterData: retainFeedback,
            attributeFilter: ['hidden', 'inert', 'aria-hidden', 'style', 'class', 'open', 'disabled', 'readonly'] });
        status.textContent = calculatorText(...messages.pending);
        status.hidden = false;
        status.classList.remove('is-error');
        refreshCopyControl();
        try {
            // Call synchronously in this explicit activation; never await storage or permission.
            const clipboard = window.navigator?.clipboard;
            const writeText = clipboard?.writeText;
            if (typeof writeText !== 'function') throw new Error('Clipboard unavailable');
            if (!current()) return;
            await writeText.call(clipboard, text);
            if (current()) status.textContent = calculatorText(...messages.success);
        } catch (_) {
            if (current()) {
                status.textContent = calculatorText(...messages.failure);
                status.classList.add('is-error');
            }
        } finally {
            if (!current()) cancel();
            // Recent receipts remain guarded until their row/edit/fold/departure changes.
            // They describe this past action, never the live clipboard contents.
            if (!retainFeedback || !attempt.valid) attempt.cleanup();
            attempt.settled = true;
            if (calculatorCopyAttempt === attempt) calculatorCopyAttempt = null;
            // A replacement owner becomes available without receiving the old receipt.
            window.localCalculatorView?.refreshCopyControl?.();
        }
    };
    calculatorCopy.addEventListener('click', event => {
        const result = calculatorResult;
        if (event.detail > 1 || calculatorCopyAttempt || !resultCurrent(result)) return;
        executeCalculatorCopy({
            text: result.value, isCurrent: () => resultCurrent(result), status: calculatorCopyStatus, clear: clearCopyStatus,
            // Ancestor changes invalidate even a hide/detach followed by an immediate return.
            invalidating: records => records.some(record => record.type === 'attributes'
                ? record.target.contains(calculatorCopy)
                : Array.from(record.removedNodes || []).some(node => node === calculatorCopy || node.contains?.(calculatorCopy))),
            messages: {
                pending: ['calculatorCopying', 'Copying result…'],
                success: ['calculatorCopySuccess', 'Result copied.'],
                failure: ['calculatorCopyFailure', 'Could not copy. Select the result and press Ctrl/Cmd+C to copy it manually.']
            }
        });
    });
    calculatorUseResult.addEventListener('keydown', event => {
        if (['Enter', ' '].includes(event.key) && (event.repeat || composing || customComposing || event.isComposing || event.keyCode === 229)) event.preventDefault();
    });
    calculatorUseResult.addEventListener('click', event => {
        const result = calculatorResult;
        const current = () => !customComposing && !input.disabled && !input.readOnly &&
            resultCurrent(result, calculatorUseResult) && resultCurrent(result, input);
        if (event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 || !current()) return;
        // Focus can synchronously edit, submit or remount. Recheck before replacing a draft.
        input.focus();
        if (document.activeElement !== input || !current()) return;
        const value = `=${result.value}`;
        input.value = value;
        markSearchEdited();
        const revision = editRevision, operation = submissionRevision;
        updateCalculatorHint();
        if (input.isConnected && window.localCalculatorView === searchOwner && document.activeElement === input &&
            input.value === value && editRevision === revision && submissionRevision === operation) {
            input.setSelectionRange(value.length, value.length);
        }
    });
    const recentActivationBlocked = event => event.defaultPrevented || event.repeat || event.isComposing ||
        event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || composing || customComposing;
    const recentControlAvailable = control => {
        if (window.localCalculatorView !== searchOwner || !control.isConnected || !container.contains(control) ||
            control.disabled || composing || customComposing || document.hidden || document.visibilityState === 'hidden' ||
            window.LocalItabContentLifecycle?.departing || !control.getClientRects().length) return false;
        for (let node = control; node; node = node.parentElement) {
            const style = window.getComputedStyle?.(node);
            if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true' ||
                style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility) ||
                (node.tagName === 'DETAILS' && !node.open)) return false;
        }
        return true;
    };
    const guardRecentKey = event => {
        if (['Enter', ' '].includes(event.key) && recentActivationBlocked(event)) event.preventDefault();
    };
    const bindRecentDraftAction = (record, row, control, controlKey, nextValue) => {
        // Each action owns its exact rendered control, independently of its sibling.
        record[controlKey] = control;
        control.addEventListener('keydown', guardRecentKey);
        control.addEventListener('click', event => {
            const current = () => recentCalculations.includes(record) && record[controlKey] === control &&
                row.parentElement === calculatorRecentList && row.contains(control) &&
                recentControlAvailable(control) && recentControlAvailable(input) && !input.readOnly;
            if (event.detail > 1 || recentActivationBlocked(event) || !current()) return;
            const before = input.value, revision = editRevision, operation = submissionRevision;
            // Focus may synchronously replace this draft, submit, clear or remount.
            input.focus();
            if (document.activeElement !== input || !current() || input.value !== before ||
                editRevision !== revision || submissionRevision !== operation) return;
            input.value = nextValue;
            markSearchEdited();
            const nextRevision = editRevision;
            updateCalculatorHint();
            if (current() && document.activeElement === input && input.value === nextValue &&
                editRevision === nextRevision && submissionRevision === operation) {
                input.setSelectionRange(nextValue.length, nextValue.length);
            }
        });
    };
    const bindRecentRemoveAction = (record, row, expression, value, control) => {
        const rawExpression = expression.textContent, rawValue = value.textContent;
        const ownerCurrent = () => window.localCalculatorView === searchOwner &&
            document.getElementById('search-container') === container &&
            [container, form, input, calculatorRecent, calculatorRecentList].every(node => node.ownerDocument === document) &&
            calculatorRecentList.parentElement === calculatorRecent && calculatorRecent.parentElement === form &&
            form.parentElement === container && input.parentElement === form;
        const view = { control, current: () => recentCalculations.includes(record) && record.removeView === view &&
            ownerCurrent() && [row, expression, value, control].every(node => node.ownerDocument === document) &&
            row.parentElement === calculatorRecentList && control.parentElement === row &&
            expression.parentElement === row && value.parentElement === row &&
            expression.textContent === rawExpression && rawExpression === record.expression &&
            value.textContent === rawValue && rawValue === record.value &&
            recentControlAvailable(control) && recentControlAvailable(expression) && recentControlAvailable(value) };
        record.removeView = view;
        control.addEventListener('keydown', guardRecentKey);
        control.addEventListener('click', event => {
            if (event.detail > 1 || recentActivationBlocked(event) || !view.current()) return;
            const index = recentCalculations.indexOf(record), focused = document.activeElement === control;
            const draft = input.value, revision = editRevision, operation = submissionRevision;
            // Identity, not expression/value equality: deliberate duplicates are distinct records.
            const remaining = recentCalculations.filter(entry => entry !== record);
            recentCalculations = remaining;
            renderRecentCalculations();
            if (!focused) return;
            const next = remaining[index] || remaining[index - 1], nextView = next?.removeView;
            const target = nextView?.control || calculatorRecentSummary;
            const current = () => recentCalculations === remaining && ownerCurrent() &&
                input.value === draft && editRevision === revision && submissionRevision === operation &&
                (next ? next.removeView === nextView && nextView.current() :
                    !remaining.length && calculatorRecentSummary.ownerDocument === document &&
                    calculatorRecentSummary.parentElement === calculatorRecent && recentControlAvailable(calculatorRecentSummary));
            // Redraw can synchronously focus elsewhere or remount. Never reclaim that focus.
            if (!current() || ![control, document.body].includes(document.activeElement)) return;
            // Final side effect: focus listeners may edit, remove again or remount; do not write afterward.
            target.focus();
        });
    };
    const bindRecentCopyAction = (record, row, expression, value, control, status) => {
        const view = { row, expression, value, control, status };
        record.copyView = view;
        const clear = () => {
            status.textContent = '';
            status.hidden = true;
            status.classList.remove('is-error');
        };
        clear();
        control.addEventListener('keydown', guardRecentKey);
        control.addEventListener('click', event => {
            const draft = input.value, revision = editRevision, operation = submissionRevision;
            const rawExpression = expression.textContent, rawValue = value.textContent;
            const current = () => recentCalculations.includes(record) && record.copyView === view &&
                document.getElementById('search-container') === container &&
                [container, form, input, row, expression, value, control, status].every(node => node.ownerDocument === document) &&
                row.parentElement === calculatorRecentList && calculatorRecentList.parentElement === calculatorRecent &&
                calculatorRecent.parentElement === form && form.parentElement === container && input.parentElement === form &&
                control.parentElement === row && expression.parentElement === row && value.parentElement === row && status.parentElement === row &&
                expression.textContent === rawExpression && rawExpression === record.expression &&
                value.textContent === rawValue && rawValue === record.value &&
                input.value === draft && editRevision === revision && submissionRevision === operation &&
                recentControlAvailable(control) && recentControlAvailable(expression) && recentControlAvailable(value) &&
                recentControlAvailable(input) && !input.readOnly;
            if (event.detail > 1 || recentActivationBlocked(event) || calculatorCopyAttempt || !current()) return;
            for (const receipt of [...recentCopyFeedback]) if (receipt.status === status) receipt.cancel();
            const origins = [container, form, input, calculatorRecent, calculatorRecentList, row, expression, value, control, status];
            const sourceContains = node => expression.contains(node) || value.contains(node);
            executeCalculatorCopy({
                text: `${record.expression}\n${record.value}`, isCurrent: current, status, clear, retainFeedback: true,
                invalidating: records => records.some(change => change.type === 'attributes'
                    ? origins.some(node => change.target.contains?.(node)) && change.target !== status
                    : sourceContains(change.target) || Array.from(change.removedNodes || []).some(removed =>
                        origins.some(node => removed === node || removed.contains?.(node)))),
                messages: {
                    pending: ['calculatorRecentCopying', 'Copying calculation…'],
                    success: ['calculatorRecentCopySuccess', 'Calculation copied.'],
                    failure: ['calculatorRecentCopyFailure', 'Could not copy this calculation. Select the original expression and result to copy them manually.']
                }
            });
        });
    };
    calculatorRecent.addEventListener('toggle', () => {
        if (!calculatorRecent.open) clearRecentCopyFeedback();
    });
    const renderRecentCalculations = () => {
        clearRecentCopyFeedback();
        calculatorRecentList.replaceChildren(...recentCalculations.map(record => {
            const row = document.createElement('li');
            row.className = 'search-calculator-recent-item';
            const expression = document.createElement('span');
            expression.className = 'search-calculator-recent-expression';
            expression.textContent = record.expression;
            const value = document.createElement('span');
            value.className = 'search-calculator-recent-value';
            value.textContent = record.value;
            const use = document.createElement('button');
            use.className = 'search-calculator-recent-use';
            use.type = 'button';
            use.textContent = calculatorText('calculatorUseResult', 'Use result');
            bindRecentDraftAction(record, row, use, 'control', `=${record.value}`);
            const edit = document.createElement('button');
            edit.className = 'search-calculator-recent-edit';
            edit.type = 'button';
            edit.textContent = calculatorText('calculatorEditExpression', 'Edit expression');
            bindRecentDraftAction(record, row, edit, 'editControl', record.expression);
            const copy = document.createElement('button');
            copy.className = 'search-calculator-recent-copy';
            copy.type = 'button';
            copy.textContent = calculatorText('calculatorRecentCopyAction', 'Copy calculation');
            const status = document.createElement('div');
            status.className = 'search-calculator-recent-copy-status';
            status.setAttribute('role', 'status');
            status.setAttribute('aria-live', 'polite');
            status.setAttribute('aria-atomic', 'true');
            bindRecentCopyAction(record, row, expression, value, copy, status);
            const remove = document.createElement('button');
            remove.className = 'search-calculator-recent-remove';
            remove.type = 'button';
            remove.textContent = calculatorText('calculatorRecentRemove', 'Remove calculation');
            bindRecentRemoveAction(record, row, expression, value, remove);
            row.append(expression, value, use, edit, copy, remove, status);
            return row;
        }));
        calculatorRecentEmpty.hidden = recentCalculations.length > 0;
        calculatorRecentClear.disabled = recentCalculations.length === 0;
        refreshCopyControl();
    };
    calculatorRecentClear.addEventListener('keydown', guardRecentKey);
    calculatorRecentClear.addEventListener('click', event => {
        if (event.detail > 1 || recentActivationBlocked(event) || !recentControlAvailable(calculatorRecentClear)) return;
        recentCalculations = [];
        renderRecentCalculations();
    });
    const openSearch = url => {
        const value = input.value, revision = editRevision, operation = submissionRevision;
        const engine = select.value;
        const isCurrent = () => input.isConnected && window.localCalculatorView === searchOwner &&
            input.value === value && editRevision === revision &&
            submissionRevision === operation && select.value === engine;
        submittedValue = null;
        let opened;
        let outcome = 'unknown';
        try {
            opened = window.open(url, '_blank');
        } catch (_) {
            outcome = 'failed';
        }
        // Reading a WindowProxy can itself fail. That does not establish that
        // opening failed (nor that the browser blocked it). Never auto-retry.
        if (outcome !== 'failed') {
            try {
                if (opened && opened.closed === false) outcome = 'opened';
            } catch (_) { /* Creation remains unobservable. */ }
        }
        // A synchronous open/getter can reenter events or remount the search.
        if (!isCurrent()) return;
        if (outcome === 'opened') {
            submittedValue = value;
            clearSearchStatus();
            return;
        }
        searchStatus.textContent = outcome === 'failed'
            ? calculatorText('searchOpenFailed', 'Could not open a new tab. Your input is still here; you can submit it again.')
            : calculatorText('searchOpenUnknown', 'Unable to confirm whether a new tab opened. Your input is still here; check your tabs before submitting again.');
        searchStatus.classList.toggle('is-error', outcome === 'failed');
        searchStatus.classList.remove('sr-only');
    };
    let composing = false;
    const updateCalculatorHint = () => {
        clearCalculatorOutput();
        calculatorStatus.classList.remove('is-error');
        calculatorStatus.textContent = isCalculation()
            ? calculatorText('calculatorHint', 'Local calculator · Enter to calculate. Use decimals, + - * / and parentheses.')
            : calculatorText('calculatorDiscover', 'Tip: start with = to calculate locally, for example =(12 + 3) / 2');
        button.textContent = isCalculation()
            ? calculatorText('calculatorCalculate', 'Calculate')
            : ((window.i18n && i18n.t('search')) || 'Search');
    };
    input.addEventListener('input', () => { markSearchEdited(); updateCalculatorHint(); });
    input.addEventListener('compositionstart', () => { composing = true; markSearchEdited(); updateCalculatorHint(); });
    input.addEventListener('compositionend', () => { composing = false; updateCalculatorHint(); });
    input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (composing || event.isComposing || event.keyCode === 229)) event.preventDefault();
    });
    updateCalculatorHint();

    const customConfig = document.createElement('div');
    customConfig.className = 'search-custom-config';

    const customInput = document.createElement('input');
    customInput.className = 'search-custom-input';
    customInput.type = 'text';
    customInput.inputMode = 'url';
    customInput.placeholder = 'https://example.com/search?q=%s';
    customInput.value = currentSearchConfig.custom;
    customInput.setAttribute('aria-label', (window.i18n && i18n.t('customSearchUrl')) || 'Custom search URL');

    const customSave = document.createElement('button');
    customSave.className = 'search-custom-save';
    customSave.type = 'button';
    customSave.textContent = (window.i18n && i18n.t('save')) || 'Save';

    const customStatus = document.createElement('div');
    customStatus.className = 'search-custom-status';
    customStatus.setAttribute('role', 'status');

    customConfig.append(customInput, customSave, customStatus);

    const setCustomStatus = (message, state = '') => {
        customStatus.textContent = message || '';
        customStatus.classList.toggle('is-error', state === 'error');
        customStatus.classList.toggle('is-success', state === 'success');
    };

    const updateCustomConfigVisibility = (shouldFocus = false) => {
        const isCustom = select.value === 'custom';
        customConfig.hidden = !isCustom;
        if (isCustom) {
            setCustomStatus(
                currentSearchConfig.custom
                    ? ((window.i18n && i18n.t('customSearchUrlDesc')) || 'Use %s where the encoded query should be inserted.')
                    : ''
            );
            if (shouldFocus) customInput.focus();
        }
    };

    const isCurrentEditor = () => customInput.isConnected && window.localCalculatorView === searchOwner;
    // Serialize intents from this editor without replaying cached sibling values.
    let configWrite = Promise.resolve();
    const persistSearchConfig = (patch) => {
        ++searchConfigPending;
        const operation = configWrite.then(async () => {
            if (!isCurrentEditor()) return {saved: false};
            const cleanCustom = customInput.value === customDraftBaseline && !customComposing;
            const inputBefore = customInput.value, revision = customEditRevision;
            try {
                if (!window.storageManager || typeof storageManager.patchDashboardPreferences !== 'function') throw new Error('Safe preference saving unavailable');
                const committed = await storageManager.patchDashboardPreferences(patch, searchBaseline);
                if (!committed) throw new Error('Preference was not saved');
                currentSearchConfig = committed.search;
                if (Object.prototype.hasOwnProperty.call(patch, 'custom')) {
                    searchBaseline.values.search = committed.searchSource;
                } else if (cleanCustom && isCurrentEditor() && customInput.value === inputBefore && customEditRevision === revision) {
                    searchBaseline.values.search = committed.searchSource;
                    customDraftBaseline = committed.search.custom;
                    customInput.value = committed.search.custom;
                } else {
                    // A dirty template retains its original conflict baseline,
                    // including when engine selection discovers an external URL.
                    searchBaseline.values.search = {...(searchBaseline.values.search || {}), engine: patch.engine};
                }
                return {saved: true};
            } catch (error) { return {saved: false, error}; }
        }).finally(() => { --searchConfigPending; });
        configWrite = operation.then(() => {});
        return operation;
    };

    const saveCustomSearch = async () => {
        if (!isCurrentEditor() || customSavePending || customComposing) return false;
        const draftValue = customInput.value;
        const revision = customEditRevision;
        const engine = select.value;
        const rawTemplate = draftValue.trim();
        if (!rawTemplate) {
            setCustomStatus((window.i18n && i18n.t('customSearchUrlRequired')) || 'Custom search URL is required', 'error');
            customInput.focus();
            return false;
        }

        let normalizedTemplate;
        try {
            normalizedTemplate = normalizeSearchTemplate(rawTemplate);
        } catch (_) {
            setCustomStatus((window.i18n && i18n.t('customSearchUrlInvalid')) || 'Enter a valid HTTP or HTTPS search URL', 'error');
            customInput.focus();
            return false;
        }

        customSavePending++;
        const {saved, error} = await persistSearchConfig({engine: 'custom', custom: normalizedTemplate});
        customSavePending--;
        if (!isCurrentEditor()) return saved;
        // A successful write establishes the saved baseline even when a newer
        // edit exists. Only the unchanged editor receives normalized text/status.
        if (saved) customDraftBaseline = normalizedTemplate;
        if (customInput.value !== draftValue || customEditRevision !== revision) return saved;
        if (saved) customInput.value = normalizedTemplate;
        if (select.value !== engine) return saved;
        if (!saved) {
            setCustomStatus(dashboardPreferenceMessage(error), 'error');
            return false;
        }

        select.value = 'custom';
        customInput.value = normalizedTemplate;
        setCustomStatus((window.i18n && i18n.t('customSearchSaved')) || 'Custom search saved', 'success');
        return true;
    };

    select.addEventListener('change', async () => {
        if (!isCurrentEditor()) return;
        markSearchEdited();
        const engine = select.value, request = ++selectionRequest;
        updateCustomConfigVisibility(engine === 'custom' && !currentSearchConfig.custom);
        const {saved, error} = await persistSearchConfig({engine});
        if (!isCurrentEditor() || request !== selectionRequest || select.value !== engine) return;
        if (!saved) {
            select.value = currentSearchConfig.engine;
            updateCustomConfigVisibility(false);
            searchStatus.textContent = dashboardPreferenceMessage(error);
            searchStatus.classList.remove('sr-only');
            searchStatus.classList.add('is-error');
        }
    });

    customSave.addEventListener('click', () => saveCustomSearch());
    const markCustomEdited = () => {
        customEditRevision++;
        markSearchEdited();
        setCustomStatus('');
    };
    customInput.addEventListener('input', markCustomEdited);
    customInput.addEventListener('compositionstart', () => { customComposing = true; markCustomEdited(); });
    customInput.addEventListener('compositionend', () => { customComposing = false; });

    customInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        if (customComposing || event.repeat || event.isComposing || event.keyCode === 229) return;
        saveCustomSearch();
    });

    form.append(select, input, button, calculatorStatus, calculatorResultRow, calculatorRecent, searchStatus, customConfig);
    updateCustomConfigVisibility(false);

    form.addEventListener('keydown', event => {
        if (event.key === 'Enter' && (event.repeat || composing || customComposing || event.isComposing || event.keyCode === 229)) event.preventDefault();
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!input.isConnected || window.localCalculatorView !== searchOwner) return;
        if (composing || event.isComposing) return;
        const operation = ++submissionRevision;
        clearSearchStatus();
        clearCalculatorOutput();
        // Intercept the explicit prefix before URL normalization or engine lookup.
        // Errors and a missing helper must never send expressions to a provider.
        if (isCalculation()) {
            const expression = input.value, revision = editRevision;
            let result;
            try {
                result = window.LocalItabCalculator?.calculate(input.value.trimStart().slice(1));
            } catch (_) { /* Calculator errors must stay local too. */ }
            if (!input.isConnected || window.localCalculatorView !== searchOwner || input.value !== expression ||
                editRevision !== revision || submissionRevision !== operation) return;
            result = result || { error: 'unavailable' };
            const errors = {
                syntax: ['calculatorSyntax', 'Check the expression. Use decimals, + - * / and parentheses only.'],
                length: ['calculatorLength', 'Expression too long. Use at most 256 characters after =.'],
                depth: ['calculatorDepth', 'Too many nested parentheses or signs. Use at most 32 levels.'],
                zero: ['calculatorZero', 'Cannot divide by zero.'],
                range: ['calculatorRange', 'The calculation exceeds the supported number range.'],
                unavailable: ['calculatorUnavailable', 'The local calculator is unavailable. Reload the page to retry.']
            };
            calculatorStatus.classList.toggle('is-error', Boolean(result.error));
            calculatorStatus.textContent = result.error
                ? calculatorText(...(errors[result.error] || errors.syntax))
                : `${calculatorText('calculatorResult', 'Local result')} = ${result.value}`;
            if (!result.error) {
                calculatorValue.value = String(result.value);
                calculatorResult = { value: calculatorValue.value, expression, editRevision: revision, submissionRevision: operation };
                calculatorOutput.hidden = false;
                calculatorResultRow.hidden = false;
                recentCalculations.unshift({ expression, value: calculatorValue.value });
                recentCalculations.splice(5);
                renderRecentCalculations();
            }
            return;
        }
        const query = input.value.trim();
        if (!query) return;

        try {
            const directUrl = normalizeHttpUrl(query);
            if (/^[\w.-]+\.[a-z]{2,}([/:?#]|$)/i.test(query) || /^https?:\/\//i.test(query)) {
                openSearch(directUrl);
                return;
            }
        } catch (_) {}

        const engine = select.value;
        if (engine === 'custom' && !currentSearchConfig.custom) {
            updateCustomConfigVisibility(true);
            setCustomStatus((window.i18n && i18n.t('customSearchUrlRequired')) || 'Custom search URL is required', 'error');
            return;
        }

        const template = engine === 'custom'
            ? currentSearchConfig.custom
            : SEARCH_ENGINES[engine] || SEARCH_ENGINES.google;
        const url = window.LocalItabSearch?.buildSearchUrl
            ? window.LocalItabSearch.buildSearchUrl(template, query)
            : (() => {
                const encoded = encodeURIComponent(query);
                if (template.includes('%s')) return template.split('%s').join(encoded);
                const fallbackUrl = new URL(normalizeSearchTemplate(template));
                fallbackUrl.searchParams.set('q', query);
                return fallbackUrl.toString();
            })();
        openSearch(url);
    });

    container.appendChild(form);
}

function initializeLocalInfoCards(config) {
    renderWeatherCard(config.weather, config.show.weather);
    renderHotTopicsCard(config.hot, config.show.hot);
    renderMovieCard(config.movie, config.show.movie);
}

function createCardHeader(icon, title) {
    const header = document.createElement('div');
    header.className = 'info-card-header';
    const iconEl = document.createElement('span');
    iconEl.className = 'info-card-icon';
    iconEl.textContent = icon;
    const titleEl = document.createElement('h3');
    titleEl.className = 'info-card-title';
    titleEl.textContent = title;
    header.append(iconEl, titleEl);
    return header;
}

function renderWeatherCard(weather, visible) {
    const container = document.getElementById('weather-container');
    if (!container || visible !== true) return;
    container.replaceChildren(createCardHeader('☁', (window.i18n && i18n.t('weatherCard')) || 'Weather'));

    const display = document.createElement('div');
    display.className = 'weather-display';
    const temp = document.createElement('div');
    temp.className = 'weather-current-temp';
    temp.textContent = `${Number.isFinite(weather?.temp) ? Math.round(weather.temp) : 0}°`;
    const details = document.createElement('div');
    details.className = 'weather-details';
    setText(details, `${weather?.city || 'Local'} · ${weather?.cond || ''}`);
    const range = document.createElement('div');
    range.className = 'weather-high-low';
    range.textContent = `${(window.i18n && i18n.t('lowHigh')) || 'Low/High'} ${weather?.low ?? '-'}° / ${weather?.high ?? '-'}°`;
    const aqi = document.createElement('div');
    aqi.className = 'weather-aqi';
    aqi.textContent = `${(window.i18n && i18n.t('aqi')) || 'AQI'} ${weather?.aqi ?? '-'} · ${weather?.aqiLabel || ''}`;
    display.append(temp, details, range, aqi);
    container.appendChild(display);
}

function renderHotTopicsCard(hot, visible) {
    const container = document.getElementById('hot-container');
    if (!container || visible !== true) return;
    container.replaceChildren(createCardHeader('↗', (window.i18n && i18n.t('hotTopics')) || 'Hot Topics'));

    const topics = Array.isArray(hot?.[hot.tab]) ? hot[hot.tab] : [];
    const list = document.createElement('ol');
    list.className = 'topics-list';
    if (!topics.length) {
        const empty = document.createElement('div');
        empty.className = 'topics-empty';
        setText(empty, (window.i18n && i18n.t('emptyLocalTopics')) || 'Add local topics in settings.');
        container.appendChild(empty);
        return;
    }

    topics.slice(0, 6).forEach((topic, index) => {
        const item = document.createElement('li');
        item.className = 'topic-item';
        const rank = document.createElement('span');
        rank.className = 'topic-rank';
        rank.textContent = String(index + 1);
        const content = document.createElement('span');
        content.className = 'topic-content';
        const title = document.createElement('span');
        title.className = 'topic-title';
        title.textContent = topic.t || '';
        const score = document.createElement('span');
        score.className = 'topic-score';
        score.textContent = `${topic.s || 0}`;
        content.append(title, score);
        item.append(rank, content);
        list.appendChild(item);
    });
    container.appendChild(list);
}

function renderMovieCard(movie, visible) {
    const container = document.getElementById('movie-container');
    if (!container || visible !== true) return;
    container.replaceChildren(createCardHeader('★', (window.i18n && i18n.t('movieCard')) || 'Movie'));

    const display = document.createElement('div');
    display.className = 'movie-display';
    const poster = document.createElement('div');
    poster.className = 'movie-poster';
    if (movie?.poster && isSafeImageDataUrl(movie.poster)) {
        const img = document.createElement('img');
        img.className = 'poster-image';
        img.alt = '';
        img.src = movie.poster;
        poster.appendChild(img);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'poster-placeholder';
        placeholder.textContent = '★';
        poster.appendChild(placeholder);
    }
    const info = document.createElement('div');
    info.className = 'movie-info';
    const title = document.createElement('div');
    title.className = 'movie-title';
    setText(title, movie?.title || '');
    const note = document.createElement('div');
    note.className = 'movie-description';
    setText(note, movie?.note || '');
    info.append(title, note);
    display.append(poster, info);
    container.appendChild(display);
}

// One dashboard clock owns all local/world time rendering and its single timer.
let clockComponentInstance = null;
// A comparison write outlives its card/clock owner until the system promise settles.
let worldClockCopyAttempt = null;
let worldClockCopyOwner = null;
// This independent date-result write also outlives view/clock replacement.
let monthCalendarIntervalCopyAttempt = null;
let monthCalendarIntervalCopyOwner = null;
let clockPreferenceRefresh = null;
function normalizeDashboardClockPreferences(value) {
    const valid = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {hour12: typeof valid.hour12 === 'boolean' ? valid.hour12 : false,
        showSeconds: typeof valid.showSeconds === 'boolean' ? valid.showSeconds : true,
        worldClocks: window.WorldClocks?.safe(valid.worldClocks) || []};
}
function setupClockPreferenceListener(config) {
    if (clockPreferenceRefresh) return clockPreferenceRefresh;
    let clock = normalizeDashboardClockPreferences(config?.clock);
    let enabled = config?.show?.clock !== false;
    let clockRevision = 0, showRevision = 0, readRevision = 0;
    const apply = () => {
        // Refresh only clock visibility. Unrelated cards, drafts and providers
        // retain their existing state and DOM ownership.
        applyModuleVisibility({...window.localItabModuleVisibility, clock: enabled});
        if (enabled || clockComponentInstance) initializeClockComponent(clock);
        clockComponentInstance?.setEnabled(enabled);
    };
    const refresh = async () => {
        if (!storageManager.local?.get) return;
        const request = ++readRevision;
        const clockAtRead = clockRevision, showAtRead = showRevision;
        try {
            const raw = await storageManager.local.get(['clock', 'show']);
            if (request !== readRevision) return;
            // A synchronous event for either key owns that key over an older
            // read; unrelated-key events do not discard this fresh observation.
            if (clockAtRead === clockRevision) clock = normalizeDashboardClockPreferences(raw.clock);
            if (showAtRead === showRevision) enabled = raw.show?.clock !== false;
            apply();
        } catch (error) {
            console.warn('Clock preference refresh unavailable:', error);
        }
    };
    clockPreferenceRefresh = refresh;
    storageManager.onLocalChanged?.((changes, area) => {
        if (area !== 'local') return;
        let changed = false;
        if (Object.prototype.hasOwnProperty.call(changes, 'clock')) {
            ++clockRevision; clock = normalizeDashboardClockPreferences(changes.clock.newValue); changed = true;
        }
        if (Object.prototype.hasOwnProperty.call(changes, 'show')) {
            ++showRevision; enabled = changes.show.newValue?.clock !== false; changed = true;
        }
        if (changed) apply();
    });
    window.addEventListener('focus', refresh);
    // Subscribe first, then close the async dashboard-initialization read gap.
    refresh();
    return refresh;
}

function initializeClockComponent(clockConfig) {
    if (clockComponentInstance) {
        clockComponentInstance.updateConfig(clockConfig);
        return clockComponentInstance;
    }
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
    clockComponentInstance = new ClockComponent(clockConfig);
    clockComponentInstance.start();
    return clockComponentInstance;
}

/**
 * Clock Component Class
 * Handles time display, formatting, and real-time updates
 */
class ClockComponent {
    constructor(config) {
        this.config = config;
        this.enabled = true;
        this.intervalId = null;
        this.timeElement = document.getElementById('time-display');
        this.dateElement = document.getElementById('date-display');
        this.worldClocksElement = document.getElementById('world-clocks-card');
        this.worldClockRows = [];
        this.worldClockComparison = null;
        this.worldClockComparisonView = null;
        worldClockCopyOwner?.invalidateWorldClockCopy();
        worldClockCopyOwner?.clearWorldClockLocalDraft();
        worldClockCopyOwner = this;
        monthCalendarIntervalCopyOwner?.invalidateMonthCalendarIntervalCopy();
        monthCalendarIntervalCopyOwner = this;
        this.renderWorldClocks();
        this.createMonthCalendar();
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
        if (!this.enabled || document.hidden) { this.stop(); return; }
        // Refresh immediately, including after a device time-zone change on focus.
        this.updateDisplay();
        if (this.intervalId) return;
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
        this.updateWorldClocks(now);
        this.updateMonthCalendar(now);
    }

    // The date viewer belongs to this singleton and shares its existing tick.
    createMonthCalendar() {
        this.invalidateMonthCalendarIntervalCopy();
        this.calendarLabelsSet = false;
        this.calendarRenderKey = null;
        if (!window.MonthCalendar || !this.dateElement?.parentElement) return;
        const make = (tag, className) => {
            const node = document.createElement(tag);
            if (className) node.className = className;
            return node;
        };
        const details = make('details', 'month-calendar');
        const summary = make('summary');
        const panel = make('div', 'month-calendar-panel');
        const controls = make('div', 'month-calendar-controls');
        const previous = make('button');
        const today = make('button');
        const next = make('button');
        for (const button of [previous, today, next]) button.type = 'button';
        controls.append(previous, today, next);
        controls.addEventListener('keydown', event => {
            const activation = event.key === 'Enter' || event.key === ' ';
            if (event.isComposing || event.keyCode === 229 || (activation && event.repeat)) {
                event.preventDefault();
            }
        });
        // Keep editable controls outside the navigation activation guard so
        // composition and the select's native keyboard behavior stay intact.
        const editor = make('div', 'month-calendar-editor');
        const yearLabel = make('label');
        const yearText = make('span');
        const year = make('input');
        year.type = 'text';
        year.inputMode = 'numeric';
        year.autocomplete = 'off';
        const monthLabel = make('label');
        const monthText = make('span');
        const month = make('select');
        const monthOptions = Array.from({ length: 12 }, (_, index) => {
            const option = make('option');
            option.value = String(index);
            month.append(option);
            return option;
        });
        const jump = make('button');
        jump.type = 'button';
        const error = make('div', 'month-calendar-error');
        error.id = 'month-calendar-error';
        error.setAttribute('role', 'alert');
        error.hidden = true;
        for (const field of [year, month]) field.setAttribute('aria-describedby', error.id);
        yearLabel.append(yearText, year);
        monthLabel.append(monthText, month);
        editor.append(yearLabel, monthLabel, jump);
        const table = make('table');
        const caption = make('caption');
        const head = make('thead');
        const body = make('tbody');
        table.append(caption, head, body);
        const announcement = make('span', 'month-calendar-announcement');
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        const interval = {
            details: make('details', 'month-calendar-interval'), summary: make('summary'),
            fields: make('div', 'month-calendar-interval-fields'), hint: make('p', 'month-calendar-interval-hint'),
            start: make('input'), startText: make('span'), end: make('input'), endText: make('span'),
            startToday: make('button'), endToday: make('button'),
            calculate: make('button'), swap: make('button'), clear: make('button'), copy: make('button'), error: make('div', 'month-calendar-error'),
            result: make('div', 'month-calendar-interval-result'),
            copyStatus: make('div', 'month-calendar-interval-result'),
            startState: { composing: false, compositionEnter: false },
            endState: { composing: false, compositionEnter: false }, invalid: false, resultValue: null
        };
        interval.hint.id = 'month-calendar-interval-hint';
        interval.error.id = 'month-calendar-interval-error';
        interval.error.setAttribute('role', 'alert');
        interval.error.hidden = true;
        interval.result.setAttribute('role', 'status');
        interval.result.setAttribute('aria-live', 'polite');
        interval.result.setAttribute('aria-atomic', 'true');
        interval.result.textContent = '';
        interval.copyStatus.setAttribute('role', 'status');
        interval.copyStatus.setAttribute('aria-live', 'polite');
        interval.copyStatus.setAttribute('aria-atomic', 'true');
        interval.copyStatus.textContent = '';
        interval.copyStatus.hidden = true;
        for (const [field, labelText, todayButton] of [
            [interval.start, interval.startText, interval.startToday], [interval.end, interval.endText, interval.endToday]
        ]) {
            const endpoint = make('div', 'month-calendar-interval-endpoint');
            const label = make('label');
            field.type = 'text';
            field.autocomplete = 'off';
            field.placeholder = 'YYYY-MM-DD';
            field.setAttribute('aria-describedby', `${interval.hint.id} ${interval.error.id}`);
            label.append(labelText, field);
            todayButton.type = 'button';
            endpoint.append(label, todayButton);
            interval.fields.append(endpoint);
        }
        interval.calculate.type = 'button';
        interval.swap.type = 'button';
        interval.clear.type = 'button';
        interval.copy.type = 'button';
        interval.fields.append(interval.calculate, interval.swap, interval.clear, interval.copy);
        interval.details.append(interval.summary, interval.hint, interval.fields, interval.error, interval.result, interval.copyStatus);
        panel.append(controls, editor, error, table, announcement, interval.details);
        details.append(summary, panel);
        this.dateElement.parentElement.append(details);
        const view = { details, summary, panel, previous, today, next, caption, head, body, announcement,
            year, yearText, month, monthText, monthOptions, jump, error, interval, composing: false, compositionEnter: false };
        this.monthCalendar = view;
        const active = source => this.monthCalendar === view && this.isMonthCalendarActive(source);
        const intervalActive = source => interval.details.open && interval.details.contains(source) && active(source);
        const composing = () => view.composing || interval.startState.composing || interval.endState.composing;
        details.addEventListener('toggle', event => {
            if (event.target !== details || this.monthCalendar !== view || !details.isConnected) return;
            if (!details.open) { this.closeMonthCalendar(); return; }
            if (!active(summary)) { this.closeMonthCalendar(); return; }
            // Native toggle events may coalesce. Reinitialize the draft on every
            // opening, even when the table's same-month render key is unchanged.
            const now = new Date();
            this.calendarMonth = window.MonthCalendar.localTuple(now);
            this.syncMonthCalendarDraft();
            this.clearMonthCalendarInterval();
            this.updateMonthCalendar(now);
        });
        const navigate = (delta, source) => {
            if (!active(source)) return;
            const ownedFocus = document.activeElement === source;
            const now = new Date();
            const current = this.calendarMonth || window.MonthCalendar.localTuple(now);
            this.calendarMonth = delta === 0 ? window.MonthCalendar.localTuple(now)
                : window.MonthCalendar.shift(current.year, current.month, delta);
            this.syncMonthCalendarDraft();
            this.updateMonthCalendar(now);
            announcement.textContent = caption.textContent;
            // At the supported year edges, the invoking control becomes disabled.
            // Keep keyboard focus in the viewer without moving it on passive ticks.
            if (ownedFocus && source.disabled && today.getClientRects().length) today.focus();
        };
        previous.addEventListener('click', () => navigate(-1, previous));
        next.addEventListener('click', () => navigate(1, next));
        today.addEventListener('click', () => navigate(0, today));
        const showDraft = source => {
            if (!active(source) || composing()) return;
            const target = window.MonthCalendar.parseMonthDraft(year.value, month.value);
            this.setMonthCalendarError(!target);
            if (!target) return;
            this.calendarMonth = target;
            this.updateMonthCalendar(new Date());
            announcement.textContent = caption.textContent;
        };
        jump.addEventListener('click', () => showDraft(jump));
        // Shared keyboard convention, with independent state for each draft field.
        const bindDraftField = (field, state, isActive, submit) => {
            field.addEventListener('compositionstart', () => {
                if (!isActive(field)) return;
                state.composing = true;
                state.compositionEnter = false;
            });
            // Releases also clear old state after hiding, closing or replacement.
            field.addEventListener('compositionend', () => { state.composing = false; });
            field.addEventListener('blur', () => { state.composing = false; state.compositionEnter = false; });
            field.addEventListener('keyup', () => { state.compositionEnter = false; });
            field.addEventListener('keydown', event => {
                if (!isActive(field) || event.defaultPrevented) return;
                if (composing() || event.isComposing || event.keyCode === 229) {
                    if (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter' ||
                        event.keyCode === 13) state.compositionEnter = true;
                    return;
                }
                if (event.key !== 'Enter') { state.compositionEnter = false; return; }
                if (state.compositionEnter || event.repeat) return;
                event.preventDefault();
                submit(field);
            });
        };
        const guardActivation = (button, isActive) => button.addEventListener('keydown', event => {
            if (!isActive(button)) return;
            if ((event.key === 'Enter' || event.key === ' ') &&
                (event.repeat || composing() || event.isComposing || event.keyCode === 229)) event.preventDefault();
        });
        bindDraftField(year, view, active, showDraft);
        guardActivation(jump, active);
        const calculate = source => {
            if (!intervalActive(source) || composing() ||
                !intervalActive(interval.start) || !intervalActive(interval.end)) return;
            this.invalidateMonthCalendarIntervalCopy();
            const days = window.MonthCalendar.dateInterval(interval.start.value, interval.end.value);
            interval.invalid = days === null;
            interval.resultValue = days === null ? null : { start: interval.start.value, end: interval.end.value, days };
            this.updateMonthCalendarInterval();
        };
        interval.calculate.addEventListener('click', () => calculate(interval.calculate));
        interval.swap.addEventListener('click', event => {
            if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 ||
                composing() || !this.isMonthCalendarIntervalActive(view, [interval.swap, interval.start, interval.end])) return;
            // Treat this as a draft edit: exchange exact raw text, never parse or calculate.
            const start = interval.start.value;
            interval.start.value = interval.end.value;
            interval.end.value = start;
            this.invalidateMonthCalendarIntervalCopy();
            interval.invalid = false;
            interval.resultValue = null;
            this.updateMonthCalendarInterval();
        });
        // This explicit draft edit retains the open disclosures and month draft.
        // Bind it to its original nodes so stale callbacks cannot edit replacements.
        const clearDates = interval.clear, clearStart = interval.start, clearEnd = interval.end;
        const clearFields = interval.fields, clearDetails = interval.details;
        const clearStartLabel = clearStart.parentElement, clearEndLabel = clearEnd.parentElement;
        const clearStartEndpoint = clearStartLabel.parentElement, clearEndEndpoint = clearEndLabel.parentElement;
        const clearParent = details.parentElement;
        const clearActive = () => view.interval === interval && view.details === details && view.panel === panel &&
            interval.clear === clearDates && interval.start === clearStart && interval.end === clearEnd &&
            interval.fields === clearFields && interval.details === clearDetails &&
            clearDates.parentElement === clearFields && clearStart.parentElement === clearStartLabel &&
            clearEnd.parentElement === clearEndLabel && clearStartLabel.parentElement === clearStartEndpoint &&
            clearEndLabel.parentElement === clearEndEndpoint && clearStartEndpoint.parentElement === clearFields &&
            clearEndEndpoint.parentElement === clearFields && clearFields.parentElement === clearDetails &&
            clearDetails.parentElement === panel && panel.parentElement === details && details.parentElement === clearParent &&
            [clearDates, clearStart, clearEnd, clearStartLabel, clearEndLabel, clearStartEndpoint, clearEndEndpoint,
                clearFields, clearDetails, panel, details, clearParent].every(node => node.ownerDocument === document) &&
            this.isMonthCalendarIntervalActive(view, [clearDates, clearStart, clearEnd]);
        clearDates.addEventListener('click', event => {
            if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 ||
                composing() || !clearActive()) return;
            clearStart.value = '';
            clearEnd.value = '';
            this.invalidateMonthCalendarIntervalCopy();
            interval.invalid = false;
            interval.resultValue = null;
            this.updateMonthCalendarInterval();
        });
        guardActivation(clearDates, clearActive);
        for (const [button, field] of [[interval.startToday, interval.start], [interval.endToday, interval.end]]) {
            button.addEventListener('click', event => {
                if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229 ||
                    composing() || !this.isMonthCalendarIntervalActive(view, [button, interval.start, interval.end])) return;
                let today;
                try {
                    // Capture local Gregorian components on each activation, never the
                    // browsed month, an open-time snapshot or a UTC ISO date.
                    const { year, month, day } = window.MonthCalendar.localTuple(new Date());
                    if (!Number.isInteger(year) || year < 1 || year > 9999) return;
                    today = `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                } catch (_) { return; } // An invalid device clock leaves the draft intact.
                field.value = today;
                this.invalidateMonthCalendarIntervalCopy();
                interval.invalid = false;
                interval.resultValue = null;
                this.updateMonthCalendarInterval();
            });
            guardActivation(button, intervalActive);
        }
        interval.copy.addEventListener('click', event => this.copyMonthCalendarInterval(view, event));
        for (const [field, state] of [[interval.start, interval.startState], [interval.end, interval.endState]]) {
            bindDraftField(field, state, intervalActive, calculate);
            const edited = () => {
                if (!intervalActive(field)) return;
                this.invalidateMonthCalendarIntervalCopy();
                interval.invalid = false;
                interval.resultValue = null;
                this.updateMonthCalendarInterval();
            };
            field.addEventListener('input', edited);
            field.addEventListener('change', edited);
        }
        guardActivation(interval.calculate, intervalActive);
        guardActivation(interval.swap, intervalActive);
        guardActivation(interval.copy, intervalActive);
        guardActivation(interval.summary, active);
        interval.details.addEventListener('toggle', event => {
            if (event.target !== interval.details || this.monthCalendar !== view || !details.isConnected) return;
            // Folding this tool retains its draft/result within the open calendar.
            if (!interval.details.open) {
                this.invalidateMonthCalendarIntervalCopy();
                for (const state of [interval.startState, interval.endState]) {
                    state.composing = false;
                    state.compositionEnter = false;
                }
            }
        });
        details.addEventListener('keydown', event => {
            // A select owns Escape for its native popup; do not steal it.
            if (event.key !== 'Escape' || event.target === month || event.defaultPrevented ||
                composing() || event.isComposing || event.keyCode === 229 ||
                !active(event.target)) return;
            event.preventDefault();
            event.stopPropagation();
            this.closeMonthCalendar();
            if (this.enabled && this.isMonthCalendarVisible(summary)) summary.focus();
        });
    }

    isMonthCalendarVisible(node) {
        return Boolean(node?.isConnected && !node.closest('[hidden], [inert], [aria-hidden="true"]') &&
            node.getClientRects().length && !['hidden', 'collapse'].includes(window.getComputedStyle?.(node)?.visibility));
    }

    isMonthCalendarActive(source) {
        const view = this.monthCalendar;
        return Boolean(view && this.enabled && !document.hidden && view.details.open && view.details.isConnected &&
            view.details.contains(source) && !source.disabled && !document.body.classList.contains('dashboard-hidden') &&
            this.isMonthCalendarVisible(view.panel) && this.isMonthCalendarVisible(source));
    }

    setMonthCalendarError(invalid) {
        const view = this.monthCalendar;
        view.error.hidden = !invalid;
        view.error.textContent = invalid ? this.worldClockText('monthCalendarInvalid',
            'Enter a year from 1 to 9999 using 1–4 digits (0–9), and choose a month.') : '';
        view.year.setAttribute('aria-invalid', String(invalid && !window.MonthCalendar.parseMonthDraft(view.year.value, '0')));
        view.month.setAttribute('aria-invalid', String(invalid && !window.MonthCalendar.parseMonthDraft('1', view.month.value)));
    }

    syncMonthCalendarDraft() {
        const view = this.monthCalendar;
        view.year.value = this.calendarMonth ? String(this.calendarMonth.year) : '';
        view.month.value = this.calendarMonth ? String(this.calendarMonth.month) : '';
        view.composing = false;
        view.compositionEnter = false;
        this.setMonthCalendarError(false);
    }

    clearMonthCalendarInterval() {
        this.invalidateMonthCalendarIntervalCopy();
        const interval = this.monthCalendar.interval;
        interval.details.open = false;
        interval.start.value = '';
        interval.end.value = '';
        interval.invalid = false;
        interval.resultValue = null;
        for (const state of [interval.startState, interval.endState]) {
            state.composing = false;
            state.compositionEnter = false;
        }
        this.updateMonthCalendarInterval();
    }

    updateMonthCalendarInterval() {
        const interval = this.monthCalendar.interval;
        interval.error.hidden = !interval.invalid;
        interval.error.textContent = interval.invalid ? this.worldClockText('monthCalendarIntervalInvalid',
            'Enter two valid dates as YYYY-MM-DD using digits 0–9, with years 0001–9999.') : '';
        for (const field of [interval.start, interval.end]) {
            field.setAttribute('aria-invalid', String(interval.invalid && !window.MonthCalendar.parseDateDraft(field.value)));
        }
        const value = interval.resultValue;
        const unit = value && Math.abs(value.days) === 1
            ? this.worldClockText('monthCalendarIntervalDay', 'calendar day')
            : this.worldClockText('monthCalendarIntervalDays', 'calendar days');
        const text = value ? `${value.start} → ${value.end}: ${value.days > 0 ? '+' : ''}${value.days} ${unit}` : '';
        const rendered = interval.renderedResult;
        if (!rendered || rendered.value !== value || rendered.text !== text || rendered.start !== value?.start ||
            rendered.end !== value?.end || rendered.days !== value?.days) {
            this.invalidateMonthCalendarIntervalCopy();
            interval.renderedResult = value ? { value, start: value.start, end: value.end, days: value.days, text } : null;
        }
        // A passive tick/navigation must not invalidate an unchanged copy receipt.
        if (interval.result.textContent !== text) interval.result.textContent = text;
        this.refreshMonthCalendarIntervalCopyControl();
    }

    monthCalendarIntervalCopyLabels() {
        return [this.getDateLocale(), navigator.language,
            this.worldClockText('monthCalendarIntervalDay', 'calendar day'),
            this.worldClockText('monthCalendarIntervalDays', 'calendar days'),
            this.worldClockText('monthCalendarIntervalCopy', 'Copy result'),
            this.worldClockText('monthCalendarIntervalCopying', 'Copying result…'),
            this.worldClockText('monthCalendarIntervalCopySuccess', 'Result copied.'),
            this.worldClockText('monthCalendarIntervalCopyFailure', 'Could not copy. Select the result text and press Ctrl/Cmd+C to copy it manually.')];
    }

    refreshMonthCalendarIntervalCopyControl() {
        const view = this.monthCalendar;
        if (!view) return;
        const disabled = String(Boolean(monthCalendarIntervalCopyAttempt) || !this.isMonthCalendarIntervalCopyCurrent(view, view.interval.renderedResult));
        if (view.interval.copy.getAttribute('aria-disabled') !== disabled) view.interval.copy.setAttribute('aria-disabled', disabled);
    }

    invalidateMonthCalendarIntervalCopy() {
        const receipt = this.monthCalendarIntervalCopyReceipt;
        if (receipt) {
            receipt.valid = false;
            receipt.cleanup();
            this.monthCalendarIntervalCopyReceipt = null;
            // A dispatched system write cannot be cancelled; only its settlement unlocks.
        }
        const status = this.monthCalendar?.interval.copyStatus;
        if (status) {
            if (status.textContent !== '') status.textContent = '';
            if (!status.hidden) status.hidden = true;
            status.classList.remove('is-error');
        }
    }

    isMonthCalendarIntervalActive(view, elements) {
        if (monthCalendarIntervalCopyOwner !== this || this.monthCalendar !== view ||
            !this.enabled || document.hidden || document.visibilityState === 'hidden' ||
            window.LocalItabContentLifecycle?.departing || document.body.classList.contains('dashboard-hidden')) return false;
        return elements.every(element => {
            if (!element.isConnected || !view.details.contains(element) || !view.interval.details.contains(element) ||
                element.disabled || !element.getClientRects().length) return false;
            for (let node = element; node; node = node.parentElement) {
                const style = window.getComputedStyle?.(node);
                if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true' ||
                    style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility) ||
                    (node.tagName === 'DETAILS' && !node.open)) return false;
            }
            return true;
        });
    }

    isMonthCalendarIntervalCopyCurrent(view, rendered, labels = view.interval.copyLabels) {
        const interval = view.interval, value = interval.resultValue;
        if (!rendered || interval.renderedResult !== rendered || value !== rendered.value || interval.invalid ||
            value.start !== rendered.start || value.end !== rendered.end || value.days !== rendered.days ||
            interval.start.value !== rendered.start || interval.end.value !== rendered.end ||
            interval.result.textContent !== rendered.text || !rendered.text ||
            labels !== this.monthCalendarIntervalCopyLabels().join('\n')) return false;
        return this.isMonthCalendarIntervalActive(view, [interval.copy, interval.start, interval.end, interval.result]);
    }

    async copyMonthCalendarInterval(view, event) {
        const interval = view.interval, rendered = interval.renderedResult, text = rendered?.text;
        if (event.defaultPrevented || event.detail > 1 || event.isComposing || event.keyCode === 229 ||
            view.composing || interval.startState.composing || interval.endState.composing ||
            monthCalendarIntervalCopyAttempt || !this.isMonthCalendarIntervalCopyCurrent(view, rendered)) return;
        this.invalidateMonthCalendarIntervalCopy();
        const receipt = { valid: true, labels: interval.copyLabels };
        monthCalendarIntervalCopyAttempt = receipt;
        this.monthCalendarIntervalCopyReceipt = receipt;
        const cancel = () => {
            if (this.monthCalendarIntervalCopyReceipt === receipt) this.invalidateMonthCalendarIntervalCopy();
            else { receipt.valid = false; receipt.cleanup(); }
        };
        const nodes = [interval.copy, interval.start, interval.end, interval.result];
        const invalidating = records => records.some(record => record.type === 'attributes'
            ? nodes.some(node => record.target.contains(node))
            : nodes.some(node => record.target === node || node.contains(record.target) ||
                Array.from(record.removedNodes || []).some(removed => removed === node || removed.contains?.(node))));
        const observer = window.MutationObserver ? new window.MutationObserver(records => { if (invalidating(records)) cancel(); }) : null;
        receipt.cleanup = () => {
            observer?.disconnect();
            document.removeEventListener('visibilitychange', cancel, true);
            window.removeEventListener?.('blur', cancel);
            window.removeEventListener?.('pagehide', cancel);
        };
        const current = () => {
            if (observer && invalidating(observer.takeRecords())) cancel();
            return receipt.valid && this.monthCalendarIntervalCopyReceipt === receipt && rendered.text === text &&
                this.isMonthCalendarIntervalCopyCurrent(view, rendered, receipt.labels);
        };
        document.addEventListener('visibilitychange', cancel, true);
        window.addEventListener?.('blur', cancel);
        window.addEventListener?.('pagehide', cancel);
        observer?.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true,
            attributeFilter: ['hidden', 'inert', 'aria-hidden', 'style', 'class', 'open', 'disabled', 'value'] });
        interval.copyStatus.textContent = this.worldClockText('monthCalendarIntervalCopying', 'Copying result…');
        interval.copyStatus.hidden = false;
        interval.copyStatus.classList.remove('is-error');
        this.refreshMonthCalendarIntervalCopyControl();
        try {
            // Synchronous in this explicit activation: exact visible result, no recalculation/read/permission query.
            const clipboard = window.navigator?.clipboard;
            if (typeof clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
            await clipboard.writeText(text);
            if (current()) interval.copyStatus.textContent = this.worldClockText('monthCalendarIntervalCopySuccess', 'Result copied.');
        } catch (_) {
            if (current()) {
                interval.copyStatus.textContent = this.worldClockText('monthCalendarIntervalCopyFailure',
                    'Could not copy. Select the result text and press Ctrl/Cmd+C to copy it manually.');
                interval.copyStatus.classList.add('is-error');
            }
        } finally {
            if (!current()) cancel();
            if (monthCalendarIntervalCopyAttempt === receipt) monthCalendarIntervalCopyAttempt = null;
            monthCalendarIntervalCopyOwner?.refreshMonthCalendarIntervalCopyControl();
            // While valid feedback remains visible, retain exactly one guard session
            // so a settled receipt cannot return after transient hiding or replacement.
        }
    }

    closeMonthCalendar() {
        if (!this.monthCalendar) return;
        this.monthCalendar.details.open = false;
        this.monthCalendar.announcement.textContent = '';
        this.calendarMonth = null;
        this.syncMonthCalendarDraft();
        this.clearMonthCalendarInterval();
    }

    updateMonthCalendar(now) {
        const view = this.monthCalendar;
        if (!view || !view.details.isConnected) return;
        const locale = this.getDateLocale();
        const copyLabels = this.monthCalendarIntervalCopyLabels();
        if (view.interval.copyLabels !== copyLabels.join('\n')) {
            this.invalidateMonthCalendarIntervalCopy();
            view.interval.copyLabels = copyLabels.join('\n');
            if (view.interval.copy.textContent !== copyLabels[4]) view.interval.copy.textContent = copyLabels[4];
            this.updateMonthCalendarInterval();
        }
        const receipt = this.monthCalendarIntervalCopyReceipt;
        if (receipt && !this.isMonthCalendarIntervalCopyCurrent(view, view.interval.renderedResult, receipt.labels)) {
            this.invalidateMonthCalendarIntervalCopy();
        }
        this.refreshMonthCalendarIntervalCopyControl();
        if (this.calendarLabelLocale !== locale || !this.calendarLabelsSet) {
            view.summary.textContent = this.worldClockText('monthCalendar', 'Calendar');
            view.previous.textContent = this.worldClockText('monthCalendarPrevious', 'Previous');
            view.next.textContent = this.worldClockText('monthCalendarNext', 'Next');
            view.today.textContent = this.worldClockText('monthCalendarToday', 'Today');
            view.yearText.textContent = this.worldClockText('monthCalendarYear', 'Year');
            view.monthText.textContent = this.worldClockText('monthCalendarMonth', 'Month');
            view.jump.textContent = this.worldClockText('monthCalendarView', 'View');
            view.interval.summary.textContent = this.worldClockText('monthCalendarInterval', 'Date interval');
            view.interval.startText.textContent = this.worldClockText('monthCalendarIntervalStart', 'Start date');
            view.interval.endText.textContent = this.worldClockText('monthCalendarIntervalEnd', 'End date');
            view.interval.startToday.textContent = this.worldClockText('monthCalendarIntervalStartToday', 'Use today for start');
            view.interval.endToday.textContent = this.worldClockText('monthCalendarIntervalEndToday', 'Use today for end');
            view.interval.calculate.textContent = this.worldClockText('monthCalendarIntervalCalculate', 'Calculate');
            view.interval.swap.textContent = this.worldClockText('monthCalendarIntervalSwap', 'Swap dates');
            view.interval.clear.textContent = this.worldClockText('monthCalendarIntervalClear', 'Clear dates');
            view.interval.hint.textContent = this.worldClockText('monthCalendarIntervalHint',
                'YYYY-MM-DD. End minus start in calendar days: same date 0, next date +1. Not hours, workdays or an inclusive count.');
            this.updateMonthCalendarInterval();
            const monthNames = new Intl.DateTimeFormat(locale, { calendar: 'gregory', timeZone: 'UTC', month: 'long' });
            view.monthOptions.forEach((option, index) => {
                option.textContent = monthNames.format(window.MonthCalendar.utcDate(2000, index));
            });
            this.setMonthCalendarError(!view.error.hidden);
            this.calendarLabelLocale = locale;
            this.calendarLabelsSet = true;
        }
        if (!this.enabled || !view.details.open || document.hidden) return;
        if (!this.isMonthCalendarActive(view.summary)) { this.closeMonthCalendar(); return; }
        const today = window.MonthCalendar.localTuple(now);
        const current = this.calendarMonth || today;
        this.calendarMonth = current;
        const key = [current.year, current.month, today.year, today.month, today.day, locale].join('/');
        if (this.calendarRenderKey === key) return;
        const model = window.MonthCalendar.month(current.year, current.month, locale, today);
        view.caption.textContent = model.caption;
        view.previous.disabled = model.previousDisabled;
        view.next.disabled = model.nextDisabled;
        const heading = document.createElement('tr');
        for (const weekday of model.weekdays) {
            const cell = document.createElement('th');
            cell.setAttribute('scope', 'col');
            cell.setAttribute('aria-label', weekday.long);
            cell.textContent = weekday.short;
            heading.append(cell);
        }
        view.head.replaceChildren(heading);
        const rows = model.weeks.map(week => {
            const row = document.createElement('tr');
            for (const day of week) {
                const cell = document.createElement('td');
                if (day !== null) {
                    cell.textContent = String(day);
                    if (day === model.todayDay) cell.setAttribute('aria-current', 'date');
                }
                row.append(cell);
            }
            return row;
        });
        view.body.replaceChildren(...rows);
        this.calendarRenderKey = key;
    }

    // The optional card shares this clock's timer and visibility lifecycle.
    renderWorldClocks() {
        this.invalidateWorldClockCopy();
        const entries = window.WorldClocks?.safe(this.config.worldClocks) || [];
        this.worldClockRows = [];
        if (!this.worldClocksElement) return;
        const oldView = this.worldClockComparisonView;
        const focusKey = oldView && ['toggle', 'previous24', 'next24', 'range', 'copy', 'localInput', 'preview'].find(key => oldView[key] === document.activeElement);
        this.worldClocksElement.replaceChildren();
        if (!entries.length) {
            this.clearWorldClockLocalDraft();
            this.worldClockComparison = null;
            this.worldClockComparisonView = null;
        }
        window.localItabWorldClocksConfigured = entries.length > 0;
        if (entries.length) {
            const heading = document.createElement('h2');
            heading.id = 'world-clocks-heading';
            heading.className = 'world-clocks-heading';
            heading.textContent = this.worldClockText('worldClocks', 'World clocks');
            const list = document.createElement('ul');
            list.className = 'world-clocks-list';
            for (const entry of entries) {
                const row = document.createElement('li');
                row.className = 'world-clock-row';
                const label = document.createElement('span');
                label.className = 'world-clock-label';
                const reading = document.createElement('span');
                reading.className = 'world-clock-reading';
                const time = document.createElement('span');
                time.className = 'world-clock-time';
                const day = document.createElement('span');
                day.className = 'world-clock-day';
                reading.append(time, day);
                row.append(label, reading);
                list.appendChild(row);
                this.worldClockRows.push({ entry, label, time, day });
            }
            this.worldClocksElement.append(heading, list);
            this.createWorldClockComparison();
            this.updateWorldClocks(new Date());
            if (focusKey && (document.activeElement === document.body || document.activeElement === oldView[focusKey])) {
                this.worldClockComparisonView[focusKey].focus();
            }
        }
        if (window.localItabModuleVisibility) {
            applyModuleVisibility(window.localItabModuleVisibility);
        }
    }

    worldClockText(key, fallback, substitutions) {
        const text = window.i18n?.t(key, substitutions);
        return typeof text === 'string' && text && text !== key ? text : fallback;
    }

    worldClockDayLabel(dayDifference) {
        if (dayDifference === 0) return this.worldClockText('worldClockToday', 'Today');
        if (dayDifference === -1) return this.worldClockText('worldClockYesterday', 'Yesterday');
        if (dayDifference === 1) return this.worldClockText('worldClockTomorrow', 'Tomorrow');
        const signedDays = dayDifference > 0 ? `+${dayDifference}` : String(dayDifference);
        // worldClockDays receives a single already-signed $1 substitution.
        return this.worldClockText('worldClockDays', `${signedDays} days`, [signedDays]);
    }

    createWorldClockComparison() {
        if (!this.worldClockComparisonView) {
            const controls = document.createElement('div');
            controls.className = 'world-clock-comparison';
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.setAttribute('aria-controls', 'world-clock-comparison-panel');
            const panel = document.createElement('div');
            panel.id = 'world-clock-comparison-panel';
            const localLabel = document.createElement('label');
            const localInput = document.createElement('input');
            localInput.id = 'world-clock-local-input';
            localInput.type = 'datetime-local';
            localInput.step = '1';
            localInput.autocomplete = 'off';
            localLabel.htmlFor = localInput.id;
            const preview = document.createElement('button');
            preview.type = 'button';
            const localControls = document.createElement('div');
            localControls.className = 'world-clock-comparison-navigation';
            localControls.append(localInput, preview);
            const localHelp = document.createElement('p');
            localHelp.id = 'world-clock-local-help';
            const localError = document.createElement('p');
            localError.id = 'world-clock-local-error';
            localError.className = 'world-clock-comparison-copy-status is-error';
            localError.hidden = true;
            for (const field of [localInput, preview]) field.setAttribute('aria-describedby', `${localHelp.id} ${localError.id}`);
            const navigation = document.createElement('div');
            navigation.className = 'world-clock-comparison-navigation';
            const previous24 = document.createElement('button');
            const next24 = document.createElement('button');
            const stepHelp = document.createElement('p');
            stepHelp.id = 'world-clock-comparison-step-help';
            for (const button of [previous24, next24]) {
                button.type = 'button';
                button.setAttribute('aria-describedby', `${stepHelp.id} world-clock-comparison-reference`);
            }
            navigation.append(previous24, next24);
            const label = document.createElement('label');
            label.htmlFor = 'world-clock-comparison-range';
            const range = document.createElement('input');
            range.id = 'world-clock-comparison-range';
            range.type = 'range';
            range.min = '-1440';
            range.max = '1440';
            range.step = '15';
            const reference = document.createElement('p');
            reference.id = 'world-clock-comparison-reference';
            range.setAttribute('aria-describedby', reference.id);
            const copy = document.createElement('button');
            copy.type = 'button';
            copy.className = 'world-clock-comparison-copy';
            const copyStatus = document.createElement('p');
            copyStatus.className = 'world-clock-comparison-copy-status';
            copyStatus.setAttribute('role', 'status');
            copyStatus.setAttribute('aria-live', 'polite');
            copyStatus.setAttribute('aria-atomic', 'true');
            copyStatus.textContent = '';
            copyStatus.hidden = true;
            panel.append(localLabel, localControls, localHelp, localError, navigation, stepHelp, label, range, reference, copy, copyStatus);
            controls.append(toggle, panel);
            const view = { controls, toggle, panel, label, range, reference, copy, copyStatus,
                previous24, next24, stepHelp, stepComposing: false,
                localLabel, localInput, preview, localHelp, localError, localDraft: null, previewComposing: false };
            this.worldClockComparisonView = view;
            localInput.addEventListener('input', () => {
                if (!this.isWorldClockStepCurrent(view, localInput)) return;
                this.invalidateWorldClockCopy();
                const draft = view.localDraft;
                const zone = window.WorldClocks.deviceTimeZone();
                const justChanged = draft.seenZone !== zone;
                this.syncWorldClockLocalDraft();
                // A zone-change warning must be seen before a different edit can
                // acknowledge the new interpretation. An ABA zone change stays blocked.
                if (!justChanged && draft.zoneChanged && localInput.value !== draft.blockedValue) {
                    draft.zoneChanged = false;
                    draft.zone = zone;
                }
                draft.dirty = true;
                draft.error = draft.zoneChanged ? 'zone' : null;
                this.updateWorldClockLocalLabels();
            });
            localInput.addEventListener('compositionstart', () => {
                if (!this.isWorldClockStepCurrent(view, localInput)) return;
                view.localDraft.composing = true;
                view.localDraft.compositionEnter = false;
            });
            localInput.addEventListener('compositionend', () => { if (view.localDraft) view.localDraft.composing = false; });
            localInput.addEventListener('blur', () => {
                if (view.localDraft) { view.localDraft.composing = false; view.localDraft.compositionEnter = false; }
            });
            localInput.addEventListener('keyup', () => { if (view.localDraft) view.localDraft.compositionEnter = false; });
            localInput.addEventListener('keydown', event => {
                if (!this.isWorldClockStepCurrent(view, localInput) || event.defaultPrevented) return;
                const draft = view.localDraft;
                if (draft.composing || event.isComposing || event.keyCode === 229) {
                    if (event.key === 'Enter' || event.code === 'Enter' || event.code === 'NumpadEnter' || event.keyCode === 13) {
                        draft.compositionEnter = true;
                    }
                    return;
                }
                if (event.key !== 'Enter') { draft.compositionEnter = false; return; }
                if (draft.compositionEnter || event.repeat || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
                event.preventDefault();
                this.previewWorldClockLocalTime(view, localInput);
            });
            preview.addEventListener('compositionstart', () => {
                if (this.isWorldClockStepCurrent(view, preview)) view.previewComposing = true;
            });
            preview.addEventListener('compositionend', () => { view.previewComposing = false; });
            preview.addEventListener('blur', () => { view.previewComposing = false; });
            preview.addEventListener('keydown', event => {
                if (!this.isWorldClockStepCurrent(view, preview)) return;
                if (['Enter', ' '].includes(event.key) &&
                    (event.repeat || view.previewComposing || view.localDraft?.composing || event.isComposing || event.keyCode === 229)) event.preventDefault();
            });
            preview.addEventListener('click', event => {
                if (event.defaultPrevented || event.detail > 1 || event.repeat || event.isComposing || event.keyCode === 229) return;
                this.previewWorldClockLocalTime(view, preview);
            });
            for (const [button, direction] of [[previous24, -1], [next24, 1]]) {
                button.addEventListener('compositionstart', () => {
                    if (this.isWorldClockStepCurrent(view, button)) view.stepComposing = true;
                });
                button.addEventListener('compositionend', () => { view.stepComposing = false; });
                button.addEventListener('blur', () => { view.stepComposing = false; });
                button.addEventListener('keydown', event => {
                    if (!this.isWorldClockStepCurrent(view, button)) return;
                    if (['Enter', ' '].includes(event.key) &&
                        (event.repeat || view.stepComposing || event.isComposing || event.keyCode === 229)) event.preventDefault();
                });
                button.addEventListener('click', event => {
                    if (event.defaultPrevented || event.detail > 1 || event.repeat || view.stepComposing ||
                        event.isComposing || event.keyCode === 229 || !this.isWorldClockStepCurrent(view, button)) return;
                    const shiftMinutes = this.worldClockStepCandidate(direction);
                    if (shiftMinutes === null) return;
                    // Even an ABA step retires old feedback, without unlocking a system write.
                    this.invalidateWorldClockCopy();
                    this.worldClockComparison.shiftMinutes = shiftMinutes;
                    this.updateWorldClocks();
                });
            }
            copy.addEventListener('keydown', event => {
                if (['Enter', ' '].includes(event.key) && (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
            });
            copy.addEventListener('click', event => this.copyWorldClockComparison(view, event));
            toggle.addEventListener('click', () => {
                if (this.worldClockComparisonView !== view || !controls.isConnected || !this.enabled) return;
                this.invalidateWorldClockCopy();
                this.worldClockComparison = this.worldClockComparison ? null : { anchor: Date.now(), minutes: 0, shiftMinutes: 0 };
                view.stepComposing = false;
                this.clearWorldClockLocalDraft();
                this.updateWorldClocks(new Date());
            });
            range.addEventListener('input', () => {
                if (this.worldClockComparisonView !== view || !controls.isConnected || !this.enabled || !this.worldClockComparison) return;
                // Every edit retires the receipt, even an invalid/same-value/ABA edit.
                this.invalidateWorldClockCopy();
                const minutes = Number(range.value);
                if (!Number.isFinite(minutes)) return;
                this.worldClockComparison.minutes = Math.max(-1440, Math.min(1440, Math.round(minutes / 15) * 15));
                this.updateWorldClocks(new Date());
            });
        }
        this.worldClocksElement.append(this.worldClockComparisonView.controls);
        this.refreshWorldClockCopyControl();
    }

    clearWorldClockLocalDraft() {
        const view = this.worldClockComparisonView;
        if (!view) return;
        view.localDraft = null;
        view.previewComposing = false;
        if (this.worldClockComparison) delete this.worldClockComparison.localEntry;
        view.localInput.value = '';
        view.localError.textContent = '';
        view.localError.hidden = true;
        view.localInput.setAttribute('aria-invalid', 'false');
    }

    syncWorldClockLocalDraft(instant) {
        const view = this.worldClockComparisonView;
        if (!view || !this.worldClockComparison) return;
        const zone = window.WorldClocks.deviceTimeZone();
        const draft = view.localDraft ||= { zone, seenZone: zone, dirty: false, error: null,
            composing: false, compositionEnter: false, zoneChanged: false };
        if (draft.seenZone !== zone) {
            if (draft.dirty || draft.composing || document.activeElement === view.localInput) {
                draft.zoneChanged = true;
                draft.blockedValue = view.localInput.value;
                draft.error = 'zone';
            } else draft.zone = zone;
            draft.seenZone = zone;
        }
        if (instant && !draft.dirty && !draft.composing && !draft.zoneChanged && document.activeElement !== view.localInput) {
            const value = window.WorldClocks.localDateTimeValue(instant);
            if (view.localInput.value !== value) view.localInput.value = value;
        }
    }

    updateWorldClockLocalLabels() {
        const view = this.worldClockComparisonView;
        if (!view) return;
        const display = (node, text) => { if (node.textContent !== text) node.textContent = text; };
        display(view.localLabel, this.worldClockText('worldClockLocalInput', 'Device-local date and time'));
        display(view.preview, this.worldClockText('worldClockLocalPreview', 'Preview'));
        const zone = view.localDraft?.seenZone || window.WorldClocks.deviceTimeZone();
        display(view.localHelp, this.worldClockText('worldClockLocalHelp',
            `Enter a time in device zone ${zone}, then Preview to reset the comparison base. Seconds are optional (00 if omitted). Skipped local times are rejected; repeated times use the earlier occurrence. Edge dates are reserved.`, [zone]));
        const error = view.localDraft?.error;
        const message = error === 'zone'
            ? this.worldClockText('worldClockLocalZoneChanged', 'The device time zone changed. Your draft is kept. Edit the date or time again to use the new device zone, then Preview.')
            : this.worldClockText('worldClockLocalInvalid', 'Enter a valid local date and time within the comparison range. Skipped times and reserved edge dates cannot be previewed.');
        display(view.localError, error ? message : '');
        if (view.localError.hidden !== !error) view.localError.hidden = !error;
        view.localInput.setAttribute('aria-invalid', String(Boolean(error)));
    }

    previewWorldClockLocalTime(view, source) {
        if (!this.isWorldClockStepCurrent(view, source) || !this.isWorldClockStepCurrent(view, view.localInput) ||
            !this.isWorldClockStepCurrent(view, view.preview) || view.previewComposing || view.localDraft?.composing || view.localDraft?.compositionEnter) return;
        this.invalidateWorldClockCopy();
        const changedBeforeSubmit = view.localDraft?.seenZone !== window.WorldClocks.deviceTimeZone();
        this.syncWorldClockLocalDraft();
        const draft = view.localDraft;
        // A click can precede the next tick/focus refresh. Even a clean, unfocused
        // field still contains the old zone's wall time: never reinterpret it.
        if (changedBeforeSubmit) {
            draft.zoneChanged = true;
            draft.blockedValue = view.localInput.value;
            draft.error = 'zone';
        }
        if (draft.zoneChanged) { this.updateWorldClockLocalLabels(); return; }
        const date = window.WorldClocks.parseLocalDateTime(view.localInput.value);
        const anchor = date?.getTime();
        if (!Number.isSafeInteger(anchor) || anchor < Date.parse('0001-01-03T00:00:00.000Z') ||
            anchor > Date.parse('9999-12-29T23:59:59.999Z')) {
            draft.dirty = true;
            draft.error = 'invalid';
            this.updateWorldClockLocalLabels();
            return;
        }
        this.worldClockComparison = { anchor, minutes: 0, shiftMinutes: 0, localEntry: true };
        draft.dirty = false;
        draft.error = null;
        draft.zone = draft.seenZone;
        this.updateWorldClocks();
    }

    worldClockStepCandidate(direction) {
        const comparison = this.worldClockComparison;
        if (!comparison || ![-1, 1].includes(direction) || !Number.isSafeInteger(comparison.anchor) ||
            !Number.isSafeInteger(comparison.minutes) || Math.abs(comparison.minutes) > 1440 || comparison.minutes % 15 ||
            !Number.isSafeInteger(comparison.shiftMinutes) || comparison.shiftMinutes % 1440) return null;
        const shiftMinutes = comparison.shiftMinutes + direction * 1440;
        const totalMinutes = shiftMinutes + comparison.minutes;
        const elapsed = shiftMinutes * 60000;
        const base = comparison.anchor + elapsed;
        const totalElapsed = totalMinutes * 60000;
        const instant = comparison.anchor + totalElapsed;
        if (![shiftMinutes, totalMinutes, elapsed, totalElapsed, base, instant].every(Number.isSafeInteger) ||
            !Number.isFinite(new Date(instant).getTime())) return null;
        // Keep the entire ±24h slider window plus a full day for any IANA zone
        // inside Gregorian years 0001–9999, even after a device/configured-zone change.
        // Conservative UTC base edges avoid BCE/extended-year reference ambiguity
        // and the shared civil-midnight helper's Date-range overflow.
        if (base < Date.parse('0001-01-03T00:00:00.000Z') ||
            base > Date.parse('9999-12-29T23:59:59.999Z')) return null;
        return shiftMinutes;
    }

    isWorldClockStepCurrent(view, button) {
        if (worldClockCopyOwner !== this || this.worldClockComparisonView !== view || !this.worldClockComparison ||
            !this.enabled || document.hidden || document.visibilityState === 'hidden' ||
            window.LocalItabContentLifecycle?.departing || document.body.classList.contains('dashboard-hidden') ||
            !this.worldClocksElement?.contains(button) || !view.panel.contains(button) || button.disabled ||
            button.getAttribute('aria-disabled') === 'true' || !button.isConnected || !button.getClientRects().length) return false;
        for (let node = button; node; node = node.parentElement) {
            const style = window.getComputedStyle?.(node);
            if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true' ||
                style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility) ||
                (node.tagName === 'DETAILS' && !node.open)) return false;
        }
        return true;
    }

    refreshWorldClockCopyControl() {
        this.worldClockComparisonView?.copy.setAttribute('aria-disabled', String(Boolean(worldClockCopyAttempt)));
    }

    invalidateWorldClockCopy() {
        const attempt = worldClockCopyAttempt;
        if (attempt?.owner === this) {
            attempt.valid = false;
            attempt.cleanup();
            // Only the UI is cancelled. Never release an unresolved system write.
        }
        const status = this.worldClockComparisonView?.copyStatus;
        if (status) {
            status.textContent = '';
            status.hidden = true;
            status.classList.remove('is-error');
        }
    }

    worldClockComparisonSummary(view) {
        if (!view || !this.worldClockRows.length) return null;
        const lines = this.worldClockRows.map(({ label, time, day }) => [label.textContent, time.textContent, day.textContent]);
        if (typeof view.reference.textContent !== 'string' || !view.reference.textContent.length ||
            lines.some(parts => parts.some(text => typeof text !== 'string' || !text.length))) return null;
        // Exactly the rendered text and order: no new instant, formatting or normalization.
        return [view.reference.textContent, ...lines.map(parts => parts.join(' · '))].join('\n');
    }

    isWorldClockCopyCurrent(view, text) {
        if (worldClockCopyOwner !== this || this.worldClockComparisonView !== view || !this.worldClockComparison ||
            !this.enabled || document.hidden || document.visibilityState === 'hidden' ||
            window.LocalItabContentLifecycle?.departing || document.body.classList.contains('dashboard-hidden') ||
            !this.worldClocksElement?.contains(view.copy) || this.worldClockComparisonSummary(view) !== text || text === null) return false;
        const nodes = [view.copy, view.reference, ...this.worldClockRows.flatMap(row => [row.label, row.time, row.day])];
        return nodes.every(element => {
            if (!element.isConnected || !this.worldClocksElement.contains(element) || !element.getClientRects().length) return false;
            for (let node = element; node; node = node.parentElement) {
                const style = window.getComputedStyle?.(node);
                if (node.hidden || node.inert || node.getAttribute('aria-hidden') === 'true' ||
                    style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility) ||
                    (node.tagName === 'DETAILS' && !node.open)) return false;
            }
            return true;
        });
    }

    async copyWorldClockComparison(view, event) {
        const text = this.worldClockComparisonSummary(view);
        if (event.defaultPrevented || event.detail > 1 || worldClockCopyAttempt || !this.isWorldClockCopyCurrent(view, text)) return;
        const attempt = { owner: this, valid: true };
        worldClockCopyAttempt = attempt;
        const cancel = () => this.invalidateWorldClockCopy();
        const nodes = [view.copy, view.reference, ...this.worldClockRows.flatMap(row => [row.label, row.time, row.day])];
        // Remember transient hide/detach/text changes, even when restored before settlement.
        const invalidating = records => records.some(record => record.type === 'attributes'
            ? nodes.some(node => record.target.contains(node))
            : nodes.some(node => record.target === node || record.target.parentElement === node ||
                Array.from(record.removedNodes || []).some(removed => removed === node || removed.contains?.(node))));
        const observer = window.MutationObserver ? new window.MutationObserver(records => { if (invalidating(records)) cancel(); }) : null;
        attempt.cleanup = () => {
            observer?.disconnect();
            document.removeEventListener('visibilitychange', cancel, true);
            window.removeEventListener?.('blur', cancel);
            window.removeEventListener?.('pagehide', cancel);
        };
        const current = () => {
            if (observer && invalidating(observer.takeRecords())) cancel();
            return attempt.valid && worldClockCopyAttempt === attempt && this.isWorldClockCopyCurrent(view, text);
        };
        document.addEventListener('visibilitychange', cancel, true);
        window.addEventListener?.('blur', cancel);
        window.addEventListener?.('pagehide', cancel);
        observer?.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true,
            attributeFilter: ['hidden', 'inert', 'aria-hidden', 'style', 'class', 'open'] });
        view.copyStatus.textContent = this.worldClockText('worldClockCopying', 'Copying comparison…');
        view.copyStatus.hidden = false;
        view.copyStatus.classList.remove('is-error');
        this.refreshWorldClockCopyControl();
        try {
            // Synchronous call in this explicit activation; never read clipboard or permissions.
            const clipboard = window.navigator?.clipboard;
            if (typeof clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
            await clipboard.writeText(text);
            if (current()) view.copyStatus.textContent = this.worldClockText('worldClockCopySuccess', 'Comparison copied.');
        } catch (_) {
            if (current()) {
                view.copyStatus.textContent = this.worldClockText('worldClockCopyFailure', 'Could not copy. Select the comparison text and press Ctrl/Cmd+C to copy it manually.');
                view.copyStatus.classList.add('is-error');
            }
        } finally {
            if (!current()) cancel();
            attempt.cleanup();
            if (worldClockCopyAttempt === attempt) worldClockCopyAttempt = null;
            worldClockCopyOwner?.refreshWorldClockCopyControl();
        }
    }

    updateWorldClocks(now) {
        const comparison = this.worldClockComparison;
        // Elapsed minutes from one captured instant, never wall-clock setters:
        // crossing DST preserves the actual instant shared by every zone.
        const totalMinutes = comparison ? comparison.minutes + comparison.shiftMinutes : 0;
        const instant = comparison ? new Date(comparison.anchor + totalMinutes * 60000) : now;
        const view = this.worldClockComparisonView;
        const previousSummary = this.worldClockComparisonSummary(view);
        // Conditional DOM writes keep an unchanged fixed preview quiet on live ticks.
        const displayText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
        if (view) {
            const copyLabel = this.worldClockText('worldClockCopyAction', 'Copy comparison');
            const copyLocale = [this.getDateLocale(), navigator.language, copyLabel,
                this.worldClockText('worldClockCopying', 'Copying comparison…'),
                this.worldClockText('worldClockCopySuccess', 'Comparison copied.'),
                this.worldClockText('worldClockCopyFailure', 'Could not copy. Select the comparison text and press Ctrl/Cmd+C to copy it manually.')].join('\n');
            if (view.copyLocale !== copyLocale) this.invalidateWorldClockCopy();
            view.copyLocale = copyLocale;
            displayText(view.copy, copyLabel);
            view.toggle.textContent = comparison ? this.worldClockText('worldClockBackToNow', 'Back to now') : this.worldClockText('worldClockCompare', 'Compare times');
            view.toggle.setAttribute('aria-expanded', String(Boolean(comparison)));
            if (view.panel.hidden !== !comparison) view.panel.hidden = !comparison;
            view.label.textContent = this.worldClockText('worldClockCompareOffset', 'Time comparison: −24 to +24 hours (15-minute steps)');
            view.range.value = String(comparison?.minutes || 0);
            displayText(view.previous24, this.worldClockText('worldClockPrevious24', 'Back 24 hours'));
            displayText(view.next24, this.worldClockText('worldClockNext24', 'Forward 24 hours'));
            displayText(view.stepHelp, this.worldClockText('worldClockStepHelp',
                'Each step is 24 elapsed hours and keeps the slider offset. Daylight saving may change the local hour. Navigation stays within years 0001–9999, with edge dates reserved.'));
            for (const [button, direction] of [[view.previous24, -1], [view.next24, 1]]) {
                // aria-disabled keeps the invoking control focused at a navigation edge.
                const disabled = String(this.worldClockStepCandidate(direction) === null);
                if (button.getAttribute('aria-disabled') !== disabled) button.setAttribute('aria-disabled', disabled);
            }
            this.syncWorldClockLocalDraft(instant);
            this.updateWorldClockLocalLabels();
            if (comparison) {
                const date = instant.toLocaleDateString(this.getDateLocale(), { year: 'numeric', month: 'short', day: 'numeric' });
                const time = instant.toLocaleTimeString(navigator.language || undefined, {
                    hour: '2-digit', minute: '2-digit', ...(this.config.showSeconds ? { second: '2-digit' } : {}),
                    hour12: this.config.hour12, timeZoneName: 'short'
                });
                const offset = `${totalMinutes >= 0 ? '+' : ''}${totalMinutes}`;
                let reference = this.worldClockText('worldClockCompareReference', `Preview · Local: ${date}, ${time} · ${offset} min from start`, [date, time, offset]);
                if (comparison.localEntry) {
                    const zone = window.WorldClocks.localZoneDescription(instant);
                    const identity = `${zone.timeZone} · ${zone.offset}`;
                    reference = this.worldClockText('worldClockLocalReference',
                        `Preview · Local: ${date}, ${time} · ${identity} · ${offset} min from current comparison base`, [date, time, identity, offset]);
                }
                displayText(view.reference, reference);
                view.range.setAttribute('aria-valuetext', reference);
            }
        }
        for (const { entry, label, time, day } of this.worldClockRows) {
            // Match the main clock's time locale and resolve the device zone anew.
            const formatted = window.WorldClocks.format(entry, instant, this.config, navigator.language || undefined);
            displayText(label, formatted.label);
            if (time.textContent !== formatted.time) time.textContent = formatted.time;
            const difference = formatted.dayDifference;
            const relative = { '-1': ['worldClockPreviousDay', 'Previous day'], '0': ['worldClockSameDay', 'Same day'], '1': ['worldClockNextDay', 'Next day'] };
            const dayLabel = comparison && relative[difference] ? this.worldClockText(...relative[difference]) : this.worldClockDayLabel(difference);
            displayText(day, comparison ? `${dayLabel} · ${window.WorldClocks.calendarDate(entry, instant)}` : dayLabel);
        }
        if (previousSummary !== this.worldClockComparisonSummary(view)) this.invalidateWorldClockCopy();
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

        return date.toLocaleTimeString(navigator.language || undefined, options);
    }

    // Date words follow an explicit locale in the displayed translation catalog.
    // No saved date-locale option exists. Time formatting and quote placeholders are separate.
    getDateLocale() {
        let catalogLocale, messageLocale, uiLocale;
        try {
            catalogLocale = typeof chrome !== 'undefined' && chrome.i18n?.getMessage?.('dateFormattingLocale');
        } catch (_) {}
        try {
            messageLocale = typeof chrome !== 'undefined' && chrome.i18n?.getMessage?.('@@ui_locale');
            // Chrome's predefined message may use underscore-separated locale names.
            if (typeof messageLocale === 'string') messageLocale = messageLocale.replace(/_/g, '-');
        } catch (_) {}
        try {
            uiLocale = typeof chrome !== 'undefined' && chrome.i18n?.getUILanguage?.();
        } catch (_) {}
        const browserLocale = typeof navigator !== 'undefined' ? navigator.language : undefined;
        for (const locale of [catalogLocale, messageLocale, uiLocale, browserLocale]) {
            if (typeof locale !== 'string' || !locale.trim()) continue;
            try {
                new Intl.DateTimeFormat(locale);
                return locale;
            } catch (_) {}
        }
        return undefined;
    }

    /**
     * Format date with day of year and week number
     * @param {Date} date - Date object to format
     * @returns {string} - Formatted date string
     */
    formatDate(date) {
        const fullDate = date.toLocaleDateString(this.getDateLocale(), {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
        const dayOfYear = this.getDayOfYear(date);
        const weekNumber = this.getWeekNumber(date);

        const dayLabel = this.worldClockText('dayOfYear', `Day ${dayOfYear}`, [String(dayOfYear)]);
        const weekLabel = this.worldClockText('weekNumber', `Week ${weekNumber}`, [String(weekNumber)]);
        return `${fullDate} • ${dayLabel} • ${weekLabel}`;
    }

    /**
     * Calculate day of year (1-366)
     * @param {Date} date - Date object
     * @returns {number} - Day of year
     */
    getDayOfYear(date) {
        // Compare local calendar dates in UTC so DST cannot shorten or lengthen a day.
        const start = Date.UTC(date.getFullYear(), 0, 0);
        const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
        const diff = current - start;
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
    setEnabled(enabled) {
        if (!enabled) this.invalidateWorldClockCopy();
        this.enabled = enabled;
        if (enabled) this.resume();
        else {
            this.closeMonthCalendar();
            this.stop();
        }
    }

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.renderWorldClocks();
        this.updateDisplay();
    }
}



function initializeShortcutsComponent(linksConfig, layoutConfig, categoriesConfig, layoutBaseline, uiConfig) {
    const shortcutsContainer = document.getElementById('shortcuts-container');
    if (!shortcutsContainer) return;

    // Create shortcuts component
    const shortcutsComponent = new ShortcutsComponent(linksConfig, layoutConfig, categoriesConfig, layoutBaseline);
    shortcutsComponent.finderShortcutEnabled = uiConfig?.finderShortcutEnabled !== false;
    shortcutsComponent.render();
    window.addEventListener('resize', () => {
        if (!shortcutsComponent.layout.autoArrange) {
            shortcutsComponent._cancelFreeDrag?.();
            shortcutsComponent.applyVisibleTransformsFromPositions();
            shortcutsComponent.positionAddTile();
        }
    });

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
    if (!quoteContainer) return;

    if (quoteRefreshIntervalId) {
        clearInterval(quoteRefreshIntervalId);
        quoteRefreshIntervalId = null;
    }

    const renderQuote = () => {
        const formattedQuote = formatQuotePlaceholders(quote);
        quoteContainer.replaceChildren();
        const quoteText = document.createElement('div');
        quoteText.textContent = formattedQuote;
        quoteContainer.appendChild(quoteText);
        quoteContainer.style.display = 'block';
    };

    renderQuote();

    if (shouldQuoteRefreshEverySecond(quote)) {
        quoteRefreshIntervalId = setInterval(renderQuote, 1000);
    }
}

function shouldQuoteRefreshEverySecond(quote) {
    if (typeof quote !== 'string') {
        return false;
    }

    const matches = quote.match(/\$date\{([^}]*)\}/g);
    if (!matches) {
        return false;
    }

    return matches.some((match) => {
        const format = match.slice(6, -1);
        if (!format) {
            return false;
        }

        if (/[HhSs]/.test(format)) {
            return true;
        }

        if (/[Mm]/.test(format) && /[:：]/.test(format)) {
            return true;
        }

        return false;
    });
}

function formatQuotePlaceholders(quote) {
    if (typeof quote !== 'string') {
        return quote;
    }

    const now = new Date();
    return quote.replace(/\$date\{([^}]*)\}/g, (_, format) => formatDateString(format, now));
}

function formatDateString(format, date) {
    if (!format) {
        return '';
    }

    const parts = [];
    const pattern = /([A-Za-z])\1*/g;
    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(format)) !== null) {
        if (match.index > lastIndex) {
            parts.push({ type: 'text', value: format.slice(lastIndex, match.index) });
        }
        parts.push({ type: 'token', value: match[0], start: match.index, end: pattern.lastIndex });
        lastIndex = pattern.lastIndex;
    }

    if (lastIndex < format.length) {
        parts.push({ type: 'text', value: format.slice(lastIndex) });
    }

    let previousTemporalType = null;
    const colonLike = new Set([':', '：']);

    return parts.map((part) => {
        if (part.type !== 'token') {
            return part.value;
        }

        const token = part.value;
        const firstChar = token[0];
        const upper = firstChar.toUpperCase();
        const length = token.length;
        const nextChar = format[part.end] || '';
        const prevChar = part.start > 0 ? format[part.start - 1] : '';

        const padValue = (value) => {
            if (length <= 1) {
                return String(value);
            }
            return String(value).padStart(length, '0');
        };

        const resolveYear = () => {
            const year = date.getFullYear();
            if (length === 2) {
                return String(year).slice(-2);
            }
            return String(year).padStart(Math.max(length, 4), '0');
        };

        const resolveMonth = () => {
            const month = date.getMonth() + 1;
            return padValue(month);
        };

        const resolveDay = () => {
            const day = date.getDate();
            return padValue(day);
        };

        const resolveHour = () => {
            const hour = date.getHours();
            return padValue(hour);
        };

        const resolveMinute = () => {
            const minute = date.getMinutes();
            return padValue(minute);
        };

        const resolveSecond = () => {
            const second = date.getSeconds();
            return padValue(second);
        };

        switch (upper) {
            case 'Y': {
                previousTemporalType = 'year';
                return resolveYear();
            }
            case 'M': {
                let type = 'month';
                if (
                    previousTemporalType === 'hour' ||
                    previousTemporalType === 'minute' ||
                    colonLike.has(prevChar) ||
                    colonLike.has(nextChar)
                ) {
                    type = 'minute';
                }

                if (type === 'month') {
                    previousTemporalType = 'month';
                    return resolveMonth();
                }

                previousTemporalType = 'minute';
                return resolveMinute();
            }
            case 'D': {
                previousTemporalType = 'day';
                return resolveDay();
            }
            case 'H': {
                previousTemporalType = 'hour';
                return resolveHour();
            }
            case 'S': {
                previousTemporalType = 'second';
                return resolveSecond();
            }
            default: {
                const lower = upper.toLowerCase();
                if (lower === 'y') {
                    previousTemporalType = 'year';
                    return resolveYear();
                }
                if (lower === 'm') {
                    let type = 'month';
                    if (
                        previousTemporalType === 'hour' ||
                        previousTemporalType === 'minute' ||
                        colonLike.has(prevChar) ||
                        colonLike.has(nextChar)
                    ) {
                        type = 'minute';
                    }
                    if (type === 'month') {
                        previousTemporalType = 'month';
                        return resolveMonth();
                    }
                    previousTemporalType = 'minute';
                    return resolveMinute();
                }
                if (lower === 'd') {
                    previousTemporalType = 'day';
                    return resolveDay();
                }
                if (lower === 'h') {
                    previousTemporalType = 'hour';
                    return resolveHour();
                }
                if (lower === 's') {
                    previousTemporalType = 'second';
                    return resolveSecond();
                }

                return token;
            }
        }
    }).join('');
}


function applyUiPreferences(uiState) {
    if (!uiState) return;
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
        const padding = uiState.dashboardPadding;
        const normalizePadding = (value) => {
            if (typeof value !== 'number' || !Number.isFinite(value)) return null;
            return Math.max(0, Math.min(160, Math.round(value)));
        };
        let paddingValues = null;
        if (typeof padding === 'number' && Number.isFinite(padding)) {
            const clamped = normalizePadding(padding);
            if (clamped !== null) {
                paddingValues = { top: clamped, right: clamped, bottom: clamped, left: clamped };
            }
        } else if (padding && typeof padding === 'object') {
            paddingValues = {
                top: normalizePadding(padding.top),
                right: normalizePadding(padding.right),
                bottom: normalizePadding(padding.bottom),
                left: normalizePadding(padding.left)
            };
        }

        if (paddingValues && Object.values(paddingValues).some(v => v !== null)) {
            if (paddingValues.top !== null) {
                dashboard.style.setProperty('--dashboard-padding-top', `${paddingValues.top}px`);
            } else {
                dashboard.style.removeProperty('--dashboard-padding-top');
            }
            if (paddingValues.right !== null) {
                dashboard.style.setProperty('--dashboard-padding-right', `${paddingValues.right}px`);
            } else {
                dashboard.style.removeProperty('--dashboard-padding-right');
            }
            if (paddingValues.bottom !== null) {
                dashboard.style.setProperty('--dashboard-padding-bottom', `${paddingValues.bottom}px`);
            } else {
                dashboard.style.removeProperty('--dashboard-padding-bottom');
            }
            if (paddingValues.left !== null) {
                dashboard.style.setProperty('--dashboard-padding-left', `${paddingValues.left}px`);
            } else {
                dashboard.style.removeProperty('--dashboard-padding-left');
            }
        } else {
            dashboard.style.removeProperty('--dashboard-padding-top');
            dashboard.style.removeProperty('--dashboard-padding-right');
            dashboard.style.removeProperty('--dashboard-padding-bottom');
            dashboard.style.removeProperty('--dashboard-padding-left');
        }
    }

    document.body.classList.toggle('hide-shortcut-titles', uiState.showShortcutTitles === false);

    const shortcutsStyle = uiState.shortcutsStyle || {};
    if (dashboard) {
        const applyNumberVar = (name, value) => {
            if (typeof value === 'number' && Number.isFinite(value)) {
                dashboard.style.setProperty(name, `${Math.max(0, Math.round(value))}px`);
            } else {
                dashboard.style.removeProperty(name);
            }
        };
        applyNumberVar('--shortcuts-gap-x', shortcutsStyle.gapX);
        applyNumberVar('--shortcuts-gap-y', shortcutsStyle.gapY);

        if (typeof shortcutsStyle.iconSize === 'number' && Number.isFinite(shortcutsStyle.iconSize)) {
            const iconSize = Math.max(24, Math.min(96, Math.round(shortcutsStyle.iconSize)));
            dashboard.style.setProperty('--shortcut-icon-size', `${iconSize}px`);
            const iconFont = Math.max(12, Math.round(iconSize * 0.5));
            dashboard.style.setProperty('--shortcut-icon-font', `${iconFont}px`);
        } else {
            dashboard.style.removeProperty('--shortcut-icon-size');
            dashboard.style.removeProperty('--shortcut-icon-font');
        }

        if (typeof shortcutsStyle.titleSize === 'number' && Number.isFinite(shortcutsStyle.titleSize)) {
            const titleSize = Math.max(10, Math.min(24, Math.round(shortcutsStyle.titleSize)));
            dashboard.style.setProperty('--shortcut-title-size', `${titleSize}px`);
        } else {
            dashboard.style.removeProperty('--shortcut-title-size');
        }

        if (typeof shortcutsStyle.titleColor === 'string' && shortcutsStyle.titleColor.trim()) {
            dashboard.style.setProperty('--shortcut-title-color', shortcutsStyle.titleColor.trim());
        } else {
            dashboard.style.removeProperty('--shortcut-title-color');
        }
    }
}

function setupDashboardVisibilityToggle(uiConfig, baseline = null) {
    const session = ++dashboardVisibilitySession;
    ++dashboardVisibilityRequest;
    dashboardPreferenceBaseline = baseline ? {generation: baseline.generation, values: {}} : null;
    const defaults = (window.storageManager && storageManager.defaultConfig && storageManager.defaultConfig.ui)
        ? storageManager.defaultConfig.ui
        : { dashboardHidden: false, dashboardPadding: null, showShortcutTitles: true };

    currentUiState = { ...defaults, ...(uiConfig || {}) };
    dashboardHiddenState = !!currentUiState.dashboardHidden;
    dashboardSavedHiddenState = dashboardHiddenState;
    window.dashboardPreferenceView = {get pending() { return dashboardVisibilityPending > 0; }};
    applyDashboardHiddenState(dashboardHiddenState);
    applyUiPreferences(currentUiState);
    if (typeof window !== 'undefined') {
        window.dashboardHiddenState = dashboardHiddenState;
    }

    const dashboard = document.getElementById('dashboard');
    dashboardVisibilityOwner = dashboard;
    if (!dashboard) return;

    dashboard.addEventListener('dblclick', (event) => {
        if (session !== dashboardVisibilitySession || !shouldToggleFromEvent(event)) {
            return;
        }

        const selection = window.getSelection ? window.getSelection() : null;
        if (selection && selection.rangeCount) {
            selection.removeAllRanges?.();
        }

        event.preventDefault();
        const nextState = !dashboardHiddenState;
        return setDashboardHidden(nextState);
    });
}

function shouldToggleFromEvent(event) {
    const interactiveSelectors = 'button, a, input, textarea, select, summary, [contenteditable], .world-clocks-card, .month-calendar, .local-countdown-card, .local-tasks-card, .local-focus-card, .tasks-overlay, .local-scratchpad-card, .shortcut-item, .category-nav, .settings-button, .category-manage-btn, .shortcut-action-btn, .context-menu';
    if (!event || !event.target) return false;
    return !event.target.closest(interactiveSelectors);
}

function applyDashboardHiddenState(hidden) {
    if (hidden) clockComponentInstance?.closeMonthCalendar();
    document.body.classList.toggle('dashboard-hidden', !!hidden);
}

function setDashboardHidden(hidden) {
    if (window.localFocusView?.temporaryFocus) return Promise.resolve(false);
    if (hidden && window.localScratchpadView?.hasUncommittedWork()) return Promise.resolve(false);
    const owner = dashboardVisibilityOwner;
    const ownsView = () => owner?.isConnected && owner === document.getElementById('dashboard');
    if (!ownsView()) return Promise.resolve(false);
    const desired = !!hidden, session = dashboardVisibilitySession, request = ++dashboardVisibilityRequest;
    const baseline = dashboardPreferenceBaseline;
    dashboardHiddenState = desired;
    applyDashboardHiddenState(desired);
    window.dashboardHiddenState = desired;
    ++dashboardVisibilityPending;
    const operation = dashboardVisibilityQueue.then(async () => {
        if (session !== dashboardVisibilitySession || !ownsView()) return false;
        try {
            if (!window.storageManager || typeof storageManager.patchDashboardPreferences !== 'function') throw new Error('Safe preference saving unavailable');
            const committed = await storageManager.patchDashboardPreferences({dashboardHidden: desired}, baseline);
            if (!committed) throw new Error('Preference was not saved');
            if (session === dashboardVisibilitySession && ownsView()) {
                dashboardSavedHiddenState = committed.ui.dashboardHidden;
                currentUiState = {...currentUiState, dashboardHidden: dashboardSavedHiddenState};
            }
            return true;
        } catch (error) {
            if (session === dashboardVisibilitySession && ownsView() && request === dashboardVisibilityRequest) {
                dashboardHiddenState = dashboardSavedHiddenState;
                window.dashboardHiddenState = dashboardSavedHiddenState;
                applyDashboardHiddenState(dashboardSavedHiddenState);
                showErrorMessage(dashboardPreferenceMessage(error));
            }
            return false;
        }
    }).finally(() => { --dashboardVisibilityPending; });
    dashboardVisibilityQueue = operation.then(() => {});
    return operation;
}


/**
 * Shortcuts Component Class
 * Handles shortcuts grid display and CRUD operations
 */
class ShortcutsComponent {
    constructor(links, layout, categories = [], layoutBaseline) {
        this.layoutBaseline = layoutBaseline;
        this.links = links || [];
        this.categories = categories;
        this.container = document.getElementById('shortcuts-container');
        this.currentEditIndex = -1;
        this.modal = null;
        this.confirmDialog = null;
        this._closeModal = null;
        this._closeConfirmDialog = null;
        const defaultColumns = storageManager?.defaultConfig?.layout?.columns ?? 6;
        const defaultLayout = { autoArrange: true, alignToGrid: true, gridSize: 96, columns: defaultColumns, positions: {} };
        this.layout = JSON.parse(JSON.stringify({ ...defaultLayout, ...(layout || {}) }));
        this.defaultColumns = defaultLayout.columns;
        const sanitizedColumns = this.sanitizeColumns(this.layout.columns);
        this.layout.columns = sanitizedColumns ?? this.defaultColumns;
        this.positions = (this.layout && typeof this.layout.positions === 'object') ? this.layout.positions : {};
        if (!this.layout.positions || typeof this.layout.positions !== 'object') {
            this.layout.positions = this.positions;
        }
        this.identityPositions = this.layout.positionsById || {};
        this.gridEl = null;
        this.dragState = null;
        this._suppressClickUntil = 0;
        this._dragMoved = false;
        this._dragStartPos = null;
        this._isSaving = false;
        this._hasShortcutConflict = false;
        this._modalSession = 0;
        this._shortcutDraftBaseline = null;
        this._shortcutDraftRevision = 0;
        this._pendingSave = null;
        this._pendingDelete = false;
        this._shortcutUndoReceipt = null;
        this._shortcutUndoPending = false;
        this._modalFocusOrigin = null;
        this._shortcutMenuTargets = new WeakMap();
    }

    /**
     * Render the shortcuts component
     */
    render() {
        this._escapedFreeDragClick = null;
        this._cancelFreeDrag?.();
        if (!this.container) return;
        this.finderView?.destroy();
        this.organizerView?.destroy();
        this.navigationLibraryView?.destroy();

        const grid = document.createElement('div');
        grid.className = 'shortcuts-grid';
        grid.id = 'shortcuts-grid';
        grid.appendChild(this.buildShortcutsFragment());
        const header = document.createElement('div');
        header.className = 'shortcuts-header';
        const heading = document.createElement('h2');
        heading.className = 'shortcuts-title';
        heading.id = 'shortcuts-heading';
        header.appendChild(heading);
        if (window.LocalItabLayout) {
            const controls = document.createElement('div');
            controls.className = 'layout-controls';
            header.appendChild(controls);
            window.LocalItabLayout.mount(controls, this.ensureLayoutController(), {
                onSelect: value => this.setLayoutMode(value),
                onRetry: () => {
                    this._cancelFreeDrag?.();
                    this.cleanupDragState();
                    return this.ensureLayoutController().retry();
                }
            });
        }
        // Reuse the status controls so a routine render never creates another handler.
        const undo = this.createShortcutUndoBar();
        this.container.replaceChildren(header, this._shortcutUndoLiveStatus, undo, grid);
        if (this.layoutController) {
            const renderLayout = this.layoutController.render;
            this.layoutController.render = (...args) => {
                renderLayout(...args);
                this.refreshShortcutUndo();
            };
        }
        this.refreshShortcutUndo();
        this.finderView = window.LocalItabFinder?.mountForShortcuts(header, this);
        this.organizerView = window.LocalItabOrganizer?.mount(header, this);
        this.navigationLibraryView = window.LocalItabNavigationLibrary?.mount(header, this);
        this.updateCollectionVisibility();

        this.attachEventListeners();
        this.createModal();

        this.gridEl = document.getElementById('shortcuts-grid');
        window.shortcutsComponentInstance = this;
        window.categoryNavigation?.filterShortcuts({ reflow: false });
        this.updateCollectionVisibility();
        this.applyLayoutMode();
    }

    /**
     * Render shortcuts grid
     */
    usesCollections() {
        return this.layout?.autoArrange !== false && (window.LocalItabTemplates ? window.LocalItabTemplates.usesCollections(document.documentElement?.dataset?.dashboardTemplate) : ['graphite', 'folio'].includes(document.documentElement?.dataset?.dashboardTemplate));
    }

    buildShortcutsFragment() {
        const fragment = document.createDocumentFragment();
        this._renderedGrouping = this.usesCollections();
        if (!this.links.length) fragment.appendChild(this.createEmptyState());
        if (this._renderedGrouping) {
            const groups = new Map();
            for (const category of this.categories || []) {
                if (!groups.has(category.id)) groups.set(category.id, { ...category, entries: [] });
            }
            this.links.forEach((link, index) => {
                const id = link.category || 'work';
                if (!groups.has(id)) groups.set(id, { id, name: id, entries: [] });
                groups.get(id).entries.push({ link, index });
            });
            let number = 0;
            for (const group of groups.values()) {
                if (!group.entries.length) continue;
                const section = document.createElement('section');
                section.className = 'shortcut-collection';
                section.dataset.category = group.id;
                const heading = document.createElement('div');
                heading.className = 'shortcut-collection-heading';
                const ordinal = document.createElement('span');
                ordinal.className = 'collection-index';
                ordinal.setAttribute('aria-hidden', 'true');
                ordinal.textContent = String(++number).padStart(2, '0');
                const name = document.createElement('h3');
                name.textContent = group.name;
                name.id = `shortcut-collection-title-${number}`;
                section.setAttribute('aria-labelledby', name.id);
                const count = document.createElement('span');
                count.className = 'collection-count';
                count.textContent = String(group.entries.length);
                heading.append(ordinal, name, count);
                const items = document.createElement('div');
                items.className = 'shortcut-collection-items';
                for (const { link, index } of group.entries) items.appendChild(this.createShortcutItem(link, index));
                section.append(heading, items);
                fragment.appendChild(section);
            }
        } else {
            this.links.forEach((link, index) => fragment.appendChild(this.createShortcutItem(link, index)));
        }
        if (this.links.length) {
            const empty = document.createElement('div');
            empty.className = 'shortcuts-empty-state category-empty-state';
            empty.hidden = true;
            const text = document.createElement('p');
            text.textContent = window.i18n?.t('emptyCategory') || 'No shortcuts in this category yet.';
            const all = document.createElement('button');
            all.type = 'button';
            all.className = 'empty-action-btn';
            all.dataset.action = 'show-all';
            all.textContent = window.i18n?.t('showAllShortcuts') || 'Show all shortcuts';
            empty.append(text, all);
            fragment.appendChild(empty);
        }
        fragment.appendChild(this.createAddTile());
        return fragment;
    }

    updateCollectionVisibility() {
        const grid = this.gridEl || document.getElementById('shortcuts-grid');
        if (!grid) return;
        grid.querySelectorAll('.shortcut-collection').forEach(group => {
            group.hidden = !Array.from(group.querySelectorAll('.shortcut-item')).some(item => item.style.display !== 'none');
        });
        const visible = Array.from(grid.querySelectorAll('.shortcut-item:not(.add-shortcut)')).filter(item => item.style.display !== 'none').length;
        const empty = grid.querySelector('.category-empty-state');
        if (empty) empty.hidden = visible !== 0;
        const category = this.getCurrentCategory();
        const name = (this.categories || []).find(item => item.id === category)?.name;
        const title = category === 'all' ? (window.i18n?.t('allShortcuts') || 'All shortcuts') : name || category;
        setText(document.getElementById('shortcuts-heading'), `${title} · ${visible}`);
        window.categoryNavigation?.updateCounts?.(this.links);
    }

    canReuseCollections() {
        const grid = this.gridEl;
        // Rebuilding retires the target of an open menu, even if the template
        // later returns to its original value. Keep that invalidation path.
        if (!this._renderedGrouping || !this.usesCollections() || this._shortcutWritesPending ||
            document.querySelector('.context-menu') ||
            !grid?.isConnected || grid !== document.getElementById('shortcuts-grid')) return false;
        const category = this.getCurrentCategory();
        const tiles = Array.from(grid.querySelectorAll('.shortcut-item:not(.add-shortcut)'));
        if (tiles.length !== this.links.length || tiles.some(tile => {
            const source = tile.querySelector('[data-action="more"]');
            const saved = this._shortcutMenuTargets.get(source);
            return !saved || saved.item !== tile || Number(tile.dataset.index) !== saved.index ||
                Number(source.dataset.index) !== saved.index || !saved.isCurrent() ||
                (tile.style.display !== 'none') !== (category === 'all' || (this.links[saved.index].category || 'work') === category);
        })) return false;

        // Compare the live collection headers as well as the existing tile
        // records. No cached signature: local category edits must rebuild too.
        const groups = new Map();
        for (const category of this.categories || []) {
            if (!groups.has(category.id)) groups.set(category.id, { name: category.name, count: 0 });
        }
        for (const link of this.links) {
            const id = link.category || 'work';
            if (!groups.has(id)) groups.set(id, { name: id, count: 0 });
            groups.get(id).count++;
        }
        const expected = Array.from(groups).filter(([, group]) => group.count);
        const rendered = Array.from(grid.querySelectorAll('.shortcut-collection'));
        return rendered.length === expected.length && rendered.every((group, index) => {
            const [id, { name, count }] = expected[index];
            return group.dataset.category === id && group.querySelector('h3')?.textContent === name &&
                group.querySelector('.collection-count')?.textContent === String(count);
        });
    }

    beginTemplatePreview() {
        const layout = this.layoutController;
        if (this._templatePreview || this._shortcutWritesPending || this._pendingSave || this._pendingDelete ||
            this._shortcutOrderPending || this._shortcutUndoPending || this._isSaving ||
            this.modal?.classList.contains('active') || this.confirmDialog?.isConnected ||
            document.querySelector('.context-menu') || this.organizerView?.hasUncommittedWork?.() ||
            this.navigationLibraryView?.hasUncommittedWork?.() ||
            layout && (layout.pending || layout.timer || layout.modePending || layout.failedChange ||
                Object.keys(layout.positions).length || Object.keys(layout.identityPositions).length)) return false;
        this._cancelFreeDrag?.();
        this.cleanupDragState();
        const nodes = [this.container, document.getElementById('category-list')].filter(Boolean);
        this._templatePreview = { nodes: nodes.map(node => [node, node.inert]) };
        for (const node of nodes) node.inert = true;
        this.detachFreeDrag();
        return true;
    }

    endTemplatePreview() {
        if (!this._templatePreview) return;
        for (const [node, inert] of this._templatePreview.nodes) node.inert = inert;
        this._templatePreview = null;
        // No layout initialization here: preview never created coordinates that
        // should be flushed later. Resume ordinary gestures on the saved plane.
        if (!this.layout.autoArrange && !window.LocalItabIdentity?.needs(this.links)) this.attachFreeDrag();
    }

    refreshTemplate() {
        this._cancelFreeDrag?.();
        if (this.layout.autoArrange) {
            // Grouped styles share markup. Keep controls attached when both the
            // records and collection structure still match the current data.
            if (this.canReuseCollections()) {
                window.categoryNavigation?.filterShortcuts({ reflow: false });
                this.updateCollectionVisibility();
                this.applyLayoutMode();
            } else this.updateGrid();
        }
        else {
            // Manual tiles stay in the same flat plane. Repaint only: never
            // capture/replace a saved baseline merely to change the template.
            this.applyVisibleTransformsFromPositions();
            this.positionAddTile();
        }
    }

    getShortcutFocusKey(link) {
        return JSON.stringify([link?.url || '', link?.title || '', link?.category || 'work']);
    }

    createShortcutItem(link, index) {
        const item = document.createElement('div');
        item.className = 'shortcut-item';
        item.dataset.index = String(index);
        item.dataset.focusKey = this.getShortcutFocusKey(link);
        item.draggable = true;

        const content = document.createElement('button');
        content.type = 'button';
        content.className = 'shortcut-content shortcut-launch';
        content.dataset.action = 'open';
        content.dataset.index = String(index);
        content.draggable = true;
        content.setAttribute('aria-label', `${(window.i18n && i18n.t('openInNewTab')) || 'Open in new tab'}: ${link.title || link.url}`);

        const preview = this._templatePreview;
        this.appendShortcutContent(content, link, preview ? { cacheOnly: true,
            isCurrent: asynchronous => this.links[index] === link && (!asynchronous ||
                item.isConnected && this.gridEl === document.getElementById('shortcuts-grid') && this.gridEl.contains(item)) } : {});

        const actions = document.createElement('div');
        actions.className = 'shortcut-actions';
        const more = this.createShortcutAction('more', index, window.i18n?.t('shortcutMoreActions') || 'More actions', '⋯');
        more.draggable = false;
        more.setAttribute('aria-haspopup', 'menu');
        more.setAttribute('aria-expanded', 'false');
        // Keep the rendered record, not just its reusable array index. A detached
        // or superseded tile must never open actions for a different shortcut.
        const fields = ['title', 'url', 'icon', 'category', 'layoutId'];
        const values = fields.map(field => link[field]);
        this._shortcutMenuTargets.set(more, { item, index,
            isCurrent: () => this.links[index] === link && fields.every((field, slot) => link[field] === values[slot]) });
        actions.append(more);

        item.append(content, actions);
        return item;
    }

    appendShortcutContent(content, link, options = {}) {
        const icon = document.createElement('span');
        icon.className = 'shortcut-icon';
        icon.setAttribute('aria-hidden', 'true');
        this.setShortcutIconContent(icon, link.icon || '🌐', link.url, options);
        const title = document.createElement('span');
        title.className = 'shortcut-title';
        title.textContent = link.title || '';
        content.append(icon, title);
    }

    normalizedShortcutDraft() {
        const [title, rawUrl, icon, category] = this.readShortcutDraft();
        let url = '';
        // An unchanged field is the stored identity, including historical URL
        // spelling. Only an explicitly edited/new URL takes the input policy.
        const original = this.links[this.currentEditIndex];
        if (original && rawUrl === original.url) url = rawUrl;
        else try { url = normalizeHttpUrl(rawUrl.trim()); } catch (_) {}
        // Category options carry IDs, not free text. Preserve the exact chosen
        // value, including whitespace, only when it is an actual option.
        const categoryOptions = this.modal?.querySelector('#shortcut-category')?.querySelectorAll?.('option') || [];
        const selectedCategory = category && Array.from(categoryOptions).some(option => option.value === category);
        return { title: title.trim(), url, icon: icon.trim() || '🌐',
            category: selectedCategory ? category : (category || 'work').trim() };
    }

    updateShortcutPreview() {
        const modal = this.modal;
        const preview = modal?.querySelector('#shortcut-edit-preview');
        if (!preview) return;
        // User size/color overrides live on #dashboard, outside this dialog.
        // Copy only content variables; never pretend to mirror the grid layout.
        const dashboard = document.getElementById('dashboard');
        const style = dashboard && window.getComputedStyle?.(dashboard);
        for (const name of ['--shortcut-icon-size', '--shortcut-icon-font', '--shortcut-title-size', '--shortcut-title-color']) {
            const value = style?.getPropertyValue?.(name)?.trim();
            if (value) preview.style.setProperty(name, value);
            else preview.style.removeProperty(name);
        }
        const revision = this._shortcutPreviewRevision = (this._shortcutPreviewRevision || 0) + 1;
        const session = this._modalSession;
        const draft = this.readShortcutDraft();
        const isCurrent = () => this.modal === modal && this._modalSession === session &&
            this._shortcutPreviewRevision === revision && modal.classList.contains('active') &&
            this.readShortcutDraft().slice(0, 3).every((value, index) => value === draft[index]);
        const hiddenNote = modal.querySelector('#shortcut-preview-hidden');
        if (hiddenNote) hiddenNote.hidden = !document.body.classList.contains('hide-shortcut-titles');
        preview.replaceChildren();
        this.appendShortcutContent(preview, this.normalizedShortcutDraft(), { cacheOnly: true, isCurrent });
    }

    createShortcutAction(action, index, title, label) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `shortcut-action-btn ${action}`;
        button.dataset.action = action;
        button.dataset.index = String(index);
        button.title = title;
        button.setAttribute('aria-label', `${title}: ${this.links[index]?.title || this.links[index]?.url || ''}`);
        button.textContent = label;
        return button;
    }

    createEmptyState() {
        const empty = document.createElement('div');
        empty.className = 'shortcuts-empty-state';

        const icon = document.createElement('div');
        icon.className = 'empty-icon';
        icon.textContent = '⌂';

        const text = document.createElement('div');
        text.className = 'empty-text';
        text.textContent = (window.i18n && i18n.t('emptyShortcuts')) || 'Your local start page is empty.';

        const actions = document.createElement('div');
        actions.className = 'empty-actions';
        [
            ['open-add', (window.i18n && i18n.t('addShortcut')) || 'Add Shortcut'],
            ['create-starter-set', (window.i18n && i18n.t('createStarterSet')) || 'Create Starter Set'],
            ['open-import', (window.i18n && i18n.t('importSettings')) || 'Import Settings']
        ].forEach(([action, label]) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'empty-action-btn';
            button.dataset.action = action;
            button.textContent = label;
            actions.appendChild(button);
        });

        empty.append(icon, text, actions);
        return empty;
    }

    createAddTile() {
        const item = document.createElement('button');
        item.type = 'button';
        item.setAttribute('aria-label', (window.i18n && i18n.t('addShortcut')) || 'Add Shortcut');
        item.className = 'shortcut-item add-shortcut';
        item.dataset.action = 'open-add';
        item.draggable = false;

        const content = document.createElement('span');
        content.className = 'shortcut-content';
        const icon = document.createElement('span');
        icon.className = 'shortcut-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '+';
        const title = document.createElement('span');
        title.className = 'shortcut-title';
        title.textContent = (window.i18n && i18n.t('addShortcut')) || 'Add Shortcut';
        content.append(icon, title);
        item.appendChild(content);
        return item;
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
            grid.addEventListener('keydown', (e) => this.handleGridKeydown(e));
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
    handleGridKeydown(event) {
        // Let native buttons provide Enter/Space activation, without held-Enter cascades.
        if (event.key === 'Enter' && event.repeat && event.target.closest('button')) event.preventDefault();
        if (event.target.closest('[data-action="open-import"], [data-action="more"]') && ['Enter', ' '].includes(event.key) &&
            (event.repeat || event.isComposing || event.keyCode === 229)) event.preventDefault();
    }

    handleGridClick(e) {
        if (this._templatePreview) { e.preventDefault(); return; }
        const escaped = this._escapedFreeDragClick;
        if (escaped && e.detail > 0 && e.target.closest('.shortcut-item') === escaped.item &&
            (e.pointerId == null || e.pointerId === escaped.pointerId)) {
            this._escapedFreeDragClick = null;
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        if (this._suppressClickUntil && Date.now() < this._suppressClickUntil) {
            e.stopPropagation();
            e.preventDefault();
            return;
        }
        // 统一从最近的按钮或卡片元素读取 data 属性，确保点击 SVG 子元素也能命中
        const actionBtn = e.target.closest('.shortcut-action-btn, .shortcut-launch, .empty-action-btn, .add-shortcut');
        if (actionBtn?.disabled || e.target.closest('.shortcut-item')?.style.display === 'none') return;
        const action = actionBtn?.dataset?.action || e.target.dataset.action;
        const indexStr = actionBtn?.dataset?.index || e.target.dataset.index;
        const index = indexStr !== undefined ? parseInt(indexStr) : NaN;

        if (action === 'open-add' || e.target.closest('.add-shortcut')) {
            e.stopPropagation();
            this.openAddModal();
            return;
        }

        if (action === 'show-all') {
            window.categoryNavigation?.selectCategory('all');
            return;
        }

        if (action === 'create-starter-set') {
            e.stopPropagation();
            this.createStarterSet();
            return;
        }

        if (action === 'open-import') {
            e.stopPropagation();
            e.preventDefault();
            if (e.detail > 1 || e.repeat || e.isComposing) return;
            this.openImportSettings(actionBtn);
            return;
        }

        if (action === 'more') {
            e.stopPropagation();
            e.preventDefault();
            if (e.detail > 1 || e.repeat || e.isComposing || e.keyCode === 229) return;
            this.openShortcutMenu(actionBtn);
            return;
        }

        if (action === 'open') {
            e.stopPropagation();
            this.openShortcut(index);
        } else if (action === 'edit') {
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
    isCurrentShortcutMenuSource(source) {
        const saved = this._shortcutMenuTargets.get(source);
        const grid = this.gridEl;
        if (!saved || window.shortcutsComponentInstance !== this || !grid?.isConnected ||
            grid !== document.getElementById('shortcuts-grid') || !grid.contains(source) ||
            saved.item.querySelector('[data-action="more"]') !== source ||
            Number(saved.item.dataset.index) !== saved.index || Number(source.dataset.index) !== saved.index ||
            !this.isVisibleFocusTarget(source) || !saved.isCurrent()) return false;
        return true;
    }

    openShortcutMenu(source) {
        if (!this.isCurrentShortcutMenuSource(source)) return false;
        return window.contextMenu?.openShortcut(this._shortcutMenuTargets.get(source).item, source) || false;
    }

    async openImportSettings(source) {
        const grid = this.gridEl;
        if (this._importSettingsOpening || !grid?.isConnected || grid !== document.getElementById('shortcuts-grid') ||
            grid.querySelector('[data-action="open-import"]') !== source || !this.isVisibleFocusTarget(source)) return;
        this._importSettingsOpening = true;
        let outcome = 'failed';
        try {
            // Keep the route local and reuse Settings' existing hash navigation.
            const runtime = typeof chrome !== 'undefined' ? chrome.runtime : null;
            const path = 'options.html' + (window.LocalItabWorkspaces?.session?.id ? '?workspace=' + encodeURIComponent(window.LocalItabWorkspaces.session.id) : '') + '#import-settings-btn';
            const url = runtime?.getURL ? runtime.getURL(path) : path;
            if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
                outcome = await new Promise(resolve => {
                    let settled = false;
                    const done = result => { if (!settled) { settled = true; resolve(result); } };
                    const opened = tab => done(Number.isInteger(tab?.id) ? 'opened' : 'unknown');
                    try {
                        const pending = chrome.tabs.create({ url, active: true }, tab => {
                            // Consume lastError even if a Promise already settled this call.
                            if (runtime?.lastError) done('failed');
                            else opened(tab);
                        });
                        if (pending?.then) pending.then(opened, () => done('failed'));
                    } catch (_) { done('failed'); }
                });
            } else {
                const opened = window.open(url, '_blank');
                outcome = 'unknown';
                // An absent/inaccessible WindowProxy does not prove creation failed.
                try { if (opened?.closed === false) outcome = 'opened'; } catch (_) {}
            }
        } catch (_) { outcome = 'failed'; }
        finally { this._importSettingsOpening = false; }
        // Never retry an uncertain creation or move focus from the user's newer work.
        if (outcome !== 'opened' && grid.isConnected && grid === document.getElementById('shortcuts-grid') &&
            this.gridEl === grid && grid.querySelector('[data-action="open-import"]')) {
            showErrorMessage(this.shortcutUndoText(outcome === 'failed' ? 'importSettingsOpenFailed' : 'importSettingsOpenUnknown',
                outcome === 'failed' ? 'Could not open Import Settings. Please try again.' :
                    'Unable to confirm whether Import Settings opened. Check your tabs before trying again.'));
        }
        return outcome;
    }

    openShortcut(index) {
        if (index >= 0 && index < this.links.length) this.openShortcutRecord(this.links[index]);
    }

    openShortcutRecord(link, reservedTab = null) {
        try {
            const url = normalizeHttpUrl(link.url);
            if (!url) return false;
            if (reservedTab) {
                if (reservedTab.closed) return false;
                reservedTab.location.replace(url);
            } else window.open(url, '_blank');
            return true;
        } catch (_) { return false; }
    }

    // Grid order only. Grouped templates stay inside the visible collection;
    // filtered views skip hidden sites without changing their relative order.
    getShortcutOrderTarget(index, direction) {
        if (!Number.isInteger(index) || ![-1, 1].includes(direction) ||
            !this.layout.autoArrange || this.layoutController?.modePending ||
            this._shortcutOrderPending || this._shortcutWritesPending || this._isSaving || !this.links[index]) return -1;
        const category = this.getCurrentCategory();
        const group = this.links[index].category || 'work';
        if (category !== 'all' && group !== category) return -1;
        for (let next = index + direction; next >= 0 && next < this.links.length; next += direction) {
            const candidate = this.links[next].category || 'work';
            if ((category === 'all' || candidate === category) && (!this.usesCollections() || candidate === group)) return next;
        }
        return -1;
    }

    async moveShortcut(index, direction) {
        const target = this.getShortcutOrderTarget(index, direction);
        return this.moveShortcutToIndex(index, target);
    }

    // Both keyboard and Grid drag keep visible slots on the old snapshot until
    // storage confirms the new order. Drag supplies its exact existing drop slot.
    async moveShortcutToIndex(index, target) {
        if (!Number.isInteger(index) || !Number.isInteger(target) || index === target ||
            !this.links[index] || !this.links[target] || !this.layout.autoArrange ||
            this.layoutController?.modePending || this._shortcutUndoPending || this._pendingDelete ||
            this._shortcutOrderPending || this._shortcutWritesPending || this._isSaving) return false;
        const previous = this.links.map(link => ({ ...link }));
        const next = previous.map(link => ({ ...link }));
        const moved = next.splice(index, 1)[0];
        next.splice(target, 0, moved);
        const remap = slot => slot === index ? target :
            index < slot && slot <= target ? slot - 1 :
            target <= slot && slot < index ? slot + 1 : slot;
        this._shortcutOrderPending = true;
        let succeeded = false;
        try {
            const saved = await this.saveShortcutLinks(next, previous, { type: 'reorder', from: index, to: target });
            if (!saved) throw new Error('Storage write returned false');
            if (!saved.links) this.links = next;
            succeeded = true;
            // An editor opened during this write still refers to the old order.
            // Preserve its draft and remap its slot before re-enabling Save.
            if (this.modal?.classList.contains('active')) {
                if (this.currentEditIndex >= 0) this.currentEditIndex = remap(this.currentEditIndex);
                // Focus return belongs to its own opener, including an Add
                // draft launched from a site rather than the Add tile.
                if (Number.isInteger(this._modalFocusOrigin?.index)) {
                    this._modalFocusOrigin = { ...this._modalFocusOrigin, index: remap(this._modalFocusOrigin.index) };
                }
            }
        } catch (error) {
            const message = this.recoverShortcutWrite(error, previous);
            showErrorMessage(message || window.i18n?.t('shortcutOrderFailed') || 'Could not save shortcut order. Please try again.');
        } finally {
            this._shortcutOrderPending = false;
            this.setSavingState(Boolean(this._pendingSave));
            // Preserve the latest focused site, even when the user chose a
            // different identical twin while saving. Never replace editor/search focus.
            const focus = this.captureGridFocus();
            this.updateGrid(succeeded && Number.isInteger(focus?.index) ? { ...focus, index: remap(focus.index) } : null);
        }
        return succeeded;
    }

    shortcutUndoText(key, fallback) {
        const value = window.i18n?.t(key);
        return value && value !== key ? value : fallback;
    }

    createShortcutUndoBar() {
        if (this._shortcutUndoBar) return this._shortcutUndoBar;
        const bar = document.createElement('div');
        bar.className = 'shortcut-undo-bar';
        const status = document.createElement('span');
        const liveStatus = document.createElement('span');
        liveStatus.className = 'sr-only';
        liveStatus.setAttribute('role', 'status');
        liveStatus.setAttribute('aria-live', 'polite');
        liveStatus.setAttribute('aria-atomic', 'true');
        liveStatus.textContent = '';
        this._shortcutUndoLiveStatus = liveStatus;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'shortcut-undo-button';
        button.addEventListener('click', () => this.undoShortcutDeletion());
        bar.append(status, button);
        this._shortcutUndoBar = bar;
        this._shortcutUndoStatus = status;
        this._shortcutUndoButton = button;
        return bar;
    }

    canUndoShortcutDeletion() {
        const controller = this.layoutController;
        return Boolean(this._shortcutUndoReceipt && !this._shortcutUndoPending &&
            !this._shortcutWritesPending && !this._isSaving && !this._pendingSave &&
            !this._pendingDelete && !this._shortcutOrderPending && !this._cancelFreeDrag &&
            this.draggedIndex == null && !this.dragState && !this.confirmDialog &&
            !this.modal?.classList.contains('active') && !controller?.modePending &&
            !controller?.pending && !controller?.timer && !controller?.failedChange);
    }

    refreshShortcutUndo() {
        if (!this._shortcutUndoBar) return;
        this._shortcutUndoBar.hidden = !this._shortcutUndoReceipt && !this._shortcutUndoPending;
        this._shortcutUndoStatus.textContent = this.shortcutUndoText('shortcutUndoNotice',
            'Shortcut deleted. Undo is available only on this page until refresh; later changes may make it unavailable.');
        this._shortcutUndoButton.textContent = this.shortcutUndoText('shortcutUndoAction', 'Undo delete');
        this._shortcutUndoButton.disabled = !this.canUndoShortcutDeletion();
    }

    adoptShortcutSnapshot(snapshot) {
        this.links = snapshot.links;
        this.layout = snapshot.layout;
        this.positions = snapshot.layout.positions;
        this.identityPositions = snapshot.layout.positionsById || {};
        this.layoutController?.adoptOwnShortcutSnapshot(snapshot);
    }

    async undoShortcutDeletion() {
        if (!this.canUndoShortcutDeletion()) return false;
        const receipt = this._shortcutUndoReceipt;
        const deletedIndex = this._shortcutUndoDeletedIndex;
        // Consume before awaiting: double activation and uncertain outcomes cannot retry.
        this._shortcutUndoReceipt = null;
        this._shortcutUndoPending = true;
        this._shortcutWritesPending = (this._shortcutWritesPending || 0) + 1;
        this.setSavingState(true);
        const controller = this.layoutController;
        controller?.holdShortcutMutation();
        try {
            if (controller) await controller.flush();
            const snapshot = await storageManager.undoShortcutDeletion(receipt);
            const focus = this.captureGridFocus();
            const ownsUndoFocus = document.activeElement === this._shortcutUndoButton;
            const focusedId = Number.isInteger(focus?.index) ? this.links[focus.index]?.layoutId : null;
            const restoreIndex = index => index >= deletedIndex ? index + 1 : index;
            const draftId = this.links[this.currentEditIndex]?.layoutId;
            const openerId = this.links[this._modalFocusOrigin?.index]?.layoutId;
            this.adoptShortcutSnapshot(snapshot);
            // A draft may have opened while storage was awaited. Keep its inputs intact.
            if (this.modal?.classList.contains('active')) {
                if (this.currentEditIndex >= 0) {
                    const index = draftId ? this.links.findIndex(link => link.layoutId === draftId) : restoreIndex(this.currentEditIndex);
                    if (index < 0) this._hasShortcutConflict = true;
                    else this.currentEditIndex = index;
                }
                if (Number.isInteger(this._modalFocusOrigin?.index)) this._modalFocusOrigin = { ...this._modalFocusOrigin,
                    index: openerId ? this.links.findIndex(link => link.layoutId === openerId) : restoreIndex(this._modalFocusOrigin.index) };
            }
            const index = focusedId ? this.links.findIndex(link => link.layoutId === focusedId) : Number.isInteger(focus?.index) ? restoreIndex(focus.index) : -1;
            this.updateGrid(index >= 0 ? { ...focus, index } : ownsUndoFocus ? { index: deletedIndex, action: 'launch' } : null);
            return true;
        } catch (error) {
            // A draft opened during an unverified write must never target a stale slot.
            if (this.modal?.classList.contains('active') && this.currentEditIndex >= 0) {
                this._hasShortcutConflict = true;
            }
            // Storage is authoritative; never manufacture a rollback or retry an undo.
            showErrorMessage(this.shortcutUndoText(error.code === 'SHORTCUT_UNDO_UNVERIFIED'
                ? 'shortcutUndoUnverified' : 'shortcutUndoUnavailable', error.code === 'SHORTCUT_UNDO_UNVERIFIED'
                ? 'Could not verify the result. Refresh this page to check your shortcuts.'
                : 'Undo is no longer available. Refresh this page to check the latest shortcuts.'));
            return false;
        } finally {
            this._shortcutUndoPending = false;
            this._shortcutWritesPending--;
            controller?.releaseShortcutMutation();
            this.setSavingState(Boolean(this._pendingSave || this._pendingDelete || this._shortcutOrderPending));
        }
    }

    async moveReviewedShortcuts(request) {
        if (this._shortcutWritesPending || this._pendingSave || this._pendingDelete || this._shortcutOrderPending || this._shortcutUndoPending ||
            this.modal?.classList.contains('active')) throw new Error('Shortcut action pending');
        this._shortcutWritesPending = (this._shortcutWritesPending || 0) + 1;
        const controller = this.layoutController;
        controller?.holdShortcutMutation();
        this.refreshShortcutUndo();
        try {
            if (controller?.failedChange || controller?.invalidated) throw Object.assign(new Error('Finish or retry the pending layout change first.'), { code: 'ORGANIZER_LAYOUT_PENDING' });
            const flushed = await controller?.flush();
            if (flushed === false || controller?.failedChange || controller?.invalidated) throw Object.assign(new Error('Finish or retry the pending layout change first.'), { code: 'ORGANIZER_LAYOUT_PENDING' });
            const saved = await storageManager.moveShortcutsToCategory(request);
            this.adoptShortcutSnapshot(saved);
            this._shortcutUndoReceipt = null;
            this.updateGrid();
            return saved;
        } finally {
            this._shortcutWritesPending--;
            controller?.releaseShortcutMutation();
            this.refreshShortcutUndo();
        }
    }

    async addCatalogShortcut(request) {
        if (this._shortcutWritesPending || this._pendingSave || this._pendingDelete || this._shortcutOrderPending || this._shortcutUndoPending ||
            this.modal?.classList.contains('active')) throw new Error('Shortcut action pending');
        this._shortcutWritesPending = (this._shortcutWritesPending || 0) + 1;
        const controller = this.layoutController;
        controller?.holdShortcutMutation();
        this.refreshShortcutUndo();
        try {
            if (controller?.failedChange || controller?.invalidated) throw Object.assign(new Error('Pending layout change'), { code: 'CATALOG_LAYOUT_PENDING' });
            const flushed = await controller?.flush();
            if (flushed === false || controller?.failedChange || controller?.invalidated) throw Object.assign(new Error('Pending layout change'), { code: 'CATALOG_LAYOUT_PENDING' });
            const saved = await storageManager.addCatalogShortcut(request);
            // Preserve saved URL identities in the display/layout baseline too,
            // so late storage notifications compare the same raw spelling.
            this.adoptShortcutSnapshot({ ...saved, links: storageManager.validateStoredLinksConfig(saved.links) });
            if (Array.isArray(saved.categories)) {
                this.categories = saved.categories;
                if (window.categoryNavigation) {
                    window.categoryNavigation.categories = saved.categories;
                    window.categoryNavigation.render({ reflow: false });
                }
            }
            this._shortcutUndoReceipt = null;
            this.updateGrid();
            return saved;
        } finally {
            this._shortcutWritesPending--;
            controller?.releaseShortcutMutation();
            this.refreshShortcutUndo();
        }
    }

    async saveShortcutLinks(next, previous, operation) {
        this._shortcutWritesPending = (this._shortcutWritesPending || 0) + 1;
        this.refreshShortcutUndo();
        const controller = this.layoutController;
        controller?.holdShortcutMutation();
        try {
            if (controller) await controller.flush();
            const options = { expectedLinks: previous,
                ...(controller ? { expectedLayoutGeneration: controller.generation } : {}) };
            let saved;
            if (operation?.type === 'delete') {
                const result = await storageManager.deleteShortcutWithUndo(operation.index, options);
                saved = result.snapshot;
                this._shortcutUndoReceipt = result.receipt;
                this._shortcutUndoDeletedIndex = operation.index;
            } else {
                saved = await storageManager.set('links', next, { ...options, returnSnapshot: true, operation });
            }
            if (saved?.links) this.adoptShortcutSnapshot(saved);
            return saved;
        } catch (error) {
            if (operation?.type === 'delete' && (error.invalidatesShortcutUndo ||
                error.code === 'LINKS_CONFLICT' || error.code === 'SHORTCUT_UNDO_UNVERIFIED' || error.mayHaveCommitted)) {
                this._shortcutUndoReceipt = null;
            }
            throw error;
        } finally {
            this._shortcutWritesPending--;
            controller?.releaseShortcutMutation();
            this.refreshShortcutUndo();
        }
    }

    async createStarterSet() {
        if (this.links.length || this._shortcutUndoPending || this._shortcutWritesPending) return;
        const previousLinks = this.links.map(link => ({ ...link }));
        this.links = [
            { title: 'GitHub', url: 'https://github.com/', icon: 'GH', category: 'work' },
            { title: 'Gmail', url: 'https://mail.google.com/', icon: '✉', category: 'work' },
            { title: 'YouTube', url: 'https://www.youtube.com/', icon: '▶', category: 'entertainment' },
            { title: 'Wikipedia', url: 'https://www.wikipedia.org/', icon: 'W', category: 'learning' },
            { title: 'Google Translate', url: 'https://translate.google.com/', icon: '文', category: 'tools' }
        ];
        try {
            const saved = await this.saveShortcutLinks(this.links, previousLinks);
            if (!saved) throw new Error('Storage write returned false');
            this.updateGrid();
        } catch (error) {
            const message = this.recoverShortcutWrite(error, previousLinks);
            this.updateGrid();
            console.error('Error creating starter set:', error);
            showErrorMessage(message || (window.i18n && i18n.t('failedToSave')) || 'Failed to save shortcut. Please try again.');
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

        this.cancelIconRequest();
        this._modalSession++;
        this._hasShortcutConflict = false;
        this.setSavingState(Boolean(this._pendingSave || this._shortcutOrderPending));

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

        // Snapshot initialized raw fields per opening, not the mutable links list.
        this._shortcutDraftBaseline = {
            session: this._modalSession,
            modal: this.modal,
            values: this.readShortcutDraft()
        };

        // Clear previous errors
        this.clearFormErrors();

        // Show modal
        this._closeModal?.();
        this._modalFocusOrigin = this.captureGridFocus();
        this._closeModal = window.LocalItabDialog.open(this.modal, titleInput, () => this.hideModal());
        this.refreshShortcutUndo();
        this.updateShortcutPreview();
    }

    readShortcutDraft() {
        return ['title', 'url', 'icon', 'category'].map(field =>
            this.modal?.querySelector(`#shortcut-${field}`)?.value ?? '');
    }

    hasUncommittedShortcutWork() {
        // A dismissed editor can still own an unresolved write. Delete/Undo and
        // conflict flags are not draft ownership and must not create warnings.
        if (this._pendingSave || this.organizerView?.hasUncommittedWork() || this.navigationLibraryView?.hasUncommittedWork()) return true;
        const baseline = this._shortcutDraftBaseline;
        if (!baseline || baseline.session !== this._modalSession || baseline.modal !== this.modal ||
            !this.modal?.classList.contains('active')) return false;
        // Read at departure so IME and programmatic icon updates need no events.
        return this.readShortcutDraft().some((value, index) => value !== baseline.values[index]);
    }

    /**
     * Hide modal dialog
     */
    hideModal() {
        if (this.modal) {
            const wasOpen = this.modal.classList.contains('active');
            this._closeModal?.();
            this._closeModal = null;
            if (wasOpen && this._modalFocusOrigin &&
                (document.activeElement === document.body || this.modal.contains?.(document.activeElement) || document.activeElement?.isConnected === false)) {
                const grid = document.getElementById('shortcuts-grid');
                if (grid) this.restoreGridFocus(grid, this._modalFocusOrigin);
            }
            this.cancelIconRequest();
            this._modalSession++;
            this._shortcutDraftBaseline = null;
            this.currentEditIndex = -1;
            this.setSavingState(Boolean(this._pendingSave || this._shortcutOrderPending));
        }
    }

    /**
     * Create modal HTML
     */
    createModal() {
        this.cancelIconRequest();
        this._closeModal?.();
        this._closeModal = null;
        // Remove existing modal
        const existingModal = document.getElementById('shortcut-modal');
        if (existingModal) {
            existingModal.remove();
        }

        const modalHtml = `
            <div class="modal-overlay" id="shortcut-modal" aria-hidden="true">
                <div class="modal" role="dialog" aria-modal="true" aria-labelledby="shortcut-modal-title">
                    <div class="modal-header">
                        <h3 class="modal-title" id="shortcut-modal-title">${(window.i18n && i18n.t('addShortcut')) || 'Add Shortcut'}</h3>
                        <button type="button" class="modal-close" id="modal-close" aria-label="${(window.i18n && i18n.t('cancel')) || 'Cancel'}">×</button>
                    </div>
                    <form class="modal-form" id="shortcut-form" novalidate>
                        <div class="form-group">
                            <label class="form-label" for="shortcut-title">${(window.i18n && i18n.t('title')) || 'Title'}</label>
                            <input type="text" class="form-input" id="shortcut-title" placeholder="${(window.i18n && i18n.t('title')) || 'Title'}" required>
                            <div class="form-error" id="title-error"></div>
                        </div>
                        <div class="form-group">
                            <label class="form-label" for="shortcut-url">${(window.i18n && i18n.t('url')) || 'URL'}</label>
                            <input type="text" class="form-input" id="shortcut-url" placeholder="https://example.com" inputmode="url" required>
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
                            <div class="form-hint">${(window.i18n && i18n.t('iconHint')) || 'Enter an emoji, text, or click the button to auto-fetch the website icon'}</div>
                        </div>
                        <section class="shortcut-preview-panel" aria-labelledby="shortcut-preview-label">
                            <div id="shortcut-preview-label" class="form-label">${window.i18n?.t('shortcutPreviewLabel') || 'Icon and title preview'}</div>
                            <div id="shortcut-edit-preview" class="shortcut-edit-preview"></div>
                            <div id="shortcut-preview-hidden" class="form-hint" hidden>${window.i18n?.t('shortcutPreviewHidden') || 'Titles are hidden on your home page. Check the title in the field above.'}</div>
                            <div class="form-hint">${window.i18n?.t('shortcutPreviewHint') || 'Uses local cached icons only; otherwise shows your text or 🌐. Size and title visibility follow your settings. Full card layout appears on the home page after saving.'}</div>
                        </section>
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
        // A later edit owns this opening before an IME emits its first input.
        // Keep this separate from icon-fetch ownership and preview revisions.
        const markDraftIntent = () => { this._shortcutDraftRevision = (this._shortcutDraftRevision || 0) + 1; };
        for (const field of ['title', 'url', 'icon', 'category']) {
            const input = this.modal.querySelector(`#shortcut-${field}`);
            for (const event of ['input', 'change', 'compositionstart']) input.addEventListener(event, markDraftIntent);
        }
        for (const selector of ['#shortcut-title', '#shortcut-url', '#shortcut-icon']) {
            const input = this.modal.querySelector(selector);
            // Existing-text composition can begin without changing the value
            // or emitting input. Its URL/icon intent already supersedes Fetch.
            if (selector !== '#shortcut-title') input.addEventListener('compositionstart', () => this.cancelIconRequest());
            for (const event of ['input', 'change']) {
                input.addEventListener(event, () => {
                    if (selector !== '#shortcut-title') this.cancelIconRequest();
                    this.updateShortcutPreview();
                });
            }
        }

        // Refresh icon button: clear site+URL cache and force next load to fetch again
        const refreshIconBtn = this.modal.querySelector('#refresh-icon-btn');
        if (refreshIconBtn) {
            refreshIconBtn.addEventListener('click', async () => {
                try {
                    const urlInput = this.modal.querySelector('#shortcut-url');
                    const iconInput = this.modal.querySelector('#shortcut-icon');
                    this.cancelIconRequest();
                    const intent = this._iconIntentVersion;
                    const session = this._modalSession;
                    const modal = this.modal;
                    const originalIcon = iconInput.value;
                    const originalUrl = urlInput.value;
                    const rawUrl = (urlInput?.value || '').trim();
                    if (!rawUrl) return;
                    if (window.faviconCache) {
                        const origin = window.faviconCache.getOriginFromUrl(rawUrl);
                        if (origin) await window.faviconCache.invalidate(origin);
                        const iconVal = originalIcon.trim();
                        if (iconVal && (iconVal.startsWith('http://') || iconVal.startsWith('https://'))) {
                            await window.faviconCache.invalidateByUrl(iconVal);
                        }
                    }
                    // Also clear current icon field so user can重新获取
                    if (this.modal !== modal || this._modalSession !== session ||
                        this._iconIntentVersion !== intent || !modal.classList.contains('active') ||
                        urlInput.value !== originalUrl || iconInput.value !== originalIcon) return;
                    iconInput.value = '';
                    this.updateShortcutPreview();
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

    }

    updateCategoryOptions() {
        const categorySelect = this.modal?.querySelector('#shortcut-category');
        if (!categorySelect) return;
        const categories = window.categoryNavigation?.getCategoriesForSelect?.() || [];
        categorySelect.replaceChildren();
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.id;
            option.textContent = `${cat.icon || ''} ${cat.name || ''}`.trim();
            categorySelect.appendChild(option);
        });
        // Deleting category metadata does not move its saved shortcuts. Keep
        // this editor's original ID selectable without recreating a category.
        const originalCategory = this.links[this.currentEditIndex]?.category;
        if (typeof originalCategory === 'string' && originalCategory &&
            !categories.some(cat => cat.id === originalCategory)) {
            const option = document.createElement('option');
            option.value = originalCategory;
            option.textContent = `${originalCategory} (${window.i18n?.t('shortcutCategoryUnlisted') || 'Not in category list'})`;
            categorySelect.appendChild(option);
        }
    }

    /**
     * Handle form submission
     */
    async handleFormSubmit(e) {
        e.preventDefault();

        if (this._isSaving || this._pendingDelete || this._shortcutOrderPending || this._hasShortcutConflict) return;

        const titleInput = this.modal.querySelector('#shortcut-title');
        const urlInput = this.modal.querySelector('#shortcut-url');
        const iconInput = this.modal.querySelector('#shortcut-icon');
        const categorySelect = this.modal.querySelector('#shortcut-category');

        const { title, icon, category } = this.normalizedShortcutDraft();
        const original = this.links[this.currentEditIndex];
        const unchangedURL = original && urlInput.value === original.url;
        let url = unchangedURL ? original.url : urlInput.value.trim();

        // Validate form
        if (!this.validateForm(title, url)) {
            return;
        }
        if (!unchangedURL) url = normalizeHttpUrl(url);

        const saveSession = this._modalSession;
        const saveModal = this.modal;
        const saveDraft = this.readShortcutDraft();
        const saveRevision = this._shortcutDraftRevision || 0;
        const pendingSave = {};
        this._pendingSave = pendingSave;
        this.setSavingState(true);

        // Save shortcut WITHOUT overwriting user's original icon field
        // Retain every original field for strict storage validation; rebuilding
        // only recognized fields must never turn a rejected record into success.
        const shortcut = { ...(original || {}), title, url, icon, category };
        const previousLinks = this.links.map(link => ({ ...link }));
        const nextLinks = previousLinks.map(link => ({ ...link }));
        const editIndex = this.currentEditIndex;

        if (editIndex >= 0) {
            // Edit existing shortcut
            nextLinks[editIndex] = shortcut;
        } else {
            // Add new shortcut
            nextLinks.push(shortcut);
        }

        // Save to storage
        try {
            const saved = await this.saveShortcutLinks(nextLinks, previousLinks, { type: editIndex >= 0 ? 'edit' : 'add', index: editIndex >= 0 ? editIndex : previousLinks.length });
            if (!saved) {
                throw new Error('Storage write returned false');
            }
            const sameEditor = this._modalSession === saveSession && this.modal === saveModal;
            const newerDraft = sameEditor && ((this._shortcutDraftRevision || 0) !== saveRevision ||
                this.readShortcutDraft().some((value, index) => value !== saveDraft[index]));
            const ownsFocus = sameEditor && !newerDraft && this.modal.contains?.(document.activeElement);
            const focusIntent = ownsFocus ? (editIndex >= 0
                ? { key: this.getShortcutFocusKey(shortcut), index: editIndex, action: ['more', 'edit'].includes(this._modalFocusOrigin?.action) ? this._modalFocusOrigin.action : 'launch' }
                : { action: 'add' }) : null;
            this.links = saved.links || nextLinks;
            if (sameEditor) {
                if (newerDraft) {
                    // The committed snapshot is the next edit's target/CAS base.
                    // In particular, continuing an Add must not add it twice.
                    this.currentEditIndex = editIndex >= 0 ? editIndex : previousLinks.length;
                    this._shortcutDraftBaseline = { session: saveSession, modal: this.modal, values: saveDraft };
                    this.modal.querySelector('.modal-title').textContent = window.i18n?.t('editShortcut') || 'Edit Shortcut';
                } else this.hideModal();
            }
            this.updateGrid(focusIntent);

            // Warm favicon cache after the UI is done saving so it never blocks the modal.
            if (window.faviconCache) {
                setTimeout(async () => {
                    try {
                        const origin = window.faviconCache.getOriginFromUrl(url);
                        if (origin) await window.faviconCache.prefetch(origin);
                    } catch (_) {}
                }, 0);
            }
        } catch (error) {
            // The visible list was never changed optimistically by this save.
            const message = this.recoverShortcutWrite(error, this.links);
            this.updateGrid();
            console.error('Error saving shortcut:', error);
            const feedback = message || ((window.i18n && i18n.t('failedToSave')) || 'Failed to save shortcut. Please try again.');
            if (this._modalSession === saveSession) this.showFormError('url', feedback);
            else showErrorMessage(feedback);
        } finally {
            if (this._pendingSave === pendingSave) {
                this._pendingSave = null;
                this.setSavingState(false);
            }
        }
    }

    setSavingState(isSaving) {
        this._isSaving = !!(isSaving || this._pendingDelete || this._shortcutUndoPending);
        this.refreshShortcutUndo();
        const saveBtn = this.modal?.querySelector('#save-btn');
        if (saveBtn) {
            saveBtn.disabled = this._isSaving || this._hasShortcutConflict;
            saveBtn.classList.toggle('is-disabled', saveBtn.disabled);
        }
    }

    recoverShortcutWrite(error, previousLinks) {
        if (error.code === 'LINKS_CONFLICT' || error.invalidatesShortcutUndo) {
            this._shortcutUndoReceipt = null;
            this.refreshShortcutUndo();
        }
        if (['SHORTCUT_UNDO_INVALID', 'BOOKMARK_IMPORT_INVALID_STATE', 'BOOKMARK_IMPORT_STATE_LIMIT'].includes(error.code)) {
            return this.shortcutUndoText('shortcutUndoInvalidData', 'This shortcut data cannot be changed safely. Refresh and review it before trying again.');
        }
        if (error.code === 'SHORTCUT_UNDO_UNVERIFIED' || error.mayHaveCommitted) {
            this._shortcutUndoReceipt = null;
            this.refreshShortcutUndo();
            if (this.modal?.classList.contains('active')) this._hasShortcutConflict = true;
            return this.shortcutUndoText('shortcutUndoUnverified', 'Could not verify the result. Refresh this page to check your shortcuts.');
        }
        this.links = error.code === 'LINKS_CONFLICT' ? error.latestLinks : previousLinks;
        if (error.code === 'LINKS_CONFLICT') {
            // Keep unsaved inputs visible, but do not let their old array index
            // target a different shortcut after refreshing the current list.
            if (this.modal?.classList.contains('active')) {
                this._hasShortcutConflict = true;
                this.setSavingState(false);
                return (window.i18n && i18n.t('shortcutDraftConflict')) ||
                    'Shortcuts changed in another tab. Your draft is still here; copy it if needed, then close and reopen the shortcut to retry.';
            }
            return (window.i18n && i18n.t('shortcutsChangedElsewhere')) ||
                'Shortcuts changed in another tab. The list has been refreshed. Please try again.';
        }
        if (error.code === 'LINKS_LOCK_UNAVAILABLE') {
            return (window.i18n && i18n.t('shortcutSavingUnavailable')) ||
                'Safe shortcut saving is unavailable. Update Chrome and reopen this page to retry.';
        }
        return '';
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
            normalizeHttpUrl(url);
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
        if (this._shortcutOrderPending) {
            showErrorMessage(window.i18n?.t('shortcutOrderPending') || 'Wait for shortcut order to finish saving, then try again.');
            return false;
        }
        if (index < 0 || index >= this.links.length) return;

        const link = this.links[index];
        const expectedLink = { ...link };
        this.showConfirmDialog(
            ((window.i18n && i18n.t('deleteShortcut')) || 'Delete Shortcut'),
            ((window.i18n && i18n.t('deleteShortcutConfirm')) || 'Are you sure you want to delete this shortcut?'),
            link,
            () => {
                if (this.links[index] !== link || Object.keys(expectedLink).some(key => link[key] !== expectedLink[key])) {
                    showErrorMessage(window.i18n?.t('contextTargetChanged') || 'This item changed. Reopen the action and try again.');
                    return;
                }
                this.deleteShortcut(index);
            }
        );
    }

    /**
     * Delete shortcut
     */
    async deleteShortcut(index) {
        if (this._shortcutUndoPending || this._shortcutOrderPending || this._shortcutWritesPending || this._pendingSave || this._pendingDelete) {
            showErrorMessage(window.i18n?.t('shortcutOrderPending') || 'Wait for shortcut order to finish saving, then try again.');
            return false;
        }
        if (index < 0 || index >= this.links.length) return false;
        if (this._shortcutUndoLiveStatus) this._shortcutUndoLiveStatus.textContent = '';
        const previousLinks = this.links.map(link => ({ ...link }));
        const nextLinks = previousLinks.filter((_, slot) => slot !== index);
        const focusOrigin = this.captureGridFocus();
        const focusedControl = document.activeElement;
        const ownedDeletedFocus = focusOrigin?.index === index;
        // Keep the visible tiles and controller indices on the same snapshot
        // until storage accepts the deletion. New drafts may open, but wait.
        this._pendingDelete = true;
        this.setSavingState(true);
        try {
            const saved = await this.saveShortcutLinks(nextLinks, previousLinks, { type: 'delete', index });
            if (!saved) throw new Error('Storage write returned false');
            this.links = saved.links || nextLinks;
            if (this._shortcutUndoLiveStatus) this._shortcutUndoLiveStatus.textContent = this.shortcutUndoText('shortcutUndoNotice',
                'Shortcut deleted. Undo is available only on this page until refresh; later changes may make it unavailable.');
            if (this.modal?.classList.contains('active')) {
                if (this.currentEditIndex === index) {
                    // Preserve a draft for the deleted site, never retarget it
                    // to the next site (or silently turn it into an Add).
                    this._hasShortcutConflict = true;
                    showErrorMessage(window.i18n?.t('shortcutDraftConflict') || 'Shortcuts changed. Your draft is still here; copy it if needed, then close and reopen the shortcut to retry.');
                } else if (this.currentEditIndex > index) {
                    this.currentEditIndex--;
                }
                if (this._modalFocusOrigin?.index > index) {
                    this._modalFocusOrigin = { ...this._modalFocusOrigin, index: this._modalFocusOrigin.index - 1 };
                }
            }
            const latestFocus = this.captureGridFocus();
            const nextFocus = ownedDeletedFocus && document.activeElement === focusedControl
                ? { index, action: 'launch' }
                : latestFocus?.index > index ? { ...latestFocus, index: latestFocus.index - 1 } : null;
            this.updateGrid(nextFocus);
            return true;
        } catch (error) {
            const message = this.recoverShortcutWrite(error, previousLinks);
            this.updateGrid();
            console.error('Error deleting shortcut:', error);
            showErrorMessage(message || ((window.i18n && i18n.t('failedToDelete')) || 'Failed to delete shortcut. Please try again.'));
            return false;
        } finally {
            this._pendingDelete = false;
            this.setSavingState(Boolean(this._pendingSave || this._shortcutOrderPending));
        }
    }

    /**
     * Show confirmation dialog
     */
    showConfirmDialog(title, message, shortcut, onConfirm) {
        this._closeConfirmDialog?.();
        // Remove existing dialog
        const existingDialog = document.getElementById('confirm-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'confirm-dialog';

        const modal = document.createElement('div');
        modal.className = 'modal confirm-dialog';
        modal.setAttribute('role', 'alertdialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'confirm-title');
        modal.setAttribute('aria-describedby', 'confirm-message');

        const header = document.createElement('div');
        header.className = 'modal-header';
        const heading = document.createElement('h3');
        heading.className = 'modal-title';
        heading.id = 'confirm-title';
        heading.textContent = title;
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'modal-close';
        close.id = 'confirm-close';
        close.setAttribute('aria-label', (window.i18n && i18n.t('cancel')) || 'Cancel');
        close.textContent = '×';
        header.append(heading, close);

        const body = document.createElement('div');
        body.className = 'confirm-message';
        body.id = 'confirm-message';
        body.textContent = message;

        const shortcutInfo = document.createElement('div');
        shortcutInfo.className = 'confirm-shortcut-info';
        const shortcutTitle = document.createElement('div');
        shortcutTitle.className = 'confirm-shortcut-title';
        shortcutTitle.textContent = shortcut.title || '';
        const shortcutUrl = document.createElement('div');
        shortcutUrl.className = 'confirm-shortcut-url';
        shortcutUrl.textContent = shortcut.url || '';
        shortcutInfo.append(shortcutTitle, shortcutUrl);

        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'modal-btn secondary';
        cancel.id = 'confirm-cancel';
        cancel.textContent = (window.i18n && i18n.t('cancel')) || 'Cancel';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'modal-btn primary';
        remove.id = 'confirm-delete';
        remove.style.background = '#e74c3c';
        remove.style.borderColor = '#e74c3c';
        remove.textContent = (window.i18n && i18n.t('remove')) || 'Delete';
        actions.append(cancel, remove);

        modal.append(header, body, shortcutInfo, actions);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        this.confirmDialog = overlay;
        this.refreshShortcutUndo();

        let restoreFocus;
        let closed = false;
        const hideDialog = () => {
            if (closed) return;
            closed = true;
            restoreFocus?.();
            overlay.remove();
            if (this.confirmDialog === overlay) {
                this.confirmDialog = null;
                this._closeConfirmDialog = null;
                this.refreshShortcutUndo();
            }
        };
        this._closeConfirmDialog = hideDialog;
        restoreFocus = window.LocalItabDialog.open(overlay, cancel, hideDialog);

        close.addEventListener('click', hideDialog);
        cancel.addEventListener('click', hideDialog);
        remove.addEventListener('click', () => {
            if (closed) return;
            hideDialog();
            onConfirm();
        });
        overlay.addEventListener('click', event => {
            if (event.target === overlay) hideDialog();
        });
    }

    /**
     * Update shortcuts grid
     */
    updateGrid(requestedFocus = null) {
        this._escapedFreeDragClick = null;
        this._cancelFreeDrag?.();
        const grid = document.getElementById('shortcuts-grid');
        if (grid) {
            const focusIntent = requestedFocus || this.captureGridFocus(grid);
            grid.replaceChildren(this.buildShortcutsFragment());
            this.gridEl = grid;
            // Filter before layout measures positions so hidden categories cannot
            // flash back into view or reserve space after a mutation.
            window.categoryNavigation?.filterShortcuts({ reflow: false });
            this.updateCollectionVisibility();
            this.applyLayoutMode();
            if (focusIntent) this.restoreGridFocus(grid, focusIntent);
        }
    }

    captureGridFocus(grid = document.getElementById('shortcuts-grid')) {
        const active = document.activeElement;
        if (!active || !grid?.contains?.(active)) return null;
        if (active.dataset?.action === 'open-add' || active.closest('.add-shortcut')) return { action: 'add' };
        if (active.dataset?.action === 'open-import') return { action: 'import' };
        const tile = active.closest('.shortcut-item');
        if (!tile) return null;
        return {
            key: tile.dataset.focusKey,
            index: Number(tile.dataset.index),
            action: ['more', 'edit', 'delete'].includes(active.dataset?.action) ? active.dataset.action : 'launch'
        };
    }

    isVisibleFocusTarget(element) {
        return !!element && !element.disabled && element.isConnected !== false &&
            !element.closest('[inert]') && element.getClientRects().length > 0 &&
            window.getComputedStyle?.(element)?.visibility !== 'hidden';
    }

    restoreGridFocus(grid, intent) {
        const add = grid.querySelector('.add-shortcut');
        let target = add;
        if (intent.action === 'import') {
            const importButton = grid.querySelector('[data-action="open-import"]');
            target = this.isVisibleFocusTarget(importButton) ? importButton : add;
        } else if (intent.action !== 'add') {
            const visible = Array.from(grid.querySelectorAll('.shortcut-item:not(.add-shortcut)'))
                .filter(tile => this.isVisibleFocusTarget(tile));
            const matches = visible.filter(tile => tile.dataset.focusKey === intent.key)
                .sort((a, b) => Math.abs(Number(a.dataset.index) - intent.index) - Math.abs(Number(b.dataset.index) - intent.index));
            const sameTile = matches[0];
            const tile = sameTile || visible.find(item => Number(item.dataset.index) >= intent.index) || visible[visible.length - 1];
            const action = sameTile && ['more', 'edit', 'delete'].includes(intent.action) ? intent.action : 'open';
            target = tile?.querySelector(`[data-action="${action}"]`);
            if (!this.isVisibleFocusTarget(target)) target = tile?.querySelector('.shortcut-launch');
            if (!this.isVisibleFocusTarget(target)) target = add;
        }
        if (this.isVisibleFocusTarget(target)) target.focus();
    }

    applyLayoutMode({ persistMissing = true } = {}) {
        this._cancelFreeDrag?.();
        const grid = this.gridEl;
        if (!grid) return;
        let focusIntent = null;
        if (this._renderedGrouping !== undefined && this._renderedGrouping !== this.usesCollections()) {
            // An external placement change can regroup a keyboard-focused tile.
            this._escapedFreeDragClick = null;
            focusIntent = this.captureGridFocus(grid);
            grid.replaceChildren(this.buildShortcutsFragment());
            window.categoryNavigation?.filterShortcuts({ reflow: false });
            this.updateCollectionVisibility();
        }
        this.applyAutoColumns();
        if (this.layout?.autoArrange) {
            grid.classList.remove('free-layout');
            grid.style.minHeight = '';
            grid.style.overflowX = '';
            grid.style.overflowY = '';
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
            if (this._templatePreview) {
                this.detachFreeDrag();
                this.applyVisibleTransformsFromPositions();
                this.positionAddTile();
                if (focusIntent) this.restoreGridFocus(grid, focusIntent);
                return;
            }
            if (window.LocalItabIdentity?.needs(this.links)) {
                this.detachFreeDrag();
                const controller = this.ensureLayoutController();
                if (!controller.modePending && !controller.pending && !controller.failedChange && persistMissing) controller.change({ autoArrange: false });
                this.applyVisibleTransformsFromPositions();
                this.positionAddTile();
                if (focusIntent) this.restoreGridFocus(grid, focusIntent);
                return;
            }
            this.initializeMissingPositions(persistMissing);
            this.applyVisibleTransformsFromPositions();
            this.positionAddTile();
            this.attachFreeDrag();
        }
        if (focusIntent) this.restoreGridFocus(grid, focusIntent);
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

    getPositionKey(link, category) {
        if (link?.layoutId) return JSON.stringify([category || this.getCurrentCategory(), link.layoutId]);
        const urlKey = (link && link.url) || `idx_${this.links.indexOf(link)}`;
        const cat = category || this.getCurrentCategory();
        return `${cat || 'all'}|${urlKey}`;
    }

    getSavedPosition(link, category = this.getCurrentCategory()) {
        if (link?.layoutId) {
            const views = this.identityPositions[link.layoutId];
            return views && Object.prototype.hasOwnProperty.call(views, category) ? views[category] : undefined;
        }
        return this.positions[this.getPositionKey(link, category)];
    }

    setSavedPosition(link, category, position) {
        if (link.layoutId) this.identityPositions = { ...this.identityPositions, [link.layoutId]: { ...this.identityPositions[link.layoutId], [category]: position } };
        else this.positions[this.getPositionKey(link, category)] = position;
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
        this._freeDragAttached = true;
    }

    detachFreeDrag() {
        this._escapedFreeDragClick = null;
        this._cancelFreeDrag?.();
        if (this.gridEl && this._freeDragAttached) {
            this.gridEl.removeEventListener('pointerdown', this._onPointerDown);
            this._freeDragAttached = false;
        }
    }

    onPointerDown(e) {
        if (this._templatePreview) return;
        // A fresh primary gesture cannot inherit the cancelled gesture's click.
        // An ignored secondary contact does not end the cancelled primary hold.
        if (e.isPrimary !== false) this._escapedFreeDragClick = null;
        // Keep modified clicks, nested buttons and other pointers as ordinary UI actions.
        if (this._shortcutUndoPending || window.LocalItabIdentity?.needs(this.links) || this.layoutController?.modePending || this._cancelFreeDrag || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.isPrimary === false) return;
        const interactive = e.target.closest('button, a, input, select, textarea, [contenteditable]');
        if (interactive && (interactive.disabled || !interactive.classList.contains('shortcut-launch'))) return;
        const item = e.target.closest('.shortcut-item');
        if (!item || item.classList.contains('add-shortcut') || !this.gridEl.contains(item)) return;
        const idx = parseInt(item.dataset.index, 10);
        const link = this.links[idx];
        if (!link) return;
        e.preventDefault();
        e.stopPropagation();

        const key = this.getPositionKey(link);
        const gs = Math.max(48, Math.min(240, this.layout.gridSize || 96));
        const gridRect = this.gridEl.getBoundingClientRect();
        const itemRect = item.getBoundingClientRect();
        const origLeft = itemRect.left - gridRect.left + (this.gridEl.scrollLeft || 0);
        const origTop = itemRect.top - gridRect.top + (this.gridEl.scrollTop || 0);
        const originalStyle = { left: item.style.left, top: item.style.top, transform: item.style.transform };
        const priorClickSuppression = this._suppressClickUntil;
        const offsetX = e.clientX - itemRect.left;
        const offsetY = e.clientY - itemRect.top;
        let moved = false;
        let finished = false;
        let current = { x: origLeft, y: origTop };
        this._dragStartPos = { x: e.clientX, y: e.clientY };
        this._dragMoved = false;

        let pointer = { x: e.clientX, y: e.clientY };
        let frame = null;
        const updatePosition = () => {
            if (!moved || finished) return;
            // Client coordinates must be converted against today's canvas, not
            // the pointerdown rectangle: ancestors and the canvas can scroll or
            // move while capture keeps the pointer on the same shortcut.
            const liveGrid = this.gridEl.getBoundingClientRect();
            const liveItem = item.getBoundingClientRect();
            current = this.clampToBounds(
                pointer.x - liveGrid.left - offsetX + (this.gridEl.scrollLeft || 0),
                pointer.y - liveGrid.top - offsetY + (this.gridEl.scrollTop || 0),
                liveItem.width, liveItem.height,
                Math.max(liveGrid.width, this.gridEl.scrollWidth || 0),
                Math.max(liveGrid.height, this.gridEl.scrollHeight || 0)
            );
            item.style.left = `${current.x}px`;
            item.style.top = `${current.y}px`;
            item.style.transform = 'none';
        };
        const trackGeometry = () => {
            frame = null;
            if (finished || !moved) return;
            updatePosition();
            // Layout shifts need not dispatch scroll or resize. Track them only
            // for the lifetime of an actual drag, including a stationary pointer.
            frame = window.requestAnimationFrame?.(trackGeometry) ?? null;
        };
        const onMove = event => {
            if (event.pointerId !== e.pointerId || finished) return;
            if (!moved && Math.abs(event.clientX - e.clientX) <= 3 && Math.abs(event.clientY - e.clientY) <= 3) return;
            event.preventDefault();
            event.stopPropagation();
            moved = true;
            pointer = { x: event.clientX, y: event.clientY };
            this._dragMoved = true;
            item.classList.add('drag-free');
            updatePosition();
            if (frame === null) frame = window.requestAnimationFrame?.(trackGeometry) ?? null;
        };
        const finish = (event, commit) => {
            if (finished || (event && event.pointerId !== e.pointerId)) return;
            if (commit && moved) updatePosition();
            finished = true;
            if (frame !== null) window.cancelAnimationFrame?.(frame);
            document.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener?.('resize', updatePosition);
            // Clear ownership/listeners before releasePointerCapture can emit lostcapture.
            this._cancelFreeDrag = null;
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onCancel);
            document.removeEventListener('keydown', onKeydown);
            document.removeEventListener('compositionstart', onCompositionStart);
            document.removeEventListener('compositionend', onCompositionEnd);
            document.removeEventListener('focusout', onCompositionEnd);
            compositionTarget = null;
            item.removeEventListener('lostpointercapture', onCancel);
            if (commit && moved) {
                event?.preventDefault();
                event?.stopPropagation();
                const finalGrid = this.gridEl.getBoundingClientRect();
                const finalItem = item.getBoundingClientRect();
                let target = this.clampToBounds(current.x, current.y, finalItem.width, finalItem.height, Math.max(finalGrid.width, this.gridEl.scrollWidth || 0), Math.max(finalGrid.height, this.gridEl.scrollHeight || 0));
                if (this.layout.alignToGrid) {
                    target = this.snapToGrid(target.x, target.y, gs);
                    target = this.avoidOverlap(target.x, target.y, gs, {
                        width: Math.max(finalGrid.width, this.gridEl.scrollWidth || 0), height: Math.max(finalGrid.height, this.gridEl.scrollHeight || 0),
                        tileWidth: finalItem.width, tileHeight: finalItem.height
                    }, key);
                }
                if (target) {
                    item.style.left = `${target.x}px`;
                    item.style.top = `${target.y}px`;
                    item.style.transform = 'none';
                    const previous = this.getSavedPosition(link);
                    if (!previous || previous.x !== target.x || previous.y !== target.y) {
                        this.setSavedPosition(link, this.getCurrentCategory(), { x: target.x, y: target.y });
                        this.saveLayoutDebounced(link.layoutId ? {} : { [key]: target }, link.layoutId ? { [key]: target } : {});
                        this.positionAddTile();
                    }
                } else {
                    Object.assign(item.style, originalStyle);
                    showErrorMessage((window.i18n && i18n.t('freeLayoutNoSpace')) ||
                        'No free grid space is available. The shortcut stayed in its original position.');
                }
                this._suppressClickUntil = Date.now() + 500;
            } else {
                Object.assign(item.style, originalStyle);
                this._suppressClickUntil = priorClickSuppression;
            }
            item.classList.remove('drag-free');
            this._dragMoved = false;
            this._dragStartPos = null;
            this.refreshShortcutUndo();
            try { item.releasePointerCapture?.(e.pointerId); } catch (_) {}
            if (this._repaintAfterFreeDrag) {
                this._repaintAfterFreeDrag = false;
                this.applyVisibleTransformsFromPositions();
                this.positionAddTile();
            }
        };
        const onUp = event => {
            if (event.pointerId !== e.pointerId || finished) return;
            // Release may carry a newer endpoint than the last pointermove.
            pointer = { x: event.clientX, y: event.clientY };
            finish(event, true);
        };
        const onCancel = event => finish(event, false);
        let compositionTarget = null;
        const onCompositionStart = event => { if (!finished) compositionTarget = event.target; };
        const onCompositionEnd = event => {
            if (!finished && compositionTarget === event.target) compositionTarget = null;
        };
        const onKeydown = event => {
            if (finished || event.key !== 'Escape' || event.defaultPrevented || event.repeat ||
                event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
            if (compositionTarget && (!compositionTarget.isConnected || !compositionTarget.contains(document.activeElement))) compositionTarget = null;
            if (event.isComposing || event.keyCode === 229 || compositionTarget) return;
            event.preventDefault();
            event.stopPropagation();
            // Escape may precede the physical release by any length of time.
            // Consume only that gesture's pointer click, never keyboard launch.
            this._escapedFreeDragClick = { item, pointerId: e.pointerId };
            finish(null, false);
        };
        this._cancelFreeDrag = () => finish(null, false);
        this.refreshShortcutUndo();
        document.addEventListener('scroll', updatePosition, true);
        window.addEventListener('resize', updatePosition);
        document.addEventListener('pointermove', onMove, { passive: false });
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onCancel);
        // Bubble so focused menus/dialogs can handle Escape before this session.
        document.addEventListener('keydown', onKeydown);
        document.addEventListener('compositionstart', onCompositionStart);
        document.addEventListener('compositionend', onCompositionEnd);
        document.addEventListener('focusout', onCompositionEnd);
        item.addEventListener('lostpointercapture', onCancel);
        try { item.setPointerCapture?.(e.pointerId); } catch (_) {}
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

    avoidOverlap(x, y, gs, bounds, draggedKey = null) {
        const { width, height, tileWidth, tileHeight } = bounds;
        if (![x, y, gs, width, height, tileWidth, tileHeight].every(Number.isFinite) ||
            gs <= 0 || tileWidth <= 0 || tileHeight <= 0 || width < tileWidth || height < tileHeight) return null;
        const maxColumn = Math.floor((width - tileWidth) / gs);
        const maxRow = Math.floor((height - tileHeight) / gs);
        if (!Number.isSafeInteger(maxColumn) || !Number.isSafeInteger(maxRow)) return null;
        const obstacles = [];
        const grid = this.gridEl;
        const gridRect = grid.getBoundingClientRect();
        const category = this.getCurrentCategory();
        for (const element of grid.querySelectorAll('.shortcut-item')) {
            if (element.classList.contains('add-shortcut') || element.style.display === 'none') continue;
            const link = this.links[Number(element.dataset.index)];
            const key = this.getPositionKey(link, category);
            if (key === draggedKey) continue;
            const rectangle = element.getBoundingClientRect();
            // A template/resize may fit a saved coordinate for display only.
            // Collide with the visible obstacle, without rewriting its raw position.
            const left = rectangle.left - gridRect.left + (grid.scrollLeft || 0);
            const top = rectangle.top - gridRect.top + (grid.scrollTop || 0);
            obstacles.push({ left, top, right: left + rectangle.width, bottom: top + rectangle.height });
        }

        // Search nearest cells lazily. A large saved canvas must not allocate or
        // scan an entire grid when the first nearby cell is already free.
        const heap = [];
        const visited = new Set();
        let sequence = 0;
        const before = (a, b) => a.distance < b.distance || (a.distance === b.distance && a.sequence < b.sequence);
        const push = (column, row) => {
            if (column < 0 || row < 0 || column > maxColumn || row > maxRow) return;
            const key = `${column}:${row}`;
            if (visited.has(key)) return;
            visited.add(key);
            const node = { column, row, distance: (column * gs - x) ** 2 + (row * gs - y) ** 2, sequence: sequence++ };
            let index = heap.length;
            heap.push(node);
            while (index > 0) {
                const parent = Math.floor((index - 1) / 2);
                if (!before(node, heap[parent])) break;
                heap[index] = heap[parent];
                index = parent;
            }
            heap[index] = node;
        };
        const pop = () => {
            const first = heap[0];
            const last = heap.pop();
            if (heap.length) {
                let index = 0;
                while (index * 2 + 1 < heap.length) {
                    let child = index * 2 + 1;
                    if (child + 1 < heap.length && before(heap[child + 1], heap[child])) child++;
                    if (!before(heap[child], last)) break;
                    heap[index] = heap[child];
                    index = child;
                }
                heap[index] = last;
            }
            return first;
        };
        push(Math.max(0, Math.min(maxColumn, Math.round(x / gs))), Math.max(0, Math.min(maxRow, Math.round(y / gs))));
        while (heap.length) {
            const { column, row } = pop();
            const left = column * gs;
            const top = row * gs;
            if (!obstacles.some(obstacle => left < obstacle.right && left + tileWidth > obstacle.left &&
                top < obstacle.bottom && top + tileHeight > obstacle.top)) return { x: left, y: top };
            push(column + 1, row);
            push(column, row + 1);
            push(column - 1, row);
            push(column, row - 1);
        }
        return null;
    }

    ensureLayoutController() {
        if (!this.layoutController) {
            this.layoutController = new window.LocalItabLayout.Controller({
                initial: this.layout,
                baseline: this.layoutBaseline,
                getLinks: () => this.links,
                onApply: (layout, state, snapshot) => {
                    const linksChanged = state === 'saved' && snapshot && JSON.stringify(snapshot.links) !== JSON.stringify(this.links);
                    if (linksChanged) this.links = snapshot.links;
                    const keepGesture = state === 'saved' && this._cancelFreeDrag &&
                        ['autoArrange', 'alignToGrid', 'columns', 'gridSize'].every(key => layout[key] === this.layout[key]);
                    if (!keepGesture) this._cancelFreeDrag?.();
                    this.layout = layout;
                    this.positions = layout.positions;
                    this.identityPositions = layout.positionsById || {};
                    // A previous accepted drag can finish saving during the next
                    // live gesture. Keep that pointer/visual ownership until release.
                    if (linksChanged) this.updateGrid();
                    else if (keepGesture) this._repaintAfterFreeDrag = true;
                    else this.applyLayoutMode({ persistMissing: state !== 'error' });
                },
                onError: error => console.warn('Layout save/read failed:', error)
            });
        }
        return this.layoutController;
    }

    setLayoutMode(value) {
        const patch = window.LocalItabLayout.flags(value);
        return patch ? this.setLayout(patch) : Promise.resolve(false);
    }

    setLayout(patch) {
        if (this._templatePreview) return Promise.resolve(false);
        this._cancelFreeDrag?.();
        this.cleanupDragState();
        return this.ensureLayoutController().change(patch);
    }

    saveLayoutDebounced(positions, identityPositions = {}) {
        if (this._templatePreview) return Promise.resolve(false);
        return this.ensureLayoutController().change({}, positions, { debounce: true, identityPositions });
    }

    reflowVisibleLayout() {
        this._cancelFreeDrag?.();
        if (this._templatePreview) {
            if (!this.layout.autoArrange) { this.applyVisibleTransformsFromPositions(); this.positionAddTile(); }
            return;
        }
        if (this.layout?.autoArrange) return;
        if (window.LocalItabIdentity?.needs(this.links)) { this.applyLayoutMode(); return; }
        this.initializeMissingPositions();
        this.applyVisibleTransformsFromPositions();
        this.positionAddTile();
    }

    // Initialize only missing visible view keys, using flat tile rectangles rather
    // than grouped Grid geometry. Existing category maps/fractional values survive.
    initializeMissingPositions(persist = true) {
        if (this._templatePreview) return;
        const grid = this.gridEl;
        if (!grid) return;
        const width = grid.getBoundingClientRect().width;
        const category = this.getCurrentCategory();
        const items = Array.from(grid.querySelectorAll('.shortcut-item'))
            .filter(el => !el.classList.contains('add-shortcut') && el.style.display !== 'none')
            .map(el => ({ el, link: this.links[Number(el.dataset.index)], key: this.getPositionKey(this.links[Number(el.dataset.index)], category), rect: el.getBoundingClientRect() }));
        let bottom = 0;
        for (const { link, rect } of items) {
            const position = this.getSavedPosition(link, category);
            if (position) bottom = Math.max(bottom, Math.max(0, position.y) + rect.height);
        }
        let x = 0, y = bottom ? bottom + 16 : 0, rowHeight = 0;
        const added = {}, identified = {};
        let identityPositions = this.identityPositions;
        for (const { link, key, rect } of items) {
            if (this.getSavedPosition(link, category) || Object.prototype.hasOwnProperty.call(identified, key)) continue;
            if (x && x + rect.width > width) { x = 0; y += rowHeight + 16; rowHeight = 0; }
            if (link.layoutId) {
                // Own one top-level copy for this batch; saved maps and untouched
                // views remain unchanged. Single drag writes keep their own setter.
                if (identityPositions === this.identityPositions) identityPositions = { ...identityPositions };
                identityPositions[link.layoutId] = { ...identityPositions[link.layoutId], [category]: { x, y } };
            } else this.setSavedPosition(link, category, { x, y });
            (link.layoutId ? identified : added)[key] = { x, y };
            x += rect.width + 16;
            rowHeight = Math.max(rowHeight, rect.height);
        }
        if (identityPositions !== this.identityPositions) this.identityPositions = identityPositions;
        if (persist && (Object.keys(added).length || Object.keys(identified).length)) this.saveLayoutDebounced(added, identified);
    }

    // Fit connected, intentionally overlapping compositions as a unit. Coordinates
    // are measured once; neither this helper nor its caller edits saved positions.
    fitFreeLayoutRectangles(rectangles, width) {
        if (!rectangles.length) return [];
        const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x &&
            a.y < b.y + b.height && a.y + a.height > b.y;
        if (rectangles.every(r => r.x >= 0 && r.y >= 0 && r.x + r.width <= width)) {
            return rectangles.map(r => ({ x: r.x, y: r.y }));
        }
        const parents = rectangles.map((_, i) => i);
        const root = i => {
            while (parents[i] !== i) { parents[i] = parents[parents[i]]; i = parents[i]; }
            return i;
        };
        const cellWidth = Math.max(1, ...rectangles.map(r => r.width));
        const cellHeight = Math.max(1, ...rectangles.map(r => r.height));
        const cells = new Map();
        rectangles.forEach((r, i) => {
            // At most four cells per tile, including enormous/negative saved coords.
            const keys = new Set();
            for (const x of [r.x, r.x + r.width]) for (const y of [r.y, r.y + r.height]) {
                keys.add(`${Math.floor(x / cellWidth)}:${Math.floor(y / cellHeight)}`);
            }
            for (const key of keys) {
                let groups = cells.get(key);
                if (!groups) { groups = new Map(); cells.set(key, groups); }
                // Compact component aliases lazily. Dense intentional stacks become
                // one bucket entry instead of repeatedly comparing every tile pair.
                for (const [id, members] of groups) {
                    const canonical = root(id);
                    if (canonical === id) continue;
                    groups.delete(id);
                    const existing = groups.get(canonical);
                    if (!existing) groups.set(canonical, members);
                    else {
                        const larger = existing.length >= members.length ? existing : members;
                        const smaller = larger === existing ? members : existing;
                        for (const member of smaller) larger.push(member);
                        groups.set(canonical, larger);
                    }
                }
                for (const [id, members] of groups) {
                    if (root(i) === root(id)) continue;
                    if (members.some(j => intersects(r, rectangles[j]))) parents[root(i)] = root(id);
                }
                const id = root(i);
                if (!groups.has(id)) groups.set(id, []);
                groups.get(id).push(i);
            }
        });
        const compositions = new Map();
        rectangles.forEach((r, i) => {
            const id = root(i);
            if (!compositions.has(id)) compositions.set(id, { members: [], x: r.x, y: r.y, right: r.x + r.width, bottom: r.y + r.height });
            const group = compositions.get(id);
            group.members.push(i);
            group.x = Math.min(group.x, r.x); group.y = Math.min(group.y, r.y);
            group.right = Math.max(group.right, r.x + r.width); group.bottom = Math.max(group.bottom, r.y + r.height);
        });
        const groups = Array.from(compositions.values()).map(group => ({ ...group,
            width: group.right - group.x, height: group.bottom - group.y }));
        // Reserve compositions already inside the viewport before fitting displaced
        // ones. Stable source order breaks ties and makes repeated reflows identical.
        const fits = g => g.x >= 0 && g.y >= 0 && g.right <= width;
        groups.sort((a, b) => Number(fits(b)) - Number(fits(a)) || a.members[0] - b.members[0]);
        const placed = [], result = [];
        let bottom = 0, checks = 0;
        for (const group of groups) {
            const x = Math.max(0, Math.min(group.x, width - group.width));
            let y = Math.max(0, group.y);
            if (!fits(group)) {
                // Collision work is bounded independently of canvas height. Once
                // exhausted, append remaining displaced groups below all content.
                let blocked;
                do {
                    blocked = false;
                    for (const obstacle of placed) {
                        if (++checks > 100000) { y = Math.max(y, bottom + 16); break; }
                        if (intersects({ x, y, width: group.width, height: group.height }, obstacle)) {
                            y = obstacle.y + obstacle.height + 16; blocked = true; break;
                        }
                    }
                } while (blocked);
            }
            placed.push({ x, y, width: group.width, height: group.height });
            bottom = Math.max(bottom, y + group.height);
            for (const i of group.members) result[i] = {
                x: x + rectangles[i].x - group.x, y: y + rectangles[i].y - group.y
            };
        }
        return result;
    }

    // Display-only fitting keeps saved coordinates intact across templates and widths.
    applyVisibleTransformsFromPositions() {
        const grid = this.gridEl;
        if (!grid) return;
        const currentCategory = this.getCurrentCategory();
        const width = grid.getBoundingClientRect().width;
        const items = [];
        for (const el of grid.querySelectorAll('.shortcut-item')) {
            if (el.classList.contains('add-shortcut') || el.style.display === 'none') continue;
            const link = this.links[Number(el.dataset.index)];
            if (!link) continue;
            const pos = this.getSavedPosition(link, currentCategory);
            if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
            const rect = el.getBoundingClientRect();
            items.push({ el, x: pos.x, y: pos.y, width: rect.width, height: rect.height });
        }
        const fitted = this.fitFreeLayoutRectangles(items, width);
        let bottom = 0, right = 0;
        items.forEach((item, i) => {
            const { x, y } = fitted[i];
            Object.assign(item.el.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, transform: 'none' });
            bottom = Math.max(bottom, y + item.height);
            right = Math.max(right, x + item.width);
        });
        // A composition wider than the canvas keeps its geometry and is reachable
        // by horizontal scrolling, rather than being clipped by the dashboard.
        grid.style.overflowX = right > width ? 'auto' : '';
        grid.style.overflowY = right > width ? 'hidden' : '';
        grid.style.minHeight = `${Math.max(320, bottom)}px`;
    }

    positionAddTile() {
        const grid = this.gridEl;
        if (!grid) return;
        const addEl = grid.querySelector('.shortcut-item.add-shortcut');
        if (!addEl) return;
        const gridRect = grid.getBoundingClientRect();
        let bottom = 0;
        // Empty dashboards and empty category filters keep their message/actions
        // in normal flow. Reserve that visible block before placing absolute Add.
        Array.from(grid.querySelectorAll('.shortcut-item, .shortcuts-empty-state')).forEach(el => {
            if (el.classList.contains('add-shortcut') || el.hidden || el.style.display === 'none') return;
            const rect = el.getBoundingClientRect();
            bottom = Math.max(bottom, rect.top - gridRect.top + rect.height);
        });
        const y = bottom ? bottom + 16 : 0;
        addEl.style.position = 'absolute';
        addEl.style.left = '0px';
        addEl.style.top = `${y}px`;
        addEl.style.transform = 'none';
        grid.style.minHeight = `${Math.max(320, y + addEl.getBoundingClientRect().height + (grid.style.overflowX === 'auto' ? 24 : 0))}px`;
    }

    /**
     * Handle drag start
     */
    handleDragStart(e) {
        if (this._templatePreview) { e.preventDefault(); return; }
        if (this._shortcutUndoPending || this._pendingDelete || this._shortcutOrderPending || this.layoutController?.modePending || !this.layout.autoArrange) {
            e.preventDefault();
            return;
        }
        if (e.target.closest('.shortcut-action-btn, .add-shortcut')) { e.preventDefault(); return; }
        const draggedItem = e.target.closest('.shortcut-item:not(.add-shortcut)');
        if (!draggedItem || !this.gridEl?.contains(draggedItem)) return;
        this.draggedIndex = parseInt(draggedItem.dataset.index);
        this.refreshShortcutUndo();

        // Add visual feedback
        // 使用一个延时来确保浏览器已经开始了拖拽操作
        setTimeout(() => {
            if (this.draggedIndex === Number(draggedItem.dataset.index)) draggedItem.classList.add('dragging');
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
        if (this._templatePreview) { e.preventDefault(); return; }
        e.preventDefault();
        
        const draggedIndex = this._shortcutUndoPending || this._pendingDelete || this._shortcutOrderPending || this.layoutController?.modePending || !this.layout.autoArrange ? null : this.draggedIndex;
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
        
        try {
            return await this.moveShortcutToIndex(draggedIndex, dropIndex);
        } finally {
            this.draggedIndex = null;
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
        this.refreshShortcutUndo();
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
    setShortcutIconContent(slot, icon, url, options = {}) {
        if (!slot) return;

        const fallback = () => {
            slot.textContent = '🌐';
        };
        const setImage = (src, asynchronous = false) => {
            if (options.isCurrent && !options.isCurrent(asynchronous)) return;
            const img = document.createElement('img');
            img.className = 'shortcut-icon-img';
            img.src = src;
            img.alt = '';
            img.draggable = false;
            img.loading = 'lazy';
            img.decoding = 'async';
            img.referrerPolicy = 'no-referrer';
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'contain';
            img.style.borderRadius = '4px';
            slot.replaceChildren(img);
        };

        if (!icon) {
            fallback();
            return;
        }

        if (icon.startsWith('data:image/')) {
            if (icon.length >= 200 && isSafeImageDataUrl(icon)) {
                setImage(icon);
            } else {
                fallback();
            }
            return;
        }

        if (icon.startsWith('http://') || icon.startsWith('https://')) {
            fallback();
            if (window.faviconCache) {
                Promise.resolve(options.cacheOnly ? window.faviconCache.peekIconDataUrl?.(icon) : window.faviconCache.getIconDataUrlByUrl(icon)).then((dataUrl) => {
                    if (!dataUrl || !isSafeImageDataUrl(dataUrl) || dataUrl.length < 200) return;
                    setImage(dataUrl, true);
                }).catch(() => {});
            }
            return;
        }

        slot.textContent = icon;

        if (window.faviconCache && url) {
            const origin = window.faviconCache.getOriginFromUrl(url);
            if (origin) {
                Promise.resolve(options.cacheOnly ? window.faviconCache.peekIconDataUrl?.(origin) : window.faviconCache.getIconDataUrl(origin)).then((dataUrl) => {
                    if (!dataUrl || !isSafeImageDataUrl(dataUrl) || dataUrl.length < 200) return;
                    setImage(dataUrl, true);
                }).catch(() => {});
            }
        }
    }

    /**
     * Fetch website icon automatically
     */
    cancelIconRequest() {
        this._iconIntentVersion = (this._iconIntentVersion || 0) + 1;
        const request = this._iconRequest;
        this._iconRequest = null;
        if (request) {
            request.button.disabled = request.disabled;
            request.button.innerHTML = request.html;
            request.button.style.animation = request.animation;
        }
    }

    async fetchWebsiteIcon() {
        const modal = this.modal;
        if (!modal?.classList.contains('active')) return;
        const urlInput = modal.querySelector('#shortcut-url');
        const iconInput = modal.querySelector('#shortcut-icon');
        const fetchBtn = modal.querySelector('#fetch-icon-btn');
        const url = urlInput.value.trim();
        if (!url) {
            this.showFormError('url', (window.i18n && i18n.t('urlRequiredFirst')) || 'Please enter a URL first');
            return;
        }
        if (!isOnlineFaviconsEnabled()) {
            this.showFormError('url', (window.i18n && i18n.t('onlineFaviconsDisabled')) || 'Enable online icon fetching in Settings > Privacy first.');
            return;
        }
        let validUrl;
        try {
            validUrl = new URL(normalizeHttpUrl(url));
        } catch {
            this.showFormError('url', (window.i18n && i18n.t('urlInvalid')) || 'Please enter a valid URL');
            return;
        }

        this.cancelIconRequest();
        const session = this._modalSession;
        const originalUrl = urlInput.value;
        const originalIcon = iconInput.value;
        const request = {
            button: fetchBtn, disabled: fetchBtn.disabled,
            html: fetchBtn.innerHTML, animation: fetchBtn.style.animation
        };
        this._iconRequest = request;
        const ownsDraft = () => this._iconRequest === request && this.modal === modal &&
            this._modalSession === session && modal.classList.contains('active') &&
            urlInput.value === originalUrl && iconInput.value === originalIcon && isOnlineFaviconsEnabled();
        fetchBtn.disabled = true;
        fetchBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>`;
        fetchBtn.style.animation = 'spin 1s linear infinite';
        try {
            // Use Google S2 only after the user explicitly enables online favicons.
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${validUrl.hostname}&sz=64`;
            const s2DataUrl = await this.fetchFaviconAsDataUrl(faviconUrl);
            if (ownsDraft()) {
                iconInput.value = s2DataUrl || faviconUrl;
                this.updateShortcutPreview();
            }
        } catch (error) {
            // A stale rejection belongs to its dismissed/changed draft too.
            if (ownsDraft()) {
                this.showFormError('url', window.i18n?.t('iconFetchFailed') || 'Could not fetch the icon. Please try again.');
            }
        } finally {
            // Older requests must not clear a newer request's loading state.
            if (this._iconRequest === request) this.cancelIconRequest();
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
        font-family: var(--font-family);
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
        this.defaultCategories = storageManager.getDefaultValue('categories');
        this.init();
    }

    async init() {
        this.categories = await storageManager.get('categories', this.defaultCategories);
        if (this.currentCategory !== 'all' && !this.categories.some(c => c.id === this.currentCategory)) {
            this.currentCategory = 'all';
        }
        this.render();
    }

    render({ reflow = true } = {}) {
        const list = document.getElementById('category-list');
        if (!list) return;

        list.replaceChildren();

        // All category
        const allItem = this.createNavItem({ id: 'all', name: (window.i18n && i18n.t('all')) || '全部', icon: '🌟' });
        list.appendChild(allItem);

        // User categories
        this.categories.forEach(cat => {
            const item = this.createNavItem(cat);
            list.appendChild(item);
        });

        this.updateCategoryUI();
        this.filterShortcuts({ reflow });
    }

    createNavItem(cat) {
        const btn = document.createElement('button');
        btn.className = 'category-item';
        btn.dataset.category = cat.id;
        btn.type = 'button';
        btn.title = cat.name || '';
        btn.setAttribute('aria-label', cat.name || cat.id);
        const icon = document.createElement('span');
        icon.className = 'category-icon';
        icon.textContent = cat.icon || '';
        const name = document.createElement('span');
        name.className = 'category-name';
        name.textContent = cat.name || '';
        const count = document.createElement('span');
        count.className = 'category-count';
        count.setAttribute('aria-hidden', 'true');
        btn.append(icon, name, count);
        btn.addEventListener('click', () => this.selectCategory(cat.id));
        btn.addEventListener('keydown', event => this.handleNavKeydown(event, btn));
        return btn;
    }

    handleNavKeydown(event, button) {
        if (event.defaultPrevented || event.target !== button || document.activeElement !== button ||
            event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.isComposing || event.keyCode === 229 ||
            !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        const list = document.getElementById('category-list');
        if (!list?.isConnected || button.parentElement !== list) return;

        // Read the live flex axis: templates and responsive widths can change
        // it without rebuilding these native buttons. Orthogonal arrows scroll.
        const style = window.getComputedStyle(list);
        const vertical = style.flexDirection.startsWith('column');
        let step = 0;
        if (event.key === (vertical ? 'ArrowDown' : 'ArrowRight')) step = 1;
        else if (event.key === (vertical ? 'ArrowUp' : 'ArrowLeft')) step = -1;
        else if (event.key !== 'Home' && event.key !== 'End') return;
        if (style.flexDirection.endsWith('reverse')) step *= -1;
        if (!vertical && style.direction === 'rtl') step *= -1;

        const items = Array.from(list.children).filter(item => item.classList.contains('category-item') &&
            !item.disabled && !item.closest('[hidden], [inert]') && item.getClientRects().length &&
            window.getComputedStyle(item).visibility === 'visible');
        const index = items.indexOf(button);
        if (index < 0) return;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
            (index + step + items.length) % items.length;
        event.preventDefault();
        event.stopPropagation();
        // Browsing categories is focus-only. Enter/Space/click keep the existing
        // explicit selection path, and Tab still reaches every native control.
        items[next].focus();
    }

    updateCounts(links = []) {
        const counts = new Map();
        for (const link of links) {
            const category = link.category || 'work';
            counts.set(category, (counts.get(category) || 0) + 1);
        }
        document.querySelectorAll('.category-item').forEach(item => {
            const count = item.dataset.category === 'all' ? links.length : counts.get(item.dataset.category) || 0;
            setText(item.querySelector('.category-count'), count);
        });
    }

    selectCategory(category) {
        if (window.appearanceController?.previewGuard || window.shortcutsComponentInstance?._templatePreview) return;
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
            item.setAttribute('aria-current', itemCategory === this.currentCategory ? 'page' : 'false');
            if (itemCategory === this.currentCategory) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    filterShortcuts({ reflow = true } = {}) {
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
        window.shortcutsComponentInstance?.updateCollectionVisibility?.();
        // trigger layout reflow in free layout mode to avoid chaos when switching categories
        if (reflow) {
            try { window.shortcutsComponentInstance?.reflowVisibleLayout?.(); } catch (_) {}
        }
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
