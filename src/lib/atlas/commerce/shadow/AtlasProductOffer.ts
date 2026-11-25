/**
 * ATLAS COMMERCE — EXTERNAL CONNECTOR SHADOW V1
 * Module: AtlasProductOffer.ts
 * Path: src/lib/atlas/commerce/shadow/AtlasProductOffer.ts
 * 
 * Formal models for Product Identity and Multi-Channel Offers.
 * Disentangles Canonical Product Identity from Channel-Specific Offers
 * without destructive deduplication.
 */

import { AtlasProduct } from '../AtlasProduct.ts';

export type CommerceProvider = 'MERCADO_LIBRE' | 'TIENDANUBE' | 'WOOCOMMERCE' | 'INTERNAL_SIMULATED';

export type DeliverySpeed = 'SAME_DAY' | 'NEXT_DAY' | 'STANDARD_2_3_DAYS' | 'EXTENDED';

export interface OfferDeliveryInfo {
  speed: DeliverySpeed;
  estimated_days: number;
  description: string;
  is_free_shipping: boolean;
  allows_local_pickup: boolean;
  origin_geo?: string;
}

export interface AtlasOffer {
  offer_id: string; // e.g. "OFFER_ML_BOSCH_01"
  product_identity_id: string; // Canonical product identity e.g. "PROD_ID_BOSCH_DRILL"
  provider: CommerceProvider;
  external_product_id: string; // Native channel ID e.g. "MLA1001", "TN_2001", "WC_3001"
  seller_id: string;
  seller_name: string;
  seller_reputation: number; // 0.0 - 5.0
  title: string;
  price: number;
  currency: 'ARS';
  stock: number;
  delivery: OfferDeliveryInfo;
  purchase_url: string; // Strictly "SIMULATED://..."
  environment: 'SIMULATION';
  raw_payload?: Record<string, any>;
  last_synced_at: string;
}

import { ProductCompatibilitySpec } from '../ProductCompatibilitySpec.ts';

export interface AtlasProductIdentity {
  product_identity_id: string; // Canonical identity e.g. "PROD_ID_BOSCH_DRILL"
  canonical_title: string;
  canonical_brand: string;
  category: string;
  description: string;
  target_buyer_type: 'PERSON' | 'COMPANY' | 'BOTH';
  target_keywords: string[];
  target_industries: string[];
  target_activities: string[];
  environment: 'SIMULATION';
  compatibility_spec?: ProductCompatibilitySpec;
}

export interface NormalizedProductCatalogItem {
  identity: AtlasProductIdentity;
  offers: AtlasOffer[];
}

/**
 * Normalization helper translating an AtlasOffer into a standard AtlasProduct.
 */
export function offerToAtlasProduct(offer: AtlasOffer, identity?: AtlasProductIdentity): AtlasProduct {
  return new AtlasProduct({
    atlas_product_id: `${offer.provider}_${offer.external_product_id}`,
    external_product_id: offer.external_product_id,
    provider: offer.provider,
    seller_id: offer.seller_id,
    title: offer.title,
    description: identity?.description || offer.title,
    category: identity?.category || 'GENERAL',
    brand: identity?.canonical_brand || '',
    price: offer.price,
    currency: offer.currency,
    stock: offer.stock,
    geo: ['ARGENTINA', offer.delivery.origin_geo || 'CABA'],
    delivery_options: [offer.delivery.description],
    purchase_url: offer.purchase_url,
    last_synced_at: offer.last_synced_at
  });
}
