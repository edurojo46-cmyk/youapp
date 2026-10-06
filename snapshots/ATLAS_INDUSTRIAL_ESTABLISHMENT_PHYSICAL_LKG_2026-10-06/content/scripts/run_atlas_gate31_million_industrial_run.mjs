/**
 * scripts/run_atlas_gate31_million_industrial_run.mjs
 * 
 * ATLAS GATE #31: MILLION PEOPLE / 30 MINUTE INDUSTRIAL RUN V1
 * 
 * Executes the cold industrial run according to all 36 specification directives:
 * 1. Freezes Gate #30D truth directly from certified artifact.
 * 2. Freezes T0 canonical snapshot.
 * 3. Keeps production SSOT read-only.
 * 4. Keeps Search V1 frozen.
 * 5. Loads exact 56 source surfaces with expanded ARCA quota (670k).
 * 6. Performs pre-run availability and identity key compatibility checks.
 * 7. Executes cold industrial pipeline (16 workers, max RPS controller).
 * 8. Evaluates qualifying person definition & tracks within-run uniqueness.
 * 9. Evaluates early target completion (stops acquisition immediately at 1M).
 * 10. Emits the 3 required certified artifacts:
 *     - reports/atlas/discovery/atlas_gate31_million_industrial_run_v1.json
 *     - reports/atlas/discovery/atlas_gate31_million_source_performance_v1.json
 *     - reports/atlas/discovery/atlas_gate31_million_timeline_v1.json
 * 11. Certifies MILLION_PEOPLE_30_MIN_INDUSTRIAL_CAPABILITY_CERTIFIED.
 * 12. Halts cleanly (STOP).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AtlasMillionIndustrialRunEngine } from '../src/lib/atlas/discovery/industrial/AtlasMillionIndustrialRunEngine.mjs';

console.log('================================================================================');
console.log('ATLAS GATE #31: MILLION PEOPLE / 30 MINUTE INDUSTRIAL RUN V1');
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

const engine = new AtlasMillionIndustrialRunEngine({
  workspaceRoot: process.cwd(),
  hmacSecret: hmacSecret,
  targetCount: 1000000,
  timeBudgetSeconds: 1800,
  concurrency: 16,
  maxRps: 250
});

async function run() {
  const { runSummary, sourcePerformanceArray, timeline } = await engine.executeMillionIndustrialRun();

  // Paths
  const reportsDir = path.resolve('reports/atlas/discovery');
  const mainReportPath = path.join(reportsDir, 'atlas_gate31_million_industrial_run_v1.json');
  const perfReportPath = path.join(reportsDir, 'atlas_gate31_million_source_performance_v1.json');
  const timelineReportPath = path.join(reportsDir, 'atlas_gate31_million_timeline_v1.json');

  // Write artifacts
  fs.writeFileSync(mainReportPath, JSON.stringify(runSummary, null, 2), 'utf8');
  fs.writeFileSync(perfReportPath, JSON.stringify(sourcePerformanceArray, null, 2), 'utf8');
  fs.writeFileSync(timelineReportPath, JSON.stringify(timeline, null, 2), 'utf8');

  const mainSha = crypto.createHash('sha256').update(fs.readFileSync(mainReportPath)).digest('hex');
  const perfSha = crypto.createHash('sha256').update(fs.readFileSync(perfReportPath)).digest('hex');
  const timelineSha = crypto.createHash('sha256').update(fs.readFileSync(timelineReportPath)).digest('hex');

  console.log('Artifacts generated successfully:');
  console.log(`1. Main Report:        ${mainReportPath}`);
  console.log(`   SHA256:             ${mainSha}`);
  console.log(`2. Source Performance: ${perfReportPath}`);
  console.log(`   SHA256:             ${perfSha}`);
  console.log(`3. Timeline:           ${timelineReportPath}`);
  console.log(`   SHA256:             ${timelineSha}`);

  console.log('\nGATE #31 INDUSTRIAL RUN COMPLETE. RESULT RECORDED.');
}

run().catch(err => {
  console.error('CRITICAL ERROR IN GATE #31 EXECUTION:', err);
  process.exit(1);
});
