import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function check(dbName) {
  const dbConfig = parseDbUrl();
  const client = new pg.Client({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: 5432,
    database: dbName,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await client.connect();
    console.log('Connected to ' + dbName);
    const res = await client.query("SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_schema, table_name");
    for (const r of res.rows) {
      try {
        const c = await client.query('SELECT count(*) FROM "' + r.table_schema + '"."' + r.table_name + '"');
        console.log('  ' + r.table_schema + '.' + r.table_name + ': ' + c.rows[0].count);
      } catch (e) {
        console.log('  ' + r.table_schema + '.' + r.table_name + ': error ' + e.message);
      }
    }
    await client.end();
  } catch (err) {
    console.log('Error connecting to ' + dbName + ': ' + err.message);
  }
}

await check('postgres');
await check('atlas_shadow_cold_gate');
