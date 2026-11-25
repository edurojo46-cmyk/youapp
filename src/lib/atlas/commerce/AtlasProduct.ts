/**
 * ATLAS VENDER / COMMERCE V1
 * Module: AtlasProduct.ts
 * Path: src/lib/atlas/commerce/AtlasProduct.ts
 * 
 * Normalized representation of an inventory item or catalog offering.
 * Decoupled from Truth Graph identities.
 */

export interface AtlasProductOptions {
  atlas_product_id?: string;
  external_product_id?: string;
  provider?: string;
  seller_id: string;
  title: string;
  description?: string;
  category?: string;
  brand?: string;
  price?: number | null;
  currency?: string;
  purchase_mode?: string;
  stock?: number;
  geo?: string[];
  delivery_options?: string[];
  product_url?: string;
  purchase_url?: string;
  last_synced_at?: string;
}

export class AtlasProduct {
  public readonly atlas_product_id: string;
  public readonly external_product_id: string;
  public readonly provider: string;
  public readonly seller_id: string;
  public readonly title: string;
  public readonly description: string;
  public readonly category: string;
  public readonly brand: string;
  public readonly price: number | null;
  public readonly currency: string;
  public readonly purchase_mode: string;
  public readonly stock: number;
  public readonly geo: string[];
  public readonly delivery_options: string[];
  public readonly product_url: string;
  public readonly purchase_url: string;
  public readonly last_synced_at: string;
  public readonly price_display: string;

  constructor(opts: AtlasProductOptions) {
    this.atlas_product_id = opts.atlas_product_id || `prod_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    this.external_product_id = opts.external_product_id || `ext_${this.atlas_product_id}`;
    this.provider = opts.provider || 'INTERNAL';
    this.seller_id = opts.seller_id;
    this.title = opts.title.trim();
    this.description = opts.description || '';
    this.category = opts.category || 'GENERAL';
    this.brand = opts.brand || '';
    this.price = opts.price !== undefined ? opts.price : null;
    this.currency = opts.currency || (this.price !== null ? 'ARS' : 'NO_ESPECIFICADO');
    this.purchase_mode = opts.purchase_mode || 'NO_ESPECIFICADO';
    this.stock = opts.stock !== undefined ? opts.stock : 999;
    this.geo = opts.geo || ['ALL'];
    this.delivery_options = opts.delivery_options || ['DIGITAL_DELIVERY'];
    this.product_url = opts.product_url || '';
    this.purchase_url = opts.purchase_url || this.product_url;
    this.last_synced_at = opts.last_synced_at || new Date().toISOString();
    this.price_display = this.price !== null ? `$${this.price} ${this.currency}` : 'NO ESPECIFICADO';
  }
}
