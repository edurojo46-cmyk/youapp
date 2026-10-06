import 'dotenv/config';
import { supabaseAdmin as db } from '../src/lib/supabaseAdmin';

async function run() {
  const { data: rows, error } = await db.from('atlas_argentina_people_search_projection_v1').select('subject_id, person_category, profession_status, source_id, normalized_profession_id');
  if (error) { console.error(error); return; }

  let total = 0;
  let publicEmployee = 0;
  let knownProfession = 0;
  let unknownProfession = 0;
  let unprocessedProfession = 0;
  
  let gcbaProvenance = 0;
  let wikiProvenance = 0;
  let gitProvenance = 0;
  
  for (const r of rows || []) {
      total++;
      if (r.person_category === 'PUBLIC_EMPLOYEE') publicEmployee++;
      if (r.profession_status === 'KNOWN') knownProfession++;
      if (r.profession_status === 'UNKNOWN') unknownProfession++;
      if (r.profession_status === 'UNPROCESSED') unprocessedProfession++;
      
      if (r.source_id === 'gcba_open_data_funcionarios') gcbaProvenance++;
      if (r.source_id === 'WIKIDATA') wikiProvenance++;
      if (r.source_id === 'GITHUB') gitProvenance++;
  }
  
  console.log(`ACTUAL_TOTAL_SUBJECTS = ${total}`);
  console.log(`PUBLIC_EMPLOYEE = ${publicEmployee}`);
  console.log(`KNOWN_PROFESSION = ${knownProfession}`);
  console.log(`UNKNOWN_PROFESSION = ${unknownProfession}`);
  console.log(`UNPROCESSED_PROFESSION = ${unprocessedProfession}`);
  console.log(`GCBA_PROVENANCE_SUBJECTS = ${gcbaProvenance}`);
  console.log(`WIKIDATA_PROVENANCE_SUBJECTS = ${wikiProvenance}`);
  console.log(`GITHUB_PROVENANCE_SUBJECTS = ${gitProvenance}`);
}

run();