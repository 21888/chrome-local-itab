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
                    case 'heading': nested(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'][token.depth - 1] || 'p'); break;
                    case 'strong': case 'em': case 'del': case 'blockquote': nested(token.type); break;
                    case 'text': if (token.tokens) children(parent, token.tokens, level + 1); else literal(parent, token.text); break;
                    case 'escape': literal(parent, token.text); break;
                    case 'html': literal(parent, token.raw); break;
                    case 'codespan': parent.append(make('code', token.text)); break;
                    case 'code': { const pre = make('pre'); pre.tabIndex = 0; pre.append(make('code', token.text)); parent.append(pre); break; }
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
            return { node, fallback: false };
        } catch (_) { return fallback(); }
    }
    function create(doc, source, t = (_, fallback) => fallback) {
        const box = doc.createElement('section'); box.className = 'answer-reader';
        const controls = doc.createElement('div'); controls.className = 'answer-reader-controls';
        const read = doc.createElement('button'), raw = doc.createElement('button');
        read.type = raw.type = 'button'; read.textContent = t('Reading', 'Reading'); raw.textContent = t('Original', 'Original text');
        const rendered = render(doc, source), original = doc.createElement('pre');
        original.className = 'answer-reader-source'; original.textContent = source; original.tabIndex = 0;
        const help = doc.createElement('p'); help.className = 'answer-reader-help';
        help.textContent = t('Safety', 'Read-only formatting. Links and images are text only. Copy, save and export keep the original text.');
        if (rendered.fallback) help.textContent = t('Fallback', 'Formatting is unavailable for this text. The complete original is shown.');
        let disposed = false;
        function select(showRaw) {
            if (disposed) return;
            rendered.node.hidden = showRaw; original.hidden = !showRaw;
            read.setAttribute('aria-pressed', String(!showRaw)); raw.setAttribute('aria-pressed', String(showRaw));
        }
        read.addEventListener('click', () => { if (box.isConnected) select(false); });
        raw.addEventListener('click', () => { if (box.isConnected) select(true); });
        controls.append(read, raw); box.append(controls, help, rendered.node, original); select(false);
        return { node: box, destroy() { disposed = true; box.replaceChildren(); box.remove(); } };
    }
    const api = Object.freeze({ create, render, LIMITS });
    root.LocalItabSafeAnswerReader = api;
    if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
