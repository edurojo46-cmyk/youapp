/**
 * ATLAS COMMERCE — EXTERNAL CONNECTOR SHADOW V1
 * Module: AtlasOfferRanker.ts
 * Path: src/lib/atlas/commerce/shadow/AtlasOfferRanker.ts
 * 
 * Ranks multi-channel offers for a given product identity and buyer context.
 * Evaluates separately:
 * - price
 * - stock
 * - delivery (urgency / speed)
 * - geo
 * - seller
 * - purchase_channel
 * 
 * Crucial Invariant: The cheapest offer is NOT always the winning offer
 * (e.g. buyer requiring SAME_DAY local pickup prioritizes delivery speed over marginal price discount).
 */

import { AtlasOffer } from './AtlasProductOffer.ts';

export interface BuyerOfferContext {
  buyer_id: string;
  buyer_name: string;
  urgency?: 'HIGH' | 'NORMAL' | 'LOW';
  prefers_local_pickup?: boolean;
  buyer_geo?: string;
  preferred_channel?: 'MERCADO_LIBRE' | 'TIENDANUBE' | 'WOOCOMMERCE' | 'ANY';
}

export interface OfferScoreBreakdown {
  price_score: number;
  delivery_score: number;
  stock_score: number;
  seller_score: number;
  geo_score: number;
  channel_score: number;
}

export interface RankedOfferItem {
  offer: AtlasOffer;
  offer_score: number;
  breakdown: OfferScoreBreakdown;
  why_selected: string;
}

export class AtlasOfferRanker {
  /**
   * Evaluates and ranks a list of offers for a single product identity.
   */
  public static rankOffers(offers: AtlasOffer[], context: BuyerOfferContext): RankedOfferItem[] {
    if (!offers || offers.length === 0) return [];

    const urgency = context.urgency || 'NORMAL';
    const minPrice = Math.min(...offers.map(o => o.price));
    const maxPrice = Math.max(...offers.map(o => o.price));
    const priceRange = maxPrice - minPrice;

    // Weight matrix depending on buyer urgency
    const w_price = urgency === 'HIGH' ? 0.20 : 0.40;
    const w_delivery = urgency === 'HIGH' ? 0.45 : 0.25;
    const w_stock = 0.15;
    const w_seller = 0.10;
    const w_geo = 0.10;

    const scoredOffers: RankedOfferItem[] = offers.map(offer => {
      // 1. Price Score: Lower price = higher score (1.0 to 0.5)
      let priceScore = 1.0;
      if (priceRange > 0) {
        priceScore = 1.0 - ((offer.price - minPrice) / priceRange) * 0.5;
      }
      priceScore = Number(priceScore.toFixed(2));

      // 2. Delivery Score: Speed & pickup alignment
      let deliveryScore = 0.5;
      if (offer.delivery.speed === 'SAME_DAY') {
        deliveryScore = 1.0;
      } else if (offer.delivery.speed === 'NEXT_DAY') {
        deliveryScore = 0.8;
      } else if (offer.delivery.speed === 'STANDARD_2_3_DAYS') {
        deliveryScore = 0.5;
      } else {
        deliveryScore = 0.2;
      }

      if (context.prefers_local_pickup && offer.delivery.allows_local_pickup) {
        deliveryScore = Math.min(1.0, deliveryScore + 0.1);
      }
      deliveryScore = Number(deliveryScore.toFixed(2));

      // 3. Stock Score: Immediate availability
      let stockScore = 0.0;
      if (offer.stock >= 5) {
        stockScore = 1.0;
      } else if (offer.stock >= 1) {
        stockScore = 0.7;
      } else {
        stockScore = 0.1;
      }

      // 4. Seller Reputation Score (scaled 0-5 to 0-1)
      const sellerScore = Number((Math.min(5.0, Math.max(1.0, offer.seller_reputation)) / 5.0).toFixed(2));

      // 5. Geo Score
      let geoScore = 0.8;
      if (context.buyer_geo && offer.delivery.origin_geo === context.buyer_geo) {
        geoScore = 1.0;
      }

      // 6. Channel alignment
      let channelScore = 1.0;
      if (context.preferred_channel && context.preferred_channel !== 'ANY') {
        channelScore = offer.provider === context.preferred_channel ? 1.0 : 0.6;
      }

      // Final weighted calculation
      const totalScore = (
        (priceScore * w_price) +
        (deliveryScore * w_delivery) +
        (stockScore * w_stock) +
        (sellerScore * w_seller) +
        (geoScore * w_geo)
      );

      const finalOfferScore = Number(totalScore.toFixed(2));

      return {
        offer,
        offer_score: finalOfferScore,
        breakdown: {
          price_score: priceScore,
          delivery_score: deliveryScore,
          stock_score: stockScore,
          seller_score: sellerScore,
          geo_score: geoScore,
          channel_score: channelScore
        },
        why_selected: ''
      };
    });

    // Sort descending by offer_score
    scoredOffers.sort((a, b) => b.offer_score - a.offer_score);

    // Generate descriptive explanation for the winner
    if (scoredOffers.length > 0) {
      const top = scoredOffers[0];
      const o = top.offer;
      if (urgency === 'HIGH' && o.delivery.speed === 'SAME_DAY') {
        top.why_selected = `Priorizada oferta de ${o.provider} por entrega inmediata en el día (${o.delivery.description}) y stock activo (${o.stock} un.), superando opciones con envío diferido.`;
      } else if (o.price === minPrice) {
        top.why_selected = `Mejor oferta integral: menor precio de mercado ($${o.price.toLocaleString('es-AR')}) vía ${o.provider} con reputación ${o.seller_reputation}/5.`;
      } else {
        top.why_selected = `Oferta óptima en ${o.provider}: balance superior entre precio ($${o.price.toLocaleString('es-AR')}), logística (${o.delivery.description}) y stock (${o.stock} un.).`;
      }
    }

    return scoredOffers;
  }
}
