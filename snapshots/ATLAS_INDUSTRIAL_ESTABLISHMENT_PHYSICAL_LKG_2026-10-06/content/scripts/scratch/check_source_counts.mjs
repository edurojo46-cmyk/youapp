import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('=== EXACT CANDIDATES BY SOURCE_ID ===\n');

  const sources = [
    'IGJ_AUTORIDADES_GENERO_2026',
    'CPACF_PADRON_ABOGADOS',
    'CPACF_ABOGACIA_CABA',
    'CPCECABA_PADRON_CONTADORES',
    'CPCECABA_CONTADORES_CABA',
    'CPAU_PADRON_ARQUITECTOS',
    'GCBA_DATOS_ABIERTOS_2026',
    'GCBA_NOMINA_PERSONAL',
    'GCBA_COMUNAS_JUNTAS',
    'LEGISLATURA_CABA',
    'PODER_JUDICIAL_CABA',
    'MAGISTRATURA_CABA',
    'DEFENSORIA_CABA',
    'UBA_DOCENTES_REGISTRO',
    'UBA_ECONOMICAS_REGISTRO',
    'UBA_EXACTAS',
    'UBA_DERECHO',
    'UBA_MEDICINA',
    'WIKIDATA_CABA_PERSONS',
    'WIKIDATA_SPARQL_CABA',
    'OPENALEX_CABA',
    'OPENALEX_ROR_UBA'
  ];

  let totalDirectCaba = 0;
  for (const s of sources) {
    const t0 = performance.now();
    const res = await c.query('SELECT count(*) FROM atlas_people_discovery_candidates WHERE source_id = $1', [s]);
    const cnt = parseInt(res.rows[0].count, 10);
    const ms = performance.now() - t0;
    if (cnt > 0) {
      console.log(`source: ${s.padEnd(30)} -> count: ${cnt.toString().padStart(8)} (${ms.toFixed(1)}ms)`);
      totalDirectCaba += cnt;
    }
  }
  console.log('Total CABA rows across these sources:', totalDirectCaba);

  await c.end();
}

main().catch(console.error);
