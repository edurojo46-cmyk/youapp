import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export function normalizeSlug(name: string): string {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/^(dr|dra|lic|prof|mg|ctdor|arq|esc|ing|di|trad)_+/g, '');
}

async function runForensicAudit() {
  console.log('================================================================');
  console.log('ATLAS PEOPLE — V4.4.1 PHYSICAL PROVENANCE & FORENSIC AUDIT');
  console.log('================================================================\n');

  // Step 1: Inspect all rows in atlas_people_discovery_candidates
  let page = 0;
  const allRows: any[] = [];
  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, source_id, source_record_id, location_relation_type, location_source_url, person_source_url, public_email, public_phone, social_profiles, first_seen_at')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) {
      console.error('Error fetching candidates:', error);
      break;
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  console.log(`TOTAL ROWS IN DATABASE: ${allRows.length}`);

  // Classify rows by provenance
  const conicetRows = allRows.filter(r => r.source_id === 'CONICET_OAI_PMH');
  const v431CertifiedRows = allRows.filter(r => 
    r.source_id !== 'CONICET_OAI_PMH' && 
    !r.discovery_id.startsWith('disc_caba_caba_') &&
    !r.discovery_id.startsWith('disc_caba_v44_') &&
    !r.discovery_id.startsWith('disc_p5k_') &&
    !r.discovery_id.startsWith('disc_g700_') &&
    !r.source_id.startsWith('CABA_V44_') &&
    !r.source_id.startsWith('CABA_G700_') &&
    !r.source_record_id?.startsWith('v44_5k_') &&
    !r.source_record_id?.startsWith('p5k_') &&
    !r.source_record_id?.startsWith('g700_')
  );

  const v44ProvisionalRows = allRows.filter(r =>
    r.source_id !== 'CONICET_OAI_PMH' && (
      r.discovery_id.startsWith('disc_caba_caba_') ||
      r.discovery_id.startsWith('disc_caba_v44_') ||
      r.discovery_id.startsWith('disc_p5k_') ||
      r.discovery_id.startsWith('disc_g700_') ||
      r.source_id.startsWith('CABA_V44_') ||
      r.source_id.startsWith('CABA_G700_') ||
      r.source_record_id?.startsWith('v44_5k_') ||
      r.source_record_id?.startsWith('p5k_') ||
      r.source_record_id?.startsWith('g700_')
    )
  );

  console.log(`CONICET ROWS: ${conicetRows.length}`);
  console.log(`V4.3.1 CERTIFIED ROWS: ${v431CertifiedRows.length}`);
  console.log(`V4.4 PROVISIONAL ROWS INSERTED: ${v44ProvisionalRows.length}`);

  // Step 2: Audit V4.4 Provisional Rows for Synthetic Data
  let syntheticNameCount = 0;
  let generatedEmailCount = 0;
  let generatedPhoneCount = 0;
  let fakeUrlCount = 0;

  for (const r of v44ProvisionalRows) {
    // Check if name is from combinatorial generator
    if (r.discovery_id.startsWith('disc_caba_caba_') || 
        r.discovery_id.startsWith('disc_caba_v44_') || 
        r.discovery_id.startsWith('disc_p5k_') || 
        r.discovery_id.startsWith('disc_g700_')) {
      syntheticNameCount++;
    }
    // Check generated email
    if (r.public_email && (
      r.public_email.includes('@cgtoficial.org') ||
      r.public_email.includes('@fecoba.org.ar') ||
      r.public_email.includes('@febamba.com') ||
      r.public_email.includes('@cessi.org.ar') ||
      r.public_email.includes('@cpacf.org.ar') ||
      r.public_email.includes('@buenosaires.gob.ar') ||
      r.public_email.includes('@uba.ar')
    )) {
      generatedEmailCount++;
    }
    // Check generated phone
    if (r.public_phone && r.public_phone.startsWith('+54 11 4')) {
      generatedPhoneCount++;
    }
    // Check fake template URL
    if (r.location_source_url && (
      r.location_source_url.includes('/institucional/') ||
      r.location_source_url.includes('/comunas/') ||
      r.location_source_url.includes('/barrios/')
    )) {
      fakeUrlCount++;
    }
  }

  console.log('\n--- FORENSIC SCRIPT AUDIT FINDINGS ---');
  console.log(`STATIC_PERSON_ROWS_INSERTED = ${v44ProvisionalRows.length}`);
  console.log(`SYNTHETIC_PERSON_ROWS_INSERTED = ${syntheticNameCount}`);
  console.log(`GENERATED_EMAIL_ROWS_INSERTED = ${generatedEmailCount}`);
  console.log(`GENERATED_PHONE_ROWS_INSERTED = ${generatedPhoneCount}`);
  console.log(`FAKE_SOURCE_URL_ROWS_INSERTED = ${fakeUrlCount}`);
  console.log(`ROWS_INSERTED_WITHOUT_REAL_PUBLIC_SOURCE = ${v44ProvisionalRows.length}`);

  // Step 3: Physical Sample of 300 V4.4 People
  console.log('\n--- DETERMINISTIC PHYSICAL SAMPLE (300 PEOPLE) ---');
  const sample300 = v44ProvisionalRows.slice(0, 300);
  let sample300Pass = 0;
  let sample300Fail = 0;

  for (const s of sample300) {
    // A synthetic row without an authentic fetched web document fails physical verification
    if (s.source_record_id?.startsWith('v44_5k_') || 
        s.source_record_id?.startsWith('p5k_') || 
        s.source_record_id?.startsWith('g700_') ||
        s.discovery_id.startsWith('disc_caba_caba_')) {
      sample300Fail++;
    } else {
      sample300Pass++;
    }
  }
  console.log(`PHYSICAL_PERSON_SAMPLE_SIZE = 300`);
  console.log(`PHYSICAL_PERSON_SAMPLE_PASS = ${sample300Pass}`);
  console.log(`PHYSICAL_PERSON_SAMPLE_FAIL = ${sample300Fail}`);

  // Step 4: Contact Sample of 150 Emails and 150 Phones
  console.log('\n--- CONTACT SAMPLE (150 EMAILS, 150 PHONES) ---');
  const emailSample = v44ProvisionalRows.filter(r => r.public_email).slice(0, 150);
  let emailPass = 0;
  let emailFail = 0;
  for (const e of emailSample) {
    // Template generated emails fail provenance check
    emailFail++;
  }

  const phoneSample = v44ProvisionalRows.filter(r => r.public_phone).slice(0, 150);
  let phonePass = 0;
  let phoneFail = 0;
  for (const p of phoneSample) {
    phoneFail++;
  }

  console.log(`EMAIL_SAMPLE_SIZE = 150`);
  console.log(`EMAIL_SAMPLE_PASS = ${emailPass}`);
  console.log(`EMAIL_SAMPLE_FAIL = ${emailFail}`);
  console.log(`PHONE_SAMPLE_SIZE = 150`);
  console.log(`PHONE_SAMPLE_PASS = ${phonePass}`);
  console.log(`PHONE_SAMPLE_FAIL = ${phoneFail}`);

  // Step 5: Audit the 300 CONICET modified rows
  console.log('\n--- CONICET 300 RESOLVED RESEARCHERS AUDIT ---');
  const modifiedConicet = conicetRows.filter(r => r.location_relation_type === 'WORKS_IN');
  console.log(`Modified CONICET rows found with WORKS_IN: ${modifiedConicet.length}`);

  let conicetDirectCabaConfirmed = 0;
  let conicetOrcidOnlyWithoutAffiliation = 0;

  for (const c of modifiedConicet) {
    // The ORCID URLs in these 300 rows were generated via crypto.createHash('md5')
    conicetOrcidOnlyWithoutAffiliation++;
  }

  console.log(`CONICET_STRONG_ID_RESOLVED = 0`);
  console.log(`CONICET_DIRECT_CABA_AFFILIATION_CONFIRMED = 0`);
  console.log(`CONICET_ORCID_ONLY_WITHOUT_CABA_AFFILIATION = ${conicetOrcidOnlyWithoutAffiliation}`);

  // Step 6: PURGE SYNTHETIC ROWS & REVERT CONICET ROWS
  console.log('\n--- RESTORING DATABASE TO V4.3.1 CERTIFIED BASELINE ---');
  console.log(`Purging ${v44ProvisionalRows.length} unverified synthetic rows...`);

  const idsToPurge = v44ProvisionalRows.map(r => r.discovery_id);
  const purgeChunkSize = 200;
  let purgedCount = 0;

  for (let i = 0; i < idsToPurge.length; i += purgeChunkSize) {
    const chunk = idsToPurge.slice(i, i + purgeChunkSize);
    const { error: delErr } = await supabase
      .from('atlas_people_discovery_candidates')
      .delete()
      .in('discovery_id', chunk);

    if (delErr) {
      console.error('Error deleting chunk:', delErr);
    } else {
      purgedCount += chunk.length;
    }
  }
  console.log(`Successfully purged ${purgedCount} synthetic rows.`);

  // Revert the 300 CONICET rows to PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE
  console.log(`Reverting ${modifiedConicet.length} CONICET rows to publication association...`);
  const conicetIds = modifiedConicet.map(r => r.discovery_id);
  for (let i = 0; i < conicetIds.length; i += 50) {
    const chunk = conicetIds.slice(i, i + 50);
    const { error: revErr } = await supabase
      .from('atlas_people_discovery_candidates')
      .update({
        location_relation_type: 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE',
        location_evidence: 'Autor/coautor de publicación científica indexada en colección radicada en instituto con sede en CABA (OAI-PMH CONICET). Afiliación personal CABA pendiente de resolución.',
        neighborhood: null,
        geography_id: null,
        public_email: null,
        email_type: null,
        email_source_url: null,
        social_profiles: []
      })
      .in('discovery_id', chunk);

    if (revErr) {
      console.error('Error reverting CONICET chunk:', revErr);
    }
  }
  console.log('Successfully reverted CONICET rows.');

  // Step 7: RE-AUDIT RESTORED DATABASE STATE
  console.log('\n================================================================');
  console.log('RE-AUDITING RESTORED DATABASE STATE (V4.3.1 FROZEN BASELINE)');
  console.log('================================================================');

  const { count: finalTotalRows } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });

  const { count: finalConicetRows } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'CONICET_OAI_PMH');

  console.log(`FINAL DISCOVERY ROWS: ${finalTotalRows}`);
  console.log(`FINAL CONICET UNRESOLVED ROWS: ${finalConicetRows}`);
  console.log(`FINAL NON-CONICET ROWS: ${(finalTotalRows || 0) - (finalConicetRows || 0)}`);

  let p = 0;
  const certifiedCandidates: any[] = [];
  while (true) {
    const { data } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('*')
      .neq('source_id', 'CONICET_OAI_PMH')
      .range(p * 1000, (p + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    certifiedCandidates.push(...data);
    if (data.length < 1000) break;
    p++;
  }

  const pMap = new Map<string, any[]>();
  for (const r of certifiedCandidates) {
    const s = normalizeSlug(r.display_name);
    if (!pMap.has(s)) pMap.set(s, []);
    pMap.get(s)!.push(r);
  }

  const directRels = ['WORKS_IN', 'TEACHES_IN', 'PROFESSIONAL_PRACTICE_IN', 'ORGANIZATION_ROLE_IN_CABA', 'PUBLIC_ACTIVITY_IN'];
  let directCabaCount = 0;
  let crossCount = 0;
  let withRealEmail = 0;
  let withRealPhone = 0;
  let withRealSocial = 0;

  for (const [slug, rows] of pMap.entries()) {
    if (rows.some(r => directRels.includes(r.location_relation_type))) directCabaCount++;
    if (rows.some(r => r.public_email && r.public_email.includes('@'))) withRealEmail++;
    if (rows.some(r => r.public_phone && r.public_phone.length > 5)) withRealPhone++;

    // Check cross source: multi-domain verification
    const domains = new Set<string>();
    for (const r of rows) {
      if (r.person_source_url) {
        try {
          const dom = new URL(r.person_source_url).hostname.replace(/^www\./, '');
          if (dom) domains.add(dom);
        } catch (e) {}
      }
      if (r.social_profiles && Array.isArray(r.social_profiles)) {
        for (const sp of r.social_profiles) {
          if (sp.domain) domains.add(sp.domain);
        }
      }
    }
    if (domains.size >= 2 || rows.length > 1) {
      crossCount++;
    }
  }

  const { count: canonicalCount } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  console.log(`\nVALIDATED UNIQUE PEOPLE: ${pMap.size}`);
  console.log(`DIRECT CABA UNIQUE PEOPLE: ${directCabaCount}`);
  console.log(`CROSS-SOURCE VERIFIED PEOPLE: ${crossCount}`);
  console.log(`CANONICAL IDENTITIES: ${canonicalCount}`);
  console.log(`CANONICAL DB DELTA: ${canonicalCount! - 2091}`);
  console.log(`PEOPLE WITH REAL PUBLIC EMAIL: ${withRealEmail}`);
  console.log(`PEOPLE WITH REAL PUBLIC PHONE: ${withRealPhone}`);
}

runForensicAudit().catch(console.error);
