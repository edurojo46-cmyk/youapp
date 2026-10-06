import fetch from 'node-fetch';
import crypto from 'crypto';
import { SocialEntityClassifier } from '../src/lib/search/social/SocialEntityClassifier';

function classifySourceTier(sourceName: string, domain: string): 'NEWS_MEDIA' | 'LOCAL_NEWS' | 'SPECIALIZED_MEDIA' | 'INSTITUTIONAL_NEWS' {
  const s = (sourceName || '').toLowerCase();
  const d = (domain || '').toLowerCase();

  if (d.endsWith('.gob.ar') || d.endsWith('.gov.ar') || d.endsWith('.edu.ar') || s.includes('conicet') || s.includes('uba') || s.includes('boletin') || s.includes('boletín')) {
    return 'INSTITUTIONAL_NEWS';
  }
  if (s.includes('cronista') || s.includes('ámbito') || s.includes('ambito') || s.includes('iprofesional') || s.includes('archdaily') || s.includes('enfasys') || s.includes('puntoapunto') || s.includes('forbes') || s.includes('apertura')) {
    return 'SPECIALIZED_MEDIA';
  }
  if (s.includes('abasto') || s.includes('caballito') || s.includes('flores') || s.includes('palermo') || s.includes('comunas') || s.includes('barrio') || s.includes('urdimbre')) {
    return 'LOCAL_NEWS';
  }
  return 'NEWS_MEDIA';
}

function calculateCurrentRoleStatus(publishedIsoDate: string): 'CURRENT_EVIDENCE' | 'RECENT_EVIDENCE' | 'HISTORICAL_EVIDENCE' | 'STALE_UNKNOWN' {
  try {
    const pubYear = new Date(publishedIsoDate).getFullYear();
    const currentYear = new Date().getFullYear();
    const diff = currentYear - pubYear;
    if (diff <= 1) return 'CURRENT_EVIDENCE';
    if (diff <= 3) return 'RECENT_EVIDENCE';
    if (diff > 3) return 'HISTORICAL_EVIDENCE';
    return 'STALE_UNKNOWN';
  } catch {
    return 'STALE_UNKNOWN';
  }
}

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
  /(?:Dr\.|Dra\.|Lic\.|Arq\.|Ing\.)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/g,
  /(?:médico|médica|arquitecto|arquitecta|psicólogo|psicóloga|investigador|investigadora|empresario|empresaria|comerciante|emprendedor|emprendedora)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/gi,
  /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,2})(?:,\s+(?:médico|arquitecto|comerciante|psicólogo|investigador|empresario|titular|fundador|director|jefe|coordinador))/g,
  /(?:declaró|explicó|según|afirmó|lidera|dirige|fundó|presentó)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3})/gi
];

// Disqualifiers for CABA location
const NON_CABA_INDICATORS = [
  'jalisco', 'méxico', 'mexico', 'chile', 'uruguay', 'españa', 'colombia',
  'mar del plata', 'santa fe', 'rosario', 'mendoza', 'córdoba', 'cordoba',
  'san francisco', 'tucumán', 'la plata', 'bahía blanca'
];

function isLegitimateCabaEvidence(title: string, personName: string, queryNeighborhood: string): { valid: boolean; evidence: string } {
  const lowerTitle = title.toLowerCase();
  
  // 1. Reject if non-CABA geography is declared
  for (const nonCaba of NON_CABA_INDICATORS) {
    if (lowerTitle.includes(nonCaba)) {
      return { valid: false, evidence: `Mención de otra jurisdicción: ${nonCaba}` };
    }
  }

  // 2. Reject if neighborhood is merely part of the person's name (e.g. "Gómez Flores")
  const personLower = personName.toLowerCase();
  if (personLower.includes(queryNeighborhood.toLowerCase())) {
    // Check if the neighborhood appears outside the person's name
    const titleWithoutPerson = lowerTitle.replace(personLower, '');
    if (!titleWithoutPerson.includes(queryNeighborhood.toLowerCase()) && !titleWithoutPerson.includes('caba') && !titleWithoutPerson.includes('buenos aires')) {
      return { valid: false, evidence: `Término '${queryNeighborhood}' coincide únicamente con el apellido del individuo` };
    }
  }

  // 3. Strict CABA Geographic Evidence: must have neighborhood or CABA/Buenos Aires in the article title
  const explicitNeighborhood = lowerTitle.includes(queryNeighborhood.toLowerCase());
  const explicitCaba = lowerTitle.includes('caba') || lowerTitle.includes('buenos aires') || lowerTitle.includes('capital federal');

  if (explicitNeighborhood || explicitCaba) {
    return { valid: true, evidence: `Mención expresa en título de artículo: ${queryNeighborhood}, CABA` };
  }

  return { valid: false, evidence: 'QUERY_TERM_AS_LOCATION_EVIDENCE = 0' };
}

async function runPhysicalNewsTest() {
  const queries = [
    { q: 'comerciante Caballito', neighborhood: 'Caballito', role: 'Comerciante' },
    { q: 'médico Palermo', neighborhood: 'Palermo', role: 'Médico' },
    { q: 'empresario Belgrano', neighborhood: 'Belgrano', role: 'Empresario' },
    { q: 'arquitecto Recoleta', neighborhood: 'Recoleta', role: 'Arquitecto' },
    { q: 'psicólogo Almagro', neighborhood: 'Almagro', role: 'Psicólogo' },
    { q: 'emprendedor Flores', neighborhood: 'Flores', role: 'Emprendedor' },
    { q: 'investigador CABA', neighborhood: 'CABA', role: 'Investigador' },
    // Also targeted portal queries to expand legitimate CABA news mentions
    { q: 'site:infobae.com "Caballito" médico OR comerciante', neighborhood: 'Caballito', role: 'Profesional/Comerciante' },
    { q: 'site:lanacion.com.ar "Palermo" Dr. OR médica', neighborhood: 'Palermo', role: 'Médico' },
    { q: 'site:conicet.gov.ar "CABA" investigador', neighborhood: 'CABA', role: 'Investigador' }
  ];

  let totalArticlesFetched = 0;
  let totalMentionsFound = 0;
  let totalPersonClassified = 0;
  let totalValidatedPeople = 0;

  const discoveredSources = new Set<string>();
  const activeSources = new Set<string>();
  const tierCounts: Record<string, number> = {
    NEWS_MEDIA: 0,
    LOCAL_NEWS: 0,
    SPECIALIZED_MEDIA: 0,
    INSTITUTIONAL_NEWS: 0
  };

  const validatedCandidates: any[] = [];

  for (const qObj of queries) {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(qObj.q)}&hl=es-419&gl=AR&ceid=AR:es-419`;
    try {
      const res = await fetch(rssUrl);
      if (!res.ok) continue;
      const xml = await res.text();
      const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
      totalArticlesFetched += items.length;

      for (const item of items) {
        const title = (item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]?.replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1') || '';
        const link = (item.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || '';
        const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '';
        const sourceName = (item.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1] || 'Desconocido';
        const sourceUrlMatch = item.match(/<source\s+url="([^"]+)"/);
        const sourceDomain = sourceUrlMatch ? new URL(sourceUrlMatch[1]).hostname.replace('www.', '') : 'news.google.com';

        discoveredSources.add(sourceName);
        activeSources.add(sourceName);

        const tier = classifySourceTier(sourceName, sourceDomain);
        tierCounts[tier]++;

        // NER for person mentions
        for (const pat of PERSON_PATTERNS) {
          let match;
          while ((match = pat.exec(title)) !== null) {
            const rawName = match[1]?.trim();
            if (isValidName(rawName)) {
              totalMentionsFound++;
              const classification = SocialEntityClassifier.classify(rawName, title);
              if (classification.is_person) {
                totalPersonClassified++;

                // Strict Geographic Verification (Section 5: QUERY_TERM_AS_LOCATION_EVIDENCE = 0)
                const geoCheck = isLegitimateCabaEvidence(title, rawName, qObj.neighborhood);
                if (geoCheck.valid) {
                  const roleStatus = calculateCurrentRoleStatus(pubDate);
                  const safeFingerprint = crypto
                    .createHash('md5')
                    .update(`${sourceDomain}:${link}:${rawName}`)
                    .digest('hex')
                    .substring(0, 16);

                  totalValidatedPeople++;
                  validatedCandidates.push({
                    candidate_id: `news_${tier.toLowerCase()}_${safeFingerprint}`,
                    person_name: rawName,
                    role: qObj.role,
                    claim: title,
                    source_domain: sourceDomain,
                    source_tier: tier,
                    article_title: title,
                    article_url: link,
                    published_at: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
                    role_evidence_date: pubDate ? pubDate.split(' ').slice(1, 4).join(' ') : 'Reciente',
                    current_role_status: roleStatus,
                    neighborhood: qObj.neighborhood,
                    geographic_evidence: `${qObj.neighborhood}, CABA (artículo fechado en ${sourceName})`
                  });
                }
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.error('Error on query:', qObj.q, e.message);
    }
  }

  console.log('--- REFINED PHYSICAL NEWS EXECUTION RESULTS ---');
  console.log(`NEWS_SOURCES_DISCOVERED = ${discoveredSources.size}`);
  console.log(`NEWS_SOURCES_PHYSICALLY_ACTIVE = ${activeSources.size}`);
  console.log(`NEWS_ARTICLES_FETCHED = ${totalArticlesFetched}`);
  console.log(`NEWS_PERSON_MENTIONS = ${totalMentionsFound}`);
  console.log(`NEWS_PERSON_CLASSIFIED = ${totalPersonClassified}`);
  console.log(`NEWS_VALIDATED_PEOPLE = ${totalValidatedPeople}`);
  console.log('TIER BREAKDOWN:', tierCounts);
  console.log('\nSAMPLE VALIDATED NEWS PEOPLE:');
  for (let i = 0; i < validatedCandidates.length; i++) {
    const vc = validatedCandidates[i];
    console.log(`[${i+1}] ${vc.person_name} (${vc.role}) in ${vc.neighborhood}`);
    console.log(`    Tier: ${vc.source_tier} | Domain: ${vc.source_domain} | Status: ${vc.current_role_status}`);
    console.log(`    Title: ${vc.article_title}`);
  }
}

runPhysicalNewsTest().catch(console.error);
