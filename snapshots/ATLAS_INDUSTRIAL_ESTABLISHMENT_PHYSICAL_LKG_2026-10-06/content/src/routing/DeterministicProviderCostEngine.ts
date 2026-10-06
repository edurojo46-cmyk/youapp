export type PricingModel = 'PAY_AS_YOU_GO' | 'MONTHLY_INCLUDED' | 'TIERED' | 'CUSTOM';

export interface ProviderPricing {
    pricing_id: string;
    provider_id: string;
    pricing_version: string;
    pricing_model: PricingModel;
    fixed_monthly_cost: number;
    included_messages: number;
    cost_per_1000: number;
    overage_cost_per_1000: number;
    currency: string;
}

export interface QuotaContext {
    monthly_committed: number;
    monthly_reserved: number;
}

export interface CostCalculation {
    incrementalCost: number; // Cost of sending the next X messages
    isOverage: boolean;
    currency: string;
}

export class DeterministicProviderCostEngine {
    
    /**
     * Calculates the deterministic incremental cost for the next `messageUnits`.
     * Does NOT include fixed sunk costs.
     */
    public calculateIncrementalCost(pricing: ProviderPricing, quota: QuotaContext, messageUnits: number = 1): CostCalculation {
        if (pricing.currency !== 'USD') {
            throw new Error(`Currency ${pricing.currency} not supported for direct routing calculation in V1`);
        }

        const currentMonthlyTotal = quota.monthly_committed + quota.monthly_reserved;

        if (pricing.pricing_model === 'PAY_AS_YOU_GO') {
            const cost = (pricing.cost_per_1000 / 1000) * messageUnits;
            return { incrementalCost: cost, isOverage: false, currency: pricing.currency };
        }
        
        if (pricing.pricing_model === 'MONTHLY_INCLUDED') {
            const remainingIncluded = Math.max(0, pricing.included_messages - currentMonthlyTotal);
            
            if (messageUnits <= remainingIncluded) {
                // Fully covered by included volume
                return { incrementalCost: 0, isOverage: false, currency: pricing.currency };
            } else {
                // Partially or completely in overage
                const overageUnits = messageUnits - remainingIncluded;
                const cost = (pricing.overage_cost_per_1000 / 1000) * overageUnits;
                return { incrementalCost: cost, isOverage: true, currency: pricing.currency };
            }
        }

        // Tiered and Custom models for V1 can fall back to pay as you go if not fully implemented
        const cost = (pricing.cost_per_1000 / 1000) * messageUnits;
        return { incrementalCost: cost, isOverage: false, currency: pricing.currency };
    }
}
