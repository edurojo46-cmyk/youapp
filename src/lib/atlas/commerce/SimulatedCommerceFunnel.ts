/**
 * ATLAS COMMERCE SIMULATION_ONLY V1
 * Module: SimulatedCommerceFunnel.ts
 * Path: src/lib/atlas/commerce/SimulatedCommerceFunnel.ts
 * 
 * Manages the commercial simulation funnel:
 * PRODUCT_SHOWN
 * → PRODUCT_CLICKED
 * → PURCHASE_LINK_OPENED
 * → CHECKOUT_STARTED
 * → PURCHASE_COMPLETED
 * → PURCHASE_FAILED
 * 
 * All events strictly marked environment = 'SIMULATION'.
 * On PURCHASE_COMPLETED:
 * Stores simulation purchase record without charging payments or contacting external platforms.
 */

import { dbPool } from '../../../../server/db.ts';
import { AtlasCommerceGate } from './AtlasCommerceGate.ts';
import { AtlasCommerceEventDispatcher, CommerceEventType } from './AtlasCommerceEvents.ts';

export interface SimulatedPurchaseRecord {
  purchase_id: string;
  environment: 'SIMULATION';
  seller_id: string;
  product_id: string;
  buyer_id: string;
  match_score: number;
  price: number;
  currency: string;
  metadata?: Record<string, any>;
  occurred_at: string;
}

export interface FunnelStepParams {
  product_id: string;
  buyer_id: string;
  seller_id: string;
  match_score: number;
  price: number;
  currency?: string;
  buyer_type?: 'PERSON' | 'COMPANY';
  metadata?: Record<string, any>;
}

export class SimulatedCommerceFunnel {
  private static instance: SimulatedCommerceFunnel;
  private gate: AtlasCommerceGate;
  private eventDispatcher: AtlasCommerceEventDispatcher;
  private isTableInitialized: boolean = false;

  private constructor() {
    this.gate = AtlasCommerceGate.getInstance();
    this.gate.assertFailClosedIntegrity();
    this.eventDispatcher = AtlasCommerceEventDispatcher.getInstance();
  }

  public static getInstance(): SimulatedCommerceFunnel {
    if (!SimulatedCommerceFunnel.instance) {
      SimulatedCommerceFunnel.instance = new SimulatedCommerceFunnel();
    }
    return SimulatedCommerceFunnel.instance;
  }

  public async initSchema(): Promise<void> {
    if (this.isTableInitialized) return;
    this.gate.assertFailClosedIntegrity();

    try {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS public.atlas_simulated_purchases (
          purchase_id TEXT PRIMARY KEY,
          environment TEXT NOT NULL DEFAULT 'SIMULATION' CHECK (environment = 'SIMULATION'),
          seller_id TEXT NOT NULL,
          product_id TEXT NOT NULL,
          buyer_id TEXT NOT NULL,
          match_score NUMERIC NOT NULL,
          price NUMERIC NOT NULL,
          currency TEXT DEFAULT 'ARS',
          metadata JSONB NOT NULL DEFAULT '{}',
          occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_atlas_sim_purch_buyer ON public.atlas_simulated_purchases(buyer_id);
        CREATE INDEX IF NOT EXISTS idx_atlas_sim_purch_prod ON public.atlas_simulated_purchases(product_id);
      `);
      this.isTableInitialized = true;
    } catch (err) {
      console.warn('[SimulatedCommerceFunnel] initSchema error:', err);
    }
  }

  /**
   * Helper to emit a funnel event with strict environment = 'SIMULATION'.
   */
  public async emitFunnelStep(eventType: CommerceEventType, params: FunnelStepParams): Promise<string> {
    this.gate.assertFailClosedIntegrity();

    const event = await this.eventDispatcher.emitEvent({
      event_type: eventType,
      product_id: params.product_id,
      buyer_id: params.buyer_id,
      seller_id: params.seller_id,
      buyer_type: params.buyer_type || 'COMPANY',
      amount: params.price,
      currency: params.currency || 'ARS',
      environment: 'SIMULATION',
      metadata: {
        ...(params.metadata || {}),
        match_score: params.match_score,
        funnel_mode: 'SIMULATION_ONLY',
        external_order_created: false,
        real_payment_executed: false
      }
    });

    return event.event_id || '';
  }

  public async recordProductShown(params: FunnelStepParams): Promise<string> {
    return this.emitFunnelStep('PRODUCT_SHOWN', params);
  }

  public async recordProductClicked(params: FunnelStepParams): Promise<string> {
    return this.emitFunnelStep('PRODUCT_CLICKED', params);
  }

  public async recordPurchaseLinkOpened(params: FunnelStepParams): Promise<string> {
    return this.emitFunnelStep('PURCHASE_LINK_OPENED', params);
  }

  public async recordCheckoutStarted(params: FunnelStepParams): Promise<string> {
    return this.emitFunnelStep('CHECKOUT_STARTED', params);
  }

  /**
   * Completes a simulated purchase.
   * INVARIANT 8:
   * environment = SIMULATION
   * seller_id
   * product_id
   * buyer_id
   * match_score
   * price
   * timestamp
   * NO generar pago.
   * NO generar orden externa.
   */
  public async recordPurchaseCompleted(params: FunnelStepParams): Promise<SimulatedPurchaseRecord> {
    this.gate.assertFailClosedIntegrity();
    await this.initSchema();

    // 1. Emit PURCHASE_COMPLETED event
    await this.emitFunnelStep('PURCHASE_COMPLETED', params);

    // 2. Persist simulated purchase record
    const purchaseId = `sim_ord_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const occurredAt = new Date().toISOString();

    const record: SimulatedPurchaseRecord = {
      purchase_id: purchaseId,
      environment: 'SIMULATION',
      seller_id: params.seller_id,
      product_id: params.product_id,
      buyer_id: params.buyer_id,
      match_score: params.match_score,
      price: params.price,
      currency: params.currency || 'ARS',
      metadata: {
        ...(params.metadata || {}),
        is_simulated: true,
        real_payment_executed: false,
        external_order_id: null
      },
      occurred_at: occurredAt
    };

    try {
      await dbPool.query(`
        INSERT INTO public.atlas_simulated_purchases (
          purchase_id, environment, seller_id, product_id, buyer_id,
          match_score, price, currency, metadata, occurred_at
        ) VALUES ($1, 'SIMULATION', $2, $3, $4, $5, $6, $7, $8, $9);
      `, [
        record.purchase_id,
        record.seller_id,
        record.product_id,
        record.buyer_id,
        record.match_score,
        record.price,
        record.currency,
        JSON.stringify(record.metadata),
        record.occurred_at
      ]);
    } catch (err) {
      console.warn('[SimulatedCommerceFunnel] DB write error:', err);
    }

    return record;
  }

  public async recordPurchaseFailed(params: FunnelStepParams, reason: string): Promise<string> {
    return this.emitFunnelStep('PURCHASE_FAILED', {
      ...params,
      metadata: { ...(params.metadata || {}), failure_reason: reason }
    });
  }

  /**
   * Executes the full simulated funnel end-to-end without leaving Atlas.
   */
  public async executeCompleteFunnelFlow(params: FunnelStepParams): Promise<{
    product_shown_id: string;
    product_clicked_id: string;
    purchase_link_opened_id: string;
    checkout_started_id: string;
    purchase_record: SimulatedPurchaseRecord;
  }> {
    const shownId = await this.recordProductShown(params);
    const clickedId = await this.recordProductClicked(params);
    const linkId = await this.recordPurchaseLinkOpened(params);
    const checkoutId = await this.recordCheckoutStarted(params);
    const purchase = await this.recordPurchaseCompleted(params);

    return {
      product_shown_id: shownId,
      product_clicked_id: clickedId,
      purchase_link_opened_id: linkId,
      checkout_started_id: checkoutId,
      purchase_record: purchase
    };
  }

  public async getSimulatedPurchases(limit: number = 50): Promise<SimulatedPurchaseRecord[]> {
    await this.initSchema();
    const res = await dbPool.query(`
      SELECT purchase_id, environment, seller_id, product_id, buyer_id, match_score, price, currency, metadata, occurred_at
      FROM public.atlas_simulated_purchases
      WHERE environment = 'SIMULATION'
      ORDER BY occurred_at DESC
      LIMIT $1;
    `, [limit]);

    return res.rows.map(r => ({
      purchase_id: r.purchase_id,
      environment: 'SIMULATION',
      seller_id: r.seller_id,
      product_id: r.product_id,
      buyer_id: r.buyer_id,
      match_score: parseFloat(r.match_score),
      price: parseFloat(r.price),
      currency: r.currency,
      metadata: r.metadata,
      occurred_at: r.occurred_at
    }));
  }
}
