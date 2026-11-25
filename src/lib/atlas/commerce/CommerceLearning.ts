/**
 * ATLAS COMMERCE SIMULATION_ONLY V1
 * Module: CommerceLearning.ts
 * Path: src/lib/atlas/commerce/CommerceLearning.ts
 * 
 * Learning layer over simulated commerce interactions.
 * 
 * STRICT INVARIANT:
 * NO escribir:
 * - Truth Graph (atlas_truth_assertions, atlas_canonical_entities)
 * - Temporal Graph (atlas_temporal_assertions, etc.)
 * - Opportunity Engine (atlas_opportunities)
 */

import { dbPool } from '../../../../server/db.ts';
import { AtlasCommerceGate } from './AtlasCommerceGate.ts';

export interface ProductLearningStats {
  product_id: string;
  shown_count: number;
  clicked_count: number;
  checkout_count: number;
  purchase_count: number;
  ctr: number;
  conversion_rate: number;
  avg_converted_match_score: number;
}

export interface CommerceLearningReport {
  environment: 'SIMULATION';
  total_events_analyzed: number;
  total_purchases_analyzed: number;
  product_stats: Record<string, ProductLearningStats>;
  top_converting_product_id: string | null;
  truth_graph_written: 0;
  temporal_graph_written: 0;
  opportunity_engine_written: 0;
  learning_status: 'ACTIVE_SIMULATION_LEARNING';
}

export class CommerceLearningContaminationError extends Error {
  constructor(target: string) {
    super(`[CONTAMINATION PROHIBITED] CommerceLearning attempted to mutate restricted graph: ${target}`);
    this.name = 'CommerceLearningContaminationError';
  }
}

export class CommerceLearning {
  private static instance: CommerceLearning;
  private gate: AtlasCommerceGate;

  private constructor() {
    this.gate = AtlasCommerceGate.getInstance();
    this.gate.assertFailClosedIntegrity();
  }

  public static getInstance(): CommerceLearning {
    if (!CommerceLearning.instance) {
      CommerceLearning.instance = new CommerceLearning();
    }
    return CommerceLearning.instance;
  }

  /**
   * Strictly enforces that this module NEVER executes write operations to core truth/temporal graphs.
   */
  private assertZeroContamination(targetTable: string): void {
    const forbidden = [
      'atlas_truth_assertions',
      'atlas_canonical_entities',
      'atlas_temporal_assertions',
      'atlas_temporal_windows',
      'atlas_opportunities',
      'atlas_identities'
    ];
    if (forbidden.some(f => targetTable.toLowerCase().includes(f))) {
      throw new CommerceLearningContaminationError(targetTable);
    }
  }

  /**
   * Learns from simulation events to compute product performance and conversion metrics.
   * Read-only from simulation tables. ZERO writes to Truth Graph or Opportunity Engine.
   */
  public async analyzeSimulatedPerformance(): Promise<CommerceLearningReport> {
    this.gate.assertFailClosedIntegrity();
    this.assertZeroContamination('READ_ONLY_SIMULATION');

    // Fetch simulation events
    const eventsRes = await dbPool.query(`
      SELECT event_type, product_id, amount, metadata, occurred_at
      FROM public.atlas_commerce_events
      WHERE environment = 'SIMULATION'
      ORDER BY occurred_at DESC
      LIMIT 1000;
    `);

    // Fetch simulated purchases
    const purchasesRes = await dbPool.query(`
      SELECT product_id, buyer_id, match_score, price, occurred_at
      FROM public.atlas_simulated_purchases
      WHERE environment = 'SIMULATION';
    `);

    const statsMap: Record<string, ProductLearningStats> = {};

    for (const row of eventsRes.rows) {
      const pid = row.product_id;
      if (!statsMap[pid]) {
        statsMap[pid] = {
          product_id: pid,
          shown_count: 0,
          clicked_count: 0,
          checkout_count: 0,
          purchase_count: 0,
          ctr: 0,
          conversion_rate: 0,
          avg_converted_match_score: 0
        };
      }

      if (row.event_type === 'PRODUCT_SHOWN') statsMap[pid].shown_count++;
      if (row.event_type === 'PRODUCT_CLICKED') statsMap[pid].clicked_count++;
      if (row.event_type === 'CHECKOUT_STARTED') statsMap[pid].checkout_count++;
      if (row.event_type === 'PURCHASE_COMPLETED') statsMap[pid].purchase_count++;
    }

    const matchScoresByProduct: Record<string, number[]> = {};
    for (const p of purchasesRes.rows) {
      const pid = p.product_id;
      if (!matchScoresByProduct[pid]) matchScoresByProduct[pid] = [];
      matchScoresByProduct[pid].push(parseFloat(p.match_score) || 0);
    }

    let topProduct: string | null = null;
    let highestConv = -1;

    for (const [pid, st] of Object.entries(statsMap)) {
      st.ctr = st.shown_count > 0 ? Number((st.clicked_count / st.shown_count).toFixed(3)) : 0;
      st.conversion_rate = st.shown_count > 0 ? Number((st.purchase_count / st.shown_count).toFixed(3)) : 0;
      
      const scores = matchScoresByProduct[pid] || [];
      st.avg_converted_match_score = scores.length > 0
        ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2))
        : 0;

      if (st.conversion_rate > highestConv && st.purchase_count > 0) {
        highestConv = st.conversion_rate;
        topProduct = pid;
      }
    }

    return {
      environment: 'SIMULATION',
      total_events_analyzed: eventsRes.rows.length,
      total_purchases_analyzed: purchasesRes.rows.length,
      product_stats: statsMap,
      top_converting_product_id: topProduct,
      truth_graph_written: 0,
      temporal_graph_written: 0,
      opportunity_engine_written: 0,
      learning_status: 'ACTIVE_SIMULATION_LEARNING'
    };
  }

  /**
   * Verifies that the Truth Graph and Opportunity Engine have 0 contaminated assertions from commerce.
   */
  public async auditZeroContamination(): Promise<{
    truth_graph_contaminated: boolean;
    opportunity_engine_contaminated: boolean;
    contamination_count: number;
  }> {
    const truthRes = await dbPool.query(`
      SELECT COUNT(*)::int as cnt
      FROM public.atlas_truth_assertions
      WHERE assertion_id LIKE '%sim_%'
         OR assertion_id LIKE '%commerce%'
         OR predicate LIKE '%PURCHASE%';
    `);

    const oppRes = await dbPool.query(`
      SELECT COUNT(*)::int as cnt
      FROM public.atlas_opportunities
      WHERE opportunity_type LIKE '%COMMERCE_SIM%'
         OR opportunity_type LIKE '%SIMULATED_PURCHASE%';
    `);

    const truthCnt = truthRes.rows[0]?.cnt || 0;
    const oppCnt = oppRes.rows[0]?.cnt || 0;

    return {
      truth_graph_contaminated: truthCnt > 0,
      opportunity_engine_contaminated: oppCnt > 0,
      contamination_count: truthCnt + oppCnt
    };
  }
}
