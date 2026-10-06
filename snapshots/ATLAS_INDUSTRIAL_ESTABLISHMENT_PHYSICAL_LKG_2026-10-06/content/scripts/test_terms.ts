import { dbPool } from '../server/db.ts';
import { AtlasConceptRegistry } from '../server/services/industrial/AtlasConceptRegistry.ts';

async function testCandidateTerms() {
  const conceptParam = 'SERVICIOS_AUTOMOTORES';
  const rawObjective = 'GARAGE en CABA';

  const conceptLower = conceptParam.toLowerCase();
  const conceptObj = AtlasConceptRegistry.getInstance().getConcept(conceptParam);
  console.log('conceptObj:', conceptObj);

  const candidateTerms = Array.from(new Set([
    conceptLower,
    conceptObj?.concept_id?.toLowerCase(),
    conceptObj?.canonical_name?.toLowerCase(),
    ...(conceptObj?.synonyms || []).map(s => s.toLowerCase()),
    rawObjective?.toLowerCase()
  ].filter(Boolean) as string[])).filter(t => t.length >= 3);

  console.log('candidateTerms:', candidateTerms);

  const termConditions = candidateTerms.map((_, idx) => `
    source_name ILIKE $${idx + 1}
    OR canonical_url ILIKE $${idx + 1}
    OR field_telemetry::text ILIKE $${idx + 1}
  `).join(' OR ');

  const learnedRes = await dbPool.query(`
    SELECT source_id, source_name, source_family, canonical_url, supported_motor_template,
           quality_score, field_telemetry
    FROM public.atlas_source_knowledge_map
    WHERE can_produce_entity_rows = 'TRUE'
      AND current_status IN ('CANARY', 'PROMOTED', 'ACTIVE')
      AND (${termConditions.length > 0 ? termConditions : 'FALSE'});
  `, candidateTerms.map(t => `%${t}%`));

  console.log('Learned sources returned:', learnedRes.rows.length);
  for (const r of learnedRes.rows) {
    console.log(`- ${r.source_id}: ${r.source_name} (${r.source_family})`);
  }

  await dbPool.end();
}

testCandidateTerms().catch(console.error);
