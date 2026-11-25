/**
 * ATLAS VENDER / COMMERCE V1
 * Module: AtlasCommerceConnector.ts
 * Path: src/lib/atlas/commerce/AtlasCommerceConnector.ts
 * 
 * Standard contract / interface for external & internal commerce providers.
 * Extensible for Mercado Libre, Shopify, Tiendanube, Stripe, WooCommerce, etc.
 */

import { AtlasProduct } from './AtlasProduct.ts';

export interface CommerceSellerInfo {
  seller_id: string;
  name: string;
  email?: string;
  country: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  currency: string;
  metadata?: Record<string, any>;
}

export interface CommerceOrderInfo {
  order_id: string;
  buyer_id?: string;
  seller_id: string;
  product_id: string;
  quantity: number;
  total_amount: number;
  currency: string;
  status: 'PENDING' | 'PAID' | 'FULFILLED' | 'CANCELLED';
  created_at: string;
  metadata?: Record<string, any>;
}

export const AtlasCommerceConnector = {};
export interface AtlasCommerceConnector {
  /** Connects / authenticates with the commerce provider */
  connect(credentials?: any): Promise<boolean>;

  /** Disconnects cleanly */
  disconnect(): Promise<void>;

  /** Retrieves seller details */
  getSeller(sellerId: string): Promise<CommerceSellerInfo | null>;

  /** Fetches list of products matching criteria */
  getProducts(filter?: any): Promise<AtlasProduct[]>;

  /** Fetches a single product by ID */
  getProduct(productId: string): Promise<AtlasProduct | null>;

  /** Gets current live price */
  getPrice(productId: string): Promise<{ price: number; currency: string } | null>;

  /** Checks inventory level */
  getInventory(productId: string): Promise<number>;

  /** Generates direct purchase or checkout URL */
  getPurchaseUrl(productId: string, buyerContext?: any): Promise<string>;

  /** Retrieves recent orders */
  getOrders(filter?: any): Promise<CommerceOrderInfo[]>;

  /** Retrieves single order by ID */
  getOrder(orderId: string): Promise<CommerceOrderInfo | null>;

  /** Registers webhook subscription */
  subscribeWebhooks(endpoint: string, events: string[]): Promise<boolean>;
}

/**
 * Standard simulated implementation for Atlas Commerce V1.
 */
export class StandardAtlasCommerceConnector implements AtlasCommerceConnector {
  private isConnected: boolean = false;
  private catalog: Map<string, AtlasProduct> = new Map();

  constructor() {
    // Seed standard SaaS / B2B products
    this.seedDefaultProducts();
  }

  private seedDefaultProducts() {
    const hrProduct = new AtlasProduct({
      atlas_product_id: 'PROD_HR_CORP_01',
      external_product_id: 'EXT_HR_CORP_01',
      provider: 'INTERNAL',
      seller_id: 'SELLER_ATLAS_CORE',
      title: 'Atlas HR Suite — Plan Empresas',
      description: 'Plataforma integral de gestión de talento, liquidación de nóminas y control de asistencia.',
      category: 'SOFTWARE_HR',
      brand: 'Atlas HR',
      price: 185000,
      currency: 'ARS',
      stock: 9999,
      geo: ['ARGENTINA', 'CABA', 'BUENOS_AIRES', 'CORDOBA'],
      delivery_options: ['INSTANT_SAAS_PROVISIONING'],
      product_url: 'https://atlas.youapp.tv/products/hr-suite',
      purchase_url: 'https://atlas.youapp.tv/checkout?product=PROD_HR_CORP_01'
    });
    this.catalog.set(hrProduct.atlas_product_id, hrProduct);
  }

  public async connect(_credentials?: any): Promise<boolean> {
    this.isConnected = true;
    return true;
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
  }

  public async getSeller(sellerId: string): Promise<CommerceSellerInfo | null> {
    return {
      seller_id: sellerId,
      name: 'Atlas Enterprise Marketplace',
      country: 'AR',
      status: 'ACTIVE',
      currency: 'ARS'
    };
  }

  public async getProducts(_filter?: any): Promise<AtlasProduct[]> {
    return Array.from(this.catalog.values());
  }

  public async getProduct(productId: string): Promise<AtlasProduct | null> {
    return this.catalog.get(productId) || null;
  }

  public async getPrice(productId: string): Promise<{ price: number; currency: string } | null> {
    const prod = this.catalog.get(productId);
    if (!prod) return null;
    return { price: prod.price, currency: prod.currency };
  }

  public async getInventory(productId: string): Promise<number> {
    const prod = this.catalog.get(productId);
    return prod ? prod.stock : 0;
  }

  public async getPurchaseUrl(productId: string, buyerContext?: any): Promise<string> {
    const prod = this.catalog.get(productId);
    const base = prod?.purchase_url || `https://atlas.youapp.tv/checkout?product=${productId}`;
    if (buyerContext?.buyer_id) {
      return `${base}&buyer=${encodeURIComponent(buyerContext.buyer_id)}`;
    }
    return base;
  }

  public async getOrders(_filter?: any): Promise<CommerceOrderInfo[]> {
    return [];
  }

  public async getOrder(_orderId: string): Promise<CommerceOrderInfo | null> {
    return null;
  }

  public async subscribeWebhooks(_endpoint: string, _events: string[]): Promise<boolean> {
    return true;
  }
}
