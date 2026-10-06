import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { AtlasPeopleSearchV2 } from '../src/lib/search/AtlasPeopleSearchV2';

export interface MultiSourceSearchTestReport {
  TEST_NAME: string;
  GATE_STATUS: 'PASS' | 'FAIL';
  TIMESTAMP: string;
  TEST_CASES: {
    TEST_1_NATIONAL_UNIVERSE: {
      REQUESTED_STATE: string;
      TOTAL_MATCHES: number;
      FIRST_PAGE_COUNT: number;
      LATENCY_MS: number;
      STATUS: string;
    };
    TEST_2_BIEP_DISCOVERY: {
      QUERY: string;
      FOUND: boolean;
      DISPLAY_NAME: string;
      ORGANIZATION: string;
      BADGES: string[];
      STATUS: string;
    };
    TEST_3_MULTI_SOURCE_PERSON: {
      QUERY: string;
      FOUND: boolean;
      DISPLAY_NAME: string;
      ORGANIZATION: string;
      BADGES: string[];
      STATUS: string;
    };
    TEST_4_ORGANIZATION_FILTER: {
      FILTER_ORG: string;
      MATCHES_FOUND: number;
      STATUS: string;
    };
    TEST_5_ZERO_DNI_LEAK: {
      RAW_DNI_DETECTED: number;
      STATUS: string;
    };
  };
  LATENCY_BENCHMARK: {
    QUERIES_EXECUTED: number;
    P50_MS: number;
    P95_MS: number;
  };
}

async function runSearchTest() {
  console.log('================================================================');
  console.log('ATLAS ARGENTINA PEOPLE — MULTI-SOURCE SEARCH V2 PHYSICAL TEST');
  console.log('================================================================\n');

  const latencies: number[] = [];

  // Test 1: National Universe SSOT
  console.log('Test 1: Consultando Universo Nacional SSOT (ALL_ARGENTINA)...');
  const t1Start = Date.now();
  const res1 = await AtlasPeopleSearchV2.search({ evidence_state: 'ALL_ARGENTINA', limit: 20 });
  const t1Duration = Date.now() - t1Start;
  latencies.push(t1Duration);

  console.log(`Total Matches: ${res1.total_matches} | Items en página 1: ${res1.results.length} | Latencia: ${t1Duration}ms`);

  // Test 2: BIEP search by name
  console.log('\nTest 2: Búsqueda de funcionario BIEP...');
  const t2Start = Date.now();
  const res2 = await AtlasPeopleSearchV2.search({
    evidence_state: 'ALL_ARGENTINA',
    source: 'BIEP',
    limit: 10
  });
  latencies.push(Date.now() - t2Start);
  const sampleBiep = res2.results[0];
  console.log(`Encontrado: ${sampleBiep?.display_name} | Org: ${sampleBiep?.organization} | Badges: ${sampleBiep?.evidence_badges?.join(', ')}`);

  // Test 3: Multi-source search (linked CONICET/BIEP)
  console.log('\nTest 3: Búsqueda de persona multi-fuente...');
  const t3Start = Date.now();
  const res3 = await AtlasPeopleSearchV2.search({
    evidence_state: 'ALL_ARGENTINA',
    query: 'Valeria Fernandez Hasan',
    limit: 5
  });
  latencies.push(Date.now() - t3Start);
  const multiPerson = res3.results[0];
  console.log(`Encontrado: ${multiPerson?.display_name} | Badges: ${multiPerson?.evidence_badges?.join(', ')}`);

  // Test 4: Filter by organization
  console.log('\nTest 4: Filtro server-side por Organización (Salud / Hospital)...');
  const t4Start = Date.now();
  const res4 = await AtlasPeopleSearchV2.search({
    evidence_state: 'ALL_ARGENTINA',
    organization: 'Hospital',
    limit: 10
  });
  latencies.push(Date.now() - t4Start);
  console.log(`Resultados encontrados con org "Hospital": ${res4.results.length}`);

  // Test 5: Check zero DNI leak in all search outputs
  console.log('\nTest 5: Verificación de Cero Fuga de DNI en resultados...');
  let dniLeakCount = 0;
  const allResultsJson = JSON.stringify([res1, res2, res3, res4]);
  const dniMatch = allResultsJson.match(/"\d{7,8}"/g);
  if (dniMatch) {
    const falsePositives = dniMatch.filter(m => !m.includes('atlas') && !m.includes('2026'));
    dniLeakCount = falsePositives.length;
  }
  console.log(`DNI_LEAK_IN_SEARCH_RESPONSES: ${dniLeakCount} (Exigido: 0) -> ${dniLeakCount === 0 ? 'PASS' : 'FAIL'}`);

  // Calculate P50 and P95
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];

  const pass = res1.results.length > 0 &&
               res2.results.length > 0 &&
               dniLeakCount === 0;

  const report: MultiSourceSearchTestReport = {
    TEST_NAME: 'MULTI_SOURCE_SEARCH_V2_PHYSICAL_TEST',
    GATE_STATUS: pass ? 'PASS' : 'FAIL',
    TIMESTAMP: new Date().toISOString(),
    TEST_CASES: {
      TEST_1_NATIONAL_UNIVERSE: {
        REQUESTED_STATE: 'ALL_ARGENTINA',
        TOTAL_MATCHES: res1.total_matches,
        FIRST_PAGE_COUNT: res1.results.length,
        LATENCY_MS: t1Duration,
        STATUS: res1.results.length > 0 ? 'PASS' : 'FAIL'
      },
      TEST_2_BIEP_DISCOVERY: {
        QUERY: 'source=BIEP',
        FOUND: res2.results.length > 0,
        DISPLAY_NAME: sampleBiep?.display_name || '—',
        ORGANIZATION: sampleBiep?.organization || '—',
        BADGES: sampleBiep?.evidence_badges || [],
        STATUS: res2.results.length > 0 ? 'PASS' : 'FAIL'
      },
      TEST_3_MULTI_SOURCE_PERSON: {
        QUERY: 'Valeria Fernandez Hasan',
        FOUND: !!multiPerson,
        DISPLAY_NAME: multiPerson?.display_name || '—',
        ORGANIZATION: multiPerson?.organization || '—',
        BADGES: multiPerson?.evidence_badges || [],
        STATUS: !!multiPerson ? 'PASS' : 'FAIL'
      },
      TEST_4_ORGANIZATION_FILTER: {
        FILTER_ORG: 'Hospital',
        MATCHES_FOUND: res4.results.length,
        STATUS: res4.results.length > 0 ? 'PASS' : 'FAIL'
      },
      TEST_5_ZERO_DNI_LEAK: {
        RAW_DNI_DETECTED: dniLeakCount,
        STATUS: dniLeakCount === 0 ? 'PASS' : 'FAIL'
      }
    },
    LATENCY_BENCHMARK: {
      QUERIES_EXECUTED: latencies.length,
      P50_MS: p50,
      P95_MS: p95
    }
  };

  const reportPath = path.resolve('reports/atlas/people/multi_source_search_v2_physical_test.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`\nReporte de Búsqueda V2 guardado en: ${reportPath}`);

  return report;
}

runSearchTest().catch(err => {
  console.error('Fatal error in search test:', err);
  process.exit(1);
});
