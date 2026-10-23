/**
 * SHARED MAIL CLIENT PACKAGE
 * @packages/mail-client
 * 
 * Neutral frontend client interface for Atlas Mail Horizontal Infrastructure.
 * Used identically by Atlas Platform, Busca Industrial, and YouApp.
 * 
 * CRITICAL SECURITY INVARIANTS:
 * 1. Zero SMTP / MTA credentials or server internals exposed to the frontend.
 * 2. Every operation MUST explicitly state product_scope: 'ATLAS' | 'INDUSTRIAL' | 'YOUAPP'.
 * 3. Enforces campaign, template, quota, and analytics separation between products.
 * 4. Communicates strictly via backend HTTP API endpoints (/api/mail/*).
 */

import { apiClient } from '../api-client/index.ts';
import type {
  ProductScope,
  SendMailOptions,
  SendCommercialMailOptions,
  SendCampaignMailOptions,
  MailDeliveryResult,
  DeliveryStatusResponse,
  SuppressionCheckResponse
} from '../types/index.ts';

export class AtlasMailClient {
  private defaultScope?: ProductScope;

  constructor(defaultScope?: ProductScope) {
    this.defaultScope = defaultScope;
  }

  /**
   * Helper to ensure a valid product scope is always provided
   */
  private resolveScope(scope?: ProductScope): ProductScope {
    const finalScope = scope || this.defaultScope;
    if (!finalScope || !['ATLAS', 'INDUSTRIAL', 'YOUAPP'].includes(finalScope)) {
      throw new Error(`[AtlasMailClient] Invalid or missing product_scope: "${finalScope}". Must be ATLAS, INDUSTRIAL, or YOUAPP.`);
    }
    return finalScope;
  }

  /**
   * Sends a critical transactional or operational email (e.g. auth, account notices, system alerts)
   */
  async sendTransactional(options: SendMailOptions): Promise<MailDeliveryResult> {
    const product_scope = this.resolveScope(options.product_scope);
    return apiClient.post<MailDeliveryResult>('/api/mail/send-transactional', {
      ...options,
      product_scope
    });
  }

  /**
   * Sends a commercial communication (e.g. proposals, quotes, formal follow-ups)
   */
  async sendCommercial(options: SendCommercialMailOptions): Promise<MailDeliveryResult> {
    const product_scope = this.resolveScope(options.product_scope);
    return apiClient.post<MailDeliveryResult>('/api/mail/send-commercial', {
      ...options,
      product_scope
    });
  }

  /**
   * Dispatches or schedules a marketing or broadcast campaign with strict product isolation
   */
  async sendCampaign(options: SendCampaignMailOptions): Promise<MailDeliveryResult> {
    const product_scope = this.resolveScope(options.product_scope);
    return apiClient.post<MailDeliveryResult>('/api/mail/send-campaign', {
      ...options,
      product_scope
    });
  }

  /**
   * Retrieves delivery ledger status without exposing recipient PII
   */
  async getDeliveryStatus(product_scope: ProductScope, messageId: string): Promise<DeliveryStatusResponse> {
    const scope = this.resolveScope(product_scope);
    return apiClient.get<DeliveryStatusResponse>(`/api/mail/status/${encodeURIComponent(messageId)}`, {
      params: { product_scope: scope }
    });
  }

  /**
   * Checks whether a recipient address is suppressed globally or for this specific product scope
   */
  async checkSuppression(product_scope: ProductScope, email: string): Promise<SuppressionCheckResponse> {
    const scope = this.resolveScope(product_scope);
    return apiClient.get<SuppressionCheckResponse>(`/api/mail/suppression/${encodeURIComponent(email)}`, {
      params: { product_scope: scope }
    });
  }
}

// Pre-configured scoped singletons for convenience
export const atlasMailClient = new AtlasMailClient('ATLAS');
export const industrialMailClient = new AtlasMailClient('INDUSTRIAL');
export const youappMailClient = new AtlasMailClient('YOUAPP');

export default AtlasMailClient;
