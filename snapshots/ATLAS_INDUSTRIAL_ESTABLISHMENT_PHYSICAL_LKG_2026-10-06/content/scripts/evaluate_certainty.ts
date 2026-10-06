import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

export type PersonCertaintyTier = 
  | 'ENTITY_CLASSIFIED_AS_PERSON' 
  | 'VALIDATED_PERSON' 
  | 'CROSS_SOURCE_VERIFIED_PERSON';

export function evaluatePersonCertainty(record: any): PersonCertaintyTier {
  const sourceId = record.source_id || '';
  const isSocial = [
    'YOUTUBE_PUBLIC',
    'LINKEDIN_PUBLIC_WEB_DISCOVERY',
    'INSTAGRAM_PUBLIC_WEB_DISCOVERY',
    'FACEBOOK_PAGES_PUBLIC',
    'TIKTOK_PUBLIC_WEB_DISCOVERY',
    'X_PUBLIC'
  ].includes(sourceId);

  // Check distinct independent domains/sources
  const domains = new Set<string>();
  if (record.person_source_url) {
    try { domains.add(new URL(record.person_source_url).hostname.replace('www.', '')); } catch {}
  }
  if (record.location_source_url) {
    try { domains.add(new URL(record.location_source_url).hostname.replace('www.', '')); } catch {}
  }
  if (record.website) {
    try { domains.add(new URL(record.website).hostname.replace('www.', '')); } catch {}
  }
  if (record.social_profiles && Array.isArray(record.social_profiles)) {
    for (const sp of record.social_profiles) {
      if (sp.url) {
        try { domains.add(new URL(sp.url).hostname.replace('www.', '')); } catch {}
      }
    }
  }

  // Cross-source verified: candidate corroborated across at least 2 independent distinct domains/platforms
  if (domains.size >= 2) {
    return 'CROSS_SOURCE_VERIFIED_PERSON';
  }

  // Official rosters, healthcare faculties, professional colleges, Conicet, government bodies
  const isInstitutionalRoster = [
    'HOSPITAL_DURAND_CABALLITO',
    'INSTITUTO_PASTEUR_CABALLITO',
    'GCBA_COMUNA_6_JUNTA',
    'CONICET_MACN_CABALLITO',
    'CPACF_PADRON_ABOGADOS',
    'COLEGIO_PSICOLOGOS_CABA',
    'GCBA_NOMINA_PERSONAL',
    'CPAU_PADRON_ARQUITECTOS',
    'GCBA_EDUCACION_COMUNA_6',
    'ASOCIACION_COMERCIANTES_CABALLITO',
    'SANATORIO_MENDEZ_CABALLITO',
    'CPCECABA_PADRON_CONTADORES',
    'WIKIDATA_PUBLIC',
    'REFEPS_REGISTRY'
  ].includes(sourceId);

  // GitHub with public email or external website is validated by factual developer evidence
  const isGitHubFactual = sourceId === 'GITHUB_API' && (!!record.public_email || !!record.website);

  if (isInstitutionalRoster || isGitHubFactual) {
    return 'VALIDATED_PERSON';
  }

  // GitHub without email/website, or YouTube/social without independent corroboration:
  if (isSocial || sourceId === 'GITHUB_API') {
    return 'ENTITY_CLASSIFIED_AS_PERSON';
  }

  // Fallback for Gemini web discovery with single domain
  return 'VALIDATED_PERSON';
}

async function testCertaintyClassification() {
  const { data: records, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*');

  if (error || !records) {
    console.error('Error:', error);
    return;
  }

  let classifiedCount = 0;
  let validatedCount = 0;
  let crossSourceCount = 0;

  for (const r of records) {
    const tier = evaluatePersonCertainty(r);
    if (tier === 'ENTITY_CLASSIFIED_AS_PERSON') classifiedCount++;
    else if (tier === 'VALIDATED_PERSON') validatedCount++;
    else if (tier === 'CROSS_SOURCE_VERIFIED_PERSON') crossSourceCount++;
  }

  console.log(`TOTAL RECORDS: ${records.length}`);
  console.log(`CABA_PERSON_CLASSIFIED = ${classifiedCount}`);
  console.log(`CABA_VALIDATED_PERSON = ${validatedCount}`);
  console.log(`CABA_CROSS_SOURCE_VERIFIED_PERSON = ${crossSourceCount}`);
  console.log(`SUM = ${classifiedCount + validatedCount + crossSourceCount}`);
}

testCertaintyClassification().catch(console.error);
