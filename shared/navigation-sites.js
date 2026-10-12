// Offline, reviewed catalog. Updated with extension releases; no runtime fetch.
(function (root) {
    'use strict';
    const sites = [
    {
        "id": "chatgpt",
        "name": "ChatGPT",
        "url": "https://chatgpt.com/",
        "company": "OpenAI",
        "country": "US",
        "tags": [
            "chat",
            "search",
            "writing",
            "coding",
            "image"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "A usage-limited free plan is available. Paid subscriptions expand limits and features; API usage is billed separately.",
            "zh": "提供有使用限制的免费版；付费订阅提高额度和功能，API 另计。"
        },
        "sources": [
            "https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus",
            "https://openai.com/policies/terms-of-use/"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "A general AI assistant for questions, research and creation.",
            "zh": "通用 AI 助手，支持问答、研究与创作。"
        },
        "icon": "CG"
    },
    {
        "id": "claude",
        "name": "Claude",
        "url": "https://claude.ai/",
        "company": "Anthropic",
        "country": "US",
        "tags": [
            "chat",
            "writing",
            "coding",
            "research"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Free has usage limits. Pro, Max and team plans are paid subscriptions.",
            "zh": "Free 有使用限制；Pro、Max 及团队方案为付费订阅。"
        },
        "sources": [
            "https://support.claude.com/en/articles/11049762-choose-a-claude-plan",
            "https://www.anthropic.com/transparency/voluntary-commitments/security%26privacy"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "An AI assistant for writing, analysis and coding.",
            "zh": "用于写作、分析与编程的 AI 助手。"
        },
        "icon": "Cl"
    },
    {
        "id": "grok",
        "name": "Grok",
        "url": "https://grok.com/",
        "company": "SpaceXAI LLC",
        "country": "US",
        "tags": [
            "chat",
            "search",
            "image",
            "video",
            "audio"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "A limited free plan is available. SuperGrok and other subscriptions expand limits and features.",
            "zh": "提供有限额免费版；SuperGrok 等订阅提高额度和功能。"
        },
        "sources": [
            "https://x.ai/pricing",
            "https://x.ai/legal/terms-of-service"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "An AI assistant with web search and creative tools.",
            "zh": "具备联网搜索与创作工具的 AI 助手。"
        },
        "icon": "Gr"
    },
    {
        "id": "deepseek",
        "name": "DeepSeek",
        "url": "https://chat.deepseek.com/",
        "company": "杭州深度求索",
        "country": "CN",
        "tags": [
            "chat",
            "coding",
            "writing",
            "reasoning"
        ],
        "pricing": "free",
        "pricingNote": {
            "en": "The official chat assistant is free to use. This classification covers the chat entry only, not the separately billed API.",
            "zh": "官方聊天助手可免费使用；此分类仅指聊天入口，不包含单独计费 API。"
        },
        "sources": [
            "https://www.deepseek.com/en/download/",
            "https://cdn.deepseek.com/policies/zh-CN/deepseek-privacy-policy.html"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "An AI assistant for reasoning, writing and coding.",
            "zh": "用于推理、写作与编程的 AI 助手。"
        },
        "icon": "DS"
    },
    {
        "id": "gemini",
        "name": "Gemini",
        "url": "https://gemini.google.com/",
        "company": "Google",
        "country": "US",
        "tags": [
            "chat",
            "search",
            "image",
            "writing",
            "research"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "A free plan is available. Paid Google AI subscriptions expand limits and features; offerings vary by region and plan.",
            "zh": "有免费版；Google AI 付费订阅提高使用额度和功能，因地区及方案而异。"
        },
        "sources": [
            "https://gemini.google/subscriptions/",
            "https://about.google/company-info/locations/"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Google's AI assistant for questions and creative work.",
            "zh": "Google 的问答与创作 AI 助手。"
        },
        "icon": "Ge"
    },
    {
        "id": "perplexity",
        "name": "Perplexity",
        "url": "https://www.perplexity.ai/",
        "company": "Perplexity AI, Inc.",
        "country": "US",
        "tags": [
            "search",
            "research",
            "chat"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Standard is free. Pro, Max and other subscriptions provide higher limits and advanced features.",
            "zh": "Standard 免费；Pro、Max 等订阅提供更高额度和高级功能。"
        },
        "sources": [
            "https://www.perplexity.ai/help-center/en/articles/11187416-which-perplexity-subscription-plan-is-right-for-you",
            "https://www.perplexity.ai/fr/hub/legal/terms-of-service"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Search the web and explore answers with sources.",
            "zh": "搜索网络并阅读附带来源的答案。"
        },
        "icon": "Pe"
    },
    {
        "id": "microsoft-copilot",
        "name": "Microsoft Copilot",
        "url": "https://copilot.microsoft.com/",
        "company": "Microsoft",
        "country": "US",
        "tags": [
            "chat",
            "search",
            "writing",
            "image"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "A limited free version is available. Paid individual plans expand limits and features.",
            "zh": "提供有限免费版；付费个人方案增加额度及功能。"
        },
        "sources": [
            "https://www.microsoft.com/en-us/copilot/pricing/individuals",
            "https://news.microsoft.com/facts-about-microsoft/"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Microsoft's assistant for everyday questions and creation.",
            "zh": "Microsoft 的日常问答与创作助手。"
        },
        "icon": "Co"
    },
    {
        "id": "mistral-vibe",
        "name": "Mistral Vibe（Le Chat）",
        "url": "https://chat.mistral.ai/",
        "company": "Mistral AI",
        "country": "FR",
        "tags": [
            "chat",
            "search",
            "coding",
            "image"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Free includes limited messages, searches and coding. Pro and other subscriptions increase usage limits.",
            "zh": "Free 提供有限消息、搜索及编程；Pro 等订阅提升使用额度。"
        },
        "sources": [
            "https://mistral.ai/pricing/",
            "https://legal.mistral.ai/terms/privacy-policy/",
            "https://mistral.ai/products/vibe/",
            "https://help.mistral.ai/en/articles/682992-le-chat-is-now-vibe"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Mistral's assistant for chat, search and coding.",
            "zh": "Mistral 的对话、搜索与编程助手。"
        },
        "icon": "Mi"
    },
    {
        "id": "cursor",
        "name": "Cursor",
        "url": "https://cursor.com/",
        "company": "Anysphere",
        "country": "US",
        "tags": [
            "coding"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Hobby is free with limited Agent requests. Paid subscriptions increase limits; additional usage may be billed separately.",
            "zh": "Hobby 免费且 Agent 请求有限；付费订阅提高额度，可另付按量使用费用。"
        },
        "sources": [
            "https://cursor.com/pricing",
            "https://cursor.com/terms-of-service"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "AI code editor and coding agents.",
            "zh": "AI 代码编辑器与编程助手。"
        },
        "icon": "Cu"
    },
    {
        "id": "github-copilot",
        "name": "GitHub Copilot",
        "url": "https://github.com/features/copilot/",
        "company": "GitHub / Microsoft",
        "country": "US",
        "tags": [
            "coding"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "A Free plan has feature and usage limits. Paid individual and organizational plans expand capabilities.",
            "zh": "有功能和额度受限的 Free 方案；个人及企业付费方案扩展能力。"
        },
        "sources": [
            "https://github.com/features/copilot/plans",
            "https://github.com/partners/technology-partners-terms.html"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Code completion, coding chat and agents.",
            "zh": "代码补全、编程对话与代码任务助手。"
        },
        "icon": "GH"
    },
    {
        "id": "replit",
        "name": "Replit",
        "url": "https://replit.com/",
        "company": "Replit",
        "country": "US",
        "tags": [
            "coding",
            "app-building"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Starter includes daily Agent credits subject to a monthly cap, plus monthly cloud credits. Paid plans expand access and limits.",
            "zh": "Starter 提供每日 Agent 额度并设每月上限，另有月度云资源额度；付费方案增加额度和功能。"
        },
        "sources": [
            "https://replit.com/site/pricing",
            "https://replit.com/news/replit-opens-london-office",
            "https://docs.replit.com/billing/plans/starter-plan"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Build and publish applications with AI.",
            "zh": "使用 AI 构建和发布应用。"
        },
        "icon": "Re"
    },
    {
        "id": "midjourney",
        "name": "Midjourney",
        "url": "https://www.midjourney.com/",
        "company": "Midjourney, Inc.",
        "country": "US",
        "tags": [
            "image",
            "video"
        ],
        "pricing": "paid",
        "pricingNote": {
            "en": "Creation on the website and Discord requires a paid subscription; neither currently offers a free trial. The separate niji app trial is excluded.",
            "zh": "网页及 Discord 创作需要付费订阅，当前无免费试用；不包含独立 niji 应用试用。"
        },
        "sources": [
            "https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans",
            "https://docs.midjourney.com/hc/en-us/articles/27870399340173-Free-Trials",
            "https://docs.midjourney.com/hc/en-us/articles/32083055291277-Terms-of-Service"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Generate images and creative video.",
            "zh": "生成图像与创意视频。"
        },
        "icon": "MJ"
    },
    {
        "id": "adobe-firefly",
        "name": "Adobe Firefly",
        "url": "https://firefly.adobe.com/",
        "company": "Adobe",
        "country": "US",
        "tags": [
            "image",
            "video",
            "audio",
            "design"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Free accounts have limited daily generations and model access. Paid Adobe plans provide more capacity and features.",
            "zh": "免费账户有有限每日生成次数和模型；付费 Adobe 方案提供更多额度和功能。"
        },
        "sources": [
            "https://helpx.adobe.com/creative-cloud/apps/generative-ai/generative-credits-faq.html",
            "https://blog.adobe.com/en/publish/2026/08/03/honoring-adobe-california-story-investing-in-future"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Generate and edit visual and audio assets.",
            "zh": "生成与编辑图像、视频和音频素材。"
        },
        "icon": "Fi"
    },
    {
        "id": "ideogram",
        "name": "Ideogram",
        "url": "https://ideogram.ai/",
        "company": "Ideogram",
        "country": "CA",
        "tags": [
            "image",
            "design"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Eligible free accounts receive weekly slow credits. Paid subscriptions provide priority credits and additional features.",
            "zh": "符合条件的免费账户有每周慢速额度；付费订阅提供优先额度及更多功能。"
        },
        "sources": [
            "https://ideogram.ai/pricing/",
            "https://about.ideogram.ai/legal/tos"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Create images and typography-led visuals.",
            "zh": "生成图像与含文字的视觉设计。"
        },
        "icon": "Id"
    },
    {
        "id": "leonardo-ai",
        "name": "Leonardo.Ai",
        "url": "https://www.leonardo.ai/",
        "company": "Leonardo Interactive / Canva",
        "country": "AU",
        "tags": [
            "image",
            "video",
            "design"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "A limited free plan is available. Paid individual, team and API plans have separate billing.",
            "zh": "提供有限免费方案；付费个人、团队和 API 方案分别计费。"
        },
        "sources": [
            "https://www.leonardo.ai/pricing",
            "https://www.leonardo.ai/master-services-agreement"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Generate and refine creative images and video.",
            "zh": "生成和优化创意图像与视频。"
        },
        "icon": "Le"
    },
    {
        "id": "runway",
        "name": "Runway",
        "url": "https://runway.com/",
        "company": "Runway AI",
        "country": "US",
        "tags": [
            "video",
            "image",
            "audio"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Free includes a one-time credit allocation that does not refresh. Paid subscriptions add credits and model access.",
            "zh": "Free 仅含一次性生成额度，不会定期刷新；付费订阅增加额度和模型访问。"
        },
        "sources": [
            "https://help.runwayml.com/hc/en-us/articles/50404627334547-Free-plan-details",
            "https://runway.com/pricing",
            "https://www.sec.gov/Archives/edgar/data/1957455/000123191922000071/0001231919-22-000071-index.htm"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Generate and edit video and images.",
            "zh": "生成与编辑视频和图像。"
        },
        "icon": "Ru"
    },
    {
        "id": "luma-dream-machine",
        "name": "Luma Dream Machine",
        "url": "https://dream-machine.lumalabs.ai/",
        "company": "Luma AI",
        "country": "US",
        "tags": [
            "video",
            "image"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Free and paid plans are available. Free features are limited; video model access and commercial rights depend on the plan. API billing is separate.",
            "zh": "有 Free 与付费方案；免费功能有限，视频模型及商用权依方案而异，API 另计。"
        },
        "sources": [
            "https://lumalabs.ai/learning-hub/dream-machine-credit-system",
            "https://lumalabs.ai/learning-hub/licensing",
            "https://lumalabs.ai/legal/terms-of-service"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Create images and videos in Dream Machine.",
            "zh": "通过 Dream Machine 创作图像和视频。"
        },
        "icon": "Lu"
    },
    {
        "id": "pika",
        "name": "Pika",
        "url": "https://pika.art/",
        "company": "Mellis（Pika）",
        "country": "US",
        "tags": [
            "video",
            "image",
            "audio"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "zh": "官方价格页与旧版 FAQ 存在差异。当前价格页 Free 方案不含月度生成额度，生成需购买积分包或订阅；旧版、iOS 和 API 额度独立，请核对官网。",
            "en": "The pricing page and older FAQ differ. The current pricing page lists no monthly generation credits for Free; generation requires credit packs or a subscription. Legacy, iOS and API credits are separate. Check the official page."
        },
        "sources": [
            "https://pika.art/pricing",
            "https://pika.art/terms-of-service"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Generate and transform short creative videos.",
            "zh": "生成与变换创意短视频。"
        },
        "icon": "Pi"
    },
    {
        "id": "elevenlabs",
        "name": "ElevenLabs",
        "url": "https://elevenlabs.io/",
        "company": "Eleven Labs",
        "country": "US",
        "tags": [
            "audio",
            "voice",
            "transcription",
            "music"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "A monthly free credit allowance is available. Paid plans increase credits and provide applicable commercial licenses and features.",
            "zh": "有月度免费额度；付费方案提高额度并提供相应商用许可与功能。"
        },
        "sources": [
            "https://elevenlabs.io/pricing",
            "https://elevenlabs.io/terms-of-use"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Create speech, music and sound, and transcribe audio.",
            "zh": "生成语音、音乐、音效并转写音频。"
        },
        "icon": "El"
    },
    {
        "id": "suno",
        "name": "Suno",
        "url": "https://suno.com/",
        "company": "Suno",
        "country": "US",
        "tags": [
            "music",
            "audio"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Free provides a limited daily credit allowance without commercial rights. Paid plans provide monthly credits and applicable commercial rights.",
            "zh": "Free 每日补充有限额度且无商用权；付费方案提供月度额度和相应商用权。"
        },
        "sources": [
            "https://suno.com/pricing",
            "https://about.suno.com/careers"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Generate songs and instrumental music.",
            "zh": "生成歌曲与器乐音乐。"
        },
        "icon": "Su"
    },
    {
        "id": "descript",
        "name": "Descript",
        "url": "https://www.descript.com/",
        "company": "Descript",
        "country": "US",
        "tags": [
            "audio",
            "video",
            "transcription"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "A Free plan limits media hours and AI usage. Paid subscriptions increase allowances and editing features.",
            "zh": "有免费方案，媒体时长与 AI 使用有限；付费订阅增加额度和编辑功能。"
        },
        "sources": [
            "https://www.descript.com/pricing",
            "https://www.descript.com/terms"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Edit audio and video using transcripts and AI.",
            "zh": "通过转写文字与 AI 编辑音视频。"
        },
        "icon": "De"
    },
    {
        "id": "deepl",
        "name": "DeepL",
        "url": "https://www.deepl.com/translator",
        "company": "DeepL SE",
        "country": "DE",
        "tags": [
            "translation",
            "writing",
            "text-translation",
            "document-translation"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Limited free translation is available. Pro subscriptions expand features; API and other products have separate plans.",
            "zh": "提供有功能限制的免费翻译；Pro 订阅扩展功能，API 与其他产品另有方案。"
        },
        "sources": [
            "https://www.deepl.com/en/translator",
            "https://support.deepl.com/hc/en-us/articles/360019924499-About-DeepL-plans",
            "https://www.deepl.com/en/publisher",
            "https://www.deepl.com/translator"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai",
            "utilities"
        ],
        "description": {
            "en": "Translate text and documents with AI.",
            "zh": "使用 AI 翻译文字与文档。"
        },
        "icon": "DL"
    },
    {
        "id": "kimi",
        "name": "Kimi",
        "url": "https://www.kimi.com/",
        "company": "北京月之暗面科技股份有限公司",
        "country": "CN",
        "tags": [
            "chat",
            "research",
            "writing",
            "coding"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Free access and paid memberships are available. Advanced tasks share a credit pool; consult the current local plan page for terms and benefits.",
            "zh": "有免费方案及付费会员；高级任务共用额度池，套餐和权益以当地官方页面为准。"
        },
        "sources": [
            "https://www.kimi.com/en/help/features/project",
            "https://www.kimi.com/en/help/membership/membership-overview",
            "https://www.kimi.com/user/agreement/modeluse?version=v2"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "Chat, research, write and work with documents.",
            "zh": "用于对话、研究、写作与文档任务。"
        },
        "icon": "Ki"
    },
    {
        "id": "qwen",
        "name": "Qwen",
        "url": "https://qwen.ai/",
        "company": "Alibaba Cloud (Singapore)",
        "country": "SG",
        "tags": [
            "chat",
            "research",
            "coding",
            "image"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "zh": "官方介绍称可免费使用；实时套餐细节未独立核验，以产品当前页面为准。此标签不包含 API 或云服务。",
            "en": "Official introductions describe free use; current plan details were not independently confirmed. Check the product page. API and cloud services are separate."
        },
        "sources": [
            "https://qwen.ai/",
            "https://qwen.ai/termsservice"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "An AI assistant for chat, research and creation.",
            "zh": "用于对话、研究与创作的 AI 助手。"
        },
        "icon": "Qw"
    },
    {
        "id": "doubao",
        "name": "豆包",
        "url": "https://www.doubao.com/chat/",
        "company": "北京春田知韵",
        "country": "CN",
        "tags": [
            "chat",
            "search",
            "writing",
            "image"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Free access and paid memberships are available. Consult the current product page for advanced features and membership benefits.",
            "zh": "有免费版及付费会员；高级功能和会员权益以产品当前页面为准。"
        },
        "sources": [
            "https://www.doubao.com/legal/ey01"
        ],
        "verifiedOn": "2026-10-12",
        "categories": [
            "ai"
        ],
        "description": {
            "en": "An AI assistant for everyday questions and creation.",
            "zh": "用于日常问答、搜索、写作与创作。"
        },
        "icon": "豆"
    },
    {
        "id": "github",
        "name": "GitHub",
        "url": "https://github.com/",
        "company": "GitHub, Inc.",
        "country": "US",
        "categories": [
            "development"
        ],
        "description": {
            "zh": "代码托管与协作开发平台。",
            "en": "Code hosting and development collaboration."
        },
        "tags": [
            "code-hosting",
            "collaboration"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "A free base plan and paid Team / Enterprise plans are available; some resources are billed separately.",
            "zh": "免费基础方案与付费 Team / Enterprise 并存；部分资源另计。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://github.com/",
            "https://github.com/pricing",
            "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service",
            "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Gi"
    },
    {
        "id": "mdn",
        "name": "MDN Web Docs",
        "url": "https://developer.mozilla.org/zh-CN/",
        "company": "Mozilla",
        "country": "unknown",
        "categories": [
            "development"
        ],
        "description": {
            "zh": "查阅 Web 标准、开发文档与教程。",
            "en": "Web standards, documentation and tutorials."
        },
        "tags": [
            "documentation",
            "web-standards",
            "tutorials"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://developer.mozilla.org/zh-CN/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "MD"
    },
    {
        "id": "canva",
        "name": "Canva",
        "url": "https://www.canva.com/",
        "company": "Canva",
        "country": "unknown",
        "categories": [
            "design"
        ],
        "description": {
            "zh": "制作视觉设计、演示文稿和社交素材。",
            "en": "Create visual designs, presentations and social content."
        },
        "tags": [
            "visual-design",
            "presentations",
            "social-content"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "zh": "提供免费设计方案；Pro、Business 和 Enterprise 为付费升级，AI 额度随方案而异。",
            "en": "A free design plan is available; Pro, Business and Enterprise are paid upgrades with plan-specific AI limits."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.canva.com/",
            "https://www.canva.com/pricing/",
            "https://www.canva.com/policies/terms-of-use/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Ca"
    },
    {
        "id": "figma",
        "name": "Figma",
        "url": "https://www.figma.com/",
        "company": "Figma, Inc.",
        "country": "US",
        "categories": [
            "design"
        ],
        "description": {
            "zh": "协作设计界面与交互原型。",
            "en": "Collaborative interface design and prototyping."
        },
        "tags": [
            "interface-design",
            "prototyping",
            "collaboration"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Starter is free with limited features; professional and organization plans charge per seat.",
            "zh": "Starter 免费且功能有限；专业与组织方案按席位收费。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.figma.com/",
            "https://www.figma.com/pricing/",
            "https://www.figma.com/legal/privacy/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Fi"
    },
    {
        "id": "notion",
        "name": "Notion",
        "url": "https://www.notion.com/",
        "company": "Notion Labs, Inc.",
        "country": "US",
        "categories": [
            "office"
        ],
        "description": {
            "zh": "整理笔记、文档与团队项目。",
            "en": "Organize notes, documents and team projects."
        },
        "tags": [
            "notes",
            "documents",
            "project-management"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Free has usage limits; paid Plus, Business and other plans extend available features.",
            "zh": "提供有使用限制的 Free；Plus、Business 等付费方案扩展功能。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.notion.com/",
            "https://www.notion.com/pricing",
            "https://www.notion.com/trust/privacy-policy"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "No"
    },
    {
        "id": "coursera",
        "name": "Coursera",
        "url": "https://www.coursera.org/",
        "company": "Coursera, Inc.",
        "country": "US",
        "categories": [
            "learning"
        ],
        "description": {
            "zh": "查找在线课程、证书及学位项目。",
            "en": "Explore online courses, certificates and degree programs."
        },
        "tags": [
            "online-courses",
            "certificates",
            "degrees"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.coursera.org/",
            "https://www.coursera.org/about/privacy"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Co"
    },
    {
        "id": "baidu",
        "name": "百度",
        "url": "https://www.baidu.com/",
        "company": "百度",
        "country": "unknown",
        "categories": [
            "search"
        ],
        "description": {
            "zh": "搜索中文网页与相关信息。",
            "en": "Search Chinese-language web pages and information."
        },
        "tags": [
            "web-search",
            "chinese-search"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.baidu.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "百度"
    },
    {
        "id": "xinhuanet",
        "name": "新华网",
        "url": "https://www.xinhuanet.com/",
        "company": "新华网",
        "country": "unknown",
        "categories": [
            "news"
        ],
        "description": {
            "zh": "阅读综合新闻与专题报道。",
            "en": "Read news and in-depth coverage."
        },
        "tags": [
            "news-reporting",
            "in-depth-reporting"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.xinhuanet.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "新华"
    },
    {
        "id": "youtube",
        "name": "YouTube",
        "url": "https://www.youtube.com/",
        "company": "YouTube",
        "country": "unknown",
        "categories": [
            "media"
        ],
        "description": {
            "zh": "观看视频与关注创作者内容。",
            "en": "Watch videos and follow creators."
        },
        "tags": [
            "video",
            "creator-content"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.youtube.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Yo"
    },
    {
        "id": "reddit",
        "name": "Reddit",
        "url": "https://www.reddit.com/",
        "company": "Reddit",
        "country": "unknown",
        "categories": [
            "social"
        ],
        "description": {
            "zh": "浏览兴趣社区与参与话题讨论。",
            "en": "Explore interest communities and discussions."
        },
        "tags": [
            "communities",
            "discussions"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.reddit.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Re"
    },
    {
        "id": "amazon",
        "name": "Amazon",
        "url": "https://www.amazon.com/",
        "company": "Amazon",
        "country": "unknown",
        "categories": [
            "shopping"
        ],
        "description": {
            "zh": "浏览商品并比较购物选项。",
            "en": "Browse products and shopping options."
        },
        "tags": [
            "products",
            "online-shopping"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.amazon.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Am"
    },
    {
        "id": "rail12306",
        "name": "铁路12306",
        "url": "https://www.12306.cn/",
        "company": "中国铁路",
        "country": "unknown",
        "categories": [
            "travel"
        ],
        "description": {
            "zh": "查询铁路车次、票务与出行服务。",
            "en": "Rail schedules, ticketing and passenger services."
        },
        "tags": [
            "rail-travel",
            "ticketing",
            "passenger-services"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.12306.cn/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "铁路"
    },
    {
        "id": "china-weather",
        "name": "中国天气网",
        "url": "https://www.weather.com.cn/",
        "company": "中国气象局公共气象服务中心",
        "country": "unknown",
        "categories": [
            "lifestyle"
        ],
        "description": {
            "zh": "查询城市天气、预警及气象资讯。",
            "en": "City forecasts, weather alerts and meteorological news."
        },
        "tags": [
            "weather-forecast",
            "weather-alerts"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.weather.com.cn/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "中国"
    },
    {
        "id": "worldbank-data",
        "name": "世界银行开放数据",
        "url": "https://data.worldbank.org/",
        "company": "World Bank",
        "country": "unknown",
        "categories": [
            "finance"
        ],
        "description": {
            "zh": "查询全球发展和宏观经济统计数据。",
            "en": "Explore global development and economic data."
        },
        "tags": [
            "economic-data",
            "development-data"
        ],
        "pricing": "free",
        "pricingNote": {
            "en": "The official site provides free, open access to global development data.",
            "zh": "官网明确提供免费开放的全球发展数据。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://data.worldbank.org/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "世界"
    },
    {
        "id": "linkedin-jobs",
        "name": "LinkedIn Jobs",
        "url": "https://www.linkedin.com/jobs/",
        "company": "LinkedIn",
        "country": "unknown",
        "categories": [
            "careers"
        ],
        "description": {
            "zh": "搜索职位与职业机会。",
            "en": "Search jobs and career opportunities."
        },
        "tags": [
            "job-search",
            "career-opportunities"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.linkedin.com/jobs/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Li"
    },
    {
        "id": "google-trends",
        "name": "Google Trends",
        "url": "https://trends.google.com/trends/",
        "company": "Google",
        "country": "unknown",
        "categories": [
            "marketing"
        ],
        "description": {
            "zh": "比较搜索趋势与话题热度。",
            "en": "Compare search trends and topic interest."
        },
        "tags": [
            "search-trends",
            "topic-interest"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://trends.google.com/trends/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Go"
    },
    {
        "id": "ilovepdf",
        "name": "iLovePDF",
        "url": "https://www.ilovepdf.com/",
        "company": "ILOVEPDF, S.L.",
        "country": "ES",
        "categories": [
            "utilities"
        ],
        "description": {
            "zh": "合并、压缩和转换 PDF 文件。",
            "en": "Merge, compress and convert PDF files."
        },
        "tags": [
            "pdf-merge",
            "pdf-compression",
            "file-conversion"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "en": "Basic is free with processing limits; Premium and Business offer additional capabilities.",
            "zh": "Basic 免费但文档处理有限；Premium 与 Business 提供更多功能。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.ilovepdf.com/",
            "https://www.ilovepdf.com/pricing",
            "https://www.ilovepdf.com/help/terms"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "iL"
    },
    {
        "id": "steam",
        "name": "Steam",
        "url": "https://store.steampowered.com/",
        "company": "Valve",
        "country": "unknown",
        "categories": [
            "games"
        ],
        "description": {
            "zh": "浏览电脑游戏与游戏社区资讯。",
            "en": "Browse PC games and community information."
        },
        "tags": [
            "pc-games",
            "game-community"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://store.steampowered.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "St"
    },
    {
        "id": "govuk",
        "name": "GOV.UK",
        "url": "https://www.gov.uk/",
        "company": "UK Government",
        "country": "unknown",
        "categories": [
            "public-services"
        ],
        "description": {
            "zh": "查阅英国政府政策与公共办事指南。",
            "en": "UK government information and public-service guidance."
        },
        "tags": [
            "government-information",
            "public-service-guides"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.gov.uk/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "GO"
    },
    {
        "id": "bing",
        "name": "Bing",
        "searchAliases": ["必应"],
        "url": "https://www.bing.com/",
        "company": "Microsoft",
        "country": "unknown",
        "categories": [
            "search"
        ],
        "description": {
            "zh": "搜索网页、图片和新闻。",
            "en": "Search web pages, images and news."
        },
        "tags": [
            "web-search",
            "image-search",
            "news-search"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.bing.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Bi"
    },
    {
        "id": "gitlab",
        "name": "GitLab",
        "url": "https://gitlab.com/",
        "company": "GitLab Inc.",
        "country": "US",
        "categories": [
            "development"
        ],
        "description": {
            "zh": "托管代码并管理持续集成和交付。",
            "en": "Host code and manage CI/CD workflows."
        },
        "tags": [
            "code-hosting",
            "ci-cd"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "zh": "GitLab.com 提供有用户数、存储和计算额度限制的 Free；Premium、Ultimate 及额外资源收费。",
            "en": "GitLab.com offers a Free tier with user, storage and compute limits; Premium, Ultimate and extra resources are paid."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://about.gitlab.com/",
            "https://about.gitlab.com/terms/",
            "https://handbook.gitlab.com/handbook/legal/subscription-agreement/",
            "https://about.gitlab.com/pricing/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Gi"
    },
    {
        "id": "stackoverflow",
        "name": "Stack Overflow",
        "url": "https://stackoverflow.com/",
        "company": "Stack Exchange, Inc.",
        "country": "US",
        "categories": [
            "development"
        ],
        "description": {
            "zh": "查找编程问题与技术解答。",
            "en": "Find programming questions and technical answers."
        },
        "tags": [
            "programming",
            "technical-qa"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://stackoverflow.com/",
            "https://stackoverflow.com/legal/terms-of-service/public"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "St"
    },
    {
        "id": "zcool",
        "name": "站酷",
        "url": "https://www.zcool.com.cn/",
        "company": "北京站酷网络科技有限公司",
        "country": "CN",
        "categories": [
            "design"
        ],
        "description": {
            "zh": "发现原创设计作品与创意灵感。",
            "en": "Discover original design work and creative inspiration."
        },
        "tags": [
            "design-inspiration",
            "design-showcase"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.zcool.com.cn/about"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "站酷"
    },
    {
        "id": "wps",
        "name": "WPS Office",
        "url": "https://www.wps.cn/",
        "company": "金山办公",
        "country": "unknown",
        "categories": [
            "office"
        ],
        "description": {
            "zh": "使用文字、表格、演示和 PDF 办公工具。",
            "en": "Work with documents, spreadsheets, presentations and PDFs."
        },
        "tags": [
            "documents",
            "spreadsheets",
            "presentations",
            "pdf"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.wps.cn/?mod=product"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "WP"
    },
    {
        "id": "tencent-docs",
        "name": "腾讯文档",
        "url": "https://docs.qq.com/",
        "company": "腾讯",
        "country": "unknown",
        "categories": [
            "office"
        ],
        "description": {
            "zh": "在线协作编辑文档并共享文件。",
            "en": "Collaboratively edit documents and share files."
        },
        "tags": [
            "documents",
            "collaboration",
            "file-sharing"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.tencent.com/zh-cn/products/tencent-docs/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "腾讯"
    },
    {
        "id": "icourse163",
        "name": "中国大学MOOC",
        "url": "https://www.icourse163.org/",
        "company": "中国大学MOOC",
        "country": "unknown",
        "categories": [
            "learning"
        ],
        "description": {
            "zh": "学习高校在线课程和专业知识。",
            "en": "Explore university online courses and academic subjects."
        },
        "tags": [
            "online-courses",
            "academic-subjects"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.icourse163.org/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "中国"
    },
    {
        "id": "xuetangx",
        "name": "学堂在线",
        "url": "https://www.xuetangx.com/",
        "company": "学堂在线",
        "country": "unknown",
        "categories": [
            "learning"
        ],
        "description": {
            "zh": "查找大学在线课程与学习资源。",
            "en": "Find university online courses and learning resources."
        },
        "tags": [
            "online-courses",
            "learning-resources"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.xuetangx.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "学堂"
    },
    {
        "id": "google",
        "name": "Google",
        "searchAliases": ["谷歌"],
        "url": "https://www.google.com/",
        "company": "Google",
        "country": "unknown",
        "categories": [
            "search"
        ],
        "description": {
            "zh": "搜索网页、图片及公开信息。",
            "en": "Search web pages, images and public information."
        },
        "tags": [
            "web-search",
            "image-search"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.google.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Go"
    },
    {
        "id": "duckduckgo",
        "name": "DuckDuckGo",
        "url": "https://duckduckgo.com/",
        "company": "DuckDuckGo",
        "country": "unknown",
        "categories": [
            "search"
        ],
        "description": {
            "zh": "以隐私保护为特色的网页搜索入口。",
            "en": "A privacy-focused web search service."
        },
        "tags": [
            "web-search",
            "privacy-focused"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://duckduckgo.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Du"
    },
    {
        "id": "cctv",
        "name": "央视网",
        "url": "https://www.cctv.com/",
        "company": "央视网",
        "country": "unknown",
        "categories": [
            "news"
        ],
        "description": {
            "zh": "阅读新闻报道与观看央视节目。",
            "en": "Read news and watch CCTV programming."
        },
        "tags": [
            "news-reporting",
            "tv-programmes"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.cctv.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "央视"
    },
    {
        "id": "apnews",
        "name": "AP News",
        "url": "https://apnews.com/",
        "company": "Associated Press",
        "country": "unknown",
        "categories": [
            "news"
        ],
        "description": {
            "zh": "阅读国际新闻与现场报道。",
            "en": "Read international news and reporting."
        },
        "tags": [
            "international-news",
            "news-reporting"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://apnews.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "AP"
    },
    {
        "id": "bilibili",
        "name": "哔哩哔哩",
        "url": "https://www.bilibili.com/",
        "company": "哔哩哔哩",
        "country": "unknown",
        "categories": [
            "media"
        ],
        "description": {
            "zh": "浏览视频、番剧和创作者内容。",
            "en": "Browse videos, series and creator content."
        },
        "tags": [
            "video",
            "series",
            "creator-content"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.bilibili.com/blackboard/aboutUs.html"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "哔哩"
    },
    {
        "id": "tencent-video",
        "name": "腾讯视频",
        "url": "https://v.qq.com/",
        "company": "腾讯视频",
        "country": "unknown",
        "categories": [
            "media"
        ],
        "description": {
            "zh": "观看影视、综艺和在线视频。",
            "en": "Watch films, series, variety shows and online video."
        },
        "tags": [
            "video",
            "films",
            "series",
            "variety-shows"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://v.qq.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "腾讯"
    },
    {
        "id": "spotify",
        "name": "Spotify",
        "url": "https://open.spotify.com/",
        "company": "Spotify",
        "country": "unknown",
        "categories": [
            "media"
        ],
        "description": {
            "zh": "收听音乐、播客和音频内容。",
            "en": "Listen to music, podcasts and audio content."
        },
        "tags": [
            "music",
            "podcasts",
            "audio"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.spotify.com/",
            "https://www.spotify.com/us/about-us/contact/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Sp"
    },
    {
        "id": "douban",
        "name": "豆瓣",
        "url": "https://www.douban.com/",
        "company": "豆瓣",
        "country": "unknown",
        "categories": [
            "social"
        ],
        "description": {
            "zh": "发现书影音评价与兴趣社区。",
            "en": "Discover books, films, music reviews and communities."
        },
        "tags": [
            "reviews",
            "books",
            "films",
            "communities"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.douban.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "豆瓣"
    },
    {
        "id": "tmall",
        "name": "天猫",
        "url": "https://www.tmall.com/",
        "company": "天猫",
        "country": "unknown",
        "categories": [
            "shopping"
        ],
        "description": {
            "zh": "浏览品牌商品与线上购物选项。",
            "en": "Browse branded products and shopping options."
        },
        "tags": [
            "products",
            "online-shopping"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.tmall.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "天猫"
    },
    {
        "id": "amap",
        "name": "高德地图",
        "url": "https://www.amap.com/",
        "company": "高德地图",
        "country": "unknown",
        "categories": [
            "travel"
        ],
        "description": {
            "zh": "查找地点、地图和出行路线。",
            "en": "Find places, maps and travel routes."
        },
        "tags": [
            "maps",
            "places",
            "routes"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.amap.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "高德"
    },
    {
        "id": "ctrip",
        "name": "携程旅行",
        "url": "https://www.ctrip.com/",
        "company": "携程",
        "country": "unknown",
        "categories": [
            "travel"
        ],
        "description": {
            "zh": "查询酒店、机票和旅游服务。",
            "en": "Explore hotels, flights and travel services."
        },
        "tags": [
            "hotels",
            "flights",
            "travel-services"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.ctrip.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "携程"
    },
    {
        "id": "xiachufang",
        "name": "下厨房",
        "url": "https://www.xiachufang.com/",
        "company": "下厨房",
        "country": "unknown",
        "categories": [
            "lifestyle"
        ],
        "description": {
            "zh": "查找菜谱、食材做法与烹饪灵感。",
            "en": "Find recipes, ingredient ideas and cooking inspiration."
        },
        "tags": [
            "recipes",
            "cooking"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.xiachufang.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "下厨"
    },
    {
        "id": "timeanddate",
        "name": "Time and Date",
        "url": "https://www.timeanddate.com/",
        "company": "Time and Date AS",
        "country": "NO",
        "categories": [
            "lifestyle"
        ],
        "description": {
            "zh": "查询世界时间、时区与日历。",
            "en": "Check world clocks, time zones and calendars."
        },
        "tags": [
            "world-clocks",
            "time-zones",
            "calendars"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.timeanddate.com/",
            "https://www.timeanddate.com/information/contact.html",
            "https://www.timeanddate.com/information/terms-conditions.html"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Ti"
    },
    {
        "id": "fred",
        "name": "FRED",
        "url": "https://fred.stlouisfed.org/",
        "company": "Federal Reserve Bank of St. Louis",
        "country": "unknown",
        "categories": [
            "finance"
        ],
        "description": {
            "zh": "查询和对比宏观经济时间序列数据。",
            "en": "Explore and compare economic time-series data."
        },
        "tags": [
            "economic-data",
            "time-series"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://fred.stlouisfed.org/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "FR"
    },
    {
        "id": "imf-data",
        "name": "IMF Data",
        "url": "https://data.imf.org/",
        "company": "International Monetary Fund",
        "country": "unknown",
        "categories": [
            "finance"
        ],
        "description": {
            "zh": "查询国际宏观经济与金融统计。",
            "en": "Explore international economic and financial statistics."
        },
        "tags": [
            "economic-data",
            "financial-statistics"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.imf.org/en/Data"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "IM"
    },
    {
        "id": "china-statistics",
        "name": "国家数据",
        "url": "https://data.stats.gov.cn/",
        "company": "国家统计局",
        "country": "CN",
        "categories": [
            "finance"
        ],
        "description": {
            "zh": "查询国家统计局经济与社会统计。",
            "en": "Explore official economic and social statistics."
        },
        "tags": [
            "economic-data",
            "social-statistics"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://data.stats.gov.cn/dg/website/page.html"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "国家"
    },
    {
        "id": "zhipin",
        "name": "BOSS直聘",
        "url": "https://www.zhipin.com/",
        "company": "BOSS直聘",
        "country": "unknown",
        "categories": [
            "careers"
        ],
        "description": {
            "zh": "查找职位并了解招聘机会。",
            "en": "Find jobs and recruitment opportunities."
        },
        "tags": [
            "job-search",
            "career-opportunities"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.zhipin.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "BO"
    },
    {
        "id": "liepin",
        "name": "猎聘",
        "url": "https://www.liepin.com/",
        "company": "猎聘",
        "country": "unknown",
        "categories": [
            "careers"
        ],
        "description": {
            "zh": "查找专业职位和职业发展机会。",
            "en": "Find professional roles and career opportunities."
        },
        "tags": [
            "job-search",
            "career-opportunities"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.liepin.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "猎聘"
    },
    {
        "id": "indeed",
        "name": "Indeed",
        "url": "https://www.indeed.com/",
        "company": "Indeed",
        "country": "unknown",
        "categories": [
            "careers"
        ],
        "description": {
            "zh": "按关键词和地点搜索职位。",
            "en": "Search jobs by keyword and location."
        },
        "tags": [
            "job-search",
            "location-search"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.indeed.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "In"
    },
    {
        "id": "hubspot",
        "name": "HubSpot",
        "url": "https://www.hubspot.com/",
        "company": "HubSpot",
        "country": "unknown",
        "categories": [
            "marketing"
        ],
        "description": {
            "zh": "管理客户关系与营销工作流。",
            "en": "Manage customer relationships and marketing workflows."
        },
        "tags": [
            "crm",
            "marketing-workflows"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.hubspot.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Hu"
    },
    {
        "id": "mailchimp",
        "name": "Mailchimp",
        "url": "https://mailchimp.com/",
        "company": "Mailchimp",
        "country": "unknown",
        "categories": [
            "marketing"
        ],
        "description": {
            "zh": "制作邮件营销内容与管理营销活动。",
            "en": "Create email marketing content and manage campaigns."
        },
        "tags": [
            "email-marketing",
            "campaign-management"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://mailchimp.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Ma"
    },
    {
        "id": "similarweb",
        "name": "Similarweb",
        "url": "https://www.similarweb.com/",
        "company": "Similarweb",
        "country": "unknown",
        "categories": [
            "marketing"
        ],
        "description": {
            "zh": "研究网站流量与数字市场表现。",
            "en": "Research website traffic and digital market performance."
        },
        "tags": [
            "website-traffic",
            "market-research"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.similarweb.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Si"
    },
    {
        "id": "baidu-index",
        "name": "百度指数",
        "url": "https://index.baidu.com/",
        "company": "百度",
        "country": "unknown",
        "categories": [
            "marketing"
        ],
        "description": {
            "zh": "了解关键词搜索热度与趋势。",
            "en": "Explore keyword search interest and trends."
        },
        "tags": [
            "search-trends",
            "keyword-interest"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://index.baidu.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "百度"
    },
    {
        "id": "tinypng",
        "name": "TinyPNG",
        "url": "https://tinypng.com/",
        "company": "Tinify B.V.",
        "country": "NL",
        "categories": [
            "utilities"
        ],
        "description": {
            "zh": "压缩 PNG、JPEG 和 WebP 等图片。",
            "en": "Compress PNG, JPEG and WebP images."
        },
        "tags": [
            "image-compression",
            "image-formats"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "zh": "网页压缩工具提供有批次与文件大小限制的免费版；Web Pro 和 Web Ultra 为付费订阅，API 另计。",
            "en": "The web tool has a free tier with batch and file-size limits; Web Pro and Web Ultra are paid subscriptions. API pricing is separate."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://tinypng.com/",
            "https://tinify.com/terms",
            "https://tinify.com/pricing/web"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Ti"
    },
    {
        "id": "epic-games",
        "name": "Epic Games Store",
        "url": "https://store.epicgames.com/",
        "company": "Epic Games",
        "country": "unknown",
        "categories": [
            "games"
        ],
        "description": {
            "zh": "发现电脑游戏与官方商店资讯。",
            "en": "Discover PC games and official store information."
        },
        "tags": [
            "pc-games",
            "game-store"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://store.epicgames.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Ep"
    },
    {
        "id": "gog",
        "name": "GOG",
        "url": "https://www.gog.com/",
        "company": "GOG",
        "country": "unknown",
        "categories": [
            "games"
        ],
        "description": {
            "zh": "浏览电脑游戏和 DRM-free 游戏目录。",
            "en": "Browse PC games and a DRM-free game catalog."
        },
        "tags": [
            "pc-games",
            "drm-free-games"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.gog.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "GO"
    },
    {
        "id": "govcn",
        "name": "中国政府网",
        "url": "https://www.gov.cn/",
        "company": "中国政府网",
        "country": "unknown",
        "categories": [
            "public-services"
        ],
        "description": {
            "zh": "查阅政府政策、公开信息与办事指引。",
            "en": "Read government policies, public information and service guides."
        },
        "tags": [
            "government-information",
            "public-service-guides"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.gov.cn/zhengce/zhengceku/bmwj/home.htm"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "中国"
    },
    {
        "id": "china-public-services",
        "name": "国家政务服务平台",
        "url": "https://gjzwfw.www.gov.cn/",
        "company": "国家政务服务平台",
        "country": "unknown",
        "categories": [
            "public-services"
        ],
        "description": {
            "zh": "查找全国政务事项和公共服务入口。",
            "en": "Find national public-service information and service portals."
        },
        "tags": [
            "public-services",
            "service-portals"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://gjzwfw.www.gov.cn/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "国家"
    },
    {
        "id": "feishu",
        "name": "飞书",
        "url": "https://www.feishu.cn/",
        "company": "飞书",
        "country": "unknown",
        "categories": [
            "office"
        ],
        "description": {
            "zh": "协作处理文档、消息、会议和项目。",
            "en": "Collaborate on documents, messaging, meetings and projects."
        },
        "tags": [
            "documents",
            "messaging",
            "meetings",
            "project-management"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.feishu.cn/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "飞书"
    },
    {
        "id": "khan-academy",
        "name": "Khan Academy",
        "url": "https://www.khanacademy.org/",
        "company": "Khan Academy, Inc.",
        "country": "US",
        "categories": [
            "learning"
        ],
        "description": {
            "zh": "学习数学、科学和其他学科课程。",
            "en": "Study mathematics, science and other subjects."
        },
        "tags": [
            "online-courses",
            "mathematics",
            "science"
        ],
        "pricing": "free",
        "pricingNote": {
            "en": "Free applies only to the core learning platform described by the official site; other products and school services may have different terms.",
            "zh": "仅指官网明确免费的核心课程平台；其他产品及学校服务可能有不同条件。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.khanacademy.org/",
            "https://www.khanacademy.org/about",
            "https://en.khanacademy.org/about/privacy-policy"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Kh"
    },
    {
        "id": "nintendo",
        "name": "Nintendo",
        "url": "https://www.nintendo.com/",
        "company": "Nintendo",
        "country": "unknown",
        "categories": [
            "games"
        ],
        "description": {
            "zh": "查找任天堂游戏和官方产品资讯。",
            "en": "Find Nintendo games and official product information."
        },
        "tags": [
            "games",
            "product-information"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.nintendo.com/",
            "https://www.nintendo.com/us/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Ni"
    },
    {
        "id": "openstreetmap",
        "name": "OpenStreetMap",
        "url": "https://www.openstreetmap.org/",
        "company": "OpenStreetMap",
        "country": "unknown",
        "categories": [
            "travel"
        ],
        "description": {
            "zh": "浏览社区共同维护的开放地图。",
            "en": "Explore community-maintained open maps."
        },
        "tags": [
            "maps",
            "community-mapping"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.openstreetmap.org/about"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Op"
    },
    {
        "id": "squoosh",
        "name": "Squoosh",
        "url": "https://squoosh.app/",
        "company": "Google Chrome Labs",
        "country": "unknown",
        "categories": [
            "utilities",
            "design"
        ],
        "description": {
            "zh": "对比图片压缩效果并调整编码设置。",
            "en": "Compare image compression results and adjust encoding settings."
        },
        "tags": [
            "image-compression",
            "image-formats"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "zh": "官网提供图片压缩工具；本次未确认独立定价说明，具体条件以官网为准。",
            "en": "The official site provides image compression tools; a separate pricing statement was not verified. Check the site for current terms."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://squoosh.app/",
            "https://github.com/GoogleChromeLabs/squoosh"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Sq"
    },
    {
        "id": "photopea",
        "name": "Photopea",
        "url": "https://www.photopea.com/",
        "company": "Photopea",
        "country": "unknown",
        "categories": [
            "design",
            "utilities"
        ],
        "description": {
            "zh": "编辑 PSD、图层与多种图片格式。",
            "en": "Edit PSD files, layers and many image formats."
        },
        "tags": [
            "photo-editing",
            "psd-editing",
            "image-formats"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "zh": "提供带广告免费版；Premium 去除广告并可能提供其他权益，价格见账户窗口。",
            "en": "An ad-supported free account is available. Premium removes ads and may add benefits; prices are shown in the account window."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.photopea.com/",
            "https://www.photopea.com/api/accounts"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Ph"
    },
    {
        "id": "regex101",
        "name": "regex101",
        "url": "https://regex101.com/",
        "company": "regex101",
        "country": "unknown",
        "categories": [
            "development",
            "utilities"
        ],
        "description": {
            "zh": "测试正则表达式、查看匹配结果并调试。",
            "en": "Test regular expressions, inspect matches and debug patterns."
        },
        "tags": [
            "regex-testing",
            "text-processing"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "zh": "基础匹配与部分调试功能免费；Pro 提供更多测试字符串和高级功能。",
            "en": "Core matching and some debugging features are free. Pro expands test strings and advanced tools."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://regex101.com/",
            "https://support.regex101.com/application/regex101-pro/",
            "https://regex101.com/account"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Rx"
    },
    {
        "id": "cyberchef",
        "name": "CyberChef",
        "url": "https://gchq.github.io/CyberChef/",
        "company": "GCHQ",
        "country": "unknown",
        "categories": [
            "utilities",
            "development"
        ],
        "description": {
            "zh": "组合编码解码、哈希与数据格式转换。",
            "en": "Combine encoding, decoding, hashing and data transformations."
        },
        "tags": [
            "encoding-decoding",
            "data-conversion",
            "hash-tools"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "zh": "官网提供开源网页工具与独立下载；本次未核验单独的定价说明。",
            "en": "The official site provides an open-source web tool and standalone download; a separate pricing statement was not verified."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://gchq.github.io/CyberChef/",
            "https://github.com/gchq/CyberChef"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "CC"
    },
    {
        "id": "caniuse",
        "name": "Can I use",
        "url": "https://caniuse.com/",
        "company": "Can I use / community",
        "country": "unknown",
        "categories": [
            "development"
        ],
        "description": {
            "zh": "查询 CSS、HTML 和 Web API 的浏览器兼容性。",
            "en": "Check browser compatibility for CSS, HTML and web APIs."
        },
        "tags": [
            "browser-compatibility",
            "web-standards"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "zh": "兼容性表可直接查看；赞助去广告和第三方测试服务有各自条件。",
            "en": "Compatibility tables can be viewed directly. Ad-removal sponsorship and third-party testing have separate terms."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://caniuse.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Ci"
    },
    {
        "id": "hoppscotch",
        "name": "Hoppscotch",
        "url": "https://hoppscotch.io/",
        "company": "Hoppscotch",
        "country": "unknown",
        "categories": [
            "development"
        ],
        "description": {
            "zh": "发送 API 请求并组织接口测试。",
            "en": "Send API requests and organize API testing."
        },
        "tags": [
            "api-testing",
            "http-requests"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "zh": "提供免费方案；付费方案增加团队协作、管理及支持功能。",
            "en": "A free plan is available. Paid plans add team collaboration, administration and support."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://hoppscotch.io/",
            "https://hoppscotch.com/pricing"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Ho"
    },
    {
        "id": "google-fonts",
        "name": "Google Fonts",
        "url": "https://fonts.google.com/",
        "company": "Google",
        "country": "unknown",
        "categories": [
            "design",
            "development"
        ],
        "description": {
            "zh": "查找字体家族并获取网页与桌面字体文件。",
            "en": "Explore typefaces and obtain font files for web and desktop use."
        },
        "tags": [
            "fonts",
            "typography"
        ],
        "pricing": "free",
        "pricingNote": {
            "zh": "字体文件可免费获取；使用、修改和再分发须遵循每个字体家族的许可证。",
            "en": "Font files are freely available; use, modification and redistribution remain subject to each font family’s license."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://fonts.google.com/",
            "https://github.com/google/fonts"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "GF"
    },
    {
        "id": "lucide",
        "name": "Lucide",
        "url": "https://lucide.dev/",
        "company": "Lucide contributors",
        "country": "unknown",
        "categories": [
            "design",
            "development"
        ],
        "description": {
            "zh": "搜索和自定义统一风格的 SVG 图标。",
            "en": "Find and customize a consistent set of SVG icons."
        },
        "tags": [
            "icons",
            "svg-assets"
        ],
        "pricing": "free",
        "pricingNote": {
            "zh": "图标按开源许可证提供；使用和分发须保留适用的版权与许可声明。",
            "en": "Icons are provided under open-source licenses; retain applicable copyright and license notices when using or distributing them."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://lucide.dev/",
            "https://lucide.dev/license"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Lu"
    },
    {
        "id": "adobe-color",
        "name": "Adobe Color",
        "url": "https://color.adobe.com/",
        "company": "Adobe",
        "country": "US",
        "categories": [
            "design"
        ],
        "description": {
            "zh": "探索配色、提取色板并检查颜色对比度。",
            "en": "Explore palettes, extract colors and check color contrast."
        },
        "tags": [
            "color-palettes",
            "contrast-checking"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "zh": "配色入口的独立定价未核实；Adobe Express 中自动应用色板需要付费方案。",
            "en": "Separate pricing for this color entry was not verified. Automatically applying palettes in Adobe Express requires a paid plan."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://color.adobe.com/",
            "https://www.adobe.com/about-adobe/contact.html"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "AC"
    },
    {
        "id": "excalidraw",
        "name": "Excalidraw",
        "url": "https://excalidraw.com/",
        "company": "Excalidraw s.r.o.",
        "country": "CZ",
        "categories": [
            "design",
            "office"
        ],
        "description": {
            "zh": "绘制手绘风格草图、示意图和协作白板。",
            "en": "Create sketch-style diagrams and collaborative whiteboards."
        },
        "tags": [
            "whiteboarding",
            "diagramming"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "zh": "提供免费白板；Plus 增加云端场景管理等功能，AI 等功能有额度限制。",
            "en": "A free whiteboard is available. Plus adds cloud scene management and other features; AI and other features have usage limits."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://excalidraw.com/",
            "https://plus.excalidraw.com/pricing",
            "https://plus.excalidraw.com/terms-of-service"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Ex"
    },
    {
        "id": "drawio",
        "name": "draw.io",
        "url": "https://app.diagrams.net/",
        "company": "draw.io Ltd",
        "country": "GB",
        "categories": [
            "office",
            "design"
        ],
        "description": {
            "zh": "制作流程图、架构图和其他结构化图表。",
            "en": "Create flowcharts, architecture diagrams and other structured diagrams."
        },
        "tags": [
            "flowcharts",
            "diagramming"
        ],
        "pricing": "free",
        "pricingNote": {
            "zh": "免费分类仅指独立网页绘图入口；集成产品及存储服务可能采用其他条件。",
            "en": "Free applies to the standalone web diagram editor. Integration products and storage services may have different terms."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://app.diagrams.net/",
            "https://www.drawio.com/",
            "https://www.drawio.com/trust/terms-of-use/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Di"
    },
    {
        "id": "freecodecamp",
        "name": "freeCodeCamp",
        "url": "https://www.freecodecamp.org/",
        "company": "freeCodeCamp",
        "country": "unknown",
        "categories": [
            "learning",
            "development"
        ],
        "description": {
            "zh": "通过编程课程和项目练习学习开发。",
            "en": "Learn development through coding courses and hands-on projects."
        },
        "tags": [
            "coding-practice",
            "online-courses",
            "project-learning"
        ],
        "pricing": "free",
        "pricingNote": {
            "zh": "官网说明课程、项目与认证免费；不代表学历或就业保证。",
            "en": "The official site states that courses, projects and certifications are free; this is not a degree or employment guarantee."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.freecodecamp.org/",
            "https://www.freecodecamp.org/news/about/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "fC"
    },
    {
        "id": "the-odin-project",
        "name": "The Odin Project",
        "url": "https://www.theodinproject.com/",
        "company": "The Odin Project",
        "country": "unknown",
        "categories": [
            "learning",
            "development"
        ],
        "description": {
            "zh": "按开源课程路线学习全栈开发并完成项目。",
            "en": "Follow an open-source full-stack curriculum and build projects."
        },
        "tags": [
            "project-learning",
            "web-development"
        ],
        "pricing": "free",
        "pricingNote": {
            "zh": "全栈课程由开源社区支持并免费提供；社区捐助为自愿。",
            "en": "The full-stack curriculum is free and supported by an open-source community; donations are optional."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.theodinproject.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Od"
    },
    {
        "id": "exercism",
        "name": "Exercism",
        "url": "https://exercism.org/",
        "company": "Exercism",
        "country": "GB",
        "categories": [
            "learning",
            "development"
        ],
        "description": {
            "zh": "通过多语言编程练习和指导提升代码能力。",
            "en": "Improve programming through language-specific exercises and mentoring."
        },
        "tags": [
            "coding-practice",
            "mentoring"
        ],
        "pricing": "free",
        "pricingNote": {
            "zh": "此分类指 Exercism 编程练习与指导；独立产品和团队服务不在此范围。",
            "en": "Free applies to Exercism coding practice and mentoring; separate products and team offerings are outside this classification."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://exercism.org/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Er"
    },
    {
        "id": "mit-ocw",
        "name": "MIT OpenCourseWare",
        "url": "https://ocw.mit.edu/",
        "company": "Massachusetts Institute of Technology",
        "country": "unknown",
        "categories": [
            "learning"
        ],
        "description": {
            "zh": "查阅 MIT 课程讲义、视频与作业资料。",
            "en": "Explore MIT course notes, lectures and assignments."
        },
        "tags": [
            "open-courseware",
            "academic-subjects"
        ],
        "pricing": "free",
        "pricingNote": {
            "zh": "OpenCourseWare 课程资料免费开放；此入口不代表学位课程或付费证书项目。",
            "en": "OpenCourseWare course materials are freely available; this entry is not a degree course or paid certificate program."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://ocw.mit.edu/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "OC"
    },
    {
        "id": "javascript-info",
        "name": "现代 JavaScript 教程 / JavaScript.info",
        "url": "https://javascript.info/",
        "company": "Ilya Kantor / JavaScript.info contributors",
        "country": "unknown",
        "categories": [
            "learning",
            "development"
        ],
        "description": {
            "zh": "系统学习 JavaScript、DOM 与浏览器编程。",
            "en": "Study JavaScript, the DOM and browser programming."
        },
        "tags": [
            "javascript",
            "tutorials",
            "web-development"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "zh": "在线教程可直接阅读，并提供付费 EPUB/PDF 入口；本次未核验完整收费范围。",
            "en": "The online tutorial is directly readable and links to paid EPUB/PDF editions; the complete pricing scope was not verified."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://javascript.info/",
            "https://zh.javascript.info/",
            "https://javascript.info/about"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "JS"
    },
    {
        "id": "geogebra",
        "name": "GeoGebra",
        "url": "https://www.geogebra.org/",
        "company": "GeoGebra GmbH",
        "country": "AT",
        "categories": [
            "learning",
            "utilities"
        ],
        "description": {
            "zh": "绘制函数、探索几何和三维数学模型。",
            "en": "Graph functions and explore geometry and 3D mathematics."
        },
        "tags": [
            "mathematics",
            "graphing",
            "geometry"
        ],
        "pricing": "free",
        "pricingNote": {
            "zh": "非商业学习与教学用途免费；商业用途需要单独许可，须查看具体条款。",
            "en": "Free for non-commercial learning and teaching uses. Commercial uses require a separate license; review the applicable terms."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.geogebra.org/",
            "https://www.geogebra.org/license"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Ge"
    },
    {
        "id": "overleaf",
        "name": "Overleaf",
        "url": "https://www.overleaf.com/",
        "company": "Digital Science UK Limited",
        "country": "GB",
        "categories": [
            "office",
            "learning"
        ],
        "description": {
            "zh": "在线协作编写 LaTeX 论文和技术文档。",
            "en": "Collaborate on LaTeX papers and technical documents online."
        },
        "tags": [
            "latex",
            "academic-writing",
            "collaboration"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "zh": "免费版有协作者和编译时间等限制；付费方案提高额度并增加功能。",
            "en": "The free plan limits collaborators, compilation time and other features. Paid plans expand limits and capabilities."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.overleaf.com/",
            "https://www.overleaf.com/user/subscription/plans",
            "https://www.overleaf.com/legal"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Ov"
    },
    {
        "id": "zotero",
        "name": "Zotero",
        "url": "https://www.zotero.org/",
        "company": "Corporation for Digital Scholarship",
        "country": "US",
        "categories": [
            "office",
            "learning"
        ],
        "description": {
            "zh": "收集研究资料、管理文献并生成引用。",
            "en": "Collect research, organize references and generate citations."
        },
        "tags": [
            "reference-management",
            "citations"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "zh": "文献管理工具免费；附件同步包含有限免费空间，可购买更多存储。",
            "en": "The reference manager is free. Attachment syncing includes limited free storage, with paid storage upgrades."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.zotero.org/",
            "https://www.zotero.org/storage",
            "https://www.zotero.org/support/terms/terms_of_service/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Zo"
    },
    {
        "id": "china-laws",
        "name": "国家法律法规数据库",
        "url": "https://flk.npc.gov.cn/",
        "company": "全国人大常委会办公厅",
        "country": "CN",
        "categories": [
            "public-services"
        ],
        "description": {
            "zh": "按标题、效力和日期检索法律法规及司法解释。",
            "en": "Search laws, regulations and judicial interpretations by title, status and date."
        },
        "tags": [
            "laws-regulations",
            "official-documents"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "zh": "这是官方法规查询入口，不构成法律意见；适用文本与效力请以官方最新记录为准。",
            "en": "An official legal-information entry, not legal advice. Consult the latest official records for applicable text and status."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://flk.npc.gov.cn/search",
            "https://flk.npc.gov.cn/detail?id=4028abcc612777930161287780af3575"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "法规"
    },
    {
        "id": "china-standards",
        "name": "全国标准信息公共服务平台",
        "url": "https://std.samr.gov.cn/",
        "company": "国家市场监督管理总局国家标准技术审评中心",
        "country": "CN",
        "categories": [
            "public-services"
        ],
        "description": {
            "zh": "查询国家、行业、地方标准与标准状态。",
            "en": "Search national, industry and local standards and their status."
        },
        "tags": [
            "standards-search",
            "official-documents"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "zh": "官方标准查询入口；并非所有标准都提供全文或下载，使用须遵守对应版权条件。",
            "en": "An official standards-search entry. Full text and downloads are not available for every standard and are subject to applicable copyright terms."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://std.samr.gov.cn/",
            "https://openstd.samr.gov.cn/bzgk/std/nd?no=83",
            "https://openstd.samr.gov.cn/bzgk/gb/index"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "标准"
    },
    {
        "id": "w3c-validator",
        "name": "W3C Markup Validator",
        "url": "https://validator.w3.org/",
        "company": "World Wide Web Consortium",
        "country": "unknown",
        "categories": [
            "development"
        ],
        "description": {
            "zh": "检查 HTML、XHTML 等网页标记的有效性。",
            "en": "Check the validity of HTML, XHTML and other web markup."
        },
        "tags": [
            "html-validation",
            "web-standards"
        ],
        "pricing": "free",
        "pricingNote": {
            "zh": "W3C 提供免费标记校验服务；校验通过不代表完整质量或无障碍合规。",
            "en": "W3C provides a free markup-validation service. Passing validation is not a full quality or accessibility assessment."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://validator.w3.org/",
            "https://validator.w3.org/about.html"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "W3"
    },
    {
        "id": "crontab-guru",
        "name": "Crontab.guru",
        "url": "https://crontab.guru/",
        "company": "Cronitor",
        "country": "unknown",
        "categories": [
            "development",
            "utilities"
        ],
        "description": {
            "zh": "编辑和理解 cron 定时任务表达式。",
            "en": "Edit and understand cron scheduling expressions."
        },
        "tags": [
            "cron-schedules"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "zh": "仅指 cron 表达式编辑入口；另行链接的监控服务有独立方案，本次未核验入口定价说明。",
            "en": "This entry covers the cron-expression editor. Linked monitoring services have separate plans; a pricing statement for the editor was not verified."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://crontab.guru/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Cr"
    },
    {
        "id": "json-crack",
        "name": "JSON Crack",
        "url": "https://jsoncrack.com/",
        "company": "JSON Crack",
        "country": "unknown",
        "categories": [
            "development",
            "utilities"
        ],
        "description": {
            "zh": "可视化 JSON 并转换 JSON、YAML、CSV 与 XML。",
            "en": "Visualize JSON and convert JSON, YAML, CSV and XML."
        },
        "tags": [
            "json-tools",
            "data-conversion",
            "data-visualization"
        ],
        "pricing": "free",
        "pricingNote": {
            "zh": "原 JSON Crack 网页工具免费，数据规模受复杂度和设备限制；高级付费功能位于独立 ToDiagram。",
            "en": "The JSON Crack web tool is free, with data-size limits depending on complexity and hardware. Advanced paid features are offered separately on ToDiagram."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://jsoncrack.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "JC"
    }
];
    if (typeof module !== 'undefined' && module.exports) module.exports = sites;
    else root.LocalItabNavigationSites = sites;
})(typeof window === 'undefined' ? globalThis : window);
