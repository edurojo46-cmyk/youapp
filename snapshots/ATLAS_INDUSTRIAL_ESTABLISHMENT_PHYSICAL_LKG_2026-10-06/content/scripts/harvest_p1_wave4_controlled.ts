/**
 * harvest_p1_wave4_controlled.ts — Cosecha Controlada Wave 4 (Streaming, Radio Filmada y Entrevistas)
 */

import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { extractFromArticlePage } from '../src/lib/atlasHarvester/parallelExtractor';
import { parseFeedOrSitemapForYouTubeRefs } from '../src/lib/atlasHarvester/youtubeReferenceExtractor';
import { globalCandidateManifest } from '../src/lib/atlasHarvester/mineCandidateManifest';
import type { YouTubeHarvestReference } from '../src/lib/atlasHarvester/types';

interface Wave4TargetConfig {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
  category: string;
  sitemaps: string[];
  maxPages: number;
}

const WAVE4_HARVEST_TARGETS: Wave4TargetConfig[] = [
  // 1. Radio Con Vos (0.688 density, +470 potential)
  {
    id: 'radioconvos_ar',
    name: 'Radio Con Vos 89.9 Argentina',
    domain: 'radioconvos.com.ar',
    country: 'AR',
    language: 'es',
    category: 'Radio / Entrevistas / Opinión',
    sitemaps: ['https://radioconvos.com.ar/robots.txt', 'https://radioconvos.com.ar/sitemap.xml'],
    maxPages: 1200
  },
  // 2. Urbana Play (0.588 density, +397 potential)
  {
    id: 'urbanaplay_streaming_ar',
    name: 'Urbana Play 104.3 Argentina',
    domain: 'urbanaplayfm.com',
    country: 'AR',
    language: 'es',
    category: 'Radio / Streaming / Música en Vivo',
    sitemaps: ['https://urbanaplayfm.com/robots.txt', 'https://urbanaplayfm.com/sitemap.xml'],
    maxPages: 1000
  },
  // 3. Exitosa Noticias Perú (+443 potential)
  {
    id: 'exitosa_noticias_pe',
    name: 'Exitosa Noticias Perú (Radio & TV)',
    domain: 'exitosanoticias.pe',
    country: 'PE',
    language: 'es',
    category: 'Radio / Televisión / Debates',
    sitemaps: ['https://exitosanoticias.pe/robots.txt', 'https://exitosanoticias.pe/sitemap.xml'],
    maxPages: 1200
  },
  // 4. Súbela Radio Chile (+549 potential)
  {
    id: 'subela_radio_chile',
    name: 'Súbela Radio Chile',
    domain: 'subela.cl',
    country: 'CL',
    language: 'es',
    category: 'Radio Online / Música / Entrevistas',
    sitemaps: ['https://subela.cl/robots.txt', 'https://subela.cl/sitemap.xml'],
    maxPages: 1000
  },
  // 5. La Silla Vacía Colombia (+332 potential)
  {
    id: 'la_silla_vacia_co',
    name: 'La Silla Vacía Colombia (Podcasts & Videos)',
    domain: 'lasillavacia.com',
    country: 'CO',
    language: 'es',
    category: 'Periodismo / Podcasts / Video',
    sitemaps: ['https://lasillavacia.com/robots.txt', 'https://lasillavacia.com/sitemap.xml'],
    maxPages: 800
  },
  // 6. Futurock Radio & TV (+151 potential)
  {
    id: 'futurock_streaming_ar',
    name: 'Futurock Radio & TV',
    domain: 'futurock.fm',
    country: 'AR',
    language: 'es',
    category: 'Radio Filmada / Podcasts / Música',
    sitemaps: ['https://futurock.fm/robots.txt', 'https://futurock.fm/sitemap.xml'],
    maxPages: 600
  }
];

async function main() {
  console.log('======================================================================');
  console.log('🎯 P1 CONTROLLED HARVEST WAVE 4 (STREAMING & RADIO FILMADA)');
  console.log('======================================================================\n');

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  const startAtlas = initResult.initialTotal;

  console.log(`⚡ Atlas Inicial: ${startAtlas.toLocaleString()} contenidos (${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM).\n`);

  const t0 = Date.now();
  let totalNetNewHarvested = 0;

  // =========================================================================
  // ETAPA 1: PERSISTENCIA DEL MANIFIESTO BANCADO (0 REFETCH)
  // =========================================================================
  console.log('💎 [Etapa 1: Persistencia Directa del Manifiesto Bancado]');
  const bankedRefs = globalCandidateManifest.toHarvestReferences();
  if (bankedRefs.length > 0) {
    const unpersistedRefs: YouTubeHarvestReference[] = [];
    for (const ref of bankedRefs) {
      if (!dedupeIndex.isDuplicate(ref.videoId)) {
        dedupeIndex.markSeen(ref.videoId);
        unpersistedRefs.push(ref);
      }
    }
    if (unpersistedRefs.length > 0) {
      const persistedCount = await dedupeIndex.persistBatch(unpersistedRefs);
      totalNetNewHarvested += persistedCount;
      console.log(`  ✅ Manifiesto: +${persistedCount} IDs bancados persistidos en Atlas a costo 0 de red.\n`);
    }
  } else {
    console.log(`  ℹ️ Manifiesto en memoria vacío (se extraerán directamente en las etapas siguientes).\n`);
  }

  // =========================================================================
  // ETAPA 2: COSECHA CONTROLADA CON TRANCHE GATES
  // =========================================================================
  console.log('⚡ [Etapa 2: Cosecha Controlada por Minas con Tranche Gates]');

  for (const target of WAVE4_HARVEST_TARGETS) {
    const tTarget0 = Date.now();
    const candidateUrls: string[] = [];
    const discoveredXmls: string[] = [];
    const seenUrls = new Set<string>();
    const uniqueInMine = new Set<string>();

    let directRefsFound = 0;
    let directNetNew = 0;
    let htmlPagesFetched = 0;
    let htmlNetNew = 0;
    let alreadyKnownMine = 0;
    const pendingBatch: YouTubeHarvestReference[] = [];

    // Descubrimiento de Sitemaps
    for (const sUrl of target.sitemaps) {
      try {
        const res = await fetch(sUrl, {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36' }
        });
        if (!res.ok) continue;
        const text = await res.text();

        if (sUrl.endsWith('robots.txt')) {
          const smMatch = text.match(/Sitemap:\s*(https?:\/\/[^\s]+)/gi);
          if (smMatch) {
            for (const sm of smMatch) {
              const u = sm.replace(/Sitemap:\s*/i, '').trim();
              if (!discoveredXmls.includes(u)) discoveredXmls.push(u);
            }
          }
        } else {
          discoveredXmls.push(sUrl);
        }
      } catch {
        // Ignorar
      }
    }

    const childXmls: string[] = [];
    for (const xmlUrl of discoveredXmls) {
      try {
        const res = await fetch(xmlUrl, {
          signal: AbortSignal.timeout(6000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36' }
        });
        if (!res.ok) continue;
        const xmlText = await res.text();

        const direct = parseFeedOrSitemapForYouTubeRefs(xmlText, {
          type: 'sitemap_index',
          sourceUrl: xmlUrl,
          publisherId: target.id,
          publisherName: target.name,
          country: target.country,
          language: target.language,
          category: target.category
        });

        for (const d of direct) {
          directRefsFound++;
          if (!uniqueInMine.has(d.videoId)) {
            uniqueInMine.add(d.videoId);
            if (dedupeIndex.isDuplicate(d.videoId)) {
              alreadyKnownMine++;
            } else {
              directNetNew++;
              dedupeIndex.markSeen(d.videoId);
              pendingBatch.push(d);
            }
          }
        }

        const locRegex = /<loc>([^<]+)<\/loc>/gi;
        let match: RegExpExecArray | null;
        while ((match = locRegex.exec(xmlText)) !== null) {
          const loc = match[1].trim();
          if (loc.endsWith('.xml')) {
            childXmls.push(loc);
          } else if (!seenUrls.has(loc)) {
            seenUrls.add(loc);
            candidateUrls.push(loc);
          }
        }
      } catch {
        // Ignorar
      }
    }

    // Expandir child XMLs
    for (const cXml of childXmls.slice(0, 15)) {
      try {
        const cRes = await fetch(cXml, {
          signal: AbortSignal.timeout(5000),
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36' }
        });
        if (!cRes.ok) continue;
        const cXmlText = await cRes.text();

        const cDirect = parseFeedOrSitemapForYouTubeRefs(cXmlText, {
          type: 'sitemap_index',
          sourceUrl: cXml,
          publisherId: target.id,
          publisherName: target.name,
          country: target.country,
          language: target.language,
          category: target.category
        });

        for (const cd of cDirect) {
          directRefsFound++;
          if (!uniqueInMine.has(cd.videoId)) {
            uniqueInMine.add(cd.videoId);
            if (dedupeIndex.isDuplicate(cd.videoId)) {
              alreadyKnownMine++;
            } else {
              directNetNew++;
              dedupeIndex.markSeen(cd.videoId);
              pendingBatch.push(cd);
            }
          }
        }

        const locRegex = /<loc>([^<]+)<\/loc>/gi;
        let cm: RegExpExecArray | null;
        while ((cm = locRegex.exec(cXmlText)) !== null) {
          const aUrl = cm[1].trim();
          if (!aUrl.endsWith('.xml') && !seenUrls.has(aUrl)) {
            seenUrls.add(aUrl);
            candidateUrls.push(aUrl);
          }
        }
      } catch {
        // Ignorar
      }
    }

    // Extracción Paralela con Tranche Gates
    const urlsToHarvest = candidateUrls.slice(0, target.maxPages);
    const batchSize = 35;

    for (let i = 0; i < urlsToHarvest.length; i += batchSize) {
      const slice = urlsToHarvest.slice(i, i + batchSize);
      const promises = slice.map(async url => {
        const pageResult = await extractFromArticlePage({
          url,
          domain: target.domain,
          publisherId: target.id,
          publisherName: target.name,
          country: target.country,
          language: target.language,
          category: target.category,
          priority: 1
        });

        htmlPagesFetched++;

        for (const ref of pageResult.references) {
          if (!uniqueInMine.has(ref.videoId)) {
            uniqueInMine.add(ref.videoId);
            if (dedupeIndex.isDuplicate(ref.videoId)) {
              alreadyKnownMine++;
            } else {
              htmlNetNew++;
              dedupeIndex.markSeen(ref.videoId);
              pendingBatch.push(ref);
            }
          }
        }
      });

      await Promise.all(promises);

      if (pendingBatch.length >= 100) {
        const toPersist = pendingBatch.splice(0, pendingBatch.length);
        const persisted = await dedupeIndex.persistBatch(toPersist);
        totalNetNewHarvested += persisted;
      }

      // Tranche gate check a las 300 páginas
      if (htmlPagesFetched >= 300) {
        const currentDensity = htmlNetNew / htmlPagesFetched;
        const currentNovelty = (htmlNetNew + alreadyKnownMine) > 0 ? (htmlNetNew / (htmlNetNew + alreadyKnownMine)) * 100 : 100;
        if (currentDensity < 0.05 || currentNovelty < 80) {
          console.log(`  🛑 [${target.name}] Tranche Gate activado (<0.05 new/p o <80% nov) tras ${htmlPagesFetched}p ➔ Corte preventivo.`);
          break;
        }
      }
    }

    if (pendingBatch.length > 0) {
      const toPersist = pendingBatch.splice(0, pendingBatch.length);
      const persisted = await dedupeIndex.persistBatch(toPersist);
      totalNetNewHarvested += persisted;
    }

    const mineNetNew = directNetNew + htmlNetNew;
    const elapsedMine = Math.max(1, Math.round((Date.now() - tTarget0) / 1000));
    const mineNov = uniqueInMine.size > 0 ? +((mineNetNew / uniqueInMine.size) * 100).toFixed(1) : 0;
    const mineRate = htmlPagesFetched > 0 ? +(htmlNetNew / htmlPagesFetched).toFixed(3) : 0;
    const mineVel = +(mineNetNew / elapsedMine).toFixed(2);

    console.log(`  ✅ [${target.name}] ${htmlPagesFetched}p ➔ +${mineNetNew} net-new (${mineNov}% nov | ${mineRate} new/p | ${mineVel}/s) en ${elapsedMine}s.`);
  }

  const elapsedTotal = Math.max(1, Math.round((Date.now() - t0) / 1000));
  const finalAtlas = dedupeIndex.getTotalAtlasSize();
  const runDelta = totalNetNewHarvested;
  const sessionDelta = finalAtlas - 64793;

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       P1 CONTROLLED HARVEST WAVE 4 FINAL REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Tiempo Total de Cosecha:        ${elapsedTotal}s (${(elapsedTotal / 60).toFixed(1)} min)`);
  console.log(`RUN DELTA (Esta corrida):       +${runDelta.toLocaleString()} contenidos net-new 🎯`);
  console.log(`SESSION DELTA (Sesión de hoy):  +${sessionDelta.toLocaleString()} contenidos net-new`);
  console.log(`ATLAS LIFETIME TOTAL:           ${finalAtlas.toLocaleString()} contenidos limpios`);
  console.log(`Faltante Real para 100K:        ${Math.max(0, 100000 - finalAtlas).toLocaleString()} contenidos`);
  console.log(`Velocidad Neta Global:          ${+(totalNetNewHarvested / elapsedTotal).toFixed(2)} items/s`);
  console.log(`YouTube Search.list Calls:      0 🔒 (INVIOLABLE = 0)`);
  console.log(`YouTube Radar Quota Used:       0 u 🔒`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🏁 COSECHA CONTROLADA WAVE 4 FINALIZADA.');
}

main().catch(err => {
  console.error('Fatal Harvest Error:', err);
  process.exit(1);
});
