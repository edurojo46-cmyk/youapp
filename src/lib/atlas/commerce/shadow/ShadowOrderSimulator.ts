/**
 * ATLAS COMMERCE — EXTERNAL CONNECTOR SHADOW V1
 * Module: ShadowOrderSimulator.ts
 * Path: src/lib/atlas/commerce/shadow/ShadowOrderSimulator.ts
 * 
 * Simulates the lifecycle of external platform orders:
 * ORDER_CREATED → ORDER_PAID → ORDER_DELIVERED / ORDER_CANCELLED
 * 
 * Strictly isolated: environment = 'SIMULATION' on all records.
 * Zero real payment gateway calls, zero real external orders generated.
 */

import { dbPool } from '../../../../../server/db.ts';
import { AtlasCommerceGate } from '../AtlasCommerceGate.ts';
import { AtlasCommerceEventDispatcher } from '../AtlasCommerceEvents.ts';
import { AtlasOffer } from './AtlasProductOffer.ts';

export type ShadowOrderStatus = 'ORDER_CREATED' | 'ORDER_PAID' | 'ORDER_CANCELLED' | 'ORDER_DELIVERED';

export interface ShadowOrderRecord {
  order_id: string;
  provider: string;
  offer_id: string;
  product_identity_id: string;
  buyer_id: string;
  buyer_name: string;
  seller_id: string;
  order_status: ShadowOrderStatus;
  total_amount: number;
  currency: 'ARS';
  environment: 'SIMULATION';
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export class ShadowOrderSimulator {
  private static instance: ShadowOrderSimulator;
  private gate: AtlasCommerceGate;
  private eventDispatcher: AtlasCommerceEventDispatcher;
  private isTableInitialized: boolean = false;

  private constructor() {
    this.gate = AtlasCommerceGate.getInstance();
    this.gate.assertFailClosedIntegrity();
    this.eventDispatcher = AtlasCommerceEventDispatcher.getInstance();
  }

  public static getInstance(): ShadowOrderSimulator {
    if (!ShadowOrderSimulator.instance) {
      ShadowOrderSimulator.instance = new ShadowOrderSimulator();
    }
    return ShadowOrderSimulator.instance;
  }

  public async initSchema(): Promise<void> {
    if (this.isTableInitialized) return;
    this.gate.assertFailClosedIntegrity();

    try {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS public.atlas_shadow_simulated_orders (
          order_id TEXT PRIMARY KEY,
          provider TEXT NOT NULL CHECK (provider IN ('MERCADO_LIBRE', 'TIENDANUBE', 'WOOCOMMERCE', 'INTERNAL_SIMULATED')),
          offer_id TEXT NOT NULL,
          product_identity_id TEXT NOT NULL,
          buyer_id TEXT NOT NULL,
          buyer_name TEXT NOT NULL,
          seller_id TEXT NOT NULL,
          order_status TEXT NOT NULL CHECK (order_status IN ('ORDER_CREATED', 'ORDER_PAID', 'ORDER_CANCELLED', 'ORDER_DELIVERED')),
          total_amount NUMERIC NOT NULL,
          currency TEXT NOT NULL DEFAULT 'ARS',
          environment TEXT NOT NULL DEFAULT 'SIMULATION' CHECK (environment = 'SIMULATION'),
          metadata JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_shadow_orders_buyer ON public.atlas_shadow_simulated_orders(buyer_id);
        CREATE INDEX IF NOT EXISTS idx_shadow_orders_status ON public.atlas_shadow_simulated_orders(order_status);
      `);
      this.isTableInitialized = true;
    } catch (err) {
      console.warn('[ShadowOrderSimulator] initSchema warning:', err);
    }
  }

  /**
   * Creates a shadow order representing an external platform order in SIMULATION mode.
   */
  public async createShadowOrder(params: {
    offer: AtlasOffer;
    buyer_id: string;
    buyer_name: string;
    quantity?: number;
    metadata?: Record<string, any>;
  }): Promise<ShadowOrderRecord> {
    this.gate.assertFailClosedIntegrity();
    await this.initSchema();

    const orderId = `sh_ord_${params.offer.provider.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const qty = params.quantity || 1;
    const total = params.offer.price * qty;

    const record: ShadowOrderRecord = {
      order_id: orderId,
      provider: params.offer.provider,
      offer_id: params.offer.offer_id,
      product_identity_id: params.offer.product_identity_id,
      buyer_id: params.buyer_id,
      buyer_name: params.buyer_name,
      seller_id: params.offer.seller_id,
      order_status: 'ORDER_CREATED',
      total_amount: total,
      currency: 'ARS',
      environment: 'SIMULATION',
      metadata: {
        ...(params.metadata || {}),
        is_shadow_simulated: true,
        real_payment_executed: false,
        delivery_mode: params.offer.delivery.description,
        external_native_id: params.offer.external_product_id
      },
      created_at: now,
      updated_at: now
    };

    await dbPool.query(`
      INSERT INTO public.atlas_shadow_simulated_orders (
        order_id, provider, offer_id, product_identity_id, buyer_id, buyer_name,
        seller_id, order_status, total_amount, currency, environment, metadata,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'SIMULATION', $11, $12, $13);
    `, [
      record.order_id,
      record.provider,
      record.offer_id,
      record.product_identity_id,
      record.buyer_id,
      record.buyer_name,
      record.seller_id,
      record.order_status,
      record.total_amount,
      record.currency,
      JSON.stringify(record.metadata),
      record.created_at,
      record.updated_at
    ]);

    // Dispatch shadow funnel event
    await this.eventDispatcher.emitEvent({
      event_type: 'CHECKOUT_STARTED',
      product_id: params.offer.external_product_id,
      seller_id: params.offer.seller_id,
      buyer_id: params.buyer_id,
      amount: record.total_amount,
      currency: 'ARS',
      environment: 'SIMULATION',
      metadata: {
        order_id: record.order_id,
        order_status: 'ORDER_CREATED',
        provider: record.provider
      }
    });

    return record;
  }

  /**
   * Simulates order payment without touching payment gateways.
   */
  public async markOrderPaid(orderId: string): Promise<ShadowOrderRecord | null> {
    this.gate.assertFailClosedIntegrity();
    await this.initSchema();

    const now = new Date().toISOString();
    const res = await dbPool.query(`
      UPDATE public.atlas_shadow_simulated_orders
      SET order_status = 'ORDER_PAID', updated_at = $2
      WHERE order_id = $1 AND environment = 'SIMULATION'
      RETURNING *;
    `, [orderId, now]);

    if (res.rows.length === 0) return null;
    const r = res.rows[0];

    // Emit PURCHASE_COMPLETED
    await this.eventDispatcher.emitEvent({
      event_type: 'PURCHASE_COMPLETED',
      product_id: r.offer_id,
      seller_id: r.seller_id,
      buyer_id: r.buyer_id,
      amount: parseFloat(r.total_amount),
      currency: 'ARS',
      environment: 'SIMULATION',
      metadata: {
        order_id: r.order_id,
        order_status: 'ORDER_PAID',
        provider: r.provider,
        simulated_payment: true
      }
    });

    return {
      order_id: r.order_id,
      provider: r.provider,
      offer_id: r.offer_id,
      product_identity_id: r.product_identity_id,
      buyer_id: r.buyer_id,
      buyer_name: r.buyer_name,
      seller_id: r.seller_id,
      order_status: r.order_status,
      total_amount: parseFloat(r.total_amount),
      currency: r.currency,
      environment: 'SIMULATION',
      metadata: r.metadata,
      created_at: r.created_at,
      updated_at: r.updated_at
    };
  }

  /**
   * Simulates order cancellation.
   */
  public async markOrderCancelled(orderId: string, reason: string): Promise<ShadowOrderRecord | null> {
    this.gate.assertFailClosedIntegrity();
    await this.initSchema();

    const now = new Date().toISOString();
    const res = await dbPool.query(`
      UPDATE public.atlas_shadow_simulated_orders
      SET order_status = 'ORDER_CANCELLED',
          metadata = metadata || jsonb_build_object('cancellation_reason', $2::text),
          updated_at = $3
      WHERE order_id = $1 AND environment = 'SIMULATION'
      RETURNING *;
    `, [orderId, reason, now]);

    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      order_id: r.order_id,
      provider: r.provider,
      offer_id: r.offer_id,
      product_identity_id: r.product_identity_id,
      buyer_id: r.buyer_id,
      buyer_name: r.buyer_name,
      seller_id: r.seller_id,
      order_status: r.order_status,
      total_amount: parseFloat(r.total_amount),
      currency: r.currency,
      environment: 'SIMULATION',
      metadata: r.metadata,
      created_at: r.created_at,
      updated_at: r.updated_at
    };
  }

  /**
   * Simulates successful delivery.
   */
  public async markOrderDelivered(orderId: string): Promise<ShadowOrderRecord | null> {
    this.gate.assertFailClosedIntegrity();
    await this.initSchema();

    const now = new Date().toISOString();
    const res = await dbPool.query(`
      UPDATE public.atlas_shadow_simulated_orders
      SET order_status = 'ORDER_DELIVERED', updated_at = $2
      WHERE order_id = $1 AND environment = 'SIMULATION'
      RETURNING *;
    `, [orderId, now]);

    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      order_id: r.order_id,
      provider: r.provider,
      offer_id: r.offer_id,
      product_identity_id: r.product_identity_id,
      buyer_id: r.buyer_id,
      buyer_name: r.buyer_name,
      seller_id: r.seller_id,
      order_status: r.order_status,
      total_amount: parseFloat(r.total_amount),
      currency: r.currency,
      environment: 'SIMULATION',
      metadata: r.metadata,
      created_at: r.created_at,
      updated_at: r.updated_at
    };
  }
}
