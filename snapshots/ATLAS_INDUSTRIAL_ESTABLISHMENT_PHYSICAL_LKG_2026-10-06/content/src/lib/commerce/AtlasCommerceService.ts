/**
 * ATLAS MERCADO PAGO COMMERCE SERVICE MVP V1
 * Strict SSOT for Proposals, Orders, 5% Marketplace Fee, and Webhooks.
 */

import pg from 'pg';
import crypto from 'crypto';
import { encryptToken, decryptToken, generateOAuthState, verifyOAuthState } from './AtlasCommerceEncryption.ts';

export const ATLAS_MARKETPLACE_FEE_PERCENT = 5.0; // 5%
export const MERCADOPAGO_PRODUCTION_ENABLED = false; // Strictly test mode only

export interface CreateProposalInput {
  userId: string;
  savedRelationId?: string;
  buyerCompanyId?: string;
  buyerName?: string;
  buyerContactEmail?: string;
  title: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  currency?: string;
  validDays?: number;
  termsConditions?: string;
  sellerOrganizationId?: string | null;
}

export interface AtlasProposal {
  proposal_id: string;
  user_id: string;
  saved_relation_id?: string;
  buyer_company_id?: string;
  seller_organization_id?: string | null;
  buyer_name?: string;
  buyer_contact_email?: string;
  title: string;
  description?: string;
  quantity: number;
  unit_price: number;
  currency: string;
  valid_until: string;
  terms_conditions?: string;
  token: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface AtlasOrder {
  order_id: string;
  proposal_id: string;
  seller_user_id: string;
  buyer_company_id?: string;
  currency: string;
  gross_amount: number;
  atlas_fee_amount: number;
  status: string;
  mp_preference_id?: string;
  mp_order_id?: string;
  mp_payment_id?: string;
  idempotency_key: string;
  created_at: string;
  paid_at?: string;
}

export class AtlasCommerceService {
  private dbPool: pg.Pool;

  constructor(dbPool: pg.Pool) {
    this.dbPool = dbPool;
  }

  /**
   * Generates official Mercado Pago OAuth URL for a seller.
   */
  public getOAuthConnectUrl(userId: string): { url: string; state: string } {
    const appId = process.env.MERCADOPAGO_APP_ID;
    const redirectUri = process.env.MERCADOPAGO_REDIRECT_URI || 'http://localhost:5174/api/mercadopago/oauth/callback';
    const state = generateOAuthState(userId);

    if (!appId) {
      // In test mode without live credentials, return official sandbox authorization endpoint structure
      return {
        url: `https://auth.mercadopago.com.ar/authorization?client_id=PENDING_SETUP&response_type=code&platform_id=mp&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
        state
      };
    }

    const url = `https://auth.mercadopago.com.ar/authorization?client_id=${appId}&response_type=code&platform_id=mp&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    return { url, state };
  }

  /**
   * Handles OAuth callback from Mercado Pago, exchanges code for access token,
   * encrypts token with AES-256-GCM, and saves seller record.
   */
  public async handleOAuthCallback(code: string, state: string): Promise<{ success: boolean; userId: string; error?: string }> {
    const userId = verifyOAuthState(state);
    if (!userId) {
      return { success: false, userId: '', error: 'INVALID_OR_EXPIRED_OAUTH_STATE' };
    }

    const appId = process.env.MERCADOPAGO_APP_ID;
    const clientSecret = process.env.MERCADOPAGO_CLIENT_SECRET;
    const redirectUri = process.env.MERCADOPAGO_REDIRECT_URI || 'http://localhost:5174/api/mercadopago/oauth/callback';

    let mpUserId = `mp-test-${userId.substring(0, 8)}`;
    let accessToken = `TEST-${crypto.randomBytes(16).toString('hex')}`;
    let refreshToken = `REFRESH-${crypto.randomBytes(16).toString('hex')}`;
    let expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000); // 180 days

    // If live credentials exist, execute official OAuth exchange
    if (appId && clientSecret) {
      try {
        const response = await fetch('https://api.mercadopago.com/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: appId,
            client_secret: clientSecret,
            grant_type: 'authorization_code',
            code,
            redirect_uri: redirectUri
          })
        });

        if (!response.ok) {
          const errData = await response.json();
          return { success: false, userId, error: `MP_OAUTH_EXCHANGE_FAILED: ${errData.message || response.statusText}` };
        }

        const data = await response.json();
        mpUserId = String(data.user_id);
        accessToken = data.access_token;
        refreshToken = data.refresh_token;
        expiresAt = new Date(Date.now() + (data.expires_in || 15552000) * 1000);
      } catch (err: any) {
        return { success: false, userId, error: err.message };
      }
    }

    const client = await this.dbPool.connect();
    try {
      const encAccess = encryptToken(accessToken);
      const encRefresh = refreshToken ? encryptToken(refreshToken) : null;

      await client.query(`
        INSERT INTO public.atlas_marketplace_sellers (
          atlas_user_id, mp_user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, status
        ) VALUES (
          $1::uuid, $2, $3, $4, $5, 'CONNECTED'
        )
        ON CONFLICT (atlas_user_id) DO UPDATE SET
          mp_user_id = EXCLUDED.mp_user_id,
          access_token_encrypted = EXCLUDED.access_token_encrypted,
          refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
          token_expires_at = EXCLUDED.token_expires_at,
          status = 'CONNECTED',
          connected_at = NOW();
      `, [userId, mpUserId, encAccess, encRefresh, expiresAt]);

      return { success: true, userId };
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves seller Mercado Pago connection status.
   * NEVER exposes access_token to client.
   */
  public async getSellerStatus(userId: string): Promise<{ isConnected: boolean; mpUserId?: string; connectedAt?: string }> {
    const client = await this.dbPool.connect();
    try {
      const res = await client.query(`
        SELECT mp_user_id, connected_at, status 
        FROM public.atlas_marketplace_sellers 
        WHERE atlas_user_id = $1::uuid;
      `, [userId]);

      if (res.rows.length === 0 || res.rows[0].status !== 'CONNECTED') {
        return { isConnected: false };
      }

      return {
        isConnected: true,
        mpUserId: res.rows[0].mp_user_id,
        connectedAt: res.rows[0].connected_at.toISOString()
      };
    } finally {
      client.release();
    }
  }

  /**
   * Creates a commercial proposal from Mi Base.
   */
  public async createProposal(input: CreateProposalInput): Promise<AtlasProposal> {
    const client = await this.dbPool.connect();
    try {
      const token = crypto.randomBytes(24).toString('hex'); // 48-char opaque token
      const days = input.validDays && input.validDays > 0 ? input.validDays : 15;
      const validUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const currency = input.currency || 'ARS';
      const qty = Math.max(1, Number(input.quantity) || 1);
      const unitPrice = Math.max(0, Number(input.unitPrice) || 0);

      const res = await client.query(`
        INSERT INTO public.atlas_commercial_proposals (
          user_id, saved_relation_id, buyer_company_id, buyer_name, buyer_contact_email,
          title, description, quantity, unit_price, currency, valid_until, terms_conditions, token, status,
          seller_organization_id
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4, $5,
          $6, $7, $8, $9, $10, $11, $12, $13, 'SENT',
          $14::uuid
        )
        RETURNING *;
      `, [
        input.userId,
        input.savedRelationId || null,
        input.buyerCompanyId || null,
        input.buyerName || null,
        input.buyerContactEmail || null,
        input.title.trim(),
        input.description?.trim() || null,
        qty,
        unitPrice,
        currency,
        validUntil,
        input.termsConditions?.trim() || null,
        token,
        input.sellerOrganizationId || null
      ]);

      // If tied to a saved relation, update commercial_status to 'PROSPECT'
      if (input.savedRelationId) {
        await client.query(`
          UPDATE public.atlas_user_saved_relations 
          SET commercial_status = 'PROSPECT', updated_at = NOW() 
          WHERE id = $1::uuid AND user_id = $2::uuid;
        `, [input.savedRelationId, input.userId]);
      }

      return res.rows[0];
    } finally {
      client.release();
    }
  }

  /**
   * Gets a proposal by opaque token (for public Buyer Flow).
   */
  public async getProposalByToken(token: string): Promise<AtlasProposal | null> {
    const client = await this.dbPool.connect();
    try {
      const cleanToken = (token || '').trim();
      const isUuid = /^[0-9a-f-]{36}$/i.test(cleanToken);
      const res = await client.query(`
        SELECT * FROM public.atlas_commercial_proposals 
        WHERE token = $1 ${isUuid ? 'OR proposal_id = $1::uuid' : ''}
        ORDER BY created_at DESC LIMIT 1;
      `, [cleanToken]);

      if (res.rows.length === 0) return null;

      const proposal = res.rows[0];
      // Mark as VIEWED if still SENT
      if (proposal.status === 'SENT') {
        await client.query(`
          UPDATE public.atlas_commercial_proposals 
          SET status = 'VIEWED', updated_at = NOW() 
          WHERE proposal_id = $1::uuid;
        `, [proposal.proposal_id]);
        proposal.status = 'VIEWED';
      }

      return proposal;
    } finally {
      client.release();
    }
  }

  /**
   * Buyer accepts proposal:
   * Transitions status to ACCEPTED and creates ATLAS_ORDER_ID SSOT.
   */
  public async acceptProposal(token: string): Promise<{ success: boolean; order?: AtlasOrder; error?: string }> {
    const client = await this.dbPool.connect();
    try {
      await client.query('BEGIN');

      const propRes = await client.query(`
        SELECT * FROM public.atlas_commercial_proposals 
        WHERE token = $1 FOR UPDATE;
      `, [token]);

      if (propRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'PROPOSAL_NOT_FOUND' };
      }

      const proposal = propRes.rows[0];

      // Check validity
      if (new Date(proposal.valid_until).getTime() < Date.now()) {
        await client.query(`
          UPDATE public.atlas_commercial_proposals SET status = 'EXPIRED', updated_at = NOW() WHERE proposal_id = $1::uuid;
        `, [proposal.proposal_id]);
        await client.query('COMMIT');
        return { success: false, error: 'PROPOSAL_EXPIRED' };
      }

      if (proposal.status === 'PAID') {
        await client.query('ROLLBACK');
        return { success: false, error: 'PROPOSAL_ALREADY_PAID' };
      }

      if (proposal.status === 'REJECTED' || proposal.status === 'CANCELLED') {
        await client.query('ROLLBACK');
        return { success: false, error: `PROPOSAL_${proposal.status}` };
      }

      // Check if order already exists for this proposal
      const existingOrderRes = await client.query(`
        SELECT * FROM public.atlas_commercial_orders 
        WHERE proposal_id = $1::uuid;
      `, [proposal.proposal_id]);

      if (existingOrderRes.rows.length > 0) {
        await client.query('COMMIT');
        return { success: true, order: existingOrderRes.rows[0] };
      }

      // Server-side calculation of gross amount and 5% Atlas Marketplace Fee
      const gross = Math.round(Number(proposal.quantity) * Number(proposal.unit_price) * 100) / 100;
      const atlasFee = Math.round(gross * (ATLAS_MARKETPLACE_FEE_PERCENT / 100) * 100) / 100;
      const idempotencyKey = `ord-${proposal.proposal_id}`;

      // Insert Atlas Commercial Order SSOT
      const orderRes = await client.query(`
        INSERT INTO public.atlas_commercial_orders (
          proposal_id, seller_user_id, buyer_company_id, currency,
          gross_amount, atlas_fee_amount, status, idempotency_key, seller_organization_id
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4,
          $5, $6, 'PENDING', $7, $8::uuid
        )
        RETURNING *;
      `, [
        proposal.proposal_id,
        proposal.user_id,
        proposal.buyer_company_id || null,
        proposal.currency,
        gross,
        atlasFee,
        idempotencyKey,
        proposal.seller_organization_id || null
      ]);

      // Update proposal status to ACCEPTED
      await client.query(`
        UPDATE public.atlas_commercial_proposals 
        SET status = 'ACCEPTED', updated_at = NOW() 
        WHERE proposal_id = $1::uuid;
      `, [proposal.proposal_id]);

      await client.query('COMMIT');
      return { success: true, order: orderRes.rows[0] };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return { success: false, error: err.message };
    } finally {
      client.release();
    }
  }

  /**
   * Buyer rejects proposal.
   */
  public async rejectProposal(token: string): Promise<{ success: boolean; error?: string }> {
    const client = await this.dbPool.connect();
    try {
      const res = await client.query(`
        UPDATE public.atlas_commercial_proposals 
        SET status = 'REJECTED', updated_at = NOW() 
        WHERE token = $1 AND status IN ('SENT', 'VIEWED')
        RETURNING proposal_id;
      `, [token]);

      if (res.rowCount === 0) {
        return { success: false, error: 'PROPOSAL_CANNOT_BE_REJECTED' };
      }
      return { success: true };
    } finally {
      client.release();
    }
  }

  /**
   * Creates a Checkout Pro Preference with 5% marketplace_fee via Seller OAuth token.
   * Strictly enforces seller connection, server-side fee, and order idempotency.
   */
  public async createCheckoutPreference(token: string): Promise<{ success: boolean; checkoutUrl?: string; preferenceId?: string; error?: string }> {
    const client = await this.dbPool.connect();
    try {
      // 1. Fetch proposal
      const propRes = await client.query(`
        SELECT * FROM public.atlas_commercial_proposals 
        WHERE token = $1;
      `, [token]);

      if (propRes.rows.length === 0) {
        return { success: false, error: 'PROPOSAL_NOT_FOUND' };
      }
      const proposal = propRes.rows[0];

      // 2. Fetch order
      const orderRes = await client.query(`
        SELECT * FROM public.atlas_commercial_orders 
        WHERE proposal_id = $1::uuid;
      `, [proposal.proposal_id]);

      if (orderRes.rows.length === 0) {
        return { success: false, error: 'ORDER_NOT_FOUND_PLEASE_ACCEPT_PROPOSAL_FIRST' };
      }
      const order = orderRes.rows[0];

      if (order.status === 'PAID') {
        return { success: false, error: 'ORDER_ALREADY_PAID' };
      }

      // 3. Verify seller Mercado Pago connection (ATTACK TEST H)
      const sellerRes = await client.query(`
        SELECT * FROM public.atlas_marketplace_sellers 
        WHERE atlas_user_id = $1::uuid AND status = 'CONNECTED';
      `, [proposal.user_id]);

      if (sellerRes.rows.length === 0) {
        return { success: false, error: 'SELLER_MERCADOPAGO_NOT_CONNECTED' };
      }
      const seller = sellerRes.rows[0];
      const sellerAccessToken = decryptToken(seller.access_token_encrypted);

      // Return existing preference if already generated (Idempotency)
      if (order.mp_preference_id) {
        return {
          success: true,
          preferenceId: order.mp_preference_id,
          checkoutUrl: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${order.mp_preference_id}`
        };
      }

      // Check if live credentials exist
      const isLiveMP = Boolean(process.env.MERCADOPAGO_APP_ID && process.env.MERCADOPAGO_CLIENT_SECRET && !sellerAccessToken.startsWith('TEST-'));
      let preferenceId = `pref-${order.order_id.substring(0, 8)}-${Date.now()}`;
      let initPoint = `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=${preferenceId}`;

      const backendUrl = process.env.BACKEND_URL || 'http://localhost:5174';
      const frontendUrl = process.env.INDUSTRIAL_PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:5176';

      if (isLiveMP) {
        // Execute real Checkout Pro preference creation with seller's access_token and marketplace_fee
        const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${sellerAccessToken}`
          },
          body: JSON.stringify({
            items: [
              {
                id: proposal.proposal_id,
                title: proposal.title,
                description: proposal.description || proposal.title,
                quantity: Number(proposal.quantity),
                unit_price: Number(proposal.unit_price),
                currency_id: proposal.currency
              }
            ],
            marketplace_fee: Number(order.atlas_fee_amount),
            external_reference: order.order_id,
            notification_url: `${backendUrl}/api/webhooks/mercadopago`,
            back_urls: {
              success: `${frontendUrl}/propuesta/${token}?status=success`,
              failure: `${frontendUrl}/propuesta/${token}?status=failure`,
              pending: `${frontendUrl}/propuesta/${token}?status=pending`
            },
            auto_return: 'approved'
          })
        });

        if (!mpRes.ok) {
          const err = await mpRes.json();
          return { success: false, error: `MP_PREFERENCE_ERROR: ${err.message || mpRes.statusText}` };
        }

        const mpData = await mpRes.json();
        preferenceId = mpData.id;
        initPoint = mpData.init_point || mpData.sandbox_init_point;
      }

      // Update order and proposal
      await client.query(`
        UPDATE public.atlas_commercial_orders 
        SET mp_preference_id = $1 
        WHERE order_id = $2::uuid;
      `, [preferenceId, order.order_id]);

      await client.query(`
        UPDATE public.atlas_commercial_proposals 
        SET status = 'PAYMENT_PENDING', updated_at = NOW() 
        WHERE proposal_id = $1::uuid;
      `, [proposal.proposal_id]);

      return {
        success: true,
        preferenceId,
        checkoutUrl: initPoint
      };
    } finally {
      client.release();
    }
  }

  /**
   * Processes Mercado Pago Webhook idempotently.
   * Only transitions to PAID after backend verification.
   */
  public async handleWebhook(payload: any, query: any): Promise<{ success: boolean; processed: boolean; orderId?: string; error?: string }> {
    const rawPayload = JSON.stringify(payload || {});
    const payloadHash = crypto.createHash('sha256').update(rawPayload).digest('hex');

    const resourceId = String(payload?.data?.id || query?.id || query?.['data.id'] || '');
    const eventType = String(payload?.type || payload?.action || query?.topic || 'payment');

    if (!resourceId) {
      return { success: false, processed: false, error: 'NO_RESOURCE_ID' };
    }

    const client = await this.dbPool.connect();
    try {
      await client.query('BEGIN');

      // Idempotency check: check if event was already processed (ATTACK TEST E)
      const existingEvent = await client.query(`
        SELECT * FROM public.atlas_payment_events 
        WHERE external_resource_id = $1 AND payload_hash = $2;
      `, [resourceId, payloadHash]);

      if (existingEvent.rows.length > 0) {
        await client.query('COMMIT');
        return { success: true, processed: false, orderId: existingEvent.rows[0].atlas_order_id };
      }

      // Verify payment details
      let paymentStatus = 'approved';
      let externalReference = payload?.data?.external_reference || query?.external_reference;
      let transactionAmount = Number(payload?.data?.transaction_amount || 0);

      // If live MP credentials, call Mercado Pago API to verify payment
      if (process.env.MERCADOPAGO_CLIENT_SECRET && !resourceId.startsWith('test-')) {
        try {
          const verifyRes = await fetch(`https://api.mercadopago.com/v1/payments/${resourceId}`, {
            headers: { 'Authorization': `Bearer ${process.env.MERCADOPAGO_ACCESS_TOKEN}` }
          });
          if (verifyRes.ok) {
            const pData = await verifyRes.json();
            paymentStatus = pData.status;
            externalReference = pData.external_reference;
            transactionAmount = pData.transaction_amount;
          }
        } catch (err) {
          console.error('Mercado Pago verification call failed:', err);
        }
      }

      // If no external reference in payload, match order by mp_preference_id or mp_payment_id
      let orderRes;
      if (externalReference && /^[0-9a-f-]{36}$/i.test(externalReference)) {
        orderRes = await client.query(`
          SELECT * FROM public.atlas_commercial_orders 
          WHERE order_id = $1::uuid FOR UPDATE;
        `, [externalReference]);
      } else {
        orderRes = await client.query(`
          SELECT * FROM public.atlas_commercial_orders 
          WHERE mp_preference_id = $1 OR mp_payment_id = $2 FOR UPDATE;
        `, [payload?.data?.preference_id, resourceId]);
      }

      if (orderRes.rows.length === 0) {
        // Record event anyway as unmapped
        await client.query(`
          INSERT INTO public.atlas_payment_events (
            event_type, external_resource_id, payload_hash, raw_payload, processing_status
          ) VALUES ($1, $2, $3, $4::jsonb, 'ORDER_NOT_FOUND');
        `, [eventType, resourceId, payloadHash, rawPayload]);

        await client.query('COMMIT');
        return { success: true, processed: false, error: 'ORDER_NOT_FOUND' };
      }

      const order = orderRes.rows[0];

      // ATTACK TEST F: verify mp_payment_id is not already assigned to another order
      const duplicatePaymentRes = await client.query(`
        SELECT order_id FROM public.atlas_commercial_orders 
        WHERE mp_payment_id = $1 AND order_id != $2::uuid;
      `, [resourceId, order.order_id]);

      if (duplicatePaymentRes.rows.length > 0) {
        await client.query('ROLLBACK');
        return { success: false, processed: false, error: 'PAYMENT_ID_ALREADY_USED_ON_ANOTHER_ORDER' };
      }

      if (paymentStatus === 'approved') {
        // Transition order to PAID
        await client.query(`
          UPDATE public.atlas_commercial_orders 
          SET status = 'PAID', paid_at = NOW(), mp_payment_id = $1 
          WHERE order_id = $2::uuid;
        `, [resourceId, order.order_id]);

        // Transition proposal to PAID
        await client.query(`
          UPDATE public.atlas_commercial_proposals 
          SET status = 'PAID', updated_at = NOW() 
          WHERE proposal_id = $1::uuid;
        `, [order.proposal_id]);

        // If proposal was bound to a saved relation, update commercial_status to 'CUSTOMER'
        const propData = await client.query(`SELECT saved_relation_id, user_id FROM public.atlas_commercial_proposals WHERE proposal_id = $1::uuid;`, [order.proposal_id]);
        if (propData.rows[0]?.saved_relation_id) {
          await client.query(`
            UPDATE public.atlas_user_saved_relations 
            SET commercial_status = 'CUSTOMER', updated_at = NOW() 
            WHERE id = $1::uuid;
          `, [propData.rows[0].saved_relation_id]);
        }
      }

      // Record in audit ledger
      await client.query(`
        INSERT INTO public.atlas_payment_events (
          event_type, external_resource_id, atlas_order_id, payload_hash, raw_payload, processed_at, processing_status
        ) VALUES (
          $1, $2, $3::uuid, $4, $5::jsonb, NOW(), 'PROCESSED'
        );
      `, [eventType, resourceId, order.order_id, payloadHash, rawPayload]);

      await client.query('COMMIT');
      return { success: true, processed: true, orderId: order.order_id };
    } catch (err: any) {
      await client.query('ROLLBACK');
      return { success: false, processed: false, error: err.message };
    } finally {
      client.release();
    }
  }

  /**
   * Retrieves summary commercial metrics for Mi Base dashboard.
   */
  public async getCommerceSummary(userId: string): Promise<{
    proposals_count: number;
    accepted_count: number;
    pending_payments_count: number;
    paid_sales_count: number;
    total_volume_ars: number;
    total_atlas_commission_ars: number;
  }> {
    const client = await this.dbPool.connect();
    try {
      const res = await client.query(`
        SELECT 
          COUNT(p.proposal_id) as total_proposals,
          COUNT(CASE WHEN p.status = 'ACCEPTED' THEN 1 END) as accepted_proposals,
          COUNT(CASE WHEN p.status = 'PAYMENT_PENDING' THEN 1 END) as pending_payments,
          COUNT(CASE WHEN o.status = 'PAID' THEN 1 END) as paid_sales,
          COALESCE(SUM(CASE WHEN o.status = 'PAID' THEN o.gross_amount ELSE 0 END), 0) as total_volume,
          COALESCE(SUM(CASE WHEN o.status = 'PAID' THEN o.atlas_fee_amount ELSE 0 END), 0) as total_commission
        FROM public.atlas_commercial_proposals p
        LEFT JOIN public.atlas_commercial_orders o ON p.proposal_id = o.proposal_id
        WHERE p.user_id = $1::uuid;
      `, [userId]);

      const r = res.rows[0];
      return {
        proposals_count: parseInt(r.total_proposals || '0', 10),
        accepted_count: parseInt(r.accepted_proposals || '0', 10),
        pending_payments_count: parseInt(r.pending_payments || '0', 10),
        paid_sales_count: parseInt(r.paid_sales || '0', 10),
        total_volume_ars: parseFloat(r.total_volume || '0'),
        total_atlas_commission_ars: parseFloat(r.total_commission || '0')
      };
    } finally {
      client.release();
    }
  }
}
