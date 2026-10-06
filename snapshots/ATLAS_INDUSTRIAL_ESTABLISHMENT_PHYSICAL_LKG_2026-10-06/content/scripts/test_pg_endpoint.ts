import 'dotenv/config';

async function testPgEndpoint() {
  const url = process.env.VITE_SUPABASE_URL!;
  const key = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)!;

  const testSql = `SELECT 1 as val;`;
  const resp = await fetch(`${url}/pg`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'Content-Type': 'text/plain',
    },
    body: testSql
  });
  console.log('Status:', resp.status, resp.statusText);
  const text = await resp.text();
  console.log('Response:', text);
}

testPgEndpoint().catch(console.error);
