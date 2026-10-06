import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const client = new pg.Client(parseDbUrl());
await client.connect();

const rKeys = await client.query('SELECT count(*) as count FROM atlas_ingest_v2_shadow.atlas_identity_keys_v2;');
console.log('atlas_identity_keys_v2 count:', rKeys.rows[0].count);

const rCanon = await client.query('SELECT count(*) as count FROM atlas_ingest_v2_shadow.atlas_canonical_persons_v2;');
console.log('atlas_canonical_persons_v2 count:', rCanon.rows[0].count);

await client.end();
