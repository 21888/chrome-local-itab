# Built-in navigation library

The new-tab shortcut header has a **Discover sites / 发现网站** button. Browse by category, search names or uses, then choose an existing personal category and add a site. No preset site is added automatically, and closing the library never saves a selection.

## What is included

The catalog includes 108 unique sites and 154 bilingual use tags. The versioned, offline catalog covers AI, development, design, productivity, learning, search, news, video/music, social, shopping, travel, everyday life, finance data, careers, marketing, utilities, games, and public services. A site can have multiple category/use tags. Advanced filters combine use, company/operator location, organization, and pricing. The catalog is an editorial selection, not a traffic or popularity ranking.

Cards use local text marks, descriptions and a few tags. They do not fetch favicons. Official site and evidence links open only when clicked, in a new tab with `noopener noreferrer`. The source panel records evidence links and the review date. The review date means source review, not a live guarantee of every feature or region's availability. Missing facts remain `unknown`.

Pricing describes the linked consumer/service entry, not API prices or unlimited use. `free` means a free entry is documented; `freemium` means free and paid plans; `paid` means payment is needed for the described service; `not_applicable` covers shopping or public portals where a subscription label does not describe the entry. Check the official source for current terms. Operator location is not the product's nationality, access-country list, or hosting location.

## Saved-state filters / 添加状态筛选

Use **All / Not added / Added** (**全部 / 未添加 / 已添加**) to find new sites or review the library sites already in your current workspace. Each count reflects the current search, category and advanced filters before the saved-state choice. Saved status uses the same canonical URL match as adding a site, across all personal categories in this workspace; renaming a shortcut or selecting another destination does not change that status. Other workspaces are not included. Clear filters resets this choice too.

After a successful addition in **Not added**, that card disappears and the counts update while the success message stays visible. Keyboard focus moves to the next card (or the previous card at the end); if no results remain, focus moves to the empty-result message. Closing and reopening reads the current workspace again and resets filters. Concurrent saved-data changes still require reopening under the existing conflict protections.

使用「全部 / 未添加 / 已添加」查找新网站或查看当前工作空间中已经添加的网站。数量会结合搜索、分类、用途等筛选；添加状态依据当前工作空间全部个人分类中的网址判断，与快捷方式名称、所选添加分类无关，也不包含其他工作空间。点击「清除筛选」会一并重置添加状态。

在「未添加」中成功添加后，卡片移出列表、数量同步更新，顶部保留成功提示；键盘焦点移到邻近卡片，没有结果时移到空结果提示。关闭后重新打开会读取最新数据并重置筛选；遇到并发修改仍需重新打开确认。

## Privacy and saving

Browsing, searching and filtering are offline. There are no analytics, new permissions, remote catalog downloads or remotely executed code. Adding a link uses existing Sync and online-icon settings, displayed in the library, and rechecks both before saving.

The save transaction preserves existing link objects and categories. It deduplicates canonical HTTP(S) URLs across the current workspace, checks the preview against current shortcuts/categories/layout/privacy, retains existing identity coordinates, and verifies the written result. Concurrent changes require reopening. An unconfirmed result is never presented as a successful addition and is not blindly retried.

## Maintaining the catalog

Edit `shared/navigation-sites.js`; do not populate personal shortcuts or change defaults. Each record has a stable id, official HTTPS URL, name, local text icon, bilingual description, category IDs, use tags, company/operator and country (or `unknown`), pricing and explanatory note, evidence URLs, and `verifiedOn`. Use official evidence for volatile metadata; absence of a price on a landing page is not proof that a service is free.

Run the full Node and Python tests and build/verify the offline runtime package after changes. Browser checks should cover light/dark, narrow screens, keyboard focus, searching, combined filters and reset, empty results, existing links, selecting a personal category, repeated clicks, saving failures, workspace changes, closing during reads and pending-save dismissal protection.

## Search spelling / 搜索写法

Search is local and case-insensitive, accepts full-width Latin text, and requires every space-separated query term. Brand names also match when spaces or ASCII hyphens are omitted or inserted: `googlefonts`, `chat-gpt`, `Git Hub`, and `JSON Crack` work. Descriptions and separate fields are not joined into compact words; this is not fuzzy or typo-correcting search. Category, use, country, organization and pricing selections remain exact. Display names, links and saved data do not change.

搜索始终在本地进行，兼容大小写及全角英文字母；多个词仍须全部命中。品牌名可忽略空格及英文连字符，例如 `googlefonts`、`chat-gpt`、`Git Hub`、`JSON Crack`。不会将描述或不同字段拼接为词，也不会进行错字猜测。分类、用途、地区、组织及价格筛选仍精确匹配；显示名称、网址及已保存数据保持不变。

The two explicit Chinese search aliases are Google → 谷歌 and Bing → 必应. They apply only to those two catalog entries, not inferred operators, subsidiaries or other products. Official naming evidence reviewed 2026-10-12: [About Google in Chinese](https://about.google/?hl=zh-cn) and [Microsoft Bing help in Chinese](https://support.microsoft.com/zh-cn/bing/microsoft-bing-help). Optional `searchAliases` values contain at most eight nonblank strings of at most 80 characters each, without control characters. Aliases are search-only and do not replace visible brand names.

两项明确中文搜索别名为 Google → 谷歌、Bing → 必应，仅对应这两项网站，不延伸推断运营主体或其他产品。别名仅用于搜索，不替换显示品牌。
