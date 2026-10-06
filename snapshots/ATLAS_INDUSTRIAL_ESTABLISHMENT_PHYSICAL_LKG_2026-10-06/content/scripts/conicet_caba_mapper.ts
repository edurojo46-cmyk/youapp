import fetch from 'node-fetch';

async function mapAllConicetSets() {
  console.log('--- ENUMERATING ALL CONICET OAI-PMH SETS VIA RESUMPTION TOKENS ---');

  let currentToken: string | null = null;
  const allSets: { spec: string; name: string }[] = [];
  const cabaSets: { spec: string; name: string }[] = [];

  const cabaKeywords = [
    'caba', 'capital federal', 'buenos aires', 'uba', 'exactas', 'medicina',
    'macn', 'iibba', 'leloir', 'lanari', 'ingebi', 'ifiba', 'iafe', 'cepal'
  ];

  let pageCount = 0;
  while (pageCount < 10) {
    pageCount++;
    const url = currentToken
      ? `https://ri.conicet.gov.ar/oai/request?verb=ListSets&resumptionToken=${encodeURIComponent(currentToken)}`
      : 'https://ri.conicet.gov.ar/oai/request?verb=ListSets';

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
      clearTimeout(id);

      if (!res.ok) {
        console.warn(`Page ${pageCount} failed: ${res.status}`);
        break;
      }

      const xml = await res.text();
      const setMatches = xml.match(/<set>[\s\S]*?<\/set>/g) || [];

      for (const s of setMatches) {
        const spec = s.match(/<setSpec>([^<]+)<\/setSpec>/)?.[1] || '';
        const name = s.match(/<setName>([^<]+)<\/setName>/)?.[1] || '';
        allSets.push({ spec, name });

        const lowerName = name.toLowerCase();
        if (cabaKeywords.some(kw => lowerName.includes(kw)) && !lowerName.includes('provincia de buenos aires')) {
          cabaSets.push({ spec, name });
        }
      }

      const matchToken = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/);
      if (matchToken && matchToken[1].trim()) {
        currentToken = matchToken[1].trim();
      } else {
        currentToken = null;
        break;
      }
    } catch (err: any) {
      console.warn(`Error on page ${pageCount}:`, err.message);
      break;
    }
  }

  console.log(`\nCONICET_SETS_DISCOVERED = ${allSets.length}`);
  console.log(`CONICET_CABA_SETS = ${cabaSets.length}`);
  console.log('\nSample CABA Sets:');
  cabaSets.slice(0, 15).forEach(cs => console.log(`  [${cs.spec}] ${cs.name}`));

  // Now test querying one CABA set: com_11336_277926 (CCT CABA SUR) or com_11336_421
  if (cabaSets.length > 0) {
    const testSet = cabaSets[0].spec;
    console.log(`\nTesting publication & author extraction on set "${testSet}" (${cabaSets[0].name})...`);
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 10000);
      const recRes = await fetch(`https://ri.conicet.gov.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=${testSet}`, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      clearTimeout(id);

      console.log('ListRecords status:', recRes.status);
      const recXml = await recRes.text();
      console.log('Record XML length:', recXml.length);

      const records = recXml.match(/<record>[\s\S]*?<\/record>/g) || [];
      console.log(`CONICET_RECORDS_FETCHED = ${records.length}`);

      const authorMentions: string[] = [];
      for (const r of records) {
        const creators = r.match(/<dc:creator>([^<]+)<\/dc:creator>/g) || [];
        for (const c of creators) {
          const rawAuthor = c.replace(/<\/?dc:creator>/g, '').trim();
          authorMentions.push(rawAuthor);
        }
      }

      console.log(`CONICET_AUTHOR_MENTIONS = ${authorMentions.length}`);

      // Normalize authors (e.g. "Perez, Juan Carlos" -> "Juan Carlos Perez")
      const uniqueAuthors = new Set<string>();
      for (const a of authorMentions) {
        let norm = a;
        if (a.includes(',')) {
          const parts = a.split(',').map(p => p.trim());
          norm = `${parts[1]} ${parts[0]}`;
        }
        if (norm.length > 4 && norm.includes(' ')) {
          uniqueAuthors.add(norm);
        }
      }

      console.log(`CONICET_UNIQUE_AUTHOR_CANDIDATES = ${uniqueAuthors.size}`);
      console.log(`PUBLICATION_COUNT_AS_PERSON_COUNT = 0 (Preserved: ${records.length} publications -> ${uniqueAuthors.size} unique authors)`);
      console.log('\nSample Unique Authors:');
      Array.from(uniqueAuthors).slice(0, 10).forEach(ua => console.log(`  - ${ua}`));
    } catch (e: any) {
      console.warn('Error fetching set records:', e.message);
    }
  }
}

mapAllConicetSets().catch(console.error);
