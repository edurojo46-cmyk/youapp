/**
 * ATLAS COMMUNITY ACQUISITION BRIDGE SERVICE V1
 * @server/services/acquisition/AtlasCommunityAcquisitionBridgeService.ts
 *
 * Implements first-party acquisition attribution connecting:
 * ATLAS CONTACT -> CAMPAIGN LINK -> INDUSTRIAL VISIT -> SIGNUP -> COMMUNITY ACTIVATION
 *
 * STRICT INVARIANTS:
 * - DO NOT SEND: Physical email send is 0. EMAILS_SENT = 0, EMAILS_DELIVERED = 0.
 * - ZERO PII in URL: Campaign token is opaque (e.g. acq_...), no emails/ids visible.
 * - Server-side resolution only.
 * - Identity separation: CONTACT_IDENTITY != USER_IDENTITY until confirmed authenticated signup.
 * - Certified Activation definition reused (>=1 neighborhood, >=1 category, >=1 business follow).
 * - Duplicate activations blocked: Idempotent attribution.
 * - Permissions separated: Relationship != Communication Permission.
 * - Test/Real data strictly isolated.
 */

import crypto from 'crypto';
import pg from 'pg';

export interface CreateAcquisitionTokenOptions {
  campaign_id: string;
  source?: string; // Default: 'ATLAS_MAIL'
  segment_id: string;
  contact_id?: string | null;
  contact_email?: string | null;
  landing_context?: {
    barrio_id?: string;
    target_path?: string;
    [key: string]: any;
  };
  environment?: 'REAL' | 'TEST_NON_PRODUCTION';
  expires_in_days?: number;
}

export interface AcquisitionTokenRecord {
  token: string;
  campaign_id: string;
  source: string;
  segment_id: string;
  contact_id: string | null;
  contact_email_hash: string | null;
  landing_context: Record<string, any>;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  environment: 'REAL' | 'TEST_NON_PRODUCTION';
  created_at: string;
  expires_at: string;
}

export interface AcquisitionFunnelMetrics {
  CONTACTS_SELECTED: number;
  EMAILS_SENT: number;
  EMAILS_DELIVERED: number;
  LINK_VISITS: number;
  UNIQUE_VISITORS: number;
  SIGNUPS: number;
  COMMUNITY_ACTIVATED_USERS: number;
  VISIT_TO_SIGNUP_RATE: number | null;
  SIGNUP_TO_ACTIVATION_RATE: number | null;
  CONTACT_TO_ACTIVATION_RATE: number | null;
}

export interface SegmentOutcomeSignal {
  segment_id: string;
  campaign_id: string;
  contacts_selected: number;
  visits: number;
  signups: number;
  activated_users: number;
  visit_to_signup_rate: number | null;
  signup_to_activation_rate: number | null;
  contact_to_activation_rate: number | null;
}

export class AtlasCommunityAcquisitionBridgeService {
  private dbPool: pg.Pool;
  private schemaReady = false;

  constructor(dbPool: pg.Pool) {
    this.dbPool = dbPool;
  }

  /**
   * Ensure database schema for acquisition tokens, events, and user attribution exists.
   */
  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    const client = await this.dbPool.connect();
    try {
      await client.query(`
        -- 1. Campaign Acquisition Tokens (Server-side storage of opaque links)
        CREATE TABLE IF NOT EXISTS public.atlas_acquisition_campaign_tokens (
          token VARCHAR(64) PRIMARY KEY,
          campaign_id VARCHAR(128) NOT NULL,
          source VARCHAR(32) NOT NULL DEFAULT 'ATLAS_MAIL',
          segment_id VARCHAR(128) NOT NULL,
          contact_id UUID NULL,
          contact_email_hash TEXT NULL,
          landing_context JSONB NOT NULL DEFAULT '{"barrio_id": "caballito", "target_path": "/local/caballito"}',
          status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
          environment VARCHAR(32) NOT NULL DEFAULT 'REAL',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days'
        );
        CREATE INDEX IF NOT EXISTS idx_acq_campaign_id ON public.atlas_acquisition_campaign_tokens(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_acq_segment_id ON public.atlas_acquisition_campaign_tokens(segment_id);
        CREATE INDEX IF NOT EXISTS idx_acq_contact_id ON public.atlas_acquisition_campaign_tokens(contact_id);
        CREATE INDEX IF NOT EXISTS idx_acq_env ON public.atlas_acquisition_campaign_tokens(environment);

        -- 2. Acquisition Attribution Events (First-party event log)
        CREATE TABLE IF NOT EXISTS public.atlas_acquisition_events (
          event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          event_type VARCHAR(64) NOT NULL,
          token VARCHAR(64) NOT NULL REFERENCES public.atlas_acquisition_campaign_tokens(token) ON DELETE CASCADE,
          campaign_id VARCHAR(128) NOT NULL,
          segment_id VARCHAR(128) NOT NULL,
          visitor_session_id VARCHAR(64) NULL,
          user_id UUID NULL,
          contact_id UUID NULL,
          environment VARCHAR(32) NOT NULL DEFAULT 'REAL',
          metadata JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_acq_events_token ON public.atlas_acquisition_events(token);
        CREATE INDEX IF NOT EXISTS idx_acq_events_user ON public.atlas_acquisition_events(user_id);
        CREATE INDEX IF NOT EXISTS idx_acq_events_type ON public.atlas_acquisition_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_acq_events_env ON public.atlas_acquisition_events(environment);

        -- 3. User Acquisition Attribution (1-to-1 linkage prevents duplicate signup/activation)
        CREATE TABLE IF NOT EXISTS public.atlas_acquisition_user_attribution (
          user_id UUID PRIMARY KEY,
          token VARCHAR(64) NOT NULL REFERENCES public.atlas_acquisition_campaign_tokens(token),
          campaign_id VARCHAR(128) NOT NULL,
          segment_id VARCHAR(128) NOT NULL,
          contact_id UUID NULL,
          attributed_at TIMESTAMPTZ DEFAULT NOW(),
          activated_at TIMESTAMPTZ NULL,
          environment VARCHAR(32) NOT NULL DEFAULT 'REAL'
        );
        CREATE INDEX IF NOT EXISTS idx_acq_user_attr_token ON public.atlas_acquisition_user_attribution(token);
        CREATE INDEX IF NOT EXISTS idx_acq_user_attr_campaign ON public.atlas_acquisition_user_attribution(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_acq_user_attr_segment ON public.atlas_acquisition_user_attribution(segment_id);
      `);
      this.schemaReady = true;
    } finally {
      client.release();
    }
  }

  /**
   * Creates an opaque, revocable campaign acquisition token.
   * Never exposes email, user_id, person_id, or organization_id in URL.
   */
  async createAcquisitionToken(options: CreateAcquisitionTokenOptions): Promise<{
    token: string;
    deep_link: string;
    campaign_id: string;
    segment_id: string;
    environment: string;
    expires_at: string;
  }> {
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      const token = `acq_${crypto.randomBytes(12).toString('hex')}`;
      const campaignId = options.campaign_id;
      const source = options.source || 'ATLAS_MAIL';
      const segmentId = options.segment_id;
      const environment = options.environment || 'REAL';
      const expiresInDays = options.expires_in_days || 30;

      let contactEmailHash: string | null = null;
      let contactId: string | null = options.contact_id || null;

      if (options.contact_email) {
        contactEmailHash = crypto.createHash('sha256')
          .update(options.contact_email.trim().toLowerCase())
          .digest('hex');
        
        // If contact_id was not explicitly passed, try to reuse existing atlas_contacts record
        if (!contactId) {
          const cRes = await client.query(`
            SELECT contact_id FROM public.atlas_contacts WHERE email_hash = $1 LIMIT 1;
          `, [contactEmailHash]);
          if (cRes.rows.length > 0) {
            contactId = cRes.rows[0].contact_id;
          }
        }
      }

      const landingContext = options.landing_context || {
        barrio_id: 'caballito',
        target_path: '/local/caballito'
      };

      const res = await client.query(`
        INSERT INTO public.atlas_acquisition_campaign_tokens (
          token, campaign_id, source, segment_id, contact_id, contact_email_hash,
          landing_context, status, environment, created_at, expires_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, 'ACTIVE', $8, NOW(), NOW() + ($9 || ' days')::INTERVAL
        ) RETURNING token, campaign_id, segment_id, environment, expires_at;
      `, [
        token,
        campaignId,
        source,
        segmentId,
        contactId,
        contactEmailHash,
        JSON.stringify(landingContext),
        environment,
        expiresInDays
      ]);

      const row = res.rows[0];
      const targetPath = landingContext.target_path || '/local/caballito';
      const deepLink = `${targetPath}?acq=${token}`;

      return {
        token: row.token,
        deep_link: deepLink,
        campaign_id: row.campaign_id,
        segment_id: row.segment_id,
        environment: row.environment,
        expires_at: row.expires_at
      };
    } finally {
      client.release();
    }
  }

  /**
   * Resolves an acquisition token server-side on visit.
   * Records CAMPAIGN_VISIT event.
   * Returns non-sensitive landing context ONLY.
   */
  async resolveAcquisitionToken(
    token: string,
    visitorSessionId?: string | null,
    environment = 'REAL'
  ): Promise<{
    valid: boolean;
    landing_context?: Record<string, any>;
    error?: string;
  }> {
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      const res = await client.query(`
        SELECT token, campaign_id, segment_id, contact_id, landing_context, status, environment, expires_at
        FROM public.atlas_acquisition_campaign_tokens
        WHERE token = $1;
      `, [token]);

      if (res.rows.length === 0) {
        return { valid: false, error: 'TOKEN_NOT_FOUND' };
      }

      const row = res.rows[0];

      if (row.status !== 'ACTIVE') {
        return { valid: false, error: `TOKEN_${row.status}` };
      }

      if (new Date(row.expires_at) < new Date()) {
        return { valid: false, error: 'TOKEN_EXPIRED' };
      }

      const effectiveEnv = row.environment || environment;

      // Record first-party CAMPAIGN_VISIT event
      await client.query(`
        INSERT INTO public.atlas_acquisition_events (
          event_type, token, campaign_id, segment_id, visitor_session_id, contact_id, environment
        ) VALUES ('CAMPAIGN_VISIT', $1, $2, $3, $4, $5, $6);
      `, [
        token,
        row.campaign_id,
        row.segment_id,
        visitorSessionId || null,
        row.contact_id || null,
        effectiveEnv
      ]);

      // Also log into atlas_local_events for normalized audit
      await client.query(`
        INSERT INTO public.atlas_local_events (
          event_type, share_id, barrio_id, content_type, content_id, environment
        ) VALUES ('CAMPAIGN_VISIT', $1, $2, 'ACQUISITION_TOKEN', $3, $4);
      `, [
        token,
        row.landing_context?.barrio_id || 'caballito',
        row.segment_id,
        effectiveEnv
      ]);

      return {
        valid: true,
        landing_context: row.landing_context
      };
    } finally {
      client.release();
    }
  }

  /**
   * Attributed authenticated user signup to the campaign token.
   * Records CAMPAIGN_SIGNUP event.
   * Strictly maintains separation: does NOT copy contact PII into user profile.
   * Idempotent: blocks duplicate attribution per user.
   */
  async attributeSignup(
    token: string,
    userId: string,
    environment = 'REAL'
  ): Promise<{
    success: boolean;
    already_attributed?: boolean;
    error?: string;
  }> {
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      // 1. Validate token
      const tokenRes = await client.query(`
        SELECT token, campaign_id, segment_id, contact_id, environment
        FROM public.atlas_acquisition_campaign_tokens
        WHERE token = $1;
      `, [token]);

      if (tokenRes.rows.length === 0) {
        return { success: false, error: 'TOKEN_NOT_FOUND' };
      }

      const tokenRow = tokenRes.rows[0];
      const effectiveEnv = tokenRow.environment || environment;

      // 2. Check if user is already attributed
      const existingUser = await client.query(`
        SELECT user_id, token, campaign_id FROM public.atlas_acquisition_user_attribution
        WHERE user_id = $1::uuid;
      `, [userId]);

      if (existingUser.rows.length > 0) {
        return { success: true, already_attributed: true };
      }

      // 3. Insert user attribution record (1-to-1)
      await client.query(`
        INSERT INTO public.atlas_acquisition_user_attribution (
          user_id, token, campaign_id, segment_id, contact_id, environment
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id) DO NOTHING;
      `, [
        userId,
        token,
        tokenRow.campaign_id,
        tokenRow.segment_id,
        tokenRow.contact_id || null,
        effectiveEnv
      ]);

      // 4. Log CAMPAIGN_SIGNUP event
      await client.query(`
        INSERT INTO public.atlas_acquisition_events (
          event_type, token, campaign_id, segment_id, user_id, contact_id, environment
        ) VALUES ('CAMPAIGN_SIGNUP', $1, $2, $3, $4::uuid, $5, $6);
      `, [
        token,
        tokenRow.campaign_id,
        tokenRow.segment_id,
        userId,
        tokenRow.contact_id || null,
        effectiveEnv
      ]);

      await client.query(`
        INSERT INTO public.atlas_local_events (
          event_type, share_id, user_id, barrio_id, content_type, content_id, environment
        ) VALUES ('CAMPAIGN_SIGNUP', $1, $2, 'caballito', 'ACQUISITION_TOKEN', $3, $4);
      `, [
        token,
        userId,
        tokenRow.segment_id,
        effectiveEnv
      ]);

      return { success: true, already_attributed: false };
    } finally {
      client.release();
    }
  }

  /**
   * Checks whether an attributed user has met the Certified Community Activation condition:
   * >= 1 neighborhood follow + >= 1 category follow + >= 1 business follow.
   * If yes and not already activated, records COMMUNITY_ACTIVATED event and updates attribution.
   * Idempotent: DUPLICATE_ACTIVATION_COUNT_BLOCKED.
   */
  async checkAndRecordActivation(
    userId: string,
    environment = 'REAL'
  ): Promise<{
    is_activated: boolean;
    just_activated: boolean;
    error?: string;
  }> {
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      // 1. Verify user has an acquisition record
      const attrRes = await client.query(`
        SELECT user_id, token, campaign_id, segment_id, contact_id, activated_at, environment
        FROM public.atlas_acquisition_user_attribution
        WHERE user_id = $1::uuid;
      `, [userId]);

      if (attrRes.rows.length === 0) {
        return { is_activated: false, just_activated: false };
      }

      const attr = attrRes.rows[0];
      const effectiveEnv = attr.environment || environment;

      // 2. Query physical relationships for activation check
      const neighRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_neighborhood_follows
        WHERE user_id = $1::text AND status = 'ACTIVE';
      `, [userId]);
      const nFollows = parseInt(neighRes.rows[0].count, 10);

      const catRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_category_follows
        WHERE user_id = $1::text AND status = 'ACTIVE';
      `, [userId]);
      const cFollows = parseInt(catRes.rows[0].count, 10);

      const busRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_local_business_follows
        WHERE user_id = $1::uuid AND status = 'ACTIVE';
      `, [userId]);
      const bFollows = parseInt(busRes.rows[0].count, 10);

      const isActivated = (nFollows >= 1) && (cFollows >= 1) && (bFollows >= 1);

      if (!isActivated) {
        return { is_activated: false, just_activated: false };
      }

      // 3. If already activated, block duplicate count
      if (attr.activated_at !== null) {
        return { is_activated: true, just_activated: false };
      }

      // 4. Mark activation in ledger
      await client.query(`
        UPDATE public.atlas_acquisition_user_attribution
        SET activated_at = NOW()
        WHERE user_id = $1::uuid;
      `, [userId]);

      // 5. Emit COMMUNITY_ACTIVATED event in acquisition events
      await client.query(`
        INSERT INTO public.atlas_acquisition_events (
          event_type, token, campaign_id, segment_id, user_id, contact_id, environment
        ) VALUES ('COMMUNITY_ACTIVATED', $1, $2, $3, $4::uuid, $5, $6);
      `, [
        attr.token,
        attr.campaign_id,
        attr.segment_id,
        userId,
        attr.contact_id || null,
        effectiveEnv
      ]);

      // 6. Emit normalized event in atlas_local_events
      await client.query(`
        INSERT INTO public.atlas_local_events (
          event_type, share_id, user_id, barrio_id, content_type, content_id, environment
        ) VALUES ('COMMUNITY_ACTIVATED', $1, $2, 'caballito', 'ACQUISITION_SEGMENT', $3, $4);
      `, [
        attr.token,
        userId,
        attr.segment_id,
        effectiveEnv
      ]);

      // 7. Emit Atlas feedback signal for segment learning
      try {
        await client.query(`
          INSERT INTO public.atlas_execution_outcomes (
            outcome_id, tenant_id, execution_id, event_type, correlation_tag, event_timestamp, event_payload
          ) VALUES (
            gen_random_uuid(), $1::uuid, gen_random_uuid(), 'COMMUNITY_ACTIVATED', $2, NOW(), $3
          );
        `, [
          userId,
          attr.segment_id,
          JSON.stringify({
            campaign_id: attr.campaign_id,
            segment_id: attr.segment_id,
            user_id: userId,
            contact_id: attr.contact_id,
            environment: effectiveEnv
          })
        ]);
      } catch (feedbackErr) {
        console.warn('[AcquisitionBridge] Feedback emission note:', feedbackErr);
      }

      return { is_activated: true, just_activated: true };
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves funnel metrics:
   * CONTACTS_SELECTED
   * EMAILS_SENT (0)
   * EMAILS_DELIVERED (0)
   * LINK_VISITS
   * SIGNUPS
   * COMMUNITY_ACTIVATED_USERS
   * Conversion rates (calculated only when denominator > 0; null otherwise).
   */
  async getFunnelMetrics(
    campaignId?: string,
    environment = 'REAL'
  ): Promise<AcquisitionFunnelMetrics> {
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      const envFilter = "environment = $1";
      const params: any[] = [environment];

      let campaignTokenFilter = "";
      let campaignEventFilter = "";
      let campaignAttrFilter = "";

      if (campaignId) {
        params.push(campaignId);
        campaignTokenFilter = ` AND campaign_id = $2`;
        campaignEventFilter = ` AND campaign_id = $2`;
        campaignAttrFilter = ` AND campaign_id = $2`;
      }

      // 1. Contacts Selected (Total tokens created representing selected contacts)
      const tokenCountRes = await client.query(`
        SELECT COUNT(*) as count FROM public.atlas_acquisition_campaign_tokens
        WHERE ${envFilter}${campaignTokenFilter};
      `, params);
      const contactsSelected = parseInt(tokenCountRes.rows[0].count, 10);

      // 2. Visits (Total visits & unique tokens visited)
      const visitRes = await client.query(`
        SELECT COUNT(*) as total_visits, COUNT(DISTINCT token) as unique_visitors
        FROM public.atlas_acquisition_events
        WHERE ${envFilter}${campaignEventFilter} AND event_type = 'CAMPAIGN_VISIT';
      `, params);
      const linkVisits = parseInt(visitRes.rows[0].total_visits || '0', 10);
      const uniqueVisitors = parseInt(visitRes.rows[0].unique_visitors || '0', 10);

      // 3. Signups (Distinct authenticated users attributed)
      const signupRes = await client.query(`
        SELECT COUNT(DISTINCT user_id) as count
        FROM public.atlas_acquisition_user_attribution
        WHERE ${envFilter}${campaignAttrFilter};
      `, params);
      const signups = parseInt(signupRes.rows[0].count || '0', 10);

      // 4. Activated Community Users
      const actRes = await client.query(`
        SELECT COUNT(DISTINCT user_id) as count
        FROM public.atlas_acquisition_user_attribution
        WHERE ${envFilter}${campaignAttrFilter} AND activated_at IS NOT NULL;
      `, params);
      const activatedUsers = parseInt(actRes.rows[0].count || '0', 10);

      // 5. Rates calculation with strict UNKNOWN handling (null when denominator is 0)
      const visitToSignupRate = linkVisits > 0
        ? Math.round((signups / linkVisits) * 10000) / 100
        : null;

      const signupToActivationRate = signups > 0
        ? Math.round((activatedUsers / signups) * 10000) / 100
        : null;

      const contactToActivationRate = contactsSelected > 0
        ? Math.round((activatedUsers / contactsSelected) * 10000) / 100
        : null;

      return {
        CONTACTS_SELECTED: contactsSelected,
        EMAILS_SENT: 0,
        EMAILS_DELIVERED: 0,
        LINK_VISITS: linkVisits,
        UNIQUE_VISITORS: uniqueVisitors,
        SIGNUPS: signups,
        COMMUNITY_ACTIVATED_USERS: activatedUsers,
        VISIT_TO_SIGNUP_RATE: visitToSignupRate,
        SIGNUP_TO_ACTIVATION_RATE: signupToActivationRate,
        CONTACT_TO_ACTIVATION_RATE: contactToActivationRate
      };
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves aggregated Segment Learning outcomes for Atlas Intelligence.
   * segment X -> visits -> signups -> activated users.
   */
  async getSegmentOutcomeSignals(
    campaignId?: string,
    environment = 'REAL'
  ): Promise<SegmentOutcomeSignal[]> {
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      const params: any[] = [environment];
      let campaignFilter = "";
      if (campaignId) {
        params.push(campaignId);
        campaignFilter = ` AND t.campaign_id = $2`;
      }

      const res = await client.query(`
        SELECT 
          t.segment_id,
          t.campaign_id,
          COUNT(DISTINCT t.token) as contacts_selected,
          COALESCE(v.visits, 0) as visits,
          COALESCE(s.signups, 0) as signups,
          COALESCE(a.activated_users, 0) as activated_users
        FROM public.atlas_acquisition_campaign_tokens t
        LEFT JOIN (
          SELECT segment_id, COUNT(*) as visits
          FROM public.atlas_acquisition_events
          WHERE event_type = 'CAMPAIGN_VISIT' AND environment = $1
          GROUP BY segment_id
        ) v ON t.segment_id = v.segment_id
        LEFT JOIN (
          SELECT segment_id, COUNT(DISTINCT user_id) as signups
          FROM public.atlas_acquisition_user_attribution
          WHERE environment = $1
          GROUP BY segment_id
        ) s ON t.segment_id = s.segment_id
        LEFT JOIN (
          SELECT segment_id, COUNT(DISTINCT user_id) as activated_users
          FROM public.atlas_acquisition_user_attribution
          WHERE environment = $1 AND activated_at IS NOT NULL
          GROUP BY segment_id
        ) a ON t.segment_id = a.segment_id
        WHERE t.environment = $1 ${campaignFilter}
        GROUP BY t.segment_id, t.campaign_id, v.visits, s.signups, a.activated_users
        ORDER BY activated_users DESC, signups DESC;
      `, params);

      return res.rows.map(r => {
        const contacts = parseInt(r.contacts_selected, 10);
        const visits = parseInt(r.visits, 10);
        const signups = parseInt(r.signups, 10);
        const activated = parseInt(r.activated_users, 10);

        return {
          segment_id: r.segment_id,
          campaign_id: r.campaign_id,
          contacts_selected: contacts,
          visits,
          signups,
          activated_users: activated,
          visit_to_signup_rate: visits > 0 ? Math.round((signups / visits) * 10000) / 100 : null,
          signup_to_activation_rate: signups > 0 ? Math.round((activated / signups) * 10000) / 100 : null,
          contact_to_activation_rate: contacts > 0 ? Math.round((activated / contacts) * 10000) / 100 : null
        };
      });
    } finally {
      client.release();
    }
  }
}
