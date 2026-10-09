// New tab page JavaScript - with storage management
let dashboardHiddenState = false;
if (typeof window !== 'undefined') {
    window.dashboardHiddenState = dashboardHiddenState;
}
let currentUiState = null;
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
        // Initialize dashboard components with stored data
        const config = await initializeDashboard();
        const themePreset = applyThemePreset(config?.themePreset);

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
                theme: themePreset,
                onAction: handleContextAction
            });
        }

        setupDashboardVisibilityToggle(config?.ui);
        setupThemeChangeListener();
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
            if (action === 'open_all') {
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
        try {
            return normalizeHttpUrl(l.url);
        } catch (_) {
            return '';
        }
    }).filter(Boolean);
    if (!urls.length) return;

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
        window.localItabPrivacy = await getEffectivePrivacyConfig(config.privacy);
        window.faviconCache?.setOnlineEnabled?.(window.localItabPrivacy.onlineFavicons);

        // Apply theme preset early for consistent rendering
        applyThemePreset(config.themePreset);
        window.LocalItabAppearance?.apply(config.appearance);
        updateTemplateIntro(config.appearance?.template);

        // Apply background settings
        await applyBackgroundSettings(config.bg, window.localItabPrivacy);

        // Apply module visibility settings
        applyModuleVisibility(config.show);

        // Initialize components based on visibility settings
        if (config.show.clock) {
            initializeClockComponent(config.clock);
        }

        if (config.show.search) {
            initializeSearchComponent(config.search);
        }


        if (config.show.shortcuts) {
            initializeShortcutsComponent(config.links, config.layout, config.categories, config._layoutBaseline);
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
    window.appearanceController = window.LocalItabAppearance.mount(document.getElementById('dashboard-appearance'), {
        initial: config.appearance,
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
    if (!chrome?.storage?.onChanged) return;
    chrome.storage.onChanged.addListener((changes, areaName) => {
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
        notice.href = 'options.html#cloud-sync-settings';
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
            if (result?.applied) {
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
    const hasCards = window.localItabTasksVisible === true || window.localItabFocusVisible === true || ['weather', 'hot', 'movie'].some(key => showConfig[key] === true);
    document.getElementById('info-cards-container')?.classList.toggle('module-hidden', !hasCards);
    document.querySelector('.dashboard-main')?.classList.toggle('has-info-cards', hasCards);
}

function initializeSearchComponent(searchConfig = {}) {
    const container = document.getElementById('search-container');
    if (!container) return;

    const validEngines = ['google', 'bing', 'duck', 'custom'];
    let currentSearchConfig = {
        engine: validEngines.includes(searchConfig.engine) ? searchConfig.engine : 'google',
        custom: typeof searchConfig.custom === 'string' ? searchConfig.custom.trim() : ''
    };

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
    input.setAttribute('aria-describedby', calculatorStatus.id);
    const isCalculation = () => input.value.trimStart().startsWith('=');
    // The closure belongs to this search instance; remounting replaces the guard.
    window.localCalculatorView = { hasUncommittedWork: () => input.isConnected && isCalculation() };
    let composing = false;
    const updateCalculatorHint = () => {
        calculatorStatus.classList.remove('is-error');
        calculatorStatus.textContent = isCalculation()
            ? calculatorText('calculatorHint', 'Local calculator · Enter to calculate. Use decimals, + - * / and parentheses.')
            : calculatorText('calculatorDiscover', 'Tip: start with = to calculate locally, for example =(12 + 3) / 2');
        button.textContent = isCalculation()
            ? calculatorText('calculatorCalculate', 'Calculate')
            : ((window.i18n && i18n.t('search')) || 'Search');
    };
    input.addEventListener('input', updateCalculatorHint);
    input.addEventListener('compositionstart', () => { composing = true; updateCalculatorHint(); });
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
            customInput.value = currentSearchConfig.custom;
            setCustomStatus(
                currentSearchConfig.custom
                    ? ((window.i18n && i18n.t('customSearchUrlDesc')) || 'Use %s where the encoded query should be inserted.')
                    : ''
            );
            if (shouldFocus) customInput.focus();
        }
    };

    const persistSearchConfig = async (nextConfig) => {
        if (!window.storageManager || typeof storageManager.set !== 'function') return false;
        const saved = await storageManager.set('search', nextConfig);
        if (saved) currentSearchConfig = nextConfig;
        return saved;
    };

    const saveCustomSearch = async () => {
        const rawTemplate = customInput.value.trim();
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

        const nextConfig = { engine: 'custom', custom: normalizedTemplate };
        const saved = await persistSearchConfig(nextConfig);
        if (!saved) {
            setCustomStatus((window.i18n && i18n.t('failedToSave')) || 'Failed to save. Please try again.', 'error');
            return false;
        }

        select.value = 'custom';
        customInput.value = normalizedTemplate;
        setCustomStatus((window.i18n && i18n.t('customSearchSaved')) || 'Custom search saved', 'success');
        return true;
    };

    select.addEventListener('change', async () => {
        const engine = select.value;
        updateCustomConfigVisibility(engine === 'custom' && !currentSearchConfig.custom);

        if (engine !== 'custom') {
            await persistSearchConfig({ ...currentSearchConfig, engine });
            return;
        }

        await persistSearchConfig({ ...currentSearchConfig, engine: 'custom' });
    });

    customSave.addEventListener('click', () => saveCustomSearch());

    customInput.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        saveCustomSearch();
    });

    form.append(select, input, button, calculatorStatus, customConfig);
    updateCustomConfigVisibility(false);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (composing || event.isComposing) return;
        // Intercept the explicit prefix before URL normalization or engine lookup.
        // Errors and a missing helper must never send expressions to a provider.
        if (isCalculation()) {
            const result = window.LocalItabCalculator?.calculate(input.value.trimStart().slice(1)) || { error: 'unavailable' };
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
            return;
        }
        const query = input.value.trim();
        if (!query) return;

        try {
            const directUrl = normalizeHttpUrl(query);
            if (/^[\w.-]+\.[a-z]{2,}([/:?#]|$)/i.test(query) || /^https?:\/\//i.test(query)) {
                window.open(directUrl, '_blank');
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
        window.open(url, '_blank');
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
        const locale = this.getDateLocale();
        const dayOfWeek = date.toLocaleDateString(locale, { weekday: 'long' });
        const month = date.toLocaleDateString(locale, { month: 'long' });
        const day = date.getDate();
        const year = date.getFullYear();

        const dayOfYear = this.getDayOfYear(date);
        const weekNumber = this.getWeekNumber(date);

        const dayLabel = (window.i18n && i18n.t('dayOfYear')) || 'Day';
        const weekLabel = (window.i18n && i18n.t('weekNumber')) || 'Week';
        return `${dayOfWeek}, ${month} ${day}, ${year} • ${dayLabel} ${dayOfYear} • ${weekLabel} ${weekNumber}`;
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



function initializeShortcutsComponent(linksConfig, layoutConfig, categoriesConfig, layoutBaseline) {
    const shortcutsContainer = document.getElementById('shortcuts-container');
    if (!shortcutsContainer) return;

    // Create shortcuts component
    const shortcutsComponent = new ShortcutsComponent(linksConfig, layoutConfig, categoriesConfig, layoutBaseline);
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

function setupDashboardVisibilityToggle(uiConfig) {
    const defaults = (window.storageManager && storageManager.defaultConfig && storageManager.defaultConfig.ui)
        ? storageManager.defaultConfig.ui
        : { dashboardHidden: false, dashboardPadding: null, showShortcutTitles: true };

    currentUiState = { ...defaults, ...(uiConfig || {}) };
    dashboardHiddenState = !!currentUiState.dashboardHidden;
    applyDashboardHiddenState(dashboardHiddenState);
    applyUiPreferences(currentUiState);
    if (typeof window !== 'undefined') {
        window.dashboardHiddenState = dashboardHiddenState;
    }

    const dashboard = document.getElementById('dashboard');
    if (!dashboard) return;

    dashboard.addEventListener('dblclick', (event) => {
        if (!shouldToggleFromEvent(event)) {
            return;
        }

        const selection = window.getSelection ? window.getSelection() : null;
        if (selection && selection.rangeCount) {
            selection.removeAllRanges?.();
        }

        event.preventDefault();
        const nextState = !dashboardHiddenState;
        setDashboardHidden(nextState);
    });
}

function shouldToggleFromEvent(event) {
    const interactiveSelectors = 'button, a, input, textarea, select, summary, [contenteditable], .local-tasks-card, .local-focus-card, .tasks-overlay, .shortcut-item, .category-nav, .settings-button, .category-manage-btn, .shortcut-action-btn, .context-menu';
    if (!event || !event.target) return false;
    return !event.target.closest(interactiveSelectors);
}

function applyDashboardHiddenState(hidden) {
    document.body.classList.toggle('dashboard-hidden', !!hidden);
}

function setDashboardHidden(hidden) {
    dashboardHiddenState = !!hidden;
    applyDashboardHiddenState(dashboardHiddenState);
    if (typeof window !== 'undefined') {
        window.dashboardHiddenState = dashboardHiddenState;
    }

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
        this._pendingSave = null;
        this._pendingDelete = false;
        this._modalFocusOrigin = null;
    }

    /**
     * Render the shortcuts component
     */
    render() {
        this._cancelFreeDrag?.();
        if (!this.container) return;
        this.finderView?.destroy();

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
        this.container.replaceChildren(header, grid);
        this.finderView = window.LocalItabFinder?.mountForShortcuts(header, this);
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

    refreshTemplate() {
        this._cancelFreeDrag?.();
        if (this.layout.autoArrange) this.updateGrid();
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

        const icon = document.createElement('span');
        icon.className = 'shortcut-icon';
        icon.setAttribute('aria-hidden', 'true');
        this.setShortcutIconContent(icon, link.icon || '🌐', link.url);

        const title = document.createElement('span');
        title.className = 'shortcut-title';
        title.textContent = link.title || '';

        content.append(icon, title);

        const actions = document.createElement('div');
        actions.className = 'shortcut-actions';
        actions.append(
            this.createShortcutAction('edit', index, (window.i18n && i18n.t('edit')) || 'Edit', '✎'),
            this.createShortcutAction('delete', index, (window.i18n && i18n.t('remove')) || 'Delete', '×')
        );

        item.append(content, actions);
        return item;
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
    }

    handleGridClick(e) {
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
            chrome.runtime.openOptionsPage();
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
        if (target < 0) return false;
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

    async saveShortcutLinks(next, previous, operation) {
        this._shortcutWritesPending = (this._shortcutWritesPending || 0) + 1;
        const controller = this.layoutController;
        controller?.holdShortcutMutation();
        try {
            if (controller) await controller.flush();
            const saved = await storageManager.set('links', next, {
                expectedLinks: previous, returnSnapshot: true, operation,
                ...(controller ? { expectedLayoutGeneration: controller.generation } : {})
            });
            if (saved?.links) {
                this.links = saved.links;
                this.layout = saved.layout;
                this.positions = saved.layout.positions;
                this.identityPositions = saved.layout.positionsById || {};
                controller?.adoptOwnShortcutSnapshot(saved);
            }
            return saved;
        } finally {
            this._shortcutWritesPending--;
            controller?.releaseShortcutMutation();
        }
    }

    async createStarterSet() {
        if (this.links.length) return;
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

        // Clear previous errors
        this.clearFormErrors();

        // Show modal
        this._closeModal?.();
        this._modalFocusOrigin = this.captureGridFocus();
        this._closeModal = window.LocalItabDialog.open(this.modal, titleInput, () => this.hideModal());
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
        for (const selector of ['#shortcut-url', '#shortcut-icon']) {
            const input = this.modal.querySelector(selector);
            for (const event of ['input', 'change']) {
                input.addEventListener(event, () => this.cancelIconRequest());
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

        const title = titleInput.value.trim();
        let url = urlInput.value.trim();
        const icon = iconInput.value.trim() || '🌐';
        const category = (categorySelect?.value || 'work').trim();

        // Validate form
        if (!this.validateForm(title, url)) {
            return;
        }
        url = normalizeHttpUrl(url);

        const saveSession = this._modalSession;
        const pendingSave = {};
        this._pendingSave = pendingSave;
        this.setSavingState(true);

        // Save shortcut WITHOUT overwriting user's original icon field
        const shortcut = { ...(this.links[this.currentEditIndex]?.layoutId ? { layoutId: this.links[this.currentEditIndex].layoutId } : {}), title, url, icon, category };
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
            const ownsFocus = this._modalSession === saveSession && this.modal.contains?.(document.activeElement);
            const focusIntent = ownsFocus ? (editIndex >= 0
                ? { key: this.getShortcutFocusKey(shortcut), index: editIndex, action: this._modalFocusOrigin?.action === 'edit' ? 'edit' : 'launch' }
                : { action: 'add' }) : null;
            this.links = saved.links || nextLinks;
            if (this._modalSession === saveSession) this.hideModal();
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
        this._isSaving = !!(isSaving || this._pendingDelete);
        const saveBtn = this.modal?.querySelector('#save-btn');
        if (saveBtn) {
            saveBtn.disabled = this._isSaving || this._hasShortcutConflict;
            saveBtn.classList.toggle('is-disabled', saveBtn.disabled);
        }
    }

    recoverShortcutWrite(error, previousLinks) {
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
        if (this._shortcutOrderPending || this._shortcutWritesPending || this._pendingSave || this._pendingDelete) {
            showErrorMessage(window.i18n?.t('shortcutOrderPending') || 'Wait for shortcut order to finish saving, then try again.');
            return false;
        }
        if (index < 0 || index >= this.links.length) return false;
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
        const tile = active.closest('.shortcut-item');
        if (!tile) return null;
        return {
            key: tile.dataset.focusKey,
            index: Number(tile.dataset.index),
            action: ['edit', 'delete'].includes(active.dataset?.action) ? active.dataset.action : 'launch'
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
        if (intent.action !== 'add') {
            const visible = Array.from(grid.querySelectorAll('.shortcut-item:not(.add-shortcut)'))
                .filter(tile => this.isVisibleFocusTarget(tile));
            const matches = visible.filter(tile => tile.dataset.focusKey === intent.key)
                .sort((a, b) => Math.abs(Number(a.dataset.index) - intent.index) - Math.abs(Number(b.dataset.index) - intent.index));
            const sameTile = matches[0];
            const tile = sameTile || visible.find(item => Number(item.dataset.index) >= intent.index) || visible[visible.length - 1];
            const action = sameTile && ['edit', 'delete'].includes(intent.action) ? intent.action : 'open';
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
        if (this._renderedGrouping !== undefined && this._renderedGrouping !== this.usesCollections()) {
            grid.replaceChildren(this.buildShortcutsFragment());
            window.categoryNavigation?.filterShortcuts({ reflow: false });
            this.updateCollectionVisibility();
        }
        this.applyAutoColumns();
        if (this.layout?.autoArrange) {
            grid.classList.remove('free-layout');
            grid.style.minHeight = '';
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
            if (window.LocalItabIdentity?.needs(this.links)) {
                this.detachFreeDrag();
                const controller = this.ensureLayoutController();
                if (!controller.modePending && !controller.pending && !controller.failedChange && persistMissing) controller.change({ autoArrange: false });
                this.applyVisibleTransformsFromPositions();
                this.positionAddTile();
                return;
            }
            this.initializeMissingPositions(persistMissing);
            this.applyVisibleTransformsFromPositions();
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
        this._cancelFreeDrag?.();
        if (this.gridEl && this._freeDragAttached) {
            this.gridEl.removeEventListener('pointerdown', this._onPointerDown);
            this._freeDragAttached = false;
        }
    }

    onPointerDown(e) {
        // Keep modified clicks, nested buttons and other pointers as ordinary UI actions.
        if (window.LocalItabIdentity?.needs(this.links) || this.layoutController?.modePending || this._cancelFreeDrag || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.isPrimary === false) return;
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
        const origLeft = itemRect.left - gridRect.left;
        const origTop = itemRect.top - gridRect.top;
        const originalStyle = { left: item.style.left, top: item.style.top, transform: item.style.transform };
        const priorClickSuppression = this._suppressClickUntil;
        const offsetX = e.clientX - itemRect.left;
        const offsetY = e.clientY - itemRect.top;
        let moved = false;
        let finished = false;
        let current = { x: origLeft, y: origTop };
        this._dragStartPos = { x: e.clientX, y: e.clientY };
        this._dragMoved = false;

        const onMove = event => {
            if (event.pointerId !== e.pointerId || finished) return;
            if (!moved && Math.abs(event.clientX - e.clientX) <= 3 && Math.abs(event.clientY - e.clientY) <= 3) return;
            event.preventDefault();
            event.stopPropagation();
            moved = true;
            this._dragMoved = true;
            item.classList.add('drag-free');
            current = this.clampToBounds(
                event.clientX - gridRect.left - offsetX,
                event.clientY - gridRect.top - offsetY,
                itemRect.width, itemRect.height, gridRect.width, gridRect.height
            );
            item.style.left = `${current.x}px`;
            item.style.top = `${current.y}px`;
            item.style.transform = 'none';
        };
        const finish = (event, commit) => {
            if (finished || (event && event.pointerId !== e.pointerId)) return;
            finished = true;
            // Clear ownership/listeners before releasePointerCapture can emit lostcapture.
            this._cancelFreeDrag = null;
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            document.removeEventListener('pointercancel', onCancel);
            item.removeEventListener('lostpointercapture', onCancel);
            if (commit && moved) {
                event?.preventDefault();
                event?.stopPropagation();
                const finalGrid = this.gridEl.getBoundingClientRect();
                const finalItem = item.getBoundingClientRect();
                let target = this.clampToBounds(current.x, current.y, finalItem.width, finalItem.height, finalGrid.width, finalGrid.height);
                if (this.layout.alignToGrid) {
                    target = this.snapToGrid(target.x, target.y, gs);
                    target = this.avoidOverlap(target.x, target.y, gs, {
                        width: finalGrid.width, height: finalGrid.height,
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
            try { item.releasePointerCapture?.(e.pointerId); } catch (_) {}
            if (this._repaintAfterFreeDrag) {
                this._repaintAfterFreeDrag = false;
                this.applyVisibleTransformsFromPositions();
                this.positionAddTile();
            }
        };
        const onUp = event => finish(event, true);
        const onCancel = event => finish(event, false);
        this._cancelFreeDrag = () => finish(null, false);
        document.addEventListener('pointermove', onMove, { passive: false });
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onCancel);
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
            const left = rectangle.left - gridRect.left;
            const top = rectangle.top - gridRect.top;
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
        this._cancelFreeDrag?.();
        this.cleanupDragState();
        return this.ensureLayoutController().change(patch);
    }

    saveLayoutDebounced(positions, identityPositions = {}) {
        return this.ensureLayoutController().change({}, positions, { debounce: true, identityPositions });
    }

    reflowVisibleLayout() {
        this._cancelFreeDrag?.();
        if (this.layout?.autoArrange) return;
        if (window.LocalItabIdentity?.needs(this.links)) { this.applyLayoutMode(); return; }
        this.initializeMissingPositions();
        this.applyVisibleTransformsFromPositions();
        this.positionAddTile();
    }

    // Initialize only missing visible view keys, using flat tile rectangles rather
    // than grouped Grid geometry. Existing category maps/fractional values survive.
    initializeMissingPositions(persist = true) {
        const grid = this.gridEl;
        if (!grid) return;
        const width = grid.getBoundingClientRect().width;
        const items = Array.from(grid.querySelectorAll('.shortcut-item'))
            .filter(el => !el.classList.contains('add-shortcut') && el.style.display !== 'none')
            .map(el => ({ el, link: this.links[Number(el.dataset.index)], key: this.getPositionKey(this.links[Number(el.dataset.index)]), rect: el.getBoundingClientRect() }));
        let bottom = 0;
        for (const { link, rect } of items) {
            const position = this.getSavedPosition(link);
            if (position) bottom = Math.max(bottom, Math.max(0, position.y) + rect.height);
        }
        let x = 0, y = bottom ? bottom + 16 : 0, rowHeight = 0;
        const added = {}, identified = {};
        for (const { link, key, rect } of items) {
            if (this.getSavedPosition(link)) continue;
            if (x && x + rect.width > width) { x = 0; y += rowHeight + 16; rowHeight = 0; }
            this.setSavedPosition(link, this.getCurrentCategory(), { x, y });
            (link.layoutId ? identified : added)[key] = { x, y };
            x += rect.width + 16;
            rowHeight = Math.max(rowHeight, rect.height);
        }
        if (persist && (Object.keys(added).length || Object.keys(identified).length)) this.saveLayoutDebounced(added, identified);
    }

    // Display-only fitting keeps saved coordinates intact across templates and widths.
    applyVisibleTransformsFromPositions() {
        const grid = this.gridEl;
        if (!grid) return;
        const currentCategory = this.getCurrentCategory();
        const width = grid.getBoundingClientRect().width;
        let bottom = 0;
        Array.from(grid.querySelectorAll('.shortcut-item')).forEach(el => {
            if (el.classList.contains('add-shortcut') || el.style.display === 'none') return;
            const link = this.links[Number(el.dataset.index)];
            if (!link) return;
            const pos = this.getSavedPosition(link, currentCategory);
            if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
            const rect = el.getBoundingClientRect();
            const x = Math.max(0, Math.min(pos.x, Math.max(0, width - rect.width)));
            const y = Math.max(0, pos.y);
            el.style.position = 'absolute';
            el.style.left = `${x}px`;
            el.style.top = `${y}px`;
            el.style.transform = 'none';
            bottom = Math.max(bottom, y + rect.height);
        });
        grid.style.minHeight = `${Math.max(320, bottom)}px`;
    }

    positionAddTile() {
        const grid = this.gridEl;
        if (!grid) return;
        const addEl = grid.querySelector('.shortcut-item.add-shortcut');
        if (!addEl) return;
        const gridRect = grid.getBoundingClientRect();
        let bottom = 0;
        Array.from(grid.querySelectorAll('.shortcut-item')).forEach(el => {
            if (el.classList.contains('add-shortcut') || el.style.display === 'none') return;
            const rect = el.getBoundingClientRect();
            bottom = Math.max(bottom, rect.top - gridRect.top + rect.height);
        });
        const y = bottom ? bottom + 16 : 0;
        addEl.style.position = 'absolute';
        addEl.style.left = '0px';
        addEl.style.top = `${y}px`;
        addEl.style.transform = 'none';
        grid.style.minHeight = `${Math.max(320, y + addEl.getBoundingClientRect().height)}px`;
    }

    /**
     * Handle drag start
     */
    handleDragStart(e) {
        if (this._pendingDelete || this._shortcutOrderPending || this.layoutController?.modePending || !this.layout.autoArrange) {
            e.preventDefault();
            return;
        }
        if (e.target.closest('.shortcut-action-btn, .add-shortcut')) { e.preventDefault(); return; }
        const draggedItem = e.target.closest('.shortcut-item:not(.add-shortcut)');
        if (!draggedItem || !this.gridEl?.contains(draggedItem)) return;
        this.draggedIndex = parseInt(draggedItem.dataset.index);

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
        e.preventDefault();
        
        const draggedIndex = this._pendingDelete || this._shortcutOrderPending || this.layoutController?.modePending || !this.layout.autoArrange ? null : this.draggedIndex;
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
        
        const previousLinks = this.links.map(link => ({ ...link }));

        // --- 核心排序逻辑 ---
        // 1. 从数组中把被拖拽的元素"拿出来"
        const itemToMove = this.links.splice(draggedIndex, 1)[0];
        // 2. 把拿出来的元素插入到目标位置
        this.links.splice(dropIndex, 0, itemToMove);
        
        try {
            // 3. 将重新排序后的数组保存到存储中
            const saved = await this.saveShortcutLinks(this.links, previousLinks, { type: 'reorder', from: draggedIndex, to: dropIndex });
            if (!saved) {
                throw new Error('Storage write returned false');
            }
            console.log('Shortcuts reordered and saved successfully.');
        } catch (error) {
            const message = this.recoverShortcutWrite(error, previousLinks);
            console.error('Error saving shortcut order:', error);
            showErrorMessage(message || 'Failed to save new shortcut order.');
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
    setShortcutIconContent(slot, icon, url) {
        if (!slot) return;

        const fallback = () => {
            slot.textContent = '🌐';
        };
        const setImage = (src) => {
            const img = document.createElement('img');
            img.className = 'shortcut-icon-img';
            img.src = src;
            img.alt = '';
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
                window.faviconCache.getIconDataUrlByUrl(icon).then((dataUrl) => {
                    if (!dataUrl || !isSafeImageDataUrl(dataUrl) || dataUrl.length < 200) return;
                    setImage(dataUrl);
                });
            }
            return;
        }

        slot.textContent = icon;

        if (window.faviconCache && url) {
            const origin = window.faviconCache.getOriginFromUrl(url);
            if (origin) {
                window.faviconCache.getIconDataUrl(origin).then((dataUrl) => {
                    if (!dataUrl || !isSafeImageDataUrl(dataUrl) || dataUrl.length < 200) return;
                    setImage(dataUrl);
                });
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
            if (ownsDraft()) iconInput.value = s2DataUrl || faviconUrl;
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
        this.filterShortcuts();
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
        return btn;
    }

    updateCounts(links = []) {
        document.querySelectorAll('.category-item').forEach(item => {
            const count = item.dataset.category === 'all' ? links.length : links.filter(link => (link.category || 'work') === item.dataset.category).length;
            setText(item.querySelector('.category-count'), count);
        });
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
