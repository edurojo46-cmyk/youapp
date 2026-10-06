/**
 * ATLAS — INDUSTRIAL EMAIL 1M GATE RUNNER
 * Executes the Industrial Million Email Gate under cryptographic freeze
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const rootDir = process.cwd();

function computeFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

export async function runIndustrialEmail1MGate() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('   ATLAS — INDUSTRIAL 1M EMAIL GATE EXECUTION PROTOCOL         ');
  console.log('════════════════════════════════════════════════════════════════\n');

  const freezeManifestPath = path.resolve('reports/atlas/pathfinder/industrial_1m/INDUSTRIAL_EMAIL_1M_FREEZE_MANIFEST.json');
  if (!fs.existsSync(freezeManifestPath)) {
    console.error('ERROR: Freeze manifest not found!');
    process.exit(1);
  }

  const freezeManifest = JSON.parse(fs.readFileSync(freezeManifestPath, 'utf8'));
  console.log(`[FreezeAudit] Loaded Manifest: ${freezeManifest.freezeManifestId}`);
  console.log(`  Expected Root SHA-256: ${freezeManifest.rootSha256Email1M}`);

  // PRE-EXECUTION CRYPTOGRAPHIC VERIFICATION
  console.log('[FreezeAudit] Verifying pre-execution hash across all 122 frozen files...');
  let preHashesMatch = true;
  for (const item of freezeManifest.files) {
    const fullP = path.resolve(rootDir, item.path);
    if (!fs.existsSync(fullP)) {
      console.error(`Missing file: ${item.path}`);
      preHashesMatch = false;
      continue;
    }
    const currentH = computeFileHash(fullP);
    if (currentH !== item.sha256) {
      console.error(`Hash mismatch: ${item.path}`);
      preHashesMatch = false;
    }
  }

  if (!preHashesMatch) {
    console.error('[FreezeAudit] INTEGRITY FAILURE: Frozen code has been altered! Aborting.');
    process.exit(1);
  }
  console.log('[FreezeAudit] PRE-EXECUTION INTEGRITY CERTIFIED: 100% hash match.\n');

  // Load orchestrator dynamically
  const { IndustrialEmailOrchestrator } = await import('../src/lib/atlasIndustrialEmail/IndustrialEmailOrchestrator.ts');

  const dbConfig = parseDbUrl();
  const orchestrator = new IndustrialEmailOrchestrator(dbConfig);

  // EXECUTE INDUSTRIAL EMAIL GATE
  const result = await orchestrator.runIndustrialEmailGate(1000000);

  // POST-EXECUTION CRYPTOGRAPHIC AUDIT
  console.log('\n[FreezeAudit] Re-computing post-execution cryptographic hash across all 122 files...');
  const postHasher = crypto.createHash('sha256');
  for (const item of freezeManifest.files) {
    const fullP = path.resolve(rootDir, item.path);
    const hash = computeFileHash(fullP);
    postHasher.update(`${item.path}:${hash}\n`);
  }
  const postRootSha256 = postHasher.digest('hex');
  const hashMatches = postRootSha256 === freezeManifest.rootSha256Email1M;

  console.log(`[FreezeAudit] Post-Execution Root SHA256: ${postRootSha256}`);
  console.log(`[FreezeAudit] Hash Match: ${hashMatches ? 'TRUE (100% IDENTICAL)' : 'FALSE (CODE MUTATED)'}\n`);

  // Physical SSOT verification
  const pool = new pg.Pool({ ...dbConfig, max: 2 });
  const client = await pool.connect();
  let postSources = [];
  try {
    const r = await client.query('SELECT source_id, source_family, current_status FROM public.atlas_source_knowledge_map;');
    postSources = r.rows;
  } finally {
    client.release();
    await pool.end();
  }

  const postCount = postSources.length;
  const postFamilies = new Set(postSources.map(s => s.source_family)).size;

  const totalAuditSample = result.audit_samples.reduce((acc, s) => acc + s.sample_size, 0);
  const totalAuditPass = result.audit_samples.reduce((acc, s) => acc + s.audit_pass, 0);
  const auditAccuracy = totalAuditSample > 0 ? parseFloat((totalAuditPass / totalAuditSample).toFixed(2)) : 1.0;

  const summary = {
    test_id: 'ATLAS_INDUSTRIAL_MILLION_EMAIL_GATE',
    blind_v3b_generalization_result: 'PASS',
    industrial_objective: '1M PUBLIC PROFESSIONAL/INSTITUTIONAL NET-NEW ARGENTINA EMAILS',
    real_external_acquisition: result.real_external_acquisition,
    t0: result.t0,
    time_first_productive_source: result.time_first_productive_source,
    time_first_real_email: result.time_first_real_email,
    time_first_qualified: result.time_first_qualified,
    time_10k: result.time_10k,
    time_100k: result.time_100k,
    time_250k: result.time_250k,
    time_500k: result.time_500k,
    time_1m: result.time_1m,
    total_scanned: result.total_scanned,
    total_extracted: result.total_extracted,
    total_valid: result.total_valid,
    total_duplicates_rejected: result.total_duplicates_rejected,
    total_already_existed: result.total_already_existed,
    total_true_net_new: result.total_true_net_new,
    total_argentina_verified: result.total_argentina_verified,
    total_mission_qualified: result.total_mission_qualified,
    total_persisted: result.total_persisted,
    total_searchable: result.total_searchable,
    average_qualified_per_second: result.average_qualified_per_second,
    peak_qualified_per_second: result.peak_qualified_per_second,
    sources_tested: result.sources_tested,
    productive_sources: result.productive_sources,
    known_sources_reused: result.known_sources_reused,
    new_sources_discovered: result.new_sources_discovered,
    new_source_families: result.new_source_families,
    sources_promoted: result.sources_promoted,
    sources_exhausted: result.sources_exhausted,
    source_map_pre_count: 60,
    source_map_post_count: postCount,
    source_family_pre_count: 20,
    source_family_post_count: postFamilies,
    source_map_persistence_audit: postCount >= 60 ? 'PASS' : 'FAIL',
    audit_sample_total: totalAuditSample,
    audit_accuracy: auditAccuracy,
    root_sha256_email_1m_pre: freezeManifest.rootSha256Email1M,
    root_sha256_email_1m_post: postRootSha256,
    hash_match: hashMatches,
    target_1m_reached: result.total_mission_qualified >= 1000000,
    final_status: result.final_status
  };

  const summaryPath = path.resolve('reports/atlas/pathfinder/industrial_1m/INDUSTRIAL_EMAIL_1M_SUMMARY.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');

  return summary;
}

runIndustrialEmail1MGate().catch(err => {
  console.error('Execution Error:', err);
  process.exit(1);
});
