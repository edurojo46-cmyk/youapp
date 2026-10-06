/**
 * scripts/run_atlas_gate31b_physical_million_run.mjs
 * 
 * ATLAS GATE #31B: PHYSICAL MILLION PEOPLE / 30 MINUTE INDUSTRIAL RUN V1
 * 
 * Executes a single physical Gate #31B attempt:
 * - Anti-simulation precheck
 * - Physical hardware monotonic clock
 * - Physical network HTTP requests with non-PII receipts
 * - Physical SQLite shadow canonical ledger with UNIQUE index
 * - Physical Orama full-text search shadow index
 * - Emits all 6 required artifacts:
 *     1. atlas_gate31b_physical_million_industrial_run_v1.json
 *     2. atlas_gate31b_physical_source_performance_v1.json
 *     3. atlas_gate31b_physical_timeline_v1.json
 *     4. atlas_gate31b_network_receipts_v1.json
 *     5. atlas_gate31b_ledger_audit_v1.json
 *     6. atlas_gate31b_search_shadow_audit_v1.json
 * - Verifies invariants: SSOT_MUTATION = FALSE, SEARCH_V1_RECURSIVE_MANIFEST_UNCHANGED = TRUE.
 * - Stops cleanly (STOP).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AtlasPhysicalMillionRunEngine } from '../src/lib/atlas/discovery/industrial/AtlasPhysicalMillionRunEngine.mjs';

console.log('================================================================================');
console.log('ATLAS GATE #31B: PHYSICAL MILLION PEOPLE INDUSTRIAL RUN V1');
console.log('================================================================================\n');

// Read HMAC secret from .env
const env = fs.readFileSync('.env', 'utf8');
let hmacSecret = '';
for (const line of env.split('\n')) {
  if (line.startsWith('ATLAS_IGJ_IDENTITY_HMAC_KEY=')) {
    hmacSecret = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}
if (!hmacSecret) hmacSecret = '1e7b93df021b3394a11f95304b0dfb925b4ec91428a2a5df0db036af6b88950d';

const engine = new AtlasPhysicalMillionRunEngine({
  workspaceRoot: process.cwd(),
  hmacSecret: hmacSecret,
  targetCount: 1000000,
  timeBudgetSeconds: 1800,
  concurrency: 16,
  maxRps: 250
});

async function run() {
  const result = await engine.executePhysicalRun();

  const reportsDir = path.resolve('reports/atlas/discovery');
  const files = {
    main: {
      path: path.join(reportsDir, 'atlas_gate31b_physical_million_industrial_run_v1.json'),
      data: result.runSummary
    },
    perf: {
      path: path.join(reportsDir, 'atlas_gate31b_physical_source_performance_v1.json'),
      data: result.sourcePerformance
    },
    timeline: {
      path: path.join(reportsDir, 'atlas_gate31b_physical_timeline_v1.json'),
      data: result.timeline
    },
    receipts: {
      path: path.join(reportsDir, 'atlas_gate31b_network_receipts_v1.json'),
      data: result.networkReceipts
    },
    ledger: {
      path: path.join(reportsDir, 'atlas_gate31b_ledger_audit_v1.json'),
      data: result.ledgerAudit
    },
    search: {
      path: path.join(reportsDir, 'atlas_gate31b_search_shadow_audit_v1.json'),
      data: result.searchShadowAudit
    }
  };

  console.log('\nEmitting Certified Gate #31B Artifacts:');
  for (const [key, item] of Object.entries(files)) {
    fs.writeFileSync(item.path, JSON.stringify(item.data, null, 2), 'utf8');
    const sha = crypto.createHash('sha256').update(fs.readFileSync(item.path)).digest('hex');
    console.log(`- ${path.basename(item.path)}: ${sha}`);
  }

  // Clean up scratch sqlite db
  if (fs.existsSync(engine.ledgerDbPath)) {
    try { fs.unlinkSync(engine.ledgerDbPath); } catch (e) {}
  }

  console.log('\n================================================================================');
  console.log(`GATE #31B RESULT: ${result.runSummary.primary_result}`);
  console.log(`AUTHENTICITY:     ${result.runSummary.authenticity_label}`);
  console.log(`CERTIFICATION:    ${result.runSummary.certification_status}`);
  console.log('================================================================================\n');
}

run().catch(err => {
  console.error('CRITICAL ERROR IN GATE #31B RUN:', err);
  process.exit(1);
});
