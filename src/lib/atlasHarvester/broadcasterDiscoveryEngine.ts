/**
 * broadcasterDiscoveryEngine.ts — Motor de Descubrimiento P1 Wave 4 (Arquetipos Streaming & Radio Filmada)
 */

import { extractFromArticlePage } from './parallelExtractor';
import { parseFeedOrSitemapForYouTubeRefs } from './youtubeReferenceExtractor';
import { calculateWilsonLowerBound } from './newMineDiscoveryEngine';
import { globalCandidateManifest } from './mineCandidateManifest';
import { computeFingerprintSimilarity } from './mineFingerprint';
import type { HarvestDedupeIndex } from './harvestDedupeIndex';
import type { YouTubeHarvestReference } from './types';

export type MineExhaustionStatus = 'untouched' | 'discovered' | 'partial' | 'harvested' | 'exhausted';

export interface BroadcasterTarget {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
  category: string;
  front: 'argentina_streaming' | 'mexico_streaming' | 'brasil_streaming' | 'colombia_peru_streaming' | 'chile_espana_streaming' | 'deportes_conciertos';
  isStreamingOrRadio?: boolean;
  hasVideoSection?: boolean;
  rootUrls: string[];
}

export const P1_WAVE4_TARGETS: BroadcasterTarget[] = [
  // 🇦🇷 1. FRENTE ARGENTINA STREAMING & RADIOS FILMADAS (Arquetipo El Destape)
  {
    id: 'futurock_streaming_ar',
    name: 'Futurock Radio & TV',
    domain: 'futurock.fm',
    country: 'AR',
    language: 'es',
    category: 'Radio Filmada / Podcasts / Música',
    front: 'argentina_streaming',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    rootUrls: ['https://futurock.fm/robots.txt', 'https://futurock.fm/sitemap.xml']
  },
  {
    id: 'urbanaplay_streaming_ar',
    name: 'Urbana Play 104.3 (En Vivo & Entrevistas)',
    domain: 'urbanaplayfm.com',
    country: 'AR',
    language: 'es',
    category: 'Radio / Streaming / Música en Vivo',
    front: 'argentina_streaming',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    rootUrls: ['https://urbanaplayfm.com/robots.txt', 'https://urbanaplayfm.com/sitemap.xml']
  },
  {
    id: 'radioconvos_ar',
    name: 'Radio Con Vos 89.9',
    domain: 'radioconvos.com.ar',
    country: 'AR',
    language: 'es',
    category: 'Radio / Entrevistas / Opinión',
    front: 'argentina_streaming',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    rootUrls: ['https://radioconvos.com.ar/robots.txt', 'https://radioconvos.com.ar/sitemap.xml']
  },
  {
    id: 'vorterix_rock_streaming',
    name: 'Vorterix Rock & Streaming',
    domain: 'vorterix.com',
    country: 'AR',
    language: 'es',
    category: 'Música Rock / Streaming / Conciertos',
    front: 'argentina_streaming',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    rootUrls: ['https://vorterix.com/robots.txt', 'https://vorterix.com/sitemap.xml']
  },
  {
    id: 'gelatina_streaming_ar',
    name: 'Gelatina (Pedro Rosemblat / Streaming)',
    domain: 'somosgelatina.com',
    country: 'AR',
    language: 'es',
    category: 'Streaming / Entrevistas / Música',
    front: 'argentina_streaming',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    rootUrls: ['https://somosgelatina.com/robots.txt', 'https://somosgelatina.com/sitemap.xml']
  },

  // 🇲🇽 2. FRENTE MÉXICO (Streaming, Radio Filmada y Opinión Digital)
  {
    id: 'la_octava_centro_mx',
    name: 'La Octava / Grupo Radio Centro',
    domain: 'laoctava.com',
    country: 'MX',
    language: 'es',
    category: 'Radio Filmada / Noticias / Análisis',
    front: 'mexico_streaming',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    rootUrls: ['https://laoctava.com/robots.txt', 'https://laoctava.com/sitemap.xml']
  },
  {
    id: 'mvs_noticias_streaming_mx',
    name: 'MVS Noticias & Radio Filmada',
    domain: 'mvsnoticias.com',
    country: 'MX',
    language: 'es',
    category: 'Radio / Noticias / Entrevistas',
    front: 'mexico_streaming',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    rootUrls: ['https://mvsnoticias.com/robots.txt', 'https://mvsnoticias.com/sitemap.xml', 'https://mvsnoticias.com/sitemap_index.xml']
  },
  {
    id: 'latinus_video_mx',
    name: 'Latinus Media (Loret / Brozo / Reportajes)',
    domain: 'latinus.us',
    country: 'MX/US',
    language: 'es',
    category: 'Video / Reportajes Especiales',
    front: 'mexico_streaming',
    isStreamingOrRadio: false,
    hasVideoSection: true,
    rootUrls: ['https://latinus.us/robots.txt', 'https://latinus.us/sitemap.xml', 'https://latinus.us/sitemap_index.xml']
  },
  {
    id: 'el_financiero_bloomberg_mx',
    name: 'El Financiero Bloomberg TV',
    domain: 'elfinanciero.com.mx',
    country: 'MX',
    language: 'es',
    category: 'Televisión / Negocios / Análisis',
    front: 'mexico_streaming',
    isStreamingOrRadio: false,
    hasVideoSection: true,
    rootUrls: ['https://www.elfinanciero.com.mx/robots.txt', 'https://www.elfinanciero.com.mx/sitemap.xml', 'https://www.elfinanciero.com.mx/sitemap_index.xml']
  },

  // 🇧🇷 3. FRENTE BRASIL (Podcasts em Estúdio, TV Digital e Esportes)
  {
    id: 'jovem_pan_panflix_br',
    name: 'Jovem Pan News / Panflix',
    domain: 'jovempan.com.br',
    country: 'BR',
    language: 'pt',
    category: 'Rádio Filmada / Notícias / Debates',
    front: 'brasil_streaming',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    rootUrls: ['https://jovempan.com.br/robots.txt', 'https://jovempan.com.br/sitemap.xml', 'https://jovempan.com.br/sitemap_index.xml']
  },
  {
    id: 'uol_esporte_video_br',
    name: 'UOL Esporte & Vídeos Brasil',
    domain: 'uol.com.br',
    country: 'BR',
    language: 'pt',
    category: 'Esporte / Futebol / Entrevistas',
    front: 'brasil_streaming',
    isStreamingOrRadio: false,
    hasVideoSection: true,
    rootUrls: ['https://www.uol.com.br/robots.txt', 'https://www.uol.com.br/esporte/sitemap.xml', 'https://rss.uol.com.br/feed/esporte.xml']
  },

  // 🇨🇴 🇵🇪 4. FRENTE COLOMBIA & PERÚ (Radio Filmada & Investigaciones)
  {
    id: 'blu_radio_colombia',
    name: 'Blu Radio Colombia (En Vivo & Video)',
    domain: 'bluradio.com',
    country: 'CO',
    language: 'es',
    category: 'Radio Filmada / Noticias / Opinión',
    front: 'colombia_peru_streaming',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    rootUrls: ['https://www.bluradio.com/robots.txt', 'https://www.bluradio.com/sitemap.xml', 'https://www.bluradio.com/sitemap_index.xml']
  },
  {
    id: 'exitosa_noticias_pe',
    name: 'Exitosa Noticias Perú (Radio & TV)',
    domain: 'exitosanoticias.pe',
    country: 'PE',
    language: 'es',
    category: 'Radio / Televisión / Debates',
    front: 'colombia_peru_streaming',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    rootUrls: ['https://exitosanoticias.pe/robots.txt', 'https://exitosanoticias.pe/sitemap.xml']
  },
  {
    id: 'la_silla_vacia_co',
    name: 'La Silla Vacía (Podcasts & Videos)',
    domain: 'lasillavacia.com',
    country: 'CO',
    language: 'es',
    category: 'Periodismo / Podcasts / Video',
    front: 'colombia_peru_streaming',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    rootUrls: ['https://www.lasillavacia.com/robots.txt', 'https://www.lasillavacia.com/sitemap.xml']
  },

  // 🇨🇱 🇪🇸 5. FRENTE CHILE & ESPAÑA (Radios Independientes & Cultura)
  {
    id: 'subela_radio_chile',
    name: 'Súbela Radio Chile (Podcasts & Cultura)',
    domain: 'subela.cl',
    country: 'CL',
    language: 'es',
    category: 'Radio Online / Música / Entrevistas',
    front: 'chile_espana_streaming',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    rootUrls: ['https://subela.cl/robots.txt', 'https://subela.cl/sitemap.xml']
  },
  {
    id: 'el_salto_diario_es',
    name: 'El Salto Diario (Radio & Audiovisual)',
    domain: 'elsaltodiario.com',
    country: 'ES',
    language: 'es',
    category: 'Cultura / Podcasts / Documentales',
    front: 'chile_espana_streaming',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    rootUrls: ['https://www.elsaltodiario.com/robots.txt', 'https://www.elsaltodiario.com/sitemap.xml']
  },
  {
    id: 'infolibre_video_es',
    name: 'infoLibre Videos & Debates',
    domain: 'infolibre.es',
    country: 'ES',
    language: 'es',
    category: 'Opinión / Entrevistas / Debates',
    front: 'chile_espana_streaming',
    isStreamingOrRadio: false,
    hasVideoSection: true,
    rootUrls: ['https://www.infolibre.es/robots.txt', 'https://www.infolibre.es/sitemap.xml', 'https://www.infolibre.es/sitemap_index.xml']
  }
];

export type ObservedTier = 'confirmed_mega' | 'confirmed_elite' | 'confirmed_strong' | 'confirmed_tactical' | 'small_clean' | 'saturated' | 'inconclusive';
export type EstimatedTier = 'estimated_mega' | 'estimated_elite' | 'estimated_strong' | 'estimated_tactical' | 'small_clean' | 'saturated' | 'inconclusive';

export interface BroadcasterDiscoveryResult {
  broadcasterId: string;
  broadcasterName: string;
  domain: string;
  country: string;
  category: string;
  front: string;

  discoveredSitemaps: string[];
  structureType: 'video_sitemap' | 'sitemap_index' | 'multi_cohort' | 'historical_partition' | 'media_archive' | 'none';
  archiveDepth: '10+ years' | '5-10 years' | '1-5 years' | 'current only' | 'unknown';
  totalRealUrlsDiscovered: number;

  pagesSampled: number;
  samplingStage: 'stage1_25' | 'stage2_100' | 'stage3_250';
  directVideoRefsFound: number;
  htmlVideoRefsFound: number;
  totalRefsFound: number;

  // Fuel Accounting Riguroso
  observedUniqueDiscovered: number;
  observedAlreadyKnownAtlas: number;
  observedUniqueNetNew: number;
  observedUnpersistedFuel: number;

  rawNoveltyRate: number;
  observedNetNewPerPage: number;
  wilsonLowerBound: number;
  observedNetNewVelocity: number;
  directReferenceRate: number;

  // Fingerprinting & Archetype Affinity
  primaryArchetype: string;
  archetypeSimilarity: number;
  mineProductionScore: number;
  mineStatus: MineExhaustionStatus;

  remainingRealUrls: number;
  estimatedRemainingPoint: number;
  estimatedRemainingConservative: number;
  totalConservativeFuel: number;

  observedTier: ObservedTier;
  estimatedTier: EstimatedTier;
  qualificationReason: string;
}

function getStratifiedSample(urls: string[], sampleLimit: number): string[] {
  if (urls.length <= sampleLimit) return urls;

  const result: string[] = [];
  const strataCount = 5;
  const perStratum = Math.floor(sampleLimit / strataCount);
  const total = urls.length;

  for (let s = 0; s < strataCount; s++) {
    const startIdx = Math.floor((s / strataCount) * total);
    const endIdx = Math.floor(((s + 1) / strataCount) * total);
    const stratumSlice = urls.slice(startIdx, endIdx);
    result.push(...stratumSlice.slice(0, perStratum));
  }

  return result;
}

export class BroadcasterDiscoveryEngine {
  private probedUrls: Set<string> = new Set();

  async discoverAndQualifyBroadcaster(
    broadcaster: BroadcasterTarget,
    dedupeIndex: HarvestDedupeIndex
  ): Promise<BroadcasterDiscoveryResult> {
    const discoveredSitemaps: string[] = [];
    let structureType: BroadcasterDiscoveryResult['structureType'] = 'none';
    let archiveDepth: BroadcasterDiscoveryResult['archiveDepth'] = 'current only';

    const candidateArticleUrls: string[] = [];
    const directRefsList: YouTubeHarvestReference[] = [];
    const t0 = Date.now();

    // 1. Auto-descubrimiento en robots.txt y root sitemaps
    for (const rootUrl of broadcaster.rootUrls) {
      if (this.probedUrls.has(rootUrl)) continue;
      this.probedUrls.add(rootUrl);

      try {
        const res = await fetch(rootUrl, {
          signal: AbortSignal.timeout(5000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          }
        });

        if (!res.ok) continue;
        const text = await res.text();

        if (rootUrl.endsWith('robots.txt')) {
          const sitemapMatch = text.match(/Sitemap:\s*(https?:\/\/[^\s]+)/gi);
          if (sitemapMatch) {
            for (const sm of sitemapMatch) {
              const u = sm.replace(/Sitemap:\s*/i, '').trim();
              if (!discoveredSitemaps.includes(u)) discoveredSitemaps.push(u);
            }
          }
        } else {
          discoveredSitemaps.push(rootUrl);

          const direct = parseFeedOrSitemapForYouTubeRefs(text, {
            type: 'sitemap_index',
            sourceUrl: rootUrl,
            publisherId: broadcaster.id,
            publisherName: broadcaster.name,
            country: broadcaster.country,
            language: broadcaster.language,
            category: broadcaster.category
          });
          directRefsList.push(...direct);

          const locRegex = /<loc>([^<]+)<\/loc>/gi;
          let match: RegExpExecArray | null;
          while ((match = locRegex.exec(text)) !== null) {
            const locUrl = match[1].trim();
            if (locUrl.endsWith('.xml')) {
              if (!discoveredSitemaps.includes(locUrl)) discoveredSitemaps.push(locUrl);
            } else {
              candidateArticleUrls.push(locUrl);
            }
          }
        }
      } catch {
        // Ignorar timeouts
      }
    }

    // 2. Expandir child sitemaps
    const childXmls = discoveredSitemaps.filter(s => s.endsWith('.xml') && !s.includes('robots'));
    if (childXmls.length > 0) {
      structureType = 'sitemap_index';
      for (const childUrl of childXmls.slice(0, 8)) {
        try {
          const cRes = await fetch(childUrl, {
            signal: AbortSignal.timeout(5000),
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36' }
          });
          if (cRes.ok) {
            const cText = await cRes.text();

            if (childUrl.includes('video') || cText.includes('<video:video')) {
              structureType = 'video_sitemap';
            }

            const cDirect = parseFeedOrSitemapForYouTubeRefs(cText, {
              type: 'video_sitemap',
              sourceUrl: childUrl,
              publisherId: broadcaster.id,
              publisherName: broadcaster.name,
              country: broadcaster.country,
              language: broadcaster.language,
              category: broadcaster.category
            });
            directRefsList.push(...cDirect);

            const cLocRegex = /<loc>([^<]+)<\/loc>/gi;
            let cm: RegExpExecArray | null;
            while ((cm = cLocRegex.exec(cText)) !== null) {
              const aUrl = cm[1].trim();
              if (!aUrl.endsWith('.xml')) {
                candidateArticleUrls.push(aUrl);
              }
            }

            if (cText.includes('2015') || cText.includes('2016') || cText.includes('2014')) {
              archiveDepth = '10+ years';
            } else if (cText.includes('2020') || cText.includes('2019')) {
              if (archiveDepth !== '10+ years') archiveDepth = '5-10 years';
            } else if (cText.includes('2023') || cText.includes('2022')) {
              if (archiveDepth === 'current only') archiveDepth = '1-5 years';
            }
          }
        } catch {
          // Ignorar timeouts
        }
      }
    }

    const totalRealUrlsDiscovered = candidateArticleUrls.length;

    // 3. Muestreo Adaptativo Estratificado
    let stage: BroadcasterDiscoveryResult['samplingStage'] = 'stage1_25';
    const seenVideoIdsInDiscovery = new Set<string>();
    const discoveredCandidates: YouTubeHarvestReference[] = [];

    let directNetNew = 0;
    for (const d of directRefsList) {
      if (!seenVideoIdsInDiscovery.has(d.videoId)) {
        seenVideoIdsInDiscovery.add(d.videoId);
        if (!dedupeIndex.isDuplicate(d.videoId)) {
          directNetNew++;
          discoveredCandidates.push(d);
          globalCandidateManifest.addCandidate(d, broadcaster.id, dedupeIndex.getTotalAtlasSize());
        }
      }
    }

    let htmlRefsFound = 0;
    let htmlNetNew = 0;

    const runSampleBatch = async (batch: string[]) => {
      const promises = batch.map(async url => {
        const pageResult = await extractFromArticlePage({
          url,
          domain: broadcaster.domain,
          publisherId: broadcaster.id,
          publisherName: broadcaster.name,
          country: broadcaster.country,
          language: broadcaster.language,
          category: broadcaster.category,
          priority: 1
        });

        for (const ref of pageResult.references) {
          htmlRefsFound++;
          if (!seenVideoIdsInDiscovery.has(ref.videoId)) {
            seenVideoIdsInDiscovery.add(ref.videoId);
            if (!dedupeIndex.isDuplicate(ref.videoId)) {
              htmlNetNew++;
              discoveredCandidates.push(ref);
              globalCandidateManifest.addCandidate(ref, broadcaster.id, dedupeIndex.getTotalAtlasSize());
            }
          }
        }
      });
      await Promise.all(promises);
    };

    const stage1Batch = getStratifiedSample(candidateArticleUrls, 25);
    if (stage1Batch.length > 0) {
      await runSampleBatch(stage1Batch);
    }

    let currentSampleCount = Math.max(1, stage1Batch.length);
    let stage1Rate = htmlNetNew / currentSampleCount;

    if (stage1Rate >= 0.15 && candidateArticleUrls.length > 25) {
      stage = 'stage2_100';
      const stage2Batch = getStratifiedSample(candidateArticleUrls, 100).filter(u => !stage1Batch.includes(u));
      await runSampleBatch(stage2Batch);

      currentSampleCount = stage1Batch.length + stage2Batch.length;
      const stage2Rate = htmlNetNew / currentSampleCount;

      if (stage2Rate >= 0.15 && candidateArticleUrls.length > 100) {
        stage = 'stage3_250';
        const alreadySampled = [...stage1Batch, ...stage2Batch];
        const stage3Batch = getStratifiedSample(candidateArticleUrls, 250).filter(u => !alreadySampled.includes(u));
        await runSampleBatch(stage3Batch);
        currentSampleCount += stage3Batch.length;
      }
    }

    const elapsedDiscoverySec = Math.max(0.5, (Date.now() - t0) / 1000);
    const pagesSampled = Math.max(1, currentSampleCount);
    const directVideoRefsFound = directRefsList.length;
    const htmlVideoRefsFound = htmlRefsFound;
    const totalRefsFound = directVideoRefsFound + htmlVideoRefsFound;

    const observedUniqueDiscovered = seenVideoIdsInDiscovery.size;
    const observedUniqueNetNew = directNetNew + htmlNetNew;
    const observedAlreadyKnownAtlas = Math.max(0, observedUniqueDiscovered - observedUniqueNetNew);
    const observedUnpersistedFuel = discoveredCandidates.length;

    const rawNoveltyRate = observedUniqueDiscovered > 0 ? +(observedUniqueNetNew / observedUniqueDiscovered).toFixed(3) : 0;
    const observedNetNewPerPage = +(observedUniqueNetNew / pagesSampled).toFixed(3);
    const wilsonLowerBound = calculateWilsonLowerBound(observedUniqueNetNew, pagesSampled);
    const observedNetNewVelocity = +(observedUniqueNetNew / elapsedDiscoverySec).toFixed(2);
    const directReferenceRate = totalRefsFound > 0 ? +(directVideoRefsFound / totalRefsFound).toFixed(2) : 0;

    const temporalDecayFactor = archiveDepth === '10+ years' || archiveDepth === '5-10 years' ? 0.50 : 0.85;
    const remainingRealUrls = Math.max(0, totalRealUrlsDiscovered - pagesSampled);
    const estimatedRemainingPoint = Math.round(remainingRealUrls * observedNetNewPerPage * temporalDecayFactor);
    const estimatedRemainingConservative = Math.round(remainingRealUrls * wilsonLowerBound * temporalDecayFactor);

    const totalConservativeFuel = observedUnpersistedFuel + estimatedRemainingConservative;

    // Fingerprint Similarity Calculation
    const affinity = computeFingerprintSimilarity({
      domain: broadcaster.domain,
      category: broadcaster.category,
      hasVideoSection: !!broadcaster.hasVideoSection,
      isStreamingOrRadio: !!broadcaster.isStreamingOrRadio,
      isBroadcaster: structureType === 'sitemap_index' || structureType === 'video_sitemap',
      hasMultiCohortSitemaps: discoveredSitemaps.length >= 3
    });

    const archiveMultiplier = archiveDepth === '10+ years' ? 1.5 : archiveDepth === '5-10 years' ? 1.2 : 1.0;
    const mineProductionScore = +(Math.min(100.0, (observedNetNewPerPage * 40 + observedNetNewVelocity * 5) * rawNoveltyRate * (1 + directReferenceRate) * archiveMultiplier)).toFixed(1);

    // Invariant Check
    if (totalConservativeFuel < observedUnpersistedFuel) {
      throw new Error(`[FUEL_ACCOUNTING_INVARIANT_FAIL] totalConservativeFuel (${totalConservativeFuel}) < observedUnpersistedFuel (${observedUnpersistedFuel}) en ${broadcaster.name}`);
    }

    // Clasificación Separada: ObservedTier vs EstimatedTier
    let observedTier: ObservedTier = 'inconclusive';
    if (observedUnpersistedFuel >= 5000) observedTier = 'confirmed_mega';
    else if (observedUnpersistedFuel >= 2000) observedTier = 'confirmed_elite';
    else if (observedUnpersistedFuel >= 500) observedTier = 'confirmed_strong';
    else if (observedUnpersistedFuel >= 100) observedTier = 'confirmed_tactical';
    else if (rawNoveltyRate >= 0.60 && observedUnpersistedFuel > 0) observedTier = 'small_clean';
    else if (rawNoveltyRate < 0.10 || (observedNetNewPerPage < 0.04 && directNetNew === 0)) observedTier = 'saturated';

    let estimatedTier: EstimatedTier = 'inconclusive';
    if (totalConservativeFuel >= 5000) estimatedTier = 'estimated_mega';
    else if (totalConservativeFuel >= 2000) estimatedTier = 'estimated_elite';
    else if (totalConservativeFuel >= 500) estimatedTier = 'estimated_strong';
    else if (totalConservativeFuel >= 100) estimatedTier = 'estimated_tactical';
    else if (rawNoveltyRate >= 0.60 && totalConservativeFuel > 0) estimatedTier = 'small_clean';
    else if (rawNoveltyRate < 0.10 || (observedNetNewPerPage < 0.04 && directNetNew === 0)) estimatedTier = 'saturated';

    const mineStatus: MineExhaustionStatus = totalConservativeFuel > 0 ? 'discovered' : 'exhausted';

    return {
      broadcasterId: broadcaster.id,
      broadcasterName: broadcaster.name,
      domain: broadcaster.domain,
      country: broadcaster.country,
      category: broadcaster.category,
      front: broadcaster.front,
      discoveredSitemaps,
      structureType,
      archiveDepth,
      totalRealUrlsDiscovered,
      pagesSampled,
      samplingStage: stage,
      directVideoRefsFound,
      htmlVideoRefsFound,
      totalRefsFound,
      observedUniqueDiscovered,
      observedAlreadyKnownAtlas,
      observedUniqueNetNew,
      observedUnpersistedFuel,
      rawNoveltyRate,
      observedNetNewPerPage,
      wilsonLowerBound,
      observedNetNewVelocity,
      directReferenceRate,
      primaryArchetype: affinity.primaryArchetype,
      archetypeSimilarity: affinity.similarityScore,
      mineProductionScore,
      mineStatus,
      remainingRealUrls,
      estimatedRemainingPoint,
      estimatedRemainingConservative,
      totalConservativeFuel,
      observedTier,
      estimatedTier,
      qualificationReason: `Score ${mineProductionScore} | Similitud ${affinity.primaryArchetype} (${(affinity.similarityScore * 100).toFixed(0)}%)`
    };
  }
}
