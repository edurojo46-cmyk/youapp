import 'dotenv/config';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

function parseDbUrl() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) throw new Error('DATABASE_URL_NOT_FOUND');
  const m = raw.match(/^postgresql:\/\/([^:]+):(.*)@([^:@/]+)(?::(\d+))?\/(.+)$/);
  if (!m) throw new Error('CANNOT_PARSE_DATABASE_URL');
  let pass = m[2];
  if (pass.startsWith('[') && pass.endsWith(']')) pass = pass.slice(1, -1);
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(pass),
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 5432,
    database: m[5].split('?')[0],
    ssl: { rejectUnauthorized: false }
  };
}

async function verifyConnectivity() {
  const status = {
    DATABASE_ACCESS: false,
    SUPABASE_AUTH: false,
    GEMINI_ACCESS: false,
    YOUTUBE_ACCESS: false,
    ATLAS_STARTS: false
  };

  // 1. DATABASE_ACCESS
  try {
    const client = new pg.Client({ ...parseDbUrl() });
    await client.connect();
    const res = await client.query('SELECT 1 as connected;');
    if (res.rows?.[0]?.connected === 1) {
      status.DATABASE_ACCESS = true;
    }
    await client.end();
  } catch (err) {
    console.error('DATABASE_ACCESS failure:', err.message);
  }

  // 2. SUPABASE_AUTH
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseUrl && serviceKey) {
      const sbAdmin = createClient(supabaseUrl, serviceKey);
      const { data, error } = await sbAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (!error && data?.users) {
        status.SUPABASE_AUTH = true;
      } else if (error) {
        console.error('SUPABASE_AUTH admin error:', error.message);
      }
    } else if (supabaseUrl && anonKey) {
      const sbAnon = createClient(supabaseUrl, anonKey);
      const { data, error } = await sbAnon.auth.getSession();
      if (!error) {
        status.SUPABASE_AUTH = true;
      }
    }
  } catch (err) {
    console.error('SUPABASE_AUTH failure:', err.message);
  }

  // 3. GEMINI_ACCESS
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}`);
      if (res.ok) {
        status.GEMINI_ACCESS = true;
      } else {
        const json = await res.json().catch(() => ({}));
        console.error('GEMINI_ACCESS error:', json.error?.message || res.statusText);
      }
    }
  } catch (err) {
    console.error('GEMINI_ACCESS failure:', err.message);
  }

  // 4. YOUTUBE_ACCESS
  try {
    const ytKey = process.env.YOUTUBE_API_KEY || process.env.VITE_YOUTUBE_API_KEY;
    if (ytKey) {
      const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q=atlas&key=${ytKey}`);
      if (res.ok) {
        status.YOUTUBE_ACCESS = true;
      } else {
        const json = await res.json().catch(() => ({}));
        console.error('YOUTUBE_ACCESS error:', json.error?.message || res.statusText);
      }
    }
  } catch (err) {
    console.error('YOUTUBE_ACCESS failure:', err.message);
  }

  // 5. ATLAS_STARTS
  try {
    const res = await fetch('http://localhost:5174/api/commerce/summary', {
      headers: { 'x-user-id': '00000000-0000-0000-0000-000000000000' }
    });
    // Any HTTP response (200, 401, etc.) indicates the Atlas backend is running and actively handling requests
    if (res.status === 200 || res.status === 401 || res.status === 404) {
      status.ATLAS_STARTS = true;
    }
  } catch (err) {
    console.error('ATLAS_STARTS failure:', err.message);
  }

  console.log('\nVERIFICATION_RESULTS:');
  console.log(`DATABASE_ACCESS = ${status.DATABASE_ACCESS ? 'TRUE' : 'FALSE'}`);
  console.log(`SUPABASE_AUTH = ${status.SUPABASE_AUTH ? 'TRUE' : 'FALSE'}`);
  console.log(`GEMINI_ACCESS = ${status.GEMINI_ACCESS ? 'TRUE' : 'FALSE'}`);
  console.log(`YOUTUBE_ACCESS = ${status.YOUTUBE_ACCESS ? 'TRUE' : 'FALSE'}`);
  console.log(`ATLAS_STARTS = ${status.ATLAS_STARTS ? 'TRUE' : 'FALSE'}`);
}

verifyConnectivity();
