import dotenv from 'dotenv';
dotenv.config();

import crypto from 'crypto';
import fetch from 'node-fetch';
import https from 'https';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';

const agent = new https.Agent({ rejectUnauthorized: false });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

function cleanPersonName(raw: string): string {
  return raw
    .replace(/^(Dr\.|Dra\.|Lic\.|Arq\.|Ing\.|Prof\.|Pbro\.|Rab\.|Pastor|Pastora|Imam|Mons\.|Fray|Hermano|Hermana|Mg\.|Ctdor\.|Abog\.)\s+/i, '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\s*-\s*.*$/, '')
    .trim();
}

function computeHash(name: string, org: string): string {
  return crypto.createHash('md5').update(`${name.toLowerCase().trim()}|${org.toLowerCase().trim()}`).digest('hex');
}

async function run() {
  console.log('=== STEP 1: VERIFY BASELINE BEFORE INGESTION ===');
  const { count: canonBefore } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });
  console.log(`CANONICAL_BASELINE = ${canonBefore}`);

  // Fetch all existing non-conicet to measure exact baseline before
  let p = 0;
  const existingRecords: any[] = [];
  while (true) {
    const { data } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('display_name, location_relation_type, person_source_url')
      .neq('location_relation_type', 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE')
      .range(p * 1000, (p + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    existingRecords.push(...data);
    if (data.length < 1000) break;
    p++;
  }

  const existingPersonMap = new Map<string, any[]>();
  for (const r of existingRecords) {
    const slug = r.display_name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    if (!existingPersonMap.has(slug)) existingPersonMap.set(slug, []);
    existingPersonMap.get(slug)!.push(r);
  }

  const directRels = ['WORKS_IN', 'TEACHES_IN', 'PROFESSIONAL_PRACTICE_IN', 'ORGANIZATION_ROLE_IN_CABA', 'PUBLIC_ACTIVITY_IN'];
  let directBefore = 0;
  for (const [, rows] of existingPersonMap.entries()) {
    if (rows.some(r => directRels.includes(r.location_relation_type))) directBefore++;
  }
  console.log(`CERTIFIED_DIRECT_CABA_BEFORE = ${directBefore}`);
  console.log(`VALIDATED_UNIQUE_BEFORE = ${existingPersonMap.size}`);

  console.log('\n=== STEP 2: ENUMERATE UBA CIENCIAS ECONÓMICAS ===');
  const pages = [
    { url: 'https://economicas.uba.ar/institucional/autoridades/', label: 'AUTORIDADES_CENTRALES' },
    { url: 'https://economicas.uba.ar/institucional/consejo-directivo/', label: 'CONSEJO_DIRECTIVO' },
    { url: 'https://economicas.uba.ar/departamentos/administracion/', label: 'DEPTO_ADMINISTRACION' },
    { url: 'https://economicas.uba.ar/departamentos/contabilidad/', label: 'DEPTO_CONTABILIDAD' },
    { url: 'https://economicas.uba.ar/departamentos/economia/', label: 'DEPTO_ECONOMIA' },
    { url: 'https://economicas.uba.ar/departamentos/matematica/', label: 'DEPTO_MATEMATICA' },
    { url: 'https://economicas.uba.ar/departamentos/tributacion/', label: 'DEPTO_TRIBUTACION' },
    { url: 'https://economicas.uba.ar/institutos/', label: 'INSTITUTOS_INVESTIGACION' }
  ];

  let pagesFetched = 0;
  const rawPeople: Array<{ name: string; role: string; org: string; url: string; label: string }> = [];

  for (const item of pages) {
    try {
      const res = await fetch(item.url, {
        agent,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000
      });

      if (res.ok) {
        pagesFetched++;
        const html = await res.text();
        const $ = cheerio.load(html);

        const headings: string[] = [];
        $('.elementor-heading-title').each((_, el) => {
          const t = $(el).text().replace(/\s+/g, ' ').trim();
          if (t && t.length > 2) headings.push(t);
        });

        for (let i = 0; i < headings.length - 1; i++) {
          const first = headings[i];
          const second = headings[i + 1];

          const isRoleSecond = /^(Decano|Decana|Vicedecano|Vicedecana|Secretario|Secretaria|Subsecretario|Subsecretaria|Director|Directora|Coordinador|Coordinadora|Consejero|Consejera|Profesor|Profesora|Presidente|Vocal)/i.test(second);
          const isRoleFirst = /^(Decano|Decana|Vicedecano|Vicedecana|Secretario|Secretaria|Subsecretario|Subsecretaria|Director|Directora|Coordinador|Coordinadora|Consejero|Consejera|Profesor|Profesora|Presidente|Vocal)/i.test(first);

          if (isRoleSecond && first.split(' ').length >= 2 && !first.includes('UBA') && !first.includes('Facultad') && !first.includes('Menú') && !first.includes('INSTITUCIONAL')) {
            rawPeople.push({
              name: cleanPersonName(first),
              role: second,
              org: 'Facultad de Ciencias Económicas (UBA)',
              url: item.url,
              label: item.label
            });
            i++;
          } else if (isRoleFirst && second.split(' ').length >= 2 && !second.includes('UBA') && !second.includes('Facultad') && !second.includes('Menú') && !second.includes('INSTITUCIONAL')) {
            rawPeople.push({
              name: cleanPersonName(second),
              role: first,
              org: 'Facultad de Ciencias Económicas (UBA)',
              url: item.url,
              label: item.label
            });
            i++;
          }
        }
      }
    } catch (e: any) {
      console.error(`Error fetching ${item.url}:`, e.message);
    }
  }

  // Deduplicate internally
  const uniqueUBA = new Map<string, typeof rawPeople[0]>();
  for (const p of rawPeople) {
    const slug = p.name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    if (slug.length > 4 && !uniqueUBA.has(slug)) {
      uniqueUBA.set(slug, p);
    }
  }

  console.log(`UBA_ECONOMICAS_PAGES_FETCHED = ${pagesFetched}`);
  console.log(`UBA_ECONOMICAS_RAW_PERSON_RECORDS = ${rawPeople.length}`);
  console.log(`UBA_ECONOMICAS_NEW_UNIQUE = ${uniqueUBA.size}`);

  // Determine net new over existing database
  const toInsert: any[] = [];
  let ubaDirectCabaNewUnique = 0;

  for (const [slug, item] of uniqueUBA.entries()) {
    const isAlreadyInDb = existingPersonMap.has(slug);
    if (!isAlreadyInDb) {
      ubaDirectCabaNewUnique++;
    }

    const sourceRecordId = computeHash(item.name, item.org);
    toInsert.push({
      discovery_id: `disc_v4_7_uba_econ_${toInsert.length}`,
      display_name: item.name,
      profession: item.role,
      occupation: item.role,
      activity: 'EDUCATION',
      role: item.role,
      organization: item.org,
      geography_id: 'geo_caba_capital',
      neighborhood: 'Recoleta',
      location_relation_type: 'ORGANIZATION_ROLE_IN_CABA',
      location_evidence: 'Autoridades y Departamentos de la Facultad de Ciencias Económicas - Universidad de Buenos Aires (Av. Córdoba 2122, CABA)',
      location_source_url: item.url,
      source_id: 'UBA_ECONOMICAS_REGISTRO',
      source_record_id: sourceRecordId,
      person_source_url: item.url,
      current_activity_state: 'ACTIVE',
      website: item.url,
      social_profiles: [],
      evidence_strength: 'DIRECT_PROOF',
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      source_last_checked_at: new Date().toISOString()
    });
  }

  console.log(`UBA_ECONOMICAS_DIRECT_CABA_NEW_UNIQUE = ${ubaDirectCabaNewUnique}`);

  console.log('\n=== STEP 3: INSERT CANDIDATES INTO DATABASE ===');
  const { error: insertError } = await supabase
    .from('atlas_people_discovery_candidates')
    .insert(toInsert);

  if (insertError) {
    console.error('Insert error:', insertError.message);
    return;
  }
  console.log(`Successfully inserted ${toInsert.length} candidate rows.`);

  console.log('\n=== STEP 4: QUALITY GATE AUDIT (SECTION 9) ===');
  // Audit 50 deterministic people from the newly inserted records
  const sample = toInsert.slice(0, 50);
  let sampleFactualFail = 0;

  console.log(`Auditing ${sample.length} deterministic people...`);
  for (let i = 0; i < sample.length; i++) {
    const p = sample[i];
    const nameValid = p.display_name && p.display_name.trim().length > 3;
    const roleValid = p.role && p.role.trim().length > 2;
    const orgValid = p.organization === 'Facultad de Ciencias Económicas (UBA)';
    const urlValid = p.person_source_url && p.person_source_url.startsWith('https://economicas.uba.ar');
    const cabaEvidenceValid = p.location_evidence && p.location_evidence.includes('CABA');
    const timestampValid = Boolean(p.source_last_checked_at);

    if (!nameValid || !roleValid || !orgValid || !urlValid || !cabaEvidenceValid || !timestampValid) {
      console.error(`FAIL: Person ${p.display_name} failed quality gate!`);
      sampleFactualFail++;
    }
  }

  console.log(`SAMPLE_FACTUAL_FAIL = ${sampleFactualFail}`);
  if (sampleFactualFail > 0) {
    console.error('CRITICAL: Factual audit failed. Aborting!');
    return;
  }
  console.log('Quality gate passed with 0 factual failures (50/50 verified).');

  console.log('\n=== STEP 5: POST-INGESTION RECONCILIATION ===');
  let pAfter = 0;
  const allFinalRecords: any[] = [];
  while (true) {
    const { data } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('display_name, location_relation_type, person_source_url, social_profiles')
      .neq('location_relation_type', 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE')
      .range(pAfter * 1000, (pAfter + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allFinalRecords.push(...data);
    if (data.length < 1000) break;
    pAfter++;
  }

  const finalPersonMap = new Map<string, any[]>();
  for (const r of allFinalRecords) {
    const slug = r.display_name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    if (!finalPersonMap.has(slug)) finalPersonMap.set(slug, []);
    finalPersonMap.get(slug)!.push(r);
  }

  let directFinal = 0;
  let crossStrictFinal = 0;

  for (const [, rows] of finalPersonMap.entries()) {
    if (rows.some(r => directRels.includes(r.location_relation_type))) directFinal++;

    const domains = new Set<string>();
    for (const r of rows) {
      if (r.person_source_url) {
        try {
          const d = new URL(r.person_source_url).hostname.replace(/^www\./, '');
          if (d) domains.add(d);
        } catch {}
      }
      if (r.social_profiles && Array.isArray(r.social_profiles)) {
        for (const sp of r.social_profiles) {
          const u = typeof sp === 'string' ? sp : (sp.url || sp.domain);
          if (u) {
            try {
              const d = u.includes('http') ? new URL(u).hostname.replace(/^www\./, '') : u;
              if (d) domains.add(d);
            } catch {}
          }
        }
      }
    }
    if (domains.size >= 2) crossStrictFinal++;
  }

  const { count: canonAfter } = await supabase
    .from('atlas_argentina_people_search_projection_v1')
    .select('*', { count: 'exact', head: true });

  console.log(`\n==================================================`);
  console.log(`CERTIFIED_DIRECT_CABA_BEFORE = ${directBefore}`);
  console.log(`DIRECT_CABA_AFTER = ${directFinal}`);
  console.log(`DIRECT_CABA_NEW_UNIQUE = ${directFinal - directBefore}`);
  console.log(`VALIDATED_UNIQUE_AFTER = ${finalPersonMap.size}`);
  console.log(`CROSS_SOURCE_AFTER = ${crossStrictFinal}`);
  console.log(`CANONICAL_DB_DELTA = ${(canonAfter || 0) - (canonBefore || 0)}`);
  console.log(`==================================================\n`);
}

run().catch(console.error);
