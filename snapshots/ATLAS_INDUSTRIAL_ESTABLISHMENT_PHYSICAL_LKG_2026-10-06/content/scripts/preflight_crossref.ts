import https from 'https';

const agent = new https.Agent({ rejectUnauthorized: false });
const MAILTO = 'contact@youapp.com';

async function preflightCrossref() {
  console.log('=== FASE B.4: PREFLIGHT FÍSICO CROSSREF API ===\n');

  // Test authors from CABA / Argentina
  const sampleAuthors = [
    'Susana Estela Quiroga',
    'Luis Enrique Baer',
    'Alberto Kornblihtt',
    'Gabriel Rabinovich',
    'Sandra Díaz'
  ];

  console.log('Querying Crossref REST API for sample authors...\n');
  const results = [];

  for (const name of sampleAuthors) {
    const t0 = Date.now();
    const url = `https://api.crossref.org/works?query.author=${encodeURIComponent(name)}&rows=3&mailto=${MAILTO}`;

    try {
      const res = await fetch(url, {
        agent,
        headers: {
          'User-Agent': `AtlasHarvester/1.0 (mailto:${MAILTO})`
        }
      } as any);

      const latency = Date.now() - t0;
      if (!res.ok) {
        console.log(`[ERR] ${name}: HTTP ${res.status}`);
        continue;
      }

      const json = await res.json();
      const items = json.message?.items || [];
      const totalResults = json.message?.['total-results'] || 0;

      // Find author in items
      let matchedAuthor: any = null;
      let publicationDate: string | null = null;
      let affiliation: string | null = null;
      let orcid: string | null = null;

      for (const item of items) {
        const authors = item.author || [];
        const authorMatch = authors.find((a: any) =>
          (a.family && name.toLowerCase().includes(a.family.toLowerCase())) ||
          (a.given && name.toLowerCase().includes(a.given.toLowerCase()))
        );

        if (authorMatch) {
          matchedAuthor = authorMatch;
          orcid = authorMatch.ORCID || null;
          affiliation = authorMatch.affiliation?.map((af: any) => af.name).join('; ') || null;
          const dateParts = item.published?.['date-parts']?.[0] || item.created?.['date-parts']?.[0];
          if (dateParts) publicationDate = dateParts.join('-');
          break;
        }
      }

      results.push({
        Author: name,
        Total_Crossref_Works: totalResults,
        Matched_In_Top3: !!matchedAuthor,
        ORCID: orcid || 'N/A',
        Affiliation: affiliation ? affiliation.slice(0, 45) : 'None in top 3',
        Recent_Date: publicationDate || 'N/A',
        Latency_ms: latency
      });
    } catch (e: any) {
      console.log(`[ERR] ${name}:`, e.message);
    }
  }

  console.table(results);
  console.log('\n--- EVALUACIÓN CROSSREF ---');
  console.log(`- Endpoint Oficial:         https://api.crossref.org`);
  console.log(`- Costo Externo:            $0.00 (Gratuito, sin registro obligatorio)`);
  console.log(`- Cuota / Polite:           Permite header mailto para pool de alta velocidad (hasta 50 req/s)`);
  console.log(`- Utilidad para Atlas:      Excelente para Entity Resolution y Temporal Evidence (fechas precisas de papers con DOI)`);
  console.log(`- Limitación Territorial:   Las afiliaciones en Crossref a menudo son texto libre y omitidas por algunos publishers (OpenAlex tiene mejor normalización institucional vía ROR)`);
}

preflightCrossref().catch(console.error);
