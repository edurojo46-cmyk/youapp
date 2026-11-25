/**
 * ATLAS VENDER / COMMERCE V1
 * Module: AtlasCommerceEvents.ts
 * Path: src/lib/atlas/commerce/AtlasCommerceEvents.ts
 * 
 * Commercial funnel events.
 * STRICT ISOLATION: Completely decoupled from Truth Graph and Identity SSOT.
 * Recording commerce interactions never creates or mutates identity assertions.
 */

import { dbPool } from '../../../../server/db.ts';

export type CommerceEventType =
  | 'PRODUCT_SHOWN'
  | 'PRODUCT_CLICKED'
  | 'PURCHASE_LINK_OPENED'
  | 'CHECKOUT_STARTED'
  | 'PURCHASE_COMPLETED'
  | 'PURCHASE_FAILED';

export interface CommerceEventPayload {
  event_id?: string;
  event_type: CommerceEventType;
  product_id: string;
  seller_id?: string;
  buyer_id?: string;
  buyer_type?: 'PERSON' | 'COMPANY';
  amount?: number;
  currency?: string;
  environment?: 'SIMULATION';
  metadata?: Record<string, any>;
  occurred_at?: string;
}

export class AtlasCommerceEventDispatcher {
  private static instance: AtlasCommerceEventDispatcher;
  private inMemoryEvents: CommerceEventPayload[] = [];
  private isTableInitialized: boolean = false;

  private constructor() {}

  public static getInstance(): AtlasCommerceEventDispatcher {
    if (!AtlasCommerceEventDispatcher.instance) {
      AtlasCommerceEventDispatcher.instance = new AtlasCommerceEventDispatcher();
    }
    return AtlasCommerceEventDispatcher.instance;
  }

  public async initSchema(): Promise<void> {
    if (this.isTableInitialized) return;
    try {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS public.atlas_commerce_events (
          event_id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          product_id TEXT NOT NULL,
          seller_id TEXT,
          buyer_id TEXT,
          buyer_type TEXT,
          amount NUMERIC,
          currency TEXT DEFAULT 'ARS',
          environment TEXT NOT NULL DEFAULT 'SIMULATION',
          metadata JSONB NOT NULL DEFAULT '{}',
          occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE public.atlas_commerce_events ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'SIMULATION';
        CREATE INDEX IF NOT EXISTS idx_atlas_commerce_events_type ON public.atlas_commerce_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_atlas_commerce_events_buyer ON public.atlas_commerce_events(buyer_id);
        CREATE INDEX IF NOT EXISTS idx_atlas_commerce_events_env ON public.atlas_commerce_events(environment);
      `);
      this.isTableInitialized = true;
    } catch (err) {
      console.warn('[AtlasCommerceEvents] Error initializing table:', err);
    }
  }

  /**
   * Dispatches and records a commercial funnel event.
   * Isolated from Truth Graph.
   */
  public async emitEvent(event: CommerceEventPayload): Promise<CommerceEventPayload> {
    const fullEvent: CommerceEventPayload = {
      ...event,
      event_id: event.event_id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      environment: 'SIMULATION',
      occurred_at: event.occurred_at || new Date().toISOString()
    };

    this.inMemoryEvents.push(fullEvent);
    if (this.inMemoryEvents.length > 500) {
      this.inMemoryEvents.shift();
    }

    try {
      await this.initSchema();
      await dbPool.query(`
        INSERT INTO public.atlas_commerce_events (
          event_id, event_type, product_id, seller_id, buyer_id, buyer_type, amount, currency, environment, metadata, occurred_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (event_id) DO NOTHING;
      `, [
        fullEvent.event_id,
        fullEvent.event_type,
        fullEvent.product_id,
        fullEvent.seller_id || null,
        fullEvent.buyer_id || null,
        fullEvent.buyer_type || null,
        fullEvent.amount !== undefined ? fullEvent.amount : null,
        fullEvent.currency || 'ARS',
        'SIMULATION',
        JSON.stringify(fullEvent.metadata || {}),
        fullEvent.occurred_at
      ]);
    } catch (err) {
      console.warn('[AtlasCommerceEvents] DB record error:', err);
    }

    return fullEvent;
  }

  public async recordEvent(event: CommerceEventPayload): Promise<string> {
    const res = await this.emitEvent(event);
    return res.event_id || '';
  }

  public getRecentEvents(limit: number = 50): CommerceEventPayload[] {
    return this.inMemoryEvents.slice(-limit);
  }
}
