/**
 * scaleAwarePipeline.ts — Scale-Aware Continuous Mine Pipeline (Wave 7)
 *
 * Combina ProductionScore (eficiencia) y ScaleScore (volumen total), e implementa
 * Pre-Harvest Confirmation Sample para evitar falsos positivos antes de ocupar Harvest Workers.
 */

import { HarvestDedupeIndex } from './harvestDedupeIndex';
import { extractFromArticlePage } from './parallelExtractor';
import { parseFeedOrSitemapForYouTubeRefs } from './youtubeReferenceExtractor';
import { calculateWilsonLowerBound } from './newMineDiscoveryEngine';
import { globalCandidateManifest } from './mineCandidateManifest';
import type { YouTubeHarvestReference } from './types';

export interface ScaleTarget {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
  category: string;
  countryGroup: string;
  rootUrls: string[];
}

export const WAVE7_SCALE_POOL: ScaleTarget[] = [
  // 🇦🇷 1. ARGENTINA: Canales de Streaming, Portales y TV
  {
    id: 'pagina12_cultura_ar',
    name: 'Página/12 Cultura & Música',
    domain: 'pagina12.com.ar',
    country: 'AR',
    language: 'es',
    category: 'Cultura / Música / Entrevistas',
    countryGroup: 'argentina',
    rootUrls: ['https://www.pagina12.com.ar/robots.txt', 'https://www.pagina12.com.ar/sitemaps/sitemap-index.xml', 'https://www.pagina12.com.ar/sitemap.xml']
  },
  {
    id: 'ambito_financiero_ar',
    name: 'Ámbito Financiero / C5N Videos',
    domain: 'ambito.com',
    country: 'AR',
    language: 'es',
    category: 'Noticias / Debates / Entrevistas',
    countryGroup: 'argentina',
    rootUrls: ['https://www.ambito.com/robots.txt', 'https://www.ambito.com/sitemap.xml', 'https://www.ambito.com/sitemap_index.xml']
  },
  {
    id: 'perfil_portal_ar',
    name: 'Editorial Perfil / Net TV',
    domain: 'perfil.com',
    country: 'AR',
    language: 'es',
    category: 'Televisión / Reportajes / Radio',
    countryGroup: 'argentina',
    rootUrls: ['https://www.perfil.com/robots.txt', 'https://www.perfil.com/sitemap.xml', 'https://www.perfil.com/sitemap_index.xml']
  },
  {
    id: 'cronica_diario_ar',
    name: 'Diario Crónica Argentina',
    domain: 'cronica.com.ar',
    country: 'AR',
    language: 'es',
    category: 'Actualidad / Espectáculos / Videos',
    countryGroup: 'argentina',
    rootUrls: ['https://www.cronica.com.ar/robots.txt', 'https://www.cronica.com.ar/sitemap.xml']
  },
  {
    id: 'la_capital_rosario_ar',
    name: 'La Capital Rosario Videos',
    domain: 'lacapital.com.ar',
    country: 'AR',
    language: 'es',
    category: 'Noticias / Música / Entretenimiento',
    countryGroup: 'argentina',
    rootUrls: ['https://www.lacapital.com.ar/robots.txt', 'https://www.lacapital.com.ar/sitemap.xml']
  },

  // 🇲🇽 2. MÉXICO: Canales de Streaming, Música y Debates
  {
    id: 'sinembargo_al_aire_mx',
    name: 'SinEmbargo al Aire México',
    domain: 'sinembargo.mx',
    country: 'MX',
    language: 'es',
    category: 'Streaming Diario / Debates / Entrevistas',
    countryGroup: 'mexico',
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
    rootUrls: ['https://www.sopitas.com/robots.txt', 'https://www.sopitas.com/sitemap.xml', 'https://www.sopitas.com/sitemap_index.xml']
  },
  {
    id: 'proceso_video_mx',
    name: 'Revista Proceso Videos México',
    domain: 'proceso.com.mx',
    country: 'MX',
    language: 'es',
    category: 'Investigación / Entrevistas / Reportajes',
    countryGroup: 'mexico',
    rootUrls: ['https://www.proceso.com.mx/robots.txt', 'https://www.proceso.com.mx/sitemap.xml']
  },
  {
    id: 'el_economista_mx',
    name: 'El Economista México Videos',
    domain: 'eleconomista.com.mx',
    country: 'MX',
    language: 'es',
    category: 'Negocios / Entrevistas / Análisis',
    countryGroup: 'mexico',
    rootUrls: ['https://www.eleconomista.com.mx/robots.txt', 'https://www.eleconomista.com.mx/sitemap.xml']
  },
  {
    id: 'adn40_mx',
    name: 'ADN40 Televisión México',
    domain: 'adn40.mx',
    country: 'MX',
    language: 'es',
    category: 'Televisión / Reportajes / Actualidad',
    countryGroup: 'mexico',
    rootUrls: ['https://www.adn40.mx/robots.txt', 'https://www.adn40.mx/sitemap.xml']
  },

  // 🇧🇷 3. BRASIL: Portales de Música, Cultura y Entretenimiento
  {
    id: 'catraca_livre_br',
    name: 'Catraca Livre Brasil',
    domain: 'catracalivre.com.br',
    country: 'BR',
    language: 'pt',
    category: 'Cultura / Música / Shows / Festivais',
    countryGroup: 'brasil',
    rootUrls: ['https://catracalivre.com.br/robots.txt', 'https://catracalivre.com.br/sitemap.xml', 'https://catracalivre.com.br/sitemap_index.xml']
  },
  {
    id: 'rollingstone_brasil',
    name: 'Rolling Stone Brasil (MPB & Shows)',
    domain: 'rollingstone.uol.com.br',
    country: 'BR',
    language: 'pt',
    category: 'Música / Shows / Entrevistas / MPB',
    countryGroup: 'brasil',
    rootUrls: ['https://rollingstone.uol.com.br/robots.txt', 'https://rollingstone.uol.com.br/sitemap.xml']
  },
  {
    id: 'omelete_ccxp_br',
    name: 'Omelete / The Enemy Vídeos',
    domain: 'omelete.com.br',
    country: 'BR',
    language: 'pt',
    category: 'Shows / Cinema / Entrevistas / CCXP',
    countryGroup: 'brasil',
    rootUrls: ['https://www.omelete.com.br/robots.txt', 'https://www.omelete.com.br/sitemap.xml']
  },
  {
    id: 'tenhomaisdiscos_br',
    name: 'Tenho Mais Discos Que Amigos (TMDQA!)',
    domain: 'tenhomaisdiscosqueamigos.com',
    country: 'BR',
    language: 'pt',
    category: 'Música Alternativa / Lançamentos / Clipes',
    countryGroup: 'brasil',
    rootUrls: ['https://www.tenhomaisdiscosqueamigos.com/robots.txt', 'https://www.tenhomaisdiscosqueamigos.com/sitemap.xml']
  },
  {
    id: 'papelpop_musica_br',
    name: 'Papelpop Vídeos & Música BR',
    domain: 'papelpop.com',
    country: 'BR',
    language: 'pt',
    category: 'Música Pop / Clipes / Entrevistas',
    countryGroup: 'brasil',
    rootUrls: ['https://www.papelpop.com/robots.txt', 'https://www.papelpop.com/sitemap.xml']
  },

  // 🇨🇴 4. COLOMBIA: Shock, El Tiempo & El Espectador
  {
    id: 'shock_musica_colombia',
    name: 'Shock Colombia (Música & Sesiones)',
    domain: 'shock.co',
    country: 'CO',
    language: 'es',
    category: 'Música en Vivo / Acústicos / Festivales',
    countryGroup: 'colombia',
    rootUrls: ['https://www.shock.co/robots.txt', 'https://www.shock.co/sitemap.xml']
  },
  {
    id: 'eltiempo_videos_co',
    name: 'El Tiempo Videos Colombia',
    domain: 'eltiempo.com',
    country: 'CO',
    language: 'es',
    category: 'Noticias / Informes Especiales / TV',
    countryGroup: 'colombia',
    rootUrls: ['https://www.eltiempo.com/robots.txt', 'https://www.eltiempo.com/sitemap.xml']
  },
  {
    id: 'elespectador_videos_co',
    name: 'El Espectador Videos Colombia',
    domain: 'elespectador.com',
    country: 'CO',
    language: 'es',
    category: 'Investigación / Opinión / Reportajes',
    countryGroup: 'colombia',
    rootUrls: ['https://www.elespectador.com/robots.txt', 'https://www.elespectador.com/sitemap.xml']
  },

  // 🇨🇱 5. CHILE: La Tercera, Emol TV, The Clinic
  {
    id: 'latercera_culto_cl',
    name: 'La Tercera / Culto Música Chile',
    domain: 'latercera.com',
    country: 'CL',
    language: 'es',
    category: 'Cultura / Música / Entrevistas',
    countryGroup: 'chile',
    rootUrls: ['https://www.latercera.com/robots.txt', 'https://www.latercera.com/sitemap.xml']
  },
  {
    id: 'theclinic_video_cl',
    name: 'The Clinic Videos Chile',
    domain: 'theclinic.cl',
    country: 'CL',
    language: 'es',
    category: 'Opinión / Entrevistas / Humor',
    countryGroup: 'chile',
    rootUrls: ['https://www.theclinic.cl/robots.txt', 'https://www.theclinic.cl/sitemap.xml']
  },

  // 🇪🇸 6. ESPAÑA: Diario Público, MondoSonoro, Jenesaispop, El Confidencial
  {
    id: 'publico_la_base_es',
    name: 'Diario Público / La Base España',
    domain: 'publico.es',
    country: 'ES',
    language: 'es',
    category: 'Streaming Diario / Debates / Investigaciones',
    countryGroup: 'espana',
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
    rootUrls: ['https://www.mondosonoro.com/robots.txt', 'https://www.mondosonoro.com/sitemap.xml', 'https://www.mondosonoro.com/sitemap_index.xml']
  },
  {
    id: 'jenesaispop_musica_es',
    name: 'Jenesaispop Música & Festivales ES',
    domain: 'jenesaispop.com',
    country: 'ES',
    language: 'es',
    category: 'Música Pop / Reseñas / Videos',
    countryGroup: 'espana',
    rootUrls: ['https://jenesaispop.com/robots.txt', 'https://jenesaispop.com/sitemap.xml']
  },
  {
    id: 'elconfidencial_video_es',
    name: 'El Confidencial Videos España',
    domain: 'elconfidencial.com',
    country: 'ES',
    language: 'es',
    category: 'Reportajes / Análisis / Entrevistas',
    countryGroup: 'espana',
    rootUrls: ['https://www.elconfidencial.com/robots.txt', 'https://www.elconfidencial.com/sitemap.xml']
  }
];

export interface QualifiedScaleJob {
  target: ScaleTarget;
  articleUrls: string[];
  productionScore: number;
  scaleScore: number;
  sampleDensity: number;
  sampleNovelty: number;
  conservativeRemainingFuel: number;
  archiveDepth: string;
}

export class ScaleAwarePipeline {
  private dedupeIndex: HarvestDedupeIndex;
  private harvestQueue: QualifiedScaleJob[] = [];
  private activeWorkers = 0;
  private totalHarvested = 0;
  private isDiscoveryComplete = false;

  private totalProbed = 0;
  private totalPromoted = 0;
  private totalRejected = 0;
  private bankedCandidateCount = 0;
  private totalConservativeFuelDiscovered = 0;
  private scaleMinesCount = 0; // Minas con potencial >= 2.000

  private workerEfficiencies: { name: string; pages: number; netNew: number; rate: number }[] = [];

  constructor(dedupeIndex: HarvestDedupeIndex) {
    this.dedupeIndex = dedupeIndex;
  }

  async runPipeline(): Promise<{
    startAtlas: number;
    finalAtlas: number;
    totalNetNewHarvested: number;
    elapsedSeconds: number;
    globalWallClockVelocity: number;
    totalProbed: number;
    totalPromoted: number;
    totalRejected: number;
    bankedCandidateCount: number;
    totalConservativeFuelDiscovered: number;
    scaleMinesCount: number;
    workerEfficiencies: { name: string; pages: number; netNew: number; rate: number }[];
  }> {
    const t0 = Date.now();
    const startAtlas = this.dedupeIndex.getTotalAtlasSize();

    console.log('⚡ [SCALE-AWARE CONTINUOUS MINE PIPELINE V3 ACTIVADO]');
    console.log(`  Atlas Inicial: ${startAtlas.toLocaleString()} contenidos`);
    console.log(`  Pool Scale Wave 7: ${WAVE7_SCALE_POOL.length} candidatos\n`);

    const harvestPromise = this.startHarvestWorkers();
    await this.runScaleDiscoveryProducer();
    this.isDiscoveryComplete = true;
    await harvestPromise;

    const elapsedSeconds = Math.max(1, Math.round((Date.now() - t0) / 1000));
    const finalAtlas = this.dedupeIndex.getTotalAtlasSize();
    const globalWallClockVelocity = +(this.totalHarvested / elapsedSeconds).toFixed(2);

    return {
      startAtlas,
      finalAtlas,
      totalNetNewHarvested: this.totalHarvested,
      elapsedSeconds,
      globalWallClockVelocity,
      totalProbed: this.totalProbed,
      totalPromoted: this.totalPromoted,
      totalRejected: this.totalRejected,
      bankedCandidateCount: this.bankedCandidateCount,
      totalConservativeFuelDiscovered: this.totalConservativeFuelDiscovered,
      scaleMinesCount: this.scaleMinesCount,
      workerEfficiencies: this.workerEfficiencies
    };
  }

  private async runScaleDiscoveryProducer() {
    console.log('📡 [DISCOVERY PRODUCER V3 — Dual Scoring & Pre-Harvest Confirmation]');

    for (const target of WAVE7_SCALE_POOL) {
      this.totalProbed++;

      try {
        const discoveredXmls: string[] = [];
        const candidateArticleUrls: string[] = [];
        const directRefs: YouTubeHarvestReference[] = [];
        let archiveDepth = '1-5 years';

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

        // Parsear child XMLs
        for (const xml of discoveredXmls.slice(0, 10)) {
          try {
            const res = await fetch(xml, {
              signal: AbortSignal.timeout(5000),
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0.0.0 Safari/537.36' }
            });
            if (!res.ok) continue;
            const xmlText = await res.text();

            if (xmlText.includes('2015') || xmlText.includes('2016') || xmlText.includes('2014')) {
              archiveDepth = '10+ years';
            } else if (xmlText.includes('2020') || xmlText.includes('2019')) {
              archiveDepth = '5-10 years';
            }

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
              } else if (!candidateArticleUrls.includes(loc)) {
                candidateArticleUrls.push(loc);
              }
            }
          } catch {
            // Ignorar
          }
        }

        // Stage 1: Sample 25 inicial
        const sample1 = candidateArticleUrls.slice(0, 25);
        let sample1NetNew = 0;
        let sample1Known = 0;

        for (const d of directRefs) {
          if (!this.dedupeIndex.isDuplicate(d.videoId)) {
            sample1NetNew++;
            this.bankedCandidateCount++;
            globalCandidateManifest.addCandidate(d, target.id, this.dedupeIndex.getTotalAtlasSize());
          }
        }

        const runExtract = async (urls: string[]) => {
          let net = 0;
          let kn = 0;
          const promises = urls.map(async url => {
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
                kn++;
              } else {
                net++;
                this.bankedCandidateCount++;
                globalCandidateManifest.addCandidate(ref, target.id, this.dedupeIndex.getTotalAtlasSize());
              }
            }
          });
          await Promise.all(promises);
          return { net, kn };
        };

        const r1 = await runExtract(sample1);
        sample1NetNew += r1.net;
        sample1Known += r1.kn;

        const density1 = sample1.length > 0 ? sample1NetNew / sample1.length : 0;
        const totalSampled1 = sample1NetNew + sample1Known;
        const novelty1 = totalSampled1 > 0 ? (sample1NetNew / totalSampled1) * 100 : 100;

        // Si el Sample 1 promete (density >= 0.20 y novelty >= 80%), ejecutar PRE-HARVEST CONFIRMATION SAMPLE
        if (novelty1 >= 80 && (density1 >= 0.20 || directRefs.length >= 5) && candidateArticleUrls.length >= 25) {
          // Pre-Harvest Confirmation Sample: 25 URLs independientes de otra parte de la partición (offset 50%)
          const offset = Math.floor(candidateArticleUrls.length / 2);
          const confirmSample = candidateArticleUrls.slice(offset, offset + 25);

          const rConfirm = await runExtract(confirmSample);
          const confirmDensity = confirmSample.length > 0 ? rConfirm.net / confirmSample.length : 0;
          const confirmTotal = rConfirm.net + rConfirm.kn;
          const confirmNovelty = confirmTotal > 0 ? (rConfirm.net / confirmTotal) * 100 : 100;

          const combinedNet = sample1NetNew + rConfirm.net;
          const combinedPages = sample1.length + confirmSample.length;
          const finalDensity = combinedPages > 0 ? combinedNet / combinedPages : 0;
          const finalNovelty = (sample1Known + rConfirm.kn + combinedNet) > 0
            ? (combinedNet / (sample1Known + rConfirm.kn + combinedNet)) * 100
            : 100;

          if (confirmNovelty >= 80 && confirmDensity >= 0.18) {
            // CONFIRMADA: Calcular ProductionScore & ScaleScore
            const wilson = calculateWilsonLowerBound(combinedNet, combinedPages);
            const decay = archiveDepth === '10+ years' ? 0.60 : 0.85;
            const conservativeRemaining = Math.round(candidateArticleUrls.length * wilson * decay);

            const productionScore = +(finalDensity * (finalNovelty / 100) * 100).toFixed(1);
            const scaleScore = +(finalDensity * Math.min(15000, candidateArticleUrls.length) * (finalNovelty / 100) * decay).toFixed(0);

            this.totalConservativeFuelDiscovered += conservativeRemaining + combinedNet;
            if (conservativeRemaining + combinedNet >= 2000) {
              this.scaleMinesCount++;
            }

            this.totalPromoted++;
            console.log(`  🚀 [SCALE PROMOTED] ${target.name.padEnd(28)} | Production: ${productionScore.toString().padStart(4)} | Scale: ${scaleScore.toString().padStart(5)} | URLs: ${candidateArticleUrls.length.toLocaleString().padStart(6)} | Density: ${finalDensity.toFixed(2)} n/p ➔ +${(conservativeRemaining + combinedNet).toLocaleString()} fuel`);

            this.harvestQueue.push({
              target,
              articleUrls: candidateArticleUrls,
              productionScore,
              scaleScore: Number(scaleScore),
              sampleDensity: finalDensity,
              sampleNovelty: finalNovelty,
              conservativeRemainingFuel: conservativeRemaining,
              archiveDepth
            });
          } else {
            this.totalRejected++;
            console.log(`  🛑 [CONFIRMATION FAIL] ${target.name.padEnd(26)} | Sample 1: ${density1.toFixed(2)} n/p ➔ Confirmation Sample: ${confirmDensity.toFixed(2)} n/p (${confirmNovelty.toFixed(0)}% nov) ➔ Descartada.`);
          }
        } else {
          this.totalRejected++;
          console.log(`  ⛔ [RECHAZADA STAGE 1] ${target.name.padEnd(26)} | URLs: ${candidateArticleUrls.length.toString().padStart(4)} | Sample: ${sample1.length}p ➔ +${sample1NetNew} new (${novelty1.toFixed(0)}% nov | ${density1.toFixed(2)} n/p)`);
        }
      } catch {
        // Continuar
      }
    }

    console.log('📡 [DISCOVERY PRODUCER V3 COMPLETADO]\n');
  }

  private async startHarvestWorkers() {
    const maxConcurrency = 3;

    while (!this.isDiscoveryComplete || this.harvestQueue.length > 0) {
      if (this.harvestQueue.length > 0 && this.activeWorkers < maxConcurrency) {
        // Ordenar cola por ScaleScore descendente
        this.harvestQueue.sort((a, b) => b.scaleScore - a.scaleScore);
        const job = this.harvestQueue.shift();

        if (job) {
          this.activeWorkers++;
          this.harvestScaleJob(job).finally(() => {
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

  private async harvestScaleJob(job: QualifiedScaleJob) {
    const tJob0 = Date.now();
    const urls = job.articleUrls.slice(0, 2000);
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

      // Dynamic Worker Bailout a las 150 páginas si la densidad decae
      if (fetched >= 150) {
        const density = netNew / fetched;
        const totalRefs = netNew + known;
        const novelty = totalRefs > 0 ? (netNew / totalRefs) * 100 : 100;

        if (density < 0.10 || novelty < 75) {
          console.log(`    🛑 [WORKER BAILOUT] ${job.target.name} tras ${fetched}p (density: ${density.toFixed(3)}, nov: ${novelty.toFixed(0)}%) ➔ Mina abandonada.`);
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
      name: job.target.name,
      pages: fetched,
      netNew,
      rate
    });

    console.log(`  ✅ [WORKER SCALE COMPLETO] ${job.target.name.padEnd(28)} | ${fetched}p ➔ +${netNew} net-new (${rate} new/p | ${vel}/s) en ${elapsed}s.`);
  }
}
