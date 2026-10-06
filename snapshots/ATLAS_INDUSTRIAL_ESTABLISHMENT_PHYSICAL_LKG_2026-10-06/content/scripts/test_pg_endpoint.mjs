import dotenv from 'dotenv';
dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY;

console.log('Testing /pg endpoint with url:', url);
const resp = await fetch(`${url}/pg`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${key}`,
    'apikey': key,
    'Content-Type': 'text/plain',
  },
  body: 'SELECT 1 as test;'
});

console.log('/pg status:', resp.status, await resp.text());
