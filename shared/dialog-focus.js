(function initDialogFocus(global) {
    'use strict';

    // Keep keyboard and assistive-technology navigation inside an open overlay.
    // Each open owns its cleanup so closing an old dialog cannot affect a new one.
    function open(overlay, initialFocus, onClose) {
        const doc = overlay.ownerDocument;
        const returnFocus = doc.activeElement;
        const siblings = Array.from(doc.body.children)
            .filter(element => element !== overlay)
            .map(element => ({ element, inert: element.inert }));
        siblings.forEach(({ element }) => { element.inert = true; });
        overlay.classList.add('active');
        overlay.setAttribute('aria-hidden', 'false');

        let closed = false;
        let compositionTarget = null;
        const handleCompositionStart = event => { compositionTarget = event.target; };
        const handleCompositionEnd = event => {
            if (compositionTarget === event.target) compositionTarget = null;
        };
        const handleFocusOut = event => {
            if (compositionTarget === event.target) compositionTarget = null;
        };
        const handleKeydown = event => {
            if (closed) return;
            if (event.key === 'Enter' && event.repeat) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (event.key === 'Escape') {
                // Some IMEs omit the key flag. Track this opening's composing
                // field too, but release it if blur/end was lost on removal.
                if (compositionTarget && (!compositionTarget.isConnected || !compositionTarget.contains(doc.activeElement))) compositionTarget = null;
                if (event.isComposing || event.keyCode === 229 || compositionTarget) {
                    // Leave the native IME cancellation alone. Do not let the
                    // same Escape dismiss an outer dialog or erase this draft.
                    event.stopPropagation();
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                onClose();
                return;
            }
            if (event.key !== 'Tab') return;
            const controls = Array.from(overlay.querySelectorAll(
                'button, input, select, textarea, a[href], [tabindex]'
            )).filter(element => !element.disabled && element.tabIndex >= 0 &&
                !element.closest('[hidden], [inert]') && element.getClientRects().length);
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (!first) {
                event.preventDefault();
                return;
            }
            if (!overlay.contains(doc.activeElement) ||
                (event.shiftKey && doc.activeElement === first) ||
                (!event.shiftKey && doc.activeElement === last)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            }
        };
        overlay.addEventListener('compositionstart', handleCompositionStart);
        overlay.addEventListener('compositionend', handleCompositionEnd);
        overlay.addEventListener('focusout', handleFocusOut);
        overlay.addEventListener('keydown', handleKeydown);
        initialFocus?.focus();

        return () => {
            if (closed) return;
            closed = true;
            compositionTarget = null;
            overlay.removeEventListener('compositionstart', handleCompositionStart);
            overlay.removeEventListener('compositionend', handleCompositionEnd);
            overlay.removeEventListener('focusout', handleFocusOut);
            overlay.removeEventListener('keydown', handleKeydown);
            overlay.classList.remove('active');
            overlay.setAttribute('aria-hidden', 'true');
            siblings.forEach(({ element, inert }) => { element.inert = inert; });
            if (returnFocus?.isConnected && !returnFocus.closest('[inert]')) {
                returnFocus.focus();
            }
        };
    }

    global.LocalItabDialog = { open };
})(window);
