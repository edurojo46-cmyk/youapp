import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import { streamChunkedCandidates } from '../chunked_source_reader.mjs';

dotenv.config();

const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();

  for (const line of [2900000, 3000000, 3050000, 3100000, 3200000, 3300000]) {
    let sample = [];
    for await (const b of streamChunkedCandidates(SOURCE_FILE, { startLine: line, limit: 200, batchSize: 200 })) {
      sample = b;
      break;
    }
    const res = await client.query(
      "SELECT count(*) FROM public.atlas_person_identity_map WHERE source_id = 'ARCA_CONDICION_TRIBUTARIA' AND source_person_id = ANY($1)",
      [sample.map(x => x.source_person_id)]
    );
    console.log(`Line ${line}: DB matches out of 200 = ${res.rows[0].count}`);
  }

  client.release();
  await pool.end();
}

main().catch(console.error);
