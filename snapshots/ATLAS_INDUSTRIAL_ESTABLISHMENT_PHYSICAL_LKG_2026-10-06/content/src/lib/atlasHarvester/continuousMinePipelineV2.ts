/**
 * continuousMinePipelineV2.ts — Pipeline Continuo V2 con Pool de Alta Densidad CMS (Wave 6)
 */

import { HarvestDedupeIndex } from './harvestDedupeIndex';
import { extractFromArticlePage } from './parallelExtractor';
import { parseFeedOrSitemapForYouTubeRefs } from './youtubeReferenceExtractor';
import { calculateWilsonLowerBound } from './newMineDiscoveryEngine';
import { globalCandidateManifest } from './mineCandidateManifest';
import { computeProductiveSimilarity } from './mineFingerprint';
import type { YouTubeHarvestReference } from './types';

export interface Wave6Candidate {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
  category: string;
  countryGroup: string;
  isStreamingOrRadio: boolean;
  hasVideoSection: boolean;
  isBroadcaster: boolean;
  hasMultiCohortSitemaps: boolean;
  hasDailyLiveCadence: boolean;
  hasStudioInterviews: boolean;
  rootUrls: string[];
}

export const WAVE6_HIGH_YIELD_POOL: Wave6Candidate[] = [
  // 🇲🇽 1. MÉXICO: SinEmbargo al Aire & Sopitas
  {
    id: 'sinembargo_al_aire_mx',
    name: 'SinEmbargo al Aire México',
    domain: 'sinembargo.mx',
    country: 'MX',
    language: 'es',
    category: 'Streaming Diario / Debates / Entrevistas',
    countryGroup: 'mexico',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    isBroadcaster: false,
    hasMultiCohortSitemaps: true,
    hasDailyLiveCadence: true,
    hasStudioInterviews: true,
    rootUrls: ['https://www.sinembargo.mx/robots.txt', 'https://www.sinembargo.mx/sitemap.xml', 'https://www.sinembargo.mx/sitemap_index.xml']
  },
  {
    id: 'sopitas_musica_mx',
    name: 'Sopitas Música & Sesiones MX',
    domain: 'sopitas.com',
    country: 'MX',
    language: 'es',
    category: 'Música en Vivo / Conciertos / Acústicos',
    countryGroup: 'mexico',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    isBroadcaster: false,
    hasMultiCohortSitemaps: true,
    hasDailyLiveCadence: false,
    hasStudioInterviews: true,
    rootUrls: ['https://www.sopitas.com/robots.txt', 'https://www.sopitas.com/sitemap.xml', 'https://www.sopitas.com/sitemap_index.xml']
  },
  {
    id: 'proceso_video_mx',
    name: 'Revista Proceso Videos México',
    domain: 'proceso.com.mx',
    country: 'MX',
    language: 'es',
    category: 'Reportajes / Entrevistas / Investigaciones',
    countryGroup: 'mexico',
    isStreamingOrRadio: false,
    hasVideoSection: true,
    isBroadcaster: false,
    hasMultiCohortSitemaps: true,
    hasDailyLiveCadence: true,
    hasStudioInterviews: true,
    rootUrls: ['https://www.proceso.com.mx/robots.txt', 'https://www.proceso.com.mx/sitemap.xml']
  },

  // 🇦🇷 2. ARGENTINA: Página/12, Ámbito & Perfil
  {
    id: 'pagina12_cultura_ar',
    name: 'Página/12 Música & Videos',
    domain: 'pagina12.com.ar',
    country: 'AR',
    language: 'es',
    category: 'Cultura / Música / Entrevistas',
    countryGroup: 'argentina',
    isStreamingOrRadio: false,
    hasVideoSection: true,
    isBroadcaster: false,
    hasMultiCohortSitemaps: true,
    hasDailyLiveCadence: true,
    hasStudioInterviews: true,
    rootUrls: ['https://www.pagina12.com.ar/robots.txt', 'https://www.pagina12.com.ar/sitemaps/sitemap-index.xml', 'https://www.pagina12.com.ar/sitemap.xml']
  },
  {
    id: 'ambito_video_ar',
    name: 'Ámbito Financiero Videos / C5N',
    domain: 'ambito.com',
    country: 'AR',
    language: 'es',
    category: 'Noticias en Video / Entrevistas',
    countryGroup: 'argentina',
    isStreamingOrRadio: false,
    hasVideoSection: true,
    isBroadcaster: false,
    hasMultiCohortSitemaps: true,
    hasDailyLiveCadence: true,
    hasStudioInterviews: true,
    rootUrls: ['https://www.ambito.com/robots.txt', 'https://www.ambito.com/sitemap.xml', 'https://www.ambito.com/sitemap_index.xml']
  },
  {
    id: 'perfil_net_tv_ar',
    name: 'Perfil / Net TV / Radio Perfil',
    domain: 'perfil.com',
    country: 'AR',
    language: 'es',
    category: 'Radio Filmada / Televisión / Espectáculos',
    countryGroup: 'argentina',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    isBroadcaster: true,
    hasMultiCohortSitemaps: true,
    hasDailyLiveCadence: true,
    hasStudioInterviews: true,
    rootUrls: ['https://www.perfil.com/robots.txt', 'https://www.perfil.com/sitemap.xml', 'https://www.perfil.com/sitemap_index.xml']
  },

  // 🇨🇴 3. COLOMBIA: Semana TV & Shock Colombia
  {
    id: 'semana_tv_colombia',
    name: 'Semana TV / Vicky en Semana',
    domain: 'semana.com',
    country: 'CO',
    language: 'es',
    category: 'Streaming Diario / Debates / Entrevistas',
    countryGroup: 'colombia',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    isBroadcaster: false,
    hasMultiCohortSitemaps: true,
    hasDailyLiveCadence: true,
    hasStudioInterviews: true,
    rootUrls: ['https://www.semana.com/robots.txt', 'https://www.semana.com/sitemap.xml', 'https://www.semana.com/arc/outboundfeeds/sitemap-index/?outputType=xml']
  },
  {
    id: 'shock_musica_colombia',
    name: 'Shock Colombia (Música & Sesiones)',
    domain: 'shock.co',
    country: 'CO',
    language: 'es',
    category: 'Música en Vivo / Acústicos / Festivales',
    countryGroup: 'colombia',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    isBroadcaster: false,
    hasMultiCohortSitemaps: true,
    hasDailyLiveCadence: false,
    hasStudioInterviews: true,
    rootUrls: ['https://www.shock.co/robots.txt', 'https://www.shock.co/sitemap.xml']
  },

  // 🇧🇷 4. BRASIL: Rolling Stone Brasil & Catraca Livre
  {
    id: 'rollingstone_brasil',
    name: 'Rolling Stone Brasil (MPB & Shows)',
    domain: 'rollingstone.uol.com.br',
    country: 'BR',
    language: 'pt',
    category: 'Música / Shows / Entrevistas / MPB',
    countryGroup: 'brasil',
    isStreamingOrRadio: false,
    hasVideoSection: true,
    isBroadcaster: false,
    hasMultiCohortSitemaps: true,
    hasDailyLiveCadence: false,
    hasStudioInterviews: true,
    rootUrls: ['https://rollingstone.uol.com.br/robots.txt', 'https://rollingstone.uol.com.br/sitemap.xml']
  },
  {
    id: 'catraca_livre_br',
    name: 'Catraca Livre (Música & Cultura BR)',
    domain: 'catracalivre.com.br',
    country: 'BR',
    language: 'pt',
    category: 'Cultura / Música / Shows / Festivais',
    countryGroup: 'brasil',
    isStreamingOrRadio: false,
    hasVideoSection: true,
    isBroadcaster: false,
    hasMultiCohortSitemaps: true,
    hasDailyLiveCadence: false,
    hasStudioInterviews: true,
    rootUrls: ['https://catracalivre.com.br/robots.txt', 'https://catracalivre.com.br/sitemap.xml', 'https://catracalivre.com.br/sitemap_index.xml']
  },

  // 🇪🇸 5. ESPAÑA: Público (La Base) & MondoSonoro
  {
    id: 'publico_la_base_es',
    name: 'Diario Público / La Base España',
    domain: 'publico.es',
    country: 'ES',
    language: 'es',
    category: 'Streaming Diario / Debates / Investigaciones',
    countryGroup: 'espana',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    isBroadcaster: false,
    hasMultiCohortSitemaps: true,
    hasDailyLiveCadence: true,
    hasStudioInterviews: true,
    rootUrls: ['https://www.publico.es/robots.txt', 'https://www.publico.es/sitemap.xml', 'https://www.publico.es/sitemap_index.xml']
  },
  {
    id: 'mondosonoro_conciertos_es',
    name: 'MondoSonoro (Música & Conciertos ES)',
    domain: 'mondosonoro.com',
    country: 'ES',
    language: 'es',
    category: 'Música Independiente / Sesiones / Festivales',
    countryGroup: 'espana',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    isBroadcaster: false,
    hasMultiCohortSitemaps: true,
    hasDailyLiveCadence: false,
    hasStudioInterviews: true,
    rootUrls: ['https://www.mondosonoro.com/robots.txt', 'https://www.mondosonoro.com/sitemap.xml', 'https://www.mondosonoro.com/sitemap_index.xml']
  }
];

export interface QualifiedJobV2 {
  candidate: Wave6Candidate;
  articleUrls: string[];
  sampleDensity: number;
  sampleNovelty: number;
  estimatedConservativeFuel: number;
  similarityScore: number;
  archetypeId: string;
}

export class ContinuousMinePipelineV2 {
  private dedupeIndex: HarvestDedupeIndex;
  private harvestQueue: QualifiedJobV2[] = [];
  private activeWorkers = 0;
  private totalHarvested = 0;
  private isDiscoveryComplete = false;

  private totalProbed = 0;
  private totalPromoted = 0;
  private totalRejected = 0;
  private workerEfficiencies: { name: string; pages: number; netNew: number; rate: number }[] = [];

  constructor(dedupeIndex: HarvestDedupeIndex) {
    this.dedupeIndex = dedupeIndex;
  }

  async runPipeline(): Promise<{
    startAtlas: number;
    finalAtlas: number;
    totalNetNewHarvested: number;
    elapsedSeconds: number;
    globalNetNewPerSecond: number;
    totalProbed: number;
    totalPromoted: number;
    totalRejected: number;
    workerEfficiencies: { name: string; pages: number; netNew: number; rate: number }[];
  }> {
    const t0 = Date.now();
    const startAtlas = this.dedupeIndex.getTotalAtlasSize();

    console.log('⚡ [INICIANDO CONTINUOUS MINE PIPELINE V2]');
    console.log(`  Atlas Inicial: ${startAtlas.toLocaleString()} contenidos`);
    console.log(`  Pool Wave 6 High-Yield: ${WAVE6_HIGH_YIELD_POOL.length} candidatos prioritarios\n`);

    const harvestPromise = this.startHarvestWorkers();
    await this.runDiscoveryProducerV2();
    this.isDiscoveryComplete = true;
    await harvestPromise;

    const elapsedSeconds = Math.max(1, Math.round((Date.now() - t0) / 1000));
    const finalAtlas = this.dedupeIndex.getTotalAtlasSize();
    const globalNetNewPerSecond = +(this.totalHarvested / elapsedSeconds).toFixed(2);

    return {
      startAtlas,
      finalAtlas,
      totalNetNewHarvested: this.totalHarvested,
      elapsedSeconds,
      globalNetNewPerSecond,
      totalProbed: this.totalProbed,
      totalPromoted: this.totalPromoted,
      totalRejected: this.totalRejected,
      workerEfficiencies: this.workerEfficiencies
    };
  }

  private async runDiscoveryProducerV2() {
    console.log('📡 [DISCOVERY PRODUCER V2 — Muestreo con Promotion Gate Estricto]');

    for (const candidate of WAVE6_HIGH_YIELD_POOL) {
      this.totalProbed++;

      try {
        const affinity = computeProductiveSimilarity({
          domain: candidate.domain,
          category: candidate.category,
          hasVideoSection: candidate.hasVideoSection,
          isStreamingOrRadio: candidate.isStreamingOrRadio,
          isBroadcaster: candidate.isBroadcaster,
          hasMultiCohortSitemaps: candidate.hasMultiCohortSitemaps,
          hasDailyLiveCadence: candidate.hasDailyLiveCadence,
          hasStudioInterviews: candidate.hasStudioInterviews
        });

        // 1. Descubrir Sitemaps
        const discoveredXmls: string[] = [];
        const candidateArticleUrls: string[] = [];
        const directRefs: YouTubeHarvestReference[] = [];

        for (const rUrl of candidate.rootUrls) {
          try {
            const res = await fetch(rUrl, {
              signal: AbortSignal.timeout(5000),
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36' }
            });
            if (!res.ok) continue;
            const text = await res.text();

            if (rUrl.endsWith('robots.txt')) {
              const smMatch = text.match(/Sitemap:\s*(https?:\/\/[^\s]+)/gi);
              if (smMatch) {
                for (const sm of smMatch) {
                  const u = sm.replace(/Sitemap:\s*/i, '').trim();
                  if (!discoveredXmls.includes(u)) discoveredXmls.push(u);
                }
              }
            } else {
              discoveredXmls.push(rUrl);
            }
          } catch {
            // Ignorar
          }
        }

        // 2. Parsear child XMLs
        for (const xml of discoveredXmls.slice(0, 10)) {
          try {
            const res = await fetch(xml, {
              signal: AbortSignal.timeout(5000),
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36' }
            });
            if (!res.ok) continue;
            const xmlText = await res.text();

            const direct = parseFeedOrSitemapForYouTubeRefs(xmlText, {
              type: 'sitemap_index',
              sourceUrl: xml,
              publisherId: candidate.id,
              publisherName: candidate.name,
              country: candidate.country,
              language: candidate.language,
              category: candidate.category
            });
            directRefs.push(...direct);

            const locRegex = /<loc>([^<]+)<\/loc>/gi;
            let match: RegExpExecArray | null;
            while ((match = locRegex.exec(xmlText)) !== null) {
              const loc = match[1].trim();
              if (loc.endsWith('.xml')) {
                if (!discoveredXmls.includes(loc)) discoveredXmls.push(loc);
              } else if (!candidateArticleUrls.includes(loc)) {
                candidateArticleUrls.push(loc);
              }
            }
          } catch {
            // Ignorar
          }
        }

        // 3. Stage 1: Sample 25
        let sampleBatch = candidateArticleUrls.slice(0, 25);
        let sampleNetNew = 0;
        let sampleKnown = 0;

        for (const d of directRefs) {
          if (!this.dedupeIndex.isDuplicate(d.videoId)) {
            sampleNetNew++;
            globalCandidateManifest.addCandidate(d, candidate.id, this.dedupeIndex.getTotalAtlasSize());
          }
        }

        const runSample = async (urls: string[]) => {
          const promises = urls.map(async url => {
            const pageResult = await extractFromArticlePage({
              url,
              domain: candidate.domain,
              publisherId: candidate.id,
              publisherName: candidate.name,
              country: candidate.country,
              language: candidate.language,
              category: candidate.category,
              priority: 1
            });

            for (const ref of pageResult.references) {
              if (this.dedupeIndex.isDuplicate(ref.videoId)) {
                sampleKnown++;
              } else {
                sampleNetNew++;
                globalCandidateManifest.addCandidate(ref, candidate.id, this.dedupeIndex.getTotalAtlasSize());
              }
            }
          });
          await Promise.all(promises);
        };

        await runSample(sampleBatch);

        let sampleDensity = sampleBatch.length > 0 ? sampleNetNew / sampleBatch.length : 0;

        if (sampleDensity >= 0.15 && sampleDensity < 0.30 && candidateArticleUrls.length > 25) {
          const stage2 = candidateArticleUrls.slice(25, 100);
          sampleBatch = [...sampleBatch, ...stage2];
          await runSample(stage2);
          sampleDensity = sampleNetNew / sampleBatch.length;
        }

        const sampleTotal = sampleNetNew + sampleKnown;
        const sampleNovelty = sampleTotal > 0 ? (sampleNetNew / sampleTotal) * 100 : 100;
        const wilson = calculateWilsonLowerBound(sampleNetNew, Math.max(1, sampleBatch.length));
        const estimatedFuel = Math.round(candidateArticleUrls.length * wilson * 0.70) + sampleNetNew;

        // PROMOTION GATE V2:
        if (sampleNovelty >= 80 && (sampleDensity >= 0.20 || directRefs.length >= 5) && candidateArticleUrls.length >= 10) {
          this.totalPromoted++;
          console.log(`  🚀 [PROMOCIÓN V2] ${candidate.name.padEnd(28)} | Sim: ${(affinity.similarityScore * 100).toFixed(0)}% | Sample: ${sampleBatch.length}p ➔ +${sampleNetNew} new (${sampleNovelty.toFixed(0)}% nov | ${sampleDensity.toFixed(2)} n/p) ➔ Encolada (+${estimatedFuel} fuel)`);
          this.harvestQueue.push({
            candidate,
            articleUrls: candidateArticleUrls,
            sampleDensity,
            sampleNovelty,
            estimatedConservativeFuel: estimatedFuel,
            similarityScore: affinity.similarityScore,
            archetypeId: affinity.primaryPositiveArchetype
          });
        } else {
          this.totalRejected++;
          console.log(`  ⛔ [RECHAZADA] ${candidate.name.padEnd(28)} | URLs: ${candidateArticleUrls.length.toString().padStart(4)} | Sample: ${sampleBatch.length}p ➔ +${sampleNetNew} new (${sampleNovelty.toFixed(0)}% nov | ${sampleDensity.toFixed(2)} n/p)`);
        }
      } catch {
        // Continuar
      }
    }
    console.log('📡 [DISCOVERY PRODUCER V2 COMPLETADO]\n');
  }

  private async startHarvestWorkers() {
    const maxConcurrency = 3;

    while (!this.isDiscoveryComplete || this.harvestQueue.length > 0) {
      if (this.harvestQueue.length > 0 && this.activeWorkers < maxConcurrency) {
        const job = this.harvestQueue.shift();
        if (job) {
          this.activeWorkers++;
          this.harvestJobV2(job).finally(() => {
            this.activeWorkers--;
          });
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }

    while (this.activeWorkers > 0) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  private async harvestJobV2(job: QualifiedJobV2) {
    const tJob0 = Date.now();
    const urls = job.articleUrls.slice(0, 1500);
    const batchSize = 35;
    const pendingBatch: YouTubeHarvestReference[] = [];

    let fetched = 0;
    let netNew = 0;
    let known = 0;

    for (let i = 0; i < urls.length; i += batchSize) {
      const slice = urls.slice(i, i + batchSize);
      const promises = slice.map(async url => {
        const pageResult = await extractFromArticlePage({
          url,
          domain: job.candidate.domain,
          publisherId: job.candidate.id,
          publisherName: job.candidate.name,
          country: job.candidate.country,
          language: job.candidate.language,
          category: job.candidate.category,
          priority: 1
        });

        fetched++;

        for (const ref of pageResult.references) {
          if (this.dedupeIndex.isDuplicate(ref.videoId)) {
            known++;
          } else {
            netNew++;
            this.dedupeIndex.markSeen(ref.videoId);
            pendingBatch.push(ref);
          }
        }
      });

      await Promise.all(promises);

      if (pendingBatch.length >= 100) {
        const toPersist = pendingBatch.splice(0, pendingBatch.length);
        const persisted = await this.dedupeIndex.persistBatch(toPersist);
        this.totalHarvested += persisted;
      }

      // WORKER-LEVEL DYNAMIC BAILOUT:
      if (fetched >= 150) {
        const density = netNew / fetched;
        const totalRefs = netNew + known;
        const novelty = totalRefs > 0 ? (netNew / totalRefs) * 100 : 100;

        if (density < 0.10 || novelty < 75) {
          console.log(`    🛑 [WORKER BAILOUT] ${job.candidate.name} tras ${fetched}p (density: ${density.toFixed(3)}, nov: ${novelty.toFixed(0)}%) ➔ Mina abandonada, tomando siguiente.`);
          break;
        }
      }
    }

    if (pendingBatch.length > 0) {
      const toPersist = pendingBatch.splice(0, pendingBatch.length);
      const persisted = await this.dedupeIndex.persistBatch(toPersist);
      this.totalHarvested += persisted;
    }

    const elapsed = Math.max(1, Math.round((Date.now() - tJob0) / 1000));
    const rate = fetched > 0 ? +(netNew / fetched).toFixed(3) : 0;
    const vel = +(netNew / elapsed).toFixed(2);

    this.workerEfficiencies.push({
      name: job.candidate.name,
      pages: fetched,
      netNew,
      rate
    });

    console.log(`  ✅ [WORKER COMPLETO V2] ${job.candidate.name.padEnd(28)} | ${fetched}p ➔ +${netNew} net-new (${rate} new/p | ${vel}/s) en ${elapsed}s.`);
  }
}
