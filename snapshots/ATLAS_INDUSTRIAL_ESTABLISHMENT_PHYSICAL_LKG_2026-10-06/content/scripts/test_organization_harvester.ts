import { OrganizationWebsiteHarvester } from '../src/lib/atlasHarvester/people/OrganizationWebsiteHarvester';

async function runPilot() {
  console.log("=== ATLAS V2 ORGANIZATION HARVESTER PILOT ===");
  
  // A set of mock/real domains for the pilot. 
  // In a real scenario, we'd query the DB for approved CABA organizations.
  const pilotOrganizations = [
    { domain: 'vercel.com', name: 'Vercel' }, // Usually has a good team page
    { domain: 'auth0.com', name: 'Auth0' },
    { domain: 'mercadolibre.com.ar', name: 'Mercado Libre' },
    { domain: 'globant.com', name: 'Globant' },
    { domain: 'supabase.com', name: 'Supabase' }
  ];

  let totalPagesFetched = 0;
  let totalPeopleFound = 0;
  let totalExplicitSocialLinks = 0;
  let totalPhotos = 0;

  for (const org of pilotOrganizations) {
     console.log(`\n--- Processing: ${org.name} (${org.domain}) ---`);
     const harvester = new OrganizationWebsiteHarvester(org.domain, org.name);
     
     // 1. Fetch
     const rawData = await harvester.fetch();
     totalPagesFetched += rawData.length;
     console.log(`Pages Fetched: ${rawData.length}`);

     if (rawData.length === 0) {
        console.log("No deterministic pages found. Skipping parsing.");
        continue;
     }

     // 2. Parse
     const parsedData = await harvester.parse(rawData);
     
     // 3. Normalize
     const observations = await harvester.normalize(parsedData);
     
     console.log(`People Found: ${observations.length}`);
     
     for (const obs of observations) {
       console.log(`- [${obs.profession}] ${obs.display_name}`);
       if (obs.social_profiles && obs.social_profiles.length > 0) {
          totalExplicitSocialLinks += obs.social_profiles.length;
          console.log(`  └ Social: ${obs.social_profiles.map(s => `${s.platform} (${s.url})`).join(', ')}`);
       }
       if (obs.photo_url) {
          totalPhotos++;
          console.log(`  └ Photo: ${obs.photo_url}`);
       }
     }
     
     totalPeopleFound += observations.length;
  }

  console.log("\n=== PILOT REPORT ===");
  console.log(`DOMAINS = ${pilotOrganizations.length}`);
  console.log(`PAGES_FETCHED = ${totalPagesFetched}`);
  console.log(`PEOPLE_FOUND = ${totalPeopleFound}`);
  console.log(`EXPLICIT_SOCIAL_LINKS = ${totalExplicitSocialLinks}`);
  console.log(`PHOTOS = ${totalPhotos}`);
  console.log(`GUESSED_SOCIAL_PROFILES = 0`); // Enforced by design
}

runPilot().catch(console.error);
