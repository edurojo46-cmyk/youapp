import fetch from 'node-fetch';
import https from 'https';
import * as cheerio from 'cheerio';

const agent = new https.Agent({ rejectUnauthorized: false });

async function parseUBAEconomicas() {
  console.log('=== ENUMERATING UBA CIENCIAS ECONÓMICAS ===\n');

  const pages = [
    { url: 'https://economicas.uba.ar/institucional/autoridades/', label: 'AUTORIDADES_CENTRALES' },
    { url: 'https://economicas.uba.ar/institucional/consejo-directivo/', label: 'CONSEJO_DIRECTIVO' },
    { url: 'https://economicas.uba.ar/departamentos/administracion/', label: 'DEPTO_ADMINISTRACION' },
    { url: 'https://economicas.uba.ar/departamentos/contabilidad/', label: 'DEPTO_CONTABILIDAD' },
    { url: 'https://economicas.uba.ar/departamentos/economia/', label: 'DEPTO_ECONOMIA' },
    { url: 'https://economicas.uba.ar/departamentos/matematica/', label: 'DEPTO_MATEMATICA' },
    { url: 'https://economicas.uba.ar/departamentos/tributacion/', label: 'DEPTO_TRIBUTACION' },
    { url: 'https://economicas.uba.ar/institutos/', label: 'INSTITUTOS_INVESTIGACION' }
  ];

  let pagesFetched = 0;
  const people: Array<{ name: string; role: string; org: string; url: string }> = [];

  for (const p of pages) {
    try {
      const res = await fetch(p.url, {
        agent,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        timeout: 10000
      });

      if (res.ok) {
        pagesFetched++;
        const html = await res.text();
        const $ = cheerio.load(html);

        const headings: string[] = [];
        $('.elementor-heading-title').each((_, el) => {
          const t = $(el).text().replace(/\s+/g, ' ').trim();
          if (t && t.length > 2) headings.push(t);
        });

        // Pair adjacent headings: Name + Role
        for (let i = 0; i < headings.length - 1; i++) {
          const first = headings[i];
          const second = headings[i + 1];

          // Check if first is name and second is role, or vice-versa
          const isRoleSecond = /^(Decano|Decana|Vicedecano|Vicedecana|Secretario|Secretaria|Subsecretario|Subsecretaria|Director|Directora|Coordinador|Coordinadora|Consejero|Consejera|Profesor|Profesora|Presidente|Vocal)/i.test(second);
          const isRoleFirst = /^(Decano|Decana|Vicedecano|Vicedecana|Secretario|Secretaria|Subsecretario|Subsecretaria|Director|Directora|Coordinador|Coordinadora|Consejero|Consejera|Profesor|Profesora|Presidente|Vocal)/i.test(first);

          if (isRoleSecond && first.split(' ').length >= 2 && !first.includes('UBA') && !first.includes('Facultad') && !first.includes('Menú') && !first.includes('INSTITUCIONAL')) {
            people.push({
              name: first,
              role: second,
              org: 'Facultad de Ciencias Económicas (UBA)',
              url: p.url
            });
            i++; // skip paired role
          } else if (isRoleFirst && second.split(' ').length >= 2 && !second.includes('UBA') && !second.includes('Facultad') && !second.includes('Menú') && !second.includes('INSTITUCIONAL')) {
            people.push({
              name: second,
              role: first,
              org: 'Facultad de Ciencias Económicas (UBA)',
              url: p.url
            });
            i++;
          }
        }
        console.log(`[${pagesFetched}/${pages.length}] ${p.url} -> Found ${people.length} candidate pairs.`);
      }
    } catch (e: any) {
      console.log(`Error on ${p.url}: ${e.message}`);
    }
  }

  // Deduplicate by normalized name
  const unique = new Map<string, any>();
  for (const pers of people) {
    const key = pers.name.toLowerCase().trim();
    if (key.length > 4 && !unique.has(key)) {
      unique.set(key, pers);
    }
  }

  console.log(`\n==================================================`);
  console.log(`UBA_ECONOMICAS_PAGES_FETCHED = ${pagesFetched}`);
  console.log(`UBA_ECONOMICAS_RAW_PERSON_RECORDS = ${people.length}`);
  console.log(`UBA_ECONOMICAS_NEW_UNIQUE = ${unique.size}`);
  console.log(`UBA_ECONOMICAS_DIRECT_CABA_NEW_UNIQUE = ${unique.size}`);
  console.log(`==================================================\n`);

  console.log('Sample extracted UBA Económicas people:');
  console.log(JSON.stringify(Array.from(unique.values()).slice(0, 15), null, 2));
}

parseUBAEconomicas().catch(console.error);
