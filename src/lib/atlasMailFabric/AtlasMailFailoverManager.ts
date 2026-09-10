import { AtlasSMTPAdapter, AtlasSMTPSendRequest } from './AtlasSMTPAdapter';
import { SMTPTransportOutcome } from './types';

export interface ISESFallbackAdapter {
  sendAuthorizedMessage(req: {
    to: string;
    subject: string;
    htmlBody: string;
    textBody?: string;
    logical_delivery_id: string;
    campaign_id: string;
    attempt_id: string;
  }): Promise<{
    status: 'ACCEPTED' | 'DEFINITIVE_PRE_ACCEPT_FAILURE' | 'AMBIGUOUS_OUTCOME';
    provider_message_id?: string;
    error_details?: any;
  }>;
}

export class AtlasMailFailoverManager {
  constructor(
    private smtpAdapter: AtlasSMTPAdapter,
    private sesFallbackAdapter?: ISESFallbackAdapter,
    private forceFailover = false
  ) {}

  public setForceFailover(enabled: boolean): void {
    this.forceFailover = enabled;
  }

  /**
   * Dispatches via primary ATLAS_SMTP or seamlessly falls back to AWS_SES
   * without bypassing eligibility, suppressions, JIT authorizations, or budget checks.
   */
  async dispatchWithFailover(
    req: AtlasSMTPSendRequest,
    isSmtpHealthy = true
  ): Promise<{
    providerUsed: 'ATLAS_SMTP' | 'AWS_SES';
    outcome: SMTPTransportOutcome;
    failoverTriggered: boolean;
  }> {
    // 1. Try Primary ATLAS_SMTP if healthy and not forced to failover
    if (isSmtpHealthy && !this.forceFailover) {
      const smtpRes = await this.smtpAdapter.sendAuthorizedMessage(req);
      
      // If primary didn't experience a systemic/service outage, return outcome
      if (smtpRes.status !== 'TIMEOUT' && smtpRes.status !== 'AMBIGUOUS') {
        return {
          providerUsed: 'ATLAS_SMTP',
          outcome: smtpRes,
          failoverTriggered: false
        };
      }
    }

    // 2. Fallover to AWS_SES (Contingency Fallback)
    if (!this.sesFallbackAdapter) {
      // If no fallback is configured, return fail-closed error
      return {
        providerUsed: 'ATLAS_SMTP',
        outcome: {
          status: 'REJECTED',
          error_details: {
            code: 'PRIMARY_DEGRADED_NO_FALLBACK',
            message: 'Primary ATLAS_SMTP degraded and no fallback provider configured',
            is_transient: true
          }
        },
        failoverTriggered: true
      };
    }

    // Call SES Fallback Adapter (maintaining exact security boundary)
    const sesRes = await this.sesFallbackAdapter.sendAuthorizedMessage({
      to: req.to,
      subject: req.subject,
      htmlBody: req.body,
      logical_delivery_id: req.execution_id,
      campaign_id: req.tenant_id,
      attempt_id: req.attempt_id
    });

    let mappedStatus: 'ACCEPTED' | 'PERMANENT_FAILURE' | 'AMBIGUOUS' = 'ACCEPTED';
    if (sesRes.status === 'DEFINITIVE_PRE_ACCEPT_FAILURE') mappedStatus = 'PERMANENT_FAILURE';
    else if (sesRes.status === 'AMBIGUOUS_OUTCOME') mappedStatus = 'AMBIGUOUS';

    return {
      providerUsed: 'AWS_SES',
      outcome: {
        status: mappedStatus,
        provider_message_id: sesRes.provider_message_id,
        error_details: sesRes.error_details
      },
      failoverTriggered: true
    };
  }
}
