import { supabase } from '../src/lib/supabase';
import annotations from '../src/lib/search/asset_semantic_annotations.json';

async function main() {
  console.log(`Inserting ${annotations.length} semantic repairs into Supabase...`);

  for (const ann of annotations) {
    // only VERIFIED are present in the JSON anyway
    const record = {
      id: ann.id,
      asset_id: ann.asset_id,
      semantic_entity_id: ann.semantic_entity_id,
      semantic_work_id: ann.semantic_work_id,
      semantic_venue_id: ann.semantic_venue_id,
      content_type: ann.content_type,
      performance_mode: ann.performance_mode,
      content_role: ann.content_role,
      overall_confidence: ann.overall_confidence,
      evidence: ann.evidence,
      status: ann.status,
      semantic_version: ann.semantic_version
    };

    const { error } = await supabase.from('asset_semantic_annotations').upsert(record);
    if (error) {
      console.error(`Error inserting ${ann.id}:`, error);
    } else {
      console.log(`Successfully inserted annotation for asset ${ann.asset_id}`);
    }
  }
}

main().catch(console.error);
