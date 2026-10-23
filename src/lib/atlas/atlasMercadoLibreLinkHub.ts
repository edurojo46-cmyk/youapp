/**
 * ATLAS — MERCADO LIBRE CREATOR LINK HUB V1
 * Canonical Module: ATLAS_MERCADOLIBRE_LINK_HUB
 *
 * Permanent Creator Hub for YouTube Channel Profile Link:
 * Route: /recomendados
 *
 * Flow:
 * VIDEO -> LINK EN PERFIL -> /recomendados -> PRODUCTO -> MERCADOLIBRE_AFFILIATE_URL
 *
 * REGLA IMPORTANTE:
 * NO modificar ni ocultar el enlace afiliado final de Mercado Libre.
 * El botón 'VER EN MERCADO LIBRE' abre el MERCADOLIBRE_AFFILIATE_URL original.
 * Atlas registra el click antes de navegar.
 */

import { getProductBaseUrl } from '../../../packages/config/products';

export interface MercadoLibreProduct {
  VIDEO_ID: string;
  PRODUCT_ID: string;
  PRODUCT_TITLE: string;
  PRODUCT_IMAGE: string;
  AFFILIATE_URL: string;
  CAMPAIGN_ID: string;
  CLICKS: number;
}

const STORAGE_KEY = 'atlas_ml_creator_hub_products_v1';

export const INITIAL_RECOMMENDED_PRODUCTS: MercadoLibreProduct[] = [
  {
    VIDEO_ID: 'RECIPE_001',
    PRODUCT_ID: 'ML-RECIPE-001',
    PRODUCT_TITLE: 'Libro El Obstáculo Es El Camino — Ryan Holiday (Edición Oficial)',
    PRODUCT_IMAGE: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
    AFFILIATE_URL: 'https://articulo.mercadolibre.com.ar/MLA-1142981290-el-obstaculo-es-el-camino-ryan-holiday-libro-nuevo-_JM?matt_tool=28896014&matt_word=creator_hub',
    CAMPAIGN_ID: 'CAMP_EMOTIVE_CREATOR_V1',
    CLICKS: 0
  },
  {
    VIDEO_ID: 'RECIPE_002',
    PRODUCT_ID: 'ML-RECIPE-002',
    PRODUCT_TITLE: 'Bonsái Ficus Retusa En Maceta De Cerámica Esmaltada (Resistencia & Fortaleza)',
    PRODUCT_IMAGE: 'https://images.unsplash.com/photo-1512428813834-c702c7702b78?auto=format&fit=crop&w=600&q=80',
    AFFILIATE_URL: 'https://articulo.mercadolibre.com.ar/MLA-930419201-bonsai-ficus-retusa-maceta-ceramica-artesanal-_JM?matt_tool=28896014&matt_word=creator_hub',
    CAMPAIGN_ID: 'CAMP_EMOTIVE_CREATOR_V1',
    CLICKS: 0
  },
  {
    VIDEO_ID: 'RECIPE_003',
    PRODUCT_ID: 'ML-RECIPE-003',
    PRODUCT_TITLE: 'Farol Lámpara Vintage LED Recargable Luz Cálida Portátil (Senderos en la Niebla)',
    PRODUCT_IMAGE: 'https://images.unsplash.com/photo-1507034589631-9433cc6bc453?auto=format&fit=crop&w=600&q=80',
    AFFILIATE_URL: 'https://articulo.mercadolibre.com.ar/MLA-1405298104-farol-vintage-led-recargable-luz-calida-camping-hogar-_JM?matt_tool=28896014&matt_word=creator_hub',
    CAMPAIGN_ID: 'CAMP_EMOTIVE_CREATOR_V1',
    CLICKS: 0
  }
];

class AtlasMercadoLibreLinkHubService {
  private products: MercadoLibreProduct[] = [];

  constructor() {
    this.init();
  }

  private init() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const cached = window.localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.products = parsed;
            return;
          }
        }
      }
    } catch {
      // Ignore storage errors
    }
    this.products = [...INITIAL_RECOMMENDED_PRODUCTS];
  }

  private save() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.products));
      }
    } catch {
      // Ignore storage errors
    }
  }

  getAllProducts(): MercadoLibreProduct[] {
    return [...this.products];
  }

  getProductByVideoId(videoId: string): MercadoLibreProduct | undefined {
    return this.products.find(p => p.VIDEO_ID === videoId);
  }

  getProductById(productId: string): MercadoLibreProduct | undefined {
    return this.products.find(p => p.PRODUCT_ID === productId);
  }

  recordClick(productId: string): { success: boolean; clicks: number; affiliateUrl: string } | null {
    const item = this.products.find(p => p.PRODUCT_ID === productId);
    if (!item) return null;

    item.CLICKS = (item.CLICKS || 0) + 1;
    this.save();

    return {
      success: true,
      clicks: item.CLICKS,
      affiliateUrl: item.AFFILIATE_URL // Preserved untouched
    };
  }

  getYouTubeProfileUrl(): string {
    const baseUrl = getProductBaseUrl('ATLAS');
    return `${baseUrl}/recomendados`;
  }
}

export const AtlasMercadoLibreLinkHub = new AtlasMercadoLibreLinkHubService();
export default AtlasMercadoLibreLinkHub;
