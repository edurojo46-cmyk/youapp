export const pricingSnapshot = {
    effective_date: "2026-09-05",
    models: {
        "gemini-3.8-flash": {
            input_per_million: 0.75,
            output_per_million: 3.75,
            cached_input_per_million: 0.0 // Assume no caching for now or unsupported
        },
        "gpt-5.6-terra": {
            input_per_million: 2.00,
            output_per_million: 12.00,
            cached_input_per_million: 0.20
        }
    }
};

export function calculateCost(model: string, inputTokens: number, outputTokens: number, cachedInputTokens: number = 0): number {
    const pricing = pricingSnapshot.models[model as keyof typeof pricingSnapshot.models];
    if (!pricing) return 0;
    
    const normalInputTokens = inputTokens - cachedInputTokens;
    const inputCost = (normalInputTokens / 1_000_000) * pricing.input_per_million;
    const cachedInputCost = (cachedInputTokens / 1_000_000) * pricing.cached_input_per_million;
    const outputCost = (outputTokens / 1_000_000) * pricing.output_per_million;
    
    return inputCost + cachedInputCost + outputCost;
}
