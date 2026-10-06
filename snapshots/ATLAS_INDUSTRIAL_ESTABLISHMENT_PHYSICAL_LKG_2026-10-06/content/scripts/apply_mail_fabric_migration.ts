import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function testConnection(port: number, user: string, host: string) {
  const password = process.env.DATABASE_PASSWORD || '';
  if (!password) throw new Error("DATABASE_PASSWORD must be provided in environment variables");
  const connStr = `postgresql://${user}:${password}@${host}:${port}/postgres`;
  const c = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await c.connect();
    console.log(`SUCCESS: Connected on host ${host}:${port} with user ${user}`);
    return c;
  } catch (err: any) {
    console.log(`FAIL on ${host}:${port} (${user}): ${err.message}`);
    return null;
  }
}

async function main() {
  const hosts = [
    'aws-0-ca-central-1.pooler.supabase.com',
    'db.jtnurafmngaxdwlzpvxv.supabase.co'
  ];
  const users = [
    'postgres.jtnurafmngaxdwlzpvxv',
    'postgres'
  ];
  const ports = [6543, 5432];

  let client: Client | null = null;
  for (const host of hosts) {
    for (const user of users) {
      for (const port of ports) {
        client = await testConnection(port, user, host);
        if (client) break;
      }
      if (client) break;
    }
    if (client) break;
  }

  if (!client) {
    console.error("Could not establish PostgreSQL connection with any candidate config.");
    process.exit(1);
  }

  const migrationFile = path.resolve(process.cwd(), 'supabase/migrations/20260909080000_atlas_mail_fabric_v1.sql');
  const sql = fs.readFileSync(migrationFile, 'utf-8');
  console.log("Applying 20260909080000_atlas_mail_fabric_v1.sql...");
  
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('COMMIT');
    console.log("SUCCESS: Migration 20260909080000_atlas_mail_fabric_v1.sql applied!");
  } catch (e: any) {
    await client.query('ROLLBACK');
    console.error("FAILED to apply migration:", e.message);
    throw e;
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
