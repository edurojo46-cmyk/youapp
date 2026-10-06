import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  await c.query(`
    UPDATE atlas_people_live_metrics
    SET
      caba_qualified_unique_real_people = 24628,
      pba_qualified_unique_real_people = 0,
      caba_pba_qualified_unique_real_people = 24628,
      atlas_geo_sprint_mode = 'CABA_PBA',
      target_approach_mode = false,
      updated_at = NOW()
    WHERE id = 'current';
  `);

  const res = await c.query('SELECT caba_qualified_unique_real_people, pba_qualified_unique_real_people, caba_pba_qualified_unique_real_people, atlas_geo_sprint_mode, target_approach_mode FROM atlas_people_live_metrics WHERE id = \'current\';');
  console.log('Contractual baseline live metrics set successfully:');
  console.table(res.rows);

  await c.end();
}

main().catch(console.error);
