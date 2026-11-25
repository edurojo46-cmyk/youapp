/**
 * ATLAS COMMERCE — EXTERNAL CONNECTOR SHADOW V1
 * Module: TiendanubeShadowConnector.ts
 * Path: src/lib/atlas/commerce/shadow/TiendanubeShadowConnector.ts
 * 
 * Shadow Connector for Tiendanube (Tienda Pago / Tienda Envío).
 * Strictly isolated: operates solely on internal fixtures and simulated tokens.
 * Zero external calls, zero real OAuth, zero real webhooks.
 */

import { AtlasCommerceConnector, CommerceSellerInfo, CommerceOrderInfo } from '../AtlasCommerceConnector.ts';
import { AtlasProduct } from '../AtlasProduct.ts';
import { AtlasCommerceGate } from '../AtlasCommerceGate.ts';
import { AtlasOffer, offerToAtlasProduct } from './AtlasProductOffer.ts';

export interface TiendanubeProductFixture {
  id: number; // e.g. 2001
  name: { es: string };
  description: { es: string };
  handle: { es: string };
  brand: string;
  store_id: string;
  store_name: string;
  categories: Array<{ id: number; name: { es: string } }>;
  variants: Array<{
    id: number;
    price: string; // e.g. "115000.00"
    promotional_price: string | null;
    stock: number;
    sku: string;
    barcode: string;
  }>;
  shipping: {
    free_shipping: boolean;
    estimated_delivery_days: number;
    delivery_description: string;
  };
  canonical_url: string; // "SIMULATED://tiendanube/prod_2001"
  canonical_product_identity_id: string;
}

export class TiendanubeShadowConnector implements AtlasCommerceConnector {
  private static instance: TiendanubeShadowConnector;
  private gate: AtlasCommerceGate;
  private fixtures: Map<string, TiendanubeProductFixture> = new Map();
  private simulatedAppToken: string = 'sim_tn_app_tok_9988776655';

  private constructor() {
    this.gate = AtlasCommerceGate.getInstance();
    this.gate.assertFailClosedIntegrity();
    this.seedFixtures();
  }

  public static getInstance(): TiendanubeShadowConnector {
    if (!TiendanubeShadowConnector.instance) {
      TiendanubeShadowConnector.instance = new TiendanubeShadowConnector();
    }
    return TiendanubeShadowConnector.instance;
  }

  private seedFixtures(): void {
    const products: TiendanubeProductFixture[] = [
      {
        id: 2001,
        name: { es: 'Taladro Percutor Bosch Professional GSB 13 RE 650W' },
        description: { es: 'Herramienta eléctrica industrial de alto impacto. Garantía oficial Bosch 1 año.' },
        handle: { es: 'taladro-percutor-bosch-gsb-13-re' },
        brand: 'Bosch',
        store_id: 'STORE_TN_FERRETERIA_NORTE',
        store_name: 'Ferretería Industrial Norte (Tiendanube)',
        categories: [{ id: 101, name: { es: 'Herramientas Eléctricas' } }],
        variants: [{
          id: 5001,
          price: '115000.00',
          promotional_price: null,
          stock: 2,
          sku: 'TN-BOSCH-GSB13',
          barcode: '3165140888999'
        }],
        shipping: {
          free_shipping: true,
          estimated_delivery_days: 1,
          delivery_description: 'Entrega mañana por Correo / Moto Express'
        },
        canonical_url: 'SIMULATED://tiendanube/prod_2001',
        canonical_product_identity_id: 'PROD_ID_BOSCH_DRILL'
      },
      {
        id: 2002,
        name: { es: 'Alimento Balanceado Premium Perros Adultos 15kg NutriCan Pro' },
        description: { es: 'Nutrición canina completa para perros medianos y grandes.' },
        handle: { es: 'alimento-perros-nutrican-pro-15kg' },
        brand: 'NutriCan Pro',
        store_id: 'STORE_TN_PET_ONLINE',
        store_name: 'NutriPet Store Argentina',
        categories: [{ id: 102, name: { es: 'Alimentos para Mascotas' } }],
        variants: [{
          id: 5002,
          price: '36900.00',
          promotional_price: null,
          stock: 15,
          sku: 'TN-PET-NUTRICAN-15KG',
          barcode: '7791234567890'
        }],
        shipping: {
          free_shipping: true,
          estimated_delivery_days: 1,
          delivery_description: 'Entrega mañana por logística directa'
        },
        canonical_url: 'SIMULATED://tiendanube/prod_2002',
        canonical_product_identity_id: 'PROD_ID_PET_FOOD'
      },
      {
        id: 2003,
        name: { es: 'Caja Resmas de Papel A4 75g (5 Resmas x 500 Hojas) Ledesma' },
        description: { es: 'Papel comercial de máxima pureza para empresas y oficinas.' },
        handle: { es: 'caja-resmas-papel-a4-ledesma-5x500' },
        brand: 'Ledesma Autor',
        store_id: 'STORE_TN_PAPELERA_CENTRAL',
        store_name: 'Papelera Central Mayorista',
        categories: [{ id: 103, name: { es: 'Papelería e Impresión' } }],
        variants: [{
          id: 5003,
          price: '27500.00',
          promotional_price: null,
          stock: 30,
          sku: 'TN-PAPEL-A4-5X500',
          barcode: '7793456789012'
        }],
        shipping: {
          free_shipping: false,
          estimated_delivery_days: 1,
          delivery_description: 'Entrega mañana en CABA / GBA'
        },
        canonical_url: 'SIMULATED://tiendanube/prod_2003',
        canonical_product_identity_id: 'PROD_ID_PAPER_A4'
      },
      {
        id: 2004,
        name: { es: 'Puesto de Trabajo Ergonómico Corporativo (Escritorio + Silla Pro)' },
        description: { es: 'Escritorio enchapado melamínico con silla giratoria regulable.' },
        handle: { es: 'puesto-trabajo-ergonomico-escritorio-silla' },
        brand: 'ErgoWork',
        store_id: 'STORE_TN_ESPACIOS_DESIGN',
        store_name: 'Espacios & Diseño Mobiliario',
        categories: [{ id: 104, name: { es: 'Muebles de Oficina' } }],
        variants: [{
          id: 5004,
          price: '249000.00',
          promotional_price: null,
          stock: 4,
          sku: 'TN-DESK-ERGO-SET',
          barcode: '7799876543210'
        }],
        shipping: {
          free_shipping: true,
          estimated_delivery_days: 2,
          delivery_description: 'Entrega coordinada en 48hs'
        },
        canonical_url: 'SIMULATED://tiendanube/prod_2004',
        canonical_product_identity_id: 'PROD_ID_OFFICE_SET'
      },
      {
        id: 2005,
        name: { es: 'Fertilizante Foliar Bio-Orgánico 20L BioPampa' },
        description: { es: 'Biofertilizante natural para aceleración vegetativa.' },
        handle: { es: 'fertilizante-foliar-bio-organico-20l' },
        brand: 'BioPampa',
        store_id: 'STORE_TN_AGROTIENDA',
        store_name: 'AgroTienda Directa',
        categories: [{ id: 105, name: { es: 'Agroinsumos y Fertilizantes' } }],
        variants: [{
          id: 5005,
          price: '91000.00',
          promotional_price: null,
          stock: 10,
          sku: 'TN-AGRO-BIO-20L',
          barcode: '7798765432109'
        }],
        shipping: {
          free_shipping: true,
          estimated_delivery_days: 2,
          delivery_description: 'Entrega en 48hs en zonas rurales y centros'
        },
        canonical_url: 'SIMULATED://tiendanube/prod_2005',
        canonical_product_identity_id: 'PROD_ID_AGRO_BIO'
      },
      {
        id: 2006,
        name: { es: 'Atlas HR Suite — Licencia Corporativa Anual (Gestión Integral RRHH y Nóminas)' },
        description: { es: 'Plataforma cloud empresarial de Recursos Humanos, liquidación de haberes y legajos digitales.' },
        handle: { es: 'atlas-hr-suite-licencia-corporativa-anual' },
        brand: 'Atlas Software',
        store_id: 'STORE_TN_ATLAS_CLOUD',
        store_name: 'Atlas Enterprise Solutions (Tiendanube)',
        categories: [{ id: 108, name: { es: 'Software Corporativo' } }],
        variants: [{
          id: 5006,
          price: '185000.00',
          promotional_price: null,
          stock: 50,
          sku: 'TN-SW-HR-SUITE',
          barcode: '7796543210987'
        }],
        shipping: {
          free_shipping: true,
          estimated_delivery_days: 0,
          delivery_description: 'Activación digital inmediata en la nube'
        },
        canonical_url: 'SIMULATED://tiendanube/prod_2006',
        canonical_product_identity_id: 'PROD_ID_HR_SUITE'
      },
      {
        id: 2007,
        name: { es: 'Pipeta Antiparasitaria Externa Perros Grandes 20-40kg' },
        description: { es: 'Protección integral mensual contra pulgas, garrapatas y mosquitos.' },
        handle: { es: 'pipeta-antiparasitaria-perros-grandes' },
        brand: 'FiproMax',
        store_id: 'STORE_TN_PET_ONLINE',
        store_name: 'NutriPet Store Argentina',
        categories: [{ id: 106, name: { es: 'Farmacia Veterinaria' } }],
        variants: [{
          id: 5007,
          price: '8900.00',
          promotional_price: null,
          stock: 120,
          sku: 'TN-VET-PIPETA-L',
          barcode: '7795432109876'
        }],
        shipping: {
          free_shipping: false,
          estimated_delivery_days: 1,
          delivery_description: 'Entrega mañana'
        },
        canonical_url: 'SIMULATED://tiendanube/prod_2007',
        canonical_product_identity_id: 'PROD_ID_PET_PIPETA'
      },
      {
        id: 2008,
        name: { es: 'Cama Ortopédica Antidesgarro Mascotas XL Memory Foam' },
        description: { es: 'Colchón viscoelástico para descanso canino de alto soporte.' },
        handle: { es: 'cama-ortopedica-antidesgarro-xl' },
        brand: 'ComfortPet',
        store_id: 'STORE_TN_PET_ONLINE',
        store_name: 'NutriPet Store Argentina',
        categories: [{ id: 107, name: { es: 'Accesorios Mascotas' } }],
        variants: [{
          id: 5008,
          price: '45000.00',
          promotional_price: null,
          stock: 18,
          sku: 'TN-BED-ORTHO-XL',
          barcode: '7794321098765'
        }],
        shipping: {
          free_shipping: true,
          estimated_delivery_days: 1,
          delivery_description: 'Entrega mañana'
        },
        canonical_url: 'SIMULATED://tiendanube/prod_2008',
        canonical_product_identity_id: 'PROD_ID_PET_BED_XL'
      },
      {
        id: 2009,
        name: { es: 'Snack Dental Sticks Caninos Cuidado Bucal Pack x30' },
        description: { es: 'Barras masticables para reducción de sarro y placa bacteriana.' },
        handle: { es: 'snack-dental-sticks-caninos-pack-30' },
        brand: 'DentixCan',
        store_id: 'STORE_TN_PET_ONLINE',
        store_name: 'NutriPet Store Argentina',
        categories: [{ id: 102, name: { es: 'Alimentos para Mascotas' } }],
        variants: [{
          id: 5009,
          price: '12000.00',
          promotional_price: null,
          stock: 85,
          sku: 'TN-SNACK-DENTAL-30',
          barcode: '7793210987654'
        }],
        shipping: {
          free_shipping: false,
          estimated_delivery_days: 1,
          delivery_description: 'Entrega mañana'
        },
        canonical_url: 'SIMULATED://tiendanube/prod_2009',
        canonical_product_identity_id: 'PROD_ID_PET_DENTAL_STICKS'
      },
      {
        id: 2010,
        name: { es: 'Transportadora Canina Homologada IATA N°4 con Ruedas' },
        description: { es: 'Caja de transporte aéreo y terrestre de alta resistencia para viajes.' },
        handle: { es: 'transportadora-canina-homologada-iata-4' },
        brand: 'TravelPet Pro',
        store_id: 'STORE_TN_PET_ONLINE',
        store_name: 'NutriPet Store Argentina',
        categories: [{ id: 107, name: { es: 'Accesorios Mascotas' } }],
        variants: [{
          id: 5010,
          price: '55000.00',
          promotional_price: null,
          stock: 9,
          sku: 'TN-CARRIER-IATA-4',
          barcode: '7792109876543'
        }],
        shipping: {
          free_shipping: true,
          estimated_delivery_days: 2,
          delivery_description: 'Entrega en 48hs por encomienda'
        },
        canonical_url: 'SIMULATED://tiendanube/prod_2010',
        canonical_product_identity_id: 'PROD_ID_PET_CARRIER_IATA'
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
          metadata: { provider: 'TIENDANUBE' }
        };
      }
    }
    return null;
  }

  public async getProducts(_filter?: any): Promise<AtlasProduct[]> {
    return Array.from(this.fixtures.values()).map(p => this.toAtlasProduct(p));
  }

  public async getProduct(productId: string): Promise<AtlasProduct | null> {
    const rawId = productId.replace(/^TN_/, '');
    const p = this.fixtures.get(rawId);
    if (!p) return null;
    return this.toAtlasProduct(p);
  }

  public getRawFixtures(): TiendanubeProductFixture[] {
    return Array.from(this.fixtures.values());
  }

  public getOffers(): AtlasOffer[] {
    return Array.from(this.fixtures.values()).map(p => this.toAtlasOffer(p));
  }

  public async getPrice(productId: string): Promise<{ price: number; currency: string } | null> {
    const rawId = productId.replace(/^TN_/, '');
    const p = this.fixtures.get(rawId);
    if (!p) return null;
    return { price: parseFloat(p.variants[0].price), currency: 'ARS' };
  }

  public async getInventory(productId: string): Promise<number> {
    const rawId = productId.replace(/^TN_/, '');
    const p = this.fixtures.get(rawId);
    return p ? p.variants[0].stock : 0;
  }

  public async getPurchaseUrl(productId: string, buyerContext?: any): Promise<string> {
    const rawId = productId.replace(/^TN_/, '');
    const p = this.fixtures.get(rawId);
    const base = p?.canonical_url || `SIMULATED://tiendanube/prod_${rawId}`;
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

  public toAtlasOffer(item: TiendanubeProductFixture): AtlasOffer {
    const variant = item.variants[0];
    const priceNum = parseFloat(variant.price);

    return {
      offer_id: `OFFER_TN_${item.id}`,
      product_identity_id: item.canonical_product_identity_id,
      provider: 'TIENDANUBE',
      external_product_id: String(item.id),
      seller_id: item.store_id,
      seller_name: item.store_name,
      seller_reputation: 4.8,
      title: item.name.es,
      price: priceNum,
      currency: 'ARS',
      stock: variant.stock,
      delivery: {
        speed: item.shipping.estimated_delivery_days <= 1 ? 'NEXT_DAY' : 'STANDARD_2_3_DAYS',
        estimated_days: item.shipping.estimated_delivery_days,
        description: item.shipping.delivery_description,
        is_free_shipping: item.shipping.free_shipping,
        allows_local_pickup: true,
        origin_geo: 'CABA'
      },
      purchase_url: item.canonical_url,
      environment: 'SIMULATION',
      raw_payload: item,
      last_synced_at: new Date().toISOString()
    };
  }

  public toAtlasProduct(item: TiendanubeProductFixture): AtlasProduct {
    const offer = this.toAtlasOffer(item);
    return offerToAtlasProduct(offer);
  }
}
