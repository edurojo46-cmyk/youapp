import { SupabaseClient } from '@supabase/supabase-js';
import { InfraCostBreakdown } from './types';

export class AtlasMailCostLedger {
  constructor(private supabase?: SupabaseClient) {}

  /**
   * Calculates realistic unit economics based on real infrastructure components.
   */
  public calculateEconomics(params: {
    period_month: string;
    vps_cost?: number;
    dedicated_ips_cost?: number;
    storage_cost?: number;
    dns_cost?: number;
    egress_rate_per_gb?: number;
    total_messages_accepted: number;
    total_messages_delivered: number;
    avg_message_size_kb?: number;
  }): InfraCostBreakdown {
    const vps = params.vps_cost ?? 20.00;
    const ips = params.dedicated_ips_cost ?? 10.00;
    const storage = params.storage_cost ?? 2.00;
    const dns = params.dns_cost ?? 1.00;
    const egressRate = params.egress_rate_per_gb ?? 0.0100;
    const avgSizeKb = params.avg_message_size_kb ?? 25; // 25 KB average email size

    const fixedTotal = vps + ips + storage + dns;
    const totalEgressGb = (params.total_messages_accepted * avgSizeKb) / (1024 * 1024);
    const variableTotal = totalEgressGb * egressRate;
    const grandTotal = fixedTotal + variableTotal;

    const costPer1kAccepted = params.total_messages_accepted > 0
      ? (grandTotal / (params.total_messages_accepted / 1000))
      : 0;

    const costPer1kDelivered = params.total_messages_delivered > 0
      ? (grandTotal / (params.total_messages_delivered / 1000))
      : 0;

    const costPer1mDelivered = costPer1kDelivered * 1000;
    const costPer10mDelivered = costPer1kDelivered * 10000;

    return {
      period_month: params.period_month,
      vps_monthly_cost_usd: vps,
      dedicated_ips_cost_usd: ips,
      egress_cost_per_gb_usd: egressRate,
      storage_cost_usd: storage,
      dns_cost_usd: dns,
      total_messages_accepted: params.total_messages_accepted,
      total_messages_delivered: params.total_messages_delivered,
      total_egress_gb: Number(totalEgressGb.toFixed(4)),
      effective_cost_per_1000_accepted: Number(costPer1kAccepted.toFixed(6)),
      effective_cost_per_1000_delivered: Number(costPer1kDelivered.toFixed(6)),
      effective_cost_per_1m_delivered: Number(costPer1mDelivered.toFixed(4)),
      effective_cost_per_10m_delivered: Number(costPer10mDelivered.toFixed(4))
    };
  }

  /**
   * Persists infrastructure cost snapshot to the database ledger.
   */
  async recordPeriodCost(breakdown: InfraCostBreakdown): Promise<void> {
    if (!this.supabase) return;

    const { error } = await this.supabase.rpc('record_mail_fabric_infra_period_cost_v1', {
      p_period_month: breakdown.period_month,
      p_vps_cost: breakdown.vps_monthly_cost_usd,
      p_ips_cost: breakdown.dedicated_ips_cost_usd,
      p_egress_rate_per_gb: breakdown.egress_cost_per_gb_usd,
      p_storage_cost: breakdown.storage_cost_usd,
      p_dns_cost: breakdown.dns_cost_usd,
      p_accepted_count: breakdown.total_messages_accepted,
      p_delivered_count: breakdown.total_messages_delivered,
      p_egress_gb: breakdown.total_egress_gb
    });

    if (error) {
      throw new Error(`Cost ledger recording error: ${error.message}`);
    }
  }
}
