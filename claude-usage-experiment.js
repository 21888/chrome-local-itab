(function () {
    'use strict';
    const result = document.getElementById('result');
    const errors = { invalid_selection: '选择无效，请重新选择页面和组织。', http_error: '官网返回了未预期的状态，未显示用量。', unsupported_response: '浏览器不支持安全读取此响应。', read_failed: '读取失败，请重新选择页面和组织。', permission_denied: '未授予所需权限。', wrong_page: '请选择精确 claude.ai 页面。', document_changed: '页面已变化，请重新选择。', organizations_changed: '组织列表已变化，请重新选择。', login_required: '请自行到 Claude 页面登录。', access_denied: '访问被拒绝，请到官网检查访问权限或验证要求。', challenge: '官网需要完成验证，请自行处理。', rate_limited: '请求过于频繁，请稍后手动重试。', temporary_error: 'Claude 服务暂时不可用。', schema_changed: '返回格式不符合预期，未显示用量。', non_json: '返回了非 JSON 页面，可能需要官网验证。', network_or_redirect: '网络失败或被重定向，请检查官网。', timeout: '读取超时。', too_large: '响应过大，已停止读取。' };
    function line(text) { const p = document.createElement('p'); p.textContent = text; result.append(p); }
    function button(label, action) { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', action); result.append(b); }
    const controller = ClaudeUsageSnapshot.createController(chrome, state => {
        const hadFocus = result.contains(document.activeElement);
        result.replaceChildren();
        if (['disabled', 'idle'].includes(state.phase)) line('已关闭，未保存任何快照。');
        else if (state.phase === 'page_changed') line('目标页面已关闭或导航，结果已清除。请重新启用。');
        else if (['enabling', 'loading'].includes(state.phase)) line('等待授权或读取中…');
        else if (state.phase === 'error') line(errors[state.error] || '无法读取，请重新选择页面和组织。');
        else if (state.phase === 'tabs') {
            line(state.tabs.length ? '请选择已经打开的 Claude 标签页。编号为浏览器标签 ID，不读取页面标题。' : '未发现已打开的 Claude 标签页。请自行打开官网后重新启用。');
            state.tabs.forEach(tab => button(`Claude 标签页 #${tab.id}`, () => controller.selectTab(tab.id)));
        } else if (state.phase === 'organizations') {
            line(state.organizations.length ? '本次请选择一个组织；即使只有一个也需手动选择。' : '此会话没有返回可选组织。');
            state.organizations.forEach(org => button(org.displayLabel, () => controller.selectOrganization(org.id)));
        } else if (state.phase === 'snapshot') {
            line(`本次页面会话下所选组织的用量快照：${state.organizationLabel}`);
            if (state.unavailable) line('此组织未提供订阅窗口。');
            for (const [key, label] of [['five_hour', '五小时窗口'], ['seven_day', '每周窗口']]) {
                const window = state.windows[key];
                line(window === null ? `${label}：未提供该窗口` : `${label}：已用 ${window.usedPercent}% · 重置时间：${window.resetAt || '未知'}`);
            }
            line(`采集时间：${state.fetchedAt}。重新读取必须重新选择标签页和组织。`);
        }
        if (hadFocus) result.focus();
    });
    document.getElementById('enable').addEventListener('click', () => controller.enable());
    document.getElementById('close').addEventListener('click', () => controller.close());
    document.getElementById('back').addEventListener('click', () => controller.close());
    window.addEventListener('pagehide', () => controller.close());
    window.addEventListener('unload', () => controller.dispose());
    controller.close();
})();
