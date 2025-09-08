// Lightweight i18n helper for Chrome extensions (MV3)
// Usage: i18n.t('key', ['sub']) → chrome.i18n.getMessage('key', ['sub']) with graceful fallback

(function() {
	function getMessage(key, substitutions) {
		try {
			if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
				const msg = chrome.i18n.getMessage(key, substitutions || []);
				return msg || key;
			}
		} catch (_) {}
		return key;
	}

	function localizeAttribute(element, attr, key) {
		if (!element || !attr || !key) return;
		element.setAttribute(attr, getMessage(key));
	}

	function localizeElement(element) {
		if (!element) return;
		// data-i18n="msg_key" → textContent
		const key = element.getAttribute('data-i18n');
		if (key) {
			element.textContent = getMessage(key);
		}
		// data-i18n-title/placeholder/aria-label
		const titleKey = element.getAttribute('data-i18n-title');
		if (titleKey) localizeAttribute(element, 'title', titleKey);
		const placeholderKey = element.getAttribute('data-i18n-placeholder');
		if (placeholderKey) localizeAttribute(element, 'placeholder', placeholderKey);
		const ariaLabelKey = element.getAttribute('data-i18n-aria-label');
		if (ariaLabelKey) localizeAttribute(element, 'aria-label', ariaLabelKey);
	}

	function localizeDocument(root) {
		const scope = root || document;
		scope.querySelectorAll('[data-i18n], [data-i18n-title], [data-i18n-placeholder], [data-i18n-aria-label]')
			.forEach(localizeElement);
	}

	window.i18n = {
		t: getMessage,
		localizeDocument,
		localizeElement
	};
})();

