/**
 * harvest_p1_wave3_controlled.ts — Cosecha Controlada Multimina Wave 3 & Tranche Scheduler de Metrópoles
 */

import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { extractFromArticlePage } from '../src/lib/atlasHarvester/parallelExtractor';
import { parseFeedOrSitemapForYouTubeRefs } from '../src/lib/atlasHarvester/youtubeReferenceExtractor';
import { globalCandidateManifest } from '../src/lib/atlasHarvester/mineCandidateManifest';
import type { YouTubeHarvestReference } from '../src/lib/atlasHarvester/types';

interface MineHarvestConfig {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
  category: string;
  sitemaps: string[];
  maxPages: number;
}

const CONTROLLED_MINES: MineHarvestConfig[] = [
  {
    id: 'el_destape_web_ar',
    name: 'El Destape Radio & TV',
    domain: 'eldestapeweb.com',
    country: 'AR',
    language: 'es',
    category: 'Radio / TV / Investigaciones',
    sitemaps: ['https://www.eldestapeweb.com/robots.txt', 'https://www.eldestapeweb.com/sitemap.xml'],
    maxPages: 1500
  },
  {
    id: 'panamericana_tv_pe',
    name: 'Panamericana Televisión Perú',
    domain: 'panamericana.pe',
    country: 'PE',
    language: 'es',
    category: 'Televisión / Archivo Nacional',
    sitemaps: ['https://panamericana.pe/robots.txt', 'https://panamericana.pe/sitemap.xml'],
    maxPages: 1000
  },
  {
    id: 'uno_tv_noticias_mx',
    name: 'Uno TV México (América Móvil)',
    domain: 'unotv.com',
    country: 'MX',
    language: 'es',
    category: 'Video / Noticias / Programas',
    sitemaps: ['https://www.unotv.com/robots.txt', 'https://www.unotv.com/sitemap.xml'],
    maxPages: 1200
  }
];

async function main() {
  console.log('======================================================================');
  console.log('🎯 P1 CONTROLLED HARVEST WAVE 3 & METRÓPOLES TRANCHE SCHEDULER');
  console.log('======================================================================\n');

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  const startAtlas = initResult.initialTotal;

  console.log(`⚡ Atlas Inicial: ${startAtlas.toLocaleString()} contenidos (${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM).\n`);

  const t0 = Date.now();
  let totalNetNewPersisted = 0;

  // =========================================================================
  // ETAPA 1: PERSISTENCIA DEL MANIFIESTO BANCADO (0 REFETCH)
  // =========================================================================
  console.log('💎 [Etapa 1: Persistencia Directa del Manifiesto Bancado en Discovery]');
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
      totalNetNewPersisted += persistedCount;
      console.log(`  ✅ Manifiesto: +${persistedCount} IDs bancados persistidos en Atlas a costo 0 de red.\n`);
    }
  } else {
    console.log(`  ℹ️ Manifiesto en memoria vacío (se extraerán directamente en las etapas siguientes).\n`);
  }

  // =========================================================================
  // ETAPA 2: COSECHA CONTROLADA DE MINAS TÁCTICAS (EL DESTAPE, PANAMERICANA, UNO TV)
  // =========================================================================
  console.log('⚡ [Etapa 2: Cosecha Controlada de Minas de Alta Eficiencia]');

  for (const mine of CONTROLLED_MINES) {
    const tMine0 = Date.now();
    const candidateUrls: string[] = [];
    const discoveredXmls: string[] = [];
    const seenUrls = new Set<string>();
    const uniqueInMine = new Set<string>();

    let directRefsFound = 0;
    let directNetNew = 0;
    let htmlPagesFetched = 0;
    let htmlRefsFound = 0;
    let htmlNetNew = 0;
    let alreadyKnownMine = 0;
    const pendingBatch: YouTubeHarvestReference[] = [];

    // Descubrimiento de Sitemaps
    for (const sUrl of mine.sitemaps) {
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
          publisherId: mine.id,
          publisherName: mine.name,
          country: mine.country,
          language: mine.language,
          category: mine.category
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
          if (!loc.endsWith('.xml') && !seenUrls.has(loc)) {
            seenUrls.add(loc);
            candidateUrls.push(loc);
          }
        }
      } catch {
        // Ignorar
      }
    }

    // Extracción Paralela
    const urlsToHarvest = candidateUrls.slice(0, mine.maxPages);
    const batchSize = 35;

    for (let i = 0; i < urlsToHarvest.length; i += batchSize) {
      const slice = urlsToHarvest.slice(i, i + batchSize);
      const promises = slice.map(async url => {
        const pageResult = await extractFromArticlePage({
          url,
          domain: mine.domain,
          publisherId: mine.id,
          publisherName: mine.name,
          country: mine.country,
          language: mine.language,
          category: mine.category,
          priority: 1
        });

        htmlPagesFetched++;

        for (const ref of pageResult.references) {
          htmlRefsFound++;
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
        const batchToPersist = pendingBatch.splice(0, pendingBatch.length);
        const persisted = await dedupeIndex.persistBatch(batchToPersist);
        totalNetNewPersisted += persisted;
      }
    }

    if (pendingBatch.length > 0) {
      const batchToPersist = pendingBatch.splice(0, pendingBatch.length);
      const persisted = await dedupeIndex.persistBatch(batchToPersist);
      totalNetNewPersisted += persisted;
    }

    const mineNetNew = directNetNew + htmlNetNew;
    const elapsedMine = Math.max(1, Math.round((Date.now() - tMine0) / 1000));
    const mineNov = uniqueInMine.size > 0 ? +((mineNetNew / uniqueInMine.size) * 100).toFixed(1) : 0;
    const mineRate = htmlPagesFetched > 0 ? +(htmlNetNew / htmlPagesFetched).toFixed(3) : 0;

    console.log(`  ✅ [${mine.name}] Cosechadas: ${htmlPagesFetched}p ➔ +${mineNetNew} net-new (${mineNov}% nov | ${mineRate} new/p) en ${elapsedMine}s.`);
  }

  // =========================================================================
  // ETAPA 3: TRANCHE SCHEDULER DE METRÓPOLES BRASIL (2.000 PÁGINAS / TRANCHE)
  // =========================================================================
  console.log('\n🇧🇷 [Etapa 3: Tranche Scheduler de Metrópoles Brasil (2.000p / Tranche)]');

  const metropolesSitemaps = [
    'https://www.metropoles.com/robots.txt',
    'https://www.metropoles.com/sitemap.xml',
    'https://www.metropoles.com/sitemap_index.xml'
  ];

  const metropolesArticleUrls: string[] = [];
  const metropolesXmls: string[] = [];
  const seenMetroUrls = new Set<string>();
  const uniqueMetroInHarvest = new Set<string>();

  for (const sUrl of metropolesSitemaps) {
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
            if (!metropolesXmls.includes(u)) metropolesXmls.push(u);
          }
        }
      } else {
        metropolesXmls.push(sUrl);
      }
    } catch {
      // Ignorar
    }
  }

  for (const cXml of metropolesXmls.slice(0, 10)) {
    try {
      const res = await fetch(cXml, {
        signal: AbortSignal.timeout(5000),
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36' }
      });
      if (!res.ok) continue;
      const text = await res.text();

      const locRegex = /<loc>([^<]+)<\/loc>/gi;
      let match: RegExpExecArray | null;
      while ((match = locRegex.exec(text)) !== null) {
        const loc = match[1].trim();
        if (!loc.endsWith('.xml') && !seenMetroUrls.has(loc)) {
          seenMetroUrls.add(loc);
          metropolesArticleUrls.push(loc);
        }
      }
    } catch {
      // Ignorar
    }
  }

  console.log(`  URLs de Metrópoles identificadas: ${metropolesArticleUrls.length.toLocaleString()}`);

  const trancheSize = 2000;
  let trancheIndex = 1;
  let metroTotalNetNew = 0;

  for (let offset = 0; offset < metropolesArticleUrls.length; offset += trancheSize) {
    const trancheUrls = metropolesArticleUrls.slice(offset, offset + trancheSize);
    if (trancheUrls.length === 0) break;

    const tTranche0 = Date.now();
    let trancheHtmlFetched = 0;
    let trancheHtmlNetNew = 0;
    let trancheAlreadyKnown = 0;
    const tranchePending: YouTubeHarvestReference[] = [];

    const batchSize = 35;
    for (let b = 0; b < trancheUrls.length; b += batchSize) {
      const slice = trancheUrls.slice(b, b + batchSize);
      const promises = slice.map(async url => {
        const pageResult = await extractFromArticlePage({
          url,
          domain: 'metropoles.com',
          publisherId: 'metropoles_brasil',
          publisherName: 'Metrópoles Brasil Videos',
          country: 'BR',
          language: 'pt',
          category: 'Notícias / Entretenimento',
          priority: 1
        });

        trancheHtmlFetched++;

        for (const ref of pageResult.references) {
          if (!uniqueMetroInHarvest.has(ref.videoId)) {
            uniqueMetroInHarvest.add(ref.videoId);
            if (dedupeIndex.isDuplicate(ref.videoId)) {
              trancheAlreadyKnown++;
            } else {
              trancheHtmlNetNew++;
              dedupeIndex.markSeen(ref.videoId);
              tranchePending.push(ref);
            }
          }
        }
      });

      await Promise.all(promises);

      if (tranchePending.length >= 100) {
        const toPersist = tranchePending.splice(0, tranchePending.length);
        const persisted = await dedupeIndex.persistBatch(toPersist);
        metroTotalNetNew += persisted;
        totalNetNewPersisted += persisted;
      }
    }

    if (tranchePending.length > 0) {
      const toPersist = tranchePending.splice(0, tranchePending.length);
      const persisted = await dedupeIndex.persistBatch(toPersist);
      metroTotalNetNew += persisted;
      totalNetNewPersisted += persisted;
    }

    const elapsedTranche = Math.max(1, Math.round((Date.now() - tTranche0) / 1000));
    const trancheRate = trancheHtmlFetched > 0 ? +(trancheHtmlNetNew / trancheHtmlFetched).toFixed(3) : 0;
    const totalTrancheRefs = trancheHtmlNetNew + trancheAlreadyKnown;
    const trancheNovelty = totalTrancheRefs > 0 ? +((trancheHtmlNetNew / totalTrancheRefs) * 100).toFixed(1) : 0;
    const trancheVel = +(trancheHtmlNetNew / elapsedTranche).toFixed(2);

    let trancheDecision = 'CONTINUAR (Óptimo)';
    if (trancheRate >= 0.18 && trancheNovelty >= 80) trancheDecision = 'CONTINUAR (>=0.18 new/page) 🟢';
    else if (trancheRate >= 0.12 && trancheNovelty >= 80) trancheDecision = 'CONTINUAR VIGILADO (0.12-0.18 new/page) 🟡';
    else if (trancheRate >= 0.07 && trancheNovelty >= 80) trancheDecision = 'REDUCIR RITMO (0.07-0.12 new/page) 🟠';
    else trancheDecision = 'STOP TRANCHE (<0.07 o novelty <80%) 🔴';

    console.log(`  [TRANCHE ${trancheIndex}] Páginas: ${trancheHtmlFetched}p ➔ +${trancheHtmlNetNew} net-new (${trancheNovelty}% nov | ${trancheRate} new/p | ${trancheVel}/s) ➔ Decisión: ${trancheDecision}`);

    if (trancheRate < 0.07 || trancheNovelty < 80) {
      console.log(`  🛑 Gate Tranche activado: detenido para proteger ancho de banda.`);
      break;
    }

    trancheIndex++;
    if (trancheIndex > 3) break; // Límite de 3 tranches (6.000p) por corrida controlada
  }

  const elapsedTotal = Math.max(1, Math.round((Date.now() - t0) / 1000));
  const finalAtlas = dedupeIndex.getTotalAtlasSize();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       P1 CONTROLLED HARVEST WAVE 3 FINAL REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Tiempo Total de Cosecha:        ${elapsedTotal}s (${(elapsedTotal / 60).toFixed(1)} min)`);
  console.log(`Atlas Inicial:                  ${startAtlas.toLocaleString()} contenidos`);
  console.log(`Atlas Final:                    ${finalAtlas.toLocaleString()} contenidos (+${totalNetNewPersisted.toLocaleString()} net-new físicos) 🎯`);
  console.log(`Faltante Real para 100K:        ${Math.max(0, 100000 - finalAtlas).toLocaleString()} contenidos`);
  console.log(`Velocidad Neta Global:          ${+(totalNetNewPersisted / elapsedTotal).toFixed(2)} items/s`);
  console.log(`YouTube Search.list Calls:      0 🔒 (INVIOLABLE = 0)`);
  console.log(`YouTube Radar Quota Used:       0 u 🔒`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🏁 COSECHA CONTROLADA WAVE 3 FINALIZADA.');
}

main().catch(err => {
  console.error('Fatal Harvest Error:', err);
  process.exit(1);
});
