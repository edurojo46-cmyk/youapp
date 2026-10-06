import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('=== AUDITING CABA / PBA SOURCES BREAKDOWN IN CANDIDATES ===\n');

  // Let's count top sources in candidates
  const sources = [
    'IGJ_AUTORIDADES_GENERO_2026', 'CONICET_OAI_PMH', 'CPACF_PADRON_ABOGADOS',
    'CPCECABA_PADRON_CONTADORES', 'GCBA_NOMINA_PERSONAL', 'GCBA_DATOS_ABIERTOS_2026',
    'CPAU_PADRON_ARQUITECTOS', 'UBA_DOCENTES_REGISTRO', 'OPENALEX_CABA', 'OPENALEX_ROR_UBA'
  ];

  for (const s of sources) {
    const res = await c.query('SELECT count(*) FROM atlas_people_discovery_candidates WHERE source_id = $1', [s]);
    console.log(`Source ${s}: ${parseInt(res.rows[0].count, 10).toLocaleString()} candidates`);
  }

  // Check if any candidates have organization or text mentioning La Plata, Quilmes, San Martín, etc.
  console.log('\n--- Checking PBA mentions in organization ---');
  const pbaOrgRes = await c.query(`
    SELECT count(*) 
    FROM atlas_people_discovery_candidates 
    WHERE organization ILIKE '%La Plata%' 
       OR organization ILIKE '%Mar del Plata%' 
       OR organization ILIKE '%Bahia Blanca%' 
       OR organization ILIKE '%Bahía Blanca%' 
       OR organization ILIKE '%Quilmes%' 
       OR organization ILIKE '%San Martin%' 
       OR organization ILIKE '%San Martín%' 
       OR organization ILIKE '%Buenos Aires Provincia%' 
       OR organization ILIKE '%PBA%'
  `);
  console.log(`Candidates with PBA mentions in organization: ${parseInt(pbaOrgRes.rows[0].count, 10).toLocaleString()}`);

  await c.end();
}

main().catch(console.error);
