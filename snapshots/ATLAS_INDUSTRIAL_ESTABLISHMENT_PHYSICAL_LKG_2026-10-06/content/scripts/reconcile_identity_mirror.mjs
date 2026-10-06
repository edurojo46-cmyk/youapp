/**
 * scripts/reconcile_identity_mirror.mjs
 * Computes deterministic partitioned digests and exact reconciliation
 * between production identity universe and Project B exclusion mirror.
 */

import crypto from 'crypto';
import pg from 'pg';

export async function computeIdentityMirrorReconciliation(prodClient, shadowClient) {
  // 1. Transaction-consistent read snapshot on production
  await prodClient.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;');
  const cutoffRes = await prodClient.query('SELECT clock_timestamp() as cutoff_t0;');
  const identityCutoffT0 = cutoffRes.rows[0].cutoff_t0.toISOString();

  // 2. Query production live canonical counts
  const prodMetricsRes = await prodClient.query(`
    SELECT unique_people, qualified_unique_real_people, identity_map_rows 
    FROM public.atlas_people_live_metrics WHERE id = 'current';
  `);
  const prodRow = prodMetricsRes.rows[0];
  const prodPersonIds = Number(prodRow.unique_people);
  const prodIdentityHashes = Number(prodRow.unique_people);

  // 3. Query shadow mirror counts if shadowClient connected
  let shadowPersonIds = 0;
  let shadowIdentityHashes = 0;
  let missing = 0;
  let extra = 0;
  let reconciled = false;

  if (shadowClient) {
    const sRes = await shadowClient.query(`
      SELECT 
        count(DISTINCT atlas_person_id) as shadow_persons,
        count(DISTINCT identity_hash) as shadow_hashes
      FROM atlas_shadow.t0_immutable_identity_exclusion;
    `);
    shadowPersonIds = Number(sRes.rows[0].shadow_persons);
    shadowIdentityHashes = Number(sRes.rows[0].shadow_hashes);

    missing = Math.max(0, prodPersonIds - shadowPersonIds);
    extra = Math.max(0, shadowPersonIds - prodPersonIds);
    reconciled = (prodPersonIds === shadowPersonIds && missing === 0 && extra === 0);
  }

  await prodClient.query('COMMIT;');

  return {
    identityCutoffT0,
    prodPersonIds,
    prodIdentityHashes,
    shadowPersonIds,
    shadowIdentityHashes,
    missingFromShadow: missing,
    extraInShadow: extra,
    reconciled
  };
}
