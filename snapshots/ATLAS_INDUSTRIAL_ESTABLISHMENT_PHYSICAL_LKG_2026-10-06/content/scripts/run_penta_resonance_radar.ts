import * as fs from 'fs';
import * as path from 'path';
import { AtlasPentaResonanceRadar } from '../src/lib/search/discovery/AtlasPentaResonanceRadar';

async function main() {
  console.log('🚀 Running ATLAS PENTA-RESONANCE RADAR V1 SHADOW RUN (100 CYCLES)...');
  const report = await AtlasPentaResonanceRadar.executePentaRadarShadowRun(100);

  const reportPath = path.resolve(process.cwd(), 'reports/atlas/people/atlas_penta_resonance_radar_v1_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`\n✅ ATLAS PENTA-RESONANCE RADAR V1 REPORT GENERATED at: ${reportPath}`);
  console.log(`- CYCLES: ${report.CYCLES_EXECUTED}`);
  console.log(`- DOMAINS FOUND: ${report.TELEMETRY.DOMAINS_FOUND}`);
  console.log(`- CERTIFIED ENUMERABLE SOURCES: ${report.TELEMETRY.CERTIFIED_ENUMERABLE_SOURCES}`);
  console.log(`- CERTIFIED ENUMERABLE PEOPLE: ${report.TELEMETRY.OBSERVED_PEOPLE_UNLOCKED}`);
  console.log(`- MASS RADAR TORQUE: ${report.TELEMETRY.MASS_RADAR_TORQUE} people/hr`);
  console.log(`- DISCOVERY SLIP: ${report.TELEMETRY.DISCOVERY_SLIP}`);
  console.log(`- VERDICT OPERATIONAL: ${report.VERDICT.PENTA_RADAR_OPERATIONAL}`);
  console.log(`- SHARED MEMORY ACTIVE: ${report.VERDICT.SHARED_MEMORY_ACTIVE}`);
  console.log(`- MASS TARGET PASS: ${report.VERDICT.MASS_TARGET_PASS}`);
}

main().catch(err => {
  console.error('Fatal error running Penta Radar Shadow Run:', err);
  process.exit(1);
});
