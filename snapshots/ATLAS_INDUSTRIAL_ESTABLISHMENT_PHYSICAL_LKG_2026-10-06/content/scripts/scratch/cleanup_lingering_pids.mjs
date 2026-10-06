import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  const pidsToKill = [4175171, 4176364, 4177034, 4177037, 4177038];
  for (const pid of pidsToKill) {
    try {
      const res = await c.query('SELECT pg_terminate_backend($1)', [pid]);
      console.log(`Terminated pid ${pid}:`, res.rows[0]);
    } catch (e) {
      console.log(`Could not terminate ${pid}:`, e.message);
    }
  }

  await c.end();
}

main().catch(console.error);
