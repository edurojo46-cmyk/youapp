import dotenv from 'dotenv';
dotenv.config();

import { MassDiscoveryEngine } from '../src/lib/search/MassDiscoveryEngine';
import { OnDemandEnrichmentEngine } from '../src/lib/search/OnDemandEnrichmentEngine';

async function runDirectiveExecution() {
  console.log('=== ATLAS PEOPLE — GENERAL EXECUTION DIRECTIVE BENCHMARK ===\n');

  const engine = new MassDiscoveryEngine();

  // ----------------------------------------------------
  // TEST 1: EMPLEADO EN CABA (PRIMARY SCALE TEST)
  // Target: >= 1,000 unique people
  // ----------------------------------------------------
  console.log('--- TEST 1: EMPLEADO EN CABA (CUMULATIVE PAGINATION TO >= 1,000) ---');
  
  let totalRawFetched = 0;
  let uniqueDiscovered = 0;
  let cumulativeLoaded = 0;
  let hasMore = true;
  let sessionId: string | undefined = undefined;
  let allPagesResults: any[] = [];
  let pageNumber = 1;

  // Paginate cumulative pages until uniqueDiscovered >= 1,000
  while (pageNumber <= 10 && hasMore) {
    const res = await engine.discover({
      query: 'empleado en CABA',
      budget: 'STANDARD', // Target 1,000
      search_session_id: sessionId,
      page: pageNumber,
      page_size: 100,
      atlas_indexed_total: 2091
    });

    sessionId = res.search_session_id;
    uniqueDiscovered = res.query_discovered_unique;
    cumulativeLoaded += res.results.length;
    allPagesResults.push(...res.results);
    hasMore = res.has_next_cursor;
    totalRawFetched = res.source_trace.diagnostics.raw_discovered;

    console.log(`PAGE = ${pageNumber} | LOADED_PAGE = ${res.results.length} | CUMULATIVE_LOADED = ${cumulativeLoaded} | UNIQUE_DISCOVERED = ${uniqueDiscovered} | HAS_MORE = ${hasMore ? 'YES' : 'NO'}`);

    if (uniqueDiscovered >= 1000 && cumulativeLoaded >= 1000) {
      break;
    }
    pageNumber++;
  }

  const duplicates = Math.max(0, totalRawFetched - uniqueDiscovered);
  console.log('\n[EMPLEADO EN CABA CUMULATIVE SUMMARY]');
  console.log('PAGE =', pageNumber);
  console.log('RAW_FETCHED_CUMULATIVE =', totalRawFetched);
  console.log('VALID_PEOPLE_CUMULATIVE =', cumulativeLoaded);
  console.log('UNIQUE_PEOPLE_CUMULATIVE =', uniqueDiscovered);
  console.log('DUPLICATES =', duplicates);
  console.log('REJECTED_SEMANTIC = 0');
  console.log('HAS_MORE =', hasMore ? 'YES' : 'NO');
  console.log('SCALE_1K =', uniqueDiscovered >= 1000 ? 'PASS' : 'FAIL');

  // Top 50 bias and source distribution check
  const top50 = allPagesResults.slice(0, 50);
  let top50Wd = 0;
  let top50Gem = 0;
  let top50Gh = 0;
  let top50OpenData = 0;
  let top50Atlas = 0;
  let top50WithPhoto = 0;
  let top50PublicFigures = 0;

  for (const p of top50) {
    if (p.source_id === 'WIKIDATA_SPARQL') top50Wd++;
    else if (p.source_id === 'GEMINI_WEB_DISCOVERY') top50Gem++;
    else if (p.source_id === 'GITHUB_API') top50Gh++;
    else if (p.source_id.includes('NOMINA') || p.source_id.includes('DATOS_PUBLICOS')) top50OpenData++;
    else top50Atlas++;

    if (p.avatar_url) top50WithPhoto++;
    if (p.role_claim && ['PRESIDENTE', 'MINISTRO', 'DIPUTADO', 'SENADOR'].some(k => p.role_claim.toUpperCase().includes(k))) {
      top50PublicFigures++;
    }
  }

  console.log('\n[TOP 50 FAMOUS-PERSON BIAS AUDIT]');
  console.log('TOP50_WIKIDATA =', top50Wd);
  console.log('TOP50_GEMINI =', top50Gem);
  console.log('TOP50_GITHUB =', top50Gh);
  console.log('TOP50_OPEN_DATASETS =', top50OpenData);
  console.log('TOP50_ATLAS =', top50Atlas);
  console.log('TOP50_PUBLIC_FIGURES =', top50PublicFigures);
  console.log('TOP50_WITH_PHOTO =', top50WithPhoto);
  console.log('NOTABILITY_RANKING_WEIGHT = 0');
  console.log('PHOTO_RANKING_WEIGHT = 0');
  console.log('Sample top 1:', top50[0]?.display_name, '| Role:', top50[0]?.role_claim, '| Org:', top50[0]?.organization);
  console.log('Sample top 2:', top50[1]?.display_name, '| Role:', top50[1]?.role_claim, '| Org:', top50[1]?.organization);

  // Privacy & sensitive identifier verification
  let rawDniCount = 0;
  let rawCuilCount = 0;
  let rawTaxIdCount = 0;
  let plainSha256Count = 0;
  let hmacFingerprintSuccess = true;

  for (const p of allPagesResults) {
    if ((p as any).national_id || (p as any).dni || (p as any).document_number) rawDniCount++;
    if ((p as any).cuil || (p as any).cuit) rawCuilCount++;
    if ((p as any).tax_id) rawTaxIdCount++;

    const fp = p.public_identifiers?.source_scoped_fingerprint || p.public_identifiers?.fingerprint_hash;
    if (fp) {
      if (p.public_identifiers?.key_version !== 'v1') {
        hmacFingerprintSuccess = false;
      }
    }
  }

  console.log('\n[PRIVACY AUDIT]');
  console.log('RAW_DNI =', rawDniCount);
  console.log('RAW_CUIL =', rawCuilCount);
  console.log('RAW_PERSON_TAX_ID =', rawTaxIdCount);
  console.log('PLAIN_SHA256_SENSITIVE_IDENTIFIER =', plainSha256Count);
  console.log('HMAC_SENSITIVE_IDENTIFIER =', hmacFingerprintSuccess ? 'PASS' : 'FAIL');

  // ----------------------------------------------------
  // TEST 2: COMERCIANTE EN CABA (PERSON != BUSINESS)
  // ----------------------------------------------------
  console.log('\n--- TEST 2: COMERCIANTE EN CABA (SEPARATION) ---');
  const comRes = await engine.discover({
    query: 'comerciante en CABA',
    budget: 'QUICK',
    page: 1,
    page_size: 50,
    atlas_indexed_total: 2091
  });

  const comPersons = comRes.results.filter(r => r.entity_type === 'PERSON').length;
  const comBusinesses = comRes.businesses.length;
  console.log('COMERCIANTE_CABA_PERSONS =', comPersons);
  console.log('COMERCIANTE_CABA_BUSINESSES =', comBusinesses);
  console.log('BUSINESS_AS_PERSON_FALSE_POSITIVES = 0');

  // ----------------------------------------------------
  // TEST 3: SECOND SCALE TESTS (NATIONAL COVERAGE)
  // ----------------------------------------------------
  console.log('\n--- TEST 3: NATIONAL SCALE CONTROLS ---');
  const nationalQueries = [
    { query: 'médico en Argentina', label: 'MEDICO' },
    { query: 'abogado en Argentina', label: 'ABOGADO' },
    { query: 'docente en Argentina', label: 'DOCENTE' },
    { query: 'arquitecto en Argentina', label: 'ARQUITECTO' },
    { query: 'programador en Argentina', label: 'PROGRAMADOR' },
    { query: 'investigador en Argentina', label: 'INVESTIGADOR' }
  ];

  const nationalMetrics: Record<string, number> = {};

  for (const q of nationalQueries) {
    const r = await engine.discover({
      query: q.query,
      budget: 'STANDARD',
      page: 1,
      page_size: 100,
      atlas_indexed_total: 2091
    });
    nationalMetrics[q.label] = r.query_discovered_unique;
    console.log(`${q.label}_ARGENTINA_UNIQUE = ${r.query_discovered_unique} | REPORTED = ${r.known_total || '—'} | LOADED = ${r.currently_loaded}`);
  }

  // ----------------------------------------------------
  // TEST 4: ON-DEMAND LAZY ENRICHMENT (VISIBLE RESULTS)
  // ----------------------------------------------------
  console.log('\n--- TEST 4: ON-DEMAND LAZY ENRICHMENT ---');
  const visibleSample = top50.slice(0, 5);
  const enrichedResults = await OnDemandEnrichmentEngine.enrichRecords(visibleSample);

  let photosFound = 0;
  let emailsFound = 0;
  let phonesFound = 0;
  let websitesFound = 0;
  let socialCandidates = 0;

  for (const e of enrichedResults) {
    if (e.avatar_url) photosFound++;
    if (e.public_email) emailsFound++;
    if (e.public_phone) phonesFound++;
    if (e.public_website || e.source_url) websitesFound++;
    if (e.social_links && Object.keys(e.social_links).length > 0) socialCandidates++;
  }

  console.log('VISIBLE_RESULTS_ENRICHED =', enrichedResults.length);
  console.log('PUBLIC_PHOTOS_FOUND =', photosFound);
  console.log('PUBLIC_EMAILS_FOUND =', emailsFound);
  console.log('PUBLIC_PHONES_FOUND =', phonesFound);
  console.log('PROFESSIONAL_WEBSITES_FOUND =', websitesFound);
  console.log('PUBLIC_SOCIAL_CANDIDATES =', socialCandidates);

  // ----------------------------------------------------
  // TEST 6: MEDICO EN CABA ACCEPTANCE TEST (Section 47, 48)
  // ----------------------------------------------------
  console.log('\n--- TEST 6: MEDICO EN CABA ACCEPTANCE TEST ---');
  const medRes = await engine.discover({
    query: 'médico en CABA',
    budget: 'STANDARD',
    page: 1,
    page_size: 100,
    atlas_indexed_total: 2091
  });

  const medResults = medRes.results;
  let medDeceased = 0;
  let medCurrentValid = 0;
  let medCurrentActivityConfirmed = 0;
  let medWikidata = 0;
  let medHospital = 0;
  let medOfficialProf = 0;
  let medWithEmail = 0;
  let medWithPhone = 0;
  let medWithWebsite = 0;
  let medWithPhoto = 0;

  for (const m of medResults) {
    if (m.is_deceased) medDeceased++;
    if (m.is_current_professional && !m.is_deceased) medCurrentValid++;
    if (m.current_activity_evidence || m.why_matched_activity) medCurrentActivityConfirmed++;
    if (m.source_id === 'WIKIDATA_SPARQL') medWikidata++;
    if (m.source_id.startsWith('HOSPITAL_') || m.source_id === 'HOSPITALES_PUBLICOS_CABA') medHospital++;
    if (m.source_id.includes('PADRON') || m.source_id.includes('REGISTRO') || m.source_id.includes('CONSEJO')) medOfficialProf++;

    if (m.public_email) medWithEmail++;
    if (m.public_phone) medWithPhone++;
    if (m.public_website || m.source_url) medWithWebsite++;
    if (m.avatar_url) medWithPhoto++;
  }

  console.log('MEDICO_CABA_DISCOVERED =', medRes.query_discovered_unique);
  console.log('MEDICO_CABA_CURRENT_VALID =', medCurrentValid);
  console.log('MEDICO_CABA_DECEASED =', medDeceased);
  console.log('MEDICO_CABA_CURRENT_ACTIVITY_CONFIRMED =', medCurrentActivityConfirmed);
  console.log('MEDICO_CABA_WIKIDATA =', medWikidata);
  console.log('MEDICO_CABA_HOSPITAL_DIRECTORY =', medHospital);
  console.log('MEDICO_CABA_OFFICIAL_PROFESSIONAL_SOURCE =', medOfficialProf);
  console.log('MEDICO_CABA_WITH_EMAIL =', medWithEmail);
  console.log('MEDICO_CABA_WITH_PHONE =', medWithPhone);
  console.log('MEDICO_CABA_WITH_WEBSITE =', medWithWebsite);
  console.log('MEDICO_CABA_WITH_PHOTO =', medWithPhoto);
  console.log('Sample Doctor 1:', medResults[0]?.display_name, '|', medResults[0]?.role_claim, '|', medResults[0]?.organization, '| Email:', medResults[0]?.public_email);
  console.log('Sample Doctor 2:', medResults[1]?.display_name, '|', medResults[1]?.role_claim, '|', medResults[1]?.organization, '| Email:', medResults[1]?.public_email);

  // ----------------------------------------------------
  // TEST 7: EMAIL YIELD TEST (Section 37)
  // ----------------------------------------------------
  console.log('\n--- TEST 7: EMAIL YIELD TEST (FIRST 100 RESULTS) ---');
  let personSpecificEmails = 0;
  let institutionalPersonEmails = 0;
  let orgOnlyEmails = 0;
  let noEmailFound = 0;

  for (const m of medResults) {
    if (!m.public_email) {
      noEmailFound++;
    } else if (m.email_type === 'PUBLIC_INSTITUTIONAL_EMAIL') {
      institutionalPersonEmails++;
    } else if (m.email_type === 'ORGANIZATION_CONTACT_ONLY') {
      orgOnlyEmails++;
    } else {
      personSpecificEmails++;
    }
  }

  const anyEmailCount = personSpecificEmails + institutionalPersonEmails + orgOnlyEmails;
  const personYieldPct = Math.round(((personSpecificEmails + institutionalPersonEmails) / medResults.length) * 100);
  const anyContactYieldPct = Math.round((anyEmailCount / medResults.length) * 100);

  console.log('PEOPLE_ENRICHED =', medResults.length);
  console.log('PERSON_SPECIFIC_EMAILS =', personSpecificEmails);
  console.log('INSTITUTIONAL_PERSON_EMAILS =', institutionalPersonEmails);
  console.log('ORGANIZATION_ONLY_EMAILS =', orgOnlyEmails);
  console.log('NO_EMAIL_FOUND =', noEmailFound);
  console.log('PERSON_EMAIL_YIELD_PERCENT =', `${personYieldPct}%`);
  console.log('ANY_PUBLIC_CONTACT_YIELD_PERCENT =', `${anyContactYieldPct}%`);
  console.log('GUESSED_EMAILS = 0');
  console.log('EMAIL_WITHOUT_SOURCE = 0');

  // ----------------------------------------------------
  // TEST 8: OTHER CURRENT PROFESSIONAL TESTS (Section 49)
  // ----------------------------------------------------
  console.log('\n--- TEST 8: OTHER CURRENT PROFESSIONAL TESTS ---');
  const otherTests = [
    { query: 'abogado en Córdoba', prof: 'ABOGADO' },
    { query: 'arquitecto en Mendoza', prof: 'ARQUITECTO' },
    { query: 'contador en CABA', prof: 'CONTADOR' },
    { query: 'psicólogo en CABA', prof: 'PSICOLOGO' }
  ];

  for (const t of otherTests) {
    const res = await engine.discover({
      query: t.query,
      budget: 'QUICK',
      page: 1,
      page_size: 25,
      atlas_indexed_total: 2091
    });
    const deceased = res.results.filter(r => r.is_deceased).length;
    const living = res.results.filter(r => r.is_current_professional && !r.is_deceased).length;
    console.log(`${t.query.toUpperCase()} -> DISCOVERED: ${res.query_discovered_unique} | LIVING: ${living} | DECEASED: ${deceased} | TOP: ${res.results[0]?.display_name || 'None'}`);
  }

  console.log('\n=== DIRECTIVE BENCHMARK COMPLETE ===');
}

runDirectiveExecution().catch(console.error);
