import 'dotenv/config';
import { supabaseAdmin as db } from '../src/lib/supabaseAdmin';

async function run() {
  const { data: obs, error } = await db.from('atlas_person_observations').select('id, subject_external_key, source_id, source_url, value_jsonb');
  if (error) { console.error(error); return; }

  for (const o of obs || []) {
      const rawData = o.value_jsonb;
      const raw = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      
      if (raw) {
          const strRaw = JSON.stringify(raw).toLowerCase();
          const hasEmail = strRaw.includes('email') || strRaw.includes('correo') || strRaw.includes('@');
          const hasWeb = strRaw.includes('website') || strRaw.includes('web') || strRaw.includes('http');
          
          if (hasEmail || hasWeb) {
             console.log(`\nSUBJECT_ID: ${o.subject_external_key}`);
             console.log(`SOURCE_ID: ${o.source_id}`);
             console.log(`SOURCE_URL: ${o.source_url}`);
             if (hasEmail) console.log(`HAS_EMAIL: YES`);
             if (hasWeb) console.log(`HAS_WEB: YES`);
             console.log(`DATA: ${JSON.stringify(raw, null, 2)}`);
          }
      }
  }
}
run();