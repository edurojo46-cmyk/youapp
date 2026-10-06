import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('=== EXACT BASELINE CALCULATION ===\n');

  const cabaGeos = [
    'agronomía', 'almagro', 'balvanera', 'barracas', 'belgrano', 'boedo',
    'Buenos Aires, Argentina', 'caba', 'caba_comuna_6_caballito', 'caballito',
    'chacarita', 'colegiales', 'constitucion', 'constitución', 'flores',
    'floresta', 'geo_caba_capital', 'la_boca', 'liniers', 'mataderos',
    'monserrat', 'montserrat', 'nunez', 'nuñez', 'núñez', 'palermo',
    'parque_patricios', 'recoleta', 'retiro', 'san_nicolas', 'san_nicolás',
    'san_telmo', 'villa_crespo', 'villa_devoto', 'villa_lugano', 'villa_urquiza'
  ];

  let cabaTotal = 0;
  const breakdown = [];

  for (const g of cabaGeos) {
    const res = await c.query('SELECT count(*) FROM atlas_people_discovery_candidates WHERE geography_id = $1', [g]);
    const cnt = parseInt(res.rows[0].count, 10);
    if (cnt > 0) {
      breakdown.push({ geography_id: g, count: cnt });
      cabaTotal += cnt;
    }
  }

  console.log('CABA breakdown by geography_id:');
  console.table(breakdown);
  console.log('Total CABA in discovery_candidates with explicit CABA geography_id:', cabaTotal);

  // Now let's check PBA: are there candidates with PBA sources like SEDICI_UNLP, CIC_PBA, etc.?
  const pbaSources = [
    'OAI_MOTOR_SEDICI_UNLP', 'sedici_unlp', 'sedici_jursoc_shard', 'sedici_economia_shard', 
    'sedici_exactas_shard', 'OAI_MOTOR_CIC_PBA', 'cic_digital_pba', 'OAI_MOTOR_UNSAM_DIGITAL', 
    'unsam_digital_repositorio', 'conicet_la_plata_shard', 'conicet_mdp_shard', 'conicet_bblanca_shard'
  ];

  let pbaTotal = 0;
  const pbaBreakdown = [];
  for (const s of pbaSources) {
    const res = await c.query('SELECT count(*) FROM atlas_people_discovery_candidates WHERE source_id = $1', [s]);
    const cnt = parseInt(res.rows[0].count, 10);
    if (cnt > 0) {
      pbaBreakdown.push({ source_id: s, count: cnt });
      pbaTotal += cnt;
    }
  }
  console.log('\nPBA candidate breakdown:');
  console.table(pbaBreakdown);
  console.log('Total PBA in discovery_candidates:', pbaTotal);

  // Let's also check distinct atlas_person_id in atlas_person_identity_map for CABA/PBA sources
  const cabaSourceRes = await c.query(`
    SELECT count(DISTINCT atlas_person_id) as caba_identities
    FROM atlas_person_identity_map
    WHERE source_id ILIKE '%CABA%' OR source_id ILIKE '%IGJ%' OR source_id ILIKE '%UBA%'
  `);
  console.log('\nUnique CABA people in SSOT (atlas_person_identity_map):', cabaSourceRes.rows[0].caba_identities);

  const pbaSourceRes = await c.query(`
    SELECT count(DISTINCT atlas_person_id) as pba_identities
    FROM atlas_person_identity_map
    WHERE source_id ILIKE '%UNLP%' OR source_id ILIKE '%CIC%' OR source_id ILIKE '%UNSAM%' OR source_id ILIKE '%BBLANCA%' OR source_id ILIKE '%MDP%' OR source_id ILIKE '%LAPLATA%'
  `);
  console.log('Unique PBA people in SSOT (atlas_person_identity_map):', pbaSourceRes.rows[0].pba_identities);

  await c.end();
}

main().catch(console.error);
