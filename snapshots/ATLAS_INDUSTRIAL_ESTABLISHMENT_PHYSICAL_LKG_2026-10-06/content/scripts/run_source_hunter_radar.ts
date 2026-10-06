import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { AtlasSourceHunterV1 } from '../src/lib/search/discovery/AtlasSourceHunterV1';
import { NosisPublicSourceArchaeology } from '../src/lib/search/discovery/NosisPublicSourceArchaeology';

export async function runSourceHunterRadar() {
  console.log('================================================================');
  console.log('ATLAS INDUSTRIAL FACTORY V2 — SOURCE HUNTER RADAR (100 SOURCES)');
  console.log('================================================================\n');

  console.log('1. Ejecutando Nosis Public Source Archaeology V1...');
  const archaeology = NosisPublicSourceArchaeology.getArcheologyCatalog();
  console.log(`Categorías públicas primarias analizadas: ${archaeology.length}`);

  const archaeologyPassed = archaeology.length >= 8 &&
    archaeology.every(a => a.primary_public_source_name && a.public_organism && a.sensitive_fields_prohibited.length > 0);

  console.log(`NOSIS_SOURCE_ARCHAEOLOGY_V1 = ${archaeologyPassed ? 'PASS ✅' : 'FAIL ❌'}`);

  console.log('\n2. Ejecutando Atlas Source Hunter V1 Radar (100 candidatos)...');
  const radarResult = await AtlasSourceHunterV1.executeRadarRun();

  console.log(`\n--- RESULTADOS DEL RADAR ---`);
  console.log(`TOTAL_DISCOVERED: ${radarResult.total_discovered}`);
  console.log(`ACCESSIBLE: ${radarResult.accessible}`);
  console.log(`BLOCKED: ${radarResult.blocked}`);
  console.log(`MASS SOURCES (>= 100K): ${radarResult.mass_sources}`);
  console.log(`LARGE SOURCES (10K–99K): ${radarResult.large_sources}`);
  console.log(`MEDIUM SOURCES (1K–9.9K): ${radarResult.medium_sources}`);
  console.log(`SMALL SOURCES (100–999): ${radarResult.small_sources}`);
  console.log(`OBSERVED_UNIQUE_PEOPLE: ${radarResult.observed_unique_people_total}`);
  console.log(`PROJECTED_NET_NEW_PEOPLE: ${radarResult.projected_net_new_total}\n`);

  console.log('--- TOP 10 FUENTES DESCUBIERTAS POR SOURCE VALUE SCORE ---');
  for (let i = 0; i < 10; i++) {
    const s = radarResult.top_20_sources[i];
    console.log(`${i + 1}. [${s.yield_class}] ${s.source_name} | Score: ${s.source_value_score} | Cap: ~${s.estimated_unique_people.toLocaleString()} | Org: ${s.domain}`);
  }

  const sourceHunterPassed = radarResult.total_discovered >= 100 &&
                             radarResult.mass_sources >= 5 &&
                             radarResult.large_sources >= 15 &&
                             radarResult.top_20_sources.length === 20;

  console.log(`\nSOURCE_HUNTER_V1 = ${sourceHunterPassed ? 'PASS ✅' : 'FAIL ❌'}`);

  const finalReport = {
    SOURCE_HUNTER_V1: sourceHunterPassed ? 'PASS' : 'FAIL',
    NOSIS_SOURCE_ARCHAEOLOGY_V1: archaeologyPassed ? 'PASS' : 'FAIL',
    TIMESTAMP: new Date().toISOString(),
    TOTAL_DISCOVERED: radarResult.total_discovered,
    ACCESSIBLE: radarResult.accessible,
    BLOCKED: radarResult.blocked,
    BREAKDOWN_BY_YIELD: {
      MASS_SOURCES_GE_100K: radarResult.mass_sources,
      LARGE_SOURCES_10K_TO_99K: radarResult.large_sources,
      MEDIUM_SOURCES_1K_TO_9K: radarResult.medium_sources,
      SMALL_SOURCES_LE_1K: radarResult.small_sources
    },
    TOTAL_PEOPLE_CAPACITY: {
      OBSERVED_UNIQUE_PEOPLE: radarResult.observed_unique_people_total,
      PROJECTED_NET_NEW_PEOPLE: radarResult.projected_net_new_total
    },
    TOP_20_SOURCES: radarResult.top_20_sources.map(s => ({
      rank_score: s.source_value_score,
      yield_class: s.yield_class,
      source_id: s.source_id,
      source_name: s.source_name,
      domain: s.domain,
      estimated_unique_people: s.estimated_unique_people,
      format: s.format,
      access_mode: s.access_mode,
      commercial_reuse_status: s.commercial_use_status,
      gates_status: s.gates,
      allowed_atlas_domains: s.allowed_atlas_domains
    }))
  };

  const reportPath = path.resolve('reports/atlas/people/source_hunter_radar_report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(finalReport, null, 2), 'utf-8');
  console.log(`\nReporte guardado en: ${reportPath}`);

  return finalReport;
}

if (process.argv.includes('--run')) {
  runSourceHunterRadar().catch(err => {
    console.error('Radar failed:', err);
    process.exit(1);
  });
}
