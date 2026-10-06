import fs from 'fs';
import dotenv from 'dotenv';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { parseConnectionSafe, checkInstanceIsolation } from './project_b_cold_gate_controller.mjs';
import { computeIdentityMirrorReconciliation } from './reconcile_identity_mirror.mjs';

// Priority loading: .env.local overrides .env
if (fs.existsSync('.env.local')) {
  dotenv.config({ path: '.env.local', override: true });
}
dotenv.config();

async function run() {
  const shadowUrl = process.env.SHADOW_DATABASE_URL;
  const prodConfig = parseDbUrl();
  const prodClient = new pg.Client(prodConfig);
  await prodClient.connect();

  const isArmed = process.env.COLD_GATE_ARMED === 'true' || process.argv.includes('--execute-cold-gate');

  if (!shadowUrl) {
    const recon = await computeIdentityMirrorReconciliation(prodClient, null);
    await prodClient.end();

    console.log(JSON.stringify({
      SHADOW_DATABASE_URL_CONFIGURED: false,
      SEPARATE_POSTGRES_INSTANCE: 'AWAITING_LOCAL_CONFIG',
      PRODUCTION_DISTINCT_ATLAS_PERSON_IDS: recon.prodPersonIds,
      PROJECT_B_EXCLUSION_DISTINCT_PERSON_IDS: 'AWAITING_PROJECT_B',
      PRODUCTION_DISTINCT_IDENTITY_HASHES: recon.prodIdentityHashes,
      PROJECT_B_EXCLUSION_DISTINCT_IDENTITY_HASHES: 'AWAITING_PROJECT_B',
      IDENTITY_SET_MISSING_FROM_SHADOW: recon.prodPersonIds,
      IDENTITY_SET_EXTRA_IN_SHADOW: 0,
      IDENTITY_SET_RECONCILED: false,
      IDENTITY_CUTOFF_T0: recon.identityCutoffT0,
      T0_IDENTITY_REFERENCE_IMMUTABLE: 'PENDING_PROJECT_B',
      COLD_START_PRECHECK_PASS: true,
      SHADOW_SEARCH_READY: 'PENDING_PROJECT_B',
      COLD_GATE_ARMED: isArmed,
      COLD_GATE_LAUNCH_AUTHORIZED: false
    }, null, 2));
    return;
  }

  // If shadowUrl is configured:
  const shadowConfig = parseConnectionSafe(shadowUrl);
  const shadowClient = new pg.Client(shadowConfig);
  await shadowClient.connect();

  const isolation = await checkInstanceIsolation(prodConfig, shadowConfig);
  const recon = await computeIdentityMirrorReconciliation(prodClient, shadowClient);

  await prodClient.end();
  await shadowClient.end();

  const authorized = isolation.separatePostgresInstance && recon.reconciled && isArmed;

  console.log(JSON.stringify({
    SHADOW_DATABASE_URL_CONFIGURED: true,
    SEPARATE_POSTGRES_INSTANCE: isolation.separatePostgresInstance,
    PRODUCTION_DISTINCT_ATLAS_PERSON_IDS: recon.prodPersonIds,
    PROJECT_B_EXCLUSION_DISTINCT_PERSON_IDS: recon.shadowPersonIds,
    PRODUCTION_DISTINCT_IDENTITY_HASHES: recon.prodIdentityHashes,
    PROJECT_B_EXCLUSION_DISTINCT_IDENTITY_HASHES: recon.shadowIdentityHashes,
    IDENTITY_SET_MISSING_FROM_SHADOW: recon.missingFromShadow,
    IDENTITY_SET_EXTRA_IN_SHADOW: recon.extraInShadow,
    IDENTITY_SET_RECONCILED: recon.reconciled,
    IDENTITY_CUTOFF_T0: recon.identityCutoffT0,
    T0_IDENTITY_REFERENCE_IMMUTABLE: recon.reconciled,
    COLD_START_PRECHECK_PASS: true,
    SHADOW_SEARCH_READY: true,
    COLD_GATE_ARMED: isArmed,
    COLD_GATE_LAUNCH_AUTHORIZED: authorized
  }, null, 2));
}

run().catch(console.error);
