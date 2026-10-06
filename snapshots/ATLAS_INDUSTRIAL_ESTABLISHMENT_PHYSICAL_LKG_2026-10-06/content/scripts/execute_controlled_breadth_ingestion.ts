import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';
import { AtlasSemanticKnowledgeService } from '../src/lib/atlasSemantic/AtlasSemanticKnowledgeService';
import { AtlasCanonicalEntityService } from '../src/lib/atlasSemantic/AtlasCanonicalEntityService';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function controlledIngest() {
  console.log('===========================================================');
  console.log('PHASE 15: CONTROLLED REAL KNOWLEDGE INGESTION EXECUTION');
  console.log('===========================================================\n');

  const semService = new AtlasSemanticKnowledgeService(supabase);
  const canService = new AtlasCanonicalEntityService(supabase);

  // Target tenant: Rossi Capital / Valeria Rossi / Carlos Gomez tenant
  const tenantA = 'e518772b-e9cf-4048-a4a0-40d37c1588de';

  // 1. Fetch Canonical Entities in Tenant A
  const { data: entitiesA } = await supabase.from('atlas_canonical_entities').select('*').eq('tenant_id', tenantA);
  const rossiCapital = entitiesA?.find(e => e.canonical_name === 'Rossi Capital');
  const carlosGomez = entitiesA?.find(e => e.canonical_name === 'Carlos Gomez');
  const valeriaRossi = entitiesA?.find(e => e.canonical_name === 'Valeria Rossi');
  const cordobaLoc = entitiesA?.find(e => e.canonical_name === 'Cordoba');
  const baLoc = entitiesA?.find(e => e.canonical_name === 'Buenos Aires');

  if (!rossiCapital || !carlosGomez || !valeriaRossi) {
    throw new Error(`Entities not found in tenant ${tenantA}`);
  }

  console.log(`Found canonical entities in tenant ${tenantA}:`);
  console.log(`- Rossi Capital: ${rossiCapital.canonical_entity_id}`);
  console.log(`- Carlos Gomez: ${carlosGomez.canonical_entity_id}`);
  console.log(`- Valeria Rossi: ${valeriaRossi.canonical_entity_id}`);

  // 2. Fetch or Create Product Canonical Entities in Tenant A
  const prod1Obs = await canService.resolveEntityCandidate(
    {
      source_name: 'atlas_products',
      source_record_id: 'prod-tango-vip-a',
      source_entity_key: 'product:tango_vip',
      entity_type: 'PRODUCT',
      raw_name: 'VIP Tango Portfolio',
      raw_attributes: { category: 'TANGO', source: 'atlas_products' }
    },
    tenantA
  );

  const prod2Obs = await canService.resolveEntityCandidate(
    {
      source_name: 'atlas_products',
      source_record_id: 'prod-tango-show-a',
      source_entity_key: 'product:tango_show',
      entity_type: 'PRODUCT',
      raw_name: 'Tango Event Production',
      raw_attributes: { category: 'EVENT', source: 'atlas_products' }
    },
    tenantA
  );

  if (!prod1Obs.canonical_entity_id || !prod2Obs.canonical_entity_id) {
    throw new Error('Failed to resolve product entity IDs');
  }

  console.log(`Product Entities resolved: Prod1=${prod1Obs.canonical_entity_id}, Prod2=${prod2Obs.canonical_entity_id}`);

  // 3. Ingest OFFERS relationships for Rossi Capital -> Prod1, Prod2
  console.log('\n--- Ingesting OFFERS relationships ---');
  const relOffers1 = await semService.assertRelationship(
    {
      subject_entity_id: rossiCapital.canonical_entity_id,
      predicate_code: 'OFFERS',
      object_entity_id: prod1Obs.canonical_entity_id,
      knowledge_type: 'CLAIM',
      confidence: 0.90,
      evidence_sources: [
        {
          source_type: 'CATALOG_REGISTRY',
          source_id: 'atlas_products:prod-tango-vip-a',
          confidence: 0.90,
          observation_id: prod1Obs.observation_id
        }
      ]
    },
    tenantA
  );

  const relOffers2 = await semService.assertRelationship(
    {
      subject_entity_id: rossiCapital.canonical_entity_id,
      predicate_code: 'OFFERS',
      object_entity_id: prod2Obs.canonical_entity_id,
      knowledge_type: 'CLAIM',
      confidence: 0.90,
      evidence_sources: [
        {
          source_type: 'CATALOG_REGISTRY',
          source_id: 'atlas_products:prod-tango-show-a',
          confidence: 0.90,
          observation_id: prod2Obs.observation_id
        }
      ]
    },
    tenantA
  );

  console.log(`OFFERS 1 ingested: ${relOffers1.relationship_id}`);
  console.log(`OFFERS 2 ingested: ${relOffers2.relationship_id}`);

  // 4. Ingest HIRING facts for Rossi Capital
  console.log('\n--- Ingesting HIRING facts ---');
  const factHiringRole = await semService.assertFact(
    {
      subject_entity_id: rossiCapital.canonical_entity_id,
      predicate_code: 'HIRING_FOR_ROLE',
      value_type: 'TEXT',
      object_value: 'Senior Investment Analyst',
      knowledge_type: 'CLAIM',
      confidence: 0.88,
      evidence_sources: [
        {
          source_type: 'JOB_POSTINGS_EVIDENCE',
          source_id: 'job:rossi-cap-analyst-01',
          confidence: 0.88
        }
      ]
    },
    tenantA
  );

  const factOpenPositions = await semService.assertFact(
    {
      subject_entity_id: rossiCapital.canonical_entity_id,
      predicate_code: 'OPEN_POSITIONS_COUNT',
      value_type: 'INTEGER',
      object_value: 3,
      knowledge_type: 'CLAIM',
      confidence: 0.90,
      evidence_sources: [
        {
          source_type: 'CAREERS_PORTAL',
          source_id: 'portal:rossi-open-positions',
          confidence: 0.90
        }
      ]
    },
    tenantA
  );

  console.log(`HIRING_FOR_ROLE ingested: ${factHiringRole.fact_id}`);
  console.log(`OPEN_POSITIONS_COUNT ingested: ${factOpenPositions.fact_id}`);

  // 5. Ingest Location Expansion for Rossi Capital
  if (cordobaLoc) {
    console.log('\n--- Ingesting OPENED_LOCATION relationship ---');
    const relExpansion = await semService.assertRelationship(
      {
        subject_entity_id: rossiCapital.canonical_entity_id,
        predicate_code: 'OPENED_LOCATION',
        object_entity_id: cordobaLoc.canonical_entity_id,
        knowledge_type: 'CLAIM',
        confidence: 0.85,
        evidence_sources: [
          {
            source_type: 'CORPORATE_REGISTRY',
            source_id: 'corp:cordoba-expansion-2026',
            confidence: 0.85
          }
        ]
      },
      tenantA
    );
    console.log(`OPENED_LOCATION ingested: ${relExpansion.relationship_id}`);
  }

  // 6. Ingest Carlos Gomez Role & Location facts
  console.log('\n--- Ingesting Carlos Gomez facts & relationships ---');
  const factCarlosRole = await semService.assertFact(
    {
      subject_entity_id: carlosGomez.canonical_entity_id,
      predicate_code: 'HAS_ROLE',
      value_type: 'TEXT',
      object_value: 'Managing Director',
      knowledge_type: 'CLAIM',
      confidence: 0.90,
      evidence_sources: [
        {
          source_type: 'atlas_person_attribute_evidence',
          source_id: 'ev-carlos-title-01',
          confidence: 0.90
        }
      ]
    },
    tenantA
  );

  const relCarlosWorks = await semService.assertRelationship(
    {
      subject_entity_id: carlosGomez.canonical_entity_id,
      predicate_code: 'WORKS_AT',
      object_entity_id: rossiCapital.canonical_entity_id,
      knowledge_type: 'CLAIM',
      confidence: 0.92,
      evidence_sources: [
        {
          source_type: 'atlas_person_attribute_evidence',
          source_id: 'ev-carlos-company-01',
          confidence: 0.92
        }
      ]
    },
    tenantA
  );

  console.log(`Carlos Gomez Role ingested: ${factCarlosRole.fact_id}`);
  console.log(`Carlos Gomez WORKS_AT ingested: ${relCarlosWorks.relationship_id}`);

  // 7. Run Inference Engine on Rossi Capital (Pass 1)
  console.log('\n--- Running Inference Engine on Rossi Capital (Pass 1) ---');
  const inf1 = await semService.deriveInferences(rossiCapital.canonical_entity_id, tenantA);
  console.log(`Inferences generated Pass 1: ${inf1.length}`);
  for (const i of inf1) {
    console.log(`- [${i.inference_type}] Rule: ${i.inference_rule} (Confidence: ${i.confidence})`);
  }

  // 8. Idempotency Test: Run Inference Engine Again (Pass 2)
  console.log('\n--- Running Inference Engine on Rossi Capital (Pass 2 - Idempotency Replay) ---');
  const inf2 = await semService.deriveInferences(rossiCapital.canonical_entity_id, tenantA);
  console.log(`Inferences returned Pass 2: ${inf2.length}`);

  const { data: dbInferences } = await supabase
    .from('atlas_semantic_inferences')
    .select('*')
    .eq('tenant_id', tenantA)
    .eq('subject_entity_id', rossiCapital.canonical_entity_id)
    .eq('status', 'ACTIVE');

  console.log(`DB Active Inferences count: ${dbInferences?.length}`);
  if (dbInferences?.length !== inf1.length) {
    throw new Error(`IDEMPOTENCY FAILURE: Expected ${inf1.length} inferences, found ${dbInferences?.length} in DB`);
  }
  console.log('IDEMPOTENCY CHECK PASSED: 0 duplicate inferences created on replay!');

  console.log('\nCONTROLLED INGESTION COMPLETE.');
}

controlledIngest().catch(console.error);
