import 'dotenv/config';
import pg from 'pg';

function parseDbUrl() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  const m = raw.match(/^postgresql:\/\/([^:]+):(.*)@([^:@/]+)(?::(\d+))?\/(.+)$/);
  if (!m) throw new Error('CANNOT_PARSE');
  let pass = m[2];
  if (pass.startsWith('[') && pass.endsWith(']')) {
    pass = pass.slice(1, -1);
  }
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(pass),
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 5432,
    database: m[5].split('?')[0],
    ssl: { rejectUnauthorized: false }
  };
}

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  const act = await client.query(`
    SELECT pid, state, wait_event_type, wait_event, query 
    FROM pg_stat_activity 
    WHERE state = 'active' AND pid != pg_backend_pid();
  `);
  console.log('Active queries:', act.rows);
  client.release();
  await pool.end();
}

main().catch(console.error);
