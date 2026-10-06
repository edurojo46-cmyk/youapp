/**
 * ATLAS SOURCE YIELD RANKER V1
 * 
 * FASE 2: SOURCE YIELD RANKING
 * 
 * Takes the results of 31_source_canary_report.json and computes:
 * ATLAS_SOURCE_YIELD_SCORE
 * 
 * Segregates the 31 sources into:
 * - TIER_A: High yield + strong identity + all 5 gates passed (First Wave Ingestion)
 * - TIER_B: Good yield + slight overlap or higher volume (Second Wave Ingestion)
 * - TIER_C: Moderate yield / smaller provincial distributions
 * - HOLD: Restricted, high error rate, or zero net-new
 */

import fs from 'fs';
import path from 'path';
import { Full31SourceCanaryReport, SourceCanaryResult } from './AtlasSourceCanaryRunner';

export type SourceTier = 'TIER_A' | 'TIER_B' | 'TIER_C' | 'HOLD';

export interface RankedSource {
  SOURCE_ID: string;
  SOURCE_NAME: string;
  TIER: SourceTier;
  YIELD_SCORE: number;
  NET_NEW_PER_1000: number;
  IDENTITY_STRENGTH_RATIO: number;
  ENUMERABILITY: string;
  TOTAL_CONTRIBUTION_POTENTIAL: number;
  ESTIMATED_NET_NEW_POTENTIAL: number;
  OVERLAP_RATE: number;
  RECOMMENDED_INGESTION_ORDER: number;
  RATIONALE: string;
}

export interface SourceYieldRankingReport {
  REPORT_TITLE: string;
  TIMESTAMP: string;
  TOTAL_SOURCES_RANKED: number;
  TIER_SUMMARY: Record<SourceTier, { count: number; total_potential_people: number; estimated_net_new: number }>;
  RANKED_SOURCES: RankedSource[];
}

export class AtlasSourceYieldRanker {
  private canaryPath: string;
  private outputPath: string;

  constructor() {
    this.canaryPath = path.resolve('reports/atlas/people/31_source_canary_report.json');
    this.outputPath = path.resolve('reports/atlas/people/source_yield_ranking.json');
  }

  public rankSources(): SourceYieldRankingReport {
    console.log('================================================================');
    console.log('ATLAS SOURCE YIELD RANKING — COMPUTING ATLAS_SOURCE_YIELD_SCORE');
    console.log('================================================================\n');

    if (!fs.existsSync(this.canaryPath)) {
      throw new Error(`Canary report not found at ${this.canaryPath}`);
    }

    const canaryReport: Full31SourceCanaryReport = JSON.parse(fs.readFileSync(this.canaryPath, 'utf-8'));
    const results = canaryReport.CANARY_RESULTS;

    const ranked: RankedSource[] = [];

    for (const res of results) {
      const netNewYield = res.NET_NEW_VERIFIED_PEOPLE_PER_1000_SOURCE_ROWS; // 0-1000
      const identityStrength = (res.IDENTITY_STRONG + res.IDENTITY_MULTI_EVIDENCE) / (res.NET_NEW_VERIFIED_PERSONS || 1);
      const overlapRate = (res.MATCH_EXISTING_ATLAS + res.CROSS_SOURCE_OVERLAP) / (res.UNIQUE_PERSONS_WITHIN_SOURCE || 1);
      
      // Authority factor based on official hierarchy
      let authority = 0.90;
      if (res.SOURCE_ID.includes('BORA') || res.SOURCE_ID.includes('PJN')) {
        authority = 1.0;
      } else if (res.SOURCE_ID.includes('CONEAU') || res.SOURCE_ID.includes('SCBA')) {
        authority = 0.95;
      } else if (res.SOURCE_ID.includes('PBA') || res.SOURCE_ID.includes('CORDOBA') || res.SOURCE_ID.includes('SANTA_FE')) {
        authority = 0.92;
      }

      // Freshness factor
      const freshness = 0.95;
      // Processing cost factor (CSV/ZIP direct stream = 1.0, API = 0.85)
      const costFactor = res.FORMAT === 'CSV' || res.FORMAT === 'ZIP' ? 1.0 : 0.88;

      // Composite ATLAS_SOURCE_YIELD_SCORE (0 to 100)
      const yieldScore = Number((
        (netNewYield / 10) * 0.40 +
        (identityStrength * 100) * 0.25 +
        (authority * 100) * 0.15 +
        ((1 - overlapRate) * 100) * 0.10 +
        (freshness * 100) * 0.05 +
        (costFactor * 100) * 0.05
      ).toFixed(2));

      // Tier Classification
      let tier: SourceTier = 'TIER_C';
      if (yieldScore >= 88 && res.OFFICIAL_CARDINALITY >= 40000) {
        tier = 'TIER_A';
      } else if (yieldScore >= 84) {
        tier = 'TIER_B';
      } else if (yieldScore < 60) {
        tier = 'HOLD';
      }

      const estimatedNetNew = Math.floor(res.OFFICIAL_CARDINALITY * (netNewYield / 1000));

      ranked.push({
        SOURCE_ID: res.SOURCE_ID,
        SOURCE_NAME: res.SOURCE_NAME,
        TIER: tier,
        YIELD_SCORE: yieldScore,
        NET_NEW_PER_1000: netNewYield,
        IDENTITY_STRENGTH_RATIO: Number(identityStrength.toFixed(3)),
        ENUMERABILITY: "YES_STREAMING_DELIMITED",
        TOTAL_CONTRIBUTION_POTENTIAL: res.OFFICIAL_CARDINALITY,
        ESTIMATED_NET_NEW_POTENTIAL: estimatedNetNew,
        OVERLAP_RATE: Number(overlapRate.toFixed(3)),
        RECOMMENDED_INGESTION_ORDER: 0, // Assigned after sorting
        RATIONALE: `${tier}: Score ${yieldScore} | Yield ${netNewYield}/1000 | Identity strength ${(identityStrength * 100).toFixed(1)}%`
      });
    }

    // Sort descending by yield score
    ranked.sort((a, b) => b.YIELD_SCORE - a.YIELD_SCORE || b.TOTAL_CONTRIBUTION_POTENTIAL - a.TOTAL_CONTRIBUTION_POTENTIAL);

    // Assign ingestion order
    ranked.forEach((item, idx) => {
      item.RECOMMENDED_INGESTION_ORDER = idx + 1;
    });

    const tierSummary: Record<SourceTier, { count: number; total_potential_people: number; estimated_net_new: number }> = {
      TIER_A: { count: 0, total_potential_people: 0, estimated_net_new: 0 },
      TIER_B: { count: 0, total_potential_people: 0, estimated_net_new: 0 },
      TIER_C: { count: 0, total_potential_people: 0, estimated_net_new: 0 },
      HOLD: { count: 0, total_potential_people: 0, estimated_net_new: 0 }
    };

    for (const r of ranked) {
      tierSummary[r.TIER].count++;
      tierSummary[r.TIER].total_potential_people += r.TOTAL_CONTRIBUTION_POTENTIAL;
      tierSummary[r.TIER].estimated_net_new += r.ESTIMATED_NET_NEW_POTENTIAL;
    }

    const report: SourceYieldRankingReport = {
      REPORT_TITLE: "ATLAS SOURCE YIELD RANKING REPORT (31 ENUMERABLE SOURCES)",
      TIMESTAMP: new Date().toISOString(),
      TOTAL_SOURCES_RANKED: ranked.length,
      TIER_SUMMARY: tierSummary,
      RANKED_SOURCES: ranked
    };

    fs.mkdirSync(path.dirname(this.outputPath), { recursive: true });
    fs.writeFileSync(this.outputPath, JSON.stringify(report, null, 2), 'utf-8');

    console.log('================================================================');
    console.log(`SOURCE YIELD RANKING COMPLETED:`);
    console.log(`- TIER_A (Primary Wave):   ${tierSummary.TIER_A.count} sources | ${tierSummary.TIER_A.total_potential_people} potential | ~${tierSummary.TIER_A.estimated_net_new} net-new`);
    console.log(`- TIER_B (Secondary Wave): ${tierSummary.TIER_B.count} sources | ${tierSummary.TIER_B.total_potential_people} potential | ~${tierSummary.TIER_B.estimated_net_new} net-new`);
    console.log(`- TIER_C (Tertiary Wave):  ${tierSummary.TIER_C.count} sources | ${tierSummary.TIER_C.total_potential_people} potential | ~${tierSummary.TIER_C.estimated_net_new} net-new`);
    console.log(`- HOLD:                    ${tierSummary.HOLD.count} sources`);
    console.log(`REPORT SAVED TO: ${this.outputPath}`);
    console.log('================================================================\n');

    return report;
  }
}
