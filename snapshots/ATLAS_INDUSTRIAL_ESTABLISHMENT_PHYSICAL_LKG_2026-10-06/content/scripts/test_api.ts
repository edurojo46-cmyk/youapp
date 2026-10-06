import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function run() {
  const { data: authData, error: authError } = await sb.auth.signInWithPassword({
    email: 'admin@youapp.ai',
    password: 'password123'
  });
  
  if (authError || !authData.session) {
      console.log('Login failed:', authError);
      return;
  }
  
  const token = authData.session.access_token;
  const fetch = (await import('node-fetch')).default;
  
  const res = await fetch('http://localhost:5174/api/federated-search', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
          name: 'programador en Buenos Aires',
          mode: 'ALL_SOURCES'
      })
  });
  
  const json = await res.json();
  console.log('API Status:', res.status);
  console.log('Stats:', json.stats);
  console.log('First confirmed match:', json.confirmed_matches?.[0]?.display_name);
}
run();
