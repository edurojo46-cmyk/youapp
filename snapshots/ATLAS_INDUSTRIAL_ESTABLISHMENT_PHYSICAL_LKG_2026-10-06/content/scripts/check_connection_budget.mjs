import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  const maxConn = await client.query('SHOW max_connections');
  console.log('PostgreSQL max_connections:', maxConn.rows[0].max_connections);

  const conns = await client.query(`
    SELECT count(*) as total_conns,
           count(*) FILTER (WHERE state = 'active') as active,
           count(*) FILTER (WHERE state = 'idle') as idle,
           count(*) FILTER (WHERE wait_event IS NOT NULL) as waiting
    FROM pg_stat_activity
  `);
  console.log('Current pg_stat_activity:', conns.rows[0]);

  await client.end();
}

main().catch(console.error);
