import { extractYouTubeVideoIds } from '../src/lib/atlasHarvester/youtubeReferenceExtractor';

async function explore() {
  console.log('🔍 INVESTIGACIÓN INCREMENTAL DE GRABACIONES Y FUENTES ABIERTAS PARA CALLE 13 — LA PERLA:\n');

  // 1. Internet Archive (Archive.org) - Buscar colecciones de audio/video y transmisiones
  console.log('1. Internet Archive (Grabaciones en vivo / Conciertos / Álbumes):');
  const iaQueries = [
    'Calle 13 La Perla live',
    'Calle 13 La Perla concierto',
    'Calle 13 La Perla festival',
    'Calle 13 La Perla Grammys',
    'Calle 13 Los de Atras Vienen Conmigo'
  ];

  for (const q of iaQueries) {
    try {
      const url = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl[]=identifier,title,description,mediatype,length,year&rows=10&output=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const json = await res.json();
        for (const doc of (json?.response?.docs || [])) {
          console.log(`   • [Archive.org] ${doc.title} | ID: ${doc.identifier} | Mediatype: ${doc.mediatype} | Year: ${doc.year}`);
        }
      }
    } catch (e: any) {
      console.log('   Archive.org query error:', e.message);
    }
  }

  // 2. Broadcaster Sitemaps & Music Portals (Radio/TV broadcasts públicas que documentan directos)
  console.log('\n2. Broadcasters / Medios Públicos (RTVE, TVP, Canal Encuentro, KEXP, NPR Tiny Desk, etc.):');
  const mediaQueries = [
    'https://www.rtve.es/play/archivo/buscar/?q=calle+13+la+perla',
    'https://www.clarin.com/tema/calle-13.html'
  ];
  // Check citations

  // 3. MusicBrainz Works & Recording Relations
  console.log('\n3. MusicBrainz Work Relations (ID de la obra canónica):');
  try {
    const mbWorkUrl = 'https://musicbrainz.org/ws/2/work?query=work:%22La%20Perla%22%20AND%20artist:%22Calle%2013%22&fmt=json';
    const res = await fetch(mbWorkUrl, { headers: { 'User-Agent': 'YouAppTV/1.0' } });
    if (res.ok) {
      const data = await res.json();
      for (const w of (data.works || []).slice(0, 3)) {
        console.log(`   • Work: ${w.title} (ID: ${w.id})`);
        const wRelUrl = `https://musicbrainz.org/ws/2/work/${w.id}?inc=recording-rels+url-rels&fmt=json`;
        const wRes = await fetch(wRelUrl, { headers: { 'User-Agent': 'YouAppTV/1.0' } });
        if (wRes.ok) {
          const wData = await wRes.json();
          console.log(`     Relations: ${wData.relations?.length || 0}`);
          for (const rel of (wData.relations || [])) {
            console.log(`     -> [${rel.type}] ${rel.target?.title || rel.url?.resource}`);
          }
        }
      }
    }
  } catch (e: any) {
    console.log('MusicBrainz work query error:', e.message);
  }

  // 4. Wikidata item for "La Perla" song
  console.log('\n4. Wikidata Work Entities:');
  try {
    const wdUrl = 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search=La+Perla+Calle+13&language=es&format=json';
    const res = await fetch(wdUrl);
    if (res.ok) {
      const data = await res.json();
      for (const item of (data.search || [])) {
        console.log(`   • [Wikidata] ${item.id}: ${item.label} — ${item.description}`);
      }
    }
  } catch (e: any) {
    console.log('Wikidata search error:', e.message);
  }
}

explore();
