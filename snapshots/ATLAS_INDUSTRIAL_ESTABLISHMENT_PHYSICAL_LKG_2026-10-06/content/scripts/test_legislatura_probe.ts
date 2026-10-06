import dotenv from 'dotenv';
dotenv.config();
import https from 'https';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

const agent = new https.Agent({ rejectUnauthorized: false });

async function checkLegislatura() {
  console.log('Fetching https://www.legislatura.gob.ar/legisladores...');
  const res = await fetch('https://www.legislatura.gob.ar/legisladores', { agent } as any);
  console.log('Status:', res.status);
  const html = await res.text();
  console.log('HTML Length:', html.length);

  // Match legislator names
  // In Legislatura CABA, legislators are listed in card blocks or table
  const cardMatches = html.match(/class="[^"]*nombre[^"]*"[^>]*>([^<]+)</gi) || html.match(/<h3>([^<]+)<\/h3>/gi) || [];
  console.log('Legislator card matches found:', cardMatches.length);
  const sample = cardMatches.slice(0, 10).map(m => m.replace(/<[^>]+>/g, '').trim());
  console.log('Sample names found:', sample);

  // Check overlap against discovery candidates
  const { count } = await supabase.from('atlas_people_discovery_candidates').select('*', { count: 'exact', head: true }).eq('source_id', 'LEGISLATURA_CABA');
  console.log('Existing in Discovery from LEGISLATURA_CABA:', count);
}

checkLegislatura().catch(console.error);
