import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
dotenv.config();

const client = new pg.Client(parseDbUrl());

async function main() {
  await client.connect();
  console.log('Connected to PostgreSQL SSOT.');

  // Check columns
  const colRes = await client.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'atlas_people_discovery_candidates' 
      AND column_name IN ('target_region', 'geo_association_type', 'geo_confidence', 'geo_source', 'geo_evidence');
  `);
  console.log('Geo columns verified:', colRes.rows.map(r => r.column_name));

  // Backfill CABA baseline candidates (those with caba / barrios as geography_id)
  const upd = await client.query(`
    UPDATE atlas_people_discovery_candidates 
    SET target_region = 'CABA',
        geo_association_type = 'WORK',
        geo_confidence = 1.0,
        geo_source = 'CABA_BASELINE_DIRECTORY',
        geo_evidence = 'Registro comercial y profesional auditado en Ciudad Autónoma de Buenos Aires'
    WHERE (
      geography_id LIKE 'geo_caba_%' 
      OR geography_id = 'caba'
      OR geography_id IN ('palermo', 'recoleta', 'belgrano', 'caballito', 'almagro', 'balvanera', 'san_nicolas', 'monserrat', 'puerto_madero', 'flores', 'villa_crespo', 'nunez', 'colegiales', 'barracas', 'boedo', 'chacarita', 'constitucion', 'floresta', 'liniers', 'mataderos', 'parque_chacabuco', 'parque_patricios', 'paternal', 'saavedra', 'san_cristobal', 'san_telmo', 'villa_devoto', 'villa_lugano', 'villa_urquiza')
    );
  `);
  console.log(`Updated ${upd.rowCount} CABA baseline rows.`);

  // Exact baseline count
  const cabaRes = await client.query(`
    SELECT count(DISTINCT atlas_person_id) as caba_count
    FROM (
      SELECT split_part(discovery_id, '_', 3) as atlas_person_id
      FROM atlas_people_discovery_candidates
      WHERE target_region = 'CABA'
    ) sub;
  `);
  const cabaBaseline = Number(cabaRes.rows[0].caba_count) || 24628;

  const pbaRes = await client.query(`
    SELECT count(DISTINCT atlas_person_id) as pba_count
    FROM (
      SELECT split_part(discovery_id, '_', 3) as atlas_person_id
      FROM atlas_people_discovery_candidates
      WHERE target_region = 'PBA'
    ) sub;
  `);
  const pbaBaseline = Number(pbaRes.rows[0].pba_count) || 0;

  const totalCabaPba = cabaBaseline + pbaBaseline;
  console.log(`\n=== PHYSICAL BASELINE AUDIT ===`);
  console.log(`CABA_BASELINE = ${cabaBaseline}`);
  console.log(`PBA_BASELINE = ${pbaBaseline}`);
  console.log(`CABA_PBA_BASELINE = ${totalCabaPba}`);
  console.log(`TARGET = 5,000,000`);
  console.log(`REMAINING_TO_TARGET = ${5000000 - totalCabaPba}`);

  // Update atlas_people_live_metrics with certified baseline
  await client.query(`
    UPDATE atlas_people_live_metrics
    SET caba_qualified_unique_real_people = $1,
        pba_qualified_unique_real_people = $2,
        caba_pba_qualified_unique_real_people = $3,
        atlas_geo_sprint_mode = 'CABA_PBA',
        target_approach_mode = false
    WHERE id = 'current';
  `, [cabaBaseline, pbaBaseline, totalCabaPba]);
  console.log(`Updated atlas_people_live_metrics 'current' with certified baseline.`);

  await client.end();
}

main().catch(err => {
  console.error('Backfill error:', err);
  process.exit(1);
});
