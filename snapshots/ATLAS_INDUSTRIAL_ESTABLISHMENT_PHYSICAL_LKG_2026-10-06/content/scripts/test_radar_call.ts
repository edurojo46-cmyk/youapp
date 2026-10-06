import { dbPool } from '../server/db.ts';
import { AtlasAISourceRadar } from '../server/services/industrial/AtlasAISourceRadar.ts';
import { AtlasConceptRegistry } from '../server/services/industrial/AtlasConceptRegistry.ts';

async function testRadarCall() {
  const radar = AtlasAISourceRadar.getInstance(dbPool);
  
  // From mission criteria
  const mRes = await dbPool.query(`
    SELECT mission_id, objective, criteria
    FROM public.atlas_discovery_missions
    WHERE objective ILIKE '%GARAGE%'
    ORDER BY created_at DESC LIMIT 1;
  `);
  const m = mRes.rows[0];
  const semSpec = m.criteria?.universal_spec || m.criteria;

  console.log('Mission:', m.mission_id, m.objective);
  console.log('semSpec.category:', semSpec?.category);
  console.log('semSpec.object:', semSpec?.object);
  console.log('semSpec.raw_objective:', semSpec?.raw_objective);

  const conceptParam = semSpec?.category || semSpec?.object || m.objective;
  console.log('Passed concept:', conceptParam);

  const res = await radar.generateSourceHypotheses({
    raw_objective: m.objective,
    concept: conceptParam,
    geography: 'ARG_CABA',
    row_unit: semSpec?.row_unit || 'ESTABLISHMENT',
    sources_tried: ['SRC_OSM_PUBLIC_ESTABLISHMENTS'],
    objective_gap: 1000
  });

  console.log('Radar result:');
  console.log('Triggered:', res.triggered);
  console.log('Gemini called:', res.gemini_called);
  console.log('Reused previous:', res.reused_previous_intelligence);
  console.log('Trigger reason:', res.trigger_reason);
  console.log('Hypotheses count:', res.hypotheses?.length);
  for (const h of res.hypotheses || []) {
    console.log(`- ${h.source_name} (${h.source_family}) -> url: ${h.possible_public_url}, conn: ${h.connector_family}`);
  }

  await dbPool.end();
}

testRadarCall().catch(e => { console.error(e); process.exit(1); });
