/**
 * ATLAS — CONSTITUTIONAL RECERTIFICATION GATE 50K
 * Scaled Recertification of 50,000 Stratified Industrial Relations
 * 
 * Invariants:
 * 1. Stratified selection across sources, categories, entities, and product types.
 * 2. Real constitutional certification via ConstitutionalCertificationGateway -> AtlasConstitution -> atlas_constitution_decisions.
 * 3. Strict trigger verification (trg_enforce_constitutional_authorization) on every physical update.
 * 4. Zero duplicate bindings, zero fingerprint errors, 100% fail-closed.
 * 5. Positive Random Audit of 200 certified records against physical raw/provenance.
 * 6. Dynamic coverage computation: GLOBAL_CONSTITUTIONAL_COVERAGE_PERCENT and MISSION_FIT_CONSTITUTIONAL_COVERAGE_PERCENT.
 */

import dotenv from 'dotenv';
dotenv.config();
import pg from 'pg';
import fs from 'fs';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { ConstitutionalCertificationGateway } from '../src/lib/atlasIntelligence/ConstitutionalCertificationGateway.ts';

const OPTIMAL_CONCURRENCY = 24;

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

async function runGate50k() {
  console.log('=============================================================');
  console.log('ATLAS INDUSTRIAL CONSTITUTIONAL RECERTIFICATION — GATE 50K');
  console.log('=============================================================');

  const mainClient = await pool.connect();
  const gateway = ConstitutionalCertificationGateway.getInstance();

  try {
    // 1. Stratified Selection of 50,000 Uncertified Candidates
    console.log('\n[FETCH] Selecting 50,000 stratified candidates from ACTIVE_MISSION_FIT_RELATIONS...');
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
      LIMIT 50000;
    `);

    const candidates = selectRes.rows;
    const gateSize = candidates.length;
    console.log(`Fetched ${gateSize} candidates for Gate 50k evaluation.`);

    if (gateSize !== 50000) {
      console.warn(`WARNING: Gate size is ${gateSize}, expected 50,000.`);
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
    console.log(`Categories (${categoryCountInGate})`);
    console.log(`Unique Entities: ${uniqueEntitiesInGate}`);

    // 2. Parallel Constitutional Certification
    console.log(`\n[CERTIFICATION] Executing Gate 50k certification with OPTIMAL_CONCURRENCY = ${OPTIMAL_CONCURRENCY}...`);
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
    const certifiedIdsInThisGate = [];

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

          if (res.certified) {
            certifiedIdsInThisGate.push(row.product_id);
          }

          latencies.push(res.latencyMs || 0);
          processedCount++;

          if (processedCount % 2500 === 0) {
            const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
            const currentRps = (processedCount / ((Date.now() - startTime) / 1000)).toFixed(1);
            console.log(`[PROGRESS] ${processedCount}/${gateSize} evaluated (${counts.CONSTITUTIONALLY_CERTIFIED} certified) in ${elapsedSec}s [${currentRps} certs/sec]...`);
          }
        }
      } finally {
        client.release();
      }
    };

    // Partition 50,000 items among workers
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

    // 4. Positive Random Audit (200 random relations certified from Gate 50K)
    console.log('\n[AUDIT] Performing Positive Random Audit on 200 certified relations from Gate 50K...');
    // Shuffle certified IDs and pick 200
    const shuffled = [...certifiedIdsInThisGate].sort(() => 0.5 - Math.random());
    const auditIds = shuffled.slice(0, 200);

    const auditRes = await mainClient.query(`
      SELECT 
        product_id, name, category, description, attributes_json,
        attributes_json->'constitutional_authorization' as auth
      FROM public.atlas_products
      WHERE product_id = ANY($1::text[]);
    `, [auditIds]);

    let randomAuditPass = 0;
    let semanticFalsePositives = 0;

    for (const item of auditRes.rows) {
      const prodName = item.name || '';
      const company = item.attributes_json?.company_name || item.attributes_json?.company_id || '';
      const certId = item.attributes_json?.evidence?.certificate_id || '';
      const src = item.attributes_json?.source || item.attributes_json?.evidence?.source_id || item.attributes_json?.source_id || '';
      const decisionId = item.auth?.constitution_decision_id || '';

      const text = `${item.category || ''} ${prodName}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const isArtistic = /(obra publicada|fonograma|musica|literaria|audiovisual|derecho de autor|cancion|album|novela|cuento|poesia|editorial|libro|partitura|disco musical)/i.test(text);
      const isIndustrial = /(autoparte|mecanica|quimica|seguridad|maquinaria|metalurgica|alimento|industrial|producto|amortiguador|freno|direccion|rotula|suspension|neumatico|cubierta|llanta|rueda|bateria|acumulador|lampara|faro|iluminacion|optica|espejo|retrovisor|vidrio|parabrisas|limpiaparabrisas|remolque|semiremolque|acoplado|enganche|eje|traba|contenedor|chasis|caja de direccion|cremallera|cilindro|caliper|disco de freno|pastilla|cinta de freno|baliza|cinturon|bocina|matafuego|casco|valvula|engranaje|transmision|motor|radiador|bomba|sin tacc|gluten|rnpa|repuesto|accesorio automotor)/i.test(text);

      const isValidProduct = prodName.trim().length > 0;
      const isValidCompany = company.trim().length > 0 && company.toUpperCase() !== 'UNKNOWN';
      const isValidEvidence = certId.trim().length > 0;
      const isValidSource = src.trim().length > 0;
      const isTrueMissionFit = isIndustrial && !isArtistic;

      if (isValidProduct && isValidCompany && isValidEvidence && isValidSource && isTrueMissionFit && decisionId) {
        randomAuditPass++;
      } else {
        semanticFalsePositives++;
      }
    }

    console.log(`RANDOM_AUDIT_PASS = ${randomAuditPass}/200 (${((randomAuditPass / 200) * 100).toFixed(1)}%)`);
    console.log(`SEMANTIC_FALSE_POSITIVES = ${semanticFalsePositives}`);

    // 5. Decision Ledger & Database Invariant Reconciliation
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
        ) as orphan_decisions
      FROM public.atlas_constitution_decisions;
    `);

    const productRelationCertifyDecisions = parseInt(decisionsReconRes.rows[0].product_relation_certify_decisions, 10);
    const orphanDecisions = parseInt(decisionsReconRes.rows[0].orphan_decisions, 10);

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

    // D. Certified without real decision
    const certWithoutDecisionRes = await mainClient.query(`
      SELECT count(*) as count
      FROM public.atlas_products p
      WHERE attributes_json->'constitutional_authorization'->>'constitution_decision_id' IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.atlas_constitution_decisions d
          WHERE d.decision_id = (p.attributes_json->'constitutional_authorization'->>'constitution_decision_id')::uuid
        );
    `);
    const certifiedWithoutRealDecision = parseInt(certWithoutDecisionRes.rows[0].count, 10);

    // E. Dynamic Coverage via RPC
    const statsRes = await mainClient.query(`
      SELECT public.get_atlas_industrial_catalog_stats() as stats;
    `);
    const dynamicStats = statsRes.rows[0]?.stats || {};
    const globalCoveragePercent = parseFloat(dynamicStats.globalCoveragePercent || 0).toFixed(2);
    const missionFitCoveragePercent = parseFloat(dynamicStats.missionFitCoveragePercent || 0).toFixed(2);
    const activeMissionFitRelations = parseInt(dynamicStats.activeMissionFitRelations || 165716, 10);
    const remainingMissionFitToRecertify = activeMissionFitRelations - totalCertifiedRelations;

    const isGateClean = (
      counts.FINGERPRINT_ERRORS === 0 &&
      duplicateBindings === 0 &&
      orphanDecisions === 0 &&
      certifiedWithoutRealDecision === 0 &&
      semanticFalsePositives === 0 &&
      totalCertifiedRelations === productRelationCertifyDecisions
    );

    // Write final structured summary artifact
    const summaryData = {
      GATE_SIZE: gateSize,
      CONSTITUTIONALLY_CERTIFIED: counts.CONSTITUTIONALLY_CERTIFIED,
      REJECTED_OFF_MISSION: counts.REJECTED_OFF_MISSION,
      REJECTED_INSUFFICIENT_EVIDENCE: counts.REJECTED_INSUFFICIENT_EVIDENCE,
      REJECTED_INVALID_RELATION: counts.REJECTED_INVALID_RELATION,
      PENDING_VERIFICATION: counts.PENDING_VERIFICATION,
      PASS_RATE: `${passRate}%`,
      SOURCE_DISTRIBUTION: sourceDist,
      CATEGORY_COUNT: categoryCountInGate,
      UNIQUE_ENTITIES: uniqueEntitiesInGate,
      RANDOM_AUDIT_PASS: `${randomAuditPass}/200`,
      SEMANTIC_FALSE_POSITIVES: semanticFalsePositives,
      CERTIFICATIONS_PER_SECOND: certificationsPerSecond,
      P50_CERTIFICATION_MS: p50,
      P95_CERTIFICATION_MS: p95,
      OPTIMAL_CONCURRENCY: OPTIMAL_CONCURRENCY,
      DUPLICATE_DECISION_BINDINGS: duplicateBindings,
      ORPHAN_DECISIONS: orphanDecisions,
      CERTIFIED_WITHOUT_REAL_DECISION: certifiedWithoutRealDecision,
      FINGERPRINT_ERROR_RATE: `${fingerprintErrorRate}%`,
      TOTAL_TRUE_CONSTITUTIONALLY_CERTIFIED: totalCertifiedRelations,
      GLOBAL_CONSTITUTIONAL_COVERAGE_PERCENT: `${globalCoveragePercent}%`,
      MISSION_FIT_CONSTITUTIONAL_COVERAGE_PERCENT: `${missionFitCoveragePercent}%`,
      REMAINING_MISSION_FIT_TO_RECERTIFY: remainingMissionFitToRecertify,
      NEXT_SCALE_GATE_ALLOWED: isGateClean ? 'TRUE (GATE_100K_ELIGIBLE)' : 'FALSE',
      FINAL_STATUS: isGateClean ? 'PASS' : 'FAIL'
    };

    fs.writeFileSync('./scripts/gate_50k_summary.json', JSON.stringify(summaryData, null, 2));

    console.log('\n=============================================================');
    console.log('GATE 50K SUMMARY REPORT');
    console.log('=============================================================');
    console.log(JSON.stringify(summaryData, null, 2));

  } finally {
    mainClient.release();
    await pool.end();
  }
}

runGate50k().catch(console.error);
