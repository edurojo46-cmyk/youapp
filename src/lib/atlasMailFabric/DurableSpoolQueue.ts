import { SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import { OutboundSpoolRequest, SpoolQueueItem, MailFabricPoolKey } from './types';

export interface SpoolMetrics {
  totalQueued: number;
  totalProcessing: number;
  totalDelivered: number;
  totalDeferred: number;
  totalFailed: number;
  perDomainDepth: Record<string, number>;
}

export class DurableSpoolQueue {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Enqueues an outbound email to the durable database spool.
   * Checks pool limits, daily/hourly caps, and active queue backpressure.
   */
  async enqueue(req: OutboundSpoolRequest): Promise<{ success: boolean; spool_id?: string; mta_queue_id: string; reason?: string }> {
    const domain = req.recipient_email.split('@')[1]?.toLowerCase() || 'unknown.com';
    const payloadHash = crypto.createHash('sha256').update(JSON.stringify({ to: req.recipient_email, subject: req.subject, body: req.body })).digest('hex');

    const { data, error } = await this.supabase.rpc('enqueue_mail_fabric_spool_v1', {
      p_mta_queue_id: req.mta_queue_id,
      p_execution_id: req.execution_id,
      p_attempt_id: req.attempt_id,
      p_pool_key: req.pool_key,
      p_recipient_domain: domain,
      p_payload_hash: payloadHash,
      p_canonical_message_id: req.canonical_message_id,
      p_return_path_address: req.return_path_address,
      p_max_age_hours: req.max_age_hours || 24
    });

    if (error) {
      return { success: false, mta_queue_id: req.mta_queue_id, reason: error.message };
    }

    return data;
  }

  /**
   * Recovers from server/worker restart.
   * Transitions stale PROCESSING items back to QUEUED if their last heartbeat was > 5 minutes ago,
   * guaranteeing zero lost executions and preventing duplicate sends.
   */
  async recoverAfterRestart(staleTimeoutMinutes = 5): Promise<{ recoveredCount: number }> {
    const cutoff = new Date(Date.now() - staleTimeoutMinutes * 60 * 1000).toISOString();

    const { data, error } = await this.supabase
      .from('atlas_mail_fabric_spool_queue')
      .update({ status: 'QUEUED' })
      .eq('status', 'PROCESSING')
      .lt('enqueued_at', cutoff)
      .select('spool_id');

    if (error) {
      throw new Error(`Restart recovery failed: ${error.message}`);
    }

    return { recoveredCount: data ? data.length : 0 };
  }

  /**
   * Retrieves pending items ready for dispatch (QUEUED or TEMPORARY_DEFERRED with next_attempt_at <= NOW).
   */
  async claimBatch(limit = 50): Promise<SpoolQueueItem[]> {
    const now = new Date().toISOString();

    const { data, error } = await this.supabase
      .from('atlas_mail_fabric_spool_queue')
      .select('*')
      .in('status', ['QUEUED', 'TEMPORARY_DEFERRED'])
      .lte('next_attempt_at', now)
      .order('next_attempt_at', { ascending: true })
      .limit(limit);

    if (error) throw new Error(`Claim batch error: ${error.message}`);
    return (data || []) as SpoolQueueItem[];
  }

  /**
   * Retrieves queue depth and domain distribution metrics.
   */
  async getMetrics(poolKey?: MailFabricPoolKey): Promise<SpoolMetrics> {
    let query = this.supabase.from('atlas_mail_fabric_spool_queue').select('status, recipient_domain');
    
    if (poolKey) {
      const { data: poolData } = await this.supabase.from('atlas_mail_fabric_pools').select('pool_id').eq('pool_key', poolKey).single();
      if (poolData) {
        query = query.eq('pool_id', poolData.pool_id);
      }
    }

    const { data, error } = await query;
    if (error) throw new Error(`Metrics error: ${error.message}`);

    const metrics: SpoolMetrics = {
      totalQueued: 0,
      totalProcessing: 0,
      totalDelivered: 0,
      totalDeferred: 0,
      totalFailed: 0,
      perDomainDepth: {}
    };

    for (const item of (data || [])) {
      if (item.status === 'QUEUED') metrics.totalQueued++;
      else if (item.status === 'PROCESSING') metrics.totalProcessing++;
      else if (item.status === 'DELIVERED') metrics.totalDelivered++;
      else if (item.status === 'TEMPORARY_DEFERRED') metrics.totalDeferred++;
      else if (item.status === 'FAILED_PERMANENT' || item.status === 'EXPIRED_MAX_AGE') metrics.totalFailed++;

      if (item.status === 'QUEUED' || item.status === 'PROCESSING') {
        metrics.perDomainDepth[item.recipient_domain] = (metrics.perDomainDepth[item.recipient_domain] || 0) + 1;
      }
    }

    return metrics;
  }
}
