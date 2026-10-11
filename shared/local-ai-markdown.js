/* Read-only Markdown serialization of one current saved record. No I/O. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabAIMarkdown = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';

    function invalid() { throw new TypeError('Invalid saved Markdown record'); }
    function own(object, key) {
        if (!object || typeof object !== 'object') invalid();
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        // Do not execute accessors or convert objects supplied as field values.
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid();
        return descriptor.value;
    }
    function text(object, key) {
        const value = own(object, key);
        if (typeof value !== 'string') invalid();
        return value;
    }
    function fenced(value) {
        let length = 3;
        for (const run of value.matchAll(/`+/g)) length = Math.max(length, run[0].length + 1);
        const fence = '`'.repeat(length);
        // The two framing LF characters are always added. The value between
        // them is unmodified, including a final CR, LF, spaces, or no newline.
        return `${fence}text\n${value}\n${fence}`;
    }
    function section(label, value, level = 2) {
        return `${'#'.repeat(level)} ${label}\n\n${fenced(value)}\n\n`;
    }
    function optionalSection(label, value) { return value.length ? section(label, value) : ''; }

    function serialize(kind, record, options = {}) {
        if (!['prompt', 'collection'].includes(kind) || !record || typeof record !== 'object' || Array.isArray(record)) invalid();
        if (!options || typeof options !== 'object' || Array.isArray(options)) invalid();
        const option = Object.getOwnPropertyDescriptor(options, 'includeSourceUrl');
        if (option && !Object.hasOwn(option, 'value')) invalid();
        const includeSourceUrl = option?.value === true;
        let output = `# Saved ${kind}\n\n`;
        output += section('Title', text(record, 'title'));
        output += section('Body', text(record, 'body'));
        output += section('Body version', text(record, 'currentVersionId'));
        const tags = own(record, 'tags');
        if (!Array.isArray(tags)) invalid();
        let tagSections = '', tagNumber = 0;
        for (let index = 0; index < tags.length; index++) {
            const tag = text(tags, String(index));
            if (tag.length) tagSections += section(`Tag ${++tagNumber}`, tag, 3);
        }
        if (tagSections) output += `## Tags\n\n${tagSections}`;
        output += optionalSection('Tool', text(record, 'tool'));
        if (kind === 'prompt') {
            output += optionalSection('Category', text(record, 'category'));
        } else {
            output += optionalSection('Type', text(record, 'type'));
            output += optionalSection('Notes', text(record, 'notes'));
            const reference = own(record, 'promptRef');
            if (reference !== null) {
                if (!reference || typeof reference !== 'object' || Array.isArray(reference)) invalid();
                output += section('Prompt ID', text(reference, 'promptId'));
                output += section('Prompt body version ID', text(reference, 'bodyVersionId'));
            }
            // Source URLs may contain private conversation identifiers. Never
            // even read one unless this individual export explicitly opts in.
            if (includeSourceUrl) output += optionalSection('Source URL', text(record, 'sourceUrl'));
        }
        return output;
    }

    return Object.freeze({ serialize });
});
