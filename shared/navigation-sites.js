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
            "en": "A limited free plan is available. Paid subscriptions expand limits and features.",
            "zh": "提供有限额免费版；付费订阅提高额度和功能。"
        },
        "sources": [
            "https://x.ai/pricing",
            "https://x.ai/legal/terms-of-service",
            "https://docs.x.ai/x-subscription/overview"
        ],
        "verifiedOn": "2026-10-15",
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
            "en": "Limited free Agent and Chat usage is available. Paid plans expand included usage and features; third-party models, where available, are billed separately from the first request. Legacy plans have different rules.",
            "zh": "提供有限免费 Agent 与对话额度；付费方案扩展内含额度及功能。可用的第三方模型从首次请求起另计费用；旧版套餐规则不同。"
        },
        "sources": [
            "https://cursor.com/pricing",
            "https://cursor.com/terms-of-service",
            "https://cursor.com/docs/models-and-pricing"
        ],
        "verifiedOn": "2026-10-15",
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
        "pricing": "unknown",
        "pricingNote": {
            "en": "Legacy Dream Machine guides list Free; current Luma pricing lists paid plans and its FAQ mentions a free trial, but the free allowance is unverified. Legacy and current plans differ; check the plan and terms for commercial rights. API is billed separately.",
            "zh": "Dream Machine 旧版帮助页列有 Free；当前 Luma 价格页列付费方案，FAQ 提及免费试用，但免费额度未核实。新旧方案不同，商用权请核对对应方案及条款；API 另计。"
        },
        "sources": [
            "https://lumalabs.ai/learning-hub/dream-machine-credit-system",
            "https://lumalabs.ai/learning-hub/licensing",
            "https://lumalabs.ai/legal/terms-of-service",
            "https://lumalabs.ai/pricing",
            "https://lumalabs.ai/learning-hub/frequently-asked-questions-about-the-new-luma-agents-app"
        ],
        "verifiedOn": "2026-10-15",
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
            "zh": "官方价格页与旧版 FAQ 存在差异。当前价格页 Free 方案不含月度生成额度，可购买积分包或订阅获取额度；旧版、iOS 和 API 额度独立，请核对官网。",
            "en": "The pricing page and older FAQ differ. The current pricing page lists no monthly generation credits for Free; paid credit packs or subscriptions supply credits. Legacy, iOS and API credits are separate. Check the official page."
        },
        "sources": [
            "https://pika.art/pricing",
            "https://pika.art/terms-of-service",
            "https://pika.art/faq"
        ],
        "verifiedOn": "2026-10-15",
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
        "searchAliases": [
            "亚马逊"
        ],
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
            "https://www.amazon.com/",
            "https://gs.amazon.cn/zhishi/article-251103-5"
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
        "searchAliases": [
            "领英"
        ],
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
            "https://www.linkedin.com/jobs/",
            "https://www.linkedin.com/?_l=zh"
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
        "searchAliases": [
            "国际货币基金组织"
        ],
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
            "https://www.imf.org/en/Data",
            "https://www.imf.org/zh/about/factsheets/imf-at-a-glance",
            "https://www.imf.org/zh/home"
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
        "searchAliases": [
            "可汗学院"
        ],
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
            "https://en.khanacademy.org/about/privacy-policy",
            "https://www.khanacademy.org/?lang=zh"
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
    },
    {
        "id": "google-scholar",
        "searchAliases": [
            "Google 学术搜索"
        ],
        "name": "Google Scholar",
        "url": "https://scholar.google.com/",
        "company": "Google LLC",
        "country": "US",
        "categories": [
            "search",
            "learning"
        ],
        "description": {
            "zh": "检索学术论文、学位论文、书籍和引用关系。",
            "en": "Search scholarly papers, theses, books and citation links."
        },
        "tags": [
            "academic-search",
            "research",
            "citations"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "zh": "此入口的独立定价未核验；搜索结果包含开放和订阅来源，论文全文不一定免费。",
            "en": "Separate pricing for this search entry was not verified. Results include open and subscription sources; full text is not always free."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://scholar.google.com/intl/en/scholar/about.html",
            "https://scholar.google.com/intl/en/scholar/help.html",
            "https://policies.google.com/terms?hl=en-US",
            "https://scholar.google.com/?hl=zh-CN"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "GS"
    },
    {
        "id": "tunein",
        "name": "TuneIn",
        "url": "https://tunein.com/",
        "company": "TuneIn, Inc.",
        "country": "US",
        "categories": [
            "media"
        ],
        "description": {
            "zh": "收听网络广播、播客、新闻和体育音频。",
            "en": "Listen to internet radio, podcasts, news and sports audio."
        },
        "tags": [
            "internet-radio",
            "podcasts",
            "live-audio"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "zh": "提供免费收听和 Premium 订阅；内容、广告和权益依地区及方案而异。",
            "en": "Free listening and a Premium subscription are available. Content, advertising and benefits vary by region and plan."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://tunein.com/about/",
            "https://tunein.com/premium/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "Tu"
    },
    {
        "id": "stack-exchange",
        "name": "Stack Exchange",
        "url": "https://stackexchange.com/",
        "company": "Stack Exchange, Inc.",
        "country": "US",
        "categories": [
            "social"
        ],
        "description": {
            "zh": "探索数学、摄影、烹饪等领域的专题问答社区。",
            "en": "Explore focused Q&A communities for mathematics, photography, cooking and more."
        },
        "tags": [
            "question-answer",
            "expert-communities"
        ],
        "pricing": "free",
        "pricingNote": {
            "zh": "公开问答社区免费；此分类不包含企业内部知识库或广告服务。",
            "en": "Public Q&A communities are free. This classification excludes enterprise knowledge products and advertising."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://stackexchange.com/",
            "https://meta.stackexchange.com/legal/terms-of-service/public"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "SE"
    },
    {
        "id": "ebay",
        "name": "eBay",
        "url": "https://www.ebay.com/",
        "company": "eBay Inc.",
        "country": "US",
        "categories": [
            "shopping"
        ],
        "description": {
            "zh": "浏览二手、翻新和收藏商品，比较竞拍与直接购买选项。",
            "en": "Browse pre-owned, refurbished and collectible goods through auctions and fixed-price listings."
        },
        "tags": [
            "secondhand",
            "refurbished",
            "collectibles",
            "auctions"
        ],
        "pricing": "not_applicable",
        "pricingNote": {
            "zh": "商品、运费及交易费用依刊登和站点规则而定；竞拍出价可能形成购买承诺。",
            "en": "Product prices, shipping and transaction fees depend on listings and site rules. Auction bids may create a purchase commitment."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.ebay.com/help/buying/buy-now/buying-works-ebay?id=4002",
            "https://www.ebayinc.com/impact/sustainable-commerce/",
            "https://www.ebayinc.com/company/contact-us/",
            "https://www.ebay.com/help/buying/buy-now/buy-now?id=4003"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "eB"
    },
    {
        "id": "rome2rio",
        "name": "Rome2Rio",
        "url": "https://www.rome2rio.com/",
        "company": "Rome2Rio Pty Ltd",
        "country": "AU",
        "categories": [
            "travel"
        ],
        "description": {
            "zh": "比较火车、巴士、飞机和轮渡等组合出行路线。",
            "en": "Compare journeys combining trains, buses, flights, ferries and other transport."
        },
        "tags": [
            "route-planning",
            "public-transport",
            "multimodal-travel"
        ],
        "pricing": "unknown",
        "pricingNote": {
            "zh": "路线搜索入口的独立定价未核验；交通票价、时刻及预订条件须向实际承运商确认。",
            "en": "Separate pricing for route search was not verified. Confirm fares, schedules and booking conditions with the transport provider."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.rome2rio.com/about/",
            "https://www.rome2rio.com/company-disclosure/"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "R2"
    },
    {
        "id": "17track",
        "name": "17TRACK",
        "url": "https://www.17track.net/",
        "company": "17TRACK",
        "country": "unknown",
        "categories": [
            "lifestyle"
        ],
        "description": {
            "zh": "集中查询多个承运商的包裹物流状态。",
            "en": "Check package tracking updates across multiple carriers."
        },
        "tags": [
            "package-tracking",
            "shipping-status"
        ],
        "pricing": "freemium",
        "pricingNote": {
            "zh": "日常小中量包裹查询免费；批量查询、商家集成及 API 有独立方案与限制，不代表承运或退款服务。",
            "en": "Small-to-medium consumer tracking is free. Bulk tracking, merchant integrations and API access have separate plans and limits; this is not a shipping or refund service."
        },
        "language": "unknown",
        "signup": "unknown",
        "sources": [
            "https://www.17track.net/en/about",
            "https://help.17track.net/hc/en-us/articles/4687259231897-Who-are-we-and-why-is-it-important-to-you-A-letter-from-17TRACK",
            "https://www.17track.net/privacy-zh-cn.html"
        ],
        "verifiedOn": "2026-10-12",
        "icon": "17"
    },
    {
        "verifiedOn": "2026-10-12",
        "language": "unknown",
        "signup": "unknown",
        "id": "phet",
        "name": "PhET Interactive Simulations",
        "url": "https://phet.colorado.edu/",
        "company": "University of Colorado Boulder",
        "country": "US",
        "categories": [
            "learning"
        ],
        "tags": [
            "science-simulations",
            "physics",
            "chemistry"
        ],
        "description": {
            "zh": "通过交互模拟探索物理、化学、生物等科学概念。",
            "en": "Explore scientific concepts through interactive physics, chemistry and biology simulations."
        },
        "pricing": "free",
        "pricingNote": {
            "zh": "网站科学与数学模拟免费；此分类仅指网站模拟，不代表其他产品或授权用途。",
            "en": "Science and math simulations on the website are free. This classification covers website simulations only."
        },
        "icon": "Ph",
        "sources": [
            "https://phet.colorado.edu/?locales=en",
            "https://www.colorado.edu/csl/programs/phet-interactive-simulations",
            "https://phet.colorado.edu/en/about",
            "https://phet.colorado.edu/en/about/contact"
        ]
    },
    {
        "verifiedOn": "2026-10-12",
        "language": "unknown",
        "signup": "unknown",
        "id": "wave",
        "name": "WAVE",
        "url": "https://wave.webaim.org/",
        "company": "WebAIM / Utah State University",
        "country": "US",
        "categories": [
            "development",
            "design"
        ],
        "tags": [
            "accessibility-testing",
            "web-accessibility"
        ],
        "description": {
            "zh": "检查网页中的无障碍问题，并提供可视化反馈。",
            "en": "Evaluate web accessibility issues with visual feedback on the page."
        },
        "pricing": "free",
        "pricingNote": {
            "zh": "在线评估免费；提交的网址与内容由 WAVE 服务器处理。API 等服务另有方案；自动检查不能替代完整人工评估。",
            "en": "The online evaluator is free; submitted URLs and content are processed by WAVE servers. APIs have separate offerings; automated checks do not replace a complete human evaluation."
        },
        "icon": "WA",
        "sources": [
            "https://wave.webaim.org/",
            "https://wave.webaim.org/about",
            "https://wave.webaim.org/terms"
        ]
    },
    {
        "verifiedOn": "2026-10-12",
        "language": "unknown",
        "signup": "unknown",
        "id": "onet-online",
        "name": "O*NET OnLine",
        "url": "https://www.onetonline.org/",
        "company": "National Center for O*NET Development",
        "country": "US",
        "categories": [
            "careers"
        ],
        "tags": [
            "career-exploration",
            "occupation-skills"
        ],
        "description": {
            "zh": "查询美国职业的技能、任务与教育要求，辅助职业探索。",
            "en": "Explore U.S. occupations through their skills, tasks and education requirements."
        },
        "pricing": "free",
        "pricingNote": {
            "zh": "官方职业信息数据库与职业探索工具免费开放；内容以美国职业体系为主。",
            "en": "The occupational database and career exploration tool are free; information focuses on the U.S. occupational system."
        },
        "icon": "ON",
        "sources": [
            "https://www.onetonline.org/",
            "https://www.onetonline.org/help/onet/",
            "https://www.onetcenter.org/overview.html",
            "https://www.onetcenter.org/dl_files/desk_aid.pdf",
            "https://www.onetcenter.org/contact.html"
        ]
    },
    {
        "verifiedOn": "2026-10-12",
        "language": "unknown",
        "signup": "unknown",
        "id": "we-work-remotely",
        "name": "We Work Remotely",
        "url": "https://weworkremotely.com/",
        "company": "We Work Remotely Ltd.",
        "country": "unknown",
        "categories": [
            "careers"
        ],
        "tags": [
            "remote-jobs",
            "job-search"
        ],
        "description": {
            "zh": "按职业类别查找远程职位，并查看岗位地区要求。",
            "en": "Find remote roles by job category and review each position's location requirements."
        },
        "pricing": "freemium",
        "pricingNote": {
            "zh": "Basic 免费；Pro 和 TopAccess 按年度承诺收费，取消后仍须付清当期费用。岗位资格与地区限制以招聘说明为准。",
            "en": "Basic is free; Pro and TopAccess carry annual commitments, with remaining term payments due after cancellation. Eligibility and location restrictions depend on each listing."
        },
        "icon": "WR",
        "sources": [
            "https://weworkremotely.com/",
            "https://weworkremotely.com/frequently-asked-questions",
            "https://weworkremotely.com/terms-and-conditions"
        ]
    },
    {
        "verifiedOn": "2026-10-12",
        "language": "unknown",
        "signup": "unknown",
        "id": "google-dataset-search",
        "name": "Google Dataset Search",
        "url": "https://datasetsearch.research.google.com/",
        "company": "Google",
        "country": "unknown",
        "categories": [
            "search",
            "learning"
        ],
        "tags": [
            "dataset-search",
            "research-data"
        ],
        "description": {
            "zh": "跨多个数据仓库查找研究数据集及其来源说明。",
            "en": "Discover research datasets and their source descriptions across data repositories."
        },
        "pricing": "unknown",
        "pricingNote": {
            "zh": "官方帮助页说明数据集检索用途，但未提供独立定价说明；结果站点的数据访问条件与许可需分别确认。",
            "en": "Official help describes dataset discovery but gives no standalone pricing statement. Access conditions and licenses of linked datasets must be checked separately."
        },
        "icon": "GD",
        "sources": [
            "https://datasetsearch.research.google.com/",
            "https://datasetsearch.research.google.com/help",
            "https://research.google/blog/building-google-dataset-search-and-fostering-an-open-data-ecosystem/",
            "https://policies.google.com/terms?hl=en-US"
        ]
    },
    {
        "verifiedOn": "2026-10-12",
        "language": "unknown",
        "signup": "unknown",
        "id": "google-ads-transparency",
        "name": "Google Ads Transparency Center",
        "url": "https://adstransparency.google.com/",
        "company": "Google",
        "country": "unknown",
        "categories": [
            "marketing"
        ],
        "tags": [
            "ad-transparency",
            "advertiser-search"
        ],
        "description": {
            "zh": "按广告主或网站查询 Google 平台广告，并按日期等条件筛选。",
            "en": "Look up Google-platform ads by advertiser or website and filter by details such as date."
        },
        "pricing": "unknown",
        "pricingNote": {
            "zh": "官方说明提供可检索广告库，但未提供独立定价说明；查询展示不代表广告投放或效果数据服务。",
            "en": "Official documentation describes a searchable ad repository but gives no standalone pricing statement. Viewing disclosures is separate from ad buying or performance analytics."
        },
        "icon": "AT",
        "sources": [
            "https://adstransparency.google.com/",
            "https://support.google.com/adspolicy/answer/13733850?co=GENIE.CountryCode%3DGB&hl=en",
            "https://blog.google/innovation-and-ai/technology/ads/announcing-the-launch-of-the-new-ads-transparency-center/",
            "https://policies.google.com/terms?hl=en-US"
        ]
    },
    {
        "id": "usa-gov",
        "name": "USA.gov",
        "url": "https://www.usa.gov/",
        "company": "U.S. General Services Administration",
        "country": "US",
        "categories": [
            "public-services"
        ],
        "tags": [
            "government-information",
            "public-service-guides"
        ],
        "searchAliases": [
            "USA gov",
            "USAGov"
        ],
        "description": {
            "en": "Find U.S. government agencies, benefits and public-service information, with links to the responsible services.",
            "zh": "查询美国政府机构、福利与公共服务信息，并找到对应办理入口。"
        },
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "A government information guide with free government-question assistance; application requirements, eligibility and fees depend on the responsible agency.",
            "zh": "提供美国政府信息指南与免费政务问题咨询；具体事项的申请要求、资格及费用以办理机构说明为准。"
        },
        "icon": "US",
        "sources": [
            "https://www.usa.gov/about",
            "https://www.usa.gov/privacy-security"
        ],
        "verifiedOn": "2026-10-12",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "ifixit",
        "name": "iFixit Repair Guides",
        "url": "https://www.ifixit.com/Guide",
        "company": "iFixit",
        "country": "US",
        "categories": [
            "lifestyle"
        ],
        "tags": [
            "repair-guides",
            "device-repair"
        ],
        "description": {
            "en": "Find step-by-step repair guides for phones, computers, appliances and everyday items.",
            "zh": "查找手机、电脑、家电及日用品的分步维修指南。"
        },
        "pricing": "free",
        "pricingNote": {
            "en": "Repair guides are free to read; tools and parts in the store are paid products. Other services have their own terms; repair results are not guaranteed.",
            "zh": "维修指南免费阅读；商店中的工具与零件另行收费。其他服务以各自条款为准，不保证维修结果。"
        },
        "icon": "IF",
        "sources": [
            "https://www.ifixit.com/",
            "https://www.ifixit.com/Guide",
            "https://www.ifixit.com/Info/Privacy",
            "https://www.ifixit.com/Info/Terms_of_Use"
        ],
        "verifiedOn": "2026-10-12",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "lichess",
        "name": "Lichess",
        "url": "https://lichess.org/",
        "company": "Lichess.org",
        "country": "FR",
        "categories": [
            "games"
        ],
        "tags": [
            "online-chess",
            "chess-practice"
        ],
        "description": {
            "en": "Play, practice and learn chess in your browser.",
            "zh": "在浏览器中进行国际象棋对弈、练习与学习。"
        },
        "pricing": "free",
        "pricingNote": {
            "en": "Free with no ads; donations are voluntary. The privacy policy still describes data processing, including IP addresses, session cookies and account data.",
            "zh": "免费且无广告，捐赠自愿；隐私政策仍说明 IP 地址、会话 Cookie 与账户数据等信息处理。"
        },
        "icon": "LC",
        "sources": [
            "https://lichess.org/about",
            "https://lichess.org/privacy",
            "https://lichess.org/terms-of-service"
        ],
        "verifiedOn": "2026-10-12",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "buffer",
        "name": "Buffer",
        "url": "https://buffer.com/",
        "company": "Buffer, Inc.",
        "country": "US",
        "categories": [
            "marketing"
        ],
        "tags": [
            "social-scheduling",
            "social-publishing"
        ],
        "description": {
            "en": "Plan social-media content and manage publishing schedules with post scheduling across accounts.",
            "zh": "规划多个社交媒体账号的内容，管理帖子排期与定时发布。"
        },
        "pricing": "freemium",
        "pricingNote": {
            "en": "Free supports up to 3 channels, 10 simultaneously queued posts per channel and 1 user; this is not a monthly post allowance. Paid plans expand limits and are billed by channel. Connecting social accounts grants access and involves data processing.",
            "zh": "免费版最多支持 3 个频道、每频道同时排期 10 条帖子和 1 个用户，并非每月仅 10 条。付费版提高额度并按频道计费；连接社媒账号会授予访问权限并涉及数据处理。"
        },
        "icon": "BF",
        "sources": [
            "https://buffer.com/pricing",
            "https://buffer.com/legal#terms",
            "https://buffer.com/legal#privacy-policy"
        ],
        "verifiedOn": "2026-10-12",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "ezgif",
        "name": "Ezgif",
        "url": "https://ezgif.com/",
        "company": "Open Idea",
        "country": "LV",
        "categories": [
            "utilities",
            "design",
            "media"
        ],
        "tags": [
            "gif-editing",
            "animated-images",
            "image-formats"
        ],
        "description": {
            "en": "Create, crop and optimize GIF animations, and convert animated images and videos.",
            "zh": "制作、裁剪和优化 GIF 动画，编辑动图并转换图片与视频格式。"
        },
        "pricing": "free",
        "pricingNote": {
            "en": "Free tools, including for commercial use, supported by advertising; individual tools have file-size limits. Files are uploaded to servers and retained for up to 1 hour after last use; avoid sensitive media.",
            "zh": "工具免费，含商业用途；网站通过广告支持，各工具有文件大小限制。文件上传至服务器，最后使用后最多保留 1 小时；勿上传敏感素材。"
        },
        "icon": "EZ",
        "sources": [
            "https://ezgif.com/about",
            "https://ezgif.com/help/commercial-use",
            "https://ezgif.com/privacy"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "cloudconvert",
        "name": "CloudConvert",
        "url": "https://cloudconvert.com/",
        "company": "Lunaweb GmbH",
        "country": "DE",
        "categories": [
            "utilities",
            "office",
            "media"
        ],
        "tags": [
            "file-conversion",
            "image-formats"
        ],
        "description": {
            "en": "Convert document, image, audio and video file formats.",
            "zh": "转换文档、图片、音频和视频等文件格式。"
        },
        "pricing": "freemium",
        "pricingNote": {
            "en": "The free plan includes 10 credits per day, a 1 GB file limit and a processing limit of 5 minutes; some conversions use multiple credits. One-time credit packages and monthly subscriptions are available. Files are uploaded to servers; the privacy policy specifies automatic deletion within 24 hours. Avoid sensitive files.",
            "zh": "免费版每日 10 个积分，单文件上限 1 GB、处理时长上限 5 分钟；部分转换消耗多个积分。另有一次性积分包和按月订阅。文件上传至服务器，隐私政策规定最迟 24 小时自动删除；勿上传敏感文件。"
        },
        "icon": "CC",
        "sources": [
            "https://cloudconvert.com/about",
            "https://cloudconvert.com/pricing",
            "https://cloudconvert.com/privacy"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "audiomass",
        "name": "AudioMass",
        "url": "https://audiomass.co/",
        "company": "Pantelis Kalogiros / AudioMass",
        "country": "unknown",
        "categories": [
            "media",
            "utilities"
        ],
        "tags": [
            "audio-editing",
            "audio-effects"
        ],
        "description": {
            "en": "Trim audio, adjust volume, apply effects and mix tracks in a waveform editor.",
            "zh": "在波形编辑器中剪辑音频、调整音量、添加效果和混音。"
        },
        "pricing": "free",
        "pricingNote": {
            "en": "Free and open source. Audio editing runs locally in the browser without a backend; edited files are not uploaded for processing. It can work offline after loading, subject to browser and device resources. Recording requires microphone permission; local editing does not imply that visiting the site collects no data.",
            "zh": "免费开源；音频编辑在浏览器本地运行，无需后端，编辑文件不上传处理。页面加载后可离线使用，受浏览器和设备资源限制。录音需要麦克风权限；本地编辑不等于访问网站完全不收集数据。"
        },
        "icon": "AM",
        "sources": [
            "https://audiomass.co/about.html",
            "https://github.com/pkalogiros/AudioMass",
            "https://github.com/pkalogiros/AudioMass/blob/production/LICENSE"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "google-maps",
        "name": "Google Maps",
        "url": "https://www.google.com/maps/",
        "company": "Google",
        "country": "unknown",
        "categories": [
            "travel",
            "lifestyle"
        ],
        "tags": [
            "maps",
            "places",
            "route-planning"
        ],
        "description": {
            "en": "Find places, plan routes and organize travel lists with Google Maps.",
            "zh": "使用谷歌地图查询地点、规划路线并整理出行地点清单。"
        },
        "pricing": "free",
        "pricingNote": {
            "en": "The consumer Maps service is free to use; mobile carriers may charge for data. The developer platform and API are separate billed products. Location and activity retention depends on permissions and account settings; features vary by region. The service operator also depends on the user’s region, so operator location remains unknown.",
            "zh": "消费者地图服务免费使用；移动数据可能由运营商收费。开发者平台和 API 是另行计费产品。位置与活动数据的保存取决于权限和账号设置，功能因地区而异。服务运营主体也取决于用户地区，因此运营方所在地保留未知。"
        },
        "icon": "GM",
        "sources": [
            "https://www.google.com/maps/about/",
            "https://support.google.com/maps/answer/3096703?hl=en",
            "https://support.google.com/maps/answer/10400210?hl=en",
            "https://policies.google.com/terms?hl=en-US"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "project-gutenberg",
        "name": "Project Gutenberg",
        "url": "https://www.gutenberg.org/",
        "company": "Project Gutenberg Literary Archive Foundation",
        "country": "US",
        "categories": [
            "learning"
        ],
        "tags": [
            "ebooks",
            "books"
        ],
        "description": {
            "en": "Read classic literature and historical e-books from Project Gutenberg.",
            "zh": "在古腾堡计划阅读文学经典和历史文本电子书。"
        },
        "pricing": "free",
        "pricingNote": {
            "en": "Ebooks are free. Copyright assessments follow United States law; users outside the US should check local copyright rules and each book's license. This is not a guarantee that every book is public domain worldwide.",
            "zh": "电子书免费。版权判断以美国法律为基础；美国以外用户应核对所在地版权规则和各书许可，不代表全部电子书在全球均属公版。"
        },
        "icon": "PG",
        "sources": [
            "https://www.gutenberg.org/about/",
            "https://www.gutenberg.org/about/contact_information.html",
            "https://www.gutenberg.org/policy/terms_of_use.html",
            "https://www.gutenberg.org/policy/license"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "smithsonian-open-access",
        "name": "Smithsonian Open Access",
        "url": "https://www.si.edu/openaccess",
        "company": "Smithsonian Institution",
        "country": "US",
        "categories": [
            "learning"
        ],
        "tags": [
            "cultural-collections",
            "image"
        ],
        "description": {
            "en": "Explore digitized museum collections, images, 3D models and open data.",
            "zh": "探索史密森尼博物馆文化馆藏、图像、三维模型和开放数据。"
        },
        "pricing": "free",
        "pricingNote": {
            "en": "Only CC0-designated collection assets are offered for free reuse under CC0. Other items have separate conditions; CC0 does not automatically clear trademarks, publicity, privacy or third-party rights. Check the license for each resource.",
            "zh": "仅标注 CC0 的馆藏数字资源可依据 CC0 免费复用。其他项目有各自条件；商标、肖像、隐私及第三方权利不因 CC0 自动获准，请核对每项资源的许可。"
        },
        "icon": "SI",
        "sources": [
            "https://www.si.edu/openaccess",
            "https://www.si.edu/openaccess/faq",
            "https://www.si.edu/termsofuse",
            "https://www.si.edu/contacts",
            "https://www.si.edu/museums/smithsonian-institution-building"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "openlearn",
        "name": "OpenLearn",
        "url": "https://www.open.edu/openlearn/",
        "company": "The Open University",
        "country": "GB",
        "categories": [
            "learning"
        ],
        "tags": [
            "open-courseware",
            "academic-subjects",
            "online-courses"
        ],
        "description": {
            "en": "Study free short courses and open learning materials across subjects from The Open University.",
            "zh": "学习英国开放大学的跨学科免费短课程和开放学习资料。"
        },
        "pricing": "free",
        "pricingNote": {
            "en": "OpenLearn courses are free to browse without an account. An account is needed to save progress and earn participation statements, which do not carry formal qualification credit. Reuse follows non-commercial licensing and item-specific restrictions; check the current license.",
            "zh": "OpenLearn 课程免费，免账号即可浏览；保存进度和领取参与证明需账号，证明不计正式学历学分。资料复用须遵守非商业许可及个别内容限制，请核对当前许可。"
        },
        "icon": "OL",
        "sources": [
            "https://www.open.edu/openlearn/get-started-openlearn",
            "https://www.open.edu/openlearn/about-openlearn/frequently-asked-questions-on-openlearn",
            "https://university.open.ac.uk/open-educational-resources/openlearn/free-courses",
            "https://about.open.ac.uk/strategy-and-policies/policies-and-statements/copyright-openlearn",
            "https://about.open.ac.uk/locations/milton-keynes-campus"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "british-council-learnenglish",
        "name": "British Council LearnEnglish",
        "url": "https://learnenglish.britishcouncil.org/",
        "company": "British Council",
        "country": "GB",
        "categories": [
            "learning"
        ],
        "tags": [
            "english-learning",
            "learning-resources"
        ],
        "description": {
            "en": "Practise English listening, reading, grammar and vocabulary by language level.",
            "zh": "按语言水平学习英语，练习听读、语法和词汇。"
        },
        "pricing": "freemium",
        "pricingNote": {
            "en": "Learning materials are free without an account; separate courses are paid. The former LearnEnglish subscription no longer accepts new subscribers. Community participation and level tests require an account; community features may share text, recordings or photos. Check the site's terms before reusing content.",
            "zh": "学习资料免费且无需账号；另有独立付费课程。原 LearnEnglish 订阅已停止接收新订户。社区及水平测试需账号，社区功能可能分享文字、录音或图片；复用内容前请核对官网许可。"
        },
        "icon": "BC",
        "sources": [
            "https://learnenglish.britishcouncil.org/",
            "https://learnenglish.britishcouncil.org/frequently-asked-questions",
            "https://www.britishcouncil.org/about-us",
            "https://www.britishcouncil.org/terms"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "cfpb-consumer-resources",
        "name": "CFPB Consumer Resources",
        "url": "https://www.consumerfinance.gov/consumer-tools/",
        "company": "Consumer Financial Protection Bureau",
        "country": "US",
        "categories": [
            "finance",
            "public-services"
        ],
        "tags": [
            "personal-finance",
            "financial-education"
        ],
        "searchAliases": [
            "CFPB",
            "Consumer Financial Protection Bureau"
        ],
        "description": {
            "en": "Read consumer guides about credit, borrowing, banking and major financial decisions in the United States.",
            "zh": "阅读美国信用、借贷、银行服务及重大财务决策的消费者指南。"
        },
        "pricing": "free",
        "pricingNote": {
            "en": "The consumer educational information and tools are free. Guidance focuses on the United States; linked financial products have their own fees and eligibility rules. Educational resources are not personalized financial or legal advice.",
            "zh": "消费者教育资料和工具免费。内容以美国制度为主；链接中的金融产品另有费用和资格要求。教育资料不等于针对个人的财务或法律建议。"
        },
        "icon": "CF",
        "sources": [
            "https://www.consumerfinance.gov/consumer-tools/",
            "https://www.consumerfinance.gov/about-us/",
            "https://www.consumerfinance.gov/about-us/contact-us/",
            "https://www.consumerfinance.gov/archive/blog/you-have-the-right-to-free-unbiased-financial-information/",
            "https://www.consumerfinance.gov/privacy/website-privacy-policy/"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "ftc-shopping-guides",
        "name": "FTC Shopping Guides",
        "url": "https://consumer.ftc.gov/shopping-and-donating/shopping",
        "company": "Federal Trade Commission",
        "country": "US",
        "categories": [
            "shopping",
            "public-services"
        ],
        "tags": [
            "shopping-guides",
            "scam-awareness"
        ],
        "searchAliases": [
            "FTC",
            "Federal Trade Commission"
        ],
        "description": {
            "en": "Read guides on online shopping, product reviews, returns, warranties and recognizing shopping scams.",
            "zh": "阅读网购、商品评价、退换货、保修及购物诈骗识别指南。"
        },
        "pricing": "free",
        "pricingNote": {
            "en": "Consumer education materials are free. Legal rights and remedies described mainly concern the United States; rules elsewhere may differ. This entry opens reading resources, not a purchase or complaint-submission service.",
            "zh": "消费者教育资料免费。所述法律权利和救济主要适用于美国，其他地区规则可能不同。此入口提供阅读资料，不直接购物或提交投诉。"
        },
        "icon": "FT",
        "sources": [
            "https://consumer.ftc.gov/shopping-and-donating/shopping",
            "https://consumer.ftc.gov/share-our-resources",
            "https://www.ftc.gov/about-ftc/contact"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "board-game-arena",
        "name": "Board Game Arena",
        "url": "https://boardgamearena.com/",
        "company": "AD2G Studio SAS",
        "country": "FR",
        "categories": [
            "games"
        ],
        "tags": [
            "online-board-games",
            "multiplayer-games"
        ],
        "searchAliases": [
            "BGA",
            "BoardGameArena"
        ],
        "description": {
            "en": "Play board games online with other players in your browser.",
            "zh": "在浏览器中与其他玩家进行在线桌游。"
        },
        "pricing": "freemium",
        "pricingNote": {
            "en": "Free accounts can play non-Premium games. Starting a Premium game table requires a Premium member, who can invite free members. Paid plans add features, including same-device play. Accounts and public game activity involve personal-data processing; subscription renewal conditions apply.",
            "zh": "免费账号可玩非 Premium 游戏。Premium 游戏开桌需至少一名付费会员，可邀请免费玩家加入。付费版另有同设备多人游戏等功能。账号及公开对局活动涉及个人信息处理，订阅有续费条件。"
        },
        "icon": "BG",
        "sources": [
            "https://boardgamearena.com/",
            "https://en.boardgamearena.com/legal?section=legal",
            "https://en.boardgamearena.com/premium"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "alltrails",
        "name": "AllTrails",
        "url": "https://www.alltrails.com/",
        "company": "AllTrails, LLC",
        "country": "US",
        "categories": [
            "travel",
            "lifestyle"
        ],
        "tags": [
            "hiking-trails",
            "route-planning"
        ],
        "description": {
            "en": "Discover hiking and outdoor trails, compare route details and organize trails for future trips.",
            "zh": "查找徒步及户外步道，比较路线信息并整理出行清单。"
        },
        "pricing": "freemium",
        "pricingNote": {
            "en": "Base membership is free. Plus and Peak are paid plans; offline map downloads require a paid plan. Some navigation features are app-only. Trials can convert to renewing subscriptions. Trail information is not a guarantee of current conditions or safety.",
            "zh": "Base 会员免费；Plus 和 Peak 为付费方案，离线地图下载需付费版。部分导航功能仅限应用内使用。试用可能转为自动续费订阅；路线资料不保证实时路况或户外安全。"
        },
        "icon": "AT",
        "sources": [
            "https://www.alltrails.com/",
            "https://support.alltrails.com/hc/en-us/articles/37202982202900-AllTrails-Base-membership",
            "https://www.alltrails.com/plans",
            "https://www.alltrails.com/terms"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "inoreader",
        "name": "Inoreader",
        "url": "https://www.inoreader.com/",
        "company": "Innologica Ltd",
        "country": "BG",
        "categories": [
            "news",
            "office"
        ],
        "tags": [
            "rss-reader",
            "read-later"
        ],
        "searchAliases": [
            "RSS 阅读器"
        ],
        "description": {
            "en": "Follow RSS feeds and organize articles from websites, blogs and other sources in one reading hub.",
            "zh": "订阅网站、博客等来源的 RSS，在统一阅读入口整理文章。"
        },
        "pricing": "freemium",
        "pricingNote": {
            "en": "The free account supports up to 150 RSS feeds. Paid plans expand limits and add monitoring and automation features. A personal feed collection requires an account; paid subscriptions renew automatically unless canceled. Source publishers may apply their own access rules.",
            "zh": "免费账号最多订阅150个 RSS 源；付费方案提高额度并增加监测和自动化功能。个人订阅集合需要账号；付费订阅默认自动续费，需自行取消。原内容发布方可能另设访问条件。"
        },
        "icon": "IN",
        "sources": [
            "https://www.inoreader.com/",
            "https://www.inoreader.com/pricing",
            "https://www.inoreader.com/tos",
            "https://www.inoreader.com/privacy_policy"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "hacker-news",
        "name": "Hacker News",
        "url": "https://news.ycombinator.com/",
        "company": "Y Combinator Management, LLC",
        "country": "US",
        "categories": [
            "news",
            "social"
        ],
        "tags": [
            "technology-news",
            "discussions"
        ],
        "searchAliases": [
            "HN",
            "黑客新闻"
        ],
        "description": {
            "en": "Browse community-submitted links and discussions about technology, startups and other topics.",
            "zh": "浏览社区分享的科技、创业及其他话题链接与讨论。"
        },
        "pricing": "free",
        "pricingNote": {
            "en": "Public listings and discussions can be read without payment or an account. Participation uses an account and is subject to community rules and feature thresholds. Linked publishers may have paywalls; free browsing here does not include access to every linked article.",
            "zh": "公开列表和讨论可免付费、免登录阅读。参与互动使用账号，并受社区规则和功能门槛限制。外链发布方可能设有付费墙；本站免费浏览不等于所有外链文章免费。"
        },
        "icon": "HN",
        "sources": [
            "https://news.ycombinator.com/",
            "https://news.ycombinator.com/newsfaq.html",
            "https://news.ycombinator.com/login?goto=news",
            "https://www.ycombinator.com/legal/"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "mastodon",
        "name": "Mastodon",
        "url": "https://joinmastodon.org/",
        "company": "Mastodon GmbH",
        "country": "DE",
        "categories": [
            "social"
        ],
        "tags": [
            "federated-social",
            "communities"
        ],
        "searchAliases": [
            "长毛象"
        ],
        "description": {
            "en": "Explore a federated social network and find independently operated servers for sharing posts and following people.",
            "zh": "了解联邦式社交网络，查找独立运营的服务器，用于分享动态和关注他人。"
        },
        "pricing": "free",
        "pricingNote": {
            "en": "The software and public project directory are free. Joining the network requires an account on a chosen server. Independent servers set their own registration policies, terms and any charges; self-hosting and optional donations are outside this free classification.",
            "zh": "软件及公开项目目录免费。加入网络需在选定服务器注册账号。独立服务器自行规定注册方式、条款及可能的费用；自建服务器成本和自愿捐款不包含在此免费分类内。"
        },
        "icon": "MA",
        "sources": [
            "https://joinmastodon.org/",
            "https://joinmastodon.org/about",
            "https://docs.joinmastodon.org/user/signup/"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "moe-concised-dictionary",
        "name": "教育部《國語辭典簡編本》",
        "url": "https://dict.concised.moe.edu.tw/",
        "company": "國家教育研究院（教育部國語辭典）",
        "country": "TW",
        "categories": [
            "learning",
            "utilities"
        ],
        "tags": [
            "chinese-dictionary",
            "pronunciation",
            "language-learning"
        ],
        "searchAliases": [
            "国语辞典简编本",
            "國語辭典",
            "国语辞典",
            "中文词典",
            "Concised Mandarin Chinese Dictionary"
        ],
        "description": {
            "en": "Look up modern Mandarin meanings, pronunciations and examples using phonetic and radical indexes.",
            "zh": "查阅现代汉语字词释义、读音与例句，支持注音、拼音和部首检索。"
        },
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "An official public dictionary. Learning notes require an account. It primarily uses Traditional Chinese and Taiwan Mandarin; reuse is subject to licensing terms.",
            "zh": "官方公开辞典查询入口；学习笔记需账号。以繁体中文及台湾国语用法为主；内容再利用须遵守授权条件。"
        },
        "icon": "辞典",
        "sources": [
            "https://dict.concised.moe.edu.tw/",
            "https://dict.concised.moe.edu.tw/search.jsp?md=1",
            "https://dict.concised.moe.edu.tw/note.jsp",
            "https://www.naer.edu.tw/PageMenu?fid=60",
            "https://www.naer.edu.tw/PageDoc/Detail?fid=126&id=3727",
            "https://www.naer.edu.tw/PageFaq"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "china-consular-services",
        "name": "中国领事服务网",
        "url": "https://cs.mfa.gov.cn/",
        "company": "中华人民共和国外交部领事司",
        "country": "CN",
        "categories": [
            "travel",
            "public-services"
        ],
        "tags": [
            "travel-advisories",
            "destination-guides",
            "consular-guidance"
        ],
        "searchAliases": [
            "中国领事",
            "领事服务",
            "领事保护",
            "China Consular Services"
        ],
        "description": {
            "en": "Read overseas travel advisories, destination risks and passport, visa and consular-assistance guidance.",
            "zh": "查阅海外出行安全提醒、目的地风险与护照、签证和领事保护指南。"
        },
        "pricing": "not_applicable",
        "pricingNote": {
            "en": "Public guidance is openly readable. Applications may require a verified account, documents and fees; eligibility varies by nationality, destination and consulate.",
            "zh": "公开信息可直接查阅；实际办证可能需实名账号、材料与费用，适用条件因国籍、目的地和使领馆而异。"
        },
        "icon": "领事",
        "sources": [
            "https://cs.mfa.gov.cn/",
            "https://cs.mfa.gov.cn/gylsx/",
            "https://cs.mfa.gov.cn/zggmcgx/hzlxz_149470/",
            "https://www.mfa.gov.cn/web/xglj/zylj/"
        ],
        "verifiedOn": "2026-10-13",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "datawrapper",
        "name": "Datawrapper",
        "url": "https://www.datawrapper.de/",
        "company": "Datawrapper GmbH",
        "country": "DE",
        "categories": [
            "design",
            "office"
        ],
        "tags": [
            "data-visualization",
            "charts",
            "map-visualization"
        ],
        "pricing": "freemium",
        "description": {
            "en": "Create interactive charts, maps and tables for reports, articles and websites.",
            "zh": "为报告、文章和网站制作交互式图表、地图与表格。"
        },
        "pricingNote": {
            "en": "The free plan supports publishing, embedding and PNG downloads with attribution. Paid plans add PDF/SVG export, attribution removal and team features; API usage beyond included free allowances is billed separately.",
            "zh": "免费版支持发布、嵌入和 PNG 下载，需保留署名；付费版增加 PDF/SVG 导出、移除署名与团队功能，API 超出免费额度后另计。"
        },
        "sources": [
            "https://www.datawrapper.de/",
            "https://www.datawrapper.de/pricing",
            "https://www.datawrapper.de/imprint"
        ],
        "verifiedOn": "2026-10-13",
        "searchAliases": [
            "数据包装器"
        ],
        "icon": "DW",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "wikimedia-commons",
        "name": "Wikimedia Commons",
        "url": "https://commons.wikimedia.org/",
        "company": "Wikimedia Foundation",
        "country": "US",
        "categories": [
            "design",
            "search",
            "learning"
        ],
        "tags": [
            "media-assets",
            "open-licensed-media"
        ],
        "pricing": "free",
        "description": {
            "en": "Find educational images, audio and video with public-domain or open-license information.",
            "zh": "查找教育用途的图片、音频与视频，并查看公有领域或开放许可说明。"
        },
        "pricingNote": {
            "en": "Browsing and downloading are free. Reuse must follow each file’s license and applicable rights; attribution or share-alike conditions may apply.",
            "zh": "浏览与下载免费；再利用需遵守每个文件的许可及相关权利要求，可能需要署名或以相同方式共享。"
        },
        "sources": [
            "https://commons.wikimedia.org/wiki/Commons:Welcome",
            "https://wikimediafoundation.org/contact/"
        ],
        "verifiedOn": "2026-10-13",
        "searchAliases": [
            "维基共享资源"
        ],
        "icon": "WC",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "worldcat",
        "name": "WorldCat.org",
        "url": "https://search.worldcat.org/",
        "company": "OCLC",
        "country": "US",
        "categories": [
            "search",
            "learning"
        ],
        "tags": [
            "library-search",
            "books",
            "citations"
        ],
        "pricing": "free",
        "description": {
            "en": "Find books and other library materials, compare editions and locate libraries that hold them.",
            "zh": "检索图书等馆藏资料、比较版本，并查找收藏它们的图书馆。"
        },
        "pricingNote": {
            "en": "Public catalog search is free; some features require sign-in. Borrowing, full-text access and purchases depend on the holding library or content provider.",
            "zh": "公开目录检索免费；部分功能需登录，借阅、全文访问或购买条件由馆藏图书馆或内容提供方决定。"
        },
        "sources": [
            "https://search.worldcat.org/",
            "https://www.oclc.org/en/worldcat-org.html",
            "https://www.oclc.org/en/annual-report/2025/home.html",
            "https://policies.oclc.org/en/terms/worldcatorg.html",
            "https://help.oclc.org/Discovery_and_Reference/WorldCat-org/Search/Search_WorldCat_org/20Work_with_search_results"
        ],
        "verifiedOn": "2026-10-13",
        "searchAliases": [
            "全球图书馆目录",
            "世界图书馆目录"
        ],
        "icon": "WL",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "typst",
        "name": "Typst",
        "url": "https://typst.app/",
        "company": "Typst GmbH",
        "country": "DE",
        "categories": [
            "office",
            "learning"
        ],
        "tags": [
            "typesetting",
            "academic-writing",
            "collaboration"
        ],
        "pricing": "freemium",
        "description": {
            "en": "Write and collaboratively typeset technical documents, papers and reports with markup.",
            "zh": "通过标记语言编写并协作排版技术文档、论文与报告。"
        },
        "pricingNote": {
            "en": "A free web plan includes editing and collaboration with storage and file limits. Paid plans add comments, integrations and more capacity; the open-source compiler is free.",
            "zh": "网页免费版包含编辑与协作，有存储和文件数量限制；付费版增加评论、集成与容量，开源编译器免费。"
        },
        "sources": [
            "https://typst.app/",
            "https://typst.app/pricing/",
            "https://typst.app/legal/"
        ],
        "verifiedOn": "2026-10-13",
        "searchAliases": [],
        "icon": "TY",
        "language": "unknown",
        "signup": "unknown"
    },
    {
        "id": "pdf24-tools",
        "name": "PDF24 Tools",
        "url": "https://tools.pdf24.org/en/",
        "company": "geek software GmbH",
        "country": "DE",
        "categories": [
            "utilities",
            "office"
        ],
        "tags": [
            "pdf",
            "pdf-ocr",
            "pdf-comparison"
        ],
        "pricing": "free",
        "description": {
            "en": "Recognize text in scanned PDFs, compare PDF files and use other document-processing tools.",
            "zh": "识别扫描 PDF 中的文字、比较 PDF 文件，并使用其他文档处理工具。"
        },
        "pricingNote": {
            "en": "PDF tools are free for personal and business use, funded by advertising. Some online tools upload files; the comparison tool runs in the browser, and Windows Creator can work offline.",
            "zh": "PDF 工具对个人与企业免费，由广告支持；部分在线工具会上传文件，对比工具在浏览器中运行，Windows Creator 可离线使用。"
        },
        "sources": [
            "https://tools.pdf24.org/en/",
            "https://tools.pdf24.org/en/ocr-pdf",
            "https://tools.pdf24.org/en/compare-pdf",
            "https://tools.pdf24.org/en/faq",
            "https://www.pdf24.org/de/impressum"
        ],
        "verifiedOn": "2026-10-13",
        "searchAliases": [],
        "icon": "PF",
        "language": "unknown",
        "signup": "unknown"
    }
];
    if (typeof module !== 'undefined' && module.exports) module.exports = sites;
    else root.LocalItabNavigationSites = sites;
})(typeof window === 'undefined' ? globalThis : window);
