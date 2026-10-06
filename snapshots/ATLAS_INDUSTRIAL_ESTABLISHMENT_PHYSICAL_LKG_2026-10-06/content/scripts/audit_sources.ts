import 'dotenv/config';
import { supabaseAdmin as db } from '../src/lib/supabaseAdmin';

async function run() {
  const { data: obs, error } = await db.from('atlas_person_observations').select('id, value_jsonb, subject_external_key, source_id');
  if (error) { console.error(error); return; }
  
  let emailCount = 0;
  let webCount = 0;
  let photoCount = 0;
  
  let gcbaCount = 0;
  let wikidataCount = 0;
  let githubCount = 0;
  let multiSourceCount = 0;
  
  const subjectSources: Record<string, Set<string>> = {};

  for (const o of obs || []) {
      const rawData = o.value_jsonb;
      const raw = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      
      if (raw) {
          const strRaw = JSON.stringify(raw).toLowerCase();
          if (strRaw.includes('email') || strRaw.includes('correo') || strRaw.includes('@')) emailCount++;
          if (strRaw.includes('website') || strRaw.includes('web') || strRaw.includes('http')) webCount++;
          if (strRaw.includes('photo') || strRaw.includes('image') || strRaw.includes('avatar') || strRaw.includes('foto') || strRaw.includes('picture')) photoCount++;
      }
      
      if (o.subject_external_key) {
         if (!subjectSources[o.subject_external_key]) subjectSources[o.subject_external_key] = new Set();
         subjectSources[o.subject_external_key].add(o.source_id);
      }
  }
  
  for (const [subjectId, sources] of Object.entries(subjectSources)) {
      if (sources.size > 1) multiSourceCount++;
      if (sources.has('GCBA_DIRECTORIO') || sources.has('GCBA') || [...sources].some(s => s.includes('GCBA'))) gcbaCount++;
      if (sources.has('WIKIDATA') || [...sources].some(s => s.includes('WIKIDATA'))) wikidataCount++;
      if (sources.has('GITHUB') || [...sources].some(s => s.includes('GITHUB'))) githubCount++;
  }

  console.log(`GCBA_SUBJECTS = ${gcbaCount}`);
  console.log(`WIKIDATA_SUBJECTS = ${wikidataCount}`);
  console.log(`GITHUB_SUBJECTS = ${githubCount}`);
  console.log(`MULTI_SOURCE_SUBJECTS = ${multiSourceCount}`);
  console.log(`SOURCE_EMAIL_FIELDS = ${emailCount}`);
  console.log(`SOURCE_WEB_FIELDS = ${webCount}`);
  console.log(`SOURCE_PHOTO_FIELDS = ${photoCount}`);
}
run();
