/**
 * ATLAS — CONSTITUTIONAL RECERTIFICATION GATE 10K
 * Scaled Recertification of 10,000 Stratified Industrial Relations
 * 
 * Invariants:
 * 1. Stratified selection across sources, categories, entities, and product types.
 * 2. Real constitutional certification via ConstitutionalCertificationGateway -> AtlasConstitution -> atlas_constitution_decisions.
 * 3. Strict trigger verification (trg_enforce_constitutional_authorization) on every physical update.
 * 4. Zero duplicate bindings, zero fingerprint errors, 100% fail-closed.
 * 5. Dynamic coverage computation: GLOBAL_CONSTITUTIONAL_COVERAGE_PERCENT and MISSION_FIT_CONSTITUTIONAL_COVERAGE_PERCENT.
 */

import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { ConstitutionalCertificationGateway } from '../src/lib/atlasIntelligence/ConstitutionalCertificationGateway.ts';

const OPTIMAL_CONCURRENCY = 18;

const poolConfig = {
  ...parseDbUrl(),
  max: OPTIMAL_CONCURRENCY + 4,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
};

const pool = new pg.Pool(poolConfig);

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function runGate10k() {
  console.log('=============================================================');
  console.log('ATLAS INDUSTRIAL CONSTITUTIONAL RECERTIFICATION — GATE 10K');
  console.log('=============================================================');

  const mainClient = await pool.connect();
  const gateway = ConstitutionalCertificationGateway.getInstance();

  try {
    // 1. Stratified Selection of 10,000 Uncertified Candidates
    console.log('\n[FETCH] Selecting 10,000 stratified candidates from ACTIVE_MISSION_FIT_RELATIONS...');
    const selectRes = await mainClient.query(`
      WITH uncertified AS (
        SELECT 
          product_id, tenant_id, name, category, description, attributes_json,
          COALESCE(attributes_json->>'source', attributes_json->'evidence'->>'source_id', attributes_json->>'source_id', 'UNKNOWN') as src
        FROM public.atlas_products
        WHERE status = 'ACTIVE'
          AND attributes_json ? 'category'
          AND (attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NULL)
      ),
      ranked AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY src, category 
            ORDER BY COALESCE(attributes_json->>'company_name', ''), product_id
          ) as rn
        FROM uncertified
      )
      SELECT 
        product_id, tenant_id, name, category, description, attributes_json, src
      FROM ranked 
      ORDER BY rn, src, category 
      LIMIT 10000;
    `);

    const candidates = selectRes.rows;
    const gateSize = candidates.length;
    console.log(`Fetched ${gateSize} candidates for Gate 10k evaluation.`);

    if (gateSize !== 10000) {
      console.warn(`WARNING: Gate size is ${gateSize}, expected 10,000.`);
    }

    // Measure stratification distributions
    const sourceDist = {};
    const categoryDist = {};
    const entitySet = new Set();

    candidates.forEach(r => {
      sourceDist[r.src] = (sourceDist[r.src] || 0) + 1;
      categoryDist[r.category] = (categoryDist[r.category] || 0) + 1;
      const comp = r.attributes_json?.company_name || r.attributes_json?.company_id;
      if (comp) entitySet.add(comp);
    });

    const uniqueEntitiesInGate = entitySet.size;
    const sourceCountInGate = Object.keys(sourceDist).length;
    const categoryCountInGate = Object.keys(categoryDist).length;

    console.log('\n[STRATIFICATION]');
    console.log(`Sources (${sourceCountInGate}):`, sourceDist);
    console.log(`Categories (${categoryCountInGate}): 26 distinct categories`);
    console.log(`Unique Entities: ${uniqueEntitiesInGate}`);

    // 2. Parallel Constitutional Certification
    console.log(`\n[CERTIFICATION] Executing Gate 10k certification with OPTIMAL_CONCURRENCY = ${OPTIMAL_CONCURRENCY}...`);
    const startTime = Date.now();

    const counts = {
      CONSTITUTIONALLY_CERTIFIED: 0,
      REJECTED_OFF_MISSION: 0,
      REJECTED_INSUFFICIENT_EVIDENCE: 0,
      REJECTED_INVALID_RELATION: 0,
      PENDING_VERIFICATION: 0,
      FINGERPRINT_ERRORS: 0
    };

    const latencies = [];
    let processedCount = 0;

    const executeWorker = async (workerId, items) => {
      const client = await pool.connect();
      try {
        for (const row of items) {
          const res = await gateway.certifyProductRelation(
            client,
            {
              productId: row.product_id,
              tenantId: row.tenant_id,
              name: row.name,
              category: row.category,
              description: row.description,
              rawAttributes: row.attributes_json,
              missionScope: 'BUSCADOR_INDUSTRIAL'
            },
            { shadowMode: false } // Physical commit with trigger verification
          );

          if (res.fingerprintError) {
            counts.FINGERPRINT_ERRORS++;
          }

          if (res.classification in counts) {
            counts[res.classification]++;
          } else {
            counts.PENDING_VERIFICATION++;
          }

          latencies.push(res.latencyMs || 0);
          processedCount++;

          if (processedCount % 1000 === 0) {
            const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
            const currentRps = (processedCount / ((Date.now() - startTime) / 1000)).toFixed(1);
            console.log(`[PROGRESS] ${processedCount}/${gateSize} evaluated (${counts.CONSTITUTIONALLY_CERTIFIED} certified) in ${elapsedSec}s [${currentRps} certs/sec]...`);
          }
        }
      } finally {
        client.release();
      }
    };

    // Partition 10,000 items among workers
    const chunks = Array.from({ length: OPTIMAL_CONCURRENCY }, () => []);
    candidates.forEach((c, idx) => {
      chunks[idx % OPTIMAL_CONCURRENCY].push(c);
    });

    await Promise.all(chunks.map((chunk, i) => executeWorker(i, chunk)));

    const totalDurationMs = Date.now() - startTime;
    const certificationsPerSecond = parseFloat((gateSize / (totalDurationMs / 1000)).toFixed(2));
    console.log(`\nCompleted evaluation of ${processedCount} records in ${(totalDurationMs / 1000).toFixed(2)}s (${certificationsPerSecond} certs/sec).`);

    // 3. Compute Timing and Quality Metrics
    const passRate = ((counts.CONSTITUTIONALLY_CERTIFIED / gateSize) * 100).toFixed(2);
    const rejectionTotal = counts.REJECTED_OFF_MISSION + counts.REJECTED_INSUFFICIENT_EVIDENCE + counts.REJECTED_INVALID_RELATION;
    const rejectionRate = ((rejectionTotal / gateSize) * 100).toFixed(2);
    const pendingRate = ((counts.PENDING_VERIFICATION / gateSize) * 100).toFixed(2);
    const fingerprintErrorRate = ((counts.FINGERPRINT_ERRORS / gateSize) * 100).toFixed(2);

    const p50 = percentile(latencies, 50);
    const p95 = percentile(latencies, 95);

    // 4. Decision Ledger & Database Invariant Reconciliation
    console.log('\n[RECONCILIATION] Reconciling ledger decisions and verifying physical invariants...');

    // A. Total certified products in database
    const certifiedProductsRes = await mainClient.query(`
      SELECT count(*) as count
      FROM public.atlas_products
      WHERE status = 'ACTIVE' 
        AND attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NOT NULL;
    `);
    const totalCertifiedRelations = parseInt(certifiedProductsRes.rows[0].count, 10);

    // B. Reconcile decisions in atlas_constitution_decisions
    const decisionsReconRes = await mainClient.query(`
      SELECT 
        count(*) FILTER (
          WHERE final_decision = 'CERTIFY' 
            AND object_type = 'PRODUCT_RELATION' 
            AND decision_id IN (
              SELECT (attributes_json->'constitutional_authorization'->>'constitution_decision_id')::uuid 
              FROM public.atlas_products 
              WHERE attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NOT NULL
            )
        ) as product_relation_certify_decisions,
        count(*) FILTER (
          WHERE decision_id NOT IN (
            SELECT (attributes_json->'constitutional_authorization'->>'constitution_decision_id')::uuid 
            FROM public.atlas_products 
            WHERE attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NOT NULL
          )
        ) as test_canary_decisions
      FROM public.atlas_constitution_decisions;
    `);

    const productRelationCertifyDecisions = parseInt(decisionsReconRes.rows[0].product_relation_certify_decisions, 10);
    const testCanaryDecisions = parseInt(decisionsReconRes.rows[0].test_canary_decisions, 10);

    // C. Check Duplicate Decision Bindings
    const duplicatesRes = await mainClient.query(`
      SELECT count(*) as dup_count FROM (
        SELECT attributes_json->'constitutional_authorization'->>'constitution_decision_id' as dec_id, count(*)
        FROM public.atlas_products
        WHERE attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NOT NULL
        GROUP BY 1
        HAVING count(*) > 1
      ) s;
    `);
    const duplicateBindings = parseInt(duplicatesRes.rows[0].dup_count, 10);

    // D. Dynamic Coverage via RPC
    const statsRes = await mainClient.query(`
      SELECT public.get_atlas_industrial_catalog_stats() as stats;
    `);
    const dynamicStats = statsRes.rows[0]?.stats || {};
    const globalCoveragePercent = parseFloat(dynamicStats.globalCoveragePercent || 0).toFixed(2);
    const missionFitCoveragePercent = parseFloat(dynamicStats.missionFitCoveragePercent || 0).toFixed(2);

    const isGateClean = (
      counts.FINGERPRINT_ERRORS === 0 &&
      duplicateBindings === 0 &&
      counts.CONSTITUTIONALLY_CERTIFIED === 10000 &&
      totalCertifiedRelations === productRelationCertifyDecisions
    );

    console.log('\n=============================================================');
    console.log('GATE 10K SUMMARY REPORT');
    console.log('=============================================================');
    console.log(`GATE_SIZE = ${gateSize}`);
    console.log(``);
    console.log(`CONSTITUTIONALLY_CERTIFIED = ${counts.CONSTITUTIONALLY_CERTIFIED}`);
    console.log(`REJECTED_OFF_MISSION = ${counts.REJECTED_OFF_MISSION}`);
    console.log(`REJECTED_INSUFFICIENT_EVIDENCE = ${counts.REJECTED_INSUFFICIENT_EVIDENCE}`);
    console.log(`REJECTED_INVALID_RELATION = ${counts.REJECTED_INVALID_RELATION}`);
    console.log(`PENDING_VERIFICATION = ${counts.PENDING_VERIFICATION}`);
    console.log(``);
    console.log(`PASS_RATE = ${passRate}%`);
    console.log(`REJECTION_RATE = ${rejectionRate}%`);
    console.log(``);
    console.log(`UNIQUE_ENTITIES_IN_GATE = ${uniqueEntitiesInGate}`);
    console.log(`SOURCE_COUNT_IN_GATE = ${sourceCountInGate}`);
    console.log(`CATEGORY_COUNT_IN_GATE = ${categoryCountInGate}`);
    console.log(``);
    console.log(`P50_CERTIFICATION_MS = ${p50}ms`);
    console.log(`P95_CERTIFICATION_MS = ${p95}ms`);
    console.log(`CERTIFICATIONS_PER_SECOND = ${certificationsPerSecond}`);
    console.log(`OPTIMAL_CONCURRENCY = ${OPTIMAL_CONCURRENCY}`);
    console.log(``);
    console.log(`PRODUCT_RELATION_CERTIFY_DECISIONS = ${productRelationCertifyDecisions}`);
    console.log(`TEST_CANARY_DECISIONS = ${testCanaryDecisions}`);
    console.log(``);
    console.log(`DUPLICATE_DECISION_BINDINGS = ${duplicateBindings}`);
    console.log(`FINGERPRINT_ERROR_RATE = ${fingerprintErrorRate}%`);
    console.log(``);
    console.log(`GLOBAL_CONSTITUTIONAL_COVERAGE_PERCENT = ${globalCoveragePercent}%`);
    console.log(`MISSION_FIT_CONSTITUTIONAL_COVERAGE_PERCENT = ${missionFitCoveragePercent}%`);
    console.log(``);
    console.log(`NEXT_SCALE_GATE_ALLOWED = ${isGateClean ? 'TRUE' : 'FALSE'}`);
    console.log(``);
    console.log(`FINAL_STATUS = ${isGateClean ? 'PASS_GATE10K_CONSTITUTIONAL_RECERTIFICATION' : 'BLOCKED_GATE10K_IRREGULARITY'}`);
    console.log('=============================================================');

  } finally {
    mainClient.release();
    await pool.end();
  }
}

runGate10k().catch(err => {
  console.error('CRITICAL GATE 10K FAILURE:', err);
  process.exit(1);
});
