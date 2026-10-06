import { dbPool } from '../server/db.ts';

async function main() {
  const res = await dbPool.query(`
    SELECT mission_id, objective, entity_type, geography, target_new_records,
           status, terminal_reason,
           semantic_spec->>'resolution_state' as resolution_state,
           semantic_spec->>'compiler_ir_id' as compiler_ir_id,
           semantic_spec->>'relation_type' as relation_type,
           semantic_spec->>'entity_subtype' as entity_subtype,
           semantic_spec->>'category' as category,
           semantic_spec->'required_evidence' as required_evidence,
           semantic_spec->'candidate_concepts' as candidate_concepts
    FROM public.atlas_discovery_missions 
    WHERE mission_id LIKE '%37055C%' OR mission_id LIKE '%37055c%'
    LIMIT 1;
  `);
  console.log(JSON.stringify(res.rows[0], null, 2));
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
