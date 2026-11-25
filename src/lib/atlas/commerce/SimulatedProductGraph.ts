/**
 * ATLAS COMMERCE SIMULATION_ONLY V1
 * Module: SimulatedProductGraph.ts
 * Path: src/lib/atlas/commerce/SimulatedProductGraph.ts
 * 
 * Persists and indexes simulation products with environment = 'SIMULATION'.
 * STRICT ISOLATION: Never mixes or touches PRODUCTION_REAL_COMMERCE tables.
 */

import { dbPool } from '../../../../server/db.ts';
import { AtlasCommerceGate } from './AtlasCommerceGate.ts';
import { SimulatedProductDefinition, SimulatedCommerceConnector } from './SimulatedCommerceConnector.ts';

export class SimulatedProductGraph {
  private static instance: SimulatedProductGraph;
  private gate: AtlasCommerceGate;
  private isSchemaInitialized: boolean = false;

  private constructor() {
    this.gate = AtlasCommerceGate.getInstance();
    this.gate.assertFailClosedIntegrity();
  }

  public static getInstance(): SimulatedProductGraph {
    if (!SimulatedProductGraph.instance) {
      SimulatedProductGraph.instance = new SimulatedProductGraph();
    }
    return SimulatedProductGraph.instance;
  }

  public async initSchema(): Promise<void> {
    if (this.isSchemaInitialized) return;
    this.gate.assertFailClosedIntegrity();

    try {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS public.atlas_simulated_products (
          atlas_product_id TEXT PRIMARY KEY,
          seller_id TEXT NOT NULL,
          seller_name TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT,
          category TEXT NOT NULL,
          brand TEXT,
          price NUMERIC NOT NULL,
          currency TEXT DEFAULT 'ARS',
          stock INTEGER DEFAULT 0,
          purchase_url TEXT NOT NULL,
          target_buyer_type TEXT NOT NULL DEFAULT 'BOTH',
          target_attributes JSONB NOT NULL DEFAULT '{}',
          environment TEXT NOT NULL DEFAULT 'SIMULATION' CHECK (environment = 'SIMULATION'),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_atlas_sim_prod_env ON public.atlas_simulated_products(environment);
        CREATE INDEX IF NOT EXISTS idx_atlas_sim_prod_cat ON public.atlas_simulated_products(category);
      `);
      this.isSchemaInitialized = true;
    } catch (err) {
      console.warn('[SimulatedProductGraph] initSchema error:', err);
    }
  }

  /**
   * Syncs the in-memory simulated catalog into the database product graph.
   * Guarantees environment = 'SIMULATION' for every record.
   */
  public async syncCatalog(): Promise<number> {
    await this.initSchema();
    const connector = SimulatedCommerceConnector.getInstance();
    const products = connector.getAllRawProducts();

    let count = 0;
    for (const p of products) {
      if (p.environment !== 'SIMULATION') {
        throw new Error(`Contamination alert: Product ${p.atlas_product_id} has invalid environment ${p.environment}`);
      }

      await dbPool.query(`
        INSERT INTO public.atlas_simulated_products (
          atlas_product_id, seller_id, seller_name, title, description, category, brand,
          price, currency, stock, purchase_url, target_buyer_type, target_attributes,
          environment, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'SIMULATION', NOW())
        ON CONFLICT (atlas_product_id) DO UPDATE SET
          seller_id = EXCLUDED.seller_id,
          seller_name = EXCLUDED.seller_name,
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          brand = EXCLUDED.brand,
          price = EXCLUDED.price,
          currency = EXCLUDED.currency,
          stock = EXCLUDED.stock,
          purchase_url = EXCLUDED.purchase_url,
          target_buyer_type = EXCLUDED.target_buyer_type,
          target_attributes = EXCLUDED.target_attributes,
          environment = 'SIMULATION',
          updated_at = NOW();
      `, [
        p.atlas_product_id,
        p.seller_id,
        p.seller_name,
        p.title,
        p.description,
        p.category,
        p.brand,
        p.price,
        p.currency,
        p.stock,
        p.purchase_url,
        p.target_buyer_type,
        JSON.stringify({
          target_keywords: p.target_keywords,
          target_industries: p.target_industries,
          target_activities: p.target_activities,
          min_scale: p.min_scale || 0
        })
      ]);
      count++;
    }

    return count;
  }

  /**
   * Retrieves all simulation products.
   * STRICT: WHERE environment = 'SIMULATION'
   */
  public async listSimulationProducts(): Promise<SimulatedProductDefinition[]> {
    await this.initSchema();
    const res = await dbPool.query(`
      SELECT 
        atlas_product_id, seller_id, seller_name, title, description, category, brand,
        price, currency, stock, purchase_url, target_buyer_type, target_attributes, environment
      FROM public.atlas_simulated_products
      WHERE environment = 'SIMULATION'
      ORDER BY atlas_product_id ASC;
    `);

    return res.rows.map(r => ({
      atlas_product_id: r.atlas_product_id,
      seller_id: r.seller_id,
      seller_name: r.seller_name,
      title: r.title,
      description: r.description,
      category: r.category,
      brand: r.brand,
      price: parseFloat(r.price),
      currency: r.currency,
      stock: parseInt(r.stock, 10),
      purchase_url: r.purchase_url,
      target_buyer_type: r.target_buyer_type,
      target_keywords: r.target_attributes?.target_keywords || [],
      target_industries: r.target_attributes?.target_industries || [],
      target_activities: r.target_attributes?.target_activities || [],
      min_scale: r.target_attributes?.min_scale || 0,
      environment: 'SIMULATION'
    }));
  }

  /**
   * Fetches single product by ID strictly within SIMULATION scope.
   */
  public async getProductById(productId: string): Promise<SimulatedProductDefinition | null> {
    await this.initSchema();
    const res = await dbPool.query(`
      SELECT 
        atlas_product_id, seller_id, seller_name, title, description, category, brand,
        price, currency, stock, purchase_url, target_buyer_type, target_attributes, environment
      FROM public.atlas_simulated_products
      WHERE atlas_product_id = $1 AND environment = 'SIMULATION';
    `, [productId]);

    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      atlas_product_id: r.atlas_product_id,
      seller_id: r.seller_id,
      seller_name: r.seller_name,
      title: r.title,
      description: r.description,
      category: r.category,
      brand: r.brand,
      price: parseFloat(r.price),
      currency: r.currency,
      stock: parseInt(r.stock, 10),
      purchase_url: r.purchase_url,
      target_buyer_type: r.target_buyer_type,
      target_keywords: r.target_attributes?.target_keywords || [],
      target_industries: r.target_attributes?.target_industries || [],
      target_activities: r.target_attributes?.target_activities || [],
      min_scale: r.target_attributes?.min_scale || 0,
      environment: 'SIMULATION'
    };
  }
}
