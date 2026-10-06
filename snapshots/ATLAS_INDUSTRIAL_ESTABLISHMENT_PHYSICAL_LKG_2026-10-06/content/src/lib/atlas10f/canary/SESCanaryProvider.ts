import { CanaryProviderBoundary, ProviderResult } from './ProviderBoundary';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export class SESCanaryProvider implements CanaryProviderBoundary {
  private sesClient: SESClient;

  constructor() {
    this.sesClient = new SESClient({
        region: process.env.AWS_REGION || import.meta.env?.VITE_AWS_REGION || 'us-east-1'
    });
  }

  async execute(payload: any): Promise<ProviderResult> {
    // 1. Hard validation: Must contain SES simulator
    if (!payload.to || typeof payload.to !== 'string' || !payload.to.includes('simulator.amazonses.com')) {
      return { status: 'FAILED_PRE_ACCEPT', reason: 'INVALID_DESTINATION_NOT_SIMULATOR' };
    }
    
    const command = new SendEmailCommand({
      Destination: { ToAddresses: [payload.to] },
      Message: {
        Body: { Text: { Data: payload.body || 'Atlas 10F-D Canary Verification' } },
        Subject: { Data: payload.subject || 'Atlas Preflight' }
      },
      Source: process.env.SES_FROM_ADDRESS || import.meta.env?.VITE_SES_FROM_ADDRESS || 'noreply@simulator.amazonses.com',
      ConfigurationSetName: process.env.SES_CONFIGURATION_SET || import.meta.env?.VITE_SES_CONFIGURATION_SET
    });

    try {
      const response = await this.sesClient.send(command);
      return {
        status: 'ACCEPTED',
        provider_message_id: response.MessageId,
      };
    } catch (err: any) {
      console.error('SES Provider Error:', err);
      return {
        status: 'FAILED_PRE_ACCEPT',
        reason: err.name || err.message || 'AWS_SES_ERROR'
      };
    }
  }
}
