/**
 * ATLAS HOT CLIENTS SERVICE V1
 * @server/services/commercial/AtlasHotClientsService.ts
 *
 * Deterministic commercial intent layer for Mi Base prospects:
 * Classifies prospects into:
 * - 💎 CUSTOMER (Highest priority: PAYMENT_CONFIRMED / commercial_status === 'CUSTOMER')
 * - 🔥 HOT (CHECKOUT_STARTED, EMAIL_RESPONDED, OFFER_REDEEMED, or PRODUCT_INTERESTED + BUSINESS_CONTACTED)
 * - 🟠 WARM (PRODUCT_INTERESTED, BUSINESS_CONTACTED, REPEATED_PRODUCT_VISIT >= 2, COMMUNITY_ACTIVATED with commercial relation)
 * - ⚪ STANDARD (No strong signals, or weak signals alone like email sent/opened, single visit)
 *
 * INVARIANTS:
 * - ZERO external AI dependency.
 * - ZERO fake/invented probabilities (NO "87% probability", "AI predicts purchase").
 * - Fully explainable: Every HOT/WARM client has a clear human reason.
 * - Intent Layer != Commercial Status: Preserves NEW, PROSPECT, CONTACTED, RESPONDED, CUSTOMER, DISCARDED.
 * - Cooldown: Signals older than 14 days cool down (HOT -> WARM).
 * - Real / Test metrics strictly isolated.
 */

import pg from 'pg';

export type CommercialIntentLevel = 'HOT' | 'WARM' | 'STANDARD' | 'CUSTOMER';

export interface CommercialSignalEvent {
  signal_id: string;
  signal_type: string;
  label: string;
  product_name?: string | null;
  created_at: string;
  relative_time: string;
}

export interface CommercialIntentInfo {
  intent_level: CommercialIntentLevel;
  intent_badge: string;
  intent_reason: string;
  intent_product_context: string | null;
  last_signal_at: string | null;
  last_signal_type: string | null;
  last_signal_label: string | null;
  strong_signals_count: number;
  is_hot: boolean;
  is_warm: boolean;
  is_customer: boolean;
  timeline: CommercialSignalEvent[];
}

export interface RecordCommercialSignalOptions {
  user_id: string;
  saved_relation_id?: string | null;
  contact_id?: string | null;
  organization_id?: string | null;
  product_id?: string | null;
  product_name?: string | null;
  signal_type: string;
  signal_payload?: Record<string, any>;
  environment?: 'REAL' | 'TEST_NON_PRODUCTION';
}

export class AtlasHotClientsService {
  private dbPool: pg.Pool;
  private schemaReady = false;

  // Configurable cooldown in days (default: 14 days)
  private readonly COOLDOWN_DAYS = 14;

  constructor(dbPool: pg.Pool) {
    this.dbPool = dbPool;
  }

  async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    const client = await this.dbPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.atlas_commercial_signals (
          signal_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          saved_relation_id UUID NULL,
          contact_id UUID NULL,
          organization_id UUID NULL,
          product_id UUID NULL,
          product_name TEXT NULL,
          signal_type VARCHAR(64) NOT NULL,
          signal_payload JSONB NOT NULL DEFAULT '{}',
          environment VARCHAR(32) NOT NULL DEFAULT 'REAL',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_comm_sig_user ON public.atlas_commercial_signals(user_id);
        CREATE INDEX IF NOT EXISTS idx_comm_sig_saved ON public.atlas_commercial_signals(saved_relation_id);
        CREATE INDEX IF NOT EXISTS idx_comm_sig_type ON public.atlas_commercial_signals(signal_type);
        CREATE INDEX IF NOT EXISTS idx_comm_sig_env ON public.atlas_commercial_signals(environment);
      `);
      this.schemaReady = true;
    } finally {
      client.release();
    }
  }

  /**
   * Helper to format relative time in Spanish
   */
  private formatRelativeTime(dateStr: string): string {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Hace un momento';
    if (diffMins < 60) return `Hace ${diffMins} min`;
    if (diffHours < 24) return `Hace ${diffHours} h`;
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 30) return `Hace ${diffDays} días`;
    return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
  }

  /**
   * Translates signal types to readable human labels
   */
  private getSignalHumanLabel(signalType: string, productName?: string | null): string {
    switch (signalType) {
      case 'CHECKOUT_STARTED':
        return productName ? `Inició compra de ${productName}` : 'Inició una compra';
      case 'EMAIL_RESPONDED':
        return 'Respondió tu contacto comercial';
      case 'OFFER_REDEEMED':
        return productName ? `Canjeó la oferta: ${productName}` : 'Canjeó tu oferta';
      case 'PRODUCT_INTERESTED':
        return productName ? `Marcó "Me interesa" en ${productName}` : 'Mostró interés en tu producto';
      case 'BUSINESS_CONTACTED':
        return 'Contactó tu negocio';
      case 'PAYMENT_CONFIRMED':
        return productName ? `Pago confirmado de ${productName}` : 'Pago confirmado (Cliente)';
      case 'REPEATED_PRODUCT_VISIT':
        return productName ? `Volvió a ver ${productName}` : 'Visitó el producto varias veces';
      case 'COMMUNITY_ACTIVATED':
        return 'Activó su comunidad comercial';
      case 'ADDED_TO_MIBASE':
        return 'Guardado en Mi Base';
      case 'SINGLE_VISIT':
        return 'Visitó tu perfil';
      case 'EMAIL_OPENED':
        return 'Email abierto';
      case 'EMAIL_SENT':
        return 'Email enviado';
      default:
        return signalType.replace(/_/g, ' ').toLowerCase();
    }
  }

  /**
   * Deterministic Intent Classifier
   */
  public evaluateCommercialIntent(params: {
    commercial_status: string;
    signals: Array<{
      signal_id: string;
      signal_type: string;
      product_name?: string | null;
      created_at: string;
      signal_payload?: any;
    }>;
    saved_at?: string;
  }): CommercialIntentInfo {
    const { commercial_status, signals, saved_at } = params;

    // 1. Sort signals by created_at DESC
    const sortedSignals = [...signals].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const now = Date.now();
    const cooldownMs = this.COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

    // Separate signals by recency
    const recentSignals = sortedSignals.filter(
      s => (now - new Date(s.created_at).getTime()) <= cooldownMs
    );
    const olderSignals = sortedSignals.filter(
      s => (now - new Date(s.created_at).getTime()) > cooldownMs
    );

    // Build timeline events
    const timeline: CommercialSignalEvent[] = sortedSignals.map(s => ({
      signal_id: s.signal_id,
      signal_type: s.signal_type,
      label: this.getSignalHumanLabel(s.signal_type, s.product_name),
      product_name: s.product_name || null,
      created_at: s.created_at,
      relative_time: this.formatRelativeTime(s.created_at)
    }));

    // If no signals, add default saved event if saved_at exists
    if (timeline.length === 0 && saved_at) {
      timeline.push({
        signal_id: 'init_saved',
        signal_type: 'ADDED_TO_MIBASE',
        label: 'Guardado en Mi Base',
        product_name: null,
        created_at: saved_at,
        relative_time: this.formatRelativeTime(saved_at)
      });
    }

    const latestSignal = sortedSignals[0] || null;
    const lastSignalAt = latestSignal ? latestSignal.created_at : (saved_at || null);
    const lastSignalType = latestSignal ? latestSignal.signal_type : (saved_at ? 'ADDED_TO_MIBASE' : null);
    const lastSignalLabel = lastSignalAt ? this.formatRelativeTime(lastSignalAt) : null;

    // Find main product context if any
    const productSignal = sortedSignals.find(s => Boolean(s.product_name));
    const intentProductContext = productSignal ? `Interesado en: ${productSignal.product_name}` : null;

    // Count strong signals
    const strongTypes = new Set(['CHECKOUT_STARTED', 'EMAIL_RESPONDED', 'OFFER_REDEEMED', 'PRODUCT_INTERESTED', 'BUSINESS_CONTACTED', 'PAYMENT_CONFIRMED']);
    const strongSignalsCount = sortedSignals.filter(s => strongTypes.has(s.signal_type)).length;

    // ─── RULE 1: CUSTOMER PRIORITY ─────────────────────────────────────────
    const hasPayment = sortedSignals.some(s => s.signal_type === 'PAYMENT_CONFIRMED');
    if (commercial_status === 'CUSTOMER' || hasPayment) {
      return {
        intent_level: 'CUSTOMER',
        intent_badge: '💎 Cliente',
        intent_reason: hasPayment ? 'Pago confirmado' : 'Cliente registrado',
        intent_product_context: intentProductContext,
        last_signal_at: lastSignalAt,
        last_signal_type: lastSignalType,
        last_signal_label: lastSignalLabel,
        strong_signals_count: strongSignalsCount,
        is_hot: false,
        is_warm: false,
        is_customer: true,
        timeline
      };
    }

    // ─── RULE 2: HOT EVALUATION (Recent strong signals) ───────────────────
    const hasRecentCheckout = recentSignals.some(s => s.signal_type === 'CHECKOUT_STARTED');
    const hasRecentEmailResponse = recentSignals.some(s => s.signal_type === 'EMAIL_RESPONDED');
    const hasRecentOfferRedeemed = recentSignals.some(s => s.signal_type === 'OFFER_REDEEMED');
    const hasRecentProductInterest = recentSignals.some(s => s.signal_type === 'PRODUCT_INTERESTED');
    const hasRecentBizContact = recentSignals.some(s => s.signal_type === 'BUSINESS_CONTACTED');
    const repeatedVisits = recentSignals.filter(s => s.signal_type === 'REPEATED_PRODUCT_VISIT' || s.signal_type === 'CONTENT_VIEWED').length;

    if (hasRecentCheckout) {
      return {
        intent_level: 'HOT',
        intent_badge: '🔥 Hot',
        intent_reason: 'Inició una compra',
        intent_product_context: intentProductContext,
        last_signal_at: lastSignalAt,
        last_signal_type: 'CHECKOUT_STARTED',
        last_signal_label: lastSignalLabel,
        strong_signals_count: strongSignalsCount,
        is_hot: true,
        is_warm: false,
        is_customer: false,
        timeline
      };
    }

    if (hasRecentEmailResponse) {
      return {
        intent_level: 'HOT',
        intent_badge: '🔥 Hot',
        intent_reason: 'Respondió tu contacto',
        intent_product_context: intentProductContext,
        last_signal_at: lastSignalAt,
        last_signal_type: 'EMAIL_RESPONDED',
        last_signal_label: lastSignalLabel,
        strong_signals_count: strongSignalsCount,
        is_hot: true,
        is_warm: false,
        is_customer: false,
        timeline
      };
    }

    if (hasRecentOfferRedeemed) {
      return {
        intent_level: 'HOT',
        intent_badge: '🔥 Hot',
        intent_reason: 'Canjeó tu oferta',
        intent_product_context: intentProductContext,
        last_signal_at: lastSignalAt,
        last_signal_type: 'OFFER_REDEEMED',
        last_signal_label: lastSignalLabel,
        strong_signals_count: strongSignalsCount,
        is_hot: true,
        is_warm: false,
        is_customer: false,
        timeline
      };
    }

    if (hasRecentProductInterest && hasRecentBizContact) {
      return {
        intent_level: 'HOT',
        intent_badge: '🔥 Hot',
        intent_reason: 'Mostró interés y contactó tu negocio',
        intent_product_context: intentProductContext,
        last_signal_at: lastSignalAt,
        last_signal_type: 'BUSINESS_CONTACTED',
        last_signal_label: lastSignalLabel,
        strong_signals_count: strongSignalsCount,
        is_hot: true,
        is_warm: false,
        is_customer: false,
        timeline
      };
    }

    if (repeatedVisits >= 3) {
      return {
        intent_level: 'HOT',
        intent_badge: '🔥 Hot',
        intent_reason: `Volvió a ver la propuesta ${repeatedVisits} veces`,
        intent_product_context: intentProductContext,
        last_signal_at: lastSignalAt,
        last_signal_type: 'REPEATED_PRODUCT_VISIT',
        last_signal_label: lastSignalLabel,
        strong_signals_count: strongSignalsCount,
        is_hot: true,
        is_warm: false,
        is_customer: false,
        timeline
      };
    }

    // ─── RULE 3: WARM EVALUATION ──────────────────────────────────────────
    if (hasRecentProductInterest) {
      const pName = recentSignals.find(s => s.signal_type === 'PRODUCT_INTERESTED')?.product_name;
      return {
        intent_level: 'WARM',
        intent_badge: '🟠 Warm',
        intent_reason: pName ? `Mostró interés en ${pName}` : 'Mostró interés en este producto',
        intent_product_context: intentProductContext,
        last_signal_at: lastSignalAt,
        last_signal_type: 'PRODUCT_INTERESTED',
        last_signal_label: lastSignalLabel,
        strong_signals_count: strongSignalsCount,
        is_hot: false,
        is_warm: true,
        is_customer: false,
        timeline
      };
    }

    if (hasRecentBizContact) {
      return {
        intent_level: 'WARM',
        intent_badge: '🟠 Warm',
        intent_reason: 'Contactó tu negocio',
        intent_product_context: intentProductContext,
        last_signal_at: lastSignalAt,
        last_signal_type: 'BUSINESS_CONTACTED',
        last_signal_label: lastSignalLabel,
        strong_signals_count: strongSignalsCount,
        is_hot: false,
        is_warm: true,
        is_customer: false,
        timeline
      };
    }

    if (repeatedVisits >= 2) {
      return {
        intent_level: 'WARM',
        intent_badge: '🟠 Warm',
        intent_reason: 'Visitó tu propuesta varias veces',
        intent_product_context: intentProductContext,
        last_signal_at: lastSignalAt,
        last_signal_type: 'REPEATED_PRODUCT_VISIT',
        last_signal_label: lastSignalLabel,
        strong_signals_count: strongSignalsCount,
        is_hot: false,
        is_warm: true,
        is_customer: false,
        timeline
      };
    }

    const hasRecentCommunityActivated = recentSignals.some(s => s.signal_type === 'COMMUNITY_ACTIVATED');
    if (hasRecentCommunityActivated) {
      return {
        intent_level: 'WARM',
        intent_badge: '🟠 Warm',
        intent_reason: 'Miembro activo de la comunidad',
        intent_product_context: intentProductContext,
        last_signal_at: lastSignalAt,
        last_signal_type: 'COMMUNITY_ACTIVATED',
        last_signal_label: lastSignalLabel,
        strong_signals_count: strongSignalsCount,
        is_hot: false,
        is_warm: true,
        is_customer: false,
        timeline
      };
    }

    // ─── RULE 4: COOLDOWN (Older hot signals become Warm) ─────────────────
    const hasOlderHotSignal = olderSignals.some(s =>
      ['CHECKOUT_STARTED', 'EMAIL_RESPONDED', 'OFFER_REDEEMED', 'PRODUCT_INTERESTED', 'BUSINESS_CONTACTED'].includes(s.signal_type)
    );
    if (hasOlderHotSignal) {
      return {
        intent_level: 'WARM',
        intent_badge: '🟠 Warm',
        intent_reason: 'Intención previa (enfriándose)',
        intent_product_context: intentProductContext,
        last_signal_at: lastSignalAt,
        last_signal_type: lastSignalType,
        last_signal_label: lastSignalLabel,
        strong_signals_count: strongSignalsCount,
        is_hot: false,
        is_warm: true,
        is_customer: false,
        timeline
      };
    }

    // ─── RULE 5: STANDARD (Weak signals only or no signals) ───────────────
    // Weak signals: EMAIL_SENT, EMAIL_DELIVERED, EMAIL_OPENED, SINGLE_VISIT, BARRIO_FOLLOWED, CATEGORY_FOLLOWED, ADDED_TO_MIBASE
    return {
      intent_level: 'STANDARD',
      intent_badge: '⚪ Estándar',
      intent_reason: 'Sin señales comerciales recientes',
      intent_product_context: intentProductContext,
      last_signal_at: lastSignalAt,
      last_signal_type: lastSignalType,
      last_signal_label: lastSignalLabel,
      strong_signals_count: 0,
      is_hot: false,
      is_warm: false,
      is_customer: false,
      timeline
    };
  }

  /**
   * Records a physical commercial signal in the database and triggers Atlas learning event
   */
  async recordCommercialSignal(options: RecordCommercialSignalOptions): Promise<{
    success: boolean;
    signal_id: string;
    signal_type: string;
  }> {
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      const environment = options.environment || 'REAL';
      const res = await client.query(`
        INSERT INTO public.atlas_commercial_signals (
          user_id, saved_relation_id, contact_id, organization_id, product_id, product_name,
          signal_type, signal_payload, environment, created_at
        ) VALUES (
          $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
        ) RETURNING signal_id, signal_type;
      `, [
        options.user_id,
        options.saved_relation_id || null,
        options.contact_id || null,
        options.organization_id || null,
        options.product_id || null,
        options.product_name || null,
        options.signal_type,
        JSON.stringify(options.signal_payload || {}),
        environment
      ]);

      const signal = res.rows[0];

      // Also log into atlas_local_events for normalized cross-product audit
      await client.query(`
        INSERT INTO public.atlas_local_events (
          event_type, user_id, content_type, content_id, environment
        ) VALUES ($1, $2, 'COMMERCIAL_SIGNAL', $3, $4);
      `, [
        options.signal_type,
        options.user_id,
        options.product_name || options.signal_type,
        environment
      ]);

      return {
        success: true,
        signal_id: signal.signal_id,
        signal_type: signal.signal_type
      };
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves signals for a specific user / saved relation
   */
  async getSignalsForRelation(savedRelationId: string, environment = 'REAL'): Promise<any[]> {
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      const res = await client.query(`
        SELECT signal_id, signal_type, product_name, signal_payload, created_at
        FROM public.atlas_commercial_signals
        WHERE saved_relation_id = $1::uuid AND environment = $2
        ORDER BY created_at DESC;
      `, [savedRelationId, environment]);
      return res.rows;
    } finally {
      client.release();
    }
  }

  /**
   * Batch retrieves signals for multiple saved relation IDs
   */
  async getSignalsMap(savedRelationIds: string[], environment = 'REAL'): Promise<Record<string, any[]>> {
    if (savedRelationIds.length === 0) return {};
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      const res = await client.query(`
        SELECT signal_id, saved_relation_id, signal_type, product_name, signal_payload, created_at
        FROM public.atlas_commercial_signals
        WHERE saved_relation_id = ANY($1::uuid[]) AND environment = $2
        ORDER BY created_at DESC;
      `, [savedRelationIds, environment]);

      const map: Record<string, any[]> = {};
      for (const id of savedRelationIds) {
        map[id] = [];
      }
      for (const row of res.rows) {
        if (row.saved_relation_id) {
          if (!map[row.saved_relation_id]) map[row.saved_relation_id] = [];
          map[row.saved_relation_id].push(row);
        }
      }
      return map;
    } finally {
      client.release();
    }
  }

  /**
   * Calculates physical counts for Mi Base counter
   */
  async getHotClientsCounter(userId: string, environment = 'REAL'): Promise<{
    hot_count: number;
    warm_count: number;
    customer_count: number;
    standard_count: number;
    total_count: number;
  }> {
    await this.ensureSchema();
    const client = await this.dbPool.connect();
    try {
      // 1. Fetch all user saved relations
      const relsRes = await client.query(`
        SELECT id, commercial_status, saved_at
        FROM public.atlas_user_saved_relations
        WHERE user_id = $1::uuid;
      `, [userId]);

      const relIds = relsRes.rows.map(r => r.id);
      const signalsMap = await this.getSignalsMap(relIds, environment);

      let hotCount = 0;
      let warmCount = 0;
      let customerCount = 0;
      let standardCount = 0;

      for (const r of relsRes.rows) {
        const signals = signalsMap[r.id] || [];
        const evaluation = this.evaluateCommercialIntent({
          commercial_status: r.commercial_status || 'NEW',
          signals,
          saved_at: r.saved_at
        });

        if (evaluation.intent_level === 'CUSTOMER') customerCount++;
        else if (evaluation.intent_level === 'HOT') hotCount++;
        else if (evaluation.intent_level === 'WARM') warmCount++;
        else standardCount++;
      }

      return {
        hot_count: hotCount,
        warm_count: warmCount,
        customer_count: customerCount,
        standard_count: standardCount,
        total_count: relsRes.rows.length
      };
    } finally {
      client.release();
    }
  }
}
