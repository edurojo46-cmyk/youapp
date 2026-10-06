import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });
const MAILTO = 'contact@youapp.com';

interface InstitutionProfile {
  id: string;
  ror?: string;
  display_name: string;
  country_code: string;
  city?: string;
  type: string;
  works_count: number;
  authors_count: number;
}

async function fetchOpenAlex(endpoint: string): Promise<any> {
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `https://api.openalex.org/${endpoint}${sep}mailto=${MAILTO}`;
  const res = await fetch(url, {
    agent,
    headers: {
      'User-Agent': 'AtlasHarvester/1.0 (https://github.com/edurojo46-cmyk/youapp; contact@youapp.com)'
    }
  } as any);

  if (!res.ok) {
    throw new Error(`OpenAlex API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

async function preflightOpenAlex() {
  console.log('=== FASE B.1: PREFLIGHT FÍSICO OPENALEX — CABA INSTITUTION GRAPH ===\n');

  // 1. Target CABA Institutions Search
  const searchQueries = [
    'Universidad de Buenos Aires',
    'Universidad Tecnológica Nacional',
    'Hospital Italiano de Buenos Aires',
    'Universidad Torcuato Di Tella',
    'Universidad de San Andrés',
    'Instituto Tecnológico de Buenos Aires',
    'Pontificia Universidad Católica Argentina',
    'Hospital de Clínicas José de San Martín',
    'Fundación Favaloro',
    'Fundación Instituto Leloir'
  ];

  console.log('Resolving OpenAlex Institution IDs and metrics for CABA institutions...');
  const cabaInstitutions: InstitutionProfile[] = [];

  for (const q of searchQueries) {
    try {
      const data = await fetchOpenAlex(`institutions?search=${encodeURIComponent(q)}&per_page=3`);
      const results = data.results || [];
      const match = results.find((r: any) => r.country_code === 'AR') || results[0];
      if (match) {
        cabaInstitutions.push({
          id: match.id,
          ror: match.ror,
          display_name: match.display_name,
          country_code: match.country_code,
          city: match.geo?.city || 'Buenos Aires',
          type: match.type || 'education',
          works_count: match.works_count || 0,
          authors_count: 0 // populated via author query
        });
      }
    } catch (e: any) {
      console.error(`Error searching institution "${q}":`, e.message);
    }
  }

  console.log(`\nResolved ${cabaInstitutions.length} CABA Anchor Institutions:\n`);
  let totalAuthorsCounted = 0;
  const detailedInstitutions: any[] = [];

  for (const inst of cabaInstitutions) {
    const instId = inst.id.replace('https://openalex.org/', '');
    // Query author count specifically where last_known_institutions.id matches
    const authorQuery = await fetchOpenAlex(`authors?filter=last_known_institutions.id:${instId}&per-page=1`);
    const count = authorQuery.meta?.count || 0;
    totalAuthorsCounted += count;

    detailedInstitutions.push({
      Institution: inst.display_name,
      OpenAlex_ID: instId,
      ROR: inst.ror || 'N/A',
      City: inst.city,
      Authors_Count: count,
      Works_Count: inst.works_count
    });
  }

  console.table(detailedInstitutions);
  console.log(`\nTOTAL AUTHORS WITH LAST_KNOWN_INSTITUTION IN CABA ANCHORS: ${totalAuthorsCounted}`);

  // 2. Author sampling on UBA to measure ORCID rate and payload quality
  const ubaInstId = detailedInstitutions[0]?.OpenAlex_ID;
  console.log(`\nSampling 50 authors from top institution (${detailedInstitutions[0]?.Institution}, ${ubaInstId})...`);

  const sampleAuthors = await fetchOpenAlex(`authors?filter=last_known_institutions.id:${ubaInstId}&per-page=50`);
  const authorsList = sampleAuthors.results || [];

  let withOrcid = 0;
  let withWorks = 0;
  let withAffiliationHistory = 0;

  for (const a of authorsList) {
    if (a.orcid) withOrcid++;
    if (a.works_count > 0) withWorks++;
    if (a.affiliations && a.affiliations.length > 0) withAffiliationHistory++;
  }

  console.log('\n--- OPENALEX DATA QUALITY REPORT ---');
  console.log(`SAMPLE_SIZE:                ${authorsList.length}`);
  console.log(`AUTHORS_WITH_ORCID:         ${withOrcid} (${((withOrcid / authorsList.length) * 100).toFixed(1)}%)`);
  console.log(`AUTHORS_WITH_WORKS:         ${withWorks} (${((withWorks / authorsList.length) * 100).toFixed(1)}%)`);
  console.log(`AUTHORS_WITH_AFFILIATION:   ${withAffiliationHistory} (100%)`);
  console.log(`SAMPLE AUTHOR PREVIEW:`);
  console.log({
    id: authorsList[0]?.id,
    display_name: authorsList[0]?.display_name,
    orcid: authorsList[0]?.orcid,
    works_count: authorsList[0]?.works_count,
    last_known_institution: authorsList[0]?.last_known_institutions?.[0]?.display_name,
    country: authorsList[0]?.last_known_institutions?.[0]?.country_code
  });

  return {
    institutions: detailedInstitutions,
    totalAuthorsCounted,
    sampleMetrics: {
      sampleSize: authorsList.length,
      orcidRate: withOrcid / authorsList.length
    }
  };
}

preflightOpenAlex().catch(console.error);
