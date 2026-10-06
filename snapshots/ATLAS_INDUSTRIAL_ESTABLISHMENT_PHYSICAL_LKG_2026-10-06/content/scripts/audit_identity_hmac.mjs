import fs from 'fs';
import crypto from 'crypto';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import pg from 'pg';
const { Client } = pg;

// Read HMAC secret from .env
const env = fs.readFileSync('.env', 'utf8');
let hmacSecret = '';
for (const line of env.split('\n')) {
  if (line.startsWith('ATLAS_IGJ_IDENTITY_HMAC_KEY=')) {
    hmacSecret = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
}
console.log('Found HMAC secret:', hmacSecret ? 'YES (length ' + hmacSecret.length + ')' : 'NO');

async function check() {
  const c = new Client(parseDbUrl());
  await c.connect();

  const countRes = await c.query(`
    SELECT 
      COUNT(DISTINCT atlas_person_id) as total_distinct,
      COUNT(DISTINCT CASE WHEN atlas_person_id LIKE 'atlas_arg_per_%' THEN atlas_person_id END) as national_id_hmac_distinct,
      COUNT(DISTINCT CASE WHEN source_id = 'IGJ_AUTORIDADES_GENERO_2026' THEN atlas_person_id END) as igj_distinct,
      COUNT(DISTINCT CASE WHEN source_id = 'BIEP_APN' THEN atlas_person_id END) as biep_distinct
    FROM public.atlas_person_identity_map;
  `);
  console.log('Identity map breakdown:', countRes.rows[0]);

  // Sample national_id_hmac records
  const sample = await c.query(`
    SELECT source_id, atlas_person_id, identifier_type, identifier_value
    FROM public.atlas_person_identity_map
    WHERE identifier_type = 'NATIONAL_IDENTITY_HMAC'
    LIMIT 3;
  `);
  console.log('Sample HMAC records:', sample.rows);

  await c.end();
}

check().catch(console.error);
