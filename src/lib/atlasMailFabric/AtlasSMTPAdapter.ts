import * as crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { IMTAClient, MTAClient } from './MTAClient';
import { SMTPTransportOutcome, MailFabricPoolKey } from './types';

export interface AtlasSMTPSendRequest {
  tenant_id: string;
  execution_id: string;
  attempt_id: string;
  pool_key: MailFabricPoolKey;
  
  from: string;
  to: string;
  subject: string;
  body: string;
  
  // Optional campaign and categorization for Zero-PII Feedback Loop
  campaign_id?: string;
  mail_type?: 'TRANSACTIONAL' | 'PROMOTIONAL' | 'NEWSLETTER' | 'NOTIFICATION' | 'CANARY';
  custom_headers?: Record<string, string>;

  // Internal server-side correlation
  raw_correlation_token?: string;
}

export class AtlasSMTPAdapter {
  private mtaClient: IMTAClient;
  private supabase?: SupabaseClient;

  constructor(options?: { mtaClient?: IMTAClient; supabase?: SupabaseClient }) {
    this.mtaClient = options?.mtaClient || new MTAClient();
    this.supabase = options?.supabase;
  }

  /**
   * Generates a stable canonical Message-ID and MTA queue ID for the attempt
   */
  public generateMTAQueueId(attempt_id: string): string {
    return `mta_${crypto.createHash('sha256').update(attempt_id).digest('hex').substring(0, 16)}`;
  }

  public generateCanonicalMessageId(domain: string, attempt_id: string): string {
    const hash = crypto.createHash('sha256').update(attempt_id).digest('hex').substring(0, 24);
    return `<atlas.${hash}@${domain}>`;
  }

  public generateReturnPath(domain: string, mta_queue_id: string): string {
    return `bounces+${mta_queue_id}@${domain}`;
  }

  /**
   * Submits an authorized email message to the MTA.
   * Enforces Zero-PII, hash-based correlation, and privacy boundaries.
   */
  async sendAuthorizedMessage(req: AtlasSMTPSendRequest): Promise<SMTPTransportOutcome> {
    const fromDomain = req.from.split('@')[1] || 'youapp.com';
    const mtaQueueId = this.generateMTAQueueId(req.attempt_id);
    const messageId = this.generateCanonicalMessageId(fromDomain, req.attempt_id);
    const returnPath = this.generateReturnPath(fromDomain, mtaQueueId);

    // Structural validations
    if (!req.to || !req.to.includes('@')) {
      return {
        status: 'PERMANENT_FAILURE',
        smtp_response_code: 550,
        enhanced_status_code: '5.1.1',
        error_details: {
          code: 'INVALID_RECIPIENT_ADDRESS',
          message: 'Recipient address is malformed',
          is_transient: false
        }
      };
    }

    if (!req.subject || req.subject.trim() === '') {
      return {
        status: 'REJECTED',
        smtp_response_code: 554,
        enhanced_status_code: '5.7.1',
        error_details: {
          code: 'MISSING_SUBJECT',
          message: 'Email must contain a valid subject header',
          is_transient: false
        }
      };
    }

    // Prepare Feedback-ID header (Google RFC compliant: a:b:c:SenderId)
    const tenantHash = crypto.createHash('sha256').update(req.tenant_id).digest('hex').substring(0, 12);
    const campaignId = req.campaign_id || (req.pool_key === 'TRANSACTIONAL' ? 'tx_core' : 'campaign_general');
    const mailType = req.mail_type || (req.pool_key === 'TRANSACTIONAL' ? 'TRANSACTIONAL' : 'PROMOTIONAL');
    const senderId = 'ATLASMAIL'; // 9 chars stable across mail stream

    const feedbackIdHeader = `${campaignId}:${tenantHash}:${mailType}:${senderId}`;

    // Prepare MIME submission
    // Note: NEVER include X-Atlas-Correlation-Token with raw secret token in outbound headers
    const mtaPayload = {
      from: req.from,
      to: req.to,
      return_path: returnPath,
      subject: req.subject,
      body: req.body,
      message_id: messageId,
      mta_queue_id: mtaQueueId,
      custom_headers: {
        'X-Atlas-MTA-Queue-ID': mtaQueueId,
        'Auto-Submitted': 'auto-generated',
        'Feedback-ID': feedbackIdHeader,
        ...(req.custom_headers || {})
      }
    };

    // Dispatch via MTA client
    const outcome = await this.mtaClient.submitMessage(mtaPayload);

    // If Supabase client is available, settle spool record
    if (this.supabase) {
      try {
        let finalStatus = 'QUEUED';
        let errCode = outcome.error_details?.code || null;
        let errMsg = outcome.error_details?.message || null;
        let nextRetrySec = 0;

        if (outcome.status === 'ACCEPTED') {
          finalStatus = 'DELIVERED';
        } else if (outcome.status === 'TEMPORARY_FAILURE' || outcome.status === 'TIMEOUT') {
          finalStatus = 'TEMPORARY_DEFERRED';
          nextRetrySec = 60;
        } else if (outcome.status === 'PERMANENT_FAILURE' || outcome.status === 'REJECTED') {
          finalStatus = 'FAILED_PERMANENT';
        }

        await this.supabase.rpc('settle_mail_fabric_spool_item_v1', {
          p_mta_queue_id: mtaQueueId,
          p_final_status: finalStatus,
          p_error_code: errCode,
          p_error_message: errMsg,
          p_next_retry_seconds: nextRetrySec
        });
      } catch {
        // Spool settlement logging only
      }
    }

    return outcome;
  }
}
