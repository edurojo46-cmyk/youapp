import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { AtlasMassDiscoveryEngineV2 } from '../src/lib/search/discovery/AtlasMassDiscoveryEngineV2';

async function main() {
  console.log('================================================================');
  console.log('ATLAS MASS DISCOVERY ENGINE V2 — RADAR RUN DRIVER');
  console.log('RESONANCE RADAR + 3-PHASE DISCOVERY + PROVINCIAL REPLICATION');
  console.log('================================================================\n');

  const report = await AtlasMassDiscoveryEngineV2.executeRadarRun();

  console.log('\n================================================================');
  console.log('DICTAMEN DE DESCUBRIMIENTO MASIVO (RESONANCE RADAR V2)');
  console.log('================================================================');
  console.log(`TOTAL CANDIDATOS AUDITADOS (TOP 50):           ${report.TOP_50_RANKED_SOURCES.length}`);
  console.log(`CERTIFIED ENUMERABLE PEOPLE UNLOCKED:          ${report.ENUMERABILITY_BREAKDOWN.TOTAL_CERTIFIED_ENUMERABLE_PEOPLE_UNLOCKED.toLocaleString()} personas`);
  console.log(`OFFICIAL CARDINALITY (NO ENUMERADA):           ${report.ENUMERABILITY_BREAKDOWN.OFFICIAL_CARDINALITY_NOT_ENUMERATED.toLocaleString()} personas`);
  console.log(`LIVE QUERY ONLY (CONSULTA INDIVIDUAL):         ${report.ENUMERABILITY_BREAKDOWN.LIVE_QUERY_ONLY_POTENTIAL.toLocaleString()} personas`);
  console.log(`MASS RADAR TORQUE (PRODUCTIVIDAD / HORA):       ${report.RESONANCE_RADAR_TELEMETRY.MASS_RADAR_TORQUE_PER_HOUR.toLocaleString()} personas/h`);
  console.log(`DISCOVERY SLIP RATIO:                          ${(report.RESONANCE_RADAR_TELEMETRY.DISCOVERY_SLIP_RATIO * 100).toFixed(1)}%`);
  console.log(`FAMILIAS SATURADAS (REDUCIDAS):                ${report.RESONANCE_RADAR_TELEMETRY.SATURATED_FAMILIES.join(', ')}`);
  console.log(`CUMPLIMIENTO OBJETIVO >= 1.000.000 ENUMERABLE: ${report.ENUMERABILITY_BREAKDOWN.TOTAL_CERTIFIED_ENUMERABLE_PEOPLE_UNLOCKED >= 1000000 ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log('================================================================\n');

  console.log('TOP 10 FUENTES CERTIFICADAS ENUMERABLES:');
  const certTop10 = report.TOP_50_RANKED_SOURCES
    .filter(s => s.classification === 'CERTIFIED_ENUMERABLE')
    .slice(0, 10);

  for (let i = 0; i < certTop10.length; i++) {
    const s = certTop10[i];
    console.log(`  ${i + 1}. [${s.probe.format}] ${s.source_name} (${s.jurisdiction}) — ${s.probe.enumerable_people_available.toLocaleString()} personas | Score: ${s.mass_discovery_score}`);
    console.log(`     URL: ${s.download_url}`);
  }

  const reportPath = path.resolve('reports/atlas/people/atlas_mass_discovery_v2_report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nReport saved to: ${reportPath}`);

  return report;
}

if (process.argv[1]?.endsWith('run_mass_discovery_engine_v2.ts')) {
  main().catch(console.error);
}
