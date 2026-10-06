import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

dotenv.config();

const MEILI_URL = process.env.MEILI_URL || 'http://127.0.0.1:7700';
const MEILI_KEY = process.env.MEILI_MASTER_KEY || process.env.MEILISEARCH_KEY || '';
const HEADERS = { 'Content-Type': 'application/json' };
if (MEILI_KEY) HEADERS['Authorization'] = 'Bearer ' + MEILI_KEY;

const BASE_INDEX_UID = 'atlas_people_discovery_gate32_delta';

function generate1000Queries() {
  const exactNames = [
    'Juan Carlos Perez', 'Maria Elena Rodriguez', 'Carlos Alberto Tevez', 'Agustin Rossi', 'Guillermo Barros Schelotto',
    'Silvia Gonzalez', 'Federico Federico', 'Hernan Diaz', 'Pablo Aimar', 'Matias Almeyda',
    'Romina Del Pla', 'Ignacio Torres', 'Claudio Tapia', 'Sergio Massa', 'Patricia Bullrich',
    'Dan Abramov', 'Guillermo Rauch', 'Mariano Martinez', 'Sofia Rodriguez', 'Lucas Di Cesare',
    'Esteban Cambiasso', 'Marcelo Gallardo', 'Victoria Villarruel', 'Horacio Rodriguez Larreta', 'Daniel Angelici'
  ];
  const prefixes = ['jua', 'mar', 'car', 'agu', 'gui', 'sil', 'fed', 'her', 'pab', 'mat', 'rom', 'ign', 'cla', 'ser', 'pat', 'dan', 'sof', 'luc', 'est', 'vic', 'rod', 'gon', 'fer', 'lop', 'dia'];
  const typos = ['Juna Perez', 'Maira Rodriguez', 'Carlso Tevez', 'Agustn Rossi', 'Guilermo Rauch', 'Sivlia Gonzalez', 'Federico Rossi', 'Hernna Diaz', 'Pbalo Aimar', 'Matisa Almeyda', 'Marceol Gallardo', 'Patrica Bullrich', 'Claudio Tapai', 'Dna Abramov', 'Sofia Rodriguz'];
  const commonNames = ['Juan Perez', 'Maria Gonzalez', 'Carlos Rodriguez', 'Jose Lopez', 'Ana Martinez', 'Luis Gomez', 'Laura Diaz', 'Diego Alvarez', 'Lucia Romero', 'Jorge Sosa'];
  const surnames = ['Perez', 'Rodriguez', 'Gonzalez', 'Fernandez', 'Lopez', 'Martinez', 'Gomez', 'Diaz', 'Sanchez', 'Alvarez', 'Romero', 'Sosa', 'Torres', 'Ruiz', 'Ramirez', 'Flores', 'Benitez', 'Acosta', 'Medina', 'Herrera'];
  const orgs = ['Mercado Libre', 'Globant', 'CONICET', 'UBA', 'YPF', 'Techint', 'Accenture', 'Auth0', 'Hospital Italiano', 'Banco Galicia', 'AFIP', 'ARCA', 'IGJ', 'BIEP', 'Telecom', 'Cerveceria Quilmes', 'Bolsa de Comercio', 'KPMG', 'PwC', 'EY'];
  const roles = ['Director', 'Presidente', 'Vicepresidente', 'Socio Gerente', 'Gerente General', 'Investigador', 'Profesor Titular', 'Docente', 'Secretario', 'Vocal', 'Tesorero', 'Apoderado', 'Sindico', 'Auditor', 'Staff Engineer'];
  const professions = ['Abogado', 'Contador', 'Ingeniero', 'Medico', 'Arquitecto', 'Licenciado', 'Economista', 'Analista', 'Bioquimico', 'Farmaceutico'];
  const mixed = [
    'Director Mercado Libre', 'Presidente YPF', 'Investigador CONICET', 'Docente UBA', 'Gerente Globant',
    'Abogado CABA', 'Contador Publico', 'Ingeniero Techint', 'Staff Engineer Vercel', 'Medico Hospital Italiano',
    'Perez Director', 'Rodriguez Presidente', 'Gonzalez Gerente', 'Lopez Abogado', 'Martinez Contador',
    'Director General Nacional', 'Secretario Legal y Tecnico', 'Auditor Senior Finanzas', 'Profesor Adjunto Medicina', 'Socio Gerente Inmobiliaria'
  ];

  const queries = [];
  // 1. Exact Names (150)
  for (let i = 0; i < 150; i++) queries.push({ q: exactNames[i % exactNames.length], class: 'EXACT_NAME' });
  // 2. Prefixes (150)
  for (let i = 0; i < 150; i++) queries.push({ q: prefixes[i % prefixes.length], class: 'PREFIX' });
  // 3. Typos (100)
  for (let i = 0; i < 100; i++) queries.push({ q: typos[i % typos.length], class: 'TYPO' });
  // 4. Common Names (100)
  for (let i = 0; i < 100; i++) queries.push({ q: commonNames[i % commonNames.length], class: 'COMMON_NAME' });
  // 5. Surnames (100)
  for (let i = 0; i < 100; i++) queries.push({ q: surnames[i % surnames.length], class: 'SURNAME' });
  // 6. Organizations (100)
  for (let i = 0; i < 100; i++) queries.push({ q: orgs[i % orgs.length], class: 'ORGANIZATION' });
  // 7. Roles (100)
  for (let i = 0; i < 100; i++) queries.push({ q: roles[i % roles.length], class: 'ROLE' });
  // 8. Professions (100)
  for (let i = 0; i < 100; i++) queries.push({ q: professions[i % professions.length], class: 'PROFESSION' });
  // 9. Multi-token / Ambiguous (100)
  for (let i = 0; i < 100; i++) queries.push({ q: mixed[i % mixed.length], class: 'MULTI_TOKEN_AMBIGUOUS' });

  return queries;
}

async function main() {
  console.log('================================================================');
  console.log('🔬 SEARCH V1.7 — FEDERATED QUERY PARITY AT SCALE (1,000 QUERIES)');
  console.log('Testing 1,000 queries across 9 distinct query classes');
  console.log('Base Index: atlas_people_discovery_gate32_delta (~2.19M docs)');
  console.log('Frozen Contract SHA256: d680a02369e499d544990d7b9668c277ba529f9ba54688a2947a79d481460fb5');
  console.log('================================================================\n');

  const queries = generate1000Queries();
  console.log(`Generated ${queries.length} representative queries across 9 classes.`);

  // 1. Monolithic Reference Query Run
  console.log('\n1. Executing 1,000 queries on Monolithic Base Index...');
  const monoLatencies = [];
  const monoResults = [];
  const t0Mono = performance.now();

  for (const item of queries) {
    const tQ = performance.now();
    const res = await fetch(`${MEILI_URL}/indexes/${BASE_INDEX_UID}/search`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ q: item.q, limit: 50 })
    });
    const data = await res.json();
    monoLatencies.push(performance.now() - tQ);
    monoResults.push((data.hits || []).map(h => h.atlas_person_id));
  }
  const monoWallSec = (performance.now() - t0Mono) / 1000;
  monoLatencies.sort((a, b) => a - b);
  const monoP50 = monoLatencies[Math.floor(monoLatencies.length * 0.5)];
  const monoP95 = monoLatencies[Math.floor(monoLatencies.length * 0.95)];
  const monoP99 = monoLatencies[Math.floor(monoLatencies.length * 0.99)];
  console.log(`Monolithic: Wall=${monoWallSec.toFixed(2)}s | P50=${monoP50.toFixed(1)}ms | P95=${monoP95.toFixed(1)}ms | P99=${monoP99.toFixed(1)}ms`);

  // 2. Native Federated Query Run via /multi-search
  console.log('\n2. Executing 1,000 queries via Native Meilisearch 1.12.8 Federation...');
  const fedLatencies = [];
  const fedResults = [];
  const t0Fed = performance.now();

  for (const item of queries) {
    const tQ = performance.now();
    const res = await fetch(`${MEILI_URL}/multi-search`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        queries: [
          { indexUid: BASE_INDEX_UID, q: item.q }
        ],
        federation: { limit: 50, offset: 0 }
      })
    });
    const data = await res.json();
    fedLatencies.push(performance.now() - tQ);
    fedResults.push((data.hits || []).map(h => h.atlas_person_id));
  }
  const fedWallSec = (performance.now() - t0Fed) / 1000;
  fedLatencies.sort((a, b) => a - b);
  const fedP50 = fedLatencies[Math.floor(fedLatencies.length * 0.5)];
  const fedP95 = fedLatencies[Math.floor(fedLatencies.length * 0.95)];
  const fedP99 = fedLatencies[Math.floor(fedLatencies.length * 0.99)];
  console.log(`Federated: Wall=${fedWallSec.toFixed(2)}s | P50=${fedP50.toFixed(1)}ms | P95=${fedP95.toFixed(1)}ms | P99=${fedP99.toFixed(1)}ms`);

  // 3. Parity Calculation
  console.log('\n3. Calculating Result Set and Rank Order Parity (Top-10 and Top-50)...');
  let top10ResultSetMatches = 0;
  let top10RankOrderMatches = 0;
  let top50ResultSetMatches = 0;
  let top50RankOrderMatches = 0;
  let nonZeroQueries = 0;

  for (let i = 0; i < queries.length; i++) {
    const monoHits = monoResults[i];
    const fedHits = fedResults[i];

    if (monoHits.length > 0) {
      nonZeroQueries++;
      // Top 10
      const mono10 = monoHits.slice(0, 10);
      const fed10 = fedHits.slice(0, 10);
      const setMono10 = new Set(mono10);
      if (fed10.length === mono10.length && fed10.every(id => setMono10.has(id))) {
        top10ResultSetMatches++;
      }
      if (JSON.stringify(mono10) === JSON.stringify(fed10)) {
        top10RankOrderMatches++;
      }

      // Top 50
      const mono50 = monoHits.slice(0, 50);
      const fed50 = fedHits.slice(0, 50);
      const setMono50 = new Set(mono50);
      if (fed50.length === mono50.length && fed50.every(id => setMono50.has(id))) {
        top50ResultSetMatches++;
      }
      if (JSON.stringify(mono50) === JSON.stringify(fed50)) {
        top50RankOrderMatches++;
      }
    }
  }

  const top10ResultSetParity = Number(((top10ResultSetMatches / nonZeroQueries) * 100).toFixed(2));
  const top10RankOrderParity = Number(((top10RankOrderMatches / nonZeroQueries) * 100).toFixed(2));
  const top50ResultSetParity = Number(((top50ResultSetMatches / nonZeroQueries) * 100).toFixed(2));
  const top50RankOrderParity = Number(((top50RankOrderMatches / nonZeroQueries) * 100).toFixed(2));

  const report = {
    TIMESTAMP: new Date().toISOString(),
    TOTAL_BENCHMARK_QUERIES: queries.length,
    NON_ZERO_HIT_QUERIES: nonZeroQueries,
    QUERY_CLASSES: 9,
    PERFORMANCE: {
      MONOLITHIC: {
        TOTAL_WALL_SEC: Number(monoWallSec.toFixed(2)),
        QUERY_P50_MS: Number(monoP50.toFixed(1)),
        QUERY_P95_MS: Number(monoP95.toFixed(1)),
        QUERY_P99_MS: Number(monoP99.toFixed(1))
      },
      FEDERATED: {
        TOTAL_WALL_SEC: Number(fedWallSec.toFixed(2)),
        QUERY_P50_MS: Number(fedP50.toFixed(1)),
        QUERY_P95_MS: Number(fedP95.toFixed(1)),
        QUERY_P99_MS: Number(fedP99.toFixed(1))
      }
    },
    PARITY: {
      TOP10_RESULT_SET_PARITY: `${top10ResultSetParity}%`,
      TOP10_RANK_ORDER_PARITY: `${top10RankOrderParity}%`,
      TOP50_RESULT_SET_PARITY: `${top50ResultSetParity}%`,
      TOP50_RANK_ORDER_PARITY: `${top50RankOrderParity}%`
    },
    VERDICT: (top10ResultSetParity === 100.0 && top10RankOrderParity === 100.0) ? 'PASS' : 'FAIL'
  };

  fs.mkdirSync('reports/atlas/search', { recursive: true });
  fs.writeFileSync('reports/atlas/search/atlas_v17_federated_1000q_parity.json', JSON.stringify(report, null, 2));

  console.log('\n================================================================');
  console.log('🏆 FEDERATED SCALE PARITY BENCHMARK COMPLETE');
  console.log('================================================================');
  console.log(`TOTAL QUERIES EVALUATED   : ${report.TOTAL_BENCHMARK_QUERIES}`);
  console.log(`NON-ZERO HIT QUERIES      : ${report.NON_ZERO_HIT_QUERIES}`);
  console.log(`TOP-10 RESULT SET PARITY  : ${report.PARITY.TOP10_RESULT_SET_PARITY}`);
  console.log(`TOP-10 RANK ORDER PARITY  : ${report.PARITY.TOP10_RANK_ORDER_PARITY}`);
  console.log(`TOP-50 RESULT SET PARITY  : ${report.PARITY.TOP50_RESULT_SET_PARITY}`);
  console.log(`TOP-50 RANK ORDER PARITY  : ${report.PARITY.TOP50_RANK_ORDER_PARITY}`);
  console.log(`FEDERATED P50 LATENCY     : ${report.PERFORMANCE.FEDERATED.QUERY_P50_MS} ms`);
  console.log(`FEDERATED P95 LATENCY     : ${report.PERFORMANCE.FEDERATED.QUERY_P95_MS} ms`);
  console.log(`PARITY VERDICT            : ${report.VERDICT}`);
  console.log('Saved to reports/atlas/search/atlas_v17_federated_1000q_parity.json');
  console.log('================================================================\n');
}

main().catch(err => {
  console.error('Federated parity benchmark failed:', err);
  process.exit(1);
});
