/**
 * continuousMinePipeline.ts — Pipeline Continuo de Descubrimiento y Cosecha Concurrente (Wave 5)
 */

import { HarvestDedupeIndex } from './harvestDedupeIndex';
import { extractFromArticlePage } from './parallelExtractor';
import { parseFeedOrSitemapForYouTubeRefs } from './youtubeReferenceExtractor';
import { calculateWilsonLowerBound } from './newMineDiscoveryEngine';
import { globalCandidateManifest } from './mineCandidateManifest';
import { computeFingerprintScore } from './mineFingerprint';
import type { YouTubeHarvestReference } from './types';

export interface PipelineTarget {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
  category: string;
  countryGroup: 'argentina' | 'mexico' | 'brasil' | 'colombia' | 'peru' | 'chile_uruguay' | 'espana';
  isStreamingOrRadio: boolean;
  hasVideoSection: boolean;
  hasDailyLiveCadence: boolean;
  rootUrls: string[];
}

export const WAVE5_TARGET_POOL: PipelineTarget[] = [
  // 🇦🇷 1. ARGENTINA (Radios Filmadas, Canales de Streaming & Entrevistas)
  {
    id: 'radio10_ar',
    name: 'Radio 10 Argentina',
    domain: 'radio10.com.ar',
    country: 'AR',
    language: 'es',
    category: 'Radio Filmada / Noticias / Opinión',
    countryGroup: 'argentina',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://www.radio10.com.ar/robots.txt', 'https://www.radio10.com.ar/sitemap.xml']
  },
  {
    id: 'radiomillenium_ar',
    name: 'FM Milenium 106.7 Argentina',
    domain: 'fmmilenium.com.ar',
    country: 'AR',
    language: 'es',
    category: 'Radio / Entrevistas / Música',
    countryGroup: 'argentina',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://fmmilenium.com.ar/robots.txt', 'https://fmmilenium.com.ar/sitemap.xml']
  },
  {
    id: 'metro951_streaming_ar',
    name: 'Metro 95.1 Radio & Video',
    domain: 'metro951.com',
    country: 'AR',
    language: 'es',
    category: 'Radio / Música / Entrevistas',
    countryGroup: 'argentina',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://metro951.com/robots.txt', 'https://metro951.com/sitemap.xml']
  },
  {
    id: 'cnnradio_ar',
    name: 'CNN Radio Argentina',
    domain: 'cnnradioargentina.com.ar',
    country: 'AR',
    language: 'es',
    category: 'Radio / Noticias / Reportajes',
    countryGroup: 'argentina',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://cnnradioargentina.com.ar/robots.txt', 'https://cnnradioargentina.com.ar/sitemap.xml']
  },
  {
    id: 'aspen1023_ar',
    name: 'Aspen 102.3 Música & Acústicos',
    domain: 'fmaspen.com',
    country: 'AR',
    language: 'es',
    category: 'Música en Vivo / Acústicos / Radio',
    countryGroup: 'argentina',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: false,
    rootUrls: ['https://fmaspen.com/robots.txt', 'https://fmaspen.com/sitemap.xml']
  },
  {
    id: 'popradio_ar',
    name: 'Pop Radio 101.5 Argentina',
    domain: 'popradio.fm',
    country: 'AR',
    language: 'es',
    category: 'Radio / Humor / Shows',
    countryGroup: 'argentina',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://popradio.fm/robots.txt', 'https://popradio.fm/sitemap.xml']
  },

  // 🇲🇽 2. MÉXICO (Radio Fórmula, Aristegui, MVS, TV Azteca)
  {
    id: 'radioformula_mx',
    name: 'Radio Fórmula México',
    domain: 'radioformula.com.mx',
    country: 'MX',
    language: 'es',
    category: 'Radio Filmada / Noticias / Programas',
    countryGroup: 'mexico',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://www.radioformula.com.mx/robots.txt', 'https://www.radioformula.com.mx/sitemap.xml', 'https://www.radioformula.com.mx/sitemap_index.xml']
  },
  {
    id: 'aristegui_noticias_mx',
    name: 'Aristegui Noticias Videos',
    domain: 'aristeguinoticias.com',
    country: 'MX',
    language: 'es',
    category: 'Noticias / Investigaciones / Entrevistas',
    countryGroup: 'mexico',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://aristeguinoticias.com/robots.txt', 'https://aristeguinoticias.com/sitemap.xml', 'https://aristeguinoticias.com/sitemap_index.xml']
  },
  {
    id: 'imagen_radio_mx',
    name: 'Imagen Radio México',
    domain: 'imagenradio.com.mx',
    country: 'MX',
    language: 'es',
    category: 'Radio / Negocios / Opinión',
    countryGroup: 'mexico',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://www.imagenradio.com.mx/robots.txt', 'https://www.imagenradio.com.mx/sitemap.xml']
  },
  {
    id: 'wradio_mexico',
    name: 'W Radio México (Prisa)',
    domain: 'wradio.com.mx',
    country: 'MX',
    language: 'es',
    category: 'Radio / Deportes / Entretenimiento',
    countryGroup: 'mexico',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://wradio.com.mx/robots.txt', 'https://wradio.com.mx/sitemap.xml']
  },

  // 🇧🇷 3. BRASIL (Rádios Filmadas, GZH, BandNews, CBN)
  {
    id: 'bandnews_fm_br',
    name: 'BandNews FM Brasil',
    domain: 'bandnewstv.uol.com.br',
    country: 'BR',
    language: 'pt',
    category: 'Rádio Filmada / Notícias 24h',
    countryGroup: 'brasil',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://bandnewstv.uol.com.br/robots.txt', 'https://bandnewstv.uol.com.br/sitemap.xml']
  },
  {
    id: 'cbn_globo_br',
    name: 'CBN Rádio Globo Brasil',
    domain: 'cbn.globo.com',
    country: 'BR',
    language: 'pt',
    category: 'Rádio / Entrevistas / Esporte',
    countryGroup: 'brasil',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://cbn.globo.com/robots.txt', 'https://cbn.globo.com/sitemap.xml']
  },
  {
    id: 'radio_itatiaia_br',
    name: 'Rádio Itatiaia (Minas & Esportes)',
    domain: 'itatiaia.com.br',
    country: 'BR',
    language: 'pt',
    category: 'Rádio / Futebol / Shows',
    countryGroup: 'brasil',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://www.itatiaia.com.br/robots.txt', 'https://www.itatiaia.com.br/sitemap.xml', 'https://www.itatiaia.com.br/sitemap_index.xml']
  },
  {
    id: 'radio_gaucha_gzh',
    name: 'Rádio Gaúcha / GZH Vídeos',
    domain: 'gauchazh.clicrbs.com.br',
    country: 'BR',
    language: 'pt',
    category: 'Rádio Filmada / Futebol / Notícias',
    countryGroup: 'brasil',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://gauchazh.clicrbs.com.br/robots.txt', 'https://gauchazh.clicrbs.com.br/sitemap.xml']
  },

  // 🇨🇴 4. COLOMBIA (W Radio, Caracol Radio, RCN, Canal Capital)
  {
    id: 'wradio_colombia',
    name: 'W Radio Colombia (Julio Sánchez Cristo)',
    domain: 'wradio.com.co',
    country: 'CO',
    language: 'es',
    category: 'Radio Filmada / Entrevistas Internacionales',
    countryGroup: 'colombia',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://www.wradio.com.co/robots.txt', 'https://www.wradio.com.co/sitemap.xml']
  },
  {
    id: 'caracol_radio_co',
    name: 'Caracol Radio Colombia',
    domain: 'caracol.com.co',
    country: 'CO',
    language: 'es',
    category: 'Radio / Deportes / Noticias',
    countryGroup: 'colombia',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://caracol.com.co/robots.txt', 'https://caracol.com.co/sitemap.xml']
  },
  {
    id: 'noticias_uno_co',
    name: 'Noticias Uno Colombia (La Red Independiente)',
    domain: 'noticiasuno.com',
    country: 'CO',
    language: 'es',
    category: 'Investigación / Noticias en Video',
    countryGroup: 'colombia',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://noticiasuno.com/robots.txt', 'https://noticiasuno.com/sitemap.xml']
  },

  // 🇵🇪 5. PERÚ (RPP Noticias Video, Radio Capital, Willax)
  {
    id: 'rpp_noticias_video_pe',
    name: 'RPP Noticias Videos Perú',
    domain: 'rpp.pe',
    country: 'PE',
    language: 'es',
    category: 'Radio / Televisión / Debates',
    countryGroup: 'peru',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://rpp.pe/robots.txt', 'https://rpp.pe/sitemap.xml', 'https://rpp.pe/sitemap_index.xml']
  },
  {
    id: 'willax_tv_pe',
    name: 'Willax Televisión Perú',
    domain: 'willax.pe',
    country: 'PE',
    language: 'es',
    category: 'Televisión / Opinión / Reportajes',
    countryGroup: 'peru',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://willax.pe/robots.txt', 'https://willax.pe/sitemap.xml']
  },

  // 🇨🇱 🇺🇾 6. CHILE & URUGUAY (Bío Bío, Cooperativa, Sarandí, El Espectador)
  {
    id: 'biobio_video_cl',
    name: 'Radio Bío Bío TV & Videos Chile',
    domain: 'biobiochile.cl',
    country: 'CL',
    language: 'es',
    category: 'Radio TV / Noticias / Reportajes',
    countryGroup: 'chile_uruguay',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://www.biobiochile.cl/robots.txt', 'https://www.biobiochile.cl/sitemap.xml', 'https://www.biobiochile.cl/sitemap_index.xml']
  },
  {
    id: 'cooperativa_video_cl',
    name: 'Radio Cooperativa Videos Chile',
    domain: 'cooperativa.cl',
    country: 'CL',
    language: 'es',
    category: 'Radio / Noticias / Programas',
    countryGroup: 'chile_uruguay',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://www.cooperativa.cl/robots.txt', 'https://www.cooperativa.cl/sitemap.xml']
  },
  {
    id: 'radio_sarandi_uy',
    name: 'Radio Sarandí 690 AM Uruguay',
    domain: 'sarandi690.com.uy',
    country: 'UY',
    language: 'es',
    category: 'Radio / Opinión / Entrevistas',
    countryGroup: 'chile_uruguay',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://sarandi690.com.uy/robots.txt', 'https://sarandi690.com.uy/sitemap.xml']
  },

  // 🇪🇸 7. ESPAÑA (Cadena SER, Onda Cero, COPE, Carne Cruda)
  {
    id: 'cadena_ser_video_es',
    name: 'Cadena SER Videos & Podcast',
    domain: 'cadenaser.com',
    country: 'ES',
    language: 'es',
    category: 'Radio Filmada / Programas / Entrevistas',
    countryGroup: 'espana',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://cadenaser.com/robots.txt', 'https://cadenaser.com/sitemap.xml', 'https://cadenaser.com/sitemap_index.xml']
  },
  {
    id: 'ondacero_video_es',
    name: 'Onda Cero Radio & Videos',
    domain: 'ondacero.es',
    country: 'ES',
    language: 'es',
    category: 'Radio / Opinión / Cultura',
    countryGroup: 'espana',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://www.ondacero.es/robots.txt', 'https://www.ondacero.es/sitemap.xml']
  },
  {
    id: 'cope_es_directo',
    name: 'COPE España (Herrera & Deportes)',
    domain: 'cope.es',
    country: 'ES',
    language: 'es',
    category: 'Radio / Deportes / Entrevistas',
    countryGroup: 'espana',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://www.cope.es/robots.txt', 'https://www.cope.es/sitemap.xml']
  },
  {
    id: 'carne_cruda_es',
    name: 'Carne Cruda Radio (Música & Entrevistas)',
    domain: 'carnecruda.es',
    country: 'ES',
    language: 'es',
    category: 'Radio / Música en Directo / Cultura',
    countryGroup: 'espana',
    isStreamingOrRadio: true,
    hasVideoSection: true,
    hasDailyLiveCadence: true,
    rootUrls: ['https://carnecruda.es/robots.txt', 'https://carnecruda.es/sitemap.xml']
  }
];

export interface QualifiedMineJob {
  target: PipelineTarget;
  discoveredArticleUrls: string[];
  bankedCandidatesCount: number;
  sampleDensity: number;
  sampleNovelty: number;
  estimatedConservativeFuel: number;
}

export class ContinuousMinePipeline {
  private dedupeIndex: HarvestDedupeIndex;
  private harvestQueue: QualifiedMineJob[] = [];
  private activeWorkers = 0;
  private totalHarvested = 0;
  private isDiscoveryComplete = false;

  constructor(dedupeIndex: HarvestDedupeIndex) {
    this.dedupeIndex = dedupeIndex;
  }

  async runPipeline(): Promise<{
    startAtlas: number;
    finalAtlas: number;
    totalNetNewHarvested: number;
    elapsedSeconds: number;
    qualifiedMinesCount: number;
  }> {
    const t0 = Date.now();
    const startAtlas = this.dedupeIndex.getTotalAtlasSize();

    console.log('⚡ [INICIANDO CONTINUOUS MINE PIPELINE V1]');
    console.log(`  Atlas Inicial: ${startAtlas.toLocaleString()} contenidos`);
    console.log(`  Objetivos en Pool Wave 5: ${WAVE5_TARGET_POOL.length} candidatos prioritarios\n`);

    // 1. Lanzar Worker de Cosecha Concurrente (Consumidor)
    const harvestPromise = this.startHarvestWorkers();

    // 2. Ejecutar Discovery Continuo y Encolar Minas (Productor)
    await this.runDiscoveryProducer();
    this.isDiscoveryComplete = true;

    // 3. Esperar que se vacíe la cola de cosecha
    await harvestPromise;

    const elapsedSeconds = Math.max(1, Math.round((Date.now() - t0) / 1000));
    const finalAtlas = this.dedupeIndex.getTotalAtlasSize();

    return {
      startAtlas,
      finalAtlas,
      totalNetNewHarvested: this.totalHarvested,
      elapsedSeconds,
      qualifiedMinesCount: this.harvestQueue.length
    };
  }

  private async runDiscoveryProducer() {
    console.log('📡 [DISCOVERY PRODUCER ACTIVADO — Explorando y encolando en caliente]');

    for (const target of WAVE5_TARGET_POOL) {
      try {
        const scoreInfo = computeFingerprintScore({
          domain: target.domain,
          category: target.category,
          hasVideoSection: target.hasVideoSection,
          isStreamingOrRadio: target.isStreamingOrRadio,
          isBroadcaster: target.category.includes('Televisión') || target.category.includes('TV'),
          hasMultiCohortSitemaps: true,
          hasDailyLiveCadence: target.hasDailyLiveCadence
        });

        // 1. Auto-descubrir sitemaps
        const discoveredXmls: string[] = [];
        const articleUrls: string[] = [];
        const directRefs: YouTubeHarvestReference[] = [];

        for (const rUrl of target.rootUrls) {
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
              publisherId: target.id,
              publisherName: target.name,
              country: target.country,
              language: target.language,
              category: target.category
            });
            directRefs.push(...direct);

            const locRegex = /<loc>([^<]+)<\/loc>/gi;
            let match: RegExpExecArray | null;
            while ((match = locRegex.exec(xmlText)) !== null) {
              const loc = match[1].trim();
              if (loc.endsWith('.xml')) {
                if (!discoveredXmls.includes(loc)) discoveredXmls.push(loc);
              } else if (!articleUrls.includes(loc)) {
                articleUrls.push(loc);
              }
            }
          } catch {
            // Ignorar
          }
        }

        // 3. Muestreo Estratificado Adaptativo (25➔100)
        const sampleBatch = articleUrls.slice(0, 25);
        let sampleNetNew = 0;
        let sampleAlreadyKnown = 0;
        const sampledCandidates: YouTubeHarvestReference[] = [];

        for (const d of directRefs) {
          if (!this.dedupeIndex.isDuplicate(d.videoId)) {
            sampleNetNew++;
            sampledCandidates.push(d);
            globalCandidateManifest.addCandidate(d, target.id, this.dedupeIndex.getTotalAtlasSize());
          }
        }

        const promises = sampleBatch.map(async url => {
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

          for (const ref of pageResult.references) {
            if (this.dedupeIndex.isDuplicate(ref.videoId)) {
              sampleAlreadyKnown++;
            } else {
              sampleNetNew++;
              sampledCandidates.push(ref);
              globalCandidateManifest.addCandidate(ref, target.id, this.dedupeIndex.getTotalAtlasSize());
            }
          }
        });

        await Promise.all(promises);

        const sampleTotal = sampleNetNew + sampleAlreadyKnown;
        const sampleNovelty = sampleTotal > 0 ? (sampleNetNew / sampleTotal) * 100 : 100;
        const sampleDensity = sampleBatch.length > 0 ? sampleNetNew / sampleBatch.length : 0;
        const wilson = calculateWilsonLowerBound(sampleNetNew, Math.max(1, sampleBatch.length));
        const estimatedFuel = Math.round(articleUrls.length * wilson * 0.70) + sampleNetNew;

        // Gate de Promoción Inmediata a la Harvest Queue
        if (sampleNovelty >= 75 && (sampleDensity >= 0.08 || directRefs.length > 0) && articleUrls.length >= 10) {
          console.log(`  🚀 [PROMOCIÓN] ${target.name.padEnd(28)} | Score: ${scoreInfo.compositeMineScore} | Sample: ${sampleBatch.length}p ➔ +${sampleNetNew} new (${sampleNovelty.toFixed(0)}% nov | ${sampleDensity.toFixed(2)} n/p) ➔ Encolada (+${estimatedFuel} fuel)`);
          this.harvestQueue.push({
            target,
            discoveredArticleUrls: articleUrls,
            bankedCandidatesCount: sampledCandidates.length,
            sampleDensity,
            sampleNovelty,
            estimatedConservativeFuel: estimatedFuel
          });
        } else {
          console.log(`  ⛔ [DESCARTADA] ${target.name.padEnd(26)} | URLs: ${articleUrls.length.toString().padStart(4)} | Sample: ${sampleBatch.length}p ➔ +${sampleNetNew} new (${sampleNovelty.toFixed(0)}% nov | ${sampleDensity.toFixed(2)} n/p)`);
        }
      } catch (err: any) {
        // Continuar con el siguiente objetivo
      }
    }
    console.log('📡 [DISCOVERY PRODUCER COMPLETADO — Todas las fuentes evaluadas]\n');
  }

  private async startHarvestWorkers() {
    const maxConcurrency = 3;

    while (!this.isDiscoveryComplete || this.harvestQueue.length > 0) {
      if (this.harvestQueue.length > 0 && this.activeWorkers < maxConcurrency) {
        const job = this.harvestQueue.shift();
        if (job) {
          this.activeWorkers++;
          this.harvestMineJob(job).finally(() => {
            this.activeWorkers--;
          });
        }
      }
      await new Promise(r => setTimeout(r, 200));
    }

    // Esperar a que terminen los workers activos
    while (this.activeWorkers > 0) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  private async harvestMineJob(job: QualifiedMineJob) {
    const tJob0 = Date.now();
    const urls = job.discoveredArticleUrls.slice(0, 1500);
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
          domain: job.target.domain,
          publisherId: job.target.id,
          publisherName: job.target.name,
          country: job.target.country,
          language: job.target.language,
          category: job.target.category,
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

      // Tranche Gate Check cada 300 páginas
      if (fetched >= 300) {
        const density = netNew / fetched;
        const totalRefs = netNew + known;
        const novelty = totalRefs > 0 ? (netNew / totalRefs) * 100 : 100;

        if (density < 0.05 || novelty < 70) {
          console.log(`    🛑 [WORKER] Tranche Gate en ${job.target.name} tras ${fetched}p (density: ${density.toFixed(3)}, nov: ${novelty.toFixed(0)}%) ➔ Detenido.`);
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

    console.log(`  ✅ [WORKER COMPLETO] ${job.target.name.padEnd(28)} | ${fetched}p ➔ +${netNew} net-new (${rate} new/p | ${vel}/s) en ${elapsed}s.`);
  }
}
