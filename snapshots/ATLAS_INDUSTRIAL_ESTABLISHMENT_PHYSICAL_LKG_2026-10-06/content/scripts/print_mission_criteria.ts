import { dbPool } from '../server/db.ts';

async function main() {
  const res = await dbPool.query(`
    SELECT mission_id, objective, entity_type, geography, target_new_records,
           status, terminal_reason,
           criteria
    FROM public.atlas_discovery_missions 
    WHERE mission_id = 'MISS_1791109511369_37055C';
  `);
  const r = res.rows[0];
  console.log('MISSION_ID =', r.mission_id);
  console.log('RAW_OBJECTIVE =', r.objective);
  console.log('RESOLVED_OBJECT =', r.criteria.entity_subtype || r.criteria.normalized_objective);
  console.log('CONCEPT_ID =', r.criteria.concept_id || r.criteria.category || 'UNASSIGNED');
  console.log('TARGET =', r.target_new_records);
  console.log('ROW_UNIT =', r.criteria.row_unit || r.criteria.default_row_unit || r.entity_type);
  console.log('ROLE =', r.criteria.relation_type || 'SERVICE_PROVIDER');
  console.log('ACTION =', r.criteria.search_strategy);
  console.log('RELATION =', r.criteria.relation_direction || r.criteria.relation_type);
  console.log('GEOGRAPHY =', r.geography);
  console.log('RESOLUTION_STATE =', r.criteria.resolution_state);
  console.log('CANONICALIZATION_STATE =', r.criteria.needs_ontology_resolution ? 'NEEDS_RESOLUTION' : 'RESOLVED');
  console.log('EXECUTION_STATE =', r.status);
  console.log('\nFULL CRITERIA:');
  console.log(JSON.stringify(r.criteria, null, 2));
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
