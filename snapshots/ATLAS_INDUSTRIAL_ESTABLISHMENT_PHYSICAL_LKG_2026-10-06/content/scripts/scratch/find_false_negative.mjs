import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import { IdentityInductionField } from '../lib/identity_field.mjs';
import { streamChunkedCandidates } from '../chunked_source_reader.mjs';

dotenv.config();

const FIELD_PATH = 'cache_gate31d/identity_field_perf_1m30.bin';
const SOURCE_FILE = 'cache_gate31d/utlfile/padr/SELE-SAL-CONSTA.p20out1.20260912.tmp';
const START_LINE = 3100000 + 90000;
const LIMIT = 10000;

async function main() {
  const field = IdentityInductionField.loadFromFile(FIELD_PATH);
  const pool = new pg.Pool({ ...parseDbUrl(), max: 1 });
  const client = await pool.connect();

  for await (const batch of streamChunkedCandidates(SOURCE_FILE, { startLine: START_LINE, limit: LIMIT, batchSize: 2000 })) {
    const hmacs = batch.map(c => c.identifier_value);
    const dbRes = await client.query(`
      SELECT identifier_value, source_person_id, created_at, observed_at
      FROM public.atlas_person_identity_map
      WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
      AND identifier_value = ANY($1::text[])
    `, [hmacs]);

    const dbMap = new Map(dbRes.rows.map(r => [r.identifier_value, r]));

    for (const cand of batch) {
      if (dbMap.has(cand.identifier_value)) {
        const payload = {
          source_id: cand.source_id,
          source_person_id: cand.source_person_id,
          identifier_value: cand.identifier_value
        };
        const cls = field.classifyCandidate(payload);
        if (cls.classification === 'DEFINITELY_ABSENT') {
          console.log('FOUND FALSE NEGATIVE CANDIDATE:');
          console.log('Candidate:', cand);
          console.log('DB Row:', dbMap.get(cand.identifier_value));
          console.log('Field Base Watermark:', field.baseWatermark);
        }
      }
    }
  }

  client.release();
  await pool.end();
}

main().catch(console.error);
