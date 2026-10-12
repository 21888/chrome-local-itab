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
        "company": "Perplexity AI",
        "country": "unknown",
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
            "https://www.perplexity.ai/help-center/en/articles/11187416-which-perplexity-subscription-plan-is-right-for-you"
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
        "company": "Midjourney",
        "country": "unknown",
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
            "https://docs.midjourney.com/hc/en-us/articles/27870399340173-Free-Trials"
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
        "company": "Moonshot AI（月之暗面）",
        "country": "unknown",
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
            "https://www.kimi.com/en/help/membership/membership-overview"
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
        "company": "GitHub",
        "country": "unknown",
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
            "https://github.com/pricing"
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
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.canva.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Ca"
    },
    {
        "id": "figma",
        "name": "Figma",
        "url": "https://www.figma.com/",
        "company": "Figma",
        "country": "unknown",
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
            "https://www.figma.com/pricing/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Fi"
    },
    {
        "id": "notion",
        "name": "Notion",
        "url": "https://www.notion.com/",
        "company": "Notion",
        "country": "unknown",
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
            "https://www.notion.com/pricing"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "No"
    },
    {
        "id": "coursera",
        "name": "Coursera",
        "url": "https://www.coursera.org/",
        "company": "Coursera",
        "country": "unknown",
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
            "https://www.coursera.org/"
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
        "company": "iLovePDF",
        "country": "unknown",
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
            "https://www.ilovepdf.com/pricing"
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
        "company": "GitLab",
        "country": "unknown",
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
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://about.gitlab.com/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Gi"
    },
    {
        "id": "stackoverflow",
        "name": "Stack Overflow",
        "url": "https://stackoverflow.com/",
        "company": "Stack Overflow",
        "country": "unknown",
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
            "https://stackoverflow.com/"
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
        "company": "Time and Date",
        "country": "unknown",
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
            "https://www.timeanddate.com/"
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
        "company": "Tinify",
        "country": "unknown",
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
        "pricing": "unknown",
        "pricingNote": {
            "en": "This is a website link; fees for services, content or products are determined by the official site.",
            "zh": "仅提供网站入口；具体服务、内容或商品的费用以官网为准。"
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://tinypng.com/"
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
        "company": "Khan Academy",
        "country": "unknown",
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
            "https://www.khanacademy.org/about"
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
    }
];
    if (typeof module !== 'undefined' && module.exports) module.exports = sites;
    else root.LocalItabNavigationSites = sites;
})(typeof window === 'undefined' ? globalThis : window);
