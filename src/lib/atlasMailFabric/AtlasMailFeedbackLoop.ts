/**
 * ATLAS MAIL FABRIC V1 — Feedback-ID Loop Generator & Validator
 *
 * Implements Google Feedback Loop (FBL) and RFC specifications:
 * Format: Feedback-ID: a:b:c:SenderId
 *
 * Requirements:
 * 1. Up to 4 fields separated by colons (:).
 * 2. Last field (SenderId) is mandatory, must be between 5 and 15 characters,
 *    and stable across the entire mail stream.
 * 3. Zero-PII Invariant: No recipient email, recipient hash, message-id, or individual identifiers.
 * 4. Header must be inserted before DKIM signing to be protected by the DKIM-Signature.
 */

import * as crypto from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { FeedbackIDConfig } from './types';

export class AtlasMailFeedbackLoop {
  public static readonly DEFAULT_SENDER_ID = 'ATLASMAIL'; // 9 chars, stable across mail stream

  constructor(private supabase?: SupabaseClient) {}

  /**
   * Generates a Google-compliant Feedback-ID header value.
   * Format: <campaign_id>:<tenant_hash>:<mail_type>:<SenderId>
   */
  public static generateFeedbackIdHeader(config: FeedbackIDConfig): string {
    const senderId = (config.sender_id || this.DEFAULT_SENDER_ID).trim();

    if (senderId.length < 5 || senderId.length > 15) {
      throw new Error(
        `FEEDBACK_ID_VIOLATION: SenderId '${senderId}' must be between 5 and 15 characters (Google RFC spec)`
      );
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(senderId)) {
      throw new Error(`FEEDBACK_ID_VIOLATION: SenderId contains invalid characters (must be alphanumeric/dash/underscore)`);
    }

    // Sanitize campaign_id and tenant_hash (remove colons and spaces)
    const sanitizedCampaign = (config.campaign_id || 'general').replace(/[:\s]/g, '_').substring(0, 32);
    const sanitizedTenant = (config.tenant_hash || 'atlas').replace(/[:\s]/g, '_').substring(0, 16);
    const sanitizedMailType = (config.mail_type || 'TRANSACTIONAL').replace(/[:\s]/g, '_').substring(0, 16);

    // Enforce Zero-PII check
    const rawCheck = `${sanitizedCampaign}:${sanitizedTenant}:${sanitizedMailType}`.toLowerCase();
    if (rawCheck.includes('@') || rawCheck.includes('recipient') || rawCheck.includes('email')) {
      throw new Error(`SECURITY_VIOLATION: Feedback-ID cannot contain recipient PII`);
    }

    const headerValue = `${sanitizedCampaign}:${sanitizedTenant}:${sanitizedMailType}:${senderId}`;

    // Total header length check
    if (headerValue.length > 100) {
      throw new Error(`FEEDBACK_ID_VIOLATION: Total Feedback-ID string length exceeds 100 characters`);
    }

    return headerValue;
  }

  /**
   * Validates whether an existing Feedback-ID header value adheres strictly to Google specifications.
   */
  public static validateFeedbackId(headerValue: string): { valid: boolean; reason?: string; senderId?: string } {
    if (!headerValue || typeof headerValue !== 'string') {
      return { valid: false, reason: 'Feedback-ID header is empty or not a string' };
    }

    const parts = headerValue.split(':');
    if (parts.length < 1 || parts.length > 4) {
      return { valid: false, reason: 'Feedback-ID must have between 1 and 4 colon-separated fields' };
    }

    const senderId = parts[parts.length - 1];
    if (senderId.length < 5 || senderId.length > 15) {
      return { valid: false, reason: `SenderId '${senderId}' length is ${senderId.length} (must be 5-15 characters)` };
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(senderId)) {
      return { valid: false, reason: 'SenderId contains non-ASCII or invalid special characters' };
    }

    if (headerValue.includes('@')) {
      return { valid: false, reason: 'Feedback-ID contains @ character (potential PII leak)' };
    }

    return { valid: true, senderId };
  }

  /**
   * Registers a campaign Feedback-ID in the Zero-PII database ledger.
   */
  public async registerCampaignFeedbackId(
    tenantId: string,
    campaignName: string,
    mailType: 'TRANSACTIONAL' | 'PROMOTIONAL' | 'NEWSLETTER' | 'NOTIFICATION' | 'CANARY',
    campaignId?: string
  ): Promise<{ campaign_id: string; feedback_id_header: string }> {
    const cmpId = campaignId || `cmp_${crypto.randomBytes(6).toString('hex')}`;
    const tenantHash = crypto.createHash('sha256').update(tenantId).digest('hex').substring(0, 12);

    const feedbackHeader = AtlasMailFeedbackLoop.generateFeedbackIdHeader({
      campaign_id: cmpId,
      tenant_hash: tenantHash,
      mail_type: mailType,
      sender_id: AtlasMailFeedbackLoop.DEFAULT_SENDER_ID
    });

    if (this.supabase) {
      await this.supabase.from('atlas_mail_feedback_campaigns').upsert({
        campaign_id: cmpId,
        tenant_id: tenantId,
        campaign_name: campaignName,
        mail_type: mailType,
        sender_id: AtlasMailFeedbackLoop.DEFAULT_SENDER_ID,
        feedback_id_header: feedbackHeader,
        registered_at: new Date().toISOString()
      }, { onConflict: 'campaign_id' });
    }

    return {
      campaign_id: cmpId,
      feedback_id_header: feedbackHeader
    };
  }
}
