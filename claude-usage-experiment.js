(function () {
    'use strict';
    // Keep the HTML's English safety text if the message API is unavailable.
    // The shared helper chooses document language from Chrome's actual catalog.
    const staticText = Array.from(document.querySelectorAll('[data-i18n], [data-i18n-aria-label]'), node => ({
        node, text: node.textContent, textKey: node.getAttribute('data-i18n'),
        label: node.getAttribute('aria-label'), labelKey: node.getAttribute('data-i18n-aria-label')
    }));
    window.i18n?.localizeDocument(document);
    for (const item of staticText) {
        if (item.textKey && (!item.node.textContent || item.node.textContent === item.textKey)) item.node.textContent = item.text;
        if (item.labelKey && (!item.node.getAttribute('aria-label') || item.node.getAttribute('aria-label') === item.labelKey)) item.node.setAttribute('aria-label', item.label);
    }
    const result = document.getElementById('result');
    const fallback = {
        "Disabled": "Closed. No snapshot has been saved.",
        "PageChanged": "The target page closed or navigated. Results were cleared. Enable again to continue.",
        "Loading": "Waiting for permission or reading…",
        "ReadUnavailable": "Unable to read. Select a page and an organization again.",
        "ChooseTab": "Choose an already-open Claude tab. Numbers are browser tab IDs; page titles are not read.",
        "NoTabs": "No open Claude tabs were found. Open the official site yourself, then enable again.",
        "TabLabel": "Claude tab #{id}",
        "ChooseOrganization": "Choose one organization for this read. Even a single organization must be selected manually.",
        "NoOrganizations": "No organizations were returned for this session.",
        "UnnamedOrganization": "Unnamed organization",
        "SnapshotHeading": "Usage snapshot for the organization selected in this page session: {organization}",
        "NoWindows": "This organization did not provide subscription windows.",
        "FiveHourWindow": "5-hour window",
        "SevenDayWindow": "7-day window",
        "WindowUnavailable": "{window}: not provided",
        "WindowUsage": "{window}: used {percent}% · Reset time: {reset}",
        "UnknownReset": "Unknown",
        "FetchedAt": "Collected at: {time}. Reading again requires selecting the tab and organization again.",
        "ErrorInvalidSelection": "Invalid selection. Select a page and an organization again.",
        "ErrorHttp": "The official site returned an unexpected status. No usage was displayed.",
        "ErrorUnsupportedResponse": "This browser cannot safely read this response.",
        "ErrorReadFailed": "The read failed. Select a page and an organization again.",
        "ErrorPermissionDenied": "The required permissions were not granted.",
        "ErrorWrongPage": "Choose a page on the exact claude.ai origin.",
        "ErrorDocumentChanged": "The page changed. Select it again.",
        "ErrorOrganizationsChanged": "The organization list changed. Select again.",
        "ErrorLoginRequired": "Go to the Claude site and sign in yourself.",
        "ErrorAccessDenied": "Access was denied. Check access permissions or verification requirements on the official site.",
        "ErrorChallenge": "The official site requires verification. Complete it yourself.",
        "ErrorRateLimited": "Too many requests. Retry manually later.",
        "ErrorTemporary": "Claude is temporarily unavailable.",
        "ErrorSchemaChanged": "The response format was unexpected. No usage was displayed.",
        "ErrorNonJson": "A non-JSON page was returned. The official site may require verification.",
        "ErrorNetwork": "The network read failed or was redirected. Check the official site.",
        "ErrorTimeout": "The read timed out.",
        "ErrorTooLarge": "The response was too large. Reading stopped."
    };
    const errors = {"invalid_selection": "ErrorInvalidSelection", "http_error": "ErrorHttp", "unsupported_response": "ErrorUnsupportedResponse", "read_failed": "ErrorReadFailed", "permission_denied": "ErrorPermissionDenied", "wrong_page": "ErrorWrongPage", "document_changed": "ErrorDocumentChanged", "organizations_changed": "ErrorOrganizationsChanged", "login_required": "ErrorLoginRequired", "access_denied": "ErrorAccessDenied", "challenge": "ErrorChallenge", "rate_limited": "ErrorRateLimited", "temporary_error": "ErrorTemporary", "schema_changed": "ErrorSchemaChanged", "non_json": "ErrorNonJson", "network_or_redirect": "ErrorNetwork", "timeout": "ErrorTimeout", "too_large": "ErrorTooLarge"};
    const t = name => {
        const key = `claudeUsage${name}`, value = window.i18n?.t(key);
        return value && value !== key ? value : fallback[name];
    };
    const format = (key, values) => t(key).replace(/\{(\w+)\}/g, (token, name) => Object.hasOwn(values, name) ? String(values[name]) : token);
    function line(text) { const p = document.createElement('p'); p.textContent = text; result.append(p); }
    function button(label, action) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', action); result.append(b); }
    const controller = ClaudeUsageSnapshot.createController(chrome, state => {
        const hadFocus = result.contains(document.activeElement);
        result.replaceChildren();
        if (['disabled', 'idle'].includes(state.phase)) line(t('Disabled'));
        else if (state.phase === 'page_changed') line(t('PageChanged'));
        else if (['enabling', 'loading'].includes(state.phase)) line(t('Loading'));
        else if (state.phase === 'error') line(t(Object.hasOwn(errors, state.error) ? errors[state.error] : 'ReadUnavailable'));
        else if (state.phase === 'tabs') {
            line(t(state.tabs.length ? 'ChooseTab' : 'NoTabs'));
            state.tabs.forEach(tab => button(format('TabLabel', { id: tab.id }), () => controller.selectTab(tab.id)));
        } else if (state.phase === 'organizations') {
            line(t(state.organizations.length ? 'ChooseOrganization' : 'NoOrganizations'));
            state.organizations.forEach(org => button(org.displayLabel, () => controller.selectOrganization(org.id)));
        } else if (state.phase === 'snapshot') {
            line(format('SnapshotHeading', { organization: state.organizationLabel }));
            if (state.unavailable) line(t('NoWindows'));
            for (const [key, label] of [['five_hour', t('FiveHourWindow')], ['seven_day', t('SevenDayWindow')]]) {
                const window = state.windows[key];
                line(window === null ? format('WindowUnavailable', { window: label }) : format('WindowUsage', { window: label, percent: window.usedPercent, reset: window.resetAt || t('UnknownReset') }));
            }
            line(format('FetchedAt', { time: state.fetchedAt }));
        }
        if (hadFocus) result.focus();
    }, { unnamedOrganizationLabel: t('UnnamedOrganization') });
    document.getElementById('enable').addEventListener('click', () => controller.enable());
    document.getElementById('close').addEventListener('click', () => controller.close());
    document.getElementById('back').addEventListener('click', () => controller.close());
    window.addEventListener('pagehide', () => controller.close());
    window.addEventListener('unload', () => controller.dispose());
    controller.close();
})();
