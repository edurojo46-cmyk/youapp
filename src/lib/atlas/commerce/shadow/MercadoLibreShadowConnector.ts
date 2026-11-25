/**
 * ATLAS COMMERCE — EXTERNAL CONNECTOR SHADOW V1
 * Module: MercadoLibreShadowConnector.ts
 * Path: src/lib/atlas/commerce/shadow/MercadoLibreShadowConnector.ts
 * 
 * Shadow Connector for Mercado Libre Argentina (MLA).
 * Strictly isolated: operates solely on internal fixtures and simulated tokens.
 * Zero external calls, zero real OAuth, zero real webhooks.
 */

import { AtlasCommerceConnector, CommerceSellerInfo, CommerceOrderInfo } from '../AtlasCommerceConnector.ts';
import { AtlasProduct } from '../AtlasProduct.ts';
import { AtlasCommerceGate } from '../AtlasCommerceGate.ts';
import { AtlasOffer, offerToAtlasProduct } from './AtlasProductOffer.ts';

export interface MercadoLibreItemFixture {
  id: string; // e.g. "MLA1001"
  site_id: 'MLA';
  title: string;
  seller_id: string;
  seller_name: string;
  seller_reputation_level: number; // 1-5
  price: number;
  base_price: number;
  currency_id: 'ARS';
  initial_quantity: number;
  available_quantity: number;
  sold_quantity: number;
  buying_mode: 'buy_it_now';
  listing_type_id: 'gold_special';
  condition: 'new';
  permalink: string; // "SIMULATED://mercadolibre/MLA1001"
  thumbnail: string;
  accepts_mercadopago: true;
  shipping: {
    mode: 'me2';
    free_shipping: boolean;
    logistic_type: 'cross_docking' | 'fulfillment';
    estimated_delivery_days: number;
    delivery_description: string;
  };
  attributes: Array<{ id: string; name: string; value_name: string }>;
  canonical_product_identity_id: string;
}

export class MercadoLibreShadowConnector implements AtlasCommerceConnector {
  private static instance: MercadoLibreShadowConnector;
  private gate: AtlasCommerceGate;
  private fixtures: Map<string, MercadoLibreItemFixture> = new Map();
  private simulatedAccessToken: string = 'sim_ml_tok_auth_789456123';

  private constructor() {
    this.gate = AtlasCommerceGate.getInstance();
    this.gate.assertFailClosedIntegrity();
    this.seedFixtures();
  }

  public static getInstance(): MercadoLibreShadowConnector {
    if (!MercadoLibreShadowConnector.instance) {
      MercadoLibreShadowConnector.instance = new MercadoLibreShadowConnector();
    }
    return MercadoLibreShadowConnector.instance;
  }

  private seedFixtures(): void {
    const items: MercadoLibreItemFixture[] = [
      {
        id: 'MLA1001',
        site_id: 'MLA',
        title: 'Taladro Percutor Bosch Professional GSB 13 RE 650W',
        seller_id: 'SELLER_ML_BOSCH_OFFICIAL',
        seller_name: 'Bosch Tienda Oficial ML',
        seller_reputation_level: 5,
        price: 120000,
        base_price: 120000,
        currency_id: 'ARS',
        initial_quantity: 20,
        available_quantity: 4,
        sold_quantity: 16,
        buying_mode: 'buy_it_now',
        listing_type_id: 'gold_special',
        condition: 'new',
        permalink: 'SIMULATED://mercadolibre/MLA1001',
        thumbnail: 'SIMULATED://assets/mla1001.jpg',
        accepts_mercadopago: true,
        shipping: {
          mode: 'me2',
          free_shipping: true,
          logistic_type: 'cross_docking',
          estimated_delivery_days: 2,
          delivery_description: 'Llega en 2 días por Mercado Envíos'
        },
        attributes: [
          { id: 'BRAND', name: 'Marca', value_name: 'Bosch' },
          { id: 'POWER', name: 'Potencia', value_name: '650 W' }
        ],
        canonical_product_identity_id: 'PROD_ID_BOSCH_DRILL'
      },
      {
        id: 'MLA1002',
        site_id: 'MLA',
        title: 'Alimento Balanceado Premium Perros Adultos 15kg NutriCan Pro',
        seller_id: 'SELLER_ML_PET_SUPERSTORE',
        seller_name: 'Pet SuperStore Argentina',
        seller_reputation_level: 4.8,
        price: 38500,
        base_price: 38500,
        currency_id: 'ARS',
        initial_quantity: 100,
        available_quantity: 45,
        sold_quantity: 55,
        buying_mode: 'buy_it_now',
        listing_type_id: 'gold_special',
        condition: 'new',
        permalink: 'SIMULATED://mercadolibre/MLA1002',
        thumbnail: 'SIMULATED://assets/mla1002.jpg',
        accepts_mercadopago: true,
        shipping: {
          mode: 'me2',
          free_shipping: true,
          logistic_type: 'cross_docking',
          estimated_delivery_days: 2,
          delivery_description: 'Llega en 2 días por Mercado Envíos'
        },
        attributes: [{ id: 'WEIGHT', name: 'Peso', value_name: '15 kg' }],
        canonical_product_identity_id: 'PROD_ID_PET_FOOD'
      },
      {
        id: 'MLA1003',
        site_id: 'MLA',
        title: 'Caja Resmas de Papel A4 75g (5 Resmas x 500 Hojas) Ledesma Autor',
        seller_id: 'SELLER_ML_LIBRERIA_EXPRESS',
        seller_name: 'Librería Express MercadoLíder',
        seller_reputation_level: 4.9,
        price: 29000,
        base_price: 29000,
        currency_id: 'ARS',
        initial_quantity: 200,
        available_quantity: 80,
        sold_quantity: 120,
        buying_mode: 'buy_it_now',
        listing_type_id: 'gold_special',
        condition: 'new',
        permalink: 'SIMULATED://mercadolibre/MLA1003',
        thumbnail: 'SIMULATED://assets/mla1003.jpg',
        accepts_mercadopago: true,
        shipping: {
          mode: 'me2',
          free_shipping: false,
          logistic_type: 'cross_docking',
          estimated_delivery_days: 2,
          delivery_description: 'Llega en 2 días'
        },
        attributes: [{ id: 'SIZE', name: 'Tamaño', value_name: 'A4' }],
        canonical_product_identity_id: 'PROD_ID_PAPER_A4'
      },
      {
        id: 'MLA1004',
        site_id: 'MLA',
        title: 'Puesto de Trabajo Ergonómico Corporativo (Escritorio + Silla Pro)',
        seller_id: 'SELLER_ML_MUEBLES_CORP',
        seller_name: 'Muebles Corp Oficial',
        seller_reputation_level: 4.6,
        price: 260000,
        base_price: 260000,
        currency_id: 'ARS',
        initial_quantity: 15,
        available_quantity: 8,
        sold_quantity: 7,
        buying_mode: 'buy_it_now',
        listing_type_id: 'gold_special',
        condition: 'new',
        permalink: 'SIMULATED://mercadolibre/MLA1004',
        thumbnail: 'SIMULATED://assets/mla1004.jpg',
        accepts_mercadopago: true,
        shipping: {
          mode: 'me2',
          free_shipping: true,
          logistic_type: 'cross_docking',
          estimated_delivery_days: 3,
          delivery_description: 'Llega en 3 días hábiles'
        },
        attributes: [{ id: 'TYPE', name: 'Tipo', value_name: 'Ergonómico' }],
        canonical_product_identity_id: 'PROD_ID_OFFICE_SET'
      },
      {
        id: 'MLA1005',
        site_id: 'MLA',
        title: 'Fertilizante Foliar Bio-Orgánico 20L BioPampa',
        seller_id: 'SELLER_ML_AGRO_SUPPLY',
        seller_name: 'AgroSupply Argentina',
        seller_reputation_level: 4.7,
        price: 95000,
        base_price: 95000,
        currency_id: 'ARS',
        initial_quantity: 40,
        available_quantity: 20,
        sold_quantity: 20,
        buying_mode: 'buy_it_now',
        listing_type_id: 'gold_special',
        condition: 'new',
        permalink: 'SIMULATED://mercadolibre/MLA1005',
        thumbnail: 'SIMULATED://assets/mla1005.jpg',
        accepts_mercadopago: true,
        shipping: {
          mode: 'me2',
          free_shipping: true,
          logistic_type: 'cross_docking',
          estimated_delivery_days: 3,
          delivery_description: 'Llega en 3 días por Mercado Envíos'
        },
        attributes: [{ id: 'VOLUME', name: 'Volumen', value_name: '20 L' }],
        canonical_product_identity_id: 'PROD_ID_AGRO_BIO'
      },
      {
        id: 'MLA1006',
        site_id: 'MLA',
        title: 'Soldadora Inverter 200A Gamma Elite ARC Turbo',
        seller_id: 'SELLER_ML_MAQUINAS_PRO',
        seller_name: 'Máquinas Pro Ferretería',
        seller_reputation_level: 4.8,
        price: 165000,
        base_price: 165000,
        currency_id: 'ARS',
        initial_quantity: 25,
        available_quantity: 10,
        sold_quantity: 15,
        buying_mode: 'buy_it_now',
        listing_type_id: 'gold_special',
        condition: 'new',
        permalink: 'SIMULATED://mercadolibre/MLA1006',
        thumbnail: 'SIMULATED://assets/mla1006.jpg',
        accepts_mercadopago: true,
        shipping: {
          mode: 'me2',
          free_shipping: true,
          logistic_type: 'cross_docking',
          estimated_delivery_days: 2,
          delivery_description: 'Llega en 2 días'
        },
        attributes: [{ id: 'AMPERAGE', name: 'Amperaje', value_name: '200 A' }],
        canonical_product_identity_id: 'PROD_ID_WELDER_200A'
      },
      {
        id: 'MLA1007',
        site_id: 'MLA',
        title: 'Generador Eléctrico Naftero 3500W Lusqtoff Monofásico',
        seller_id: 'SELLER_ML_ENERGIA_SUR',
        seller_name: 'Energía Sur Equipos',
        seller_reputation_level: 4.5,
        price: 420000,
        base_price: 420000,
        currency_id: 'ARS',
        initial_quantity: 8,
        available_quantity: 3,
        sold_quantity: 5,
        buying_mode: 'buy_it_now',
        listing_type_id: 'gold_special',
        condition: 'new',
        permalink: 'SIMULATED://mercadolibre/MLA1007',
        thumbnail: 'SIMULATED://assets/mla1007.jpg',
        accepts_mercadopago: true,
        shipping: {
          mode: 'me2',
          free_shipping: true,
          logistic_type: 'cross_docking',
          estimated_delivery_days: 4,
          delivery_description: 'Envío especial en 4 días'
        },
        attributes: [{ id: 'OUTPUT', name: 'Potencia', value_name: '3500 W' }],
        canonical_product_identity_id: 'PROD_ID_GENERATOR_3500W'
      },
      {
        id: 'MLA1008',
        site_id: 'MLA',
        title: 'Juego Bocallaves Tubos Crique 108 Piezas Cromo Vanadio',
        seller_id: 'SELLER_ML_HERRAMIENTAS_YA',
        seller_name: 'Herramientas Ya Distribuidora',
        seller_reputation_level: 4.9,
        price: 65000,
        base_price: 65000,
        currency_id: 'ARS',
        initial_quantity: 50,
        available_quantity: 25,
        sold_quantity: 25,
        buying_mode: 'buy_it_now',
        listing_type_id: 'gold_special',
        condition: 'new',
        permalink: 'SIMULATED://mercadolibre/MLA1008',
        thumbnail: 'SIMULATED://assets/mla1008.jpg',
        accepts_mercadopago: true,
        shipping: {
          mode: 'me2',
          free_shipping: true,
          logistic_type: 'cross_docking',
          estimated_delivery_days: 2,
          delivery_description: 'Llega en 2 días'
        },
        attributes: [{ id: 'PIECES', name: 'Piezas', value_name: '108' }],
        canonical_product_identity_id: 'PROD_ID_SOCKET_SET_108'
      },
      {
        id: 'MLA1009',
        site_id: 'MLA',
        title: 'Bomba Centrífuga Elevadora de Agua 1HP Motorarg BC 100',
        seller_id: 'SELLER_ML_SANITARIOS_CENTRO',
        seller_name: 'Sanitarios Centro Mayorista',
        seller_reputation_level: 4.7,
        price: 88000,
        base_price: 88000,
        currency_id: 'ARS',
        initial_quantity: 30,
        available_quantity: 14,
        sold_quantity: 16,
        buying_mode: 'buy_it_now',
        listing_type_id: 'gold_special',
        condition: 'new',
        permalink: 'SIMULATED://mercadolibre/MLA1009',
        thumbnail: 'SIMULATED://assets/mla1009.jpg',
        accepts_mercadopago: true,
        shipping: {
          mode: 'me2',
          free_shipping: true,
          logistic_type: 'cross_docking',
          estimated_delivery_days: 3,
          delivery_description: 'Llega en 3 días'
        },
        attributes: [{ id: 'POWER_HP', name: 'Potencia', value_name: '1 HP' }],
        canonical_product_identity_id: 'PROD_ID_WATER_PUMP_1HP'
      },
      {
        id: 'MLA1010',
        site_id: 'MLA',
        title: 'Seguro de Responsabilidad Civil Profesional (Mala Praxis Médica / Legal / Ingeniería)',
        seller_id: 'SELLER_ML_MERCANTIL_SEGUROS',
        seller_name: 'Aseguradora Mercantil Oficial ML',
        seller_reputation_level: 4.9,
        price: 42000,
        base_price: 42000,
        currency_id: 'ARS',
        initial_quantity: 10000,
        available_quantity: 9999,
        sold_quantity: 350,
        buying_mode: 'buy_it_now',
        listing_type_id: 'gold_special',
        condition: 'new',
        permalink: 'SIMULATED://mercadolibre/MLA1010',
        thumbnail: 'SIMULATED://assets/mla1010.jpg',
        accepts_mercadopago: true,
        shipping: {
          mode: 'me2',
          free_shipping: true,
          logistic_type: 'fulfillment',
          estimated_delivery_days: 0,
          delivery_description: 'Emisión digital inmediata'
        },
        attributes: [
          { id: 'COVERAGE', name: 'Cobertura', value_name: 'Mala Praxis Profesional' },
          { id: 'TARGET', name: 'Destinatario', value_name: 'Médicos, Cirujanos, Abogados, Ingenieros' }
        ],
        canonical_product_identity_id: 'PROD_ID_INSURANCE_PROF'
      }
    ];

    for (const item of items) {
      this.fixtures.set(item.id, item);
    }
  }

  public async connect(_credentials?: any): Promise<boolean> {
    return true;
  }

  public async disconnect(): Promise<void> {}

  public async getSeller(sellerId: string): Promise<CommerceSellerInfo | null> {
    for (const item of this.fixtures.values()) {
      if (item.seller_id === sellerId) {
        return {
          seller_id: item.seller_id,
          name: item.seller_name,
          country: 'AR',
          status: 'ACTIVE',
          currency: 'ARS',
          metadata: { provider: 'MERCADO_LIBRE', reputation_level: item.seller_reputation_level }
        };
      }
    }
    return null;
  }

  public async getProducts(_filter?: any): Promise<AtlasProduct[]> {
    return Array.from(this.fixtures.values()).map(item => this.toAtlasProduct(item));
  }

  public async getProduct(productId: string): Promise<AtlasProduct | null> {
    const item = this.fixtures.get(productId);
    if (!item) return null;
    return this.toAtlasProduct(item);
  }

  public getRawFixtures(): MercadoLibreItemFixture[] {
    return Array.from(this.fixtures.values());
  }

  public getOffers(): AtlasOffer[] {
    return Array.from(this.fixtures.values()).map(item => this.toAtlasOffer(item));
  }

  public async getPrice(productId: string): Promise<{ price: number; currency: string } | null> {
    const item = this.fixtures.get(productId);
    if (!item) return null;
    return { price: item.price, currency: item.currency_id };
  }

  public async getInventory(productId: string): Promise<number> {
    const item = this.fixtures.get(productId);
    return item ? item.available_quantity : 0;
  }

  public async getPurchaseUrl(productId: string, buyerContext?: any): Promise<string> {
    const item = this.fixtures.get(productId);
    const base = item?.permalink || `SIMULATED://mercadolibre/${productId}`;
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

  public toAtlasOffer(item: MercadoLibreItemFixture): AtlasOffer {
    return {
      offer_id: `OFFER_ML_${item.id}`,
      product_identity_id: item.canonical_product_identity_id,
      provider: 'MERCADO_LIBRE',
      external_product_id: item.id,
      seller_id: item.seller_id,
      seller_name: item.seller_name,
      seller_reputation: item.seller_reputation_level,
      title: item.title,
      price: item.price,
      currency: 'ARS',
      stock: item.available_quantity,
      delivery: {
        speed: item.shipping.estimated_delivery_days <= 1 ? 'NEXT_DAY' : 'STANDARD_2_3_DAYS',
        estimated_days: item.shipping.estimated_delivery_days,
        description: item.shipping.delivery_description,
        is_free_shipping: item.shipping.free_shipping,
        allows_local_pickup: false,
        origin_geo: 'AMBA'
      },
      purchase_url: item.permalink,
      environment: 'SIMULATION',
      raw_payload: item,
      last_synced_at: new Date().toISOString()
    };
  }

  public toAtlasProduct(item: MercadoLibreItemFixture): AtlasProduct {
    const offer = this.toAtlasOffer(item);
    return offerToAtlasProduct(offer);
  }
}
