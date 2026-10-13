const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Catalog = require('../shared/navigation-catalog');
const sites = require('../shared/navigation-sites');

const counts = {
    sites: new Set(sites.map(site => site.id)).size,
    categories: Catalog.categories.length,
    tags: new Set(sites.flatMap(site => site.tags)).size
};
const guides = [
    ['README.md', '发现并添加网站', {
        sites: /(\d+)\s*个网站/,
        categories: /(\d+)\s*个分类/,
        tags: /(\d+)\s*个用途标签/
    }],
    ['README.en.md', 'Discover and add sites', {
        sites: /(\d+)\s+built-in sites/,
        categories: /(\d+)\s+categories/,
        tags: /(\d+)\s+use tags/
    }],
    ['README.es-ES.md', 'Descubrir y añadir sitios', {
        sites: /(\d+)\s+sitios integrados/,
        categories: /(\d+)\s+categorías/,
        tags: /(\d+)\s+etiquetas de uso/
    }]
];

for (const [file, heading, patterns] of guides) {
    for (const [kind, pattern] of Object.entries(patterns)) {
        test(`${file}: current discovery ${kind} count matches the catalog`, () => {
            const content = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
            const section = content.split(`### ${heading}\n`)[1];
            assert.ok(section, `${file}: missing current discovery guide heading`);
            // Only the opening user guide paragraph is current inventory; historical
            // screenshots elsewhere and per-category membership totals are unrelated.
            const introduction = section.trimStart().split(/\n\s*\n/)[0];
            const match = introduction.match(pattern);
            assert.ok(match, `${file}: missing current ${kind} count in discovery introduction`);
            assert.equal(Number(match[1]), counts[kind],
                `${file}: current ${kind} count must match the live catalog`);
        });
    }
}
