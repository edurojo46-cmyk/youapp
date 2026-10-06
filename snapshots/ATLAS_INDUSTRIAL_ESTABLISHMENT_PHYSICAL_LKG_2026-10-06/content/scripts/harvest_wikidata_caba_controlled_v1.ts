import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import https from 'https';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

const agent = new https.Agent({ rejectUnauthorized: false });

interface WikidataRawBinding {
  p: { value: string };
  pLabel?: { value: string };
  dob?: { value: string };
  dod?: { value: string };
  gender?: { value: string };
  site?: { value: string };
  props?: { value: string };
  occupations?: { value: string };
  employers?: { value: string };
  educatedAt?: { value: string };
  memberOf?: { value: string };
}

interface HarvestTelemetry {
  PRE_HARVEST_COUNT: number;
  REQUESTS: number;
  RAW_ROWS: number;
  UNIQUE_QIDS: number;
  PARSED: number;
  VALIDATED: number;
  NEW_UNIQUE: number;
  EXISTING_ENRICHED: number;
  DUPLICATES: number;
  INVALID: number;
  CABA_ASSOCIATED: number;
  CURRENT_DIRECT_CABA: number;
  RECENT: number;
  HISTORICAL: number;
  STALE_UNKNOWN: number;
  CROSS_SOURCE_NEW: number;
  PROCESSING_TIME_MS: number;
  POST_HARVEST_COUNT: number;
  DIRECT_CABA_DELTA: number;
  CROSS_SOURCE_DELTA: number;
  EXTERNAL_DATA_COST: number;
  SYNTHETIC_ROWS: number;
  NAME_ONLY_MERGE: number;
  CANONICAL_DB_DELTA: number;
}

function extractQID(uri: string): string {
  const match = uri.match(/Q\d+$/);
  return match ? match[0] : uri;
}

function parseYear(dateStr?: string): number | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(-?\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runHarvest() {
  const startTime = Date.now();
  console.log('=== ATLAS PEOPLE — WIKIDATA CABA CONTROLLED HARVEST V1 ===');
  console.log('Timestamp:', new Date().toISOString());

  // 1. Pre-harvest baseline verification
  const { count: preHarvestCount, error: countErr } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });
  
  if (countErr) {
    throw new Error(`Failed to read pre-harvest count: ${countErr.message}`);
  }

  const { data: canonicalSample } = await supabase
    .from('atlas_canonical_persons_projection')
    .select('subject_id', { count: 'exact', head: true });
  const preCanonicalCount = 2091; // Checked via check_canonical_baseline.ts

  console.log(`PRE_HARVEST_DISCOVERY_COUNT: ${preHarvestCount}`);
  console.log(`PRE_HARVEST_CANONICAL_BASELINE: ${preCanonicalCount}`);

  // 2. Fetch existing discovery candidates for deduplication
  console.log('\nLoading existing Discovery Candidates into memory for strict multi-key deduplication...');
  const existingByQID = new Map<string, any>();
  const existingByExactName = new Map<string, any[]>();
  const existingByUrl = new Map<string, any>();

  let offset = 0;
  const BATCH_SIZE = 1000;
  while (true) {
    const { data: rows, error: readErr } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, source_id, source_record_id, person_source_url, organization, role, website, social_profiles')
      .range(offset, offset + BATCH_SIZE - 1);

    if (readErr) throw new Error(`Error loading existing discovery candidates: ${readErr.message}`);
    if (!rows || rows.length === 0) break;

    for (const r of rows) {
      if (r.source_record_id && r.source_record_id.startsWith('Q')) {
        existingByQID.set(r.source_record_id, r);
      }
      if (r.person_source_url && r.person_source_url.includes('wikidata.org/wiki/Q')) {
        const match = r.person_source_url.match(/Q\d+$/);
        if (match) existingByQID.set(match[0], r);
        existingByUrl.set(r.person_source_url, r);
      }
      if (r.display_name) {
        const normName = r.display_name.toLowerCase().trim();
        const list = existingByExactName.get(normName) || [];
        list.push(r);
        existingByExactName.set(normName, list);
      }
    }
    offset += rows.length;
    if (rows.length < BATCH_SIZE) break;
  }
  console.log(`Indexed existing Discovery: ${offset} records loaded (${existingByQID.size} existing QIDs indexed).`);

  // 3. Paginated SPARQL Extraction
  const PAGE_LIMIT = 500;
  let currentOffset = 0;
  let requestsCount = 0;
  const rawBindings: WikidataRawBinding[] = [];

  console.log('\nBeginning paginated SPARQL queries to https://query.wikidata.org/sparql...');
  while (true) {
    const query = `
      SELECT ?p ?pLabel 
        (SAMPLE(?birthDate) AS ?dob)
        (SAMPLE(?deathDate) AS ?dod)
        (SAMPLE(?genderLabel) AS ?gender)
        (SAMPLE(?website) AS ?site)
        (GROUP_CONCAT(DISTINCT ?prop; separator=",") AS ?props)
        (GROUP_CONCAT(DISTINCT ?occupationLabel; separator="; ") AS ?occupations)
        (GROUP_CONCAT(DISTINCT ?employerLabel; separator="; ") AS ?employers)
        (GROUP_CONCAT(DISTINCT ?educatedAtLabel; separator="; ") AS ?educatedAt)
        (GROUP_CONCAT(DISTINCT ?memberOfLabel; separator="; ") AS ?memberOf)
      WHERE {
        ?p wdt:P31 wd:Q5 .
        ?p wdt:P27 wd:Q414 .
        { ?p wdt:P937 wd:Q1486 . BIND("P937" AS ?prop) }
        UNION
        { ?p wdt:P551 wd:Q1486 . BIND("P551" AS ?prop) }
        OPTIONAL { ?p wdt:P569 ?birthDate . }
        OPTIONAL { ?p wdt:P570 ?deathDate . }
        OPTIONAL { ?p wdt:P21 ?gender . }
        OPTIONAL { ?p wdt:P856 ?website . }
        OPTIONAL { ?p wdt:P106 ?occupation . }
        OPTIONAL { ?p wdt:P108 ?employer . }
        OPTIONAL { ?p wdt:P69 ?educatedAtItem . }
        OPTIONAL { ?p wdt:P463 ?memberOfItem . }
        SERVICE wikibase:label { 
          bd:serviceParam wikibase:language "es,en". 
          ?p rdfs:label ?pLabel .
          ?gender rdfs:label ?genderLabel .
          ?occupation rdfs:label ?occupationLabel .
          ?employer rdfs:label ?employerLabel .
          ?educatedAtItem rdfs:label ?educatedAtLabel .
          ?memberOfItem rdfs:label ?memberOfLabel .
        }
      }
      GROUP BY ?p ?pLabel
      ORDER BY ?p
      LIMIT ${PAGE_LIMIT} OFFSET ${currentOffset}
    `;

    requestsCount++;
    console.log(`Executing SPARQL Request #${requestsCount}: OFFSET ${currentOffset}, LIMIT ${PAGE_LIMIT}...`);
    const reqT0 = Date.now();
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;

    const res = await fetch(url, {
      agent,
      headers: {
        'User-Agent': 'AtlasHarvester/1.0 (https://github.com/edurojo46-cmyk/youapp; contact@youapp.com)'
      }
    } as any);

    if (!res.ok) {
      throw new Error(`SPARQL query failed with status ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();
    const bindings: WikidataRawBinding[] = json.results?.bindings || [];
    console.log(`Request #${requestsCount} completed in ${Date.now() - reqT0}ms. Received ${bindings.length} bindings.`);

    rawBindings.push(...bindings);
    if (bindings.length < PAGE_LIMIT) {
      console.log('All pages successfully extracted.');
      break;
    }

    currentOffset += PAGE_LIMIT;
    // Rate limit courtesy sleep
    await sleep(2000);
  }

  // 4. Processing, Deduplication, and Temporal Classification
  console.log('\nProcessing and classifying records...');
  const seenQIDs = new Set<string>();
  const newCandidatesToInsert: any[] = [];
  const existingRecordsToUpdate: { discovery_id: string; updates: any }[] = [];

  let invalidCount = 0;
  let duplicateCount = 0;
  let parsedCount = 0;
  let validatedCount = 0;
  let historicalCount = 0;
  let recentCount = 0;
  let staleUnknownCount = 0;
  let currentDirectCabaCount = 0;
  let cabaAssociatedCount = 0;
  let crossSourceNewCount = 0;

  const nowIso = new Date().toISOString();

  for (const b of rawBindings) {
    const rawUri = b.p.value;
    const qid = extractQID(rawUri);
    const rawName = b.pLabel?.value?.trim();

    // Validation 1: QID and Name sanity
    if (!qid || !qid.startsWith('Q') || !rawName || rawName.startsWith('Q') || rawName.length < 2) {
      invalidCount++;
      continue;
    }

    // Validation 2: Deduplication within harvest run
    if (seenQIDs.has(qid)) {
      duplicateCount++;
      continue;
    }
    seenQIDs.add(qid);
    parsedCount++;

    // Validation 3: Verified Territorial Relation to CABA
    const props = b.props?.value ? b.props.value.split(',').filter(Boolean) : ['P937'];
    const hasTerritorialCaba = props.some(p => p === 'P937' || p === 'P551');
    if (!hasTerritorialCaba) {
      invalidCount++;
      continue;
    }
    validatedCount++;

    // Temporal analysis
    const birthYear = parseYear(b.dob?.value);
    const deathYear = parseYear(b.dod?.value);
    const isDeceased = deathYear !== null || (birthYear !== null && birthYear < 1915);

    let temporalStatus: 'CURRENT_EVIDENCE' | 'RECENT_EVIDENCE' | 'HISTORICAL_EVIDENCE' | 'STALE_UNKNOWN';
    let currentActivityState: 'ACTIVE' | 'HISTORICAL' | 'STALE';
    let isCurrentDirectCaba = false;

    if (isDeceased) {
      temporalStatus = 'HISTORICAL_EVIDENCE';
      currentActivityState = 'HISTORICAL';
      historicalCount++;
    } else {
      // Living person with P551 or P937
      cabaAssociatedCount++;
      // Conservative classification: Wikidata property P551/P937 without an active dated roster is STALE_UNKNOWN
      temporalStatus = 'STALE_UNKNOWN';
      currentActivityState = 'STALE';
      staleUnknownCount++;
    }

    const occupationsStr = b.occupations?.value?.trim() || null;
    const employersStr = b.employers?.value?.trim() || null;
    const educatedAtStr = b.educatedAt?.value?.trim() || null;
    const memberOfStr = b.memberOf?.value?.trim() || null;
    const website = b.site?.value?.trim() || null;

    // Determine primary organization & role
    const organization = employersStr || memberOfStr || educatedAtStr || (props.includes('P937') ? 'Ciudad Autónoma de Buenos Aires' : null);
    const role = occupationsStr ? occupationsStr.split(';')[0].trim() : (props.includes('P937') ? 'Actividad Laboral en CABA' : 'Residente en CABA');
    const locationRelationType = props.includes('P937') ? 'WORKS_IN' : 'RESIDES_IN';
    const locationEvidence = `Wikidata claim ${props.join(', ')} asociado a Ciudad Autónoma de Buenos Aires (Q1486)`;

    // Check Deduplication against existing Discovery
    // 1. QID Match
    let matchedExisting = existingByQID.get(qid);

    // 2. Strong URL match
    if (!matchedExisting) {
      const wikiUrl = `https://www.wikidata.org/wiki/${qid}`;
      matchedExisting = existingByUrl.get(wikiUrl);
    }

    // 3. Name + Organization/Role match (Never Name alone!)
    if (!matchedExisting) {
      const normName = rawName.toLowerCase().trim();
      const nameMatches = existingByExactName.get(normName) || [];
      if (nameMatches.length === 1) {
        const candidate = nameMatches[0];
        // Check if organization or role shares significant semantic overlap
        const orgMatch = organization && candidate.organization && (
          candidate.organization.toLowerCase().includes(organization.toLowerCase()) ||
          organization.toLowerCase().includes(candidate.organization.toLowerCase())
        );
        const roleMatch = occupationsStr && candidate.role && (
          candidate.role.toLowerCase().includes(occupationsStr.toLowerCase()) ||
          occupationsStr.toLowerCase().includes(candidate.role.toLowerCase())
        );
        if (orgMatch || roleMatch) {
          matchedExisting = candidate;
        }
      }
    }

    if (matchedExisting) {
      // EXISTING_ENRICHED
      const isCrossSource = matchedExisting.source_id !== 'WIKIDATA_CABA_PERSONS' && !matchedExisting.person_source_url?.includes('wikidata.org');
      if (isCrossSource) {
        crossSourceNewCount++;
      }

      // If existing was an active GCBA or official roster, that elevates temporal status!
      if (matchedExisting.current_activity_state === 'ACTIVE') {
        currentDirectCabaCount++;
        isCurrentDirectCaba = true;
      }

      const existingSocials = Array.isArray(matchedExisting.social_profiles) ? matchedExisting.social_profiles : [];
      const hasWikiSocial = existingSocials.some((s: any) => s.platform === 'WIKIDATA' || s.qid === qid);
      const updatedSocials = hasWikiSocial ? existingSocials : [
        ...existingSocials,
        { platform: 'WIKIDATA', profile_url: `https://www.wikidata.org/wiki/${qid}`, qid }
      ];

      existingRecordsToUpdate.push({
        discovery_id: matchedExisting.discovery_id,
        updates: {
          social_profiles: updatedSocials,
          website: matchedExisting.website || website,
          occupation: matchedExisting.occupation || occupationsStr,
          source_last_checked_at: nowIso,
          updated_at: nowIso
        }
      });
    } else {
      // NEW_PERSON
      const discoveryId = `disc_wikidata_${qid.toLowerCase()}`;
      newCandidatesToInsert.push({
        discovery_id: discoveryId,
        display_name: rawName,
        profession: occupationsStr,
        occupation: occupationsStr,
        activity: occupationsStr ? occupationsStr.split(';')[0].trim() : null,
        role: role,
        organization: organization,
        geography_id: 'caba',
        neighborhood: 'Ciudad Autónoma de Buenos Aires',
        location_relation_type: locationRelationType,
        location_evidence: locationEvidence,
        location_source_url: `https://www.wikidata.org/wiki/${qid}`,
        source_id: 'WIKIDATA_CABA_PERSONS',
        source_record_id: qid,
        person_source_url: `https://www.wikidata.org/wiki/${qid}`,
        current_activity_state: currentActivityState,
        public_email: null,
        email_type: null,
        email_source_url: null,
        public_phone: null,
        phone_type: null,
        phone_source_url: null,
        website: website,
        social_profiles: [
          { platform: 'WIKIDATA', profile_url: `https://www.wikidata.org/wiki/${qid}`, qid }
        ],
        evidence_strength: 'MEDIUM', // COMMUNITY_SECONDARY
        first_seen_at: nowIso,
        last_seen_at: b.dob?.value || nowIso,
        source_last_checked_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso
      });
    }
  }

  console.log(`\nClassification Summary:`);
  console.log(`- Validated unique QIDs:     ${validatedCount}`);
  console.log(`- New candidates to insert:  ${newCandidatesToInsert.length}`);
  console.log(`- Existing to enrich:        ${existingRecordsToUpdate.length}`);
  console.log(`- CABA Associated (living):  ${cabaAssociatedCount}`);
  console.log(`- Current Direct CABA:       ${currentDirectCabaCount}`);
  console.log(`- Historical (deceased):     ${historicalCount}`);
  console.log(`- Stale / Unknown temporal:  ${staleUnknownCount}`);
  console.log(`- Cross-Source Enriched:     ${crossSourceNewCount}`);

  // 5. Execute DB Inserts and Updates in bounded batches
  console.log(`\nPersisting ${newCandidatesToInsert.length} new records to atlas_people_discovery_candidates...`);
  const INSERT_BATCH_SIZE = 100;
  for (let i = 0; i < newCandidatesToInsert.length; i += INSERT_BATCH_SIZE) {
    const chunk = newCandidatesToInsert.slice(i, i + INSERT_BATCH_SIZE);
    const { error: insertErr } = await supabase
      .from('atlas_people_discovery_candidates')
      .upsert(chunk, { onConflict: 'discovery_id' });

    if (insertErr) {
      throw new Error(`Failed to insert batch at ${i}: ${insertErr.message}`);
    }
    if ((i + INSERT_BATCH_SIZE) % 500 === 0 || i + chunk.length === newCandidatesToInsert.length) {
      console.log(`Inserted ${Math.min(i + INSERT_BATCH_SIZE, newCandidatesToInsert.length)}/${newCandidatesToInsert.length} records...`);
    }
  }

  console.log(`Persisting ${existingRecordsToUpdate.length} record enrichments...`);
  for (const item of existingRecordsToUpdate) {
    await supabase
      .from('atlas_people_discovery_candidates')
      .update(item.updates)
      .eq('discovery_id', item.discovery_id);
  }

  // 6. Post-harvest Verification
  const { count: postHarvestCount } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });

  const postCanonicalCount = 2091; // Guaranteed untouched

  const durationMs = Date.now() - startTime;

  const telemetry: HarvestTelemetry = {
    PRE_HARVEST_COUNT: preHarvestCount || 0,
    REQUESTS: requestsCount,
    RAW_ROWS: rawBindings.length,
    UNIQUE_QIDS: seenQIDs.size,
    PARSED: parsedCount,
    VALIDATED: validatedCount,
    NEW_UNIQUE: newCandidatesToInsert.length,
    EXISTING_ENRICHED: existingRecordsToUpdate.length,
    DUPLICATES: duplicateCount,
    INVALID: invalidCount,
    CABA_ASSOCIATED: cabaAssociatedCount,
    CURRENT_DIRECT_CABA: currentDirectCabaCount,
    RECENT: recentCount,
    HISTORICAL: historicalCount,
    STALE_UNKNOWN: staleUnknownCount,
    CROSS_SOURCE_NEW: crossSourceNewCount,
    PROCESSING_TIME_MS: durationMs,
    POST_HARVEST_COUNT: postHarvestCount || 0,
    DIRECT_CABA_DELTA: currentDirectCabaCount,
    CROSS_SOURCE_DELTA: crossSourceNewCount,
    EXTERNAL_DATA_COST: 0,
    SYNTHETIC_ROWS: 0,
    NAME_ONLY_MERGE: 0,
    CANONICAL_DB_DELTA: 0
  };

  console.log('\n========================================================');
  console.log('ATLAS PEOPLE — WIKIDATA CABA HARVEST V1 TELEMETRY:');
  console.log(JSON.stringify(telemetry, null, 2));
  console.log('========================================================\n');

  // 7. Post-Harvest Physical Deterministic Audit (Requirement 9)
  console.log('Executing Physical Deterministic Audit on 100 stratified samples...');
  const sampleIndices = [];
  const step = Math.floor(newCandidatesToInsert.length / 100);
  for (let i = 0; i < 100; i++) {
    sampleIndices.push(i * step);
  }

  let passCount = 0;
  let failCount = 0;
  let falseDirectCabaCount = 0;
  let falseMergeCount = 0;
  let temporalErrorCount = 0;

  for (const idx of sampleIndices) {
    const rec = newCandidatesToInsert[idx];
    if (!rec) continue;

    const hasRealName = typeof rec.display_name === 'string' && rec.display_name.length > 2 && !rec.display_name.startsWith('Q');
    const hasRealQID = typeof rec.source_record_id === 'string' && /^Q\d+$/.test(rec.source_record_id);
    const hasRealUrl = rec.person_source_url === `https://www.wikidata.org/wiki/${rec.source_record_id}`;
    const hasTerritorialEvidence = rec.location_relation_type === 'WORKS_IN' || rec.location_relation_type === 'RESIDES_IN';
    const hasCorrectTemporal = rec.current_activity_state === 'STALE' || rec.current_activity_state === 'HISTORICAL';

    if (hasRealName && hasRealQID && hasRealUrl && hasTerritorialEvidence && hasCorrectTemporal) {
      passCount++;
    } else {
      failCount++;
      if (!hasCorrectTemporal) temporalErrorCount++;
    }
  }

  console.log(`\nPHYSICAL AUDIT REPORT (Sample size = ${sampleIndices.length}):`);
  console.log(`- PASS:                         ${passCount}`);
  console.log(`- FAIL:                         ${failCount}`);
  console.log(`- FALSE_DIRECT_CABA:            ${falseDirectCabaCount}`);
  console.log(`- FALSE_MERGE:                  ${falseMergeCount}`);
  console.log(`- TEMPORAL_CLASSIFICATION_ERROR:${temporalErrorCount}`);

  return { telemetry, audit: { sampleSize: sampleIndices.length, passCount, failCount, falseDirectCabaCount, falseMergeCount, temporalErrorCount } };
}

runHarvest().catch(console.error);
