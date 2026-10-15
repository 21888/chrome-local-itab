# Built-in navigation library

The new-tab shortcut header has a **Discover sites / 发现网站** button. Browse by category, search names or uses, then choose an existing personal category and add a site. No preset site is added automatically, and closing the library never saves a selection.

## What is included

The catalog includes 146 unique sites and 218 bilingual use tags. The versioned, offline catalog covers AI, development, design, productivity, learning, search, news, video/music, social, shopping, travel, everyday life, finance data, careers, marketing, utilities, games, and public services. A site can have multiple category/use tags. Advanced filters combine use, company/operator location, organization, and pricing. The catalog is an editorial selection, not a traffic or popularity ranking.

Cards use local text marks, descriptions and a few tags. They do not fetch favicons. Official site and evidence links open only when clicked, in a new tab with `noopener noreferrer`. The source panel records evidence links and the review date. The existing source date is labeled Source reviewed / 来源查阅日期. The review date means source review, not a live guarantee of every feature or region's availability. The existing footer explains that Unknown means information has not been sufficiently confirmed and that the date does not guarantee current pricing or availability. Missing facts remain `unknown`.

Pricing describes the linked consumer/service entry, not API prices or unlimited use. `free` means a free entry is documented; `freemium` means free and paid plans; `paid` means payment is needed for the described service; `not_applicable` covers shopping or public portals where a subscription label does not describe the entry. Check the official source for current terms. Operator location is not the product's nationality, access-country list, or hosting location.

## Saved-state filters / 添加状态筛选

Use **All / Not added / Added** (**全部 / 未添加 / 已添加**) to find new sites or review the library sites already in your current workspace. Each count reflects the current search, category and advanced filters before the saved-state choice. Saved status uses the same canonical URL match as adding a site, across all personal categories in this workspace; renaming a shortcut or selecting another destination does not change that status. Other workspaces are not included. Clear filters resets this choice too.

After a successful addition in **Not added**, that card disappears and the counts update while the success message stays visible. Keyboard focus moves to the next card (or the previous card at the end); if no results remain, focus moves to the empty-result message. Closing and reopening reads the current workspace again and resets filters. Use **Refresh saved state** to explicitly read current saved locations and categories while retaining browsing state. If another page has invalidated layout state, refresh is read-only: reload the entire page before adding sites or adjusting layout. Refresh does not release an uncertain-save lock.

使用「全部 / 未添加 / 已添加」查找新网站或查看当前工作空间中已经添加的网站。数量会结合搜索、分类、用途等筛选；添加状态依据当前工作空间全部个人分类中的网址判断，与快捷方式名称、所选添加分类无关，也不包含其他工作空间。点击「清除筛选」会一并重置添加状态。

在「未添加」中成功添加后，卡片移出列表、数量同步更新，顶部保留成功提示；键盘焦点移到邻近卡片，没有结果时移到空结果提示。关闭后重新打开会读取最新数据并重置筛选。也可点击「刷新保存状态」明确读取新的保存位置和分类并保留浏览状态；其他页面变更使布局状态失效时，刷新仅供查看，添加网站或调整布局前必须重新加载整个页面。刷新不会解除不确定保存锁。

## Privacy and saving

Browsing, searching and filtering are offline. There are no analytics, new permissions, remote catalog downloads or remotely executed code. Adding a link uses existing Sync and online-icon settings, displayed in the library, and rechecks both before saving.

The save transaction preserves existing link objects and categories. It deduplicates canonical HTTP(S) URLs across the current workspace, checks the preview against current shortcuts/categories/layout/privacy, retains existing identity coordinates, and verifies the written result. Concurrent changes retain the existing write protections: explicit refresh may update read-only browsing state, but an invalidated layout requires a full page reload before adding. An uncertain-save lock cannot be released by refresh. An unconfirmed result is never presented as a successful addition and is not blindly retried.

## Maintaining the catalog

Edit `shared/navigation-sites.js`; do not populate personal shortcuts or change defaults. Each record has a stable id, official HTTPS URL, name, local text icon, bilingual description, category IDs, use tags, company/operator and country (or `unknown`), pricing and explanatory note, evidence URLs, and `verifiedOn`. Use official evidence for volatile metadata; absence of a price on a landing page is not proof that a service is free.

Run the full Node and Python tests and build/verify the offline runtime package after changes. Browser checks should cover light/dark, narrow screens, keyboard focus, searching, combined filters and reset, empty results, existing links, selecting a personal category, repeated clicks, saving failures, workspace changes, closing during reads and pending-save dismissal protection.

## Search spelling / 搜索写法

Search is local and case-insensitive, accepts full-width Latin text, and requires every space-separated query term. Brand names also match when spaces or ASCII hyphens are omitted or inserted: `googlefonts`, `chat-gpt`, `Git Hub`, and `JSON Crack` work. Descriptions and separate fields are not joined into compact words; this is not fuzzy or typo-correcting search. Category, use, country, organization and pricing selections remain exact. Display names, links and saved data do not change.

搜索始终在本地进行，兼容大小写及全角英文字母；多个词仍须全部命中。品牌名可忽略空格及英文连字符，例如 `googlefonts`、`chat-gpt`、`Git Hub`、`JSON Crack`。不会将描述或不同字段拼接为词，也不会进行错字猜测。分类、用途、地区、组织及价格筛选仍精确匹配；显示名称、网址及已保存数据保持不变。

The original two explicit Chinese search aliases are Google → 谷歌 and Bing → 必应. They apply only to those two catalog entries, not inferred operators, subsidiaries or other products. Official naming evidence reviewed 2026-10-12: [About Google in Chinese](https://about.google/?hl=zh-cn) and [Microsoft Bing help in Chinese](https://support.microsoft.com/zh-cn/bing/microsoft-bing-help). Optional `searchAliases` values contain at most eight nonblank strings of at most 80 characters each, without control characters. Aliases are search-only and do not replace visible brand names.

两项明确中文搜索别名为 Google → 谷歌、Bing → 必应，仅对应这两项网站，不延伸推断运营主体或其他产品。别名仅用于搜索，不替换显示品牌。


Five additional search-only aliases were reviewed against official sources on 2026-10-12:

- Amazon → 亚马逊: [Amazon Global Selling article naming amazon.com](https://gs.amazon.cn/zhishi/article-251103-5).
- LinkedIn Jobs → 领英: [LinkedIn Chinese homepage](https://www.linkedin.com/?_l=zh), an organization-name alias for this existing jobs entry.
- Khan Academy → 可汗学院: [Khan Academy Chinese homepage](https://www.khanacademy.org/?lang=zh).
- Google Scholar → Google 学术搜索: [Google Scholar Chinese homepage](https://scholar.google.com/?hl=zh-CN). This does not add 谷歌学术.
- IMF Data → 国际货币基金组织: [IMF Chinese factsheet](https://www.imf.org/zh/about/factsheets/imf-at-a-glance) and [Chinese homepage](https://www.imf.org/zh/home), an organization-name alias, not a newly named data product.

These evidence URLs are recorded in each entry's source panel. All 120 existing entries retain their display names, destinations, categories, descriptions, operator/country and pricing metadata. Chinese queries do not redirect to regional editions. Canva 可画 and Qwen 千问 are not inferred aliases for the different destinations already in this catalog.

本次新增亚马逊、领英、可汗学院、Google 学术搜索、国际货币基金组织五项经官方来源核验的搜索别名（2026-10-12）。领英与国际货币基金组织是现有条目的组织名称别名。来源列入各条目的资料面板；不改变显示名称、网址、运营地区或价格，也不会切换中国版。未将可画、千问或「谷歌学术」推断加入别名。

## Click a purpose to discover related sites

The first two purpose labels on each card, and every purpose under **Sources & details**, are quiet filter buttons. Click one to apply the same exact **Use** filter as the advanced dropdown. The dropdown and removable active-filter chip stay in sync. Search, category, other filters, destination (including a draft new-category name), and selected sites stay in place. All criteria still combine with AND; remove the active Use chip to clear just that purpose.

Filtering does not open a site or save anything. The clicked purpose keeps keyboard focus after results refresh; open details stay open for that site within the dialog. Purpose buttons are disabled during a pending save. **Official site** and source links remain the separate external-link actions.

卡片前两个用途及「来源与详情」中的完整用途现在都可点击，用来筛选相同用途的网站。它与高级筛选中的「用途」下拉框、可移除的当前筛选标签同步。搜索词、分类、其他筛选、添加目标（包括新分类名称草稿）及已勾选网站保持不变；所有条件仍须同时满足，点击当前用途筛选标签即可单独清除用途。操作仅在本地筛选，不打开网站或写入数据。刷新结果后保留对应用途按钮的键盘焦点和网站详情展开状态，保存处理中禁用用途按钮。

## Focus search with / / 按 / 聚焦搜索

While browsing inside the library, press `/` from a non-editing control or card to focus the search field and select its existing query. This moves focus only: it does not rerun the search, reset filters, selections or an unfinished category name, or read/write saved data. The visible hint is linked to the search input for assistive technology. `/` continues to type normally in inputs, selects and editable content; Ctrl/Command/Alt shortcuts, held keys and IME composition are left alone. A keyboard layout that uses Shift to produce `/` is supported.

The shortcut stays inside the currently open library. It pauses during review, loading, saving, blocked/conflicting state, pending shortcut/layout changes, departure, or another visible dialog/menu. Closing removes its listener; reopening starts with fresh ownership. It does not change the page-level saved-site Finder shortcut.

在导航库内浏览时，从非编辑控件或卡片按 `/`，会聚焦搜索框并选中现有搜索词。仅移动焦点，不重新搜索、不清除筛选、所选网站或未完成的分类名称，也不读写已保存数据。搜索框关联中英文可见提示。输入框、下拉选择和可编辑内容中仍可正常输入 `/`；组合键、长按及输入法组词时不触发。支持用 Shift 输入 `/` 的键盘布局。

快捷键只在当前打开的导航库中生效；复核、读取、保存、冲突阻止、待完成的快捷方式或布局修改、离开页面、其他可见对话框或菜单出现时暂停。关闭会移除监听，重新打开使用新的会话。页面级「查找已保存网站」的快捷键保持原样。

## Inspect selected sites

**Show selected only** in the batch bar narrows the full cards to your current selections. It combines with search, category, purpose, advanced and saved-state filters; **Hidden by filters** counts selected sites outside those results. **Review selected** always reviews the entire selection, including hidden sites. This browsing view needs no destination category and does not write or open websites.

**Clear filters** turns off this view while retaining selections. **Clear selection** leaves the view active and empty so you can turn it off explicitly. Deselecting a disappearing card moves keyboard focus to an adjacent checkbox, or the view toggle after the last card. Closing the dialog resets both selections and this view.

批选栏的「只看已选」保留完整网站卡片，并与搜索、分类、用途、更多筛选和已添加状态取交集。「被筛选隐藏」显示当前结果外的已选数量；「检查所选」仍检查全部已选网站。清除筛选会关闭只看已选、保留所选；清空所选则保留当前空视图，可随时关闭。浏览不要求先选择目标分类，不会写入或打开网站。

### Compatible use filters across categories

Switching categories, choosing All categories, or choosing the current category
keeps the selected use when that use exists in the destination category's full
catalog. An incompatible use is cleared without restoring it on a later category
change. The use dropdown, active filter chip and card buttons stay in sync. Other
filters still combine with AND, so a compatible use can remain selected with zero
results. Search, saved/selected-only views, selected sites, destination and a new
category name draft remain unchanged. Browsing does not save or open anything.

切换分类时，若目标分类的完整目录仍包含当前用途，则保留用途筛选；选择「全部分类」
或再次选择当前分类也会保留。不兼容的用途才会清空，之后返回原分类不会自动恢复。
用途下拉框、当前筛选标签及卡片用途按钮保持一致。其他条件仍须同时满足，因此零结果
不会让兼容用途被清空。搜索、已添加/仅看所选、勾选网站、添加目标和新分类名称草稿
均保持不变；浏览不会保存数据或打开网站。

### Compatible-use development verification

The final implementation passed2781/2781 strict Node tests with1 GiB heap,
81/81 Python,136 focused tests and113-file packaging. Independent review checked
84 real-catalog transitions across English/Chinese and the stale-dropdown guard.
The view rejects retired category/select controls rather than allowing a
prior opening to restore a cleared filter. Limited Chinese-light native Photopea/PSD editing checks passed compatible
Design/Utilities/All/current-category retention and incompatible Learning reset,
with query/target preserved and100%/200% keyboard representatives. No full
filter matrix or native stale-control race claim; manifest remains1.1.112 without a release.
