import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import https from 'https';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

const agent = new https.Agent({ rejectUnauthorized: false });

async function checkWikidataPhysicalOverlap() {
  console.log('Querying Wikidata for exact CABA P937/P551 persons...');
  const query = `
    SELECT ?p ?pLabel ?occupationLabel WHERE {
      ?p wdt:P31 wd:Q5 .
      ?p wdt:P27 wd:Q414 .
      { ?p wdt:P937 wd:Q1486 } UNION { ?p wdt:P551 wd:Q1486 }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
    } LIMIT 200
  `;
  const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    agent,
    headers: {
      'User-Agent': 'AtlasHarvester/1.0 (https://github.com/edurojo46-cmyk/youapp; contact@youapp.com)'
    }
  } as any);

  if (!res.ok) {
    console.error('Wikidata SPARQL error:', res.status);
    return;
  }

  const json = await res.json();
  const bindings = json.results?.bindings || [];
  console.log(`Fetched ${bindings.length} Wikidata records.`);

  // Load existing discovery candidate names
  const existingNames = new Set<string>();
  let offset = 0;
  while (true) {
    const { data } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('display_name')
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) {
      if (r.display_name) existingNames.add(r.display_name.toLowerCase().trim());
    }
    offset += data.length;
    if (data.length < 1000) break;
  }

  let inDiscovery = 0;
  let validPersons = 0;
  let sampleCabaLevel = 0;

  for (const b of bindings) {
    const name = b.pLabel?.value;
    if (name && !name.startsWith('Q') && name.length > 3) {
      validPersons++;
      sampleCabaLevel++; // explicitly filtered by P937/P551 = Q1486
      if (existingNames.has(name.toLowerCase().trim())) {
        inDiscovery++;
      }
    }
  }

  const validRate = validPersons / bindings.length;
  const overlapRate = inDiscovery / validPersons;
  const totalWikiRaw = 1871;
  const projectedRealNetNew = Math.round(totalWikiRaw * validRate * (1 - overlapRate));

  console.log('\n--- WIKIDATA CABA PHYSICAL METRICS ---');
  console.log(`RAW_OBSERVED:                ${totalWikiRaw}`);
  console.log(`SAMPLE_SIZE:                 ${bindings.length}`);
  console.log(`VALID_PERSON_RATE:           ${(validRate * 100).toFixed(1)}%`);
  console.log(`CABA_PERSON_LEVEL_RATE:      100.0% (Enforced by SPARQL territorial relation)`);
  console.log(`OVERLAP_RATE_OBSERVED:       ${(overlapRate * 100).toFixed(1)}% (${inDiscovery}/${validPersons})`);
  console.log(`PROJECTED_REAL_NET_NEW:      ${projectedRealNetNew}`);
}

checkWikidataPhysicalOverlap().catch(console.error);
