import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';
import { AtlasCanonicalEntityService } from '../src/lib/atlasSemantic/AtlasCanonicalEntityService';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const canService = new AtlasCanonicalEntityService(supabase);
  const tenantA = 'e518772b-e9cf-4048-a4a0-40d37c1588de';

  // 1. Resolve source observations
  const obsHiring = await canService.resolveEntityCandidate(
    {
      source_name: 'job_postings_evidence',
      source_record_id: 'job-rossi-cap-analyst-01',
      source_entity_key: 'job:rossi_analyst',
      entity_type: 'COMPANY',
      raw_name: 'Rossi Capital',
      raw_attributes: { role: 'Senior Investment Analyst', count: 3 }
    },
    tenantA
  );

  const obsCarlos = await canService.resolveEntityCandidate(
    {
      source_name: 'atlas_person_attribute_evidence',
      source_record_id: 'ev-carlos-title-01',
      source_entity_key: 'person:carlos_gomez_role',
      entity_type: 'PERSON',
      raw_name: 'Carlos Gomez',
      raw_attributes: { role: 'Managing Director' }
    },
    tenantA
  );

  const obsExpansion = await canService.resolveEntityCandidate(
    {
      source_name: 'corporate_registry',
      source_record_id: 'corp-cordoba-expansion-2026',
      source_entity_key: 'corp:expansion_cordoba',
      entity_type: 'COMPANY',
      raw_name: 'Rossi Capital',
      raw_attributes: { opened_location: 'Cordoba' }
    },
    tenantA
  );

  const obsProd1 = await canService.resolveEntityCandidate(
    {
      source_name: 'atlas_products',
      source_record_id: 'prod-tango-vip-a',
      source_entity_key: 'product:tango_vip',
      entity_type: 'PRODUCT',
      raw_name: 'VIP Tango Portfolio',
      raw_attributes: { category: 'TANGO' }
    },
    tenantA
  );

  const obsProd2 = await canService.resolveEntityCandidate(
    {
      source_name: 'atlas_products',
      source_record_id: 'prod-tango-show-a',
      source_entity_key: 'product:tango_show',
      entity_type: 'PRODUCT',
      raw_name: 'Tango Event Production',
      raw_attributes: { category: 'EVENT' }
    },
    tenantA
  );

  console.log('Observations ready:');
  console.log(`- Obs Hiring: ${obsHiring.observation_id}`);
  console.log(`- Obs Carlos: ${obsCarlos.observation_id}`);
  console.log(`- Obs Expansion: ${obsExpansion.observation_id}`);
  console.log(`- Obs Prod1: ${obsProd1.observation_id}`);
  console.log(`- Obs Prod2: ${obsProd2.observation_id}`);

  // 2. Link Facts to Observations in atlas_semantic_fact_evidence
  const factHiringId = 'f7c3fd30-7f1e-4608-9056-f04eefd65531';
  const factOpenPositionsId = '92a8293b-b85c-4862-8920-3400933d2dc3';
  const factCarlosRoleId = '0d7e8f33-a59a-4a00-9419-0def6d515699';

  await supabase.from('atlas_semantic_fact_evidence').upsert(
    {
      tenant_id: tenantA,
      fact_id: factHiringId,
      source_observation_id: obsHiring.observation_id,
      evidence_role: 'PRIMARY_OBSERVATION',
      confidence_contribution: 0.88,
      evidence_metadata: {}
    },
    { onConflict: 'tenant_id,fact_id,source_observation_id' }
  );

  await supabase.from('atlas_semantic_fact_evidence').upsert(
    {
      tenant_id: tenantA,
      fact_id: factOpenPositionsId,
      source_observation_id: obsHiring.observation_id,
      evidence_role: 'PRIMARY_OBSERVATION',
      confidence_contribution: 0.90,
      evidence_metadata: {}
    },
    { onConflict: 'tenant_id,fact_id,source_observation_id' }
  );

  await supabase.from('atlas_semantic_fact_evidence').upsert(
    {
      tenant_id: tenantA,
      fact_id: factCarlosRoleId,
      source_observation_id: obsCarlos.observation_id,
      evidence_role: 'PRIMARY_OBSERVATION',
      confidence_contribution: 0.90,
      evidence_metadata: {}
    },
    { onConflict: 'tenant_id,fact_id,source_observation_id' }
  );

  // 3. Link Relationships to Observations in atlas_semantic_relationship_evidence
  const relOffers1Id = '9c2584dc-af33-42ce-ab57-59c3e36794b0';
  const relOffers2Id = '7f353e3c-27c6-479b-87d3-18e5c901038d';
  const relOpenedLocId = '4beeb4a3-65e6-45b5-8534-87fc664bda49';
  const relWorksAtId = 'f570d775-f05b-4378-8a58-332dca6c3cbf';

  await supabase.from('atlas_semantic_relationship_evidence').upsert(
    {
      tenant_id: tenantA,
      relationship_id: relOffers1Id,
      source_observation_id: obsProd1.observation_id,
      evidence_role: 'PRIMARY_OBSERVATION',
      confidence_contribution: 0.90,
      evidence_metadata: {}
    },
    { onConflict: 'tenant_id,relationship_id,source_observation_id' }
  );

  await supabase.from('atlas_semantic_relationship_evidence').upsert(
    {
      tenant_id: tenantA,
      relationship_id: relOffers2Id,
      source_observation_id: obsProd2.observation_id,
      evidence_role: 'PRIMARY_OBSERVATION',
      confidence_contribution: 0.90,
      evidence_metadata: {}
    },
    { onConflict: 'tenant_id,relationship_id,source_observation_id' }
  );

  await supabase.from('atlas_semantic_relationship_evidence').upsert(
    {
      tenant_id: tenantA,
      relationship_id: relOpenedLocId,
      source_observation_id: obsExpansion.observation_id,
      evidence_role: 'PRIMARY_OBSERVATION',
      confidence_contribution: 0.85,
      evidence_metadata: {}
    },
    { onConflict: 'tenant_id,relationship_id,source_observation_id' }
  );

  await supabase.from('atlas_semantic_relationship_evidence').upsert(
    {
      tenant_id: tenantA,
      relationship_id: relWorksAtId,
      source_observation_id: obsCarlos.observation_id,
      evidence_role: 'PRIMARY_OBSERVATION',
      confidence_contribution: 0.92,
      evidence_metadata: {}
    },
    { onConflict: 'tenant_id,relationship_id,source_observation_id' }
  );

  console.log('All facts and relationships successfully linked to observations!');
}

main().catch(console.error);
