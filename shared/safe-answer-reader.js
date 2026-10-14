/* Local read-only Markdown. Untrusted tokens never become HTML or attributes. */
(function (root) {
    'use strict';
    const LIMITS = Object.freeze({ chars: 32000, depth: 24, tokens: 6000, nodes: 8000, work: 512000, punctuation: 512 });
    const TAGS = new Set(['div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'del', 'code', 'pre', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br', 'hr']);
    function render(doc, source) {
        const fallback = () => { const node = doc.createElement('pre'); node.className = 'answer-reader-source'; node.textContent = source; node.tabIndex = 0; return { node, fallback: true }; };
        try {
            if (typeof source !== 'string' || source.length > LIMITS.chars || !root.marked?.Lexer) return fallback();
            // Conservative linear preflight, not a Markdown parser. Punctuation-
            // dense input can be expensive inside a lexer regular expression,
            // before a token or recursive-call budget can observe it.
            let punctuation = 0;
            for (let i = 0; i < source.length; i++) {
                const code = source.charCodeAt(i);
                if (((code >= 33 && code <= 47) || (code >= 58 && code <= 64) ||
                    (code >= 91 && code <= 96) || (code >= 123 && code <= 126)) &&
                    ++punctuation > LIMITS.punctuation) return fallback();
            }
            const lexer = new root.marked.Lexer({ gfm: true, breaks: false, pedantic: false });
            // Guard recursion before lexing child sources, not just after building
            // a token tree. These are local instance methods, never global plugins.
            let depth = 0, work = 0, calls = 0;
            for (const name of ['blockTokens', 'inlineTokens']) {
                const original = lexer[name];
                lexer[name] = function (text, ...args) {
                    if (++depth > LIMITS.depth || ++calls > LIMITS.tokens || (work += text.length) > LIMITS.work) throw new Error('Reader budget');
                    try { return original.call(this, text, ...args); } finally { depth--; }
                };
            }
            const tokens = lexer.lex(source);
            let nodes = 0, count = 0;
            const codeBlocks = [], headings = [];
            const make = (tag, text) => {
                if (!TAGS.has(tag) || ++nodes > LIMITS.nodes) throw new Error('Reader budget');
                const node = doc.createElement(tag); if (text !== undefined) node.textContent = text; return node;
            };
            const literal = (parent, text) => parent.append(make('span', String(text ?? '')));
            function children(parent, items, level = 0) {
                if (level > LIMITS.depth || !Array.isArray(items)) throw new Error('Reader budget');
                for (const token of items) {
                    if (++count > LIMITS.tokens) throw new Error('Reader budget');
                    const nested = (tag, list = token.tokens) => { const node = make(tag); children(node, list || [], level + 1); parent.append(node); return node; };
                    switch (token.type) {
                    case 'space': break;
                    case 'paragraph': nested('p'); break;
                    case 'heading': {
                        const tag = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'][token.depth - 1];
                        const heading = nested(tag || 'p');
                        // Only this render's root-level Markdown headings qualify.
                        // Quotes, lists, code and literal HTML never supply targets.
                        if (level === 0 && tag) headings.push(heading);
                        break;
                    }
                    case 'strong': case 'em': case 'del': case 'blockquote': nested(token.type); break;
                    case 'text': if (token.tokens) children(parent, token.tokens, level + 1); else literal(parent, token.text); break;
                    case 'escape': literal(parent, token.text); break;
                    case 'html': literal(parent, token.raw); break;
                    case 'codespan': parent.append(make('code', token.text)); break;
                    case 'code': {
                        const text = String(token.text ?? ''), pre = make('pre'), code = make('code', text);
                        pre.tabIndex = 0; pre.append(code); parent.append(pre);
                        if (text.length) codeBlocks.push({ pre, code, text });
                        break;
                    }
                    case 'br': case 'hr': parent.append(make(token.type)); break;
                    case 'list': {
                        const list = make(token.ordered ? 'ol' : 'ul');
                        if (token.ordered && Number.isSafeInteger(token.start) && token.start > 0 && token.start <= 999999999) list.start = token.start;
                        for (const item of token.items) {
                            if (++count > LIMITS.tokens) throw new Error('Reader budget');
                            const li = make('li'); if (item.task) literal(li, item.checked ? '☑ ' : '☐ ');
                            children(li, item.tokens, level + 1); list.append(li);
                        }
                        parent.append(list); break;
                    }
                    case 'link': case 'image': {
                        // Visible attribution only, including dangerous URL schemes.
                        // No anchor, image, URL assignment, preview or network request.
                        const text = make('span');
                        if (token.type === 'link' && token.tokens) children(text, token.tokens, level + 1);
                        else literal(text, token.text);
                        literal(text, ` (${token.href || ''})`); parent.append(text); break;
                    }
                    case 'table': {
                        const wrap = make('div'); wrap.className = 'answer-reader-table'; wrap.tabIndex = 0;
                        const table = make('table'), head = make('thead'), body = make('tbody');
                        const row = (cells, tag, target) => { const tr = make('tr'); for (const cell of cells) { const td = make(tag); children(td, cell.tokens, level + 1); tr.append(td); } target.append(tr); };
                        row(token.header, 'th', head); for (const cells of token.rows) row(cells, 'td', body);
                        table.append(head, body); wrap.append(table); parent.append(wrap); break;
                    }
                    default: literal(parent, token.raw ?? token.text ?? '');
                    }
                }
            }
            const node = make('div'); node.className = 'answer-reader-content'; node.tabIndex = 0; children(node, tokens);
            return { node, fallback: false, codeBlocks, headings };
        } catch (_) { return fallback(); }
    }
    function create(doc, source, t = (_, fallback) => fallback, options = {}) {
        const box = doc.createElement('section'); box.className = 'answer-reader';
        const controls = doc.createElement('div'); controls.className = 'answer-reader-controls';
        const read = doc.createElement('button'), raw = doc.createElement('button');
        read.type = raw.type = 'button'; read.textContent = t('Reading', 'Reading'); raw.textContent = t('Original', 'Original text');
        const rendered = render(doc, source), original = doc.createElement('pre');
        original.className = 'answer-reader-source'; original.textContent = source; original.tabIndex = 0;
        const help = doc.createElement('p'); help.className = 'answer-reader-help';
        help.textContent = t('Safety', 'Read-only formatting. Links and images are text only. Whole-answer copy, save and export keep the original text. Copy code copies only the displayed code.');
        if (rendered.fallback) help.textContent = t('Fallback', 'Formatting is unavailable for this text. The complete original is shown.');
        let disposed = false, generation = 0, positionGeneration = 0, readingTop = 0;
        const buttons = [], adapter = typeof options.copy === 'function' ? options : null;
        const status = doc.createElement('p'); status.className = 'answer-reader-copy-status';
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const visible = () => !disposed && box.isConnected && !doc.hidden && doc.visibilityState !== 'hidden' &&
            !box.closest('[hidden], [inert]') && !rendered.node.hidden && Boolean(box.getClientRects().length);
        const available = () => !disposed && (!adapter?.canCopy || adapter.canCopy());
        const navigationAvailable = () => !disposed && (!options.canNavigate || options.canNavigate());
        const sectionButtons = [], sectionHeadings = [];
        let sections, summary;
        const ownsNavigationFocus = node => sections?.contains(node) ||
            (sectionHeadings.includes(node) && node.parentElement === rendered.node);
        function captureReadingPosition() {
            const positionTicket = ++positionGeneration, ticket = generation;
            if (!sections || !visible()) return null;
            const top = rendered.node.scrollTop;
            readingTop = top;
            let restored = false;
            return () => {
                if (restored) return;
                restored = true;
                if (positionTicket !== positionGeneration || ticket !== generation || !visible()) return;
                // Chrome can reset this offset when a host detaches the same DOM.
                // Reading position is independent of focus or pending-action locks.
                rendered.node.scrollTop = top;
            };
        }
        function captureNavigationFocus() {
            const focused = doc.activeElement, ticket = generation;
            if (!ownsNavigationFocus(focused)) return null;
            // Hosts may detach and reattach this same reader during a status render.
            // Restore only its still-live owner, never a later focus choice elsewhere.
            return () => {
                if (ticket !== generation || doc.activeElement !== doc.body || !visible() || !ownsNavigationFocus(focused)) return;
                const target = navigationAvailable() && !focused.disabled && focused.getClientRects().length ? focused : summary;
                if (!target.closest('[hidden], [inert]') && target.getClientRects().length) target.focus({ preventScroll: true });
            };
        }
        function refreshNavigationState() {
            if (disposed) return;
            for (const button of sectionButtons) {
                const focused = doc.activeElement === button;
                button.disabled = !navigationAvailable() || rendered.node.hidden;
                if (focused && button.disabled && visible()) summary.focus({ preventScroll: true });
            }
        }
        if (options.sections === true && !rendered.fallback) {
            const targets = rendered.headings.map(heading => ({ heading, title: (heading.textContent || '').trim() })).filter(item => item.title);
            if (targets.length >= 2) {
                sections = doc.createElement('details'); sections.className = 'answer-reader-sections';
                summary = doc.createElement('summary');
                summary.textContent = t('Sections', 'Sections ({count})').replace('{count}', String(targets.length));
                const list = doc.createElement('ol'); list.className = 'answer-reader-section-list';
                for (const [index, { heading, title }] of targets.entries()) {
                    const item = doc.createElement('li'), button = doc.createElement('button');
                    button.type = 'button'; button.className = 'answer-reader-section-button';
                    button.textContent = `${index + 1}. ${title}`;
                    heading.tabIndex = -1;
                    button.addEventListener('click', () => {
                        if (button.disabled || !navigationAvailable() || !visible() || !sections.open ||
                            !sections.contains(button) || !button.isConnected || button.closest('[hidden], [inert]') ||
                            !button.getClientRects().length || heading.parentElement !== rendered.node ||
                            heading.closest('[hidden], [inert]') || !heading.getClientRects().length) return;
                        // Do not use scrollIntoView: it can move the outer page.
                        // No IDs, URL fragments, animation, storage or re-parsing.
                        const top = rendered.node.scrollTop + heading.getBoundingClientRect().top -
                            rendered.node.getBoundingClientRect().top - rendered.node.clientTop;
                        positionGeneration++;
                        heading.focus({ preventScroll: true });
                        rendered.node.scrollTop = Math.max(0, top);
                        readingTop = rendered.node.scrollTop;
                    });
                    item.append(button); list.append(item); sectionButtons.push(button); sectionHeadings.push(heading);
                }
                sections.append(summary, list);
            }
        }
        function refreshCopyState() {
            if (disposed) return;
            for (const { button, pre } of buttons) {
                const focused = doc.activeElement === button, disabled = !available() || rendered.node.hidden;
                button.disabled = disabled;
                if (focused && disabled && visible()) pre.focus();
            }
        }
        if (adapter && !rendered.fallback) {
            for (const [index, block] of rendered.codeBlocks.entries()) {
                const button = doc.createElement('button'); button.type = 'button'; button.className = 'answer-reader-copy-code';
                button.textContent = t('CopyCode', 'Copy code');
                button.setAttribute('aria-label', t('CopyCodeNumber', 'Copy code block {number}').replace('{number}', String(index + 1)));
                // Controls are siblings of code, never part of its text or selection.
                const wrap = doc.createElement('div'); wrap.className = 'answer-reader-code-block';
                block.pre.replaceWith(wrap);
                wrap.append(button, block.pre); buttons.push({ button, pre: block.pre });
                button.addEventListener('click', () => {
                    if (button.disabled || !visible() || !available() || !button.isConnected || button.closest('[hidden], [inert]')) return;
                    const ticket = generation;
                    const current = () => ticket === generation && visible() && button.isConnected;
                    status.textContent = '';
                    adapter.copy(block.text, { current, status,
                        copied: t('CodeCopied', 'Code copied.'),
                        blocked: t('CodeCopyBlocked', 'Copy was blocked. Select this code and copy it manually.') });
                });
            }
        }
        function select(showRaw) {
            if (disposed) return;
            const returningToReading = !showRaw && rendered.node.hidden;
            // Hidden scrollTop can report zero even while Chrome retains an offset.
            // Keep only this live reader's known Reading position across Raw redraws.
            if (sections && showRaw && visible()) readingTop = rendered.node.scrollTop;
            generation++; status.textContent = '';
            rendered.node.hidden = showRaw; original.hidden = !showRaw;
            if (sections) sections.hidden = showRaw;
            if (sections && returningToReading && visible()) rendered.node.scrollTop = readingTop;
            read.setAttribute('aria-pressed', String(!showRaw)); raw.setAttribute('aria-pressed', String(showRaw));
            refreshCopyState(); refreshNavigationState();
        }
        const onVisibility = () => { if (doc.hidden || doc.visibilityState === 'hidden') { generation++; status.textContent = ''; } };
        doc.addEventListener('visibilitychange', onVisibility);
        read.addEventListener('click', () => { if (box.isConnected) select(false); });
        raw.addEventListener('click', () => { if (box.isConnected) select(true); });
        controls.append(read, raw); box.append(controls, help); if (sections) box.append(sections);
        box.append(rendered.node, original); if (buttons.length) box.append(status); select(false);
        return { node: box, refreshCopyState, refreshNavigationState, captureReadingPosition, captureNavigationFocus, destroy() { disposed = true; doc.removeEventListener('visibilitychange', onVisibility); box.replaceChildren(); box.remove(); } };
    }
    const api = Object.freeze({ create, render, LIMITS });
    root.LocalItabSafeAnswerReader = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
