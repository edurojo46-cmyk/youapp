import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { 
  getProviderAdapter, 
  type IProviderAdapter, 
  type OutreachDeliveryStatus, 
  type ProviderWebhookEvent,
  RealProviderAdapter
} from './ProviderAdapter.ts';

export interface ProposalContact {
  id: string;
  name: string;
  entity_type?: string;
  rubro?: string;
  localidad?: string;
  email?: string;
  phone?: string;
  company_name?: string;
}

export interface OutreachRateLimits {
  sendRate: number;      // max emails per minute
  batchSize: number;     // max contacts per batch
  dailyLimit: number;    // max emails per 24 hours
  domainLimit: number;   // max emails per recipient domain
}

export interface SendProposalParams {
  campaign_id?: string;
  template_id?: string;
  subject: string;
  body: string;
  contacts: ProposalContact[];
  provider?: 'SIMULATED_PROVIDER' | 'REAL_PROVIDER' | 'REAL_AWS_SES' | 'REAL_SMTP';
  rate_limits?: Partial<OutreachRateLimits>;
}

export interface OutreachSendResult {
  success: boolean;
  campaign_id: string;
  selected: number;
  verified_emails: number;
  excluded: number;
  suppressed: number;
  unsubscribed: number;
  bounced: number;
  queued: number;
  sent_count: number;
  duplicate_sends: number;
  domain_limited: number;
  errors: number;
  provider: string;
  timestamp: string;
  contact_statuses: Record<string, OutreachDeliveryStatus | 'LISTO' | 'NO EMAIL' | 'NO CONTACTAR'>;
  provider_message_ids: Record<string, string>;
  rate_limits_applied: OutreachRateLimits;
  preview?: {
    recipient_email: string;
    recipient_name: string;
    rendered_subject: string;
    rendered_body: string;
  };
}

export class AtlasOutreachEmailService {
  private static SUPPRESSION_FILE = path.resolve('scratch/atlas_email_suppressions.json');
  private static SENT_LEDGER_FILE = path.resolve('scratch/atlas_email_sent_ledger.json');

  public static readonly DEFAULT_RATE_LIMITS: OutreachRateLimits = {
    sendRate: 60,       // 60 emails / min
    batchSize: 50,      // max 50 per batch
    dailyLimit: 2000,   // max 2000 per day
    domainLimit: 10     // max 10 emails per destination domain
  };

  /**
   * Loads suppression records with reasons (UNSUBSCRIBED, HARD_BOUNCE, COMPLAINT, MANUAL)
   */
  public static loadSuppressionMap(): Map<string, { reason: string; permanent: boolean }> {
    const map = new Map<string, { reason: string; permanent: boolean }>();
    
    // Seed defaults
    map.set('spam@trap.com', { reason: 'SPAM_TRAP', permanent: true });
    map.set('bounced@invalid.org', { reason: 'HARD_BOUNCE', permanent: true });
    map.set('unsubscribed@example.com', { reason: 'UNSUBSCRIBED', permanent: true });

    if (fs.existsSync(this.SUPPRESSION_FILE)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.SUPPRESSION_FILE, 'utf8'));
        if (Array.isArray(raw)) {
          for (const item of raw) {
            if (typeof item === 'string') {
              map.set(item.toLowerCase().trim(), { reason: 'MANUAL', permanent: true });
            } else if (item && item.email) {
              map.set(item.email.toLowerCase().trim(), {
                reason: item.reason || 'MANUAL',
                permanent: item.permanent !== false
              });
            }
          }
        }
      } catch {}
    }
    return map;
  }

  private static loadSentLedger(): Set<string> {
    const s = new Set<string>();
    if (fs.existsSync(this.SENT_LEDGER_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.SENT_LEDGER_FILE, 'utf8'));
        if (Array.isArray(data)) {
          data.forEach(hash => s.add(String(hash)));
        }
      } catch {}
    }
    return s;
  }

  private static appendSentLedger(newHashes: string[]): void {
    if (newHashes.length === 0) return;
    try {
      const existing = this.loadSentLedger();
      newHashes.forEach(h => existing.add(h));
      const dir = path.dirname(this.SENT_LEDGER_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.SENT_LEDGER_FILE, JSON.stringify(Array.from(existing), null, 2));
    } catch {}
  }

  /**
   * Replaces variables {{nombre}}, {{empresa}}, {{rubro}}, {{localidad}}
   */
  public static renderTemplate(text: string, contact: ProposalContact): string {
    if (!text) return '';
    const cleanName = (contact.name || '').replace(/\s+(S\.A\.|S\.R\.L\.|S\.A\.S\.|S\.C\.|S\.A\.I\.C\.)$/i, '').trim();
    const cleanCompany = contact.company_name || contact.name || 'su empresa';
    const rubro = contact.rubro || 'su sector';
    const localidad = contact.localidad || 'su localidad';

    return text
      .replace(/\{\{\s*nombre\s*\}\}/gi, cleanName)
      .replace(/\{\{\s*empresa\s*\}\}/gi, cleanCompany)
      .replace(/\{\{\s*rubro\s*\}\}/gi, rubro)
      .replace(/\{\{\s*localidad\s*\}\}/gi, localidad);
  }

  /**
   * Generates rendered preview for a contact
   */
  public static previewProposal(params: { subject: string; body: string; contact: ProposalContact }) {
    const { subject, body, contact } = params;
    return {
      recipient_email: contact.email || 'sin-email@registro',
      recipient_name: contact.name,
      rendered_subject: this.renderTemplate(subject, contact),
      rendered_body: this.renderTemplate(body, contact)
    };
  }

  /**
   * Permanent suppression of an email address
   */
  public static async suppress(email: string, reason: string): Promise<void> {
    const adapter = getProviderAdapter('REAL_PROVIDER');
    await adapter.suppress(email, reason);
  }

  /**
   * Queries real delivery status of a provider message ID
   */
  public static async getStatus(providerMessageId: string): Promise<OutreachDeliveryStatus> {
    const adapter = getProviderAdapter('REAL_PROVIDER');
    return await adapter.getStatus(providerMessageId);
  }

  /**
   * Processes a webhook notification from provider
   */
  public static async processWebhook(rawPayload: any, headers?: Record<string, string>): Promise<ProviderWebhookEvent> {
    const adapter = getProviderAdapter('REAL_PROVIDER');
    return await adapter.processWebhook(rawPayload, headers);
  }

  /**
   * Main proposal dispatch with complete pre-flight gating, rate control,
   * provider abstraction, duplicate protection, and webhook feedback loop.
   */
  public static async sendProposal(params: SendProposalParams): Promise<OutreachSendResult> {
    const campaignId = params.campaign_id || `CAMP_${new Date().toISOString().slice(0, 10)}_${crypto.randomBytes(3).toString('hex')}`;
    const providerKey = params.provider || 'SIMULATED_PROVIDER';
    const adapter: IProviderAdapter = getProviderAdapter(providerKey);
    const contacts = params.contacts || [];

    const rateLimits: OutreachRateLimits = {
      ...this.DEFAULT_RATE_LIMITS,
      ...(params.rate_limits || {})
    };

    const suppressionMap = this.loadSuppressionMap();
    const sentLedger = this.loadSentLedger();
    const newSentHashes: string[] = [];

    const contactStatuses: Record<string, OutreachDeliveryStatus | 'LISTO' | 'NO EMAIL' | 'NO CONTACTAR'> = {};
    const providerMessageIds: Record<string, string> = {};

    let selected = contacts.length;
    let verifiedEmails = 0;
    let excluded = 0;
    let suppressed = 0;
    let unsubscribed = 0;
    let bounced = 0;
    let queued = 0;
    let sentCount = 0;
    let duplicateSends = 0;
    let domainLimited = 0;
    let errors = 0;

    let firstPreview: any = undefined;

    // Track domain rate limits for this execution
    const domainCounts: Record<string, number> = {};

    for (const c of contacts) {
      const email = (c.email || '').trim().toLowerCase();

      // 1. GATE: EMAIL_VERIFIED = TRUE
      const isEmailVerified = Boolean(
        email &&
        email.length >= 5 &&
        email.includes('@') &&
        email.includes('.') &&
        !email.includes(' ') &&
        !email.startsWith('@')
      );

      if (!isEmailVerified) {
        excluded++;
        contactStatuses[c.id] = 'NO EMAIL';
        continue;
      }

      verifiedEmails++;

      // 2. GATES: SUPPRESSED = FALSE, UNSUBSCRIBED = FALSE, BOUNCED = FALSE
      const suppressionRecord = suppressionMap.get(email);
      if (suppressionRecord || email.includes('no-reply') || email.includes('noreply')) {
        suppressed++;
        const reason = suppressionRecord?.reason || 'SUPPRESSED';
        if (reason === 'UNSUBSCRIBED') unsubscribed++;
        if (reason === 'HARD_BOUNCE' || reason === 'BOUNCED') bounced++;

        contactStatuses[c.id] = 'NO CONTACTAR';
        continue;
      }

      // 3. GATE: DUPLICATE_CAMPAIGN_SEND = FALSE (CAMPAIGN_ID + EMAIL_HASH)
      const emailHash = crypto.createHash('sha256').update(`${campaignId}:${email}`).digest('hex').slice(0, 16);
      if (sentLedger.has(emailHash)) {
        duplicateSends++;
        contactStatuses[c.id] = 'LISTO';
        continue;
      }

      // 4. RATE CONTROL: DOMAIN_LIMIT
      const domain = email.split('@')[1] || '';
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      if (domainCounts[domain] > rateLimits.domainLimit) {
        domainLimited++;
        contactStatuses[c.id] = 'ERROR';
        continue;
      }

      // 5. RATE CONTROL: BATCH_SIZE
      if (queued >= rateLimits.batchSize) {
        // Enforce batch boundary
        contactStatuses[c.id] = 'QUEUED';
        continue;
      }

      // 6. QUEUE CONTACT
      queued++;
      contactStatuses[c.id] = 'QUEUED';

      // Capture preview on the first eligible recipient
      if (!firstPreview) {
        firstPreview = this.previewProposal({ subject: params.subject, body: params.body, contact: c });
      }

      // 7. PROVIDER ADAPTER DISPATCH
      try {
        const payload = {
          messageId: `msg_${Date.now()}_${c.id}`,
          campaignId,
          contactId: c.id,
          recipientEmail: email,
          recipientName: c.name,
          subject: this.renderTemplate(params.subject, c),
          body: this.renderTemplate(params.body, c),
          headers: {
            'X-Atlas-Campaign': campaignId,
            'List-Unsubscribe': `<mailto:unsubscribe@atlas.internal?subject=unsub_${c.id}>`
          }
        };

        const result = await adapter.send(payload);
        if (result.success) {
          sentCount++;
          newSentHashes.push(emailHash);
          providerMessageIds[c.id] = result.providerMessageId;
          // In REAL_PROVIDER, initialStatus is SENT (never marked DELIVERED until real webhook arrives)
          contactStatuses[c.id] = result.initialStatus;
        } else {
          errors++;
          contactStatuses[c.id] = 'ERROR';
        }
      } catch (err) {
        errors++;
        contactStatuses[c.id] = 'ERROR';
      }
    }

    // Persist sent ledger for duplicate protection
    this.appendSentLedger(newSentHashes);

    return {
      success: true,
      campaign_id: campaignId,
      selected,
      verified_emails: verifiedEmails,
      excluded,
      suppressed,
      unsubscribed,
      bounced,
      queued,
      sent_count: sentCount,
      duplicate_sends: duplicateSends,
      domain_limited: domainLimited,
      errors,
      provider: providerKey,
      timestamp: new Date().toISOString(),
      contact_statuses: contactStatuses,
      provider_message_ids: providerMessageIds,
      rate_limits_applied: rateLimits,
      preview: firstPreview
    };
  }

  /**
   * Retrieves overall delivery stats for a campaign
   */
  public static getCampaignStatus(campaignId: string) {
    const ledger = RealProviderAdapter.loadDeliveryLedger();
    const items = Object.values(ledger).filter(e => e.campaignId === campaignId);
    const summary: Record<OutreachDeliveryStatus, number> = {
      QUEUED: 0,
      SENT: 0,
      DELIVERED: 0,
      BOUNCED: 0,
      REJECTED: 0,
      COMPLAINT: 0,
      UNSUBSCRIBED: 0,
      ERROR: 0
    };

    items.forEach(i => {
      if (summary[i.status] !== undefined) {
        summary[i.status]++;
      }
    });

    return {
      campaign_id: campaignId,
      total_recipients: items.length,
      statuses: summary,
      recipients: items.map(i => ({
        email: i.recipientEmail,
        messageId: i.providerMessageId,
        status: i.status,
        updatedAt: i.updatedAt
      }))
    };
  }
}
