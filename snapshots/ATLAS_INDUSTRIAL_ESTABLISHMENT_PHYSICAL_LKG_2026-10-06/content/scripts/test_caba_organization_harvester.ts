import { OrganizationWebsiteHarvester } from '../src/lib/atlasHarvester/people/OrganizationWebsiteHarvester';

async function runCabaPilot() {
  console.log("=== ATLAS V2 CABA ORGANIZATION HARVESTER PILOT ===");
  
  // Real CABA organizations
  const pilotOrganizations = [
    { domain: 'auth0.com', name: 'Auth0' }, 
    { domain: 'mercadolibre.com.ar', name: 'Mercado Libre' },
    { domain: 'globant.com', name: 'Globant' },
    { domain: 'mural.co', name: 'Mural' },
    { domain: 'satellogic.com', name: 'Satellogic' },
    { domain: 'auth0.com', name: 'Auth0' }, // Testing CABA tech ecosystem
    { domain: 'vercel.com', name: 'Vercel' } // Used for the deterministic crawler test (Guillermo Rauch)
  ];

  let totalPagesFetched = 0;
  let totalPeopleFound = 0;
  let totalExplicitSocialLinks = 0;
  let companySocialFalseAssignments = 0;
  let worksAtInferences = 0;
  let cabaWorkLocationFalseInferences = 0;

  for (const org of pilotOrganizations) {
     console.log(`\n--- Processing: ${org.name} (${org.domain}) ---`);
     const harvester = new OrganizationWebsiteHarvester(org.domain, org.name);
     
     // 1. Fetch
     const rawData = await harvester.fetch();
     totalPagesFetched += rawData.length;

     if (rawData.length === 0) {
        console.log("No deterministic pages found. Skipping parsing.");
        continue;
     }

     // 2. Parse & Normalize
     const parsedData = await harvester.parse(rawData);
     const observations = await harvester.normalize(parsedData);
     
     for (const obs of observations) {
       console.log(`- [${obs.employmentEvidence?.relation}] ${obs.display_name} (${obs.profession})`);
       
       if (obs.employmentEvidence?.relation === 'WORKS_AT') {
           worksAtInferences++;
       }
       
       if (obs.location !== 'UNKNOWN') {
           cabaWorkLocationFalseInferences++;
       }

       if (obs.social_profiles && obs.social_profiles.length > 0) {
          obs.social_profiles.forEach(s => {
             // If a generic company URL leaked through, mark it as a false assignment
             if (s.url.toLowerCase().includes('/company/') || s.url.toLowerCase().endsWith(org.name.toLowerCase())) {
                 companySocialFalseAssignments++;
                 console.error(`  [!] FALSE ASSIGNMENT: ${s.platform} (${s.url}) assigned to ${obs.display_name}`);
             } else {
                 totalExplicitSocialLinks++;
                 console.log(`  └ Social: ${s.platform} (${s.url})`);
             }
          });
       }
     }
     
     totalPeopleFound += observations.length;
  }

  console.log("\n=== CABA PILOT REPORT ===");
  console.log(`DOMAINS = ${pilotOrganizations.length}`);
  console.log(`PAGES_FETCHED = ${totalPagesFetched}`);
  console.log(`PEOPLE_FOUND = ${totalPeopleFound}`);
  console.log(`EXPLICIT_SOCIAL_LINKS = ${totalExplicitSocialLinks}`);
  console.log(`AUTOMATIC_WORKS_AT = ${worksAtInferences} (Expected 0)`);
  console.log(`COMPANY_SOCIAL_FALSE_ASSIGNMENTS = ${companySocialFalseAssignments} (Expected 0)`);
  console.log(`PERSON_WORK_LOCATION_FALSE_INFERENCES = ${cabaWorkLocationFalseInferences} (Expected 0)`);
  
  if (worksAtInferences === 0 && companySocialFalseAssignments === 0 && cabaWorkLocationFalseInferences === 0) {
     console.log("\n[SUCCESS] ORGANIZATION GATE PASSED. Ready for ORCID.");
  } else {
     console.log("\n[FAILED] ORGANIZATION GATE FAILED. Please review strict mapping rules.");
     process.exit(1);
  }
}

runCabaPilot().catch(console.error);
