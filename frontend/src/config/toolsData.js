/**
 * AI Provider and Model Integrations — NVIDIA Only
 *
 * ⚠️  MODEL LOCK — DO NOT MODIFY
 *     Chat Model  : minimaxai/minimax-m3   (Chat feature)
 *     Study Model : google/gemma-4-31b-it  (Study Hub — server-side only)
 */

export const AI_TOOLS = [
    {
        id: 'nvidia',
        name: 'NVIDIA NIM',
        icon: '🟩',
        baseUrl: 'https://integrate.api.nvidia.com/v1/chat/completions',
        requiresKey: false,
        models: [
            // 🔒 LOCKED — Chat feature model. DO NOT CHANGE.
            { id: 'minimaxai/minimax-m3', name: 'MiniMax M3', maxTokens: 16384, temperature: 0.3, capabilities: ['reasoning', 'complex'] },
        ]
    },
];

export const getDefaultTool = () => AI_TOOLS[0];
export const getDefaultModel = (toolId) => {
    const tool = AI_TOOLS.find(t => t.id === toolId);
    return tool ? tool.models[0] : null;
};
