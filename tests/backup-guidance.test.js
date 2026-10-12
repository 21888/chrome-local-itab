'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('options.html', 'utf8');
const keys = ['updateBackupScope', 'updateUnpackedBackup', 'tasksSettingsBoundary'];
test('backup guidance HTML fallbacks match English and both locales point to complete backup', () => {
    for (const locale of ['en', 'zh_CN']) {
        const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`));
        for (const key of keys) {
            const text = catalog[key].message;
            assert.match(text, locale === 'en' ? /complete local backup/i : /完整本地备份/);
            assert.match(text, locale === 'en' ? /drafts/i : /草稿/);
            assert.match(text, locale === 'en' ? /sessions/i : /会话/);
            if (locale === 'en') {
                const fallback = html.match(new RegExp(`data-i18n="${key}">([^<]+)<`));
                assert(fallback, `${key} fallback exists`);
                assert.equal(fallback[1], text, `${key} fallback matches English`);
            }
        }
        const scope = catalog.tasksSettingsBoundary.message;
        for (const token of ['JSON', 'Drive']) assert(scope.includes(token));
        assert.match(scope, locale === 'en' ? /seven saved modules/ : /七个已保存模块/);
        assert.match(catalog.updateUnpackedBackup.message, locale === 'en' ? /Older versions without complete backup/ : /尚无完整备份的旧版/);
    }
});
test('all README summaries distinguish collection, prompt-only and workspace-only schemas', () => {
    for (const file of ['README.md', 'README.en.md', 'README.es-ES.md']) {
        const text = fs.readFileSync(file, 'utf8');
        assert.match(text, /schema 4/); assert.match(text, /schema 3/); assert.match(text, /schema 2/);
    }
    // Documentation-only guidance must describe the existing seven-module contract.
    const backup = require('../shared/complete-backup.js');
    assert.deepEqual([...backup.MODULES], ['config', 'tasks', 'scratchpad', 'countdown', 'focus', 'prompts', 'collections']);
});
