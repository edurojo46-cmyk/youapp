/**
 * harvest_elite_mine_eldiario.ts — Cosecha Táctica de Validación sobre la Mina Elite elDiario.es
 *
 * Mide el KPI: Mine Prediction Accuracy = actualNetNewHarvested / conservativePotentialPredicted
 */

import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { extractFromArticlePage } from '../src/lib/atlasHarvester/parallelExtractor';
import { parseFeedOrSitemapForYouTubeRefs } from '../src/lib/atlasHarvester/youtubeReferenceExtractor';
import type { YouTubeHarvestReference } from '../src/lib/atlasHarvester/types';

async function main() {
  console.log('======================================================================');
  console.log('🎯 ELITE VALIDATION HARVEST: elDiario.es & PREDICTION ACCURACY AUDIT');
  console.log('======================================================================\n');

  const predictedConservativePotential = 2602;

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  const startAtlasCount = initResult.initialTotal;

  console.log(`⚡ Atlas Inicial: ${startAtlasCount.toLocaleString()} contenidos (${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM).`);
  console.log(`🎯 Predicción Wilson Conservadora: +${predictedConservativePotential.toLocaleString()} net-new\n`);

  const sitemapUrls = [
    'https://www.eldiario.es/sitemap.xml',
    'https://www.eldiario.es/rss/cultura/'
  ];

  const pendingBatch: YouTubeHarvestReference[] = [];
  const candidateArticleUrls: string[] = [];
  const seenUrls = new Set<string>();

  let directRefsFound = 0;
  let directNetNew = 0;
  let htmlPagesFetched = 0;
  let htmlRefsFound = 0;
  let htmlNetNew = 0;
  let alreadyKnownCount = 0;
  let duplicatesWithinHarvest = 0;
  const uniqueSeenInHarvest = new Set<string>();

  const t0 = Date.now();

  // 1. Descubrimiento y Extracción Directa de Sitemaps de elDiario.es
  console.log('📡 [Paso 1: Descubrimiento de Sitemaps y Extracción Directa XML]');

  for (const sUrl of sitemapUrls) {
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

      // Extracción directa de YouTube
      const direct = parseFeedOrSitemapForYouTubeRefs(xmlText, {
        type: 'sitemap_index',
        sourceUrl: sUrl,
        publisherId: 'eldiario_es_cultura',
        publisherName: 'elDiario.es (Cultura / Cine / Libros)',
        country: 'ES',
        language: 'es',
        category: 'Cultura / Cine'
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

      // Extracción de URLs de artículos y sub-sitemaps
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

      // Expandir child sitemaps históricos de cultura
      for (const cUrl of childSitemaps.slice(0, 15)) {
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
              publisherId: 'eldiario_es_cultura',
              publisherName: 'elDiario.es (Cultura / Cine / Libros)',
              country: 'ES',
              language: 'es',
              category: 'Cultura / Cine'
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

  // 2. Extracción Paralela de Artículos
  console.log('⚡ [Paso 2: Extracción Paralela de Artículos]');
  const batchSize = 35;
  const urlsToHarvest = candidateArticleUrls.slice(0, 4000);

  for (let i = 0; i < urlsToHarvest.length; i += batchSize) {
    const slice = urlsToHarvest.slice(i, i + batchSize);
    const promises = slice.map(async url => {
      const pageResult = await extractFromArticlePage({
        url,
        domain: 'eldiario.es',
        publisherId: 'eldiario_es_cultura',
        publisherName: 'elDiario.es (Cultura / Cine / Libros)',
        country: 'ES',
        language: 'es',
        category: 'Cultura / Cine',
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

  const predictionAccuracy = +((totalNetNewHarvested / predictedConservativePotential) * 100).toFixed(1);
  const netNewPerSec = +(totalNetNewHarvested / elapsedSeconds).toFixed(2);
  const observedNetNewPerSamplePage = htmlPagesFetched > 0 ? +(htmlNetNew / htmlPagesFetched).toFixed(3) : 0;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       ELITE MINE HARVEST AUDIT & PREDICTION ACCURACY REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Mina Cosechada:                 elDiario.es (Cultura / Cine / Libros)`);
  console.log(`Tiempo Transcurrido:            ${elapsedSeconds}s (${(elapsedSeconds / 60).toFixed(1)} min)`);
  console.log(`Páginas HTML Descargadas:       ${htmlPagesFetched.toLocaleString()} páginas`);
  console.log(`Atlas Inicial:                  ${startAtlasCount.toLocaleString()} contenidos`);
  console.log(`Atlas Final:                    ${finalAtlasCount.toLocaleString()} contenidos (+${totalNetNewHarvested.toLocaleString()} net-new) 🎯`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`MÉTRICAS DETALLADAS DE NOVEDAD REAL:`);
  console.log(`  • Referencias Directas XML:     ${directRefsFound.toLocaleString()} (${directNetNew.toLocaleString()} net-new) ⚡`);
  console.log(`  • Referencias HTML Descubiertas:${htmlRefsFound.toLocaleString()} (${htmlNetNew.toLocaleString()} net-new)`);
  console.log(`  • Duplicados Internos (Mina):   ${duplicatesWithinHarvest.toLocaleString()}`);
  console.log(`  • Ya Conocidos en Atlas (RAM):  ${alreadyKnownCount.toLocaleString()}`);
  console.log(`  • ObservedNetNewPerSamplePage:  ${observedNetNewPerSamplePage} net-new/página`);
  console.log(`  • Velocidad Neta (NetNew/s):    ${netNewPerSec} items/s`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`AUDITORÍA DE PRECISIÓN PREDICTIVA (PREDICTION ACCURACY):`);
  console.log(`  • Predicción Conservadora:      +${predictedConservativePotential.toLocaleString()} net-new`);
  console.log(`  • Cosecha Neta Real Obtenida:   +${totalNetNewHarvested.toLocaleString()} net-new`);
  console.log(`  • MINE PREDICTION ACCURACY:     ${predictionAccuracy}% 🎯`);

  let accuracyVerdict = '🔴 RECALIBRAR ESTIMADOR (<60%)';
  if (predictionAccuracy >= 100) accuracyVerdict = '🚀 EXCELENTE (>=100% ➔ Predictor Conservador Perfecto)';
  else if (predictionAccuracy >= 80) accuracyVerdict = '🟢 MUY BUENO (80-100% ➔ Alta Fiabilidad)';
  else if (predictionAccuracy >= 60) accuracyVerdict = '🟡 ACEPTABLE (60-80% ➔ Margen de Variación Normal)';
  console.log(`  • DICTAMEN DE PRECISIÓN:        ${accuracyVerdict}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🏁 COSECHA DE VALIDACIÓN ELITE FINALIZADA.');
}

main().catch(err => {
  console.error('Fatal Harvest Error:', err);
  process.exit(1);
});
