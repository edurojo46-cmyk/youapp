import { SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';

export interface NormalizedDSNEvent {
  event_type: 'DELIVERY' | 'BOUNCE' | 'COMPLAINT' | 'SUBSCRIPTION';
  bounce_type?: 'PERMANENT' | 'TRANSIENT' | 'UNDETERMINED';
  smtp_status_code: string;
  diagnostic_code: string;
  mta_queue_id?: string;
  canonical_message_id?: string;
  recipient_domain: string;
  recipient_email_hash: string;
}

export class AtlasMailBounceNormalizer {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Parses RFC 3464 DSN raw text or status codes into a normalized mail event.
   */
  public parseDSN(
    recipientEmail: string,
    enhancedStatusCode: string,
    diagnosticCode: string,
    mtaQueueId?: string,
    canonicalMessageId?: string
  ): NormalizedDSNEvent {
    const domain = recipientEmail.includes('@')
      ? recipientEmail.split('@')[1]?.toLowerCase().trim()
      : recipientEmail.toLowerCase().trim();

    const emailHash = crypto.createHash('sha256').update(recipientEmail.trim().toLowerCase()).digest('hex');

    let eventType: 'DELIVERY' | 'BOUNCE' | 'COMPLAINT' | 'SUBSCRIPTION' = 'BOUNCE';
    let bounceType: 'PERMANENT' | 'TRANSIENT' | 'UNDETERMINED' = 'UNDETERMINED';

    if (enhancedStatusCode.startsWith('2.')) {
      eventType = 'DELIVERY';
    } else if (enhancedStatusCode.startsWith('5.7.') || diagnosticCode.toLowerCase().includes('spam') || diagnosticCode.toLowerCase().includes('complaint')) {
      eventType = 'COMPLAINT';
      bounceType = 'PERMANENT';
    } else if (enhancedStatusCode.startsWith('5.')) {
      eventType = 'BOUNCE';
      bounceType = 'PERMANENT';
    } else if (enhancedStatusCode.startsWith('4.')) {
      eventType = 'BOUNCE';
      bounceType = 'TRANSIENT';
    }

    return {
      event_type: eventType,
      bounce_type: bounceType,
      smtp_status_code: enhancedStatusCode,
      diagnostic_code: diagnosticCode,
      mta_queue_id: mtaQueueId,
      canonical_message_id: canonicalMessageId,
      recipient_domain: domain,
      recipient_email_hash: emailHash
    };
  }

  /**
   * Ingests the normalized DSN event into the Mail Control Plane (077000) RPC.
   * Dispatches suppression cascades and projects directly to 10H-A1 outcome ledger.
   */
  async ingestNormalizedDSN(
    tenantId: string,
    dsn: NormalizedDSNEvent,
    providerEventId?: string,
    rawCorrelationToken?: string
  ): Promise<any> {
    const eventId = providerEventId || `mta_dsn_${crypto.randomUUID()}`;
    const tokenHash = rawCorrelationToken 
      ? crypto.createHash('sha256').update(rawCorrelationToken).digest('hex')
      : null;

    const payloadHash = crypto.createHash('sha256').update(JSON.stringify({
      code: dsn.smtp_status_code,
      diag: dsn.diagnostic_code,
      type: dsn.event_type
    })).digest('hex');

    const { data, error } = await this.supabase.rpc('ingest_minimized_mail_provider_event_v1', {
      p_tenant_id: tenantId,
      p_provider_event_id: eventId,
      p_provider_message_id: dsn.canonical_message_id || dsn.mta_queue_id || eventId,
      p_correlation_token_hash: tokenHash,
      p_event_type: dsn.event_type,
      p_event_timestamp: new Date().toISOString(),
      p_bounce_class: dsn.bounce_type === 'UNDETERMINED' ? null : dsn.bounce_type,
      p_bounce_sub_type: dsn.smtp_status_code,
      p_canonical_payload_hash: payloadHash,
      p_minimized_metadata: {
        smtp_status: dsn.smtp_status_code,
        diagnostic: dsn.diagnostic_code,
        bounce_type: dsn.bounce_type,
        mta_queue_id: dsn.mta_queue_id,
        source_system: 'ATLAS_SMTP'
      }
    });

    if (error) {
      throw new Error(`DSN ingestion error: ${error.message}`);
    }

    return data;
  }
}
