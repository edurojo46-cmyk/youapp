import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  const res = await c.query(`
    SELECT geography_id, name, normalized_name, georef_id
    FROM atlas_geographies
    WHERE (province_code = '06' OR georef_id LIKE '06%') AND geography_type = 'PARTIDO'
    ORDER BY name;
  `);

  fs.writeFileSync('reports/atlas/realtime/pba_partidos_ssot.json', JSON.stringify(res.rows, null, 2));
  console.log(`Saved ${res.rows.length} PBA partidos from atlas_geographies.`);
  await c.end();
}

main().catch(console.error);
