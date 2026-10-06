import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function run() {
  console.log('Applying canonical IGJ identity (DOC first)...');
  let from = 0;
  const step = 1000;
  let updated = 0;

  while (true) {
    const { data, error } = await supabase
      .from('atlas_person_observations')
      .select('id, source_record_id, value_jsonb')
      .eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES')
      .range(from, from + step - 1);

    if (error) {
      console.error('Error fetching observations:', error);
      break;
    }

    if (!data || data.length === 0) {
      break;
    }

    const updates = data.map(obs => {
      const doc = obs.value_jsonb?.raw_payload?.numero_documento;
      let externalKey = obs.source_record_id; // Unresolved fallback
      if (doc && String(doc).trim() !== '') {
        externalKey = `IGJ:DOC:${String(doc).trim()}`;
      }
      return {
        id: obs.id,
        source_id: 'DATOS_ARGENTINA_IGJ_AUTHORITIES',
        source_record_id: obs.source_record_id,
        subject_external_key: externalKey
      };
    });

    for (const update of updates) {
      const { error: updErr } = await supabase
        .from('atlas_person_observations')
        .update({ subject_external_key: update.subject_external_key })
        .eq('id', update.id);
        
      if (updErr) {
        console.error('Error updating observation:', updErr);
      }
    }
    updated += updates.length;
    console.log(`Updated ${updated} observations`);

    if (data.length < step) {
      break;
    }
    from += step;
  }

  console.log('Done.');
}

run();
