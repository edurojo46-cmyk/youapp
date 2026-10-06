import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const dbConfig = parseDbUrl();
const client = new pg.Client(dbConfig);
await client.connect();

const sampleKeys = Array.from({ length: 1000 }, (_, i) => `nonexistent_rec_${i}`);

const t0 = performance.now();
const res = await client.query(`
  SELECT source_person_id FROM public.atlas_person_identity_map 
  WHERE source_id = 'src_arca_datos_abiertos' AND source_person_id = ANY($1)
`, [sampleKeys]);
const elapsed = performance.now() - t0;
console.log('Batch 1000 index lookup elapsed:', elapsed.toFixed(2), 'ms', 'Matches:', res.rowCount);
await client.end();
