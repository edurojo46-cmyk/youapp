import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const dbConfig = parseDbUrl();

async function inspect(dbName) {
  const client = new pg.Client({
    user: 'postgres',
    password: dbConfig.password,
    host: 'db.jtnurafmngaxdwlzpvxv.supabase.co',
    port: 5432,
    database: dbName,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  const res = await client.query(`
    SELECT 
      current_database() as db,
      inet_server_addr() as srv_ip,
      inet_server_port() as srv_port,
      pg_postmaster_start_time() as postmaster_start,
      current_setting('data_directory') as data_dir,
      current_setting('shared_buffers') as shared_buffers,
      current_setting('max_connections') as max_conn
  `);
  await client.end();
  return res.rows[0];
}

const prod = await inspect('postgres');
const shadow = await inspect('atlas_shadow_cold_gate');

console.log('PRODUCTION:', prod);
console.log('SHADOW:', shadow);

const sameInstance = prod.postmaster_start.toISOString() === shadow.postmaster_start.toISOString() && prod.data_dir === shadow.data_dir;
console.log('SAME_POSTGRES_INSTANCE =', sameInstance);
