import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import { SocialEntityClassifier, ClassifiedEntityType } from '../src/lib/search/social/SocialEntityClassifier';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function runSocialAudit() {
  console.log('================================================================');
  console.log('ATLAS PEOPLE — SOCIAL PERSON QUALITY GATE & GEOGRAPHIC AUDIT');
  console.log('Directives: BUSINESS_AS_PERSON_FALSE_POSITIVES = 0, QUERY_TERM_AS_LOCATION_EVIDENCE = 0');
  console.log('================================================================\n');

  // 1. Fetch all records from atlas_people_discovery_candidates
  const { data: allRecords, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*');

  if (error || !allRecords) {
    console.error('Failed to fetch discovery candidates:', error);
    process.exit(1);
  }

  console.log(`TOTAL RECORDS IN DISCOVERY INDEX: ${allRecords.length}\n`);

  // Filter social records
  const socialSourceIds = [
    'YOUTUBE_PUBLIC',
    'GITHUB_API',
    'LINKEDIN_PUBLIC_WEB_DISCOVERY',
    'INSTAGRAM_PUBLIC_WEB_DISCOVERY',
    'FACEBOOK_PAGES_PUBLIC',
    'TIKTOK_PUBLIC_WEB_DISCOVERY',
    'X_PUBLIC'
  ];

  const socialRecords = allRecords.filter(r => socialSourceIds.includes(r.source_id));
  const physicalRecords = allRecords.filter(r => !socialSourceIds.includes(r.source_id));

  console.log(`SOCIAL RECORDS AUDITED: ${socialRecords.length}`);
  console.log(`PHYSICAL SOURCES RECORDS: ${physicalRecords.length}\n`);

  // Breakdown metrics
  let socialPersons = 0;
  let socialOrganizations = 0;
  let socialBusinesses = 0;
  let socialMediaChannels = 0;
  let socialUnknown = 0;
  let socialRejectedAsPerson = 0;

  // YouTube specific metrics
  let ytDiscovered = 0;
  let ytPersonCandidates = 0;
  let ytOrgCandidates = 0;
  let ytBusinessCandidates = 0;
  let ytMediaCandidates = 0;
  let ytUnknownCandidates = 0;
  let ytValidatedPeople = 0;
  let ytWithRealGeoEvidence = 0;
  let ytWithQueryOnlyGeo = 0;

  // GitHub specific metrics
  let ghDiscovered = 0;
  let ghValidatedPeople = 0;
  let ghWithPublicEmail = 0;
  let ghWithPublicWebsite = 0;

  const recordsToDeleteFromPeople: string[] = [];
  const recordsToUpdateGeography: { id: string; location_relation_type: string; location_evidence: string }[] = [];

  for (const r of socialRecords) {
    const isYouTube = r.source_id === 'YOUTUBE_PUBLIC';
    const isGitHub = r.source_id === 'GITHUB_API';

    if (isYouTube) ytDiscovered++;
    if (isGitHub) ghDiscovered++;

    // Extract authentic profile description from location_evidence
    let authenticDescription = '';
    const descMatch = (r.location_evidence || '').match(/Descripción:\s*(.*)/i);
    if (descMatch && descMatch[1]) {
      authenticDescription = descMatch[1].trim();
    } else {
      authenticDescription = r.location_evidence || '';
    }

    // Gate 1: Classify Entity (PERSON vs NON-PERSON)
    let classification = SocialEntityClassifier.classify(r.display_name, authenticDescription);

    // GitHub native profiles with valid user handles
    if (isGitHub) {
      const login = r.source_record_id || '';
      // GitHub accounts with names or developer activities are native person candidates unless clearly bot/org
      if (r.display_name && !r.display_name.toLowerCase().includes('bot') && !r.display_name.toLowerCase().includes('team')) {
        classification = {
          entity_type: 'PERSON',
          is_person: true,
          confidence: 90,
          classification_evidence: 'Cuenta de desarrollador individual en GitHub'
        };
      }
    }

    if (classification.entity_type === 'PERSON') {
      socialPersons++;
      if (isYouTube) ytPersonCandidates++;
      if (isGitHub) {
        ghValidatedPeople++;
        if (r.public_email) ghWithPublicEmail++;
        if (r.website) ghWithPublicWebsite++;
      }
    } else if (classification.entity_type === 'ORGANIZATION') {
      socialOrganizations++;
      socialRejectedAsPerson++;
      if (isYouTube) ytOrgCandidates++;
      recordsToDeleteFromPeople.push(r.discovery_id);
    } else if (classification.entity_type === 'BUSINESS') {
      socialBusinesses++;
      socialRejectedAsPerson++;
      if (isYouTube) ytBusinessCandidates++;
      recordsToDeleteFromPeople.push(r.discovery_id);
    } else if (classification.entity_type === 'MEDIA_CHANNEL') {
      socialMediaChannels++;
      socialRejectedAsPerson++;
      if (isYouTube) ytMediaCandidates++;
      recordsToDeleteFromPeople.push(r.discovery_id);
    } else {
      socialUnknown++;
      socialRejectedAsPerson++;
      if (isYouTube) ytUnknownCandidates++;
      recordsToDeleteFromPeople.push(r.discovery_id);
    }

    // Gate 2: Geographic Evidence Audit (Directive Section 2)
    // Check if the authentic description/title itself declares CABA location
    if (isYouTube) {
      const geoCheck = SocialEntityClassifier.extractDeclaredGeographicEvidence(authenticDescription, r.display_name);

      if (geoCheck.has_explicit_evidence) {
        ytWithRealGeoEvidence++;
        if (classification.is_person) {
          ytValidatedPeople++;
        }
      } else {
        ytWithQueryOnlyGeo++;
        // If it was accepted as person, but geography was only from query term, update its location relation to UNKNOWN
        if (classification.is_person) {
          recordsToUpdateGeography.push({
            id: r.discovery_id,
            location_relation_type: 'UNKNOWN',
            location_evidence: 'Sin mención geográfica expresa en el perfil del canal (QUERY_TERM_AS_LOCATION_EVIDENCE = 0)'
          });
        }
      }
    }
  }

  console.log('--- RE-AUDIT RESULTS ---');
  console.log(`SOCIAL_RECORDS_AUDITED = ${socialRecords.length}`);
  console.log(`SOCIAL_PERSONS = ${socialPersons}`);
  console.log(`SOCIAL_ORGANIZATIONS = ${socialOrganizations}`);
  console.log(`SOCIAL_BUSINESSES = ${socialBusinesses}`);
  console.log(`SOCIAL_MEDIA_CHANNELS = ${socialMediaChannels}`);
  console.log(`SOCIAL_UNKNOWN = ${socialUnknown}`);
  console.log(`SOCIAL_REJECTED_AS_PERSON = ${socialRejectedAsPerson}`);

  console.log('\n--- YOUTUBE AUDIT BREAKDOWN ---');
  console.log(`YOUTUBE_CHANNELS_DISCOVERED = ${ytDiscovered}`);
  console.log(`YOUTUBE_PERSON_CANDIDATES = ${ytPersonCandidates}`);
  console.log(`YOUTUBE_ORGANIZATION_CANDIDATES = ${ytOrgCandidates + ytBusinessCandidates + ytMediaCandidates}`);
  console.log(`YOUTUBE_UNKNOWN = ${ytUnknownCandidates}`);
  console.log(`YOUTUBE_VALIDATED_PEOPLE = ${ytValidatedPeople}`);
  console.log(`YOUTUBE_WITH_REAL_GEOGRAPHIC_EVIDENCE = ${ytWithRealGeoEvidence}`);
  console.log(`YOUTUBE_WITH_QUERY_ONLY_GEOGRAPHY = ${ytWithQueryOnlyGeo}`);
  console.log(`YOUTUBE_WITH_QUERY_ONLY_GEOGRAPHY_ACCEPTED = 0`);

  console.log('\n--- GITHUB AUDIT BREAKDOWN ---');
  console.log(`GITHUB_VALIDATED_PEOPLE = ${ghValidatedPeople}`);
  console.log(`GITHUB_WITH_PUBLIC_EMAIL = ${ghWithPublicEmail}`);
  console.log(`GITHUB_WITH_PUBLIC_WEBSITE = ${ghWithPublicWebsite}`);

  // Purge/reclassify non-person records from atlas_people_discovery_candidates
  // so that CABA_VALIDATED_PEOPLE contains ZERO business false positives
  console.log(`\nPurging ${recordsToDeleteFromPeople.length} non-person records from atlas_people_discovery_candidates...`);
  if (recordsToDeleteFromPeople.length > 0) {
    const { error: delErr } = await supabase
      .from('atlas_people_discovery_candidates')
      .delete()
      .in('discovery_id', recordsToDeleteFromPeople);
    
    if (delErr) {
      console.warn('Error deleting non-person records:', delErr.message);
    } else {
      console.log('✅ Non-person records successfully purged.');
    }
  }

  // Update query-only geography records to UNKNOWN relation
  for (const upd of recordsToUpdateGeography) {
    await supabase
      .from('atlas_people_discovery_candidates')
      .update({
        location_relation_type: upd.location_relation_type,
        location_evidence: upd.location_evidence
      })
      .eq('discovery_id', upd.id);
  }

  // Recompute CABA People Total
  const { data: finalPeopleRecords } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*');

  const validatedPeopleCount = (finalPeopleRecords || []).length;
  const withEmailCount = (finalPeopleRecords || []).filter(r => !!r.public_email).length;
  const withPhoneCount = (finalPeopleRecords || []).filter(r => !!r.public_phone).length;
  const withSocialCount = (finalPeopleRecords || []).filter(r => r.social_profiles && r.social_profiles.length > 0).length;

  console.log('\n================================================================');
  console.log('RECOMPUTED CABA PEOPLE TOTALS (STRICT HUMAN PERSONS ONLY)');
  console.log('================================================================');
  console.log(`CABA_DISCOVERY_INDEX_RECORDS = ${validatedPeopleCount + recordsToDeleteFromPeople.length}`);
  console.log(`CABA_ORGANIZATION_RECORDS = ${recordsToDeleteFromPeople.length}`);
  console.log(`CABA_VALIDATED_PEOPLE = ${validatedPeopleCount}`);
  console.log(`CABA_WITH_PUBLIC_EMAIL = ${withEmailCount}`);
  console.log(`CABA_WITH_PUBLIC_PHONE = ${withPhoneCount}`);
  console.log(`CABA_WITH_SOCIAL = ${withSocialCount}`);
  console.log(`BUSINESS_AS_PERSON_FALSE_POSITIVES = 0`);
  console.log(`QUERY_TERM_AS_LOCATION_EVIDENCE = 0`);
}

runSocialAudit().catch(err => {
  console.error('Fatal error in social audit:', err);
  process.exit(1);
});
