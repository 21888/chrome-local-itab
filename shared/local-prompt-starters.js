/* Static starter text only. No persistence, sources or model execution. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.LocalItabPromptStarters = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
    'use strict';
    const templates = [
    {
        "id": "summary",
        "en": {
            "title": "Summarize",
            "description": "Find the key points in supplied material.",
            "body": "Summarize the material below in one sentence followed by at most five key points. Preserve important numbers and limitations. Mark information not stated in the material; do not add facts.\nMaterial: {{material}}"
        },
        "zh_CN": {
            "title": "摘要",
            "description": "概括所提供材料的重点。",
            "body": "请概括下面的材料，先给一句话结论，再列最多5个关键点。保留重要数字与限制；原文未说明的信息请标注，不要补充事实。\n材料：{{材料}}"
        }
    },
    {
        "id": "rewrite",
        "en": {
            "title": "Polish writing",
            "description": "Make supplied writing clearer.",
            "body": "Polish the text below for clarity, natural wording and brevity. Preserve its meaning, facts, numbers and proper names. Do not add commitments or information not provided. Return only the revised text.\nText: {{text}}"
        },
        "zh_CN": {
            "title": "润色",
            "description": "让提供的文字更清楚自然。",
            "body": "请润色下面的文字，使表达清楚、自然、简洁。保留原意、事实、数字和专有名词；不要增加承诺或未提供的信息。直接返回修改后的文本。\n原文：{{原文}}"
        }
    },
    {
        "id": "actions",
        "en": {
            "title": "Extract action items",
            "description": "Identify explicit tasks, owners and dates.",
            "body": "Extract explicit action items from the notes below. List each task, owner and deadline. Write “Not stated” for unspecified owners or deadlines. List open questions separately; do not turn guesses into commitments or add facts.\nNotes: {{notes}}"
        },
        "zh_CN": {
            "title": "提取待办",
            "description": "整理明确的任务、负责人和期限。",
            "body": "请从下面的记录提取明确的待办事项，逐项列出任务、负责人、期限。未明确的负责人或期限写“未说明”；把待确认的问题单独列出，不要把猜测当作承诺或增加事实。\n记录：{{记录}}"
        }
    },
    {
        "id": "compare",
        "en": {
            "title": "Compare options",
            "description": "Compare two supplied options against criteria.",
            "body": "Compare the two options using the supplied criteria. List similarities, differences, strengths and limitations. Use only the information provided. Mark gaps as “Insufficient information”; do not invent scores or conclusions.\nCriteria: {{criteria}}\nOption A: {{optionA}}\nOption B: {{optionB}}"
        },
        "zh_CN": {
            "title": "对比选项",
            "description": "按给定标准比较两个选项。",
            "body": "请根据给定标准比较两个选项，列出相同点、差异、各自优势与限制。只依据提供的信息；资料不足处写“信息不足”，不要编造评分或结论。\n比较标准：{{比较标准}}\n选项 A：{{选项A}}\n选项 B：{{选项B}}"
        }
    }
];
    function list(language = 'en') {
        const locale = /^zh(?:[-_]CN)?$/i.test(language) ? 'zh_CN' : 'en';
        return templates.map(item => ({ id: item.id, ...item[locale] }));
    }
    function get(id, language) { return typeof id === 'string' ? list(language).find(item => item.id === id) || null : null; }
    return Object.freeze({ list, get });
});
