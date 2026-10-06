import fs from 'fs';
import crypto from 'crypto';

function getHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

const files = [
  'reports/atlas/discovery/atlas_final_1m_verdict_v1.json',
  'reports/atlas/discovery/atlas_final_1m_forensic_reconciliation_v1.json',
  'reports/atlas/discovery/atlas_final_1m_campaign_totals_v1.json',
  'reports/atlas/discovery/atlas_final_1m_timing_reconciliation_v1.json',
  'reports/atlas/discovery/atlas_final_1m_meili_restart_audit_v1.json',
  'reports/atlas/discovery/atlas_final_1m_search_exact_reconciliation_v1.json',
  'reports/atlas/discovery/atlas_final_1m_verdict_v2.json',
  'scripts/run_final_1m_e2e_ingestion.mjs'
];

const manifest = {
  timestamp: new Date().toISOString(),
  stage: 'FINAL_1M',
  title: 'ATLAS FINAL 1M POST-RUN HASHES MANIFEST',
  hashes: {}
};

for (const f of files) {
  manifest.hashes[f] = getHash(f);
}

fs.writeFileSync(
  'reports/atlas/discovery/atlas_final_1m_postrun_hashes_manifest_v1.json',
  JSON.stringify(manifest, null, 2)
);

console.log('Manifest written:');
console.log(JSON.stringify(manifest, null, 2));
