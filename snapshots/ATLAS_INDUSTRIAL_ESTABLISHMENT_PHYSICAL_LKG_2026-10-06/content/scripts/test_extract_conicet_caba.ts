import fetch from 'node-fetch';
import { SocialEntityClassifier } from '../src/lib/search/social/SocialEntityClassifier';

async function testExtractConicetCaba() {
  console.log('--- TESTING CONICET CABA RESEARCHER EXTRACTION ---');

  // Known CABA institutes/publishers in CONICET
  const CABA_INSTITUTE_PATTERNS = [
    /instituto nacional de antropolog/i,
    /instituto de investigaciones médicas/i,
    /instituto de biología y medicina experimental/i,
    /ibyme/i,
    /leloir/i,
    /iibba/i,
    /museo argentino de ciencias naturales/i,
    /macn/i,
    /facultad de ciencias exactas y naturales/i,
    /facultad de medicina/i,
    /facultad de ciencias económicas/i,
    /facultad de arquitectura/i,
    /facultad de derecho/i,
    /facultad de farmacia y bioquímica/i,
    /facultad de odontología/i,
    /facultad de ingeniería/i,
    /facultad de psicología/i,
    /facultad de ciencias sociales/i,
    /facultad de filosofía y letras/i,
    /instituto de física de buenos aires/i,
    /ifiba/i,
    /instituto de astronomía y física del espacio/i,
    /iafe/i,
    /instituto taquini/i,
    /hospital de clínicas/i,
    /hospital italiano de buenos aires/i,
    /hospital durand/i,
    /universidad de buenos aires/i
  ];

  let url = 'https://ri.conicet.gov.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc&set=snrd';
  let totalPublications = 0;
  let totalAuthorMentions = 0;
  const cabaResearchersMap = new Map<string, any>();

  for (let batch = 1; batch <= 3; batch++) {
    console.log(`Fetching batch #${batch}...`);
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0' } });
    clearTimeout(id);

    if (!res.ok) {
      console.warn(`Batch ${batch} failed:`, res.status);
      break;
    }

    const xml = await res.text();
    const records = xml.match(/<record>[\s\S]*?<\/record>/g) || [];
    totalPublications += records.length;

    for (const r of records) {
      const creators = (r.match(/<dc:creator>([^<]+)<\/dc:creator>/g) || []).map(c => c.replace(/<\/?dc:creator>/g, '').trim());
      const publishers = (r.match(/<dc:publisher>([^<]+)<\/dc:publisher>/g) || []).map(p => p.replace(/<\/?dc:publisher>/g, '').trim());
      const identifiers = (r.match(/<dc:identifier>([^<]+)<\/dc:identifier>/g) || []).map(d => d.replace(/<\/?dc:identifier>/g, '').trim());
      const titles = (r.match(/<dc:title>([^<]+)<\/dc:title>/g) || []).map(t => t.replace(/<\/?dc:title>/g, '').trim());

      totalAuthorMentions += creators.length;

      const handle = identifiers.find(i => i.startsWith('http://hdl.handle.net/')) || 'https://ri.conicet.gov.ar/';
      const pubText = publishers.join(' ');

      // Check if publisher/institute is CABA-affiliated
      const isCabaInstitute = CABA_INSTITUTE_PATTERNS.some(pat => pat.test(pubText));

      if (isCabaInstitute) {
        for (const rawCreator of creators) {
          let formattedName = rawCreator;
          if (rawCreator.includes(',')) {
            const parts = rawCreator.split(',').map(p => p.trim());
            formattedName = `${parts[1]} ${parts[0]}`;
          }

          if (formattedName.length > 4 && formattedName.includes(' ')) {
            const cl = SocialEntityClassifier.classify(formattedName, 'Investigador CONICET');
            if (cl.is_person) {
              const key = formattedName.toLowerCase();
              if (!cabaResearchersMap.has(key)) {
                cabaResearchersMap.set(key, {
                  display_name: formattedName,
                  institute: publishers[0] || 'CONICET - CABA',
                  handle,
                  sample_title: titles[0] || 'Publicación científica'
                });
              }
            }
          }
        }
      }
    }

    // Get next resumptionToken
    const nextTokenMatch = xml.match(/<resumptionToken[^>]*>([^<]+)<\/resumptionToken>/);
    if (nextTokenMatch && nextTokenMatch[1].trim()) {
      url = `https://ri.conicet.gov.ar/oai/request?verb=ListRecords&resumptionToken=${encodeURIComponent(nextTokenMatch[1].trim())}`;
    } else {
      break;
    }
  }

  console.log(`\nResults across ${totalPublications} publications:`);
  console.log(`CONICET_RECORDS_FETCHED = ${totalPublications}`);
  console.log(`CONICET_AUTHOR_MENTIONS = ${totalAuthorMentions}`);
  console.log(`CONICET_UNIQUE_AUTHOR_CANDIDATES = ${cabaResearchersMap.size}`);
  console.log(`PUBLICATION_COUNT_AS_PERSON_COUNT = 0 (Enforced)`);
  console.log('\nSample CABA Researchers Discovered:');
  Array.from(cabaResearchersMap.values()).slice(0, 10).forEach(r => {
    console.log(`  - ${r.display_name} (${r.institute}) -> ${r.handle}`);
  });
}

testExtractConicetCaba().catch(console.error);
