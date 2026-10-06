/**
 * ATLAS LOCAL — VIRAL WHATSAPP DISTRIBUTION & ATTRIBUTION ENGINE
 * 
 * Invariants:
 * - WHATSAPP = Distribution & Acquisition channel ONLY.
 * - ATLAS LOCAL = Community Host & Final Destination.
 * - NO WhatsApp groups, communities or "Unirme a WhatsApp" links.
 * - Generates targeted deep links (/local/{barrio}/{type}/{id}) with anonymous attribution tokens.
 */

export type ShareableContentType = 
  | 'OFFER' 
  | 'DEMAND'
  | 'BUSINESS' 
  | 'PRODUCT_SERVICE' 
  | 'LOCAL_SEARCH' 
  | 'B2B_OPPORTUNITY';

export interface ViralSharePayload {
  share_id: string;
  content_type: ShareableContentType;
  content_id: string;
  barrio_id: string;
  organization_id?: string;
  title: string;
  summary: string;
  valid_until?: string;
}

export interface ViralAttributionRecord {
  share_id: string;
  content_type: ShareableContentType;
  content_id: string;
  barrio_id: string;
  organization_id?: string;
  referrer_channel: 'WHATSAPP';
  created_at: string;
}

import { getIndustrialUrl } from '../../../packages/config/products';

export class AtlasViralShareEngine {
  private static getBaseUrl(): string {
    if (typeof window !== 'undefined') {
      if (window.location.port === '5176') {
        return window.location.origin;
      }
      return getIndustrialUrl('/');
    }
    return getIndustrialUrl('/');
  }

  /**
   * Generates a direct canonical deep link for a specific shareable content item.
   * Invariant: Deep links always return to Busca Industrial (Industrial Market).
   */
  public static buildDeepLink(
    barrioId: string,
    contentType: ShareableContentType,
    contentId: string,
    shareId: string
  ): string {
    const typeRouteMap: Record<ShareableContentType, string> = {
      OFFER: 'oferta',
      DEMAND: 'demanda',
      BUSINESS: 'comercio',
      PRODUCT_SERVICE: 'producto',
      LOCAL_SEARCH: 'buscar',
      B2B_OPPORTUNITY: 'oportunidad'
    };

    const section = typeRouteMap[contentType] || 'oferta';
    const baseUrl = this.getBaseUrl();
    return `${baseUrl}/industrial/local/${barrioId}/${section}/${encodeURIComponent(contentId)}?ref=${shareId}`;
  }

  /**
   * Registers a first-party share in the backend database and returns WhatsApp share URL.
   * If parent_share_id is provided, it maintains viral chain depth attribution.
   * NO private personal data is included in the URL or payload.
   */
  public static async createTrackedShare(params: {
    content_type: ShareableContentType;
    content_id: string;
    barrio_id?: string;
    organization_id?: string;
    parent_share_id?: string | null;
    title: string;
    summary: string;
    valid_until?: string;
  }): Promise<{
    share_id: string;
    deepLink: string;
    whatsappUrl: string;
  }> {
    const barrioId = params.barrio_id || 'caballito';
    const shareId = 'sh_' + Math.random().toString(36).substring(2, 10);

    try {
      await fetch('/api/atlas/local/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          share_id: shareId,
          content_type: params.content_type,
          content_id: params.content_id,
          barrio_id: barrioId,
          organization_id: params.organization_id || null,
          parent_share_id: params.parent_share_id || null
        })
      });
    } catch (e) {
      console.warn('[ViralShare] Failed to log share attribution to backend:', e);
    }

    const { whatsappUrl, deepLink } = this.createWhatsAppShareLink({
      share_id: shareId,
      content_type: params.content_type,
      content_id: params.content_id,
      barrio_id: barrioId,
      organization_id: params.organization_id,
      title: params.title,
      summary: params.summary,
      valid_until: params.valid_until
    });

    return { share_id: shareId, deepLink, whatsappUrl };
  }

  /**
   * Generates formatted WhatsApp share message with deep link and CTA.
   */
  public static createWhatsAppShareLink(payload: ViralSharePayload): {
    whatsappUrl: string;
    deepLink: string;
    attribution: ViralAttributionRecord;
  } {
    const deepLink = this.buildDeepLink(payload.barrio_id, payload.content_type, payload.content_id, payload.share_id);

    let messageText = `*${payload.title}*\n`;
    messageText += `${payload.summary}\n`;
    if (payload.valid_until) {
      messageText += `Vigencia: ${new Date(payload.valid_until).toLocaleDateString('es-AR')}\n`;
    }
    messageText += `\nVer en Industrial Market:\n${deepLink}`;

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(messageText)}`;

    const attribution: ViralAttributionRecord = {
      share_id: payload.share_id,
      content_type: payload.content_type,
      content_id: payload.content_id,
      barrio_id: payload.barrio_id,
      organization_id: payload.organization_id,
      referrer_channel: 'WHATSAPP',
      created_at: new Date().toISOString()
    };

    return { whatsappUrl, deepLink, attribution };
  }
}

