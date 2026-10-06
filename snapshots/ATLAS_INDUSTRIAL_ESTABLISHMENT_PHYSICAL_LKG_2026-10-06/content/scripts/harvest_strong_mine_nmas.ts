/**
 * harvest_strong_mine_nmas.ts — Cosecha Controlada de la Mina Strong N+ Televisa México
 *
 * Mide el KPI: N+ Prediction Accuracy = actualNetNewHarvested / conservativePotentialPredicted (758)
 */

import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { extractFromArticlePage } from '../src/lib/atlasHarvester/parallelExtractor';
import { parseFeedOrSitemapForYouTubeRefs } from '../src/lib/atlasHarvester/youtubeReferenceExtractor';
import type { YouTubeHarvestReference } from '../src/lib/atlasHarvester/types';

async function main() {
  console.log('======================================================================');
  console.log('🎯 N+ TELEVISA MÉXICO: CONTROLLED HARVEST & PREDICTION AUDIT');
  console.log('======================================================================\n');

  const predictedConservative = 758;

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  const startAtlas = initResult.initialTotal;

  console.log(`⚡ Atlas Inicial: ${startAtlas.toLocaleString()} contenidos (${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM).`);
  console.log(`🎯 Predicción Wilson Conservadora: +${predictedConservative.toLocaleString()} net-new\n`);

  const rootUrls = [
    'https://www.nmas.com.mx/robots.txt',
    'https://www.nmas.com.mx/sitemap.xml',
    'https://www.nmas.com.mx/sitemap_index.xml'
  ];

  const pendingBatch: YouTubeHarvestReference[] = [];
  const candidateArticleUrls: string[] = [];
  const seenUrls = new Set<string>();
  const uniqueSeenInHarvest = new Set<string>();
  const discoveredSitemaps: string[] = [];

  let directRefsFound = 0;
  let directNetNew = 0;
  let htmlPagesFetched = 0;
  let htmlRefsFound = 0;
  let htmlNetNew = 0;
  let alreadyKnownCount = 0;
  let duplicatesWithinHarvest = 0;

  const t0 = Date.now();

  // 1. Descubrimiento de Sitemaps de N+ y Extracción Directa XML
  console.log('📡 [Paso 1: Auto-Descubrimiento de Video Sitemaps en N+ Televisa vía robots.txt]');

  for (const rUrl of rootUrls) {
    try {
      const res = await fetch(rUrl, {
        signal: AbortSignal.timeout(6000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!res.ok) continue;
      const text = await res.text();

      if (rUrl.endsWith('robots.txt')) {
        const sitemapMatches = text.match(/Sitemap:\s*(https?:\/\/[^\s]+)/gi);
        if (sitemapMatches) {
          for (const sm of sitemapMatches) {
            const u = sm.replace(/Sitemap:\s*/i, '').trim();
            if (!discoveredSitemaps.includes(u)) discoveredSitemaps.push(u);
          }
        }
      } else {
        if (!discoveredSitemaps.includes(rUrl)) discoveredSitemaps.push(rUrl);
      }
    } catch {
      // Ignorar
    }
  }

  console.log(`  Sitemaps descubiertos en robots.txt: ${discoveredSitemaps.length}`);

  for (const sUrl of discoveredSitemaps) {
    try {
      const res = await fetch(sUrl, {
        signal: AbortSignal.timeout(6000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      });

      if (!res.ok) continue;
      const xmlText = await res.text();

      const direct = parseFeedOrSitemapForYouTubeRefs(xmlText, {
        type: 'video_sitemap',
        sourceUrl: sUrl,
        publisherId: 'nmas_televisa_mx',
        publisherName: 'N+ Televisa México',
        country: 'MX',
        language: 'es',
        category: 'Televisión / Reportajes'
      });

      for (const d of direct) {
        directRefsFound++;
        if (uniqueSeenInHarvest.has(d.videoId)) {
          duplicatesWithinHarvest++;
        } else {
          uniqueSeenInHarvest.add(d.videoId);
          if (dedupeIndex.isDuplicate(d.videoId)) {
            alreadyKnownCount++;
          } else {
            directNetNew++;
            dedupeIndex.markSeen(d.videoId);
            pendingBatch.push(d);
          }
        }
      }

      const locRegex = /<loc>([^<]+)<\/loc>/gi;
      let match: RegExpExecArray | null;
      const childSitemaps: string[] = [];

      while ((match = locRegex.exec(xmlText)) !== null) {
        const url = match[1].trim();
        if (url.endsWith('.xml')) {
          childSitemaps.push(url);
        } else if (!seenUrls.has(url)) {
          seenUrls.add(url);
          candidateArticleUrls.push(url);
        }
      }

      // Expandir child video sitemaps
      for (const cUrl of childSitemaps.slice(0, 20)) {
        try {
          const cRes = await fetch(cUrl, {
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36' }
          });
          if (cRes.ok) {
            const cXml = await cRes.text();
            const cDirect = parseFeedOrSitemapForYouTubeRefs(cXml, {
              type: 'video_sitemap',
              sourceUrl: cUrl,
              publisherId: 'nmas_televisa_mx',
              publisherName: 'N+ Televisa México',
              country: 'MX',
              language: 'es',
              category: 'Televisión / Reportajes'
            });

            for (const cd of cDirect) {
              directRefsFound++;
              if (uniqueSeenInHarvest.has(cd.videoId)) {
                duplicatesWithinHarvest++;
              } else {
                uniqueSeenInHarvest.add(cd.videoId);
                if (dedupeIndex.isDuplicate(cd.videoId)) {
                  alreadyKnownCount++;
                } else {
                  directNetNew++;
                  dedupeIndex.markSeen(cd.videoId);
                  pendingBatch.push(cd);
                }
              }
            }

            const cLocRegex = /<loc>([^<]+)<\/loc>/gi;
            let cm: RegExpExecArray | null;
            while ((cm = cLocRegex.exec(cXml)) !== null) {
              const aUrl = cm[1].trim();
              if (!aUrl.endsWith('.xml') && !seenUrls.has(aUrl)) {
                seenUrls.add(aUrl);
                candidateArticleUrls.push(aUrl);
              }
            }
          }
        } catch {
          // Ignorar timeouts
        }
      }
    } catch {
      // Ignorar timeouts
    }
  }

  console.log(`✅ Paso 1 completado: ${directRefsFound} refs directas (${directNetNew} net-new) | ${candidateArticleUrls.length} artículos encolados.\n`);

  // 2. Extracción Paralela Controlada
  console.log('⚡ [Paso 2: Extracción Paralela Controlada]');
  const batchSize = 35;
  const urlsToHarvest = candidateArticleUrls.slice(0, 3000);

  for (let i = 0; i < urlsToHarvest.length; i += batchSize) {
    const slice = urlsToHarvest.slice(i, i + batchSize);
    const promises = slice.map(async url => {
      const pageResult = await extractFromArticlePage({
        url,
        domain: 'nmas.com.mx',
        publisherId: 'nmas_televisa_mx',
        publisherName: 'N+ Televisa México',
        country: 'MX',
        language: 'es',
        category: 'Televisión / Reportajes',
        priority: 1
      });

      htmlPagesFetched++;

      for (const ref of pageResult.references) {
        htmlRefsFound++;
        if (uniqueSeenInHarvest.has(ref.videoId)) {
          duplicatesWithinHarvest++;
        } else {
          uniqueSeenInHarvest.add(ref.videoId);
          if (dedupeIndex.isDuplicate(ref.videoId)) {
            alreadyKnownCount++;
          } else {
            htmlNetNew++;
            dedupeIndex.markSeen(ref.videoId);
            pendingBatch.push(ref);
          }
        }
      }
    });

    await Promise.all(promises);

    if (pendingBatch.length >= 200) {
      const batchToPersist = pendingBatch.splice(0, pendingBatch.length);
      await dedupeIndex.persistBatch(batchToPersist);
    }
  }

  // Persistir remanente
  if (pendingBatch.length > 0) {
    const batchToPersist = pendingBatch.splice(0, pendingBatch.length);
    await dedupeIndex.persistBatch(batchToPersist);
  }

  const elapsedSeconds = Math.max(1, Math.round((Date.now() - t0) / 1000));
  const totalNetNewHarvested = directNetNew + htmlNetNew;
  const finalAtlasCount = dedupeIndex.getTotalAtlasSize();

  const predictionAccuracy = +((totalNetNewHarvested / predictedConservative) * 100).toFixed(1);
  const netNewPerSec = +(totalNetNewHarvested / elapsedSeconds).toFixed(2);
  const totalUniqueDiscovered = uniqueSeenInHarvest.size;
  const realNoveltyRate = totalUniqueDiscovered > 0
    ? +((totalNetNewHarvested / totalUniqueDiscovered) * 100).toFixed(1)
    : 0;

  let accuracyVerdict = '🔴 RECALIBRAR ESTIMADOR (<50%)';
  if (predictionAccuracy >= 100) accuracyVerdict = '🚀 EXCELENTE (>=100% ➔ Estimador Conservador Cumplido)';
  else if (predictionAccuracy >= 80) accuracyVerdict = '🟢 MUY BUENO (80-100% ➔ Alta Fidelidad)';
  else if (predictionAccuracy >= 60) accuracyVerdict = '🟡 REGULAR (60-80% ➔ Variación Normal)';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       N+ TELEVISA MÉXICO HARVEST & PREDICTION AUDIT REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Mina Cosechada:                 N+ Televisa México (video_sitemap)`);
  console.log(`Tiempo Transcurrido:            ${elapsedSeconds}s (${(elapsedSeconds / 60).toFixed(1)} min)`);
  console.log(`Páginas HTML Descargadas:       ${htmlPagesFetched.toLocaleString()} páginas`);
  console.log(`Atlas Inicial:                  ${startAtlas.toLocaleString()} contenidos`);
  console.log(`Atlas Final:                    ${finalAtlasCount.toLocaleString()} contenidos (+${totalNetNewHarvested.toLocaleString()} net-new) 🎯`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`MÉTRICAS DE NOVEDAD Y PUREZA:`);
  console.log(`  • Referencias Directas XML:     ${directRefsFound.toLocaleString()} (${directNetNew.toLocaleString()} net-new) ⚡`);
  console.log(`  • Referencias HTML Descubiertas:${htmlRefsFound.toLocaleString()} (${htmlNetNew.toLocaleString()} net-new)`);
  console.log(`  • IDs Únicos Descubiertos:      ${totalUniqueDiscovered.toLocaleString()}`);
  console.log(`  • Duplicados Internos (Mina):   ${duplicatesWithinHarvest.toLocaleString()}`);
  console.log(`  • Ya Conocidos en Atlas (RAM):  ${alreadyKnownCount.toLocaleString()} (${(totalUniqueDiscovered > 0 ? (alreadyKnownCount / totalUniqueDiscovered * 100).toFixed(1) : 0)}% solapamiento)`);
  console.log(`  • NOVELTY RATE REAL:            ${realNoveltyRate}% ⭐⭐⭐⭐⭐`);
  console.log(`  • Velocidad Neta (NetNew/s):    ${netNewPerSec} items/s`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`AUDITORÍA DE PRECISIÓN PREDICTIVA (PREDICTION ACCURACY):`);
  console.log(`  • Predicción Conservadora:      +${predictedConservative.toLocaleString()} net-new`);
  console.log(`  • Cosecha Neta Real Obtenida:   +${totalNetNewHarvested.toLocaleString()} net-new`);
  console.log(`  • N+ PREDICTION ACCURACY:       ${predictionAccuracy}% 🎯`);
  console.log(`  • DICTAMEN DE PRECISIÓN:        ${accuracyVerdict}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🏁 COSECHA CONTROLADA DE N+ FINALIZADA.');
}

main().catch(err => {
  console.error('Fatal Harvest Error:', err);
  process.exit(1);
});
