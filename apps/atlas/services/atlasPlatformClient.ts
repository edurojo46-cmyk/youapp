/**
 * ATLAS PLATFORM CLIENT SERVICE
 * @apps/atlas/services/atlasPlatformClient.ts
 * 
 * Provides Atlas Core services with integrated Horizontal Mail capabilities:
 * - Mi Base relation notifications
 * - CRM follow-up messages
 * - User and system platform alerts
 */

import { atlasMailClient } from '../../../packages/mail-client/index.ts';
import type { SendMailOptions, MailDeliveryResult } from '../../../packages/types/index.ts';

export class AtlasPlatformClient {
  /**
   * Send platform transactional alert (account verification, password reset, security alert)
   */
  static async sendPlatformAlert(to: string, subject: string, html: string): Promise<MailDeliveryResult> {
    return atlasMailClient.sendTransactional({
      product_scope: 'ATLAS',
      to,
      subject,
      html
    });
  }

  /**
   * Send CRM / Mi Base contact notification
   */
  static async sendCrmNotification(to: string, contactName: string, message: string): Promise<MailDeliveryResult> {
    return atlasMailClient.sendCommercial({
      product_scope: 'ATLAS',
      to,
      subject: `Notificación de contacto Atlas: ${contactName}`,
      text: message,
      metadata: { contactName, source: 'MI_BASE' }
    });
  }

  /**
   * Verify whether a contact is suppressed before sending
   */
  static async isContactSuppressed(email: string): Promise<boolean> {
    const res = await atlasMailClient.checkSuppression('ATLAS', email);
    return res.is_suppressed;
  }
}

export default AtlasPlatformClient;
