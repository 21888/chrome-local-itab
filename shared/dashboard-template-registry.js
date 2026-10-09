/* Local-only template registry. Visual selection never applies workspace recommendations. */
(function (global) {
'use strict';
const all = [
  {
    "id": "clarity",
    "labelKey": "templateClarity",
    "name": {
      "en": "Clarity",
      "zh": "清晰"
    },
    "description": {
      "en": "A clear place for the sites you use every day.",
      "zh": "为常用的网站，留一个清晰的位置。"
    },
    "heading": {
      "en": "Start here. Make today yours.",
      "zh": "从这里，开始今天。"
    },
    "composition": "sidebar",
    "collections": false,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts"
    ]
  },
  {
    "id": "graphite",
    "labelKey": "templateGraphite",
    "name": {
      "en": "Graphite",
      "zh": "石墨"
    },
    "description": {
      "en": "Less distraction. More focus.",
      "zh": "少一点干扰，多一点专注。"
    },
    "heading": {
      "en": "Open your workspace.",
      "zh": "打开你的工作空间"
    },
    "composition": "sidebar",
    "collections": true,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts"
    ]
  },
  {
    "id": "folio",
    "labelKey": "templateFolio",
    "name": {
      "en": "Folio",
      "zh": "书页"
    },
    "description": {
      "en": "Work, reading and inspiration, each in its place.",
      "zh": "工作、阅读与灵感，各得其所。"
    },
    "heading": {
      "en": "Your everyday, thoughtfully collected.",
      "zh": "你的日常，井然成集。"
    },
    "composition": "top",
    "collections": true,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts"
    ]
  },
  {
    "id": "atelier",
    "labelKey": "templateAtelier",
    "name": {
      "en": "Atelier",
      "zh": "编排"
    },
    "description": {
      "en": "An editorial masthead, fine rules and confident typography.",
      "zh": "杂志式页眉、纤细分隔线与鲜明的字体层级。"
    },
    "heading": {
      "en": "A fresh perspective.",
      "zh": "换个视角，重新出发。"
    },
    "composition": "top",
    "collections": false,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts"
    ]
  },
  {
    "id": "quiet",
    "labelKey": "templateQuiet",
    "name": {
      "en": "Quiet",
      "zh": "留白"
    },
    "description": {
      "en": "A centered, pared-back canvas with soft rectangular tiles.",
      "zh": "居中留白画布，搭配柔和的矩形卡片。"
    },
    "heading": {
      "en": "Room to think.",
      "zh": "给思绪一点空间。"
    },
    "composition": "center",
    "collections": false,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts"
    ]
  },
  {
    "id": "studio",
    "labelKey": "templateStudio",
    "name": {
      "en": "Studio",
      "zh": "工作室"
    },
    "description": {
      "en": "A framed navigation rail and tactile, offset tile edges.",
      "zh": "边框导航栏与清晰有层次的卡片边缘。"
    },
    "heading": {
      "en": "Make space for good work.",
      "zh": "为好作品留出空间。"
    },
    "composition": "sidebar",
    "collections": false,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts",
      "tasks"
    ]
  },
  {
    "id": "console",
    "labelKey": "templateConsole",
    "name": {
      "en": "Console",
      "zh": "终端"
    },
    "description": {
      "en": "Monospaced labels and compact grouped command rows.",
      "zh": "等宽文字与紧凑的分组入口。"
    },
    "heading": {
      "en": "Ready when you are.",
      "zh": "随时准备，立即开始。"
    },
    "composition": "sidebar",
    "collections": true,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts",
      "tasks"
    ]
  },
  {
    "id": "prism",
    "labelKey": "templatePrism",
    "name": {
      "en": "Prism",
      "zh": "棱镜"
    },
    "description": {
      "en": "Geometric accents, generous corners and bold tile outlines.",
      "zh": "几何点缀、大圆角与醒目的卡片轮廓。"
    },
    "heading": {
      "en": "A little more possibility.",
      "zh": "让日常多一点可能。"
    },
    "composition": "top",
    "collections": false,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts"
    ]
  },
  {
    "id": "library",
    "labelKey": "templateLibrary",
    "name": {
      "en": "Library",
      "zh": "书架"
    },
    "description": {
      "en": "A reading index with serif titles and ruled link collections.",
      "zh": "衬线标题与有序分隔的链接索引。"
    },
    "heading": {
      "en": "Keep what matters close.",
      "zh": "把重要的内容放在手边。"
    },
    "composition": "top",
    "collections": true,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts",
      "quote"
    ]
  },
  {
    "id": "horizon",
    "labelKey": "templateHorizon",
    "name": {
      "en": "Horizon",
      "zh": "地平线"
    },
    "description": {
      "en": "A wide clock-led header and understated horizontal links.",
      "zh": "以时钟为焦点的开阔页眉与简洁横向入口。"
    },
    "heading": {
      "en": "A clear view ahead.",
      "zh": "眼前开阔，下一步清晰。"
    },
    "composition": "center",
    "collections": false,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts"
    ]
  },
  {
    "id": "ledger",
    "labelKey": "templateLedger",
    "name": {
      "en": "Ledger",
      "zh": "条理"
    },
    "description": {
      "en": "A compact working index with strong alignment and counters.",
      "zh": "紧凑的工作索引，强调对齐与分类计数。"
    },
    "heading": {
      "en": "Everything in order.",
      "zh": "让一切井然有序。"
    },
    "composition": "sidebar",
    "collections": true,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts",
      "tasks"
    ]
  },
  {
    "id": "meadow",
    "labelKey": "templateMeadow",
    "name": {
      "en": "Meadow",
      "zh": "草间"
    },
    "description": {
      "en": "An airy centered start page with rounded, pebble-like tiles.",
      "zh": "轻盈居中的起始页与卵石般圆润的卡片。"
    },
    "heading": {
      "en": "Take it one thing at a time.",
      "zh": "从容做好眼前的一件事。"
    },
    "composition": "center",
    "collections": false,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts",
      "quote"
    ]
  },
  {
    "id": "blueprint",
    "labelKey": "templateBlueprint",
    "name": {
      "en": "Blueprint",
      "zh": "蓝图"
    },
    "description": {
      "en": "A precise technical grid, square controls and subtle guide lines.",
      "zh": "精准网格、方正控件与轻微的辅助线。"
    },
    "heading": {
      "en": "Build your next idea.",
      "zh": "搭建下一个想法。"
    },
    "composition": "top",
    "collections": false,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts"
    ]
  },
  {
    "id": "terrace",
    "labelKey": "templateTerrace",
    "name": {
      "en": "Terrace",
      "zh": "层台"
    },
    "description": {
      "en": "Grouped launch panels with alternating header accents.",
      "zh": "分组入口面板与错落有致的标题装饰。"
    },
    "heading": {
      "en": "Your day, well arranged.",
      "zh": "把今天安排得恰到好处。"
    },
    "composition": "sidebar",
    "collections": true,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts",
      "tasks"
    ]
  },
  {
    "id": "column",
    "labelKey": "templateColumn",
    "name": {
      "en": "Column",
      "zh": "专栏"
    },
    "description": {
      "en": "A narrow editorial rail beside a spacious reference index.",
      "zh": "窄幅编辑式侧栏与宽敞的资料索引。"
    },
    "heading": {
      "en": "A place for every thought.",
      "zh": "给每个想法一个位置。"
    },
    "composition": "split",
    "collections": true,
    "recommendedModules": [
      "clock",
      "search",
      "shortcuts",
      "quote"
    ]
  }
];
// Recommendations affect visibility only, and require a separate reviewed action.
const workspaces = {
 clarity: [false, false], graphite: [false, true], folio: [true, false],
 atelier: [false, true], quiet: [false, true], studio: [true, true],
 console: [true, true], prism: [false, false], library: [false, true],
 horizon: [false, false], ledger: [true, false], meadow: [false, true],
 blueprint: [true, true], terrace: [true, false], column: [true, false]
};
for (const entry of all) {
 const [tasks, focus] = workspaces[entry.id];
 entry.recommendedWorkspace = Object.freeze({ tasks, focus });
}
for (const entry of all) { Object.freeze(entry.name); Object.freeze(entry.description); Object.freeze(entry.heading); Object.freeze(entry.recommendedModules); Object.freeze(entry); }
Object.freeze(all);
const ids = Object.freeze(all.map(entry => entry.id));
const get = id => all.find(entry => entry.id === id) || all[0];
const localize = (id, locale = global.chrome?.i18n?.getUILanguage?.() || global.document?.documentElement?.lang || 'en') => {
 const entry = get(id), language = /^zh(?:-|$)/i.test(locale) ? 'zh' : 'en';
 return {name: entry.name[language], description: entry.description[language], heading: entry.heading[language]};
};
const api = Object.freeze({all, ids, get, isValid: id => ids.includes(id), usesCollections: id => get(id).collections, localize});
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else global.LocalItabTemplates = api;
})(typeof window !== 'undefined' ? window : globalThis);
