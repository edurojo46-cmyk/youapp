import fetch from 'node-fetch';

async function listArgentineInstitutions() {
  console.log('Querying OpenAlex institutions in Argentina...');
  const res = await fetch('https://api.openalex.org/institutions?filter=country_code:AR&per_page=100&mailto=contact@youapp.com');
  if (res.ok) {
    const json = await res.json();
    const insts = json.results || [];
    console.log(`Found ${insts.length} institutions in Argentina.`);
    const cabaPba = insts.filter(i => {
      const geo = (i.geo?.city || '') + ' ' + (i.geo?.region || '') + ' ' + (i.display_name || '');
      const lower = geo.toLowerCase();
      return lower.includes('buenos aires') || lower.includes('la plata') || lower.includes('quilmes') ||
             lower.includes('mar del plata') || lower.includes('bahia blanca') || lower.includes('matanza') ||
             lower.includes('tandil') || lower.includes('san martin') || lower.includes('lanus') ||
             lower.includes('avellaneda') || lower.includes('lujan') || lower.includes('pergamino') ||
             lower.includes('moron') || lower.includes('san isidro') || lower.includes('castelar');
    });
    console.log(`CABA/PBA Institutions count: ${cabaPba.length}`);
    for (const i of cabaPba.slice(0, 50)) {
      console.log(`- ${i.id} | ${i.display_name} | City: ${i.geo?.city} | Works: ${i.works_count}`);
    }
  }
}

listArgentineInstitutions().catch(console.error);
