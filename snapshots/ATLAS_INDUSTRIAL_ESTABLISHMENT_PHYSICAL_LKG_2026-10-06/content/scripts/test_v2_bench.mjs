import { performance } from 'perf_hooks';
import pg from 'pg';
import { Readable } from 'stream';
import { from as copyFrom } from 'pg-copy-streams';
import crypto from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

import { parseDbUrl } from './export_search_projection_v2.mjs';

function formatCsvCell(val) {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/[\r\n\t]/g, ' ').replace(/"/g, '""');
  return `"${str}"`;
}

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

async function testOneBatch() {
  const client = await pool.connect();
  const batchId = `test_bench_${Date.now()}`;
  const t0 = performance.now();

  let csv = '';
  for (let i = 0; i < 1000; i++) {
    const seq = 100000 + i;
    const isCaba = i % 2 === 0;
    const hmacHex = crypto.createHmac('sha256', 'secret').update(`test_bench_rec_${seq}`).digest().subarray(0, 16).toString('hex');
    csv += [
      formatCsvCell(batchId),
      seq,
      `\\x${hmacHex}`,
      'src_test_v2',
      `rec_${seq}`,
      `Persona Bench ${seq}`,
      'Test Org',
      'Funcionario',
      'Funcionario',
      isCaba ? 'CABA' : 'PBA',
      `Evidencia ${seq}`,
      'QUALIFIED',
      'ACTIVE'
    ].join('\t') + '\n';
  }

  const copySql = `
    COPY atlas_ingest_v2_shadow.staging_incoming_records (
      batch_id, batch_seq, identity_hash, source_id, source_record_key,
      display_name, organization, role, profession, geography_id,
      location_evidence, qualification_state, activity_state
    ) FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', QUOTE '"', ESCAPE '"', NULL '');
  `;

  const stream = client.query(copyFrom(copySql));
  const readable = new Readable({
    read() {
      this.push(Buffer.from(csv, 'utf8'));
      this.push(null);
    }
  });

  await new Promise((res, rej) => {
    readable.pipe(stream);
    stream.on('finish', res);
    stream.on('error', rej);
  });

  const tCopy = performance.now();
  const commitRes = await client.query('SELECT * FROM atlas_ingest_v2_shadow.commit_staged_batch_v2($1)', [batchId]);
  const tEnd = performance.now();

  console.log('Result:', commitRes.rows[0]);
  console.log('Copy ms:', (tCopy - t0).toFixed(1), '| Commit ms:', (tEnd - tCopy).toFixed(1), '| Total ms:', (tEnd - t0).toFixed(1));
  console.log('Rate:', (1000 / ((tEnd - t0) / 1000)).toFixed(2), 'rows/s');

  client.release();
  await pool.end();
}

testOneBatch().catch(console.error);
