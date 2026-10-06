import fetch from 'node-fetch';
import { SocialEntityClassifier } from '../src/lib/search/social/SocialEntityClassifier';

const queries = [
  { q: 'comerciante Caballito', neighborhood: 'Caballito', defaultProf: 'Comerciante' },
  { q: 'médico Palermo', neighborhood: 'Palermo', defaultProf: 'Médico' },
  { q: 'empresario Belgrano', neighborhood: 'Belgrano', defaultProf: 'Empresario' },
  { q: 'arquitecto Recoleta', neighborhood: 'Recoleta', defaultProf: 'Arquitecto' },
  { q: 'psicólogo Almagro', neighborhood: 'Almagro', defaultProf: 'Psicólogo' },
  { q: 'emprendedor Flores', neighborhood: 'Flores', defaultProf: 'Emprendedor' },
  { q: 'investigador CABA', neighborhood: 'CABA', defaultProf: 'Investigador' }
];

// Stopwords in Spanish that cannot be names
const STOPWORDS = new Set([
  'un', 'una', 'unos', 'unas', 'el', 'la', 'los', 'las', 'de', 'del', 'al', 'en', 'por', 'para',
  'con', 'sin', 'sobre', 'tras', 'este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas',
  'aquel', 'aquella', 'aquellos', 'aquellas', 'su', 'sus', 'mi', 'mis', 'tu', 'tus', 'nos',
  'más', 'menos', 'muy', 'mucho', 'mucha', 'muchos', 'muchas', 'poco', 'poca', 'pocos', 'pocas',
  'año', 'años', 'día', 'días', 'mes', 'meses', 'casa', 'calle', 'barrio', 'zona', 'ciudad',
  'gobierno', 'justicia', 'policía', 'policías', 'tribunal', 'tribunales', 'ley', 'fallo',
  'hospital', 'sanatorio', 'clínica', 'centro', 'instituto', 'colegio', 'escuela', 'facultad',
  'universidad', 'ministerio', 'secretaría', 'dirección', 'asociación', 'cámara', 'federación'
]);

function isValidName(candidate: string): boolean {
  if (!candidate || candidate.length < 5 || candidate.length > 50) return false;
  const parts = candidate.trim().split(/\s+/);
  if (parts.length < 2 || parts.length > 4) return false;
  for (const p of parts) {
    const clean = p.replace(/[.,:;()]/g, '');
    if (!/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(clean)) return false;
    if (STOPWORDS.has(clean.toLowerCase())) return false;
  }
  return true;
}

const PERSON_PATTERNS = [
  // "Dr. / Dra. / Lic. / Arq. / Ing. Nombre Apellido"
  /(?:Dr\.|Dra\.|Lic\.|Arq\.|Ing\.)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/g,
  // "el médico / arquitecto / etc. Nombre Apellido"
  /(?:médico|médica|arquitecto|arquitecta|psicólogo|psicóloga|investigador|investigadora|empresario|empresaria|comerciante|emprendedor|emprendedora)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/gi,
  // "Nombre Apellido, titular / fundador / etc."
  /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,2})(?:,\s+(?:médico|arquitecto|comerciante|psicólogo|investigador|empresario|titular|fundador|director))/g,
  // "murió / asumió / presentó Nombre Apellido"
  /(?:murió|falleció|asumió|declaró|explicó|según|afirmó|lidera|dirige)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/gi
];

async function inspectNewsMentions() {
  const allArticles: any[] = [];
  const sourcesSet = new Set<string>();

  for (const qObj of queries) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(qObj.q)}&hl=es-419&gl=AR&ceid=AR:es-419`;
    try {
      const res = await fetch(url);
      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      for (const item of items) {
        const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || '';
        const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
        const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
        const source = (item.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || 'Desconocido';
        sourcesSet.add(source);
        allArticles.push({
          title,
          link,
          pubDate,
          source,
          query: qObj.q,
          neighborhood: qObj.neighborhood,
          defaultProf: qObj.defaultProf
        });
      }
    } catch (err: any) {
      console.error('Error fetching query:', qObj.q, err.message);
    }
  }

  console.log(`TOTAL ARTICLES FETCHED: ${allArticles.length}`);
  console.log(`DISTINCT SOURCES DISCOVERED: ${sourcesSet.size}`);

  const mentions: any[] = [];
  for (const art of allArticles) {
    for (const pat of PERSON_PATTERNS) {
      let match;
      while ((match = pat.exec(art.title)) !== null) {
        const rawName = match[1]?.trim();
        if (isValidName(rawName)) {
          const classification = SocialEntityClassifier.classify(rawName, art.title);
          if (classification.is_person) {
            mentions.push({
              extractedName: rawName,
              classification,
              article: art
            });
          }
        }
      }
    }
  }

  console.log(`AUTHENTIC PERSON MENTIONS FOUND: ${mentions.length}`);
  for (let i = 0; i < mentions.length; i++) {
    const m = mentions[i];
    console.log(`[${i+1}] Name: "${m.extractedName}" | Source: ${m.article.source} | Query: ${m.article.query}`);
    console.log(`    Article: ${m.article.title}`);
  }
}

inspectNewsMentions().catch(console.error);
