/**
 * ATLAS COMMERCE — EXTERNAL CONNECTOR SHADOW V1
 * Module: WooCommerceShadowConnector.ts
 * Path: src/lib/atlas/commerce/shadow/WooCommerceShadowConnector.ts
 * 
 * Shadow Connector for WooCommerce (WordPress REST API v3).
 * Strictly isolated: operates solely on internal fixtures and simulated keys.
 * Zero external calls, zero real OAuth, zero real webhooks.
 */

import { AtlasCommerceConnector, CommerceSellerInfo, CommerceOrderInfo } from '../AtlasCommerceConnector.ts';
import { AtlasProduct } from '../AtlasProduct.ts';
import { AtlasCommerceGate } from '../AtlasCommerceGate.ts';
import { AtlasOffer, offerToAtlasProduct } from './AtlasProductOffer.ts';

export interface WooCommerceProductFixture {
  id: number; // e.g. 3001
  name: string;
  slug: string;
  permalink: string; // "SIMULATED://woocommerce/prod_3001"
  type: 'simple' | 'variable';
  status: 'publish';
  description: string;
  short_description: string;
  sku: string;
  price: string; // e.g. "118000"
  regular_price: string;
  sale_price: string;
  manage_stock: true;
  stock_quantity: number;
  stock_status: 'instock' | 'outofstock';
  store_id: string;
  store_name: string;
  shipping_class: 'same_day_pickup' | 'express_courier' | 'standard';
  delivery_meta: {
    estimated_delivery_days: number; // 0 for today
    delivery_description: string;
    allows_local_pickup: boolean;
  };
  categories: Array<{ id: number; name: string; slug: string }>;
  canonical_product_identity_id: string;
}

export class WooCommerceShadowConnector implements AtlasCommerceConnector {
  private static instance: WooCommerceShadowConnector;
  private gate: AtlasCommerceGate;
  private fixtures: Map<string, WooCommerceProductFixture> = new Map();
  private simulatedConsumerKey: string = 'ck_sim_wc_app_key_334455';
  private simulatedConsumerSecret: string = 'cs_sim_wc_app_sec_778899';

  private constructor() {
    this.gate = AtlasCommerceGate.getInstance();
    this.gate.assertFailClosedIntegrity();
    this.seedFixtures();
  }

  public static getInstance(): WooCommerceShadowConnector {
    if (!WooCommerceShadowConnector.instance) {
      WooCommerceShadowConnector.instance = new WooCommerceShadowConnector();
    }
    return WooCommerceShadowConnector.instance;
  }

  private seedFixtures(): void {
    const products: WooCommerceProductFixture[] = [
      {
        id: 3001,
        name: 'Taladro Percutor Bosch Professional GSB 13 RE 650W',
        slug: 'taladro-percutor-bosch-gsb-13-re',
        permalink: 'SIMULATED://woocommerce/prod_3001',
        type: 'simple',
        status: 'publish',
        description: 'Herramienta profesional con mandril de 13mm. Stock físico para retiro inmediato o entrega en el día.',
        short_description: 'Taladro Bosch Professional GSB 13 RE',
        sku: 'WC-BOSCH-GSB13RE',
        price: '118000',
        regular_price: '118000',
        sale_price: '',
        manage_stock: true,
        stock_quantity: 6,
        stock_status: 'instock',
        store_id: 'STORE_WC_MAQUINAS_CAPITAL',
        store_name: 'Ferretería & Máquinas Capital (WooCommerce)',
        shipping_class: 'same_day_pickup',
        delivery_meta: {
          estimated_delivery_days: 0,
          delivery_description: 'Retiro hoy en sucursal / Entrega en el día por moto express',
          allows_local_pickup: true
        },
        categories: [{ id: 41, name: 'Herramientas Eléctricas', slug: 'herramientas-electricas' }],
        canonical_product_identity_id: 'PROD_ID_BOSCH_DRILL'
      },
      {
        id: 3002,
        name: 'Alimento Balanceado Premium Perros Adultos 15kg NutriCan Pro',
        slug: 'alimento-perros-nutrican-pro-15kg',
        permalink: 'SIMULATED://woocommerce/prod_3002',
        type: 'simple',
        status: 'publish',
        description: 'Alimento de alta digestibilidad. Retiro en veterinaria o envío express hoy.',
        short_description: 'NutriCan Pro 15kg',
        sku: 'WC-PET-NUTRICAN-15',
        price: '37500',
        regular_price: '37500',
        sale_price: '',
        manage_stock: true,
        stock_quantity: 20,
        stock_status: 'instock',
        store_id: 'STORE_WC_PET_EXPRESS',
        store_name: 'Veterinaria Express Baires (WooCommerce)',
        shipping_class: 'same_day_pickup',
        delivery_meta: {
          estimated_delivery_days: 0,
          delivery_description: 'Retiro hoy en local / Moto express en el día',
          allows_local_pickup: true
        },
        categories: [{ id: 42, name: 'Alimentos Caninos', slug: 'alimentos-caninos' }],
        canonical_product_identity_id: 'PROD_ID_PET_FOOD'
      },
      {
        id: 3003,
        name: 'Caja Resmas de Papel A4 75g (5 Resmas x 500 Hojas) Ledesma',
        slug: 'caja-resmas-papel-a4-5x500-ledesma',
        permalink: 'SIMULATED://woocommerce/prod_3003',
        type: 'simple',
        status: 'publish',
        description: 'Caja cerrada 5 resmas. Retiro en el acto por local comercial en CABA.',
        short_description: 'Papel A4 75g x5',
        sku: 'WC-LIBRERIA-A4-5X500',
        price: '28000',
        regular_price: '28000',
        sale_price: '',
        manage_stock: true,
        stock_quantity: 50,
        stock_status: 'instock',
        store_id: 'STORE_WC_LIBRERIA_SUR',
        store_name: 'Librería Sur Insumos (WooCommerce)',
        shipping_class: 'same_day_pickup',
        delivery_meta: {
          estimated_delivery_days: 0,
          delivery_description: 'Retiro hoy en sucursal / Entrega en el día',
          allows_local_pickup: true
        },
        categories: [{ id: 43, name: 'Librería Comercial', slug: 'libreria-comercial' }],
        canonical_product_identity_id: 'PROD_ID_PAPER_A4'
      },
      {
        id: 3004,
        name: 'Puesto de Trabajo Ergonómico Corporativo (Escritorio + Silla Pro)',
        slug: 'puesto-trabajo-ergonomico-corporativo',
        permalink: 'SIMULATED://woocommerce/prod_3004',
        type: 'simple',
        status: 'publish',
        description: 'Set completo con escritorio regulable y silla ejecutiva. Retiro hoy en showroom.',
        short_description: 'Puesto de Trabajo Pro',
        sku: 'WC-MUEBLES-ERGO-01',
        price: '255000',
        regular_price: '255000',
        sale_price: '',
        manage_stock: true,
        stock_quantity: 5,
        stock_status: 'instock',
        store_id: 'STORE_WC_OFICINA_PRO',
        store_name: 'Oficina Pro Baires (WooCommerce)',
        shipping_class: 'same_day_pickup',
        delivery_meta: {
          estimated_delivery_days: 0,
          delivery_description: 'Retiro hoy en showroom central',
          allows_local_pickup: true
        },
        categories: [{ id: 44, name: 'Mobiliario', slug: 'mobiliario' }],
        canonical_product_identity_id: 'PROD_ID_OFFICE_SET'
      },
      {
        id: 3005,
        name: 'Fertilizante Foliar Bio-Orgánico 20L BioPampa',
        slug: 'fertilizante-foliar-bio-organico-20l',
        permalink: 'SIMULATED://woocommerce/prod_3005',
        type: 'simple',
        status: 'publish',
        description: 'Bidón 20L bioestimulante para agro. Retiro hoy en centro logístico.',
        short_description: 'Biofertilizante 20L',
        sku: 'WC-AGRO-BIOPAMPA-20',
        price: '93000',
        regular_price: '93000',
        sale_price: '',
        manage_stock: true,
        stock_quantity: 12,
        stock_status: 'instock',
        store_id: 'STORE_WC_AGRO_CENTRAL',
        store_name: 'Agroinsumos Central (WooCommerce)',
        shipping_class: 'same_day_pickup',
        delivery_meta: {
          estimated_delivery_days: 0,
          delivery_description: 'Retiro hoy en depósito logístico',
          allows_local_pickup: true
        },
        categories: [{ id: 45, name: 'Agroinsumos', slug: 'agroinsumos' }],
        canonical_product_identity_id: 'PROD_ID_AGRO_BIO'
      },
      {
        id: 3006,
        name: 'Cafetera Espresso Comercial 2 Grupos Austral Barista Pro',
        slug: 'cafetera-espresso-comercial-2-grupos-austral',
        permalink: 'SIMULATED://woocommerce/prod_3006',
        type: 'simple',
        status: 'publish',
        description: 'Máquina espresso gastronómica profesional. Caldera de 11L, doble lanza de vapor y erogación continua.',
        short_description: 'Cafetera Comercial 2 Grupos',
        sku: 'WC-GASTRO-ESPRESSO-2G',
        price: '850000',
        regular_price: '850000',
        sale_price: '',
        manage_stock: true,
        stock_quantity: 3,
        stock_status: 'instock',
        store_id: 'STORE_WC_GASTRO_AUSTRAL',
        store_name: 'Austral Gastronomía Pro (WooCommerce)',
        shipping_class: 'same_day_pickup',
        delivery_meta: {
          estimated_delivery_days: 0,
          delivery_description: 'Retiro hoy en depósito o flete técnico en el día',
          allows_local_pickup: true
        },
        categories: [{ id: 46, name: 'Equipamiento Gastronómico', slug: 'equipamiento-gastronomico' }],
        canonical_product_identity_id: 'PROD_ID_ESPRESSO_COMM'
      },
      {
        id: 3007,
        name: 'Atlas HR Suite — Licencia Corporativa Cloud Anual (Nóminas y RRHH)',
        slug: 'atlas-hr-suite-licencia-corporativa-cloud',
        permalink: 'SIMULATED://woocommerce/prod_3007',
        type: 'simple',
        status: 'publish',
        description: 'Suscripción anual enterprise para gestión de capital humano, nóminas automáticas y onboarding digital.',
        short_description: 'Atlas HR Suite Cloud',
        sku: 'WC-SW-HR-SUITE-CLOUD',
        price: '182000',
        regular_price: '182000',
        sale_price: '',
        manage_stock: true,
        stock_quantity: 10,
        stock_status: 'instock',
        store_id: 'STORE_WC_CLOUD_SOLUTIONS',
        store_name: 'Cloud Solutions Argentina (WooCommerce)',
        shipping_class: 'same_day_pickup',
        delivery_meta: {
          estimated_delivery_days: 0,
          delivery_description: 'Activación y provisión cloud inmediata en el día',
          allows_local_pickup: false
        },
        categories: [{ id: 47, name: 'Software y Cloud', slug: 'software-cloud' }],
        canonical_product_identity_id: 'PROD_ID_HR_SUITE'
      },
      {
        id: 3008,
        name: 'Seguro Responsabilidad Civil Profesional (Mala Praxis Médica / Legal / Obras Ingeniería)',
        slug: 'seguro-responsabilidad-civil-profesional',
        permalink: 'SIMULATED://woocommerce/prod_3008',
        type: 'simple',
        status: 'publish',
        description: 'Póliza de resguardo profesional con cobertura de mala praxis médica, legal y obras de ingeniería civil.',
        short_description: 'Seguro Profesional RC',
        sku: 'WC-INS-RC-PROFESIONAL',
        price: '41500',
        regular_price: '41500',
        sale_price: '',
        manage_stock: true,
        stock_quantity: 100,
        stock_status: 'instock',
        store_id: 'STORE_WC_BROKER_SEGUROS',
        store_name: 'Brokers Asociados Baires (WooCommerce)',
        shipping_class: 'same_day_pickup',
        delivery_meta: {
          estimated_delivery_days: 0,
          delivery_description: 'Emisión digital de póliza y certificado en el día',
          allows_local_pickup: false
        },
        categories: [{ id: 48, name: 'Seguros y Finanzas', slug: 'seguros-finanzas' }],
        canonical_product_identity_id: 'PROD_ID_INSURANCE_PROF'
      },
      {
        id: 3009,
        name: 'Molinillo de Café Profesional On Demand Barista Pro 64mm',
        slug: 'molinillo-cafe-profesional-on-demand',
        permalink: 'SIMULATED://woocommerce/prod_3009',
        type: 'simple',
        status: 'publish',
        description: 'Molino micrométrico con muelas planas de acero templado para cafeterías.',
        short_description: 'Molinillo Café On Demand',
        sku: 'WC-GASTRO-GRINDER-64',
        price: '320000',
        regular_price: '320000',
        sale_price: '',
        manage_stock: true,
        stock_quantity: 5,
        stock_status: 'instock',
        store_id: 'STORE_WC_GASTRO_AUSTRAL',
        store_name: 'Austral Gastronomía Pro (WooCommerce)',
        shipping_class: 'same_day_pickup',
        delivery_meta: {
          estimated_delivery_days: 0,
          delivery_description: 'Retiro hoy en local gastronómico',
          allows_local_pickup: true
        },
        categories: [{ id: 46, name: 'Equipamiento Gastronómico', slug: 'equipamiento-gastronomico' }],
        canonical_product_identity_id: 'PROD_ID_COFFEE_GRINDER'
      },
      {
        id: 3010,
        name: 'Vajilla Café Especialidad x24 Pocillos Cerámica Doble Pared',
        slug: 'vajilla-cafe-especialidad-x24-pocillos',
        permalink: 'SIMULATED://woocommerce/prod_3010',
        type: 'simple',
        status: 'publish',
        description: 'Set de tazas y platos de cerámica térmica para servicio de espresso y flat white.',
        short_description: 'Set Pocillos x24',
        sku: 'WC-GASTRO-CUPS-24',
        price: '48000',
        regular_price: '48000',
        sale_price: '',
        manage_stock: true,
        stock_quantity: 25,
        stock_status: 'instock',
        store_id: 'STORE_WC_GASTRO_AUSTRAL',
        store_name: 'Austral Gastronomía Pro (WooCommerce)',
        shipping_class: 'same_day_pickup',
        delivery_meta: {
          estimated_delivery_days: 0,
          delivery_description: 'Retiro hoy en depósito gastronómico',
          allows_local_pickup: true
        },
        categories: [{ id: 46, name: 'Equipamiento Gastronómico', slug: 'equipamiento-gastronomico' }],
        canonical_product_identity_id: 'PROD_ID_COFFEE_CUPS'
      }
    ];

    for (const p of products) {
      this.fixtures.set(String(p.id), p);
    }
  }

  public async connect(_credentials?: any): Promise<boolean> {
    return true;
  }

  public async disconnect(): Promise<void> {}

  public async getSeller(sellerId: string): Promise<CommerceSellerInfo | null> {
    for (const p of this.fixtures.values()) {
      if (p.store_id === sellerId) {
        return {
          seller_id: p.store_id,
          name: p.store_name,
          country: 'AR',
          status: 'ACTIVE',
          currency: 'ARS',
          metadata: { provider: 'WOOCOMMERCE' }
        };
      }
    }
    return null;
  }

  public async getProducts(_filter?: any): Promise<AtlasProduct[]> {
    return Array.from(this.fixtures.values()).map(p => this.toAtlasProduct(p));
  }

  public async getProduct(productId: string): Promise<AtlasProduct | null> {
    const rawId = productId.replace(/^WC_/, '');
    const p = this.fixtures.get(rawId);
    if (!p) return null;
    return this.toAtlasProduct(p);
  }

  public getRawFixtures(): WooCommerceProductFixture[] {
    return Array.from(this.fixtures.values());
  }

  public getOffers(): AtlasOffer[] {
    return Array.from(this.fixtures.values()).map(p => this.toAtlasOffer(p));
  }

  public async getPrice(productId: string): Promise<{ price: number; currency: string } | null> {
    const rawId = productId.replace(/^WC_/, '');
    const p = this.fixtures.get(rawId);
    if (!p) return null;
    return { price: parseFloat(p.price), currency: 'ARS' };
  }

  public async getInventory(productId: string): Promise<number> {
    const rawId = productId.replace(/^WC_/, '');
    const p = this.fixtures.get(rawId);
    return p ? p.stock_quantity : 0;
  }

  public async getPurchaseUrl(productId: string, buyerContext?: any): Promise<string> {
    const rawId = productId.replace(/^WC_/, '');
    const p = this.fixtures.get(rawId);
    const base = p?.permalink || `SIMULATED://woocommerce/prod_${rawId}`;
    if (buyerContext?.buyer_id) {
      return `${base}?buyer=${encodeURIComponent(buyerContext.buyer_id)}`;
    }
    return base;
  }

  public async getOrders(_filter?: any): Promise<CommerceOrderInfo[]> {
    return [];
  }

  public async getOrder(_orderId: string): Promise<CommerceOrderInfo | null> {
    return null;
  }

  public async subscribeWebhooks(endpoint: string, _events: string[]): Promise<boolean> {
    this.gate.blockRealWebhook(endpoint);
  }

  public toAtlasOffer(item: WooCommerceProductFixture): AtlasOffer {
    const priceNum = parseFloat(item.price);

    return {
      offer_id: `OFFER_WC_${item.id}`,
      product_identity_id: item.canonical_product_identity_id,
      provider: 'WOOCOMMERCE',
      external_product_id: String(item.id),
      seller_id: item.store_id,
      seller_name: item.store_name,
      seller_reputation: 4.9,
      title: item.name,
      price: priceNum,
      currency: 'ARS',
      stock: item.stock_quantity,
      delivery: {
        speed: 'SAME_DAY',
        estimated_days: item.delivery_meta.estimated_delivery_days,
        description: item.delivery_meta.delivery_description,
        is_free_shipping: false,
        allows_local_pickup: item.delivery_meta.allows_local_pickup,
        origin_geo: 'CABA'
      },
      purchase_url: item.permalink,
      environment: 'SIMULATION',
      raw_payload: item,
      last_synced_at: new Date().toISOString()
    };
  }

  public toAtlasProduct(item: WooCommerceProductFixture): AtlasProduct {
    const offer = this.toAtlasOffer(item);
    return offerToAtlasProduct(offer);
  }
}
