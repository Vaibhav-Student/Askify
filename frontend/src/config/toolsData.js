/**
 * AI Provider and Model Integrations — Latest 2026 Catalog
 */

export const AI_TOOLS = [
    {
        id: 'nvidia',
        name: 'NVIDIA NIM',
        icon: '🟩',
        baseUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
        requiresKey: false,
        models: [
            { id: 'google/gemma-3n-e4b-it', name: 'Study AI', maxTokens: 8192, temperature: 1.0, capabilities: ['fast'] },
            { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6', maxTokens: 16384, temperature: 1.0, capabilities: ['fast', 'text'] },
        ]
    },
    {
        id: 'gemini',
        name: 'Google Gemini',
        icon: '✨',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
        requiresKey: true,
        models: [
            { id: 'gemini-3.1', name: 'Gemini 3.1 ✦', maxTokens: 2000000, temperature: 0.7, capabilities: ['multimodal', 'agentic'] },
            { id: 'gemini-3.0-pro', name: 'Gemini 3.0 Pro', maxTokens: 1000000, temperature: 0.7, capabilities: ['reasoning', 'coding'] },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', maxTokens: 1000000, temperature: 0.7, capabilities: ['fast', 'multimodal'] },
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash ✦', maxTokens: 1000000, temperature: 0.7, capabilities: ['text', 'vision', 'code', 'fast'] },
            { id: 'gemini-2.0-flash-thinking-exp-01-21', name: 'Gemini 2.0 Flash Thinking ✦', maxTokens: 1000000, temperature: 0.7, capabilities: ['reasoning', 'text'] },
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro ✦', maxTokens: 2000000, temperature: 0.7, capabilities: ['text', 'vision', 'code', 'reasoning'] },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', maxTokens: 1000000, temperature: 0.7, capabilities: ['text', 'vision', 'fast'] },
        ]
    },
    {
        id: 'openai',
        name: 'OpenAI',
        icon: '🧠',
        baseUrl: 'https://api.openai.com/v1/chat/completions',
        requiresKey: true,
        models: [
            { id: 'gpt-5.4', name: 'GPT-5.4 ✦', maxTokens: 1000000, temperature: 0.7, capabilities: ['reasoning', 'multimodal'] },
            { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', maxTokens: 128000, temperature: 0.2, capabilities: ['code', 'cybersecurity'] },
            { id: 'gpt-5.1-thinking', name: 'GPT-5.1 Thinking', maxTokens: 272000, temperature: 0.7, capabilities: ['advanced-reasoning'] },
            { id: 'o4-mini', name: 'o4 Mini', maxTokens: 128000, temperature: 1.0, capabilities: ['fast', 'reasoning'] },
            { id: 'o3-mini', name: 'o3 Mini ✦', maxTokens: 200000, temperature: 1.0, capabilities: ['text', 'reasoning', 'fast'] },
            { id: 'gpt-4o', name: 'GPT-4o', maxTokens: 128000, temperature: 0.7, capabilities: ['text', 'vision', 'code'] },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', maxTokens: 128000, temperature: 0.7, capabilities: ['text', 'vision', 'fast'] },
        ]
    },
    {
        id: 'anthropic',
        name: 'Anthropic Claude',
        icon: '🟠',
        baseUrl: 'https://api.anthropic.com/v1/messages',
        requiresKey: true,
        models: [
            { id: 'claude-5', name: 'Claude 5 ✦', maxTokens: 200000, temperature: 0.7, capabilities: ['reasoning', 'multimodal', 'agentic'] },
            { id: 'claude-4-6-sonnet', name: 'Claude 4.6 Sonnet', maxTokens: 1000000, temperature: 0.7, capabilities: ['text', 'code', 'vision'] },
            { id: 'claude-4-6-opus', name: 'Claude 4.6 Opus', maxTokens: 200000, temperature: 0.7, capabilities: ['complex-reasoning', 'agentic'] },
            { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet ✦', maxTokens: 200000, temperature: 0.7, capabilities: ['text', 'vision', 'code', 'reasoning'] },
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2', maxTokens: 200000, temperature: 0.7, capabilities: ['text', 'vision', 'code'] },
            { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', maxTokens: 200000, temperature: 0.7, capabilities: ['text', 'fast'] },
        ]
    },
    {
        id: 'groq',
        name: 'Groq',
        icon: '⚡',
        baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
        requiresKey: true,
        models: [
            { id: 'groq-compound', name: 'Groq Compound', maxTokens: 128000, temperature: 0.7, capabilities: ['search', 'execution'] },
            { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', maxTokens: 128000, temperature: 0.7, capabilities: ['text', 'code'] },
            { id: 'llama-3.1-405b-instruct', name: 'Llama 3.1 405B', maxTokens: 128000, temperature: 0.7, capabilities: ['extreme-logic'] },
            { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 Distill 70B', maxTokens: 131072, temperature: 0.7, capabilities: ['text', 'reasoning'] },
            { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', maxTokens: 32768, temperature: 0.7, capabilities: ['text', 'code'] },
        ]
    },
    {
        id: 'mistral',
        name: 'Mistral AI',
        icon: '🌀',
        baseUrl: 'https://api.mistral.ai/v1/chat/completions',
        requiresKey: true,
        models: [
            { id: 'mistral-large-3', name: 'Mistral Large 3', maxTokens: 256000, temperature: 0.7, capabilities: ['multimodal', 'agentic'] },
            { id: 'magistral-1-2', name: 'Magistral 1.2', maxTokens: 128000, temperature: 0.7, capabilities: ['reasoning'] },
            { id: 'devstral-2', name: 'Devstral 2', maxTokens: 128000, temperature: 0.2, capabilities: ['multi-file-code'] },
            { id: 'pixtral-large-latest', name: 'Pixtral Large ✦', maxTokens: 128000, temperature: 0.7, capabilities: ['text', 'vision', 'code'] },
            { id: 'mistral-small-3-2', name: 'Mistral Small 3.2', maxTokens: 32000, temperature: 0.7, capabilities: ['edge-optimized'] },
        ]
    },
    {
        id: 'deepseek',
        name: 'DeepSeek',
        icon: '🐋',
        baseUrl: 'https://api.deepseek.com/v1/chat/completions',
        requiresKey: true,
        models: [
            { id: 'deepseek-v3-2-speciale', name: 'DeepSeek V3.2 Speciale', maxTokens: 163840, temperature: 0.7, capabilities: ['frontier-reasoning'] },
            { id: 'deepseek-v3-2', name: 'DeepSeek V3.2', maxTokens: 128000, temperature: 0.7, capabilities: ['agentic-workloads'] },
            { id: 'deepseek-v3', name: 'DeepSeek V3', maxTokens: 128000, temperature: 0.7, capabilities: ['text', 'code'] },
            { id: 'deepseek-r1-0528', name: 'DeepSeek R1 0528', maxTokens: 128000, temperature: 0.7, capabilities: ['mathematical-proofs'] },
            { id: 'deepseek-r1', name: 'DeepSeek R1', maxTokens: 128000, temperature: 0.7, capabilities: ['text', 'reasoning'] },
            { id: 'deepseek-coder-v3', name: 'DeepSeek Coder V3', maxTokens: 128000, temperature: 0.2, capabilities: ['code-intelligence'] },
        ]
    },
    {
        id: 'openrouter',
        name: 'OpenRouter',
        icon: '🌌',
        baseUrl: 'https://openrouter.ai/api/v1',
        requiresKey: true,
        models: [
            { id: 'hunter-alpha', name: 'Hunter Alpha ✦', maxTokens: 1000000, temperature: 0.7, capabilities: ['agentic', 'frontier'] },
            { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash', maxTokens: 1000000, temperature: 0.7, capabilities: ['text', 'vision', 'code'] },
            { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', maxTokens: 8192, temperature: 0.7, capabilities: ['text', 'code'] },
            { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1', maxTokens: 16384, temperature: 0.7, capabilities: ['text', 'reasoning'] },
        ]
    },
    {
        id: 'perplexity',
        name: 'Perplexity',
        icon: '🔍',
        baseUrl: 'https://api.perplexity.ai',
        requiresKey: true,
        models: [
            { id: 'perplexity-computer', name: 'Perplexity Computer', maxTokens: 128000, temperature: 0.2, capabilities: ['digital-worker', 'workflow'] },
            { id: 'sonar-reasoning-pro', name: 'Sonar Reasoning Pro ✦', maxTokens: 128000, temperature: 0.2, capabilities: ['text', 'reasoning'] },
            { id: 'sonar-reasoning', name: 'Sonar Reasoning', maxTokens: 128000, temperature: 0.2, capabilities: ['text', 'reasoning'] },
            { id: 'sonar-pro', name: 'Sonar Pro', maxTokens: 128000, temperature: 0.2, capabilities: ['text'] },
            { id: 'sonar', name: 'Sonar', maxTokens: 128000, temperature: 0.2, capabilities: ['text', 'fast'] },
        ]
    },
    {
        id: 'together',
        name: 'Together AI',
        icon: '🤝',
        baseUrl: 'https://api.together.xyz/v1',
        requiresKey: true,
        models: [
            { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 70B Turbo', maxTokens: 128000, temperature: 0.7, capabilities: ['text', 'code'] },
            { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', maxTokens: 128000, temperature: 0.7, capabilities: ['text', 'reasoning'] },
            { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: 'Qwen 2.5 Coder 32B', maxTokens: 32768, temperature: 0.7, capabilities: ['code'] },
            { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B', maxTokens: 65536, temperature: 0.7, capabilities: ['text', 'code'] },
        ]
    },
    {
        id: 'xai',
        name: 'xAI (Grok)',
        icon: '✖',
        baseUrl: 'https://api.x.ai/v1',
        requiresKey: true,
        models: [
            { id: 'grok-4-1', name: 'Grok 4.1 ✦', maxTokens: 131072, temperature: 0.7, capabilities: ['thinking-mode', 'real-time'] },
            { id: 'grok-4', name: 'Grok 4', maxTokens: 131072, temperature: 0.7, capabilities: ['reasoning'] },
            { id: 'grok-heavy', name: 'Grok Heavy', maxTokens: 131072, temperature: 0.7, capabilities: ['extreme-performance'] },
            { id: 'grok-3', name: 'Grok 3', maxTokens: 131072, temperature: 0.7, capabilities: ['reflection'] },
            { id: 'grok-2-vision-latest', name: 'Grok 2 Vision', maxTokens: 131072, temperature: 0.7, capabilities: ['text', 'vision'] },
        ]
    },
    {
        id: 'cohere',
        name: 'Cohere',
        icon: '🧶',
        baseUrl: 'https://api.cohere.ai/v1',
        requiresKey: true,
        models: [
            { id: 'command-r-plus-08-2024', name: 'Command R+ ✦', maxTokens: 128000, temperature: 0.3, capabilities: ['rag', 'agentic'] },
            { id: 'command-r-08-2024', name: 'Command R', maxTokens: 128000, temperature: 0.3, capabilities: ['rag', 'fast'] },
            { id: 'command-nightly', name: 'Command Nightly', maxTokens: 128000, temperature: 0.7, capabilities: ['text'] },
        ]
    },
    {
        id: 'huggingface',
        name: 'Hugging Face',
        icon: '🤗',
        baseUrl: 'https://api-inference.huggingface.co/models',
        requiresKey: true,
        models: [
            { id: 'meta-llama/Llama-3.2-11B-Vision-Instruct', name: 'Llama 3.2 11B Vision', maxTokens: 128000, temperature: 0.7, capabilities: ['vision', 'open-source'] },
            { id: 'mistralai/Mistral-Nemo-Instruct-v1', name: 'Mistral Nemo', maxTokens: 128000, temperature: 0.7, capabilities: ['text', 'code'] },
            { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B', maxTokens: 32768, temperature: 0.7, capabilities: ['multilingual', 'code'] },
        ]
    },
    {
        id: 'fireworks',
        name: 'Fireworks AI',
        icon: '🎇',
        baseUrl: 'https://api.fireworks.ai/inference/v1',
        requiresKey: true,
        models: [
            { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', name: 'Llama 3.3 70B', maxTokens: 131072, temperature: 0.7, capabilities: ['fast', 'text'] },
            { id: 'accounts/fireworks/models/f1-preview', name: 'F1 Preview ✦', maxTokens: 32768, temperature: 0.1, capabilities: ['reasoning', 'agentic'] },
            { id: 'accounts/fireworks/models/qwen2p5-coder-32b-instruct', name: 'Qwen 2.5 Coder 32B', maxTokens: 32768, temperature: 0.7, capabilities: ['code'] },
        ]
    },
    {
        id: 'octoai',
        name: 'OctoAI',
        icon: '🐙',
        baseUrl: 'https://api.octoai.cloud/v1',
        requiresKey: true,
        models: [
            { id: 'llama-3.1-405b-instruct', name: 'Octo Llama 405B', maxTokens: 128000, temperature: 0.7, capabilities: ['extreme-logic', 'fast'] },
            { id: 'mistral-7b-instruct', name: 'Octo Mistral 7B', maxTokens: 32000, temperature: 0.7, capabilities: ['fast', 'text'] },
        ]
    },
    {
        id: 'sambanova',
        name: 'SambaNova',
        icon: '🌀',
        baseUrl: 'https://api.sambanova.ai/v1',
        requiresKey: true,
        models: [
            { id: 'Meta-Llama-3.1-405B-Instruct', name: 'Llama 3.1 405B (Fast)', maxTokens: 128000, temperature: 0.7, capabilities: ['logic', 'ultra-fast'] },
            { id: 'Meta-Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B (Fast)', maxTokens: 128000, temperature: 0.7, capabilities: ['text', 'ultra-fast'] },
        ]
    },
    {
        id: 'cerebras',
        name: 'Cerebras',
        icon: '🧠',
        baseUrl: 'https://api.cerebras.ai/v1',
        requiresKey: true,
        models: [
            { id: 'llama3.1-70b', name: 'Llama 3.1 70B (Speed)', maxTokens: 8192, temperature: 0.7, capabilities: ['fastest-text'] },
            { id: 'llama3.1-8b', name: 'Llama 3.1 8B (Speed)', maxTokens: 8192, temperature: 0.7, capabilities: ['real-time'] },
        ]
    },
    {
        id: 'yi',
        name: '01.AI (Yi)',
        icon: '🐉',
        baseUrl: 'https://api.01.ai/v1',
        requiresKey: true,
        models: [
            { id: 'yi-lightning', name: 'Yi Lightning ✦', maxTokens: 128000, temperature: 0.7, capabilities: ['multilingual', 'fast'] },
            { id: 'yi-large', name: 'Yi Large', maxTokens: 32768, temperature: 0.7, capabilities: ['text', 'reasoning'] },
        ]
    },
    {
        id: 'upstage',
        name: 'Upstage',
        icon: '🆙',
        baseUrl: 'https://api.upstage.ai/v1',
        requiresKey: true,
        models: [
            { id: 'solar-pro', name: 'Solar Pro ✦', maxTokens: 128000, temperature: 0.7, capabilities: ['text', 'vision'] },
            { id: 'solar-mini', name: 'Solar Mini', maxTokens: 32768, temperature: 0.7, capabilities: ['fast', 'text'] },
        ]
    },
    {
        id: 'moonshot',
        name: 'Moonshot AI',
        icon: '🌙',
        baseUrl: 'https://api.moonshot.cn/v1',
        requiresKey: true,
        models: [
            { id: 'kimichat-pro', name: 'Kimi Pro ✦', maxTokens: 128000, temperature: 0.7, capabilities: ['long-context', 'reasoning'] },
            { id: 'kimichat', name: 'Kimi', maxTokens: 32768, temperature: 0.7, capabilities: ['text'] },
        ]
    },
    {
        id: 'alibaba',
        name: 'Alibaba Qwen',
        icon: '🏢',
        baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
        requiresKey: true,
        models: [
            { id: 'qwen-max-latest', name: 'Qwen Max ✦', maxTokens: 128000, temperature: 0.7, capabilities: ['reasoning', 'multilingual'] },
            { id: 'qwen-plus', name: 'Qwen Plus', maxTokens: 128000, temperature: 0.7, capabilities: ['agentic', 'coding'] },
            { id: 'qwen-turbo', name: 'Qwen Turbo', maxTokens: 128000, temperature: 0.7, capabilities: ['fast'] },
        ]
    },
];

export const getDefaultTool = () => AI_TOOLS[0];
export const getDefaultModel = (toolId) => {
    const tool = AI_TOOLS.find(t => t.id === toolId);
    return tool ? tool.models[0] : null;
};
