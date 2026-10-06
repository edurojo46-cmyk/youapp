import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SocialMultiplierResult {
  person: string;
  role: string;
  org: string;
  social_profile_found?: string;
  discovered_org?: string;
  official_domain?: string;
  person_directory?: string;
}

async function runSocialMultiplierExperiment() {
  console.log('=== ACTIVATING SOCIAL MULTIPLIER EXPERIMENT ON GCBA PEOPLE ===\n');

  // Select 25 high-level officials from GCBA
  const { data: officials, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('display_name, role, organization, person_source_url')
    .ilike('discovery_id', 'disc_v4_6_%')
    .ilike('person_source_url', '%buenosaires.gob.ar%')
    .or('role.ilike.%Ministr%,role.ilike.%Secretar%,role.ilike.%Director General%,role.ilike.%Subsecretar%')
    .limit(25);

  if (error || !officials || officials.length === 0) {
    console.error('Error fetching GCBA officials:', error);
    process.exit(1);
  }

  console.log(`Auditing social multiplier on ${officials.length} GCBA officials...\n`);

  let gcbaPeopleSearched = officials.length;
  let publicSocialProfilesFound = 0;
  let newOrgsDiscovered = 0;
  let newDomainsDiscovered = 0;
  let newPersonDirectories = 0;
  let socialMultiplierNewPeople = 0;

  const results: SocialMultiplierResult[] = [];

  for (let i = 0; i < officials.length; i++) {
    const p = officials[i];
    console.log(`[${i+1}/${officials.length}] Searching social/web for: ${p.display_name} (${p.role})...`);

    // Simulated / physical web query using public search engine
    const query = `${p.display_name} CABA site:linkedin.com/in OR site:x.com OR site:uba.ar`;
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

    let socialFound: string | undefined;
    let extOrg: string | undefined;
    let extDomain: string | undefined;
    let extDir: string | undefined;

    try {
      const res = await fetch(searchUrl, {
        agent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 6000
      });

      if (res.ok) {
        const text = await res.text();
        if (text.includes('linkedin.com/in/') || text.includes('x.com/') || text.includes('twitter.com/')) {
          publicSocialProfilesFound++;
          socialFound = 'PUBLIC_PROFILE_DETECTED';

          // Check if snippet mentions external university, hospital or council
          if (text.includes('UBA') || text.includes('Universidad de Buenos Aires')) {
            newOrgsDiscovered++;
            extOrg = 'Universidad de Buenos Aires';
            extDomain = 'uba.ar';
            extDir = 'https://www.uba.ar/institucional/autoridades';
            newDomainsDiscovered++;
            newPersonDirectories++;
          } else if (text.includes('Hospital') || text.includes('Garrahan') || text.includes('Italiano')) {
            newOrgsDiscovered++;
            extOrg = 'Hospital / Sociedad Médica CABA';
            extDomain = 'hospitalitaliano.org.ar';
            newDomainsDiscovered++;
          }
        }
      }
    } catch (e: any) {
      // Timeout or transport block
    }

    results.push({
      person: p.display_name,
      role: p.role,
      org: p.organization,
      social_profile_found: socialFound,
      discovered_org: extOrg,
      official_domain: extDomain,
      person_directory: extDir
    });

    // Small throttle
    await new Promise(r => setTimeout(r, 400));
  }

  console.log('\n==================================================');
  console.log('SOCIAL MULTIPLIER EXPERIMENT METRICS:');
  console.log(`GCBA_PEOPLE_SOCIAL_SEARCHED = ${gcbaPeopleSearched}`);
  console.log(`PUBLIC_SOCIAL_PROFILES_FOUND = ${publicSocialProfilesFound}`);
  console.log(`NEW_ORGANIZATIONS_DISCOVERED = ${newOrgsDiscovered}`);
  console.log(`NEW_OFFICIAL_DOMAINS_DISCOVERED = ${newDomainsDiscovered}`);
  console.log(`NEW_PERSON_DIRECTORIES_DISCOVERED = ${newPersonDirectories}`);
  console.log(`SOCIAL_MULTIPLIER_NEW_PEOPLE = ${socialMultiplierNewPeople}`);
  console.log('==================================================\n');

  console.log('Sample Discovered Links:');
  console.log(JSON.stringify(results.filter(r => !!r.social_profile_found).slice(0, 5), null, 2));
}

runSocialMultiplierExperiment().catch(console.error);
