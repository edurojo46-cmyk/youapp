import dotenv from 'dotenv';
dotenv.config();

async function testQuery() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const projectRef = 'jtnurafmngaxdwlzpvxv';
  
  // Try calling Supabase management API
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: 'SELECT 1;' })
  });
  console.log('Status:', res.status, res.statusText);
  const text = await res.text();
  console.log('Response:', text);
}

testQuery();
