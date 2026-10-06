import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import https from 'https';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

const agent = new https.Agent({ rejectUnauthorized: false });
const MAILTO = 'contact@youapp.com';

async function measureOpenAlexOverlap() {
  console.log('=== OPENALEX CABA AUTHORS — OVERLAP AND NET-NEW MEASUREMENT ===\n');

  // Load existing discovery names
  console.log('Loading existing Atlas discovery candidate names...');
  const existingNames = new Set<string>();
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('display_name')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.display_name) existingNames.add(r.display_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim());
    }
    offset += data.length;
    if (data.length < 1000) break;
  }
  console.log(`Loaded ${existingNames.size} unique normalized names from Discovery.`);

  // Sample 200 authors from UBA and Hospital Italiano
  // Filter for authors with works_count > 1 and display_name containing at least one space (human name check)
  const ubaUrl = `https://api.openalex.org/authors?filter=last_known_institutions.id:I24354313,has_orcid:true&per-page=100&mailto=${MAILTO}`;
  const hospUrl = `https://api.openalex.org/authors?filter=last_known_institutions.id:I2802359038,has_orcid:true&per-page=100&mailto=${MAILTO}`;

  console.log('Fetching 100 UBA authors with ORCID + 100 Hospital Italiano authors with ORCID...');
  const resUba = await fetch(ubaUrl, { agent, headers: { 'User-Agent': 'AtlasHarvester/1.0' } } as any);
  const jsonUba = await resUba.json();
  const resHosp = await fetch(hospUrl, { agent, headers: { 'User-Agent': 'AtlasHarvester/1.0' } } as any);
  const jsonHosp = await resHosp.json();

  const combined = [...(jsonUba.results || []), ...(jsonHosp.results || [])];
  console.log(`Sampled ${combined.length} authors with verified ORCID and CABA institution.`);

  let humanCount = 0;
  let inDiscoveryCount = 0;
  let netNewCount = 0;
  let validOrcidCount = 0;

  for (const a of combined) {
    const name = a.display_name?.trim();
    if (!name || !name.includes(' ') || name.length < 4) continue;
    humanCount++;

    if (a.orcid) validOrcidCount++;

    const norm = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (existingNames.has(norm)) {
      inDiscoveryCount++;
    } else {
      netNewCount++;
    }
  }

  const overlapRate = inDiscoveryCount / humanCount;
  const netNewRate = netNewCount / humanCount;

  console.log('\n--- OPENALEX OVERLAP METRICS ---');
  console.log(`SAMPLE_SIZE:                ${combined.length}`);
  console.log(`HUMAN_NAMES_VERIFIED:       ${humanCount} (${((humanCount / combined.length) * 100).toFixed(1)}%)`);
  console.log(`WITH_ORCID:                 ${validOrcidCount} (${((validOrcidCount / humanCount) * 100).toFixed(1)}%)`);
  console.log(`IN_ATLAS_DISCOVERY:         ${inDiscoveryCount} (${(overlapRate * 100).toFixed(1)}%)`);
  console.log(`NET_NEW_IN_SAMPLE:          ${netNewCount} (${(netNewRate * 100).toFixed(1)}%)`);

  // Total UBA + Hospital Italiano with ORCID
  // UBA: 26,890 * 76% = ~20,400 authors with ORCID
  // Hospital Italiano: 5,965 * 76% = ~4,500 authors with ORCID
  const ubaHospOrcidUniverse = Math.round((26890 + 5965) * 0.76);
  const projectedNetNew = Math.round(ubaHospOrcidUniverse * netNewRate);

  console.log(`\nESTIMATED ORCID POOL (UBA + Hosp. Italiano): ${ubaHospOrcidUniverse} authors`);
  console.log(`PROJECTED NET-NEW CANDIDATES (Just these 2):  ${projectedNetNew} authors`);
}

measureOpenAlexOverlap().catch(console.error);
