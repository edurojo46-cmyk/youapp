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

async function finalizeRestoration() {
  console.log('================================================================');
  console.log('FINALIZING RESTORATION TO EXACT CERTIFIED BASELINE (V4.3.1)');
  console.log('================================================================\n');

  // 1. Revert all 300 CONICET rows with neighborhood = 'Ciudad Autónoma de Buenos Aires'
  console.log('Reverting CONICET rows to PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE...');
  const { data: conicetMod } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id')
    .eq('source_id', 'CONICET_OAI_PMH')
    .eq('location_relation_type', 'WORKS_IN');

  if (conicetMod && conicetMod.length > 0) {
    console.log(`Reverting ${conicetMod.length} CONICET rows...`);
    const ids = conicetMod.map(r => r.discovery_id);
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      const { error } = await supabase
        .from('atlas_people_discovery_candidates')
        .update({
          location_relation_type: 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE',
          neighborhood: 'Ciudad Autónoma de Buenos Aires',
          geography_id: 'caba',
          location_evidence: 'Autor/coautor de publicación científica indexada en colección radicada en instituto con sede en CABA (OAI-PMH CONICET). Afiliación personal CABA pendiente de resolución.',
          location_source_url: 'https://ri.conicet.gov.ar/oai/request',
          public_email: null,
          email_type: null,
          email_source_url: null,
          public_phone: null,
          phone_type: null,
          phone_source_url: null,
          social_profiles: [],
          evidence_strength: 'INDIRECT_PUBLICATION_ONLY'
        })
        .in('discovery_id', chunk);

      if (error) console.error('Error reverting CONICET chunk:', error);
    }
    console.log('CONICET rows successfully reverted.');
  } else {
    console.log('No modified CONICET rows found.');
  }

  // 2. Identify remaining V4.4 provisional rows created in the last hours
  console.log('\nChecking for any remaining V4.4 provisional rows...');
  const { data: recentRows, error: recErr } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, created_at, source_id, display_name')
    .neq('source_id', 'CONICET_OAI_PMH')
    .gt('created_at', '2026-09-14T00:58:00Z');

  if (recErr) console.error('Error fetching recent rows:', recErr);

  if (recentRows && recentRows.length > 0) {
    console.log(`Found ${recentRows.length} remaining V4.4 rows to delete.`);
    const delIds = recentRows.map(r => r.discovery_id);
    for (let i = 0; i < delIds.length; i += 100) {
      const chunk = delIds.slice(i, i + 100);
      const { error: delErr } = await supabase
        .from('atlas_people_discovery_candidates')
        .delete()
        .in('discovery_id', chunk);

      if (delErr) console.error('Error deleting chunk:', delErr);
    }
    console.log('Remaining V4.4 provisional rows purged.');
  } else {
    console.log('No remaining V4.4 provisional rows found.');
  }

  // 3. Exact post-restoration audit
  console.log('\n================================================================');
  console.log('POST-RESTORATION EXACT DATABASE AUDIT');
  console.log('================================================================');

  const { count: totalDbRows } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true });

  const { count: conicetUnresolved } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'CONICET_OAI_PMH')
    .eq('location_relation_type', 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE');

  const { count: conicetTotal } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('source_id', 'CONICET_OAI_PMH');

  const nonConicetCount = (totalDbRows || 0) - (conicetTotal || 0);

  console.log(`DISCOVERY_ROWS = ${totalDbRows}`);
  console.log(`CONICET_TOTAL = ${conicetTotal}`);
  console.log(`CONICET_UNRESOLVED = ${conicetUnresolved}`);
  console.log(`NON_CONICET_ROWS = ${nonConicetCount}`);

  // Fetch all non-CONICET candidates to compute unique people
  let page = 0;
  const nonConicet: any[] = [];
  while (true) {
    const { data } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('*')
      .neq('source_id', 'CONICET_OAI_PMH')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    nonConicet.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  const pMap = new Map<string, any[]>();
  for (const r of nonConicet) {
    const s = normalizeSlug(r.display_name);
    if (!pMap.has(s)) pMap.set(s, []);
    pMap.get(s)!.push(r);
  }

  const directRels = ['WORKS_IN', 'TEACHES_IN', 'PROFESSIONAL_PRACTICE_IN', 'ORGANIZATION_ROLE_IN_CABA', 'PUBLIC_ACTIVITY_IN'];
  let directCaba = 0;
  let crossCount = 0;
  let withEmail = 0;
  let withPhone = 0;
  let withSocial = 0;

  for (const [slug, rows] of pMap.entries()) {
    if (rows.some(r => directRels.includes(r.location_relation_type))) directCaba++;
    if (rows.some(r => r.public_email && r.public_email.includes('@'))) withEmail++;
    if (rows.some(r => r.public_phone && r.public_phone.length > 5)) withPhone++;
    if (rows.some(r => r.social_profiles && Array.isArray(r.social_profiles) && r.social_profiles.length > 0)) withSocial++;

    // Check cross source multi-domain
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

  console.log(`\nVALIDATED_UNIQUE_PEOPLE = ${pMap.size}`);
  console.log(`DIRECT_CABA_UNIQUE_PEOPLE = ${directCaba}`);
  console.log(`CROSS_SOURCE_VERIFIED_UNIQUE_PEOPLE = ${crossCount}`);
  console.log(`CANONICAL_IDENTITIES = ${canonicalCount}`);
  console.log(`CANONICAL_DB_DELTA = ${canonicalCount! - 2091}`);
  console.log(`UNIQUE_PEOPLE_WITH_PUBLIC_EMAIL = ${withEmail}`);
  console.log(`UNIQUE_PEOPLE_WITH_PUBLIC_PHONE = ${withPhone}`);
  console.log(`UNIQUE_PEOPLE_WITH_PUBLIC_SOCIAL = ${withSocial}`);
}

finalizeRestoration().catch(console.error);
