/**
 * ATLAS — AI PATHFINDER V1
 * Module: BoundedPathTester (Section 11)
 * 
 * Runs bounded empirical probes across candidate paths to measure actual yield,
 * quality, and latency before committing full acquisition budgets.
 */

import type { PathPlan, ObjectiveAnalysis, DatabaseRecord } from './types.ts';

export class BoundedPathTester {
  public static async testPaths(
    analysis: ObjectiveAnalysis,
    paths: PathPlan[],
    probeExecutor: (path: PathPlan, sampleLimit: number) => Promise<DatabaseRecord[]>
  ): Promise<{ winningPath: PathPlan; testedPaths: PathPlan[] }> {
    const SAMPLE_LIMIT = 3;
    console.log(`[BoundedPathTester] Probing ${paths.length} candidate paths with bounded sample limit=${SAMPLE_LIMIT}...`);

    for (const p of paths) {
      p.status = 'TESTING';
      const t0 = Date.now();
      const sample = await probeExecutor(p, SAMPLE_LIMIT);
      const latency = Date.now() - t0;

      const verifiedCount = sample.filter(r => r.verificationStatus === 'VERIFIED').length;
      const actualYield = sample.length;
      const yieldRate = actualYield > 0 ? parseFloat((verifiedCount / actualYield).toFixed(2)) : 0.0;

      // Update Path Priors based on empirical observation
      p.uncertainty = Math.max(0.05, parseFloat((p.uncertainty * 0.5).toFixed(2))); // Halve uncertainty after empirical test
      p.expectedQuality = actualYield > 0 ? parseFloat(((p.expectedQuality + yieldRate) / 2).toFixed(2)) : p.expectedQuality;
      p.expectedYield = Math.max(p.expectedYield, actualYield * 4);

      p.experimentMetrics = {
        testedSample: actualYield,
        actualYield: verifiedCount,
        yieldRate,
        avgScore: yieldRate
      };

      console.log(`  Path [${p.pathId}] probed: Yield ${verifiedCount}/${actualYield} (${(yieldRate * 100).toFixed(0)}%) in ${latency}ms`);
    }

    // Rank tested paths by verified yield rate, then expansion value
    paths.sort((a, b) => {
      const aYield = a.experimentMetrics?.yieldRate ?? 0;
      const bYield = b.experimentMetrics?.yieldRate ?? 0;
      if (bYield !== aYield) return bYield - aYield;
      return b.expansionValue - a.expansionValue;
    });

    const winner = paths[0];
    winner.status = 'ACTIVE';

    for (let i = 1; i < paths.length; i++) {
      const p = paths[i];
      const yieldRate = p.experimentMetrics?.yieldRate ?? 0;
      p.status = yieldRate < 0.20 ? 'ABANDONED' : 'PROPOSED';
      if (p.status === 'ABANDONED') {
        p.failureReason = `Bounded probe yielded ${p.experimentMetrics?.actualYield || 0} valid items (threshold >= 20%).`;
      }
    }

    console.log(`[BoundedPathTester] Winning path promoted to ACTIVE: "${winner.name}" (${winner.pathId})\n`);
    return { winningPath: winner, testedPaths: paths };
  }
}
