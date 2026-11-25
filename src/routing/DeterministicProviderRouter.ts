import { SupabaseClient } from '@supabase/supabase-js';
import { DeterministicProviderCostEngine, ProviderPricing, QuotaContext } from './DeterministicProviderCostEngine';

export interface ProviderCapability {
    provider_id: string;
    policy_version: string;
    allowed_message_types: string[];
    allowed_audience_basis: string[];
    allowed_regions: string[];
    supports_transactional: boolean;
    supports_marketing: boolean;
    supports_bulk: boolean;
}

export interface ProviderHealth {
    provider_id: string;
    status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE' | 'PAUSED';
    expires_at: string;
    observed_at: string;
}

export interface ProviderQuota extends QuotaContext {
    provider_id: string;
    daily_limit: number;
    daily_committed: number;
    daily_reserved: number;
    monthly_limit: number;
    quota_version: string;
}

export interface RoutingContext {
    logical_delivery_id: string;
    generation_id: string;
    campaign_id: string;
    message_type: 'TRANSACTIONAL' | 'MARKETING' | 'BULK';
    audience_basis: string;
    region: string;
    message_units?: number;
    providers: {
        provider_id: string;
        provider_key: string;
        enabled: boolean;
        routing_priority: number;
    }[];
    pricings: ProviderPricing[];
    capabilities: ProviderCapability[];
    healths: ProviderHealth[];
    quotas: ProviderQuota[];
}

export interface RoutingResult {
    status: 'ROUTING_SELECTED' | 'NO_ELIGIBLE_PROVIDER' | 'CURRENCY_NOT_COMPARABLE';
    selected_provider_id?: string;
    rejection_reasons?: Record<string, string>;
    cost_comparison?: any[];
}

export class DeterministicProviderRouter {
    private engine = new DeterministicProviderCostEngine();

    constructor(private supabase: SupabaseClient) {}

    public async route(ctx: RoutingContext): Promise<RoutingResult> {
        const rejectionReasons: Record<string, string> = {};
        const eligibleProviders = [];

        // 1. Cascading Filter
        for (const provider of ctx.providers) {
            // A. Enabled?
            if (!provider.enabled) {
                rejectionReasons[provider.provider_id] = 'PROVIDER_DISABLED';
                continue;
            }

            // B. Capability / Policy Eligible?
            const cap = ctx.capabilities.find(c => c.provider_id === provider.provider_id);
            if (!cap) {
                rejectionReasons[provider.provider_id] = 'MISSING_CAPABILITY_POLICY';
                continue;
            }
            if (
                (ctx.message_type === 'TRANSACTIONAL' && !cap.supports_transactional) ||
                (ctx.message_type === 'MARKETING' && !cap.supports_marketing) ||
                (ctx.message_type === 'BULK' && !cap.supports_bulk)
            ) {
                rejectionReasons[provider.provider_id] = 'MESSAGE_TYPE_NOT_ALLOWED';
                continue;
            }
            if (cap.allowed_audience_basis.length > 0 && !cap.allowed_audience_basis.includes(ctx.audience_basis)) {
                rejectionReasons[provider.provider_id] = 'AUDIENCE_BASIS_NOT_ALLOWED';
                continue;
            }
            if (cap.allowed_regions.length > 0 && !cap.allowed_regions.includes(ctx.region)) {
                rejectionReasons[provider.provider_id] = 'REGION_NOT_ALLOWED';
                continue;
            }

            // C. Health current and acceptable?
            const health = ctx.healths.find(h => h.provider_id === provider.provider_id);
            if (!health) {
                rejectionReasons[provider.provider_id] = 'MISSING_HEALTH_STATE';
                continue;
            }
            if (new Date(health.expires_at).getTime() < Date.now()) {
                rejectionReasons[provider.provider_id] = 'HEALTH_EXPIRED';
                continue;
            }
            if (health.status !== 'HEALTHY') {
                rejectionReasons[provider.provider_id] = `UNHEALTHY_STATUS_${health.status}`;
                continue;
            }

            // D. Capacity potentially available?
            const quota = ctx.quotas.find(q => q.provider_id === provider.provider_id);
            if (!quota) {
                rejectionReasons[provider.provider_id] = 'MISSING_QUOTA_STATE';
                continue;
            }
            const messageUnits = ctx.message_units || 1;
            if (quota.daily_limit > 0 && (quota.daily_committed + quota.daily_reserved + messageUnits > quota.daily_limit)) {
                rejectionReasons[provider.provider_id] = 'DAILY_CAPACITY_EXHAUSTED';
                continue;
            }
            if (quota.monthly_limit > 0 && (quota.monthly_committed + quota.monthly_reserved + messageUnits > quota.monthly_limit)) {
                rejectionReasons[provider.provider_id] = 'MONTHLY_CAPACITY_EXHAUSTED';
                continue;
            }

            // E. Currency Check
            const pricing = ctx.pricings.find(p => p.provider_id === provider.provider_id);
            if (!pricing) {
                rejectionReasons[provider.provider_id] = 'MISSING_PRICING';
                continue;
            }
            if (pricing.currency !== 'USD') {
                rejectionReasons[provider.provider_id] = 'CURRENCY_NOT_COMPARABLE';
                // Note: user specifically asked to reject the provider if currency != USD
                // If all fail because of this, it might trigger NO_ELIGIBLE_PROVIDER, but let's log the exact reason.
                continue;
            }

            // F. Calculate Deterministic Cost
            const costCalc = this.engine.calculateIncrementalCost(pricing, quota, messageUnits);
            
            eligibleProviders.push({
                provider_id: provider.provider_id,
                provider_key: provider.provider_key,
                routing_priority: provider.routing_priority,
                pricing_version: pricing.pricing_version,
                capability_policy_version: cap.policy_version,
                health_snapshot_at: health.observed_at,
                quota_version: quota.quota_version,
                incrementalCost: costCalc.incrementalCost
            });
        }

        if (eligibleProviders.length === 0) {
            return {
                status: 'NO_ELIGIBLE_PROVIDER',
                rejection_reasons: rejectionReasons
            };
        }

        // 2. Rank Eligible Providers deterministically
        eligibleProviders.sort((a, b) => {
            // 1. Cost ASC
            if (a.incrementalCost !== b.incrementalCost) return a.incrementalCost - b.incrementalCost;
            // 2. Routing Priority ASC (Lower number = higher priority)
            if (a.routing_priority !== b.routing_priority) return a.routing_priority - b.routing_priority;
            // 3. Provider Key ASC (Lexicographical)
            return a.provider_key.localeCompare(b.provider_key);
        });

        // 3. Attempt Atomic Budget + Capacity Reservation
        for (const candidate of eligibleProviders) {
            const { data, error } = await this.supabase.rpc('reserve_delivery_economics', {
                p_logical_delivery_id: ctx.logical_delivery_id,
                p_generation_id: ctx.generation_id,
                p_campaign_id: ctx.campaign_id,
                p_provider_id: candidate.provider_id,
                p_units: ctx.message_units || 1,
                p_incremental_cost: candidate.incrementalCost
            });

            if (error) {
                rejectionReasons[candidate.provider_id] = `RPC_ERROR_${error.message}`;
                continue;
            }

            if (data && data.success) {
                // Successfully locked capacity and budget!
                
                // 4. Record Routing Decision Audit Log
                await this.supabase.from('atlas_provider_routing_decisions').insert({
                    generation_id: ctx.generation_id,
                    campaign_id: ctx.campaign_id,
                    logical_delivery_id: ctx.logical_delivery_id,
                    selected_provider_id: candidate.provider_id,
                    estimated_incremental_cost: candidate.incrementalCost,
                    currency: 'USD',
                    pricing_version: candidate.pricing_version,
                    capability_policy_version: candidate.capability_policy_version,
                    health_snapshot_at: candidate.health_snapshot_at,
                    quota_version: candidate.quota_version,
                    routing_policy_version: 'v1',
                    routing_hash: 'mock-hash', // In a real system, calculate a deterministic hash of inputs
                    eligible_providers: eligibleProviders.map(p => p.provider_id),
                    rejected_providers: Object.keys(rejectionReasons),
                    rejection_reasons: rejectionReasons,
                    cost_comparison: eligibleProviders,
                    routing_reason: 'LOWEST_ELIGIBLE_COST',
                    expires_at: new Date(Date.now() + 86400000).toISOString() // Valid for 24h
                });

                return {
                    status: 'ROUTING_SELECTED',
                    selected_provider_id: candidate.provider_id,
                    rejection_reasons: rejectionReasons,
                    cost_comparison: eligibleProviders
                };
            } else {
                rejectionReasons[candidate.provider_id] = `RESERVATION_FAILED_${data?.reason || 'UNKNOWN'}`;
                // Fallthrough allows it to try the next eligible provider
            }
        }

        // If we get here, no eligible provider could successfully reserve budget/capacity
        return {
            status: 'NO_ELIGIBLE_PROVIDER',
            rejection_reasons: rejectionReasons
        };
    }
}
