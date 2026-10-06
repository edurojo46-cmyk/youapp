import pg from 'pg';
import fs from 'fs';
const { Client } = pg;

const env = fs.readFileSync('.env', 'utf8');
let dbUrl = '';
for (const l of env.split('\n')) {
  if (l.startsWith('DATABASE_URL=')) dbUrl = l.split('=').slice(1).join('=').trim().replace(/['"]/g, '');
}

async function run() {
  const dbClient = new Client({ connectionString: dbUrl });
  await dbClient.connect();
  const res = await dbClient.query(`SELECT count(distinct discovery_id) as c1, count(*) as c2 FROM public.atlas_people_discovery_candidates`);
  console.log(res.rows[0]);
  await dbClient.end();
}
run();
