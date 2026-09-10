import { SupabaseClient } from '@supabase/supabase-js';
import { MailFabricPoolKey } from './types';

export class AtlasMailPoolManager {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Evaluates if a pool is eligible to receive a new outbound message.
   */
  async evaluatePoolEligibility(poolKey: MailFabricPoolKey, maxQueueDepth = 1000): Promise<{ allowed: boolean; reason?: string; pool_id?: string }> {
    const { data, error } = await this.supabase.rpc('evaluate_mail_fabric_pool_limits_v1', {
      p_pool_key: poolKey,
      p_max_queue_depth: maxQueueDepth
    });

    if (error) {
      return { allowed: false, reason: `POOL_EVAL_ERROR: ${error.message}` };
    }

    return data;
  }

  /**
   * Activates emergency kill switch for a specific pool.
   */
  async activateKillSwitch(poolKey: MailFabricPoolKey): Promise<void> {
    const { error } = await this.supabase
      .from('atlas_mail_fabric_pools')
      .update({ kill_switch_active: true, updated_at: new Date().toISOString() })
      .eq('pool_key', poolKey);

    if (error) throw new Error(`Kill switch error: ${error.message}`);
  }

  /**
   * Deactivates emergency kill switch for a specific pool.
   */
  async deactivateKillSwitch(poolKey: MailFabricPoolKey): Promise<void> {
    const { error } = await this.supabase
      .from('atlas_mail_fabric_pools')
      .update({ kill_switch_active: false, updated_at: new Date().toISOString() })
      .eq('pool_key', poolKey);

    if (error) throw new Error(`Kill switch deactivate error: ${error.message}`);
  }

  /**
   * Pauses or resumes a pool.
   */
  async setPoolPaused(poolKey: MailFabricPoolKey, paused: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('atlas_mail_fabric_pools')
      .update({ is_paused: paused, updated_at: new Date().toISOString() })
      .eq('pool_key', poolKey);

    if (error) throw new Error(`Set pool pause error: ${error.message}`);
  }
}
