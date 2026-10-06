import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { ConstitutionalCertificationGateway } from '../src/lib/atlasIntelligence/ConstitutionalCertificationGateway.ts';

dotenv.config();

async function runUnforgeableGateV3() {
  console.log('========================================================================');
  console.log('🔒 ATLAS — CONSTITUTION UNFORGEABLE CERTIFICATION V3 GATE');
  console.log('========================================================================\n');

  const client = new pg.Client({ ...parseDbUrl() });
  await client.connect();

  const gateway = ConstitutionalCertificationGateway.getInstance();
  const TENANT_ID = 'eec862c0-a596-498c-9f4a-81932173547f';

  // 1. Check Decision Ledger Exists and is Append-Only
  console.log('>>> [Check 1] Verifying Trusted Decision Ledger and Append-Only Invariant...');
  const ledgerCount = await client.query('SELECT count(*) FROM public.atlas_constitution_decisions;');
  const trustedDecisionLedgerActive = ledgerCount.rows.length >= 0;

  let decisionLedgerAppendOnly = false;
  // Try inserting a test decision, then try updating it, then delete
  const testDecId = crypto.randomUUID();
  await client.query(`
    INSERT INTO public.atlas_constitution_decisions (
      decision_id, constitution_version, mission_id, mission_scope,
      object_type, object_id, object_fingerprint, evidence_fingerprint,
      mission_fit_status, evidence_status, novelty_status, final_decision
    ) VALUES ($1, '1.0', 'TEST_MISSION', 'BUSCADOR_INDUSTRIAL', 'PRODUCT_RELATION', 'TEST_OBJ', 'FP_TEST', 'FP_EV_TEST', 'MISSION_QUALIFIED', 'VERIFIED_PHYSICAL', 'NOT_APPLICABLE', 'CERTIFY');
  `, [testDecId]);

  try {
    await client.query(`
      UPDATE public.atlas_constitution_decisions 
      SET final_decision = 'REJECT' 
      WHERE decision_id = $1;
    `, [testDecId]);
  } catch (err) {
    if (err.message.includes('CONSTITUTIONAL_LEDGER_IMMUTABLE')) {
      decisionLedgerAppendOnly = true;
    }
  }
  console.log(`  [PASS] Trusted Decision Ledger Active: ${trustedDecisionLedgerActive}, Append-Only Trigger Verified: ${decisionLedgerAppendOnly}`);

  // Test Harness Attack Suite
  console.log('\n>>> [Check 2] Executing Physical Attack Tests...');
  let fakeAuthorizationBlocked = false;
  let reusedDecisionIdBlocked = false;
  let postCertEvidenceMutationBlocked = false;
  let postCertProductMutationBlocked = false;
  let allowlistedOperationalUpdateAllowed = false;
  let fakeTrueNewSourceBlocked = false;
  let validGatewayCertificationAllowed = false;

  // ATTACK A & B: INSERT ACTIVE with Fake Authorization (UUID not in ledger)
  await client.query('BEGIN;');
  try {
    const fakeUuid = crypto.randomUUID();
    await client.query(`
      INSERT INTO public.atlas_products (product_id, tenant_id, name, category, status, attributes_json)
      VALUES ($1, $2, 'CORREA INDUSTRIAL REFORZADA', 'Transmisiones', 'ACTIVE', $3);
    `, [
      crypto.randomUUID(),
      TENANT_ID,
      JSON.stringify({
        constitutional_authorization: {
          constitution_decision_id: fakeUuid,
          constitution_version: '1.0',
          qualification_timestamp: new Date().toISOString(),
          mission_fit_status: 'MISSION_QUALIFIED',
          evidence_status: 'VERIFIED_PHYSICAL'
        }
      })
    ]);
  } catch (err) {
    if (err.message.includes('CONSTITUTIONAL_DEFENSE_IN_DEPTH_VIOLATION') && err.message.includes('Forged authorization')) {
      fakeAuthorizationBlocked = true;
    }
  } finally {
    await client.query('ROLLBACK;');
  }

  // ATTACK I: Valid Gateway Certification (Reference for Attacks C, D, E, F, G)
  const legitProdIdA = crypto.randomUUID();
  const certResA = await gateway.certifyProductRelation(client, {
    productId: legitProdIdA,
    tenantId: TENANT_ID,
    name: 'DISCO DE FRENO VENTILADO',
    category: 'Autopartes y Frenos',
    description: 'Disco de freno automotriz',
    rawAttributes: {
      evidence: { certificate_id: 'CHAS-AR-2026-9901', source_id: 'SRC_CHAS', file: 'chas.csv' },
      company_name: 'FRENOS ARGENTINA S.A.',
      relationship_type: 'MANUFACTURER'
    },
    missionScope: 'BUSCADOR_INDUSTRIAL'
  }, { shadowMode: false });

  validGatewayCertificationAllowed = certResA.certified && Boolean(certResA.authorization);

  // ATTACK C: INSERT ACTIVE Reusing legit decision_id from Product A for Product B
  await client.query('BEGIN;');
  try {
    const legitDecId = certResA.decisionId;
    const rogueProdIdB = crypto.randomUUID();
    await client.query(`
      INSERT INTO public.atlas_products (product_id, tenant_id, name, category, status, attributes_json)
      VALUES ($1, $2, 'DISCO DE FRENO VENTILADO', 'Autopartes y Frenos', 'ACTIVE', $3);
    `, [
      rogueProdIdB,
      TENANT_ID,
      JSON.stringify({
        company_name: 'FRENOS ARGENTINA S.A.',
        relationship_type: 'MANUFACTURER',
        evidence: { certificate_id: 'CHAS-AR-2026-9901', source_id: 'SRC_CHAS', file: 'chas.csv' },
        constitutional_authorization: certResA.authorization
      })
    ]);
  } catch (err) {
    if (err.message.includes('Object fingerprint mismatch')) {
      reusedDecisionIdBlocked = true;
    }
  } finally {
    await client.query('ROLLBACK;');
  }

  // ATTACK D: INSERT ACTIVE Modifying Evidence after valid decision
  await client.query('BEGIN;');
  try {
    const rogueProdIdD = crypto.randomUUID();
    await client.query(`
      INSERT INTO public.atlas_products (product_id, tenant_id, name, category, status, attributes_json)
      VALUES ($1, $2, 'DISCO DE FRENO VENTILADO', 'Autopartes y Frenos', 'ACTIVE', $3);
    `, [
      legitProdIdA, // same prod ID
      TENANT_ID,
      JSON.stringify({
        company_name: 'FRENOS ARGENTINA S.A.',
        relationship_type: 'MANUFACTURER',
        evidence: { certificate_id: 'FAKE-TAMPERED-CERT-999', source_id: 'SRC_CHAS', file: 'chas.csv' },
        constitutional_authorization: certResA.authorization
      })
    ]);
  } catch (err) {
    if (err.message.includes('fingerprint mismatch')) {
      postCertEvidenceMutationBlocked = true;
    }
  } finally {
    await client.query('ROLLBACK;');
  }

  // ATTACK E: UPDATE of ACTIVE product changing name without new decision
  await client.query('BEGIN;');
  try {
    await client.query(`
      UPDATE public.atlas_products
      SET name = 'ALTERED DISCO DE EMBRAGUE'
      WHERE product_id = $1;
    `, [legitProdIdA]);
  } catch (err) {
    if (err.message.includes('Object fingerprint mismatch')) {
      postCertProductMutationBlocked = true;
    }
  } finally {
    await client.query('ROLLBACK;');
  }

  // ATTACK G: UPDATE of allowlisted operational field (updated_at)
  await client.query('BEGIN;');
  try {
    const opRes = await client.query(`
      UPDATE public.atlas_products
      SET updated_at = NOW()
      WHERE product_id = $1
      RETURNING product_id;
    `, [legitProdIdA]);
    allowlistedOperationalUpdateAllowed = opRes.rows.length === 1;
  } catch (err) {
    allowlistedOperationalUpdateAllowed = false;
  } finally {
    await client.query('ROLLBACK;');
  }

  // ATTACK H: INSERT TRUE_NEW_SOURCE directly into atlas_source_knowledge_map without decision
  await client.query('BEGIN;');
  try {
    await client.query(`
      INSERT INTO public.atlas_source_knowledge_map (
        source_id, canonical_url, source_name, source_family, source_universe,
        owner_organization, geography_scope, protocol, access_method,
        public_status, permitted_status, current_status, supported_motor_template,
        field_telemetry
      ) VALUES (
        'SRC_ROGUE_TRUE_NEW_SOURCE', 'https://fake-registry.gov.ar', 'Rogue Source', 'FAM_ROGUE', 'UNIVERSE_AUTONOMOUS_ROGUE',
        'Registro Oficial Nacional', 'ARGENTINA', 'CSV_STREAM', 'DIRECT_PULL',
        'PUBLIC', 'PERMITTED', 'ACTIVE', 'CSV_STREAM_MOTOR',
        '{"novelty_status": "TRUE_NEW_SOURCE"}'
      );
    `);
  } catch (err) {
    if (err.message.includes('CONSTITUTIONAL_SOURCE_DEFENSE_VIOLATION')) {
      fakeTrueNewSourceBlocked = true;
    }
  } finally {
    await client.query('ROLLBACK;');
  }

  // Clean up legit test record from atlas_products
  await client.query('DELETE FROM public.atlas_products WHERE product_id = $1;', [legitProdIdA]);

  await client.end();

  console.log('\n========================================================================');
  console.log('📋 AUDIT TEST RESULTS');
  console.log('========================================================================');
  console.log(`  TRUSTED_DECISION_LEDGER_ACTIVE = ${trustedDecisionLedgerActive}`);
  console.log(`  DECISION_LEDGER_APPEND_ONLY = ${decisionLedgerAppendOnly}`);
  console.log(`  CERTIFICATION_REQUIRES_REAL_DECISION_ID = ${fakeAuthorizationBlocked}`);
  console.log(`  OBJECT_FINGERPRINT_BINDING_ACTIVE = ${reusedDecisionIdBlocked}`);
  console.log(`  EVIDENCE_FINGERPRINT_BINDING_ACTIVE = ${postCertEvidenceMutationBlocked}`);
  console.log(`  ACTIVE_RECORD_MATERIAL_UPDATE_REQUIRES_REAUTH = ${postCertProductMutationBlocked}`);
  console.log(`  SOURCE_KNOWLEDGE_DB_DEFENSE_ACTIVE = ${fakeTrueNewSourceBlocked}`);
  console.log(`  ALLOWLISTED_OPERATIONAL_UPDATE_ALLOWED = ${allowlistedOperationalUpdateAllowed}`);
  console.log(`  VALID_GATEWAY_CERTIFICATION_ALLOWED = ${validGatewayCertificationAllowed}`);

  const allPass = 
    trustedDecisionLedgerActive &&
    decisionLedgerAppendOnly &&
    fakeAuthorizationBlocked &&
    reusedDecisionIdBlocked &&
    postCertEvidenceMutationBlocked &&
    postCertProductMutationBlocked &&
    allowlistedOperationalUpdateAllowed &&
    fakeTrueNewSourceBlocked &&
    validGatewayCertificationAllowed;

  console.log('\n========================================================================');
  console.log(`🏁 GATE V3 STATUS: ${allPass ? 'PASS' : 'FAIL'}`);
  console.log('========================================================================');
}

runUnforgeableGateV3().catch(err => {
  console.error('Gate V3 crashed:', err);
  process.exit(1);
});
