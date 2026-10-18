(function (root) {
    'use strict';
    const api = root.LocalItabScratchpad;
    // Ownership only; clipboard single-flight remains local to each View.
    const selectionOwners = new WeakMap();
    const savedOwners = new WeakMap();
    const viewLifecycles = new WeakMap();
    function viewSourceCurrent(view, lifecycle) {
        if (!lifecycle || lifecycle.retired || view.closed) return false;
        const { controller, store, backend, workspace } = lifecycle;
        return !controller.closed && view.controller === controller && controller.store === store && store?.backend === backend &&
            backend?.workspace === workspace && workspace?.id === lifecycle.workspaceId && workspace?.generation === lifecycle.workspaceGeneration &&
            root.LocalItabWorkspaces?.session === lifecycle.session && view.host === lifecycle.host &&
            lifecycle.host.ownerDocument === lifecycle.document &&
            Object.entries(lifecycle.nodes).every(([name, node]) => view[name] === node && node.ownerDocument === lifecycle.document);
    }
    const viewCopies = new WeakMap();
    function copyNodeChain(node) {
        const chain = []; for (; node; node = node.parentElement) chain.push(node);
        return chain;
    }
    function copyChainOwned(chain, document, detached = false) {
        const matches = () => chain?.length && chain.every((node, index) => {
            const parent = node.parentElement || null;
            return node.ownerDocument === document && (parent === (chain[index + 1] || null) || (detached && parent === null));
        });
        // DOM accessors may synchronously transfer a target during the first
        // read. Validate the captured links again before authorizing a write.
        return matches() && matches();
    }
    function writeTeardownProperty(lifecycle, name, property, value) {
        if (copyChainOwned(lifecycle.teardownChains[name], lifecycle.document, true)) lifecycle.nodes[name][property] = value;
    }
    function writeTeardownAttribute(lifecycle, name, attribute, value) {
        if (!copyChainOwned(lifecycle.teardownChains[name], lifecycle.document, true)) return;
        const node = lifecycle.nodes[name], setAttribute = node.setAttribute;
        // Only read an owned method, then recheck: its getter can transfer the
        // target just as an earlier cleanup setter or translation can.
        if (copyChainOwned(lifecycle.teardownChains[name], lifecycle.document, true)) setAttribute.call(node, attribute, value);
    }
    function copyContext(view, transaction, origin, owner) {
        const controller = view.controller, store = controller.store, backend = store?.backend, workspace = backend?.workspace;
        const host = view.host, chain = copyNodeChain(host);
        Object.assign(transaction, { controller, store, backend, workspace, workspaceId: workspace?.id,
            workspaceGeneration: workspace?.generation, session: root.LocalItabWorkspaces?.session,
            host, document, chain, editor: owner?.editor || view.textarea, status: owner?.status || view.copyStatus,
            origin, buttons: [view.copyButton, view.copySelectionButton, view.copySavedButton] });
        transaction.statusChain = copyNodeChain(transaction.status);
        transaction.targetChains = [copyNodeChain(transaction.editor), transaction.statusChain, ...transaction.buttons.map(copyNodeChain)];
    }
    function copyContextCurrent(view, transaction) {
        const c = transaction.controller, { store, backend, workspace, host, editor, status, buttons } = transaction;
        if (!c || !buttons) return false;
        return !view.closed && !viewLifecycles.get(view)?.retired && !c?.closed && view.controller === c && c.store === store &&
            store?.backend === backend && backend?.workspace === workspace && workspace?.id === transaction.workspaceId &&
            workspace?.generation === transaction.workspaceGeneration && root.LocalItabWorkspaces?.session === transaction.session &&
            view.host === host && view.textarea === editor && view.copyStatus === status &&
            [view.copyButton, view.copySelectionButton, view.copySavedButton].every((button, index) => button === buttons[index]) &&
            copyChainOwned(transaction.chain, transaction.document) &&
            transaction.targetChains.every(chain => chain.includes(host) && copyChainOwned(chain, transaction.document));
    }
    function refreshCopyButtons(view, transaction) {
        const state = viewCopies.get(view), active = state.active, feedback = state.feedback;
        const current = () => state.active === active && state.feedback === feedback && copyContextCurrent(view, transaction);
        if (!current()) return;
        const checks = [() => view.canCopy(), () => view.selectionOwned(view.copySelectionOwner) && view.canCopyFrom(transaction.buttons[1]),
            () => view.canCopySaved(view.copySavedOwner)];
        for (let index = 0; index < checks.length; index++) {
            if (!current()) return;
            const disabled = Boolean(active) || !checks[index]();
            if (!current()) return;
            transaction.buttons[index].setAttribute('aria-disabled', String(disabled));
        }
    }
    function retireCopy(view, transaction, strict = false) {
        const state = viewCopies.get(view);
        if (!transaction || state.feedback !== transaction) return;
        state.feedback = null; transaction.valid = false;
        const receipt = transaction.receipt; receipt.valid = false;
        if (view.copyReceipt === receipt) view.copyReceipt = null;
        let failure;
        const attempt = action => { try { action(); } catch (error) { if (!failure) failure = error; } };
        if (!transaction.cleaned) { transaction.cleaned = true; attempt(() => receipt.cleanup?.()); }
        // The owned public hook may throw or omit call-through; the original
        // idempotent resource cleanup still runs. No foreign hook is consulted.
        attempt(() => transaction.cleanup?.());
        const status = transaction.status;
        // A detached original fragment is still ours; a new parent/document is
        // not. Cleanup hooks and either setter can transfer ownership again.
        const ownsStatus = () => status && (!strict || view.copyStatus === status) &&
            copyChainOwned(transaction.statusChain, transaction.document, true) && !state.feedback && view.copyReceipt === null;
        attempt(() => { if (ownsStatus()) status.textContent = ''; });
        attempt(() => { if (ownsStatus()) status.hidden = true; });
        if (failure) { transaction.cleanupError ||= failure; throw failure; }
    }
    function writeCopyStatus(view, transaction, property, value) {
        if (view.copyCurrent(transaction.receipt)) transaction.status[property] = value;
    }
    function cleanCopyResources(actions) {
        let cleaned = false;
        return () => {
            if (cleaned) return; cleaned = true;
            let failure;
            for (const action of actions) try { action(); } catch (error) { if (!failure) failure = error; }
            if (failure) throw failure;
        };
    }
    function retireViewCopy(view) { retireCopy(view, viewCopies.get(view)?.feedback, true); }
    function reserveCopy(view, receipt) {
        const state = viewCopies.get(view);
        if (!state || state.active || view.closed || viewLifecycles.get(view)?.retired) return null;
        const transaction = { receipt, valid: true, cleaned: false };
        state.active = transaction; view.copyAttempt = receipt; return transaction;
    }
    function finishCopy(view, transaction) {
        const state = viewCopies.get(view);
        if (state.active !== transaction) return;
        state.active = null;
        if (view.copyAttempt === transaction.receipt) view.copyAttempt = null;
        if (!state.feedback || state.feedback === transaction) refreshCopyButtons(view, transaction);
    }
    const viewExports = new WeakMap();
    function exportContextCurrent(view, owner, context) {
        const { lifecycle, chains } = owner, { controller, store, backend, host, nodes, document } = lifecycle;
        const matches = () => !lifecycle.retired && !view.closed && view.controller === controller && controller.store === store &&
            store?.backend === backend && view.host === host && ['textarea', 'status', 'exportButton'].every(name => view[name] === nodes[name]) &&
            (!context || (backend?.workspace === context.workspace && context.workspace?.id === context.workspaceId &&
                context.workspace?.generation === context.workspaceGeneration && root.LocalItabWorkspaces?.session === context.session)) &&
            chains.every(chain => copyChainOwned(chain, document, true));
        return matches() && matches();
    }
    const viewImports = new WeakMap();
    function importSourceCurrent(view, owner) {
        if (!owner) return false;
        const { lifecycle, chains } = owner, { controller, store, backend, workspace, host, nodes, document } = lifecycle;
        const matches = () => !lifecycle.retired && !view.closed && !controller.closed && view.controller === controller &&
            controller.store === store && store?.backend === backend && backend?.workspace === workspace &&
            workspace?.id === lifecycle.workspaceId && workspace?.generation === lifecycle.workspaceGeneration &&
            root.LocalItabWorkspaces?.session === lifecycle.session && view.host === host &&
            Object.keys(chains).every(name => view[name] === nodes[name] && copyChainOwned(chains[name], document, true));
        return matches() && matches();
    }
    function importReady(view, owner) {
        if (!importSourceCurrent(view, owner)) return false;
        const c = owner.lifecycle.controller;
        return c.loaded && c.state?.enabled === true && !c.pending && !c.error && !c.readError &&
            !c.hasUncommittedWork() && importSourceCurrent(view, owner);
    }
    function importSessionCurrent(view, owner, session) {
        const matches = () => session && session.valid && owner.session === session && view.importSession === session.receipt &&
            session.receipt.state === session.state && session.receipt.generation === session.generation &&
            (session.text === undefined || (session.receipt.text === session.text && session.receipt.name === session.name)) &&
            importReady(view, owner) && owner.lifecycle.controller.state === session.state &&
            owner.lifecycle.controller.generation === session.generation;
        const current = matches() && matches();
        if (session && !current) session.valid = false;
        return Boolean(current);
    }
    function beginImport(view, owner, state, generation) {
        if (owner.session) owner.session.valid = false;
        const receipt = { state, generation }, session = { receipt, state, generation, valid: true };
        owner.epoch++; owner.session = session; view.importSession = receipt;
        return session;
    }
    function importTargetOwned(owner, name) {
        return copyChainOwned(owner.chains[name], owner.lifecycle.document, true);
    }
    function writeImport(owner, current, name, property, value) {
        if (current() && importTargetOwned(owner, name) && current()) owner.lifecycle.nodes[name][property] = value;
    }
    function focusImport(owner, current, name) {
        if (!current() || !importTargetOwned(owner, name)) return;
        const node = owner.lifecycle.nodes[name], focus = node.focus;
        if (current() && importTargetOwned(owner, name)) focus.call(node);
    }
    const viewFinds = new WeakMap();
    function findSourceCurrent(view, owner) {
        if (!owner) return false;
        const { lifecycle, chains } = owner, { controller, store, backend, workspace, host, nodes, document } = lifecycle;
        const matches = () => !lifecycle.retired && !view.closed && view.controller === controller && controller.store === store &&
            store?.backend === backend && backend?.workspace === workspace && workspace?.id === lifecycle.workspaceId &&
            workspace?.generation === lifecycle.workspaceGeneration && root.LocalItabWorkspaces?.session === lifecycle.session &&
            view.host === host && Object.keys(chains).every(name => view[name] === nodes[name] && copyChainOwned(chains[name], document, true));
        return matches() && matches();
    }
    function beginFind(view) {
        const owner = viewFinds.get(view);
        return owner && { owner, epoch: ++owner.epoch, generation: owner.lifecycle.controller.generation };
    }
    function findCurrent(view, token, source = true) {
        const matches = () => token && token.owner.epoch === token.epoch && !token.owner.lifecycle.retired && !view.closed &&
            token.owner.lifecycle.controller.generation === token.generation && (!source || findSourceCurrent(view, token.owner));
        return Boolean(matches() && matches());
    }
    function findTargetOwned(owner, name) {
        return copyChainOwned(owner.chains[name], owner.lifecycle.document, true);
    }
    function writeFind(view, token, name, property, value, cleanup = false) {
        if (findCurrent(view, token, !cleanup) && findTargetOwned(token.owner, name) && findCurrent(view, token, !cleanup))
            token.owner.lifecycle.nodes[name][property] = value;
    }
    function callFind(view, token, name, method, args = [], cleanup = false, ready = () => true) {
        if (!findCurrent(view, token, !cleanup) || !findTargetOwned(token.owner, name) || !ready()) return;
        const node = token.owner.lifecycle.nodes[name], fn = node[method];
        if (findCurrent(view, token, !cleanup) && findTargetOwned(token.owner, name) && ready() && findCurrent(view, token, !cleanup))
            return fn.apply(node, args);
    }
    function clearFindHeld(view) {
        const owner = viewFinds.get(view);
        if (owner && !owner.lifecycle.retired) { owner.held = null; view.findHeldEnter = null; }
    }
    function findMessage(view, token, key, replacements = {}, ready = () => true) {
        if (!findCurrent(view, token)) return false;
        const status = token.owner.lifecycle.nodes.findStatus, previous = status.textContent;
        let message = t(key);
        for (const [name, value] of Object.entries(replacements)) message = message.replace('{' + name + '}', String(value));
        if (!findCurrent(view, token) || !ready() || status.textContent !== previous || !findCurrent(view, token)) return false;
        writeFind(view, token, 'findStatus', 'textContent', message);
        return findCurrent(view, token);
    }
    const fallback = {
        scratchpadTitle: 'Scratchpad', scratchpadLocal: 'On this device',
        scratchpadLabel: 'Scratchpad text', scratchpadEnable: 'Show Scratchpad on the new tab page',
        scratchpadEnableHelp: 'Optional and device-local. Hiding Scratchpad keeps your saved text.',
        scratchpadHelp: 'Plain text saved only in this browser profile on this device. Excluded from settings exports, browser Sync and Google Drive backups. Removing the extension or clearing browser data can erase it. Export a text copy to keep your own backup.',
        scratchpadLoading: 'Loading local Scratchpad…', scratchpadSaving: 'Saving…',
        scratchpadSaved: 'Saved on this device', scratchpadUnsaved: 'Unsaved changes',
        scratchpadLoadError: 'Could not load Scratchpad. Retry before editing.',
        scratchpadSaveError: 'Could not confirm the save. Your draft is still here. Retry or export a text copy before leaving.',
        scratchpadConflict: 'Another page changed the saved text. Your draft is still here. Use saved text to discard this draft, or replace saved text with this draft.',
        scratchpadRetry: 'Retry', scratchpadUseSaved: 'Use saved text', scratchpadReplace: 'Replace with my draft',
        scratchpadImport: 'Import text', scratchpadImportReplace: 'Replace Scratchpad text',
        scratchpadImportAppend: 'Append to Scratchpad', scratchpadImportAppendMode: 'Keep saved text and append this file',
        scratchpadImportAppendLimit: 'The combined text exceeds the Scratchpad limit. Export your saved text and shorten the file, or turn off append to preview replacement.',
        scratchpadImportCancel: 'Cancel', scratchpadImportPreview: 'Resulting Scratchpad text',
        scratchpadImportHelp: 'Preview of the resulting note. Append keeps saved text and adds a line break if needed. Replace overwrites it. Nothing changes until you confirm; export a copy first to keep a backup.',
        scratchpadImportReading: 'Reading local text file…',
        scratchpadImportError: 'Could not read this file. Choose one UTF-8 .txt file, up to 32,000 Unicode characters and 128 KiB. Scratchpad was not changed.',
        scratchpadExport: 'Export text', scratchpadDetails: 'Storage and backups',
        scratchpadCopyText: 'Copy current text', scratchpadCopying: 'Copying current text…',
        scratchpadCopySuccess: 'Current text copied.', scratchpadCopyFailure: 'Could not copy. Select the text to copy it manually, or export a text copy.',
        scratchpadCopyEmpty: 'There is no text to copy. Your clipboard was not changed.',
        scratchpadCopyInvalid: 'This draft contains incomplete Unicode characters. Correct them before copying. Your clipboard was not changed.',
        scratchpadCopySelection: 'Copy selected text', scratchpadCopySelectionCopying: 'Copying selected text…',
        scratchpadCopySelectionSuccess: 'Selected text copied.',
        scratchpadCopySelectionFailure: 'Could not copy selected text. Your selection is still here. Choose Copy selected text to retry, or copy it manually.',
        scratchpadCopySelectionHelp: 'Select nonempty text with complete Unicode characters in the main editor, then choose Copy selected text. Your clipboard was not changed.',
        scratchpadCopySaved: 'Copy saved text', scratchpadCopySavedCopying: 'Copying saved text…',
        scratchpadCopySavedSuccess: 'Saved text copied.',
        scratchpadCopySavedFailure: 'Could not copy saved text. Both versions are still here. Choose Copy saved text to retry, or copy the saved preview manually.',
        scratchpadCopySavedEmpty: 'The saved text is empty. Your clipboard was not changed.',
        scratchpadCopySavedInvalid: 'The saved text contains incomplete Unicode characters. Your clipboard was not changed.',
        scratchpadCopySavedHelp: 'Copy the “Latest saved text” preview shown above without replacing either version.',
        scratchpadSavedPreview: 'Latest saved text', scratchpadSettingsConflict: 'Scratchpad changed on another page. Read the latest saved state before changing visibility.', scratchpadReadLatest: 'Read latest saved state',
        scratchpadLines: 'Lines: {count}',
        scratchpadLimits: 'Up to 32,000 Unicode characters and 128 KiB of UTF-8 text. Longer drafts stay here until shortened; export a copy before leaving.',
        scratchpadTooLong: 'This draft is too long to save. It is still here. Shorten it or export a text copy before leaving.',
        scratchpadInvalidText: 'This draft contains invalid Unicode text and cannot be saved or exported exactly. Your text is still here. Correct it before saving or exporting.',
        scratchpadExportError: 'Could not export a text copy. Your draft is still here.',
        scratchpadFind: 'Find text', scratchpadFindLabel: 'Text to find',
        scratchpadFindSelection: 'Find selected text',
        scratchpadFindSelectionHelp: 'Select complete, single-line text in the editor first. This only fills the find field; use Next or Previous to find matches.',
        scratchpadFindSelectionFailed: 'Could not use the selection. Select text and try again.',
        scratchpadFindHelp: 'Case-sensitive, exact single-line text in this editor only. Spaces count. Enter selects the next match.',
        scratchpadFindPrevious: 'Previous match', scratchpadFindNext: 'Next match', scratchpadFindClose: 'Close find',
        scratchpadFindSelected: 'Match {current} of {total}.', scratchpadFindWrappedNext: 'Wrapped to the beginning. Match {current} of {total}.',
        scratchpadFindWrappedPrevious: 'Wrapped to the end. Match {current} of {total}.', scratchpadFindNoMatch: 'No matching text in this editor.',
        scratchpadFindInvalid: 'Enter complete Unicode characters to find text.',
        scratchpadFindFailed: 'Could not select the matching text. Try again.'
    };
    function t(key) { const translated = root.i18n?.t(key); return translated && translated !== key ? translated : fallback[key] || key; }
    function el(tag, cls, text) { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; }
    function button(key, action) { const node = el('button', 'scratchpad-button', t(key)); node.type = 'button'; node.addEventListener('click', action); return node; }
    function run(action) { try { Promise.resolve(action()).catch(() => {}); } catch (_) {} }
    function statusText(controller) {
        if (controller.readError) return t('scratchpadLoadError');
        if (controller.conflict) return t('scratchpadConflict');
        if (controller.loaded && ['TEXT_LIMIT', 'SIZE_LIMIT'].includes(controller.error?.code)) return t('scratchpadTooLong');
        if (controller.loaded && controller.error?.code === 'TEXT') return t('scratchpadInvalidText');
        if (controller.error) return t(controller.loaded ? 'scratchpadSaveError' : 'scratchpadLoadError');
        if (!controller.loaded) return t('scratchpadLoading');
        if (controller.pending) return t('scratchpadSaving');
        return t(controller.hasUncommittedWork() ? 'scratchpadUnsaved' : 'scratchpadSaved');
    }
    class View {
        constructor(host, { controller = new api.Controller(), onVisibility = () => {}, clipboard = root.navigator?.clipboard } = {}) {
            const store = controller.store, backend = store?.backend, workspace = backend?.workspace;
            const lifecycle = { host, document, controller, store, backend, workspace, workspaceId: workspace?.id,
                workspaceGeneration: workspace?.generation, session: root.LocalItabWorkspaces?.session,
                nodes: {}, listeners: [], unsubscribe: null, destroyController: controller.destroy.bind(controller), retired: false };
            viewLifecycles.set(this, lifecycle);
            viewCopies.set(this, { active: null, feedback: null });
            this.host = host; this.controller = controller; this.onVisibility = onVisibility; this.closed = false;
            this.clipboard = clipboard; this.copyAttempt = null; this.copyReceipt = null;
            host.classList.add('local-scratchpad-card'); host.setAttribute('aria-label', t('scratchpadTitle')); host.hidden = true;
            const header = el('header', 'scratchpad-header'); header.append(el('h2', '', t('scratchpadTitle')), el('span', 'scratchpad-local', t('scratchpadLocal')));
            this.textarea = el('textarea', 'scratchpad-text'); this.textarea.setAttribute('aria-label', t('scratchpadLabel')); this.textarea.spellcheck = false; this.textarea.setAttribute('autocomplete', 'off');
            this.textarea.addEventListener('input', () => { if (!viewCopies.get(this).feedback?.receipt.saved) this.invalidateCopy(); this.resetFindResult(); if (controller.loaded) controller.setDraft(this.textarea.value); });
            this.textarea.addEventListener('compositionstart', () => { this.findHeldEnter = null; controller.setComposing(true); });
            this.textarea.addEventListener('compositionend', () => { if (controller.loaded) controller.setDraft(this.textarea.value); controller.setComposing(false); });
            this.savedPreview = el('textarea', 'scratchpad-text scratchpad-saved-preview'); this.savedPreview.readOnly = true; this.savedPreview.spellcheck = false; this.savedPreview.setAttribute('aria-label', t('scratchpadSavedPreview'));
            this.savedLabel = el('p', 'scratchpad-help', t('scratchpadSavedPreview'));
            this.status = el('p', 'scratchpad-status'); this.status.setAttribute('role', 'status'); this.status.setAttribute('aria-live', 'polite');
            this.retry = button('scratchpadRetry', () => run(() => controller.retry()));
            this.useSaved = button('scratchpadUseSaved', () => run(() => controller.useSaved()));
            this.replace = button('scratchpadReplace', () => run(() => controller.replaceWithDraft()));
            this.exportButton = button('scratchpadExport', () => this.exportText());
            const copyButton = this.copyButton = button('scratchpadCopyText', event => run(() => this.copyText(event, copyButton)));
            const copySelectionButton = this.copySelectionButton = button('scratchpadCopySelection', event => run(() => this.copySelectedText(event, selectionOwner)));
            copySelectionButton.title = t('scratchpadCopySelectionHelp');
            copySelectionButton.addEventListener('keydown', event => {
                if (!['Enter', ' '].includes(event.key)) return;
                if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 ||
                    this.copySelectionKey?.key === event.key) { event.preventDefault(); return; }
                this.copySelectionKey = { key: event.key, used: false };
            });
            const clearCopySelectionKey = () => { this.copySelectionKey = null; };
            copySelectionButton.addEventListener('keyup', clearCopySelectionKey);
            copySelectionButton.addEventListener('blur', clearCopySelectionKey);
            copySelectionButton.addEventListener('pointerdown', clearCopySelectionKey);
            const copySavedButton = this.copySavedButton = button('scratchpadCopySaved', event => run(() => this.copySavedText(event, savedOwner)));
            copySavedButton.title = t('scratchpadCopySavedHelp');
            copySavedButton.addEventListener('keydown', event => {
                if (!['Enter', ' '].includes(event.key)) return;
                if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 ||
                    this.copySavedKey?.key === event.key) { event.preventDefault(); return; }
                this.copySavedKey = { key: event.key, used: false };
            });
            const clearCopySavedKey = () => { this.copySavedKey = null; };
            copySavedButton.addEventListener('keyup', clearCopySavedKey);
            copySavedButton.addEventListener('blur', clearCopySavedKey);
            copySavedButton.addEventListener('pointerdown', clearCopySavedKey);
            this.copyStatus = el('p', 'scratchpad-help'); this.copyStatus.hidden = true;
            this.copyStatus.setAttribute('role', 'status'); this.copyStatus.setAttribute('aria-live', 'polite'); this.copyStatus.setAttribute('aria-atomic', 'true');
            this.importButton = button('scratchpadImport', () => this.chooseImport());
            this.findButton = button('scratchpadFind', event => {
                const token = beginFind(this);
                if (!this.canFind(this.findButton, event) || !findCurrent(this, token)) return;
                const { nodes } = token.owner.lifecycle;
                if (!nodes.findPanel.hidden) { this.closeFind(true, token); return; }
                writeFind(this, token, 'findPanel', 'hidden', false);
                callFind(this, token, 'findButton', 'setAttribute', ['aria-expanded', 'true']); this.renderFind(token);
                try { if (findCurrent(this, token) && this.canFind(nodes.findInput)) callFind(this, token, 'findInput', 'focus'); } catch (_) {}
            });
            this.findButton.setAttribute('aria-expanded', 'false');
            this.findSelectionButton = button('scratchpadFindSelection', event => this.findSelectedText(event));
            this.findSelectionButton.title = t('scratchpadFindSelectionHelp');
            this.findPanel = el('section', 'scratchpad-find'); this.findPanel.hidden = true;
            this.findPanel.setAttribute('aria-label', t('scratchpadFind'));
            this.findInput = el('input', 'scratchpad-find-input'); this.findInput.type = 'text';
            this.findInput.spellcheck = false; this.findInput.setAttribute('autocomplete', 'off');
            const findLabel = el('label', 'scratchpad-find-label'); findLabel.append(el('span', '', t('scratchpadFindLabel')), this.findInput);
            this.findPrevious = button('scratchpadFindPrevious', event => this.findText(-1, this.findPrevious, event));
            this.findNext = button('scratchpadFindNext', event => this.findText(1, this.findNext, event));
            this.findClose = button('scratchpadFindClose', event => {
                const token = beginFind(this);
                if (this.canFind(this.findClose, event) && findCurrent(this, token)) this.closeFind(true, token);
            });
            this.findStatus = el('p', 'scratchpad-help scratchpad-find-status');
            this.findStatus.setAttribute('role', 'status'); this.findStatus.setAttribute('aria-live', 'polite'); this.findStatus.setAttribute('aria-atomic', 'true');
            const findControls = el('div', 'scratchpad-controls'); findControls.append(this.findPrevious, this.findNext, this.findClose);
            this.findPanel.append(findLabel, el('p', 'scratchpad-help', t('scratchpadFindHelp')), findControls, this.findStatus);
            this.findInput.addEventListener('input', () => {
                if (!findSourceCurrent(this, viewFinds.get(this))) return;
                const token = beginFind(this); clearFindHeld(this); this.resetFindResult(token); this.renderFind(token);
            });
            this.findInput.addEventListener('compositionstart', () => {
                const token = beginFind(this);
                if (!this.canFind(this.findInput) || !findCurrent(this, token)) return;
                clearFindHeld(this); this.findComposing = true; this.resetFindResult(token); this.renderFind(token);
            });
            // Finish original IME bookkeeping while hidden. An ordinary focusout
            // during Find is not a new gesture and must not retire its caller.
            const finishFindComposition = () => {
                const owner = viewFinds.get(this); if (!findSourceCurrent(this, owner)) return;
                const token = this.findComposing ? beginFind(this) : { owner, epoch: owner.epoch, generation: controller.generation };
                this.findComposing = false; this.renderFind(token);
            };
            this.findInput.addEventListener('compositionend', finishFindComposition);
            this.findInput.addEventListener('focusout', finishFindComposition);
            this.findInput.addEventListener('keydown', event => this.findEnter(1, this.findInput, event));
            this.findPrevious.addEventListener('keydown', event => this.findEnter(-1, this.findPrevious, event));
            this.findNext.addEventListener('keydown', event => this.findEnter(1, this.findNext, event));
            // Only the original successful gesture can suppress editor repeats.
            this.textarea.addEventListener('keydown', event => {
                const held = viewFinds.get(this)?.held;
                if (held && this.findHeldEnter === held.event && event.key === 'Enter' && event.repeat &&
                    findSourceCurrent(this, held.token.owner) && controller.generation === held.token.generation &&
                    this.canFind(held.token.owner.lifecycle.nodes.findInput, event) &&
                    held.token.owner.lifecycle.nodes.findInput.value === held.query && held.token.owner.lifecycle.nodes.textarea.value === held.text &&
                    viewFinds.get(this).held === held && findSourceCurrent(this, held.token.owner)) event.preventDefault();
                else clearFindHeld(this);
            });
            this.textarea.addEventListener('blur', () => clearFindHeld(this));
            this.findKeyup = () => clearFindHeld(this);
            this.findPointerdown = () => clearFindHeld(this);
            this.findKeydown = event => {
                const owner = viewFinds.get(this);
                // An older handled event may bubble after synchronous nested Find.
                if (!event.repeat && !owner?.events.has(event)) clearFindHeld(this);
            };
            this.findVisibilityChange = () => { if (document.hidden) { clearFindHeld(this); this.resetFindResult(); } };
            document.addEventListener('visibilitychange', this.findVisibilityChange);
            host.addEventListener('keyup', this.findKeyup); host.addEventListener('pointerdown', this.findPointerdown); host.addEventListener('keydown', this.findKeydown);
            this.findPanel.addEventListener('keydown', event => {
                const token = beginFind(this);
                if (event.key !== 'Escape' || !this.canFind(event.target, event) || !findCurrent(this, token)) return;
                event.preventDefault(); if (findCurrent(this, token)) this.closeFind(true, token);
            });
            this.importFile = el('input'); this.importFile.type = 'file'; this.importFile.accept = '.txt,text/plain'; this.importFile.hidden = true;
            this.importFile.addEventListener('change', () => run(() => this.readImport()));
            this.importFile.addEventListener('cancel', () => this.cancelImport(true));
            this.importPanel = el('section', 'scratchpad-import'); this.importPanel.hidden = true;
            this.importInfo = el('p', 'scratchpad-help'); this.importInfo.setAttribute('role', 'status');
            this.importPreview = el('pre', 'scratchpad-import-preview'); this.importPreview.tabIndex = 0; this.importPreview.setAttribute('aria-label', t('scratchpadImportPreview'));
            this.importAppend = el('input'); this.importAppend.type = 'checkbox';
            this.importAppend.addEventListener('change', () => this.renderImportPreview());
            const appendLabel = el('label', 'scratchpad-enable-label scratchpad-help');
            appendLabel.append(this.importAppend, el('span', '', t('scratchpadImportAppendMode')));
            this.importApply = button('scratchpadImportReplace', () => this.applyImport());
            this.importCancel = button('scratchpadImportCancel', () => this.cancelImport(true));
            const importControls = el('div', 'scratchpad-controls'); importControls.append(this.importApply, this.importCancel);
            this.importPanel.append(appendLabel, this.importInfo, this.importPreview, el('p', 'scratchpad-help', t('scratchpadImportHelp')), importControls);
            this.importPanel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); this.cancelImport(true); } });
            const controls = el('div', 'scratchpad-controls'); controls.append(this.retry, this.useSaved, this.replace, this.copySavedButton, this.exportButton, this.copyButton, this.copySelectionButton, this.importButton, this.findButton, this.findSelectionButton);
            this.count = el('p', 'scratchpad-help scratchpad-count');
            const details = el('details', 'scratchpad-help'); details.append(el('summary', '', t('scratchpadDetails')), el('p', '', t('scratchpadHelp')));
            host.replaceChildren(header, this.textarea, this.count, el('p', 'scratchpad-help', t('scratchpadLimits')), this.status, this.savedLabel, this.savedPreview, controls, this.copyStatus, this.importFile, this.importPanel, this.findPanel, details);
            // Render and teardown retain these original controls even if a public
            // property is replaced. Detachment alone does not change ownership.
            lifecycle.nodes = Object.fromEntries(['textarea', 'savedPreview', 'savedLabel', 'status', 'retry', 'useSaved', 'replace',
                'exportButton', 'copyButton', 'copySelectionButton', 'copySavedButton', 'copyStatus', 'importButton', 'importFile',
                'importPanel', 'importInfo', 'importPreview', 'importAppend', 'importApply', 'importCancel', 'findButton',
                'findSelectionButton', 'findPanel', 'findInput', 'findPrevious', 'findNext', 'findClose', 'findStatus', 'count']
                .map(name => [name, this[name]]));
            // Export retains its construction source and controls. Workspace and
            // Session are captured per call so late setup does not disable recovery.
            viewExports.set(this, { lifecycle, active: false,
                chains: ['textarea', 'status', 'exportButton'].map(name => copyNodeChain(lifecycle.nodes[name])) });
            // Import changes saved text, so it shares the construction source's
            // workspace/session identity rather than export's recovery admission.
            viewImports.set(this, { lifecycle, session: null, epoch: 0,
                chains: Object.fromEntries(['textarea', 'importButton', 'importFile', 'importPanel', 'importInfo',
                    'importPreview', 'importAppend', 'importApply', 'importCancel']
                    .map(name => [name, copyNodeChain(lifecycle.nodes[name])])) });
            // Find retains its construction source and complete original chains.
            // Action tokens separate synchronous nested gestures from their caller.
            viewFinds.set(this, { lifecycle, epoch: 0, held: null, events: new WeakSet(),
                chains: Object.fromEntries(['textarea', 'findButton', 'findSelectionButton', 'findPanel', 'findInput',
                    'findPrevious', 'findNext', 'findClose', 'findStatus'].map(name => [name, copyNodeChain(lifecycle.nodes[name])])) });
            // Teardown authority is private and captured before any prior-owner
            // invalidation callback can reparent or adopt the new controls.
            lifecycle.teardownChains = Object.fromEntries(['findInput', 'findStatus', 'findPanel', 'findButton',
                'findPrevious', 'findNext', 'importApply', 'importAppend', 'importPanel', 'importPreview', 'importInfo', 'importFile']
                .map(name => [name, copyNodeChain(lifecycle.nodes[name])]));
            // Pin the original controls before callbacks can run. Receipts also
            // observe removal so a pending reparent/restore cannot revive them.
            const selectionOwner = lifecycle.selectionOwner = this.copySelectionOwner = { host, editor: this.textarea, origin: copySelectionButton,
                controls, status: this.copyStatus, controller, document, parent: host.parentElement, valid: true };
            const previousSelectionOwner = selectionOwners.get(host);
            selectionOwners.set(host, selectionOwner);
            previousSelectionOwner?.invalidate();
            selectionOwner.invalidate = () => this.invalidateSelectionCopy();
            const chain = []; for (let node = host; node; node = node.parentElement) chain.push(node);
            lifecycle.chain = chain.slice();
            lifecycle.copyStatusChain = copyNodeChain(this.copyStatus);
            const savedOwner = lifecycle.savedOwner = this.copySavedOwner = { host, controller, store, backend, workspace,
                workspaceId: lifecycle.workspaceId, workspaceGeneration: lifecycle.workspaceGeneration, session: lifecycle.session,
                preview: this.savedPreview, label: this.savedLabel, origin: copySavedButton, controls, status: this.copyStatus,
                labelText: this.savedLabel.textContent, buttonText: copySavedButton.textContent, document, chain, valid: true };
            const previousSavedOwner = savedOwners.get(host);
            savedOwners.set(host, savedOwner); previousSavedOwner?.invalidate();
            savedOwner.invalidate = () => { savedOwner.valid = false; if (viewCopies.get(this).feedback?.receipt.saved) this.invalidateCopy(); };
            this.copyCompositionStart = () => { this.copySelectionKey = null; this.copySavedKey = null; this.invalidateCopy(); this.refreshCopyControl(); };
            this.copyCompositionEnd = () => this.refreshCopyControl();
            host.addEventListener('compositionstart', this.copyCompositionStart); host.addEventListener('compositionend', this.copyCompositionEnd);
            this.beforeUnload = event => { if (root.LocalItabContentLifecycle?.departing || !this.hasUncommittedWork()) return; event.preventDefault(); event.returnValue = ''; };
            root.addEventListener?.('beforeunload', this.beforeUnload);
            lifecycle.listeners = [[host, 'compositionstart', this.copyCompositionStart], [host, 'compositionend', this.copyCompositionEnd],
                [host, 'keyup', this.findKeyup], [host, 'pointerdown', this.findPointerdown], [host, 'keydown', this.findKeydown],
                [document, 'visibilitychange', this.findVisibilityChange], [root, 'beforeunload', this.beforeUnload]];
            this.unsubscribe = lifecycle.unsubscribe = controller.subscribe(() => {
                if (viewSourceCurrent(this, lifecycle)) this.render();
                else retireViewCopy(this, lifecycle);
            });
            this.render(); run(() => controller.init());
        }
        render() {
            const lifecycle = viewLifecycles.get(this);
            if (!viewSourceCurrent(this, lifecycle)) { retireViewCopy(this, lifecycle); return; }
            // Check the displayed saved snapshot before a render can overwrite it.
            if (viewCopies.get(this).feedback?.receipt.saved && !this.copyCurrent(viewCopies.get(this).feedback.receipt)) this.invalidateCopy();
            const c = lifecycle.controller;
            if (this.importSession && !this.importCurrent(this.importSession)) this.cancelImport();
            this.importButton.disabled = !this.canImport();
            const visible = c.state?.enabled === true || c.hasUncommittedWork() || Boolean(!c.loaded && c.error);
            this.host.hidden = !visible;
            if (this.visible !== visible) { this.visible = visible; this.onVisibility(visible); }
            // Visibility callbacks can synchronously replace or retire this View.
            if (!viewSourceCurrent(this, lifecycle)) { retireViewCopy(this, lifecycle); return; }
            this.textarea.readOnly = !c.loaded || c.readError;
            this.savedPreview.hidden = this.savedLabel.hidden = this.copySavedButton.hidden = !c.conflict;
            if (this.savedPreview.value !== (c.state?.content || '')) this.savedPreview.value = c.state?.content || '';
            // Do not replace the DOM value during IME composition or on each
            // keystroke: that would reset the caret and the native undo stack.
            if (!c.composing && this.textarea.value !== c.draft) this.textarea.value = c.draft;
            // Count the same current DOM snapshot for both metrics. CRLF is one
            // break; a final CR/LF leaves an empty line. Soft wrapping is not a break.
            const editorText = this.textarea.value || '';
            let characterCount = 0, lineCount = editorText ? 1 : 0, previousCharacter = '';
            for (const character of editorText) {
                characterCount++;
                if (character === '\r' || (character === '\n' && previousCharacter !== '\r')) lineCount++;
                previousCharacter = character;
            }
            this.count.textContent = `${characterCount.toLocaleString()} / 32,000 · ${t('scratchpadLines').replace('{count}', lineCount.toLocaleString())}`;
            const text = statusText(c); if (this.status.textContent !== text) this.status.textContent = text;
            this.status.classList.toggle('scratchpad-error', Boolean(c.error || c.conflict));
            this.retry.hidden = (!c.error || Boolean(c.conflict)) && !c.readError || (c.loaded && ['TEXT', 'TEXT_LIMIT', 'SIZE_LIMIT'].includes(c.error?.code)); this.retry.disabled = Boolean(c.pending);
            this.useSaved.hidden = this.replace.hidden = !c.conflict;
            this.useSaved.disabled = Boolean(c.pending || c.composing);
            this.replace.disabled = Boolean(c.pending || c.composing || c.readError);
            this.exportButton.disabled = !c.loaded && !c.draft;
            this.renderFind();
            if (viewCopies.get(this).feedback && !this.copyCurrent(viewCopies.get(this).feedback.receipt)) this.invalidateCopy();
            this.refreshCopyControl();
        }
        findVisible(node) {
            return !this.closed && !this.controller.closed && this.host.isConnected && node?.isConnected && this.host.contains(node) &&
                !node.closest('[hidden], [inert], [aria-hidden="true"]') && node.getClientRects().length > 0 &&
                !['hidden', 'collapse'].includes(root.getComputedStyle?.(node)?.visibility);
        }
        canFind(node, event) {
            const owner = viewFinds.get(this);
            return findSourceCurrent(this, owner) && Object.keys(owner.chains).some(name => owner.lifecycle.nodes[name] === node) &&
                owner.lifecycle.controller.loaded && !document.hidden &&
                !owner.lifecycle.controller.composing && !this.findComposing && !event?.isComposing && event?.keyCode !== 229 &&
                !node?.disabled && this.findVisible(node) && this.findVisible(owner.lifecycle.nodes.textarea) && findSourceCurrent(this, owner);
        }
        resetFindResult(token = beginFind(this)) {
            if (!findCurrent(this, token, false)) return;
            this.findResult = null; writeFind(this, token, 'findStatus', 'textContent', '', true);
        }
        closeFind(focus = false, token = beginFind(this)) {
            if (!findCurrent(this, token, false)) return;
            const { owner } = token, { nodes, document } = owner.lifecycle;
            const focused = document.activeElement;
            const restore = focus && findTargetOwned(owner, 'findPanel') && nodes.findPanel.contains(focused);
            const ownsFocus = () => document.activeElement === focused || document.activeElement === document.body;
            if (!findCurrent(this, token, false)) return;
            clearFindHeld(this); this.findComposing = false;
            writeFind(this, token, 'findInput', 'value', '', true); this.resetFindResult(token);
            writeFind(this, token, 'findPanel', 'hidden', true, true);
            callFind(this, token, 'findButton', 'setAttribute', ['aria-expanded', 'false'], true);
            writeFind(this, token, 'findPrevious', 'disabled', true, true); writeFind(this, token, 'findNext', 'disabled', true, true);
            if (restore && findCurrent(this, token) && ownsFocus() && this.canFind(nodes.findButton)) {
                try { callFind(this, token, 'findButton', 'focus', [], false, ownsFocus); } catch (_) {}
            }
        }
        renderFind(token = beginFind(this)) {
            if (!findCurrent(this, token)) return;
            const { nodes, controller } = token.owner.lifecycle;
            if (!this.findVisible(nodes.textarea)) this.closeFind(false, token);
            if (!findCurrent(this, token)) return;
            const match = this.findResult;
            if (match && (match.query !== nodes.findInput.value || match.text !== nodes.textarea.value)) this.resetFindResult(token);
            writeFind(this, token, 'findButton', 'disabled', !controller.loaded);
            writeFind(this, token, 'findSelectionButton', 'disabled', !controller.loaded);
            // Visibility/IME stay action-time checks so returning tabs recover.
            const disabled = !nodes.findInput.value || !controller.loaded || nodes.findPanel.hidden;
            writeFind(this, token, 'findPrevious', 'disabled', disabled); writeFind(this, token, 'findNext', 'disabled', disabled);
        }
        findSelectedText(event) {
            const token = beginFind(this);
            if (!this.canFind(this.findSelectionButton, event) || !findCurrent(this, token)) return;
            const { nodes, document } = token.owner.lifecycle;
            const text = nodes.textarea.value, start = nodes.textarea.selectionStart, end = nodes.textarea.selectionEnd,
                direction = nodes.textarea.selectionDirection, previousQuery = nodes.findInput.value;
            if (!findCurrent(this, token)) return;
            const selected = () => findCurrent(this, token) && nodes.textarea.value === text && nodes.textarea.selectionStart === start &&
                nodes.textarea.selectionEnd === end && nodes.textarea.selectionDirection === direction && nodes.findInput.value === previousQuery && findCurrent(this, token);
            const query = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= text.length ? text.slice(start, end) : '';
            clearFindHeld(this); this.resetFindResult(token);
            writeFind(this, token, 'findPanel', 'hidden', false);
            callFind(this, token, 'findButton', 'setAttribute', ['aria-expanded', 'true']); this.renderFind(token);
            if (!findCurrent(this, token)) return;
            if (!query || /[\r\n]/.test(query) || !api.isUnicode(query)) {
                findMessage(this, token, 'scratchpadFindSelectionHelp', {}, selected); return;
            }
            try { callFind(this, token, 'findInput', 'focus'); } catch (_) {}
            // Original focus may synchronously change source, selection or query.
            if (!findCurrent(this, token) || !this.canFind(nodes.findSelectionButton) || !this.canFind(nodes.findInput) ||
                nodes.textarea.value !== text || nodes.textarea.selectionStart !== start || nodes.textarea.selectionEnd !== end ||
                nodes.textarea.selectionDirection !== direction || nodes.findInput.value !== previousQuery || !findCurrent(this, token)) return;
            if (document.activeElement !== nodes.findInput) { findMessage(this, token, 'scratchpadFindSelectionFailed', {}, selected); return; }
            writeFind(this, token, 'findInput', 'value', query); this.renderFind(token);
        }
        findEnter(direction, source, event) {
            // Repeats consume no new action token: the successful original Enter
            // still owns repeats that follow focus into the editor.
            const owner = viewFinds.get(this), token = event.repeat ?
                { owner, epoch: owner.epoch, generation: owner.lifecycle.controller.generation } : beginFind(this);
            if (event.key !== 'Enter') return;
            owner.events.add(event);
            if (!this.canFind(source, event) || !findCurrent(this, token)) return;
            event.preventDefault();
            if (findCurrent(this, token) && !event.repeat && this.findText(direction, source, event, token) && findCurrent(this, token)) {
                owner.held = { token, event, query: token.query, text: token.text };
                this.findHeldEnter = event;
            }
        }
        findText(direction, source, event, token = beginFind(this)) {
            if (!findCurrent(this, token)) return;
            const { nodes, document } = token.owner.lifecycle;
            clearFindHeld(this);
            if (!this.findVisible(nodes.textarea)) { this.closeFind(false, token); return; }
            if (!this.canFind(source, event) || !this.canFind(nodes.findInput) || !findCurrent(this, token)) return;
            // Exact DOM text retains native CRLF normalization and recovery drafts.
            const query = nodes.findInput.value, text = nodes.textarea.value;
            if (!findCurrent(this, token)) return;
            const snapshot = () => findCurrent(this, token) && this.canFind(nodes.findInput) &&
                nodes.findInput.value === query && nodes.textarea.value === text && findCurrent(this, token);
            if (!query) { this.resetFindResult(token); return; }
            if (!api.isUnicode(query)) {
                this.resetFindResult(token); if (!findCurrent(this, token)) return;
                this.findResult = { query, text }; findMessage(this, token, 'scratchpadFindInvalid', {}, snapshot); return;
            }
            let previous = this.findResult;
            if (previous && (previous.query !== query || previous.text !== text || !Number.isInteger(previous.start))) previous = null;
            let start, wrapped = false;
            if (direction > 0) start = text.indexOf(query, previous ? previous.start + 1 : 0);
            // lastIndexOf(-1) checks zero; explicitly stop before zero to wrap.
            else start = previous ? (previous.start > 0 ? text.lastIndexOf(query, previous.start - 1) : -1) : text.lastIndexOf(query);
            if (start < 0 && previous) { wrapped = true; start = direction > 0 ? text.indexOf(query) : text.lastIndexOf(query); }
            this.resetFindResult(token); if (!findCurrent(this, token)) return;
            this.findResult = { query, text };
            if (start < 0) { findMessage(this, token, 'scratchpadFindNoMatch', {}, snapshot); return; }
            let current = 0, total = 0;
            for (let offset = text.indexOf(query); offset >= 0; offset = text.indexOf(query, offset + 1)) {
                total++; if (offset === start) current = total;
            }
            const end = start + query.length;
            const selected = () => snapshot() && nodes.textarea.selectionStart === start && nodes.textarea.selectionEnd === end && snapshot();
            try {
                callFind(this, token, 'textarea', 'focus');
                if (!snapshot() || document.activeElement !== nodes.textarea) throw new Error('stale find');
                callFind(this, token, 'textarea', 'setSelectionRange', [start, end]);
                if (!snapshot() || nodes.textarea.selectionStart !== start || nodes.textarea.selectionEnd !== end || !snapshot()) throw new Error('selection failed');
                // Keep the navigation cursor before translation, but publish counts
                // only if the same gesture still owns its feedback afterward.
                this.findResult = { query, text, start, end };
                if (findMessage(this, token, wrapped ? (direction > 0 ? 'scratchpadFindWrappedNext' : 'scratchpadFindWrappedPrevious') : 'scratchpadFindSelected', { current, total }, selected) && selected()) {
                    this.findResult = { query, text, start, end, current, total }; token.query = query; token.text = text; return true;
                }
            } catch (_) {
                if (!findCurrent(this, token)) return;
                if (!this.findVisible(nodes.findInput)) this.closeFind(false, token);
                else {
                    const queryNow = nodes.findInput.value, textNow = nodes.textarea.value;
                    findMessage(this, token, 'scratchpadFindFailed', {}, () => nodes.findInput.value === queryNow && nodes.textarea.value === textNow);
                }
            }
        }
        canImport() { return importReady(this, viewImports.get(this)); }
        importCurrent(receipt) {
            const owner = viewImports.get(this), session = owner.session;
            return receipt === session?.receipt && importSessionCurrent(this, owner, session);
        }
        cancelImport(focus = false) {
            const owner = viewImports.get(this), { lifecycle } = owner, { nodes, controller: c } = lifecycle;
            const previous = owner.session, epoch = ++owner.epoch;
            if (previous) previous.valid = false;
            owner.session = null;
            const current = () => owner.epoch === epoch && !owner.session && !lifecycle.retired;
            const state = c.state, generation = c.generation, focused = lifecycle.document.activeElement;
            const restore = current() && importTargetOwned(owner, 'importPanel') && nodes.importPanel.contains(focused);
            if (current() && (!previous || this.importSession === previous.receipt)) this.importSession = null;
            // Each setter/translation can synchronously start a newer selection or
            // transfer a later target. Retire first, then clean only our own nodes.
            for (const [name, property, value] of [
                ['importApply', 'textContent', t('scratchpadImportReplace')],
                ['importAppend', 'checked', false], ['importAppend', 'disabled', true],
                ['importPanel', 'hidden', true], ['importPreview', 'textContent', ''],
                ['importInfo', 'textContent', ''], ['importFile', 'value', '']
            ]) writeImport(owner, current, name, property, value);
            const ownsFocus = () => current() && importSourceCurrent(this, owner) && c.state === state && c.generation === generation;
            if (focus && ownsFocus() && importReady(this, owner)) focusImport(owner, ownsFocus, 'importButton');
            else if (restore && ownsFocus()) {
                if (c.state?.enabled) focusImport(owner, ownsFocus, 'textarea');
                else {
                    const blur = focused?.blur;
                    if (ownsFocus() && importTargetOwned(owner, 'importPanel')) blur?.call(focused);
                }
            }
            return epoch;
        }
        chooseImport() {
            const owner = viewImports.get(this), epoch = this.cancelImport();
            if (owner.epoch !== epoch || !importReady(this, owner)) return;
            const c = owner.lifecycle.controller, session = beginImport(this, owner, c.state, c.generation);
            if (!importSessionCurrent(this, owner, session)) return;
            const file = owner.lifecycle.nodes.importFile, click = file.click;
            if (importSessionCurrent(this, owner, session)) click.call(file);
        }
        async readImport() {
            const owner = viewImports.get(this), session = owner.session, { nodes } = owner.lifecycle;
            if (!importSessionCurrent(this, owner, session)) { if (owner.session === session) this.cancelImport(); return; }
            // Each selection owns its own completion, even within one chooser.
            const files = Array.from(nodes.importFile.files || []);
            if (!importSessionCurrent(this, owner, session)) return;
            nodes.importFile.value = '';
            if (!importSessionCurrent(this, owner, session)) return;
            if (!files.length) { this.cancelImport(true); return; }
            const owned = beginImport(this, owner, session.state, session.generation);
            const current = () => importSessionCurrent(this, owner, owned);
            writeImport(owner, current, 'importPanel', 'hidden', false);
            writeImport(owner, current, 'importApply', 'disabled', true);
            writeImport(owner, current, 'importAppend', 'disabled', true);
            writeImport(owner, current, 'importPreview', 'textContent', '');
            writeImport(owner, current, 'importInfo', 'textContent', t('scratchpadImportReading'));
            focusImport(owner, current, 'importCancel');
            try {
                if (!current()) return;
                const file = files[0], name = file.name;
                if (!current()) return;
                const size = file.size;
                if (!current()) return;
                if (files.length !== 1 || typeof name !== 'string' || !/\.txt$/i.test(name) || size > api.LIMITS.bytes) throw api.fault('SIZE_LIMIT');
                const read = file.arrayBuffer;
                if (!current()) return;
                const bytes = await read.call(file);
                if (!current()) return;
                const length = bytes.byteLength;
                if (!current()) return;
                if (length > api.LIMITS.bytes) throw api.fault('SIZE_LIMIT');
                // Preserve a literal leading BOM as text, like our own UTF-8 export.
                const Decoder = root.TextDecoder;
                if (!current()) return;
                const decoder = new Decoder('utf-8', { fatal: true, ignoreBOM: true });
                if (!current()) return;
                const decode = decoder.decode;
                if (!current()) return;
                const text = api.content(decode.call(decoder, bytes));
                if (!current()) return;
                owned.receipt.text = text;
                if (!current()) return;
                owned.receipt.name = name;
                if (!current()) return;
                owned.text = text; owned.name = name;
                writeImport(owner, current, 'importAppend', 'disabled', false);
                if (current()) this.renderImportPreview();
            } catch (_) {
                if (current()) writeImport(owner, current, 'importInfo', 'textContent', t('scratchpadImportError'));
            }
        }
        importResult(receipt) {
            const owner = viewImports.get(this), session = owner.session;
            if (receipt !== session?.receipt || !importSessionCurrent(this, owner, session) || typeof session.text !== 'string') throw api.fault('UNAVAILABLE');
            const before = session.state.content, after = session.text, append = owner.lifecycle.nodes.importAppend.checked;
            // Preserve both inputs exactly; separate adjacent non-empty lines only.
            const separator = before && after && !/[\r\n]$/.test(before) && !/^[\r\n]/.test(after) ? '\n' : '';
            const text = api.content(append ? before + separator + after : after);
            if (!importSessionCurrent(this, owner, session) || owner.lifecycle.nodes.importAppend.checked !== append) throw api.fault('UNAVAILABLE');
            return text;
        }
        renderImportPreview() {
            const owner = viewImports.get(this), session = owner.session, { nodes } = owner.lifecycle;
            if (!importSessionCurrent(this, owner, session) || typeof session.text !== 'string') return;
            const append = nodes.importAppend.checked, current = () => importSessionCurrent(this, owner, session) && nodes.importAppend.checked === append;
            writeImport(owner, current, 'importApply', 'textContent', t(append ? 'scratchpadImportAppend' : 'scratchpadImportReplace'));
            try {
                if (!current()) return;
                const text = this.importResult(session.receipt);
                const info = `${session.name} · ${Array.from(text).length.toLocaleString()} / 32,000 · ${new root.Blob([text]).size.toLocaleString()} B`;
                writeImport(owner, current, 'importInfo', 'textContent', info);
                writeImport(owner, current, 'importPreview', 'textContent', text);
                writeImport(owner, current, 'importApply', 'disabled', false);
            } catch (_) {
                writeImport(owner, current, 'importPreview', 'textContent', '');
                writeImport(owner, current, 'importApply', 'disabled', true);
                if (current()) writeImport(owner, current, 'importInfo', 'textContent', t('scratchpadImportAppendLimit'));
            }
        }
        applyImport() {
            const owner = viewImports.get(this), session = owner.session, c = owner.lifecycle.controller;
            if (!importSessionCurrent(this, owner, session) || typeof session.text !== 'string') { this.cancelImport(); return; }
            let text;
            try { text = this.importResult(session.receipt); } catch (_) { this.renderImportPreview(); return; }
            if (!importSessionCurrent(this, owner, session)) return;
            const epoch = this.cancelImport();
            const unchanged = () => owner.epoch === epoch && !owner.session && this.importSession === null &&
                importReady(this, owner) && c.state === session.state && c.generation === session.generation;
            if (!unchanged()) return;
            const setDraft = c.setDraft;
            if (!unchanged()) return;
            // The original Controller owns the draft from here. Its emit/focus
            // callbacks may create a newer draft; never explicitly save that edit.
            setDraft.call(c, text);
            const applied = () => owner.epoch === epoch && !owner.session && this.importSession === null && importSourceCurrent(this, owner) &&
                c.state === session.state && c.generation === session.generation + 1 && c.draft === text;
            focusImport(owner, applied, 'textarea');
            if (!applied()) return;
            const save = c.save;
            if (applied()) run(() => save.call(c));
        }
        canCopy(event) { return this.canCopyFrom(this.copyButton, event); }
        canCopyFrom(origin, event) {
            const c = this.controller, workspace = c.store?.backend?.workspace, session = root.LocalItabWorkspaces?.session;
            if (!c.loaded || c.composing || this.findComposing || event?.isComposing || event?.keyCode === 229 ||
                origin?.disabled || document.hidden || document.visibilityState === 'hidden' ||
                root.LocalItabContentLifecycle?.departing || workspace?.invalidated || workspace?._suspended ||
                (workspace && session && workspace !== session) || !this.findVisible(origin) || !this.findVisible(this.textarea)) return false;
            for (let node = origin.parentElement; node; node = node.parentElement) if (node.tagName === 'DETAILS' && !node.open) return false;
            return true;
        }
        selectionOwned(owner) {
            const workspace = owner?.controller.store?.backend?.workspace;
            return Boolean(owner?.controller === this.controller && (!workspace || root.LocalItabWorkspaces?.session === workspace) && owner?.valid && owner === this.copySelectionOwner && selectionOwners.get(owner.host) === owner && owner.host === this.host &&
                owner.editor === this.textarea && owner.origin === this.copySelectionButton && owner.status === this.copyStatus && owner.document === document &&
                owner.host.ownerDocument === document && owner.editor.ownerDocument === document && owner.origin.ownerDocument === document &&
                owner.controls.ownerDocument === document && owner.status.ownerDocument === document && owner.status.parentElement === owner.host &&
                owner.host.parentElement === owner.parent && owner.editor.parentElement === owner.host &&
                owner.origin.parentElement === owner.controls && owner.controls.parentElement === owner.host);
        }
        refreshCopyControl() {
            // Keep native focused buttons in place; every click rechecks readiness.
            const state = viewCopies.get(this), transaction = state.active || state.feedback || {};
            if (!transaction.controller) copyContext(this, transaction, this.copyButton, null);
            refreshCopyButtons(this, transaction);
        }
        invalidateSelectionCopy() { if (viewCopies.get(this).feedback?.receipt.selection) this.invalidateCopy(); }
        invalidateCopy() {
            const transaction = viewCopies.get(this).feedback;
            if (!transaction) return;
            retireCopy(this, transaction);
            // Feedback retirement cannot release an already-issued write.
            if (!viewCopies.get(this).feedback) refreshCopyButtons(this, transaction);
        }
        copyCurrent(receipt) {
            try {
                const transaction = viewCopies.get(this).feedback;
                if (!transaction || transaction.receipt !== receipt) return false;
                if (!transaction.valid || !receipt.valid || this.copyReceipt !== receipt) { retireCopy(this, transaction); return false; }
                transaction.drain?.();
                if (viewCopies.get(this).feedback !== transaction || !copyContextCurrent(this, transaction)) return false;
                if (receipt.saved) return this.savedCopyCurrent(receipt) && copyContextCurrent(this, transaction);
                const c = transaction.controller, workspace = transaction.workspace;
                if (!this.canCopyFrom(transaction.origin)) return false;
                if (receipt.selection && (!this.selectionOwned(receipt.owner) ||
                    !Object.is(transaction.editor.selectionStart, receipt.start) || !Object.is(transaction.editor.selectionEnd, receipt.end) ||
                    !Object.is(transaction.editor.selectionDirection, receipt.direction))) return false;
                const editorText = transaction.editor.value;
                if (!this.canCopyFrom(transaction.origin)) return false;
                return transaction.valid && viewCopies.get(this).feedback === transaction && receipt.valid && this.copyReceipt === receipt &&
                    c.generation === receipt.generation && c.draft === receipt.draft && editorText === receipt.editorText &&
                    (!receipt.selection || this.selectionOwned(receipt.owner)) && copyContextCurrent(this, transaction);
            } catch (_) { return false; }
        }
        savedContext(owner) {
            if (!owner?.valid || owner !== this.copySavedOwner || savedOwners.get(owner.host) !== owner) return false;
            const c = owner.controller, workspace = owner.backend?.workspace;
            // A View belongs to its construction-time workspace. A later render
            // cannot authorize an old card against a replacement session/store.
            if (c !== this.controller || c.store !== owner.store || owner.store?.backend !== owner.backend ||
                workspace !== owner.workspace || workspace?.id !== owner.workspaceId || workspace?.generation !== owner.workspaceGeneration ||
                root.LocalItabWorkspaces?.session !== owner.session || (workspace && owner.session !== workspace)) {
                owner.valid = false; return false;
            }
            return owner.host === this.host && owner.preview === this.savedPreview && owner.label === this.savedLabel &&
                owner.origin === this.copySavedButton && owner.status === this.copyStatus && owner.document === document;
        }
        savedOwned(owner) {
            return this.savedContext(owner) &&
                [owner.host, owner.preview, owner.label, owner.origin, owner.controls, owner.status].every(node => node.ownerDocument === document) &&
                owner.preview.parentElement === owner.host && owner.label.parentElement === owner.host && owner.status.parentElement === owner.host &&
                owner.origin.parentElement === owner.controls && owner.controls.parentElement === owner.host &&
                owner.chain.every((node, index) => node.ownerDocument === document && (node.parentElement || null) === (owner.chain[index + 1] || null));
        }
        savedAvailable(owner, event) {
            // Controller/context eligibility only: no layout or ancestry reads.
            // Document visibility is checked again after the visual checks.
            if (!this.savedContext(owner)) return false;
            const c = owner.controller, workspace = owner.workspace;
            return !(this.closed || c.closed || !c.loaded || !c.conflict || c.pending || c.pendingWrite || c.readError ||
                (c.error && !['CONFLICT', 'TEXT', 'TEXT_LIMIT', 'SIZE_LIMIT'].includes(c.error.code)) ||
                c.composing || this.findComposing || event?.isComposing || event?.keyCode === 229 || event?.defaultPrevented || event?.repeat ||
                document.hidden || document.visibilityState === 'hidden' || root.LocalItabContentLifecycle?.departing ||
                workspace?.invalidated || workspace?._suspended);
        }
        canCopySaved(owner, event) {
            try {
                if (!this.savedOwned(owner) || !this.savedAvailable(owner, event)) return false;
                for (const source of [owner.preview, owner.label, owner.origin, owner.controls]) {
                    if (source.disabled || !this.findVisible(source)) return false;
                    for (let node = source; node; node = node.parentElement) {
                        if (node.tagName === 'DETAILS' && !node.open) return false;
                        const style = root.getComputedStyle?.(node);
                        if (style?.display === 'none' || ['hidden', 'collapse'].includes(style?.visibility)) return false;
                    }
                }
                return this.savedOwned(owner);
            } catch (_) { return false; }
        }
        savedState(owner) {
            // Store returns plain, validated data. Do not invoke a stale or
            // malformed state's accessors while deriving clipboard content.
            const state = Object.getOwnPropertyDescriptor(owner.controller, 'state')?.value;
            if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
            const fields = Object.getOwnPropertyDescriptors(state);
            if (!['schemaVersion', 'revision', 'content', 'enabled'].every(key => fields[key] && Object.hasOwn(fields[key], 'value')) || fields.schemaVersion.value !== 1) return null;
            const revision = fields.revision.value, content = fields.content.value, enabled = fields.enabled.value;
            if (!Number.isSafeInteger(revision) || revision < 0 || typeof content !== 'string' || typeof enabled !== 'boolean') return null;
            return { revision, content, enabled };
        }
        savedSnapshot(owner) {
            const state = this.savedState(owner);
            if (!state) return null;
            const display = owner.preview.value;
            if (typeof display !== 'string' || (display !== state.content && display !== state.content.replace(/\r\n?/g, '\n'))) return null;
            if (owner.label.textContent !== owner.labelText || owner.origin.textContent !== owner.buttonText) return null;
            return { ...state, display };
        }
        savedCopyCurrent(receipt) {
            const owner = receipt.owner;
            if (!this.canCopySaved(owner)) return false;
            const snapshot = this.savedSnapshot(owner);
            if (!snapshot || !receipt.snapshot || !['revision', 'content', 'enabled', 'display'].every(key => snapshot[key] === receipt.snapshot[key]) ||
                !this.canCopySaved(owner)) return false;
            // Recheck data after the last DOM/currentness getter can reenter.
            // Same revision/content refreshes may create a new state object.
            if (!this.savedAvailable(owner)) return false;
            const latest = this.savedState(owner);
            return receipt.valid && this.copyReceipt === receipt && latest &&
                ['revision', 'content', 'enabled'].every(key => latest[key] === receipt.snapshot[key]);
        }
        copySavedText(event, owner = this.copySavedOwner) { return this.executeSavedCopy(event, owner); }
        async executeSavedCopy(event, owner) {
            const receipt = { valid: true, saved: true, owner }, transaction = reserveCopy(this, receipt);
            if (!transaction) return;
            const cancel = () => retireCopy(this, transaction);
            try {
                if (event?.defaultPrevented || event?.detail > 1 || event?.repeat || this.copySavedKey?.used ||
                    !owner || (event?.currentTarget && event.currentTarget !== owner.origin) ||
                    (event?.target && !owner.origin.contains(event.target))) return;
                receipt.origin = owner.origin; copyContext(this, transaction, owner.origin, owner);
                if (viewCopies.get(this).feedback && !this.copyCurrent(viewCopies.get(this).feedback.receipt)) this.invalidateCopy();
                if (!this.canCopySaved(owner, event) || !copyContextCurrent(this, transaction)) return;
                this.invalidateCopy(); viewCopies.get(this).feedback = transaction; this.copyReceipt = receipt;
                if (this.copySavedKey) this.copySavedKey.used = true;
                const sources = [owner.origin, owner.preview, owner.label, owner.controls, owner.status, ...owner.chain, ...transaction.buttons];
                const displays = [owner.origin, owner.preview, owner.label];
                const attributes = new Set([owner.origin, owner.preview, owner.label, owner.controls, ...owner.chain]);
                const invalidating = records => records.some(record => record.type === 'attributes' ? attributes.has(record.target) :
                    displays.some(node => node === record.target || node.contains?.(record.target)) ||
                    Array.from(record.removedNodes || []).some(node => sources.some(source => node === source || node.contains?.(source))));
                const observer = root.MutationObserver ? new root.MutationObserver(records => { if (invalidating(records)) cancel(); }) : null;
                receipt.drain = transaction.drain = () => { if (observer && invalidating(observer.takeRecords())) cancel(); };
                const preview = owner.preview;
                receipt.cleanup = transaction.cleanup = cleanCopyResources([
                    () => observer?.disconnect(), () => document.removeEventListener('visibilitychange', cancel, true),
                    () => root.removeEventListener?.('blur', cancel), () => root.removeEventListener?.('pagehide', cancel),
                    () => preview.removeEventListener('input', cancel), () => preview.removeEventListener('change', cancel)
                ]);
                const attributeFilter = ['hidden', 'inert', 'aria-hidden', 'style', 'class', 'open', 'disabled'];
                // Observe only original source nodes and their ancestor chain.
                // The status's own hidden/text updates must not cancel itself.
                for (const node of [...owner.chain, owner.controls]) observer?.observe(node, { childList: true, attributes: true, attributeFilter });
                for (const node of displays) observer?.observe(node, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter });
                document.addEventListener('visibilitychange', cancel, true);
                root.addEventListener?.('blur', cancel); root.addEventListener?.('pagehide', cancel);
                owner.preview.addEventListener('input', cancel); owner.preview.addEventListener('change', cancel);
                receipt.snapshot = this.savedSnapshot(owner);
                if (!this.copyCurrent(receipt)) { cancel(); return; }
                const payload = receipt.snapshot.content;
                writeCopyStatus(this, transaction, 'hidden', false);
                if (!payload) { writeCopyStatus(this, transaction, 'textContent', t('scratchpadCopySavedEmpty')); return; }
                if (!api.isUnicode(payload)) { writeCopyStatus(this, transaction, 'textContent', t('scratchpadCopySavedInvalid')); return; }
                writeCopyStatus(this, transaction, 'textContent', t('scratchpadCopySavedCopying')); this.refreshCopyControl();
                const clipboard = this.clipboard, writeText = clipboard?.writeText;
                if (!this.copyCurrent(receipt)) { cancel(); return; }
                if (typeof writeText !== 'function') throw new Error('Clipboard unavailable');
                // Keep raw saved CRLF/CR. The DOM preview may display LF, but it
                // is only a currentness check and never the clipboard payload.
                const result = writeText.call(clipboard, payload);
                try { if (!this.copyCurrent(receipt)) cancel(); }
                finally { await result; }
                if (this.copyCurrent(receipt)) writeCopyStatus(this, transaction, 'textContent', t('scratchpadCopySavedSuccess'));
            } catch (_) {
                if (this.copyCurrent(receipt)) writeCopyStatus(this, transaction, 'textContent', t('scratchpadCopySavedFailure'));
            } finally {
                try { if (!this.copyCurrent(receipt)) cancel(); }
                finally { finishCopy(this, transaction); }
                if (transaction.cleanupError) throw transaction.cleanupError;
            }
        }
        copyText(event, origin = this.copyButton) { return this.executeCopy(event, origin); }
        copySelectedText(event, owner = this.copySelectionOwner) { return this.executeCopy(event, owner?.origin, owner, true); }
        async executeCopy(event, origin, owner = null, selection = false) {
            const receipt = { valid: true, selection, origin, owner }, transaction = reserveCopy(this, receipt);
            if (!transaction) return;
            const cancel = () => retireCopy(this, transaction);
            try {
                copyContext(this, transaction, origin, owner);
                if (selection && (event?.defaultPrevented || event?.detail > 1 || event?.repeat || this.copySelectionKey?.used ||
                    !this.selectionOwned(owner) || (event?.currentTarget && event.currentTarget !== owner.origin) ||
                    (event?.target && !owner.origin.contains(event.target)))) return;
                if (!this.canCopyFrom(origin, event) || (owner && !this.selectionOwned(owner)) || !copyContextCurrent(this, transaction)) return;
                this.invalidateCopy();
                if (selection && this.copySelectionKey) this.copySelectionKey.used = true;
                const c = transaction.controller, workspace = transaction.workspace, editor = transaction.editor, copyStatus = transaction.status;
                Object.assign(receipt, { draft: c.draft, generation: c.generation, workspace, workspaceId: workspace?.id,
                    workspaceGeneration: workspace?.generation, session: transaction.session });
                viewCopies.get(this).feedback = transaction; this.copyReceipt = receipt;
                // Record brief hide/show or detach/reattach cycles, even when the DOM
                // looks unchanged again by the time the clipboard promise settles.
                const sources = [origin, editor, copyStatus, ...transaction.buttons];
                const invalidating = records => records.some(record => record.type === 'attributes' ?
                    record.target.contains(origin) || record.target.contains(editor) :
                    Array.from(record.removedNodes || []).some(node => sources.some(source => node === source || node.contains?.(source))));
                const observer = root.MutationObserver ? new root.MutationObserver(records => { if (invalidating(records)) cancel(); }) : null;
                const selectionChanged = event => {
                    // Ignore unrelated document selections. Editor events also retire
                    // A→B→A changes whose offsets already look unchanged again.
                    if (event.target === editor || document.activeElement === editor ||
                        editor.value !== receipt.editorText || editor.selectionStart !== receipt.start ||
                        editor.selectionEnd !== receipt.end || editor.selectionDirection !== receipt.direction) cancel();
                };
                receipt.drain = transaction.drain = () => { if (observer && invalidating(observer.takeRecords())) cancel(); };
                receipt.cleanup = transaction.cleanup = cleanCopyResources([
                    () => observer?.disconnect(), () => document.removeEventListener('visibilitychange', cancel, true),
                    () => root.removeEventListener?.('blur', cancel), () => root.removeEventListener?.('pagehide', cancel),
                    ...(owner ? [() => editor.removeEventListener('select', selectionChanged), () => editor.removeEventListener('selectionchange', selectionChanged),
                        () => document.removeEventListener('selectionchange', selectionChanged)] : [])
                ]);
                document.addEventListener('visibilitychange', cancel, true);
                root.addEventListener?.('blur', cancel); root.addEventListener?.('pagehide', cancel);
                const attributeFilter = ['hidden', 'inert', 'aria-hidden', 'style', 'class', 'open'];
                if (owner) attributeFilter.push('disabled');
                observer?.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter });
                if (owner) {
                    editor.addEventListener('select', selectionChanged); editor.addEventListener('selectionchange', selectionChanged);
                    document.addEventListener('selectionchange', selectionChanged);
                }
                receipt.editorText = editor.value;
                if (owner) { receipt.start = editor.selectionStart; receipt.end = editor.selectionEnd; receipt.direction = editor.selectionDirection; }
                if (!this.copyCurrent(receipt)) { cancel(); return; }
                writeCopyStatus(this, transaction, 'hidden', false);
                let payload = receipt.draft;
                if (owner) {
                    const { start, end, editorText } = receipt;
                    payload = Number.isInteger(start) && Number.isInteger(end) && start >= 0 && end > start && end <= editorText.length ? editorText.slice(start, end) : '';
                    if (!payload || !api.isUnicode(payload)) { writeCopyStatus(this, transaction, 'textContent', t('scratchpadCopySelectionHelp')); return; }
                } else {
                    if (!payload) { writeCopyStatus(this, transaction, 'textContent', t('scratchpadCopyEmpty')); return; }
                    if (!api.isUnicode(payload)) { writeCopyStatus(this, transaction, 'textContent', t('scratchpadCopyInvalid')); return; }
                }
                writeCopyStatus(this, transaction, 'textContent', t(owner ? 'scratchpadCopySelectionCopying' : 'scratchpadCopying')); this.refreshCopyControl();
                // The full route retains the exact controller draft (including
                // CRLF). The selection route slices the native DOM value only.
                // No awaited work precedes this user-activated system call.
                const clipboard = this.clipboard, writeText = clipboard?.writeText;
                if (!this.copyCurrent(receipt)) { cancel(); return; }
                if (typeof writeText !== 'function') throw new Error('Clipboard unavailable');
                const result = writeText.call(clipboard, payload);
                try { if (!this.copyCurrent(receipt)) cancel(); }
                finally { await result; }
                if (this.copyCurrent(receipt)) writeCopyStatus(this, transaction, 'textContent', t(owner ? 'scratchpadCopySelectionSuccess' : 'scratchpadCopySuccess'));
            } catch (_) {
                if (this.copyCurrent(receipt)) writeCopyStatus(this, transaction, 'textContent', t(owner ? 'scratchpadCopySelectionFailure' : 'scratchpadCopyFailure'));
            } finally {
                try { if (!this.copyCurrent(receipt)) cancel(); }
                finally { finishCopy(this, transaction); }
                if (transaction.cleanupError) throw transaction.cleanupError;
            }
        }
        exportText() {
            const owner = viewExports.get(this);
            if (!owner || owner.active || owner.lifecycle.retired) return;
            // Reserve before observable getters can synchronously reenter export.
            owner.active = true;
            const { controller, backend, document, nodes } = owner.lifecycle;
            let context, feedback, generation, url, link, remove, urls, revoke, scheduled = false, removed = false, revoked = false, failed = false;
            const current = () => exportContextCurrent(this, owner, context);
            const removeLink = () => { if (link && !removed) { removed = true; remove?.call(link); } };
            const revokeURL = () => { if (url !== undefined && !revoked) { revoked = true; revoke.call(urls, url); } };
            const report = key => {
                if (!current() || controller.generation !== generation || nodes.status.textContent !== feedback) return;
                const message = t(key);
                if (current() && controller.generation === generation && nodes.status.textContent === feedback) nodes.status.textContent = message;
            };
            try {
                if (!current()) return;
                const workspace = backend?.workspace;
                context = { workspace, workspaceId: workspace?.id, workspaceGeneration: workspace?.generation, session: root.LocalItabWorkspaces?.session };
                if (!current()) return;
                feedback = nodes.status.textContent; generation = controller.generation;
                // Preserve exact raw newlines, except during genuine IME composition.
                const draft = controller.composing ? nodes.textarea.value : controller.draft;
                if (!current()) return;
                if (!api.isUnicode(draft)) { report('scratchpadInvalidText'); return; }
                const Blob = root.Blob; if (!current()) return;
                urls = root.URL; if (!current()) return;
                const createURL = urls.createObjectURL; if (!current()) return;
                revoke = urls.revokeObjectURL; if (!current()) return;
                const create = document.createElement; if (!current()) return;
                const body = document.body; if (!current()) return;
                const append = body.append; if (!current()) return;
                const schedule = root.setTimeout; if (!current()) return;
                const blob = new Blob([draft], { type: 'text/plain;charset=utf-8' }); if (!current()) return;
                url = createURL.call(urls, blob); if (!current()) return;
                link = create.call(document, 'a');
                // Capture cleanup before any later anchor setter or click lookup.
                remove = link.remove; if (!current()) return;
                const click = link.click; if (!current()) return;
                link.href = url; if (!current()) return;
                link.download = 'local-itab-scratchpad.txt'; if (!current()) return;
                append.call(body, link); if (!current()) return;
                // The source can remain ours while a callback redirects this
                // disposable resource. Recheck its payload and destination too.
                const anchorCurrent = () => link.href === url && link.download === 'local-itab-scratchpad.txt' &&
                    link.ownerDocument === document && link.parentElement === body && current();
                if (!anchorCurrent() || !anchorCurrent()) return;
                click.call(link);
                // Activation is already issued; later source changes cannot undo it.
                removeLink();
                schedule.call(root, () => { try { revokeURL(); } catch (_) {} }, 1000); scheduled = true;
            } catch (_) { failed = true; }
            finally {
                try { removeLink(); } catch (_) { failed = true; }
                if (!scheduled) try { revokeURL(); } catch (_) { failed = true; }
                try { if (failed) report('scratchpadExportError'); } catch (_) {}
                owner.active = false;
            }
        }
        hasUncommittedWork() {
            const lifecycle = viewLifecycles.get(this);
            return Boolean(lifecycle && !lifecycle.retired && lifecycle.controller.hasUncommittedWork());
        }
        destroy() {
            const lifecycle = viewLifecycles.get(this); if (!lifecycle || lifecycle.retired) return;
            // Private retirement precedes every callback and cannot be reset by
            // public fields. A write already issued by the Store still settles.
            lifecycle.retired = true; this.closed = true;
            const imports = viewImports.get(this); imports.epoch++; imports.session = null;
            const { host, nodes, selectionOwner, savedOwner } = lifecycle;
            let failed = false, failure;
            const cleanup = action => { try { action(); } catch (error) { if (!failed) { failed = true; failure = error; } } };
            savedOwner.valid = false; selectionOwner.valid = false;
            if (savedOwners.get(host) === savedOwner) savedOwners.delete(host);
            if (selectionOwners.get(host) === selectionOwner) selectionOwners.delete(host);
            const feedback = viewCopies.get(this).feedback;
            cleanup(() => retireViewCopy(this));
            if (!feedback) {
                // No receipt owns this status. Retain construction-time private
                // ancestry rather than following mutable public owner objects.
                const ownsStatus = () => copyChainOwned(lifecycle.copyStatusChain, lifecycle.document, true);
                cleanup(() => { if (ownsStatus()) nodes.copyStatus.textContent = ''; });
                cleanup(() => { if (ownsStatus()) nodes.copyStatus.hidden = true; });
            }
            this.findHeldEnter = null; this.findComposing = false; this.findResult = null; this.importSession = null;
            // Check each original target independently, including after another
            // setter transfers it. Detached original chains remain eligible;
            // new parents/documents do not. Retired teardown never restores focus.
            for (const action of [
                () => writeTeardownProperty(lifecycle, 'findInput', 'value', ''),
                () => writeTeardownProperty(lifecycle, 'findStatus', 'textContent', ''),
                () => writeTeardownProperty(lifecycle, 'findPanel', 'hidden', true),
                () => writeTeardownAttribute(lifecycle, 'findButton', 'aria-expanded', 'false'),
                () => writeTeardownProperty(lifecycle, 'findPrevious', 'disabled', true),
                () => writeTeardownProperty(lifecycle, 'findNext', 'disabled', true),
                () => writeTeardownProperty(lifecycle, 'importApply', 'textContent', t('scratchpadImportReplace')),
                () => writeTeardownProperty(lifecycle, 'importAppend', 'checked', false),
                () => writeTeardownProperty(lifecycle, 'importAppend', 'disabled', true),
                () => writeTeardownProperty(lifecycle, 'importPanel', 'hidden', true),
                () => writeTeardownProperty(lifecycle, 'importPreview', 'textContent', ''),
                () => writeTeardownProperty(lifecycle, 'importInfo', 'textContent', ''),
                () => writeTeardownProperty(lifecycle, 'importFile', 'value', '')
            ]) cleanup(action);
            for (const [target, type, listener] of lifecycle.listeners) cleanup(() => target.removeEventListener?.(type, listener));
            cleanup(() => lifecycle.unsubscribe?.()); cleanup(() => lifecycle.destroyController());
            if (failed) throw failure;
        }
    }
    function mountSettings(host, { controller = new api.Controller() } = {}) {
        host.classList.add('local-scratchpad-settings');
        const label = el('label', 'scratchpad-enable-label'), input = el('input'); input.type = 'checkbox'; input.disabled = true;
        label.append(input, el('span', '', t('scratchpadEnable')));
        const status = el('p', 'scratchpad-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
        const retry = button('scratchpadRetry', () => run(() => controller.retry()));
        const readLatest = button('scratchpadReadLatest', () => run(() => controller.useSaved()));
        host.replaceChildren(label, el('p', 'scratchpad-help', t('scratchpadEnableHelp')), el('p', 'scratchpad-help', t('scratchpadHelp')), status, retry, readLatest);
        const render = () => {
            input.checked = controller.state?.enabled === true; input.disabled = !controller.loaded || Boolean(controller.pending || controller.error || controller.conflict);
            const text = controller.conflict && !controller.readError ? t('scratchpadSettingsConflict') : statusText(controller); if (status.textContent !== text) status.textContent = text;
            retry.hidden = !controller.readError && (!controller.error || Boolean(controller.conflict)); retry.disabled = Boolean(controller.pending);
            readLatest.hidden = !controller.conflict; readLatest.disabled = Boolean(controller.pending);
        };
        input.addEventListener('change', () => run(() => controller.setEnabled(input.checked)));
        const unsubscribe = controller.subscribe(render); render(); run(() => controller.init());
        return { controller, hasUncommittedWork: () => controller.hasUncommittedWork(), destroy() { unsubscribe(); controller.destroy(); } };
    }
    Object.assign(api, { View, mount: (host, options) => new View(host, options), mountSettings });
})(window);
