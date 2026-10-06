import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function inspectCrossSource() {
  console.log('=== INSPECTING CANDIDATES FOR CROSS-SOURCE ===');

  let page = 0;
  const allRecords: any[] = [];
  while (true) {
    const { data } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, role, organization, location_evidence, person_source_url, social_profiles, source_id, created_at')
      .neq('location_relation_type', 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allRecords.push(...data);
    if (data.length < 1000) break;
    page++;
  }

  console.log(`Total non-conicet rows in DB: ${allRecords.length}`);

  // Group by slug
  const personMap = new Map<string, any[]>();
  for (const r of allRecords) {
    const slug = r.display_name.toLowerCase().trim().replace(/[^a-z0-9]/g, '_');
    if (!personMap.has(slug)) personMap.set(slug, []);
    personMap.get(slug)!.push(r);
  }

  console.log(`Total unique people: ${personMap.size}`);

  // Check people with UBA Económicas
  const ubaEconCrossPeople: any[] = [];

  for (const [slug, rows] of personMap.entries()) {
    const hasUbaEcon = rows.some(r => r.source_id === 'UBA_ECONOMICAS_REGISTRO' || (r.person_source_url && r.person_source_url.includes('economicas.uba.ar')));
    if (hasUbaEcon) {
      // Collect unique domains
      const domains = new Map<string, any>();
      for (const r of rows) {
        if (r.person_source_url) {
          try {
            const d = new URL(r.person_source_url).hostname.replace(/^www\./, '');
            if (!domains.has(d)) domains.set(d, r);
          } catch {}
        }
        if (r.social_profiles && Array.isArray(r.social_profiles)) {
          for (const sp of r.social_profiles) {
            const u = typeof sp === 'string' ? sp : (sp.url || sp.domain);
            if (u) {
              try {
                const d = u.includes('http') ? new URL(u).hostname.replace(/^www\./, '') : u;
                if (!domains.has(d)) domains.set(d, { ...r, person_source_url: u });
              } catch {}
            }
          }
        }
      }

      if (domains.size >= 2) {
        ubaEconCrossPeople.push({
          slug,
          display_name: rows[0].display_name,
          rows_count: rows.length,
          domains: Array.from(domains.keys()),
          rows_details: rows.map(r => ({
            discovery_id: r.discovery_id,
            source_id: r.source_id,
            role: r.role,
            organization: r.organization,
            person_source_url: r.person_source_url,
            location_evidence: r.location_evidence
          }))
        });
      }
    }
  }

  console.log(`\nPeople with UBA Económicas AND >= 2 domains: ${ubaEconCrossPeople.length}`);
  console.log(JSON.stringify(ubaEconCrossPeople, null, 2));
}

inspectCrossSource().catch(console.error);
