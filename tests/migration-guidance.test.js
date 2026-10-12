const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Data backup warning distinguishes complete saved-data migration from ordinary settings in both languages', () => {
    for (const locale of ['en', 'zh_CN']) {
        const catalog = JSON.parse(read(`_locales/${locale}/messages.json`));
        const warning = catalog.tasksSettingsBoundary.message;
        // The scope warning uses short module names, not necessarily card titles.
        const exclusions = locale === 'en'
            ? /Settings JSON, Chrome Sync and Drive exclude ([^.]+)\./
            : /设置 JSON、Chrome 同步和 Drive 不包含([^。]+)。/;
        const excluded = warning.match(exclusions);
        assert(excluded, `${locale}: ordinary settings/sync/Drive exclusion is explicit`);
        for (const name of locale === 'en'
            ? ['Tasks', 'Focus', 'Scratchpad', 'Countdown', 'global AI libraries']
            : ['待办', '专注', '便笺', '倒计时', '全局 AI 库']) {
            assert(excluded[1].includes(name), `${locale}: missing excluded module ${name}`);
        }
        assert.match(warning, locale === 'en'
            ? /Use Complete local backup below for seven saved modules, or the separate exports/
            : /完整本地备份选择七个已保存模块，也可使用独立导出/);
        assert.match(warning, locale === 'en'
            ? /Unsaved drafts and timer sessions do not migrate/
            : /未保存草稿和计时会话不迁移/);
        assert.match(warning, locale === 'en'
            ? /Ordinary settings reset\/restore preserves these modules/
            : /普通设置重置或恢复会保留这些模块/);
    }
    const english = JSON.parse(read('_locales/en/messages.json')).tasksSettingsBoundary.message;
    assert(read('options.html').includes(`data-i18n="tasksSettingsBoundary">${english}</p>`));
});

test('README migration guides and their relative links resolve', () => {
    for (const [readme, guide] of [['README.en.md', 'docs/migration.en.md'], ['README.md', 'docs/migration.zh-CN.md'], ['README.es-ES.md', 'docs/migration.es-ES.md']]) {
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
        ['README.en.md', ['same permanent folder originally loaded', 'Do not remove', 'selecting the saved modules you need', 'Ordinary settings JSON and Drive snapshots exclude personal modules', 'Older versions without complete backup require the available separate exports and manually noted Focus preferences', 'Unsaved drafts and timer sessions cannot be migrated', 'unsaved or conflicted draft', 'verify the installed version and existing data']],
        ['README.md', ['最初加载的固定文件夹内', '不要移除扩展', '选择需要的已保存模块', '普通设置 JSON 和 Drive 快照不包含个人模块', '尚无完整备份的旧版请使用原有独立导出，并手动记录专注偏好', '未保存草稿和计时会话不可迁移', '未保存或冲突草稿', '确认安装版本及原有数据']],
        ['README.es-ES.md', ['misma carpeta permanente cargada originalmente', 'No elimines la extensión', 'seleccionando los módulos guardados que necesites', 'El JSON de ajustes y Drive excluyen los módulos personales', 'Las versiones antiguas sin copia completa requieren las exportaciones independientes disponibles y anotar las preferencias de concentración', 'Los borradores sin guardar y las sesiones no se migran', 'borrador sin guardar o en conflicto', 'verifica la versión instalada y los datos existentes']]
    ]) {
        const install = read(file).split('<a id="install"></a>')[1].split('<a id="features"></a>')[0];
        for (const term of terms) assert(install.includes(term), `${file}: missing ${term}`);
        const backupGuide = file === 'README.md' ? 'zh-CN' : file === 'README.en.md' ? 'en' : 'es-ES';
        assert(install.includes(`](docs/complete-backup.${backupGuide}.md)`), `${file}: missing complete backup guide`);
        assert(install.includes('](docs/version-updates.md)'), `${file}: missing upgrade guide`);
        assert(install.includes('manifest.json'), `${file}: missing root-folder instruction`);
    }
});


test('complete-backup and migration guides describe all seven modules and reviewed global/workspace scope in three languages', () => {
    for (const locale of ['en','zh-CN','es-ES']) {
        for (const prefix of ['complete-backup','migration']) {
            const content=read(`docs/${prefix}.${locale}.md`);
            assert.match(content,/schema.?1/i);
            assert.match(content,locale==='zh-CN'?/七个模块/:locale==='en'?/seven modules/:/siete módulos/);
            assert.match(content,locale==='zh-CN'?/回收站/:locale==='en'?/Trash/:/papelera/);
            assert.match(content,locale==='zh-CN'?/全局/:/global/);
        }
    }
});
