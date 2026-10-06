import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { parseDbUrl } from './export_search_projection_v2.mjs';
dotenv.config();

async function check() {
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  try {
    const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
    console.log('PostgreSQL tables:', res.rows.map(r => r.table_name));

    // Check files in reports/atlas/acquisition
    const repDir = path.resolve('reports/atlas/acquisition');
    if (fs.existsSync(repDir)) {
      console.log('Files in reports/atlas/acquisition:', fs.readdirSync(repDir));
    }

  } finally {
    client.release();
    await pool.end();
  }
}

check().catch(console.error);
