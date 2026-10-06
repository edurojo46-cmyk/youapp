import https from 'https';

const searchUrl = 'https://pub.orcid.org/v3.0/search/?q=affiliation-country:AR&rows=100';

function fetchOrcid(url: string, accept: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'Accept': accept } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('Fetching ORCID search for AR affiliations...');
  const searchResult = await fetchOrcid(searchUrl, 'application/json');
  
  if (!searchResult.result) {
    console.error('Failed to parse search results', searchResult);
    return;
  }
  
  const orcidIds = searchResult.result.map((r: any) => r['orcid-identifier'].path);
  console.log(`Found ${orcidIds.length} ORCID iDs linked to AR. Fetching details...`);
  
  const records = [];
  let nameCount = 0;
  let orgNameCount = 0;
  
  for (const id of orcidIds) {
    const recordUrl = `https://pub.orcid.org/v3.0/${id}`;
    const record = await fetchOrcid(recordUrl, 'application/json');
    records.push(record);
    
    // Quick stats
    const person = record.person;
    if (person && person.name && person.name['given-names']) nameCount++;
    
    const activities = record['activities-summary'];
    const employments = activities?.employments?.['affiliation-group'] || [];
    if (employments.length > 0) {
      const summary = employments[0]?.summaries?.[0]?.['employment-summary'];
      if (summary?.organization?.name) orgNameCount++;
    }
  }
  
  console.log('\n--- ORCID 100 RECORDS PILOT (VIA PUBLIC API DUE TO PUBLIC DATA FILE SIZE/BQ AUTH LIMITS) ---');
  console.log(`REAL_ORCID_ROWS_FETCHED = ${records.length}`);
  console.log(`UNIQUE_ORCID_IDS = ${new Set(orcidIds).size}`);
  console.log(`WITH_PUBLIC_NAME = ${nameCount}`);
  console.log(`WITH_ORGANIZATION_NAME = ${orgNameCount}`);
  // Add other stats as required
  
  // Here we would normally ingest, but let's just output the dry-run stats for now.
}

run().catch(console.error);
