import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const dbPool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const pgClient = await dbPool.connect();

  const schema = await pgClient.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'atlas_search_outbox';");
  console.log(JSON.stringify(schema.rows, null, 2));

  pgClient.release();
  await dbPool.end();
}

main().catch(console.error);
