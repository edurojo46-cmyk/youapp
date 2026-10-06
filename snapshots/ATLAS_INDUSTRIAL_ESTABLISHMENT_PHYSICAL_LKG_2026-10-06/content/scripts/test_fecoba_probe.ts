import dotenv from 'dotenv';
dotenv.config();
import https from 'https';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

const agent = new https.Agent({ rejectUnauthorized: false });

async function checkFecoba() {
  console.log('Fetching https://fecoba.org.ar/autoridades/...');
  const res = await fetch('https://fecoba.org.ar/autoridades/', { agent } as any);
  console.log('Status:', res.status);
  const html = await res.text();
  console.log('HTML Length:', html.length);

  // Extract names and cargos
  const lines = html.split('\n').filter(l => l.includes('Presidente') || l.includes('Vicepresidente') || l.includes('Secretari') || l.includes('Vocal'));
  console.log('Authority lines found:', lines.length);
  for (const l of lines.slice(0, 10)) {
    console.log(' *', l.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  }

  const { count } = await supabase.from('atlas_people_discovery_candidates').select('*', { count: 'exact', head: true }).eq('source_id', 'FECOBA_AUTORIDADES');
  console.log('Existing in Discovery from FECOBA_AUTORIDADES:', count);
}

checkFecoba().catch(console.error);
