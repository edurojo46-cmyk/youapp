/**
 * YOUAPP MAIL CLIENT SERVICE
 * @apps/youapp/services/youappMailClient.ts
 * 
 * Notification and messaging service for YouApp streaming product:
 * - New signal or TV programming updates
 * - Streaming newsletters and digests
 * - Account activity notices
 * 
 * STRICT INVARIANT:
 * Consumes horizontal Atlas Mail infrastructure with product_scope: 'YOUAPP'.
 * Streaming logic is strictly separated from Mail Control Plane internals.
 */

import { youappMailClient } from '../../../packages/mail-client/index.ts';
import type { MailDeliveryResult } from '../../../packages/types/index.ts';

export class YouAppMailService {
  /**
   * Sends user notification regarding TV or Channel updates
   */
  static async sendChannelNotification(params: {
    to: string;
    channelName: string;
    message: string;
    channelUrl?: string;
  }): Promise<MailDeliveryResult> {
    const html = `
      <div style="font-family: sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #6366f1;">Actualización de Canal: ${params.channelName}</h2>
        <p>${params.message}</p>
        ${params.channelUrl ? `
          <div style="margin: 20px 0;">
            <a href="${params.channelUrl}" style="background-color: #6366f1; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Ver Canal
            </a>
          </div>
        ` : ''}
      </div>
    `;

    return youappMailClient.sendTransactional({
      product_scope: 'YOUAPP',
      to: params.to,
      subject: `Novedades en tu canal ${params.channelName} — YouApp`,
      html,
      metadata: { channelName: params.channelName }
    });
  }

  /**
   * Broadcast weekly streaming newsletter to subscribed users
   */
  static async sendWeeklyNewsletter(campaignId: string, templateId: string, recipients: Array<{ email: string }>): Promise<MailDeliveryResult> {
    return youappMailClient.sendCampaign({
      product_scope: 'YOUAPP',
      campaign_id: campaignId,
      template_id: templateId,
      recipients
    });
  }
}

export default YouAppMailService;
