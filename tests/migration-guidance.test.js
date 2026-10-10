const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Data backup warning names every device-local personal module in both languages', () => {
    for (const locale of ['en', 'zh_CN']) {
        const catalog = JSON.parse(read(`_locales/${locale}/messages.json`));
        const warning = catalog.tasksSettingsBoundary.message;
        for (const key of ['tasksTitle', 'focusTitle', 'scratchpadTitle', 'countdownTitle']) {
            assert(warning.includes(catalog[key].message), `${locale}: missing ${key}`);
        }
        assert.match(warning, /JSON/);
        assert.match(warning, locale === 'en' ? /restore them manually/ : /手动恢复/);
        assert.match(warning, locale === 'en' ? /session cannot be migrated/ : /计时会话无法迁移/);
    }
    const english = JSON.parse(read('_locales/en/messages.json')).tasksSettingsBoundary.message;
    assert(read('options.html').includes(`data-i18n="tasksSettingsBoundary">${english}</p>`));
});

test('README migration guides and their relative links resolve', () => {
    for (const [readme, guide] of [['README.en.md', 'docs/migration.en.md'], ['README.md', 'docs/migration.zh-CN.md'], ['README.es-ES.md', 'docs/migration.en.md']]) {
        assert(read(readme).includes(`](${guide})`), `${readme}: missing migration guide`);
        const content = read(guide);
        for (const [, target] of content.matchAll(/\]\(([^)]+)\)/g)) {
            assert(fs.existsSync(path.resolve(root, path.dirname(guide), target)), `${guide}: broken ${target}`);
        }
        assert.match(content, /JSON/);
        assert.match(content, /TXT/);
    }
});


test('README installation sections include safe unpacked upgrades before Features', () => {
    for (const [file, terms] of [
        ['README.en.md', ['same permanent folder originally loaded', 'Do not remove', 'record Focus preferences manually', 'unsaved or conflicted draft', 'verify the installed version and existing data']],
        ['README.md', ['最初加载的固定文件夹内', '不要移除扩展', '专注偏好需手动记录', '未保存或冲突草稿', '确认安装版本及原有数据']],
        ['README.es-ES.md', ['misma carpeta permanente cargada originalmente', 'No elimines la extensión', 'anota las preferencias de concentración manualmente', 'borrador sin guardar o en conflicto', 'verifica la versión instalada y los datos existentes']]
    ]) {
        const install = read(file).split('<a id="install"></a>')[1].split('<a id="features"></a>')[0];
        for (const term of terms) assert(install.includes(term), `${file}: missing ${term}`);
        assert(install.includes('](docs/version-updates.md)'), `${file}: missing upgrade guide`);
        assert(install.includes('manifest.json'), `${file}: missing root-folder instruction`);
    }
});
